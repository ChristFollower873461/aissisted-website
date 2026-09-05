import { canonicalBookingJson, sealBookingEvent, verifyBookingEvent } from './booking-events.js';

export const PAYMENT_MAX_ATTEMPTS = 8;
const leaseUntil = (at) => new Date(Date.parse(at) + 120_000).toISOString();
const later = (at, ms) => new Date(Date.parse(at) + ms).toISOString();
const now = () => new Date().toISOString();
const changed = (result) => Number(result?.meta?.changes || 0) > 0;
const rows = (result) => result.results || [];
const QUEUES = { receipt: ['booking_provider_receipts', 'id'], delivery: ['booking_crm_delivery', 'event_id'] };
export const paymentFactsJson = (event) => canonicalBookingJson({
  checkoutSessionId: event.checkoutSessionId, paymentIntentId: event.paymentIntentId,
  chargeId: event.chargeId, contract: event.contract, snapshot: event.snapshot
});

// All durable operations require D1. There is intentionally no transient fallback.
export function createBookingPaymentStore(db) {
  if (!db?.batch || !db?.prepare) throw new Error('booking_payment_database_required');
  const query = (sql, ...args) => db.prepare(sql).bind(...args);
  const getState = (id) => query('SELECT * FROM booking_payment_state WHERE booking_id=?', id).first();
  const insertDelivery = (event, at, guard = '', args = []) => query(
    `INSERT INTO booking_crm_delivery(event_id,booking_id,revision,payload_hash,payload_json,next_attempt_at,created_at,updated_at)
     SELECT ?,?,?,?,?,?,?,? ${guard}`, event.eventId, event.bookingId, event.bookingRevision,
    event.payloadHash, JSON.stringify(event), at, at, at, ...args);

  return {
    getState,
    async attachStart({ event, responseBody, idempotencyRecordId, stripeCustomerId = '', recoveryLease = null, at = now() }) {
      await verifyBookingEvent(event);
      if (event.eventType !== 'booking.checkout_started' || event.bookingRevision !== 1) throw new Error('start_event_required');
      // The first INSERT is conditional. Every following write joins the newly inserted
      // exact event. A failed queue/idempotency write rolls the entire D1 batch back.
      const guard = `EXISTS(SELECT 1 FROM booking_payment_state WHERE booking_id=? AND envelope_json=?)`;
      const guardArgs = [event.bookingId, JSON.stringify(event)];
      const statements = [
        query(`INSERT INTO booking_payment_state(booking_id,source_environment,provider_account_id,livemode,
          checkout_session_id,revision,envelope_json,facts_json,next_attempt_at,created_at,updated_at)
          SELECT b.id,?,?,?,?,1,?,?,?,?,? FROM bookings b
          JOIN checkout_intents i ON i.booking_id=b.id JOIN agent_idempotency_records a ON a.id=?
          WHERE b.id=? AND b.booking_status='hold' AND b.temporary_hold_expires_at>?
          AND b.stripe_checkout_session_id IS NULL AND i.state IN ('prepared','session_created') AND a.status='started'
          ${recoveryLease ? `AND EXISTS(SELECT 1 FROM booking_checkout_commands c WHERE c.idempotency_record_id=a.id
            AND c.booking_id=b.id AND c.state='processing' AND c.lease_token=? AND c.lease_expires_at>?
            AND c.retry_before>? AND json_extract(c.session_json,'$.id')=?)` : ''}`,
          event.sourceEnvironment, event.providerAccountId, Number(event.livemode), event.checkoutSessionId,
          JSON.stringify(event), paymentFactsJson(event), at, at, at, idempotencyRecordId, event.bookingId, at,
          ...(recoveryLease ? [recoveryLease.lease_token, at, at, event.checkoutSessionId] : [])),
        insertDelivery(event, at, `WHERE ${guard}`, guardArgs),
        query(`UPDATE bookings SET stripe_checkout_session_id=?,payment_status='checkout_created',updated_at=?
          WHERE id=? AND ${guard}`, event.checkoutSessionId, at, event.bookingId, ...guardArgs),
        query(`UPDATE checkout_intents SET state='attached',stripe_session_ref=?,updated_at=?
          WHERE booking_id=? AND ${guard}`, event.checkoutSessionId, at, event.bookingId, ...guardArgs),
        query(`UPDATE prospects SET stripe_customer_id=CASE WHEN ?='' THEN stripe_customer_id ELSE ? END,updated_at=?
          WHERE id=(SELECT prospect_id FROM bookings WHERE id=?) AND ${guard}`,
          stripeCustomerId, stripeCustomerId, at, event.bookingId, ...guardArgs),
        query(`UPDATE agent_idempotency_records SET status='succeeded',target_type='booking',target_id=?,
          response_status=200,response_body_json=?,error_code=NULL,completed_at=?,updated_at=?
          WHERE id=? AND status='started' AND ${guard}`,
          event.bookingId, JSON.stringify(responseBody), at, at, idempotencyRecordId, ...guardArgs)
      ];
      if (recoveryLease) statements.push(query(`UPDATE booking_checkout_commands SET state='attached',lease_token=NULL,
        lease_expires_at=NULL,last_safe_error_code=NULL,updated_at=? WHERE idempotency_record_id=? AND state='processing'
        AND lease_token=? AND ${guard}`, at, idempotencyRecordId, recoveryLease.lease_token, ...guardArgs));
      const result = await db.batch(statements);
      if (!changed(result[0]) || !changed(result[5]) || (recoveryLease && !changed(result[6]))) throw new Error('checkout_attach_conflict');
      return { committed: true };
    },
    async recordReceipt({ event, payloadHash, scope, at = now() }) {
      const id = `${scope.providerAccountId}:${Number(scope.livemode)}:${event.id}`;
      await query(`INSERT INTO booking_provider_receipts(id,provider_account_id,livemode,provider_event_id,
        payload_hash,event_json,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(provider_account_id,livemode,provider_event_id) DO NOTHING`,
        id, scope.providerAccountId, Number(scope.livemode), event.id, payloadHash, JSON.stringify(event), at, at, at).run();
      const receipt = await query('SELECT * FROM booking_provider_receipts WHERE id=?', id).first();
      if (receipt.payload_hash !== payloadHash) throw new Error('provider_event_content_conflict');
      return receipt;
    },
    async claimQueue(kind, { id = '', at = now() } = {}) {
      const [table, key] = QUEUES[kind] || [];
      if (!table) throw new Error('queue_kind_invalid');
      // A crash on the final attempt is terminal, including an expired processing lease.
      await query(`UPDATE ${table} SET state='needs_attention',lease_token=NULL,lease_expires_at=NULL,
        last_safe_error_code='attempts_exhausted',updated_at=? WHERE attempts>=?
        AND ((state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_expires_at<=?))`,
        at, PAYMENT_MAX_ATTEMPTS, at, at).run();
      const token = crypto.randomUUID();
      return query(`UPDATE ${table} SET state='processing',attempts=attempts+1,lease_token=?,lease_expires_at=?,updated_at=?
        WHERE ${key}=(SELECT ${key} FROM ${table} WHERE (?='' OR ${key}=?) AND attempts<?
        AND ((state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_expires_at<=?))
        ORDER BY next_attempt_at,created_at LIMIT 1) RETURNING *`,
        token, leaseUntil(at), at, id, id, PAYMENT_MAX_ATTEMPTS, at, at).first();
    },
    async finishQueue(kind, item, { ok = false, retryable = true, reason = '', at = now() } = {}) {
      const [table, key] = QUEUES[kind] || [];
      if (!table) throw new Error('queue_kind_invalid');
      const state = ok ? 'delivered' : retryable && item.attempts < PAYMENT_MAX_ATTEMPTS ? 'pending' : 'needs_attention';
      return changed(await query(`UPDATE ${table} SET state=?,next_attempt_at=?,lease_token=NULL,lease_expires_at=NULL,
        last_safe_error_code=?,updated_at=? WHERE ${key}=? AND state='processing' AND lease_token=? AND lease_expires_at>?`,
        state, later(at, Math.min(86400, 60 * 2 ** item.attempts) * 1000), reason || null, at,
        item[key], item.lease_token, at).run());
    },
    async claimBooking({ bookingId, scope, at = now() }) {
      await query(`UPDATE booking_payment_state SET state='needs_attention',lease_token=NULL,lease_expires_at=NULL,
        last_safe_error_code='attempts_exhausted',updated_at=? WHERE booking_id=? AND failures>=?
        AND ((state='pending') OR (state='processing' AND lease_expires_at<=?))`, at, bookingId, PAYMENT_MAX_ATTEMPTS, at).run();
      return query(`UPDATE booking_payment_state SET state='processing',failures=failures+1,lease_token=?,lease_expires_at=?,updated_at=?
        WHERE booking_id=? AND source_environment=? AND provider_account_id=? AND livemode=? AND failures<?
        AND (state='pending' OR (state='processing' AND lease_expires_at<=?)) RETURNING *`,
        crypto.randomUUID(), leaseUntil(at), at, bookingId, scope.sourceEnvironment, scope.providerAccountId,
        Number(scope.livemode), PAYMENT_MAX_ATTEMPTS, at).first();
    },
    async releaseBooking(item, { retryable = true, reason, at = now() }) {
      return changed(await query(`UPDATE booking_payment_state SET state=?,lease_token=NULL,lease_expires_at=NULL,
        next_attempt_at=?,last_safe_error_code=?,updated_at=? WHERE booking_id=? AND state='processing'
        AND lease_token=? AND lease_expires_at>?`,
        retryable && item.failures < PAYMENT_MAX_ATTEMPTS ? 'pending' : 'needs_attention',
        later(at, 600_000), reason, at, item.booking_id, item.lease_token, at).run());
    },
    async listDueBookings({ at = now(), limit = 10 } = {}) {
      return rows(await query(`SELECT booking_id FROM booking_payment_state WHERE
        (state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_expires_at<=?)
        ORDER BY next_attempt_at LIMIT ?`, at, at, Math.max(1, Math.min(10, limit))).all());
    },
    async findBookingIdByPaymentIntent(id) {
      return (await query(`SELECT booking_id FROM booking_payment_state
        WHERE json_extract(envelope_json,'$.paymentIntentId')=? LIMIT 1`, id).first())?.booking_id || '';
    },
    async reconcileVerifiedRefund({ bookingId, refundReference, actorRef, idempotencyKey, at = now() }) {
      const state = await getState(bookingId);
      const event = state && JSON.parse(state.envelope_json);
      const refundIds = state ? JSON.parse(state.succeeded_refund_ids_json) : [];
      const verifiedAge = event ? Date.parse(at) - Date.parse(state.verified_at || "") : Infinity;
      if (!state || state.state !== 'pending' || state.lease_token || event.snapshot.paymentStatus !== 'paid'
          || event.snapshot.refundStatus !== 'full' || event.snapshot.succeededRefundAmountCents !== event.contract.amountCents
          || !refundIds.includes(refundReference) || !Number.isFinite(verifiedAge) || verifiedAge < 0 || verifiedAge > 15 * 60_000) {
        throw new Error('refund_requires_current_verified_full_refund');
      }
      const marker = crypto.randomUUID();
      const safe = JSON.stringify({ refundReference, paymentRevision: state.revision, payloadHash: event.payloadHash,
        verifiedAt: state.verified_at, succeededRefundIds: refundIds });
      const results = await db.batch([
        query(`UPDATE booking_payment_state SET lease_token=?,lease_expires_at=?,state='processing'
          WHERE booking_id=? AND revision=? AND envelope_json=? AND succeeded_refund_ids_json=? AND verified_at=? AND state='pending'
          AND EXISTS(SELECT 1 FROM booking_deliverables WHERE booking_id=? AND status='refund_requested')
          AND NOT EXISTS(SELECT 1 FROM booking_contract_events WHERE idempotency_key=?)`,
          marker, leaseUntil(at), bookingId, state.revision, state.envelope_json, state.succeeded_refund_ids_json, state.verified_at, bookingId, idempotencyKey),
        query(`UPDATE booking_deliverables SET status='refunded',remedy_status='refunded',refund_reference=?,updated_at=?
          WHERE booking_id=? AND status='refund_requested'
          AND EXISTS(SELECT 1 FROM booking_payment_state WHERE booking_id=? AND lease_token=?)`,
          refundReference, at, bookingId, bookingId, marker),
        query(`INSERT INTO booking_contract_events(id,booking_id,event_type,prior_state,new_state,actor_ref,event_at,idempotency_key,safe_metadata_json,created_at)
          SELECT ?,?,'refund_reconciled','refund_requested','refunded',?,?,?,?,?
          WHERE EXISTS(SELECT 1 FROM booking_payment_state WHERE booking_id=? AND lease_token=?)`,
          crypto.randomUUID(), bookingId, actorRef, at, idempotencyKey, safe, at, bookingId, marker),
        query(`UPDATE booking_payment_state SET state='pending',lease_token=NULL,lease_expires_at=NULL
          WHERE booking_id=? AND lease_token=?`, bookingId, marker)
      ]);
      if (!changed(results[0])) throw new Error('refund_reconciliation_conflict');
      return { committed: true };
    },
    async health() {
      const summaries = {};
      for (const table of ['booking_payment_state', 'booking_provider_receipts', 'booking_crm_delivery', 'booking_checkout_commands']) {
        summaries[table] = rows(await query(`SELECT state,COUNT(*) AS count,MIN(created_at) AS oldest_created_at FROM ${table} GROUP BY state`).all());
      }
      return summaries;
    },
    // Called after acquiring the booking lease and reading current provider objects.
    // The fence and booking guard are checked within the same batch as financial
    // revision, fulfillment, notification intents, receipt and CRM delivery.
    async commitFacts({ lease, booking, contract, facts, receipt = null, at = now() }) {
      const current = await getState(booking.id);
      if (!current || current.lease_token !== lease.lease_token || current.lease_expires_at <= at) return { committed: false };
      const conflict = await query(`SELECT id FROM bookings WHERE slot_id=? AND id!=? AND
        (booking_status='confirmed' OR (booking_status='hold' AND temporary_hold_expires_at>?)) LIMIT 1`,
        booking.slotId, booking.id, at).first();
      const was = booking.bookingStatus;
      const paid = facts.snapshot.paymentStatus === 'paid';
      let status = was;
      if (paid && !['confirmed','manual_review'].includes(was)) {
        status = was === 'hold' && booking.temporaryHoldExpiresAt > at && !conflict && facts.snapshot.refundStatus === 'none' ? 'confirmed' : 'manual_review';
      } else if (was === 'hold' && ['failed','expired'].includes(facts.snapshot.paymentStatus)) {
        status = facts.snapshot.paymentStatus === 'failed' ? 'payment_failed' : 'expired';
      }
      if (facts.snapshot.paymentStatus === 'needs_review' && was !== 'confirmed') status = 'manual_review';
      const previous = JSON.parse(current.envelope_json);
      const next = {
        ...previous, bookingRevision: current.revision + 1, eventType: 'booking.payment_snapshot',
        eventId: `booking-state:${booking.id}:${current.revision + 1}:v1`, observedAt: at,
        paymentIntentId: facts.paymentIntentId, chargeId: facts.chargeId,
        snapshot: { ...facts.snapshot, bookingStatus: status }, provenance: facts.provenance, intake: null
      };
      const factsJson = paymentFactsJson(next);
      const differs = factsJson !== current.facts_json;
      const event = differs ? await sealBookingEvent(next) : previous;
      const revision = differs ? event.bookingRevision : current.revision;
      const token = lease.lease_token;
      const fence = `EXISTS(SELECT 1 FROM booking_payment_state WHERE booking_id=? AND lease_token=? AND revision=? AND lease_expires_at>?)`;
      const fenceArgs = [booking.id, token, revision, at];
      // A fresh commit marker admits follow-on statements only after the CAS.
      const statements = [];
      const commitMarker = crypto.randomUUID();
      // Construct the guard with a fresh token, assigned only by a successful CAS.
      const casSql = `UPDATE booking_payment_state SET revision=?,envelope_json=?,facts_json=?,
        succeeded_refund_ids_json=?,updated_at=?,lease_token=?,verified_at=? WHERE booking_id=? AND lease_token=? AND lease_expires_at>?
        AND revision=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND booking_status=? AND updated_at=? AND stripe_checkout_session_id=?)
        AND (SELECT COUNT(*) FROM bookings WHERE slot_id=? AND id!=? AND
          (booking_status='confirmed' OR (booking_status='hold' AND temporary_hold_expires_at>?)))=?
        AND (?='' OR EXISTS(SELECT 1 FROM booking_provider_receipts WHERE id=? AND state='processing' AND lease_token=? AND lease_expires_at>?))`;
      statements[0] = query(casSql, revision, JSON.stringify(event), factsJson, JSON.stringify(facts.succeededRefundIds || []),
        at, commitMarker, at, booking.id, token, at, current.revision, booking.id, was, booking.updatedAt,
        current.checkout_session_id, booking.slotId, booking.id, at, conflict ? 1 : 0,
        receipt?.id || '', receipt?.id || '', receipt?.lease_token || '', at);
      fenceArgs[1] = commitMarker;
      if (differs) statements.push(insertDelivery(event, at, `WHERE ${fence}`, fenceArgs));
      statements.push(query(`UPDATE bookings SET booking_status=?,payment_status=?,stripe_payment_reference=CASE WHEN ?='' THEN stripe_payment_reference ELSE ? END,
        confirmed_at=CASE WHEN ?='confirmed' THEN COALESCE(confirmed_at,?) ELSE confirmed_at END,
        temporary_hold_expires_at=CASE WHEN ?='hold' THEN temporary_hold_expires_at ELSE NULL END,updated_at=?
        WHERE id=? AND ${fence}`, status, paid ? 'paid' : facts.snapshot.paymentStatus,
        facts.paymentIntentId, facts.paymentIntentId, status, at, status, at, booking.id, ...fenceArgs));
      if (status === 'confirmed' && was !== 'confirmed') {
        if (contract.implementationCreditEnabled) {
          statements.push(query(`INSERT INTO deposit_credits(id,booking_id,prospect_id,deposit_credit_available,deposit_credit_amount,
            deposit_credit_applied,created_at,updated_at) SELECT ?,?,?,1,?,0,?,? WHERE ${fence}
            ON CONFLICT(booking_id) DO NOTHING`, crypto.randomUUID(), booking.id, booking.prospectId, contract.amountCents, at, at, ...fenceArgs));
        } else {
          statements.push(query(`INSERT INTO booking_deliverables(id,booking_id,deliverable_type,status,expected_session_end_at,remedy_status,created_at,updated_at)
            SELECT ?,?,'workflow_map_first_build_plan','awaiting_session',?,'none',?,? WHERE ${fence}
            ON CONFLICT(booking_id,deliverable_type) DO NOTHING`, crypto.randomUUID(), booking.id, booking.selectedTimeWindowEnd, at, at, ...fenceArgs));
          for (const effect of ['calendar','customer_notification','internal_notification']) statements.push(query(
            `INSERT INTO integration_outbox(id,booking_id,event_type,effect_type,dedupe_key,safe_payload_json,state,attempts,next_attempt_at,created_at,updated_at)
             SELECT ?,?,'payment_confirmed',?,?,?,'pending',0,?,?,? WHERE ${fence} ON CONFLICT(dedupe_key) DO NOTHING`,
            crypto.randomUUID(), booking.id, effect, `${booking.id}:payment_confirmed:${effect}`, JSON.stringify({ bookingId: booking.id, releaseId: contract.releaseId }), at, at, at, ...fenceArgs));
        }
        statements.push(query(`INSERT INTO booking_contract_events(id,booking_id,event_type,prior_state,new_state,actor_ref,event_at,idempotency_key,safe_metadata_json,created_at)
          SELECT ?,?,'contract_validated',?,'confirmed','stripe_reconciliation',?,?,?,? WHERE ${fence}
          ON CONFLICT(idempotency_key) DO NOTHING`, crypto.randomUUID(), booking.id, was, at,
          `${booking.id}:contract_validated:${current.checkout_session_id}`, JSON.stringify({ releaseId: contract.releaseId }), at, ...fenceArgs));
      }
      if (receipt) statements.push(query(`UPDATE booking_provider_receipts SET state='delivered',booking_id=?,lease_token=NULL,
        lease_expires_at=NULL,last_safe_error_code=NULL,updated_at=? WHERE id=? AND lease_token=? AND lease_expires_at>? AND ${fence}`,
        booking.id, at, receipt.id, receipt.lease_token, at, ...fenceArgs));
      statements.push(query(`UPDATE booking_payment_state SET state='pending',failures=0,lease_token=NULL,lease_expires_at=NULL,
        last_safe_error_code=NULL,next_attempt_at=? WHERE booking_id=? AND lease_token=?`,
        later(at, paid ? 3_600_000 : 600_000), booking.id, commitMarker));
      const result = await db.batch(statements);
      return { committed: changed(result[0]), changed: differs && changed(result[0]), event, bookingStatus: status };
    }
  };
}
