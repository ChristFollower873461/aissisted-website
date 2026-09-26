import { createBookingPaymentStore } from './booking-payment-store.js';
import { bookingPaymentEnabled, buildBookingStartEvent, verifyCheckoutPaymentScope } from './booking-payment-reconciliation.js';
import { sendCheckoutSessionCommand } from './stripe.js';
import { json } from './http.js';

const clock = () => new Date().toISOString();
const changed = (result) => Number(result?.meta?.changes || 0) > 0;
const pending = () => json({ ok: false, code: 'checkout_recovery_pending', error: 'Checkout reconciliation is pending. Retry the original request with its original idempotency key.' }, 503, { 'retry-after': '3' });
const attention = (code) => json({ ok: false, code, error: 'This original checkout needs review before it can continue. Do not start another checkout or use a new idempotency key.' }, 409);

export function createCheckoutRecoveryStore(db) {
  const query = (sql, ...args) => db.prepare(sql).bind(...args);
  const get = (id) => query('SELECT * FROM booking_checkout_commands WHERE idempotency_record_id=?', id).first();
  const originalHold = `EXISTS(SELECT 1 FROM bookings b JOIN agent_idempotency_records a ON a.id=b.checkout_idempotency_record_id
    JOIN booking_contracts k ON k.booking_id=b.id JOIN checkout_intents i ON i.booking_id=b.id
    WHERE b.id=booking_checkout_commands.booking_id AND a.id=booking_checkout_commands.idempotency_record_id
    AND a.status='started' AND a.request_fingerprint=booking_checkout_commands.request_fingerprint
    AND b.booking_status='hold' AND b.stripe_checkout_session_id IS NULL AND b.temporary_hold_expires_at>?
    AND b.slot_id=json_extract(context_json,'$.booking.slotId') AND b.prospect_id=json_extract(context_json,'$.booking.prospectId')
    AND b.temporary_hold_expires_at=json_extract(context_json,'$.booking.temporaryHoldExpiresAt')
    AND k.terms_sha256=json_extract(context_json,'$.contract.termsSha256') AND k.amount_cents=json_extract(context_json,'$.contract.amountCents')
    AND i.stripe_idempotency_key=booking_checkout_commands.stripe_idempotency_key AND i.state IN ('prepared','session_created'))`;
  return {
    get,
    async due(limit = 2, at = clock()) {
      return (await query(`SELECT idempotency_record_id FROM booking_checkout_commands
        WHERE state='prepared' OR (state='processing' AND lease_expires_at<=?) ORDER BY created_at LIMIT ?`,
        at, Math.max(1, Math.min(2, Number(limit) || 2))).all()).results;
    },
    async health() {
      return (await query('SELECT state,COUNT(*) AS count,MIN(created_at) AS oldest_created_at FROM booking_checkout_commands GROUP BY state').all()).results;
    },
    async flagUnclaimed(id, reason, at = clock()) {
      return changed(await query(`UPDATE booking_checkout_commands SET state='needs_attention',lease_token=NULL,
        lease_expires_at=NULL,last_safe_error_code=?,updated_at=? WHERE idempotency_record_id=?
        AND (state='prepared' OR (state='processing' AND lease_expires_at<=?))`, reason, at, id, at).run());
    },
    async prepare({ record, booking, command, scope, context, at = clock() }) {
      // Never replay a potentially pruned key; the original hold expiry is earlier
      // in normal operation. Stripe documents retention of at least24 hours.
      const cutoff = new Date(Math.min(Date.parse(booking.temporaryHoldExpiresAt), Date.parse(at) + 23 * 3600_000)).toISOString();
      await query(`INSERT INTO booking_checkout_commands(idempotency_record_id,booking_id,request_fingerprint,
        stripe_idempotency_key,stripe_request_body,stripe_api_version,scope_json,context_json,retry_before,created_at,updated_at)
        SELECT a.id,b.id,a.request_fingerprint,?,?,?,?,?,?,?,? FROM agent_idempotency_records a JOIN bookings b ON b.checkout_idempotency_record_id=a.id
        JOIN checkout_intents i ON i.booking_id=b.id WHERE a.id=? AND b.id=? AND a.status='started'
        AND a.request_fingerprint=? AND i.stripe_idempotency_key=? AND b.stripe_checkout_session_id IS NULL
        ON CONFLICT(idempotency_record_id) DO NOTHING`, command.idempotencyKey, command.body, command.apiVersion,
        JSON.stringify(scope), JSON.stringify(context), cutoff, at, at, record.id, booking.id, record.requestFingerprint, command.idempotencyKey).run();
      const stored = await get(record.id);
      if (!stored || stored.request_fingerprint !== record.requestFingerprint || stored.stripe_request_body !== command.body || stored.context_json !== JSON.stringify(context)) throw new Error('checkout_prepare_conflict');
      return stored;
    },
    async claim(id, at = clock()) {
      await query(`UPDATE booking_checkout_commands SET state='needs_attention',lease_token=NULL,lease_expires_at=NULL,
        last_safe_error_code=CASE WHEN retry_before<=? THEN 'checkout_recovery_expired' ELSE 'checkout_recovery_exhausted' END,updated_at=?
        WHERE idempotency_record_id=? AND (retry_before<=? OR attempts>=8)
        AND (state='prepared' OR (state='processing' AND lease_expires_at<=?))`, at, at, id, at, at).run();
      await query(`UPDATE booking_checkout_commands SET state='needs_attention',lease_token=NULL,lease_expires_at=NULL,
        last_safe_error_code='checkout_recovery_booking_changed',updated_at=? WHERE idempotency_record_id=?
        AND (state='prepared' OR (state='processing' AND lease_expires_at<=?)) AND NOT ${originalHold}`, at, id, at, at).run();
      return query(`UPDATE booking_checkout_commands SET state='processing',attempts=attempts+1,lease_token=?,lease_expires_at=?,updated_at=?
        WHERE idempotency_record_id=? AND retry_before>? AND attempts<8
        AND (state='prepared' OR (state='processing' AND lease_expires_at<=?)) AND ${originalHold} RETURNING *`, crypto.randomUUID(),
        new Date(Date.parse(at)+120_000).toISOString(), at, id, at, at, at).first();
    },
    async checkpoint(item, session, at = clock()) {
      return changed(await query(`UPDATE booking_checkout_commands SET session_json=?,updated_at=? WHERE idempotency_record_id=?
        AND state='processing' AND lease_token=? AND lease_expires_at>? AND (session_json IS NULL OR session_json=?)`,
        JSON.stringify(session), at, item.idempotency_record_id, item.lease_token, at, JSON.stringify(session)).run());
    },
    async release(item, reason, terminal = false, at = clock()) {
      return changed(await query(`UPDATE booking_checkout_commands SET state=?,last_safe_error_code=?,lease_token=NULL,lease_expires_at=NULL,updated_at=?
        WHERE idempotency_record_id=? AND state='processing' AND lease_token=? AND lease_expires_at>?`,
        terminal || item.attempts>=8 || item.retry_before<=at ? 'needs_attention' : 'prepared', reason, at,
        item.idempotency_record_id, item.lease_token, at).run());
    }
  };
}

function minimumSession(session, scope, context) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(session?.id || '') || session.livemode !== scope.livemode || !['open','complete'].includes(session.status)
      || typeof session.url !== 'string' || !session.url.startsWith('https://')) throw new Error('checkout_session_requires_review');
  const url = new URL(session.url);
  if (url.hostname !== 'checkout.stripe.com' || url.username || url.password || url.port) throw new Error('checkout_session_requires_review');
  if (context.stripeCustomerId && session.customer !== context.stripeCustomerId) throw new Error('checkout_session_requires_review');
  const types = Array.isArray(session.payment_method_types) ? session.payment_method_types : [];
  if (context.contract.paymentMethodPolicy === 'synchronous_card_only' && (types.length !== 1 || types[0] !== 'card')) throw new Error('checkout_session_requires_review');
  return { id: session.id, url: session.url, livemode: session.livemode, status: session.status,
    created: Number.isSafeInteger(session.created) ? session.created : 0,
    expires_at: Number.isSafeInteger(session.expires_at) ? session.expires_at : 0,
    customer: typeof session.customer === 'string' ? session.customer : '',
    payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
    payment_method_types: types };
}

export async function resumePreparedCheckout({ env, config, store, record }) {
  const recovery = createCheckoutRecoveryStore(env.BOOKING_DB);
  let lease, original, session;
  try {
    original = await recovery.get(record.id);
    if (!original) return attention('checkout_recovery_unprepared');
    if (original.request_fingerprint !== record.requestFingerprint) return attention('idempotency_conflict');
    if (original.state === 'needs_attention') return attention(original.last_safe_error_code || 'checkout_recovery_needs_attention');
    if (original.retry_before <= clock() || original.attempts >= 8) {
      await recovery.claim(record.id);
      const state = await recovery.get(record.id);
      return state?.state === 'needs_attention' ? attention(state.last_safe_error_code) : pending();
    }
    if (!original.session_json && !config.checkoutEnabled) return json({ ok: false, code: 'checkout_recovery_paused',
      error: 'Checkout is paused. Keep the original request for recovery when checkout resumes.' }, 503);
    const scope = await verifyCheckoutPaymentScope({ env, config });
    const expectedScope = JSON.parse(original.scope_json);
    if (Object.keys(expectedScope).some((key) => expectedScope[key] !== scope[key])) return attention('checkout_recovery_scope_changed');
    lease = await recovery.claim(record.id);
    if (!lease) {
      const state = await recovery.get(record.id);
      return state?.state === 'needs_attention' ? attention(state.last_safe_error_code) : pending();
    }
    const context = JSON.parse(lease.context_json);
    session = lease.session_json && JSON.parse(lease.session_json);
    if (!session) {
      session = minimumSession(await sendCheckoutSessionCommand(config, { body: lease.stripe_request_body,
        idempotencyKey: lease.stripe_idempotency_key, apiVersion: lease.stripe_api_version }), scope, context);
      if (!await recovery.checkpoint(lease, session)) return pending();
    }
    const intake = { ...context.intake, message: `${context.intake.message}\nStripe checkout session: ${session.id}` };
    const event = await buildBookingStartEvent({ scope, booking: context.booking, contract: context.contract, session, intake, at: lease.created_at });
    const body = { ...context.response, checkoutUrl: session.url, sessionId: session.id };
    await createBookingPaymentStore(env.BOOKING_DB).attachStart({ event, responseBody: body, idempotencyRecordId: record.id,
      stripeCustomerId: session.customer || context.stripeCustomerId, recoveryLease: lease });
    return json(body);
  } catch (error) {
    // A reply can fail after any successful transaction. Recover only the exact
    // committed original response; otherwise retain the command for a fenced retry.
    try {
      const saved = await store.getIdempotencyRecordById(record.id);
      if (saved?.status === 'succeeded' && saved.targetId === original?.booking_id) {
        const response = JSON.parse(saved.responseBodyJson || '{}');
        if (response.bookingId === original.booking_id && response.sessionId === session?.id) return json(response);
      }
    } catch { /* Outcome remains unknown; do not compensate or replace it. */ }
    if (lease) {
      try { await recovery.release(lease, error?.message === 'checkout_session_requires_review' ? error.message : 'checkout_recovery_retry', error?.message === 'checkout_session_requires_review'); } catch { /* Expired lease can be reclaimed. */ }
    }
    return pending();
  }
}

// Authenticated monitor callers resume only already prepared original commands.
// At most2 items; reserve13 seconds (3s account read +10s Session deadline) per item.
export async function drainCheckoutRecovery({ env, config, store, limit = 2 }) {
  if (!bookingPaymentEnabled(env)) return { skipped: true };
  const recovery = createCheckoutRecoveryStore(env.BOOKING_DB);
  const deadline = Date.now() + 25_000;
  const summary = { processed: 0, recovered: 0, pending: 0, needsAttention: 0 };
  for (const item of await recovery.due(limit)) {
    if (Date.now() + 13_000 > deadline) break;
    const record = await store.getIdempotencyRecordById(item.idempotency_record_id);
    if (!record || record.status !== 'started') {
      await recovery.flagUnclaimed(item.idempotency_record_id, 'checkout_recovery_record_requires_review');
      summary.needsAttention++;
      continue;
    }
    const response = await resumePreparedCheckout({ env, config, store, record });
    summary.processed++;
    if (response.status === 200) summary.recovered++;
    else if (response.status === 503) summary.pending++;
    else summary.needsAttention++;
  }
  return { ...summary, health: await recovery.health() };
}
