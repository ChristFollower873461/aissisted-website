import { validateCheckoutSessionAgainstContract } from './booking-contract.js';

const API = 'https://api.stripe.com/v1';
const REQUEST_MS = 3_000;
const READ_MS = 12_000;
const MAX_REFUND_PAGES = 10;
const SESSION_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired', 'checkout.session.async_payment_failed']);
const REFUND_EVENTS = new Set(['refund.created', 'refund.updated', 'refund.failed']);
const objectId = (value) => typeof value === 'string' ? value : value?.id || '';
const isId = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_]+$`).test(value);
const minor = (value) => Number.isSafeInteger(value) && value >= 0;
class ReadFailure extends Error {
  constructor(reason, retryable = false, extra = {}) { super(reason); Object.assign(this, { reason, retryable, ...extra }); }
}
const fail = (reason, retryable = false, extra) => { throw new ReadFailure(reason, retryable, extra); };
function failure(error) {
  return error instanceof ReadFailure
    ? { ok: false, retryable: error.retryable, reason: error.reason, ...(error.unresolved ? { unresolved: true } : {}) }
    : { ok: false, retryable: true, reason: 'provider_read_failed' };
}
function reader(config) {
  const deadline = Date.now() + READ_MS;
  return async (path) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail('provider_deadline', true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(REQUEST_MS, remaining));
    try {
      const response = await fetch(`${API}${path}`, {
        method: 'GET', redirect: 'manual', signal: controller.signal,
        headers: { authorization: `Bearer ${config.stripeSecretKey}`, ...(config.stripeApiVersion ? { 'stripe-version': config.stripeApiVersion } : {}) }
      });
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => {});
        fail(`provider_http_${response.status}`, response.status >= 500 || [408, 409, 425, 429].includes(response.status));
      }
      // Keep the same abort active after headers, through body consumption.
      const body = await response.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('provider_response_invalid', true);
      return body;
    } catch (error) {
      if (error instanceof ReadFailure) throw error;
      fail(controller.signal.aborted ? 'provider_deadline' : 'provider_read_failed', true);
    } finally { clearTimeout(timer); }
  };
}
function checkEvent(scope, event) {
  if (event === null || event === undefined) return;
  if (!isId(event.id, 'evt') || !Number.isSafeInteger(event.created) || event.created < 0) fail('provider_event_invalid');
  if (event.livemode !== scope.livemode) fail('provider_event_mode_mismatch');
  if (event.account != null && event.account !== scope.providerAccountId) fail('provider_event_account_mismatch');
  if (!SESSION_EVENTS.has(event.type) && !REFUND_EVENTS.has(event.type) && event.type !== 'charge.refunded') fail('provider_event_type_unsupported');
  const prefix = SESSION_EVENTS.has(event.type) ? 'cs' : REFUND_EVENTS.has(event.type) ? 're' : 'ch';
  if (!isId(event.data?.object?.id, prefix)) fail('provider_event_object_invalid');
}
async function verifyScope(config, scope, event, get) {
  if (!config?.stripeSecretKey || !isId(scope?.providerAccountId, 'acct') || typeof scope?.livemode !== 'boolean'
    || !['staging', 'production'].includes(scope.sourceEnvironment) || config.stripeExpectedLivemode !== scope.livemode) fail('provider_scope_invalid');
  checkEvent(scope, event);
  // Direct-account Stripe events omit account or set it to null. The credential's actual account
  // is read even in that case; a configured label is never treated as proof.
  const account = await get('/account');
  if (account.object !== 'account' || account.id !== scope.providerAccountId) fail('provider_account_mismatch');
}
export async function verifyBookingProviderScope({ config, scope, event = null }) {
  try { await verifyScope(config, scope, event, reader(config)); return { ok: true, retryable: false, providerAccountId: scope.providerAccountId, livemode: scope.livemode }; }
  catch (error) { return failure(error); }
}
function mode(object, scope, required = true) {
  if ((required || object.livemode !== undefined) && object.livemode !== scope.livemode) fail('provider_object_mode_mismatch');
}
async function currentSession(get, id, scope) {
  if (!isId(id, 'cs')) fail('stored_session_invalid');
  const session = await get(`/checkout/sessions/${encodeURIComponent(id)}?expand[]=line_items.data.price.product`);
  if (session.object !== 'checkout.session' || session.id !== id) fail('provider_session_mismatch');
  mode(session, scope);
  if (session.mode !== 'payment' || !['open', 'complete', 'expired'].includes(session.status)
    || !['unpaid', 'paid'].includes(session.payment_status)) fail('provider_session_state_invalid');
  return session;
}
function sessionContract(session, booking, contract) {
  if (!contract || contract.bookingId !== booking.id || !Number.isSafeInteger(Number(contract.amountCents)) || Number(contract.amountCents) <= 0
    || !contract.stripePriceRef || !contract.stripeProductRef || !/^[a-f0-9]{64}$/.test(contract.termsSha256 || '')) fail('stored_contract_unverified');
  const validation = validateCheckoutSessionAgainstContract({ session,
    contract: { ...contract, bookingId: booking.id, stripeCheckoutSessionId: booking.stripeCheckoutSessionId }, expectedLivemode: session.livemode });
  if (validation.reasons.some((reason) => reason !== 'payment_not_paid') || !minor(session.amount_total)
    || session.line_items?.has_more === true || session.line_items?.data?.length !== 1 || session.line_items.data[0].quantity !== 1) fail('provider_contract_mismatch');
}
async function getPayment(get, id, scope) {
  if (!isId(id, 'pi')) fail('provider_payment_id_invalid');
  const payment = await get(`/payment_intents/${encodeURIComponent(id)}`);
  if (payment.object !== 'payment_intent' || payment.id !== id) fail('provider_payment_mismatch');
  mode(payment, scope); return payment;
}
async function getCharge(get, id, scope) {
  if (!isId(id, 'ch')) fail('provider_charge_id_invalid');
  const charge = await get(`/charges/${encodeURIComponent(id)}`);
  if (charge.object !== 'charge' || charge.id !== id) fail('provider_charge_mismatch');
  mode(charge, scope); return charge;
}
async function getRefund(get, id, scope) {
  if (!isId(id, 're')) fail('provider_refund_id_invalid');
  const refund = await get(`/refunds/${encodeURIComponent(id)}`);
  if (refund.object !== 'refund' || refund.id !== id) fail('provider_refund_mismatch');
  // Refund objects do not have a required livemode field. Verify the signed
  // Event and its actual charge/payment under the verified account instead.
  mode(refund, scope, false); return refund;
}
async function refundFacts(get, paymentId, chargeId, paidAmount, currency, scope) {
  const seen = new Map(); let cursor = '';
  for (let page = 0; page < MAX_REFUND_PAGES; page++) {
    const query = new URLSearchParams({ payment_intent: paymentId, limit: '100' });
    if (cursor) query.set('starting_after', cursor);
    const list = await get(`/refunds?${query}`);
    if (!Array.isArray(list.data) || typeof list.has_more !== 'boolean' || list.data.length > 100) fail('provider_refund_list_invalid', true);
    for (const refund of list.data) {
      if (!isId(refund.id, 're') || refund.object !== 'refund' || !minor(refund.amount) || refund.amount === 0
        || refund.currency !== currency || objectId(refund.payment_intent) !== paymentId || objectId(refund.charge) !== chargeId
        || !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(refund.status)) fail('provider_refund_invalid');
      mode(refund, scope, false);
      const fact = { id: refund.id, amount: refund.amount, status: refund.status };
      if (seen.has(refund.id) && JSON.stringify(seen.get(refund.id)) !== JSON.stringify(fact)) fail('provider_refund_changed_during_read', true);
      seen.set(refund.id, fact);
    }
    if (!list.has_more) {
      const all = [...seen.values()];
      const succeeded = all.filter((r) => r.status === 'succeeded');
      const pending = all.filter((r) => ['pending', 'requires_action'].includes(r.status));
      const amount = succeeded.reduce((total, r) => total + r.amount, 0);
      if (!minor(amount) || amount > paidAmount || all.some((r) => r.amount > paidAmount)) fail('provider_refund_total_invalid');
      const refundStatus = amount === paidAmount && paidAmount > 0 ? 'full' : pending.length ? 'pending' : amount > 0 ? 'partial' : 'none';
      return { refundFacts: seen, succeededRefundAmountCents: amount, refundStatus, succeededRefundIds: succeeded.map((r) => r.id).sort(), pendingRefundIds: pending.map((r) => r.id).sort() };
    }
    const last = list.data.at(-1)?.id;
    if (!last || last === cursor) fail('provider_refund_pagination_incomplete', true);
    cursor = last;
  }
  fail('provider_refund_pagination_limit', true);
}

export async function readBookingPaymentFacts({ config, scope, booking, contract, event = null, previous = null, at }) {
  try {
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) fail('verification_time_invalid');
    const get = reader(config); await verifyScope(config, scope, event, get);
    if (!booking?.id) fail('stored_booking_missing');
    const session = await currentSession(get, booking.stripeCheckoutSessionId, scope);
    sessionContract(session, booking, contract);
    if (event && SESSION_EVENTS.has(event.type) && event.data.object.id !== session.id) fail('provider_event_session_mismatch');
    const paymentIntentId = objectId(session.payment_intent);
    if (previous?.paymentIntentId && previous.paymentIntentId !== paymentIntentId) fail('provider_payment_association_changed');
    let chargeId = '', paidAmountCents = 0;
    let paymentStatus = session.status === 'expired' ? 'expired' : session.status === 'complete' ? 'pending' : 'unpaid';
    if (paymentIntentId) {
      const payment = await getPayment(get, paymentIntentId, scope);
      if (!minor(payment.amount) || payment.amount !== Number(contract.amountCents) || payment.currency !== contract.currency
        || !minor(payment.amount_received) || (payment.metadata?.booking_id && payment.metadata.booking_id !== booking.id)) fail('provider_payment_contract_mismatch');
      if (!['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing', 'requires_capture', 'canceled', 'succeeded'].includes(payment.status)) fail('provider_payment_state_invalid');
      if (session.payment_status === 'paid') {
        if (session.status !== 'complete' || payment.status !== 'succeeded' || payment.amount_received !== Number(contract.amountCents)) fail('provider_payment_not_captured');
        chargeId = objectId(payment.latest_charge);
        const charge = await getCharge(get, chargeId, scope);
        if (objectId(charge.payment_intent) !== paymentIntentId || charge.currency !== contract.currency || charge.paid !== true || charge.captured !== true
          || charge.status !== 'succeeded' || !minor(charge.amount) || !minor(charge.amount_captured)
          || charge.amount !== Number(contract.amountCents) || charge.amount_captured !== Number(contract.amountCents)) fail('provider_capture_mismatch');
        paidAmountCents = charge.amount_captured; paymentStatus = 'paid';
      } else {
        if (payment.amount_received || payment.status === 'succeeded' || payment.status === 'requires_capture') fail('provider_payment_snapshot_inconsistent');
        if (payment.status === 'processing' || payment.status === 'requires_action') paymentStatus = 'pending';
        else if (payment.status === 'canceled' || (payment.status === 'requires_payment_method' && payment.last_payment_error)) paymentStatus = 'failed';
      }
    } else if (session.payment_status === 'paid') fail('provider_paid_association_missing');
    if (previous?.chargeId && chargeId !== previous.chargeId) fail('provider_charge_association_changed');
    if (Number(previous?.snapshot?.paidAmountCents ?? previous?.paidAmountCents ?? 0) > paidAmountCents) fail('paid_state_regression');
    let refunds = { succeededRefundAmountCents: 0, refundStatus: 'none', succeededRefundIds: [], pendingRefundIds: [] };
    if (paidAmountCents) refunds = await refundFacts(get, paymentIntentId, chargeId, paidAmountCents, contract.currency, scope);
    if (event && REFUND_EVENTS.has(event.type)) {
      const refund = await getRefund(get, event.data.object.id, scope);
      if (objectId(refund.payment_intent) !== paymentIntentId || objectId(refund.charge) !== chargeId || refund.currency !== contract.currency) fail('provider_event_refund_association_mismatch');
      const listed = refunds.refundFacts?.get(refund.id);
      if (!listed || listed.amount !== refund.amount || listed.status !== refund.status) fail('provider_refund_list_stale', true);
    } else if (event?.type === 'charge.refunded' && event.data.object.id !== chargeId) fail('provider_event_charge_mismatch');
    return { ok: true, retryable: false, session, checkoutSessionId: session.id, paymentIntentId, chargeId,
      snapshot: Object.freeze({ checkoutStatus: session.status, paymentStatus, paidAmountCents,
        succeededRefundAmountCents: refunds.succeededRefundAmountCents, refundStatus: refunds.refundStatus, bookingStatus: booking.bookingStatus || 'unknown' }),
      provenance: Object.freeze({ providerEventId: event?.id || '', providerEventType: event?.type || 'provider.reconciled', providerCreatedAt: event?.created || 0, verifiedAt: at }),
      succeededRefundIds: refunds.succeededRefundIds, pendingRefundIds: refunds.pendingRefundIds };
  } catch (error) { return failure(error); }
}

async function associatedBooking(store, session) {
  const bySession = await store.getBookingBySessionId(session.id);
  const hint = session.metadata?.booking_id;
  if (bySession) {
    if (hint !== bySession.id || bySession.stripeCheckoutSessionId !== session.id) fail('provider_booking_association_mismatch');
    return bySession;
  }
  // Provider metadata is a lookup hint only. It cannot attach a Session that
  // the checkout transaction has not already durably bound to this booking.
  const hinted = hint ? await store.getBookingById(hint) : null;
  if (hinted?.stripeCheckoutSessionId && hinted.stripeCheckoutSessionId !== session.id) fail('provider_booking_association_mismatch');
  return hinted?.stripeCheckoutSessionId === session.id ? hinted : null;
}
export async function resolveProviderBooking({ config, scope, event, store }) {
  try {
    const get = reader(config); await verifyScope(config, scope, event, get);
    if (!event) fail('provider_event_invalid');
    if (SESSION_EVENTS.has(event.type)) {
      const session = await currentSession(get, event.data.object.id, scope);
      const booking = await associatedBooking(store, session);
      if (!booking) fail('provider_booking_unresolved', true, { unresolved: true });
      return { ok: true, retryable: false, booking, sessionId: session.id, checkoutSessionId: session.id };
    }
    let paymentIntentId;
    if (REFUND_EVENTS.has(event.type)) {
      const refund = await getRefund(get, event.data.object.id, scope);
      paymentIntentId = objectId(refund.payment_intent);
      const charge = await getCharge(get, objectId(refund.charge), scope);
      if (paymentIntentId && objectId(charge.payment_intent) !== paymentIntentId) fail('provider_refund_association_mismatch');
      paymentIntentId ||= objectId(charge.payment_intent);
    } else {
      const charge = await getCharge(get, event.data.object.id, scope); paymentIntentId = objectId(charge.payment_intent);
    }
    await getPayment(get, paymentIntentId, scope);
    const byPayment = await store.getBookingByPaymentIntentId(paymentIntentId);
    if (byPayment?.stripeCheckoutSessionId) {
      const session = await currentSession(get, byPayment.stripeCheckoutSessionId, scope);
      if (objectId(session.payment_intent) !== paymentIntentId || session.metadata?.booking_id !== byPayment.id) fail('provider_booking_association_mismatch');
      return { ok: true, retryable: false, booking: byPayment, sessionId: session.id, checkoutSessionId: session.id };
    }
    const list = await get(`/checkout/sessions?${new URLSearchParams({ payment_intent: paymentIntentId, limit: '2' })}`);
    if (!Array.isArray(list.data) || list.has_more !== false || list.data.length > 1) fail('provider_session_lookup_incomplete', true);
    for (const value of list.data) {
      const session = await currentSession(get, value.id, scope);
      if (objectId(session.payment_intent) !== paymentIntentId) fail('provider_payment_association_mismatch');
      const booking = await associatedBooking(store, session);
      if (booking) return { ok: true, retryable: false, booking, sessionId: session.id, checkoutSessionId: session.id };
    }
    fail('provider_booking_unresolved', true, { unresolved: true });
  } catch (error) { return failure(error); }
}
