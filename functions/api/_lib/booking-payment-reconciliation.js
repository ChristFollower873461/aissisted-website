import { canonicalBookingJson, hashBookingEventPayload, sealBookingEvent, verifyBookingEvent } from './booking-events.js';
import { createBookingPaymentStore } from './booking-payment-store.js';
import { readBookingPaymentFacts, resolveProviderBooking, verifyBookingProviderScope } from './booking-payment-provider.js';

const EVENT_TYPES = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.expired', 'checkout.session.async_payment_failed', 'refund.created', 'refund.updated', 'refund.failed', 'charge.refunded']);
const now = () => new Date().toISOString();

export function bookingPaymentEnabled(env) {
  if (env.AIC_CRM_BOOKING_EVENTS_ENABLED === undefined || env.AIC_CRM_BOOKING_EVENTS_ENABLED === 'false') return false;
  if (env.AIC_CRM_BOOKING_EVENTS_ENABLED !== 'true') throw new Error('booking_events_enabled_invalid');
  return true;
}

export function bookingPaymentScope(env, config) {
  if (!env.BOOKING_DB) throw new Error('booking_payment_database_required');
  const sourceEnvironment = env.AIC_CRM_BOOKING_EVENTS_SOURCE_ENVIRONMENT;
  const providerAccountId = env.AIC_CRM_BOOKING_EVENTS_PROVIDER_ACCOUNT_ID;
  if (!['production', 'staging'].includes(sourceEnvironment) || !/^acct_[A-Za-z0-9]+$/.test(providerAccountId || '')
      || typeof config.stripeExpectedLivemode !== 'boolean') throw new Error('booking_events_scope_invalid');
  const url = new URL(env.AIC_CRM_BOOKING_EVENTS_URL || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/intake/website/booking-events' || !String(env.AIC_CRM_BOOKING_EVENTS_TOKEN || '').trim()) {
    throw new Error('booking_events_receiver_invalid');
  }
  return { sourceEnvironment, providerAccountId, livemode: config.stripeExpectedLivemode };
}

export async function verifyCheckoutPaymentScope({ env, config }) {
  const scope = bookingPaymentScope(env, config);
  const result = await verifyBookingProviderScope({ config, scope });
  if (!result.ok) throw new Error(result.reason);
  return scope;
}

export async function buildBookingStartEvent({ scope, booking, contract, session, intake, at = now() }) {
  if (session.livemode !== scope.livemode || !['open', 'complete'].includes(session.status)) throw new Error('checkout_start_scope_invalid');
  return sealBookingEvent({
    schemaVersion: 1, source: 'aissisted-website', ...scope, bookingId: booking.id,
    rootQualifiedSourceEventId: `website-booking-${booking.id}`,
    eventId: `booking-start:${booking.id}:${session.id}:v1`, bookingRevision: 1,
    eventType: 'booking.checkout_started', observedAt: at, checkoutSessionId: session.id,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '', chargeId: '',
    contract: Object.fromEntries(['releaseId','offerId','offerVersion','amountCents','currency','termsVersion','termsSha256'].map((key) => [key, contract[key]])),
    snapshot: { checkoutStatus: session.status, paymentStatus: 'unpaid', paidAmountCents: 0,
      succeededRefundAmountCents: 0, refundStatus: 'none', bookingStatus: 'hold' },
    provenance: { providerEventId: '', providerEventType: 'checkout.session.created',
      providerCreatedAt: Number.isSafeInteger(session.created) ? session.created : 0, verifiedAt: at },
    intake
  });
}

// Persist only association hints; signed webhook bodies can contain customer PII.
// Hints never authorize a financial update: the provider reader verifies current objects.
function safeProviderEvent(event) {
  const object = event.data?.object || {};
  const reference = (value) => typeof value === 'string' ? value : value?.id || '';
  return { id: event.id, type: event.type, created: event.created, livemode: event.livemode,
    ...(event.account ? { account: event.account } : {}), data: { object: {
      id: object.id, object: object.object || '', payment_intent: reference(object.payment_intent),
      charge: reference(object.charge), client_reference_id: object.client_reference_id || '',
      metadata: { booking_id: object.metadata?.booking_id || '' }
    } } };
}

export async function acceptBookingProviderEvent({ env, config, store, event }) {
  const scope = bookingPaymentScope(env, config);
  if (!EVENT_TYPES.has(event.type)) return { ignored: true };
  if (!/^evt_[A-Za-z0-9_]+$/.test(event.id || '') || !Number.isSafeInteger(event.created) || event.created < 0
      || event.livemode !== scope.livemode || (event.account && event.account !== scope.providerAccountId)) {
    throw new Error('provider_event_scope_invalid');
  }
  const paymentStore = createBookingPaymentStore(env.BOOKING_DB);
  const receipt = await paymentStore.recordReceipt({ event: safeProviderEvent(event), scope,
    payloadHash: await hashBookingEventPayload(event) });
  return { received: true, receiptId: receipt.id, duplicate: receipt.state === 'delivered' };
}

async function reconcileOne({ env, config, store, paymentStore, scope, bookingId = '', receipt = null }) {
  let lease;
  try {
    const event = receipt ? JSON.parse(receipt.event_json) : null;
    let booking;
    if (event) {
      const resolved = await resolveProviderBooking({ config, scope, event, store });
      if (!resolved.ok) {
        await paymentStore.finishQueue('receipt', receipt, resolved);
        return { ok: false, reason: resolved.reason };
      }
      booking = resolved.booking;
    } else booking = await store.getBookingById(bookingId);
    if (!booking) throw new Error('booking_missing');
    lease = await paymentStore.claimBooking({ bookingId: booking.id, scope });
    if (!lease) {
      if (receipt) await paymentStore.finishQueue('receipt', receipt, { reason: 'booking_busy_or_unattached' });
      return { ok: false, reason: 'booking_busy_or_unattached' };
    }
    // The provider read follows lease acquisition; event timestamp is never an ordering key.
    booking = await store.getBookingById(booking.id);
    const contract = await store.getBookingContract(booking.id);
    const facts = await readBookingPaymentFacts({ config, scope, booking, contract, event,
      previous: JSON.parse(lease.envelope_json), at: now() });
    if (!facts.ok) {
      await paymentStore.releaseBooking(lease, { ...facts, reason: facts.reason });
      if (receipt) await paymentStore.finishQueue('receipt', receipt, facts);
      return facts;
    }
    const result = await paymentStore.commitFacts({ lease, booking, contract, facts, receipt });
    if (!result.committed) {
      await paymentStore.releaseBooking(lease, { reason: 'observation_commit_conflict' });
      if (receipt) await paymentStore.finishQueue('receipt', receipt, { reason: 'observation_commit_conflict' });
    }
    return { ok: result.committed, changed: result.changed };
  } catch {
    if (lease) await paymentStore.releaseBooking(lease, { reason: 'reconciliation_unavailable' });
    if (receipt) await paymentStore.finishQueue('receipt', receipt, { reason: 'reconciliation_unavailable' });
    return { ok: false, reason: 'reconciliation_unavailable' };
  }
}

export async function deliverBookingEvent({ env, event, timeoutMs = 3000 }) {
  await verifyBookingEvent(event);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(env.AIC_CRM_BOOKING_EVENTS_URL, {
      method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json',
        authorization: `Bearer ${env.AIC_CRM_BOOKING_EVENTS_TOKEN}` },
      body: canonicalBookingJson(event)
    });
    const body = await response.json();
    const ack = response.status === 200 && body?.ok === true && body.eventId === event.eventId
      && body.payloadHash === event.payloadHash && body.bookingId === event.bookingId
      && body.acceptedRevision === event.bookingRevision;
    return { ok: ack, retryable: ![400,401,403,404,409,413,422].includes(response.status),
      reason: ack ? '' : response.status === 200 ? 'receiver_ack_mismatch' : `receiver_http_${response.status}` };
  } catch { return { ok: false, retryable: true, reason: 'receiver_unavailable' }; }
  finally { clearTimeout(timer); }
}

export async function drainBookingPayments({ env, config, store, limit = 5, receiptId = '' }) {
  const scope = bookingPaymentScope(env, config);
  const paymentStore = createBookingPaymentStore(env.BOOKING_DB);
  const summary = { receipts: 0, observations: 0, deliveries: 0, failures: 0 };
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(10, limit)) : 5;
  const deadline = Date.now() + 25_000;
  for (let index = 0; index < boundedLimit && Date.now() < deadline; index++) {
    const receipt = await paymentStore.claimQueue('receipt', { id: receiptId });
    if (!receipt) break;
    const result = await reconcileOne({ env, config, store, paymentStore, scope, receipt });
    summary.receipts++;
    if (!result.ok) summary.failures++;
  }
  if (!receiptId) for (const row of await paymentStore.listDueBookings({ limit: boundedLimit })) {
    if (Date.now() >= deadline) break;
    const result = await reconcileOne({ env, config, store, paymentStore, scope, bookingId: row.booking_id });
    summary.observations++;
    if (!result.ok) summary.failures++;
  }
  for (let index = 0; index < boundedLimit && Date.now() < deadline; index++) {
    const item = await paymentStore.claimQueue('delivery');
    if (!item) break;
    const result = await deliverBookingEvent({ env, event: JSON.parse(item.payload_json) });
    await paymentStore.finishQueue('delivery', item, result);
    summary.deliveries++;
    if (!result.ok) summary.failures++;
  }
  summary.health = await paymentStore.health();
  return summary;
}

// Owner refund reconciliation refreshes only this booking; it does not drain
// notification/calendar work or another customer's queue.
export async function refreshBookingPayment({ env, config, store, bookingId }) {
  const scope = bookingPaymentScope(env, config);
  return reconcileOne({ env, config, store, bookingId, scope, paymentStore: createBookingPaymentStore(env.BOOKING_DB) });
}
