import test from 'node:test';
import assert from 'node:assert/strict';
import { readBookingPaymentFacts, resolveProviderBooking, verifyBookingProviderScope } from '../functions/api/_lib/booking-payment-provider.js';

const at = '2026-09-05T16:00:00.000Z';
const scope = { providerAccountId: 'acct_synthetic', livemode: false, sourceEnvironment: 'staging' };
const config = { stripeSecretKey: 'sk_test_synthetic_fixture_only', stripeApiVersion: '2026-06-24.dahlia', stripeExpectedLivemode: false };
function fixture(t, overrides = {}) {
  const booking = { id: 'book_synthetic', stripeCheckoutSessionId: 'cs_test_synthetic', bookingStatus: 'hold' };
  const contract = { bookingId: booking.id, releaseId: 'release_v2', offerId: 'workflow_map', offerVersion: 2, amountCents: 22500, currency: 'usd', stripePriceRef: 'price_synthetic', stripeProductRef: 'prod_synthetic', paymentMethodPolicy: 'synchronous_card_only', termsVersion: 'terms_v2', termsSha256: 'a'.repeat(64) };
  const metadata = { booking_id: booking.id, release_id: contract.releaseId, offer_id: contract.offerId, offer_version: '2', terms_version: contract.termsVersion, terms_sha256: contract.termsSha256 };
  const session = { id: booking.stripeCheckoutSessionId, object: 'checkout.session', livemode: false, mode: 'payment', status: 'complete', payment_status: 'paid', amount_total: 22500, currency: 'usd', payment_intent: 'pi_synthetic', metadata, payment_method_types: ['card'], line_items: { has_more: false, data: [{ quantity: 1, price: { id: contract.stripePriceRef, product: contract.stripeProductRef } }] } };
  const payment = { id: 'pi_synthetic', object: 'payment_intent', livemode: false, amount: 22500, amount_received: 22500, currency: 'usd', status: 'succeeded', latest_charge: 'ch_synthetic', metadata: { ...metadata } };
  const charge = { id: 'ch_synthetic', object: 'charge', livemode: false, amount: 22500, amount_captured: 22500, currency: 'usd', captured: true, paid: true, status: 'succeeded', payment_intent: payment.id };
  const event = { id: 'evt_synthetic', type: 'checkout.session.completed', created: 1788624000, livemode: false, data: { object: { id: session.id, payment_status: 'unpaid', metadata: { booking_id: 'untrusted' } } } };
  const state = { booking, contract, session, payment, charge, event, refunds: [], requests: [], accountId: scope.providerAccountId, ...overrides };
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.method, 'GET', 'the provider reader never creates payments, refunds or provider state');
    assert.equal(init.headers['stripe-version'], config.stripeApiVersion);
    assert.equal(init.headers.authorization, `Bearer ${config.stripeSecretKey}`);
    const parsed = new URL(url); assert.equal(parsed.origin, 'https://api.stripe.com');
    state.requests.push(parsed.pathname + parsed.search);
    if (state.respond) { const response = await state.respond(parsed, init); if (response) return response; }
    if (parsed.pathname === '/v1/account') return Response.json({ id: state.accountId, object: 'account' });
    if (parsed.pathname === `/v1/checkout/sessions/${booking.stripeCheckoutSessionId}`) return Response.json(state.session);
    if (parsed.pathname === `/v1/payment_intents/${payment.id}`) return Response.json(state.payment);
    if (parsed.pathname === `/v1/charges/${charge.id}`) return Response.json(state.charge);
    if (parsed.pathname === '/v1/refunds') {
      assert.equal(parsed.searchParams.get('payment_intent'), payment.id);
      return Response.json(state.refundPage ? state.refundPage(parsed.searchParams) : { object: 'list', data: state.refunds, has_more: false });
    }
    if (parsed.pathname.startsWith('/v1/refunds/')) {
      const refund = state.refunds.find((r) => r.id === parsed.pathname.split('/').at(-1));
      if (refund) return Response.json(refund);
    }
    if (parsed.pathname === '/v1/checkout/sessions') {
      assert.equal(parsed.searchParams.get('payment_intent'), payment.id);
      return Response.json({ object: 'list', data: [state.session], has_more: false });
    }
    throw new Error(`Unregistered local provider request ${parsed.pathname}`);
  });
  state.read = (input = {}) => readBookingPaymentFacts({ config, scope, booking, contract, event, at, ...input });
  state.store = { getBookingBySessionId: async (id) => id === booking.stripeCheckoutSessionId ? booking : null, getBookingById: async (id) => id === booking.id ? booking : null, getBookingByPaymentIntentId: async () => null };
  return state;
}
const refund = (id, amount, status = 'succeeded') => ({ id, object: 'refund', amount, currency: 'usd', status, payment_intent: 'pi_synthetic', charge: 'ch_synthetic' });

test('current provider Session, payment and capture establish paid facts; stale callback body is not authority', async (t) => {
  const h = fixture(t); const result = await h.read();
  assert.equal(result.ok, true); assert.equal(result.checkoutSessionId, h.session.id);
  assert.equal(result.snapshot.paymentStatus, 'paid'); assert.equal(result.snapshot.paidAmountCents, 22500);
  assert.equal(result.snapshot.bookingStatus, 'hold'); assert.equal(result.snapshot.refundStatus, 'none');
  assert.equal(result.provenance.providerEventId, h.event.id); assert.equal(result.provenance.verifiedAt, at);
});

test('scope verifies the actual API account even when direct-account event has no account field', async (t) => {
  const h = fixture(t); assert.equal((await verifyBookingProviderScope({ config, scope, event: h.event })).ok, true);
  h.event.account = null; assert.equal((await verifyBookingProviderScope({ config, scope, event: h.event })).ok, true, 'Stripe documents account as nullable for direct-account events');
  h.accountId = 'acct_foreign'; assert.deepEqual(await verifyBookingProviderScope({ config, scope }), { ok: false, retryable: false, reason: 'provider_account_mismatch' });
});
for (const [label, mutate] of [
  ['foreign event account', (h) => { h.event.account = 'acct_foreign'; }],
  ['event mode', (h) => { h.event.livemode = true; }],
  ['Session mode', (h) => { h.session.livemode = true; }],
  ['different current Session', (h) => { h.session.id = 'cs_other'; }],
  ['foreign booking metadata', (h) => { h.session.metadata.booking_id = 'book_other'; }],
  ['wrong amount', (h) => { h.session.amount_total = 22501; }],
  ['wrong currency', (h) => { h.session.currency = 'eur'; }],
  ['foreign product', (h) => { h.session.line_items.data[0].price.product = 'prod_other'; }],
  ['multiple line items', (h) => { h.session.line_items.data.push(h.session.line_items.data[0]); }],
  ['partial capture', (h) => { h.charge.amount_captured = 10000; }],
  ['foreign payment in charge', (h) => { h.charge.payment_intent = 'pi_foreign'; }],
  ['unverified legacy contract', (h) => { h.contract = null; }]
]) test(`${label} cannot establish paid state`, async (t) => {
  const h = fixture(t); mutate(h); const result = await h.read({ contract: h.contract });
  assert.equal(result.ok, false); assert.equal(result.retryable, false);
});

test('valid completed-unpaid remains pending and does not require a fabricated PaymentIntent or charge', async (t) => {
  const h = fixture(t); h.session.payment_status = 'unpaid'; h.session.payment_intent = null;
  const result = await h.read(); assert.equal(result.ok, true); assert.equal(result.snapshot.paymentStatus, 'pending');
  assert.equal(result.snapshot.paidAmountCents, 0); assert.equal(result.chargeId, '');
  assert.equal(h.requests.some((p) => p.includes('payment_intents')), false);
});

test('expired unpaid Session is operationally expired; late expiry callback cannot downgrade a currently paid Session', async (t) => {
  const h = fixture(t); h.event.type = 'checkout.session.expired';
  assert.equal((await h.read()).snapshot.paymentStatus, 'paid');
  h.session.status = 'expired'; h.session.payment_status = 'unpaid'; h.session.payment_intent = null;
  assert.equal((await h.read()).snapshot.paymentStatus, 'expired');
  const result = await h.read({ previous: { snapshot: { paidAmountCents: 22500 } } });
  assert.equal(result.ok, false); assert.equal(result.reason, 'paid_state_regression');
});

test('pending and failed provider payment states remain distinct from paid', async (t) => {
  const h = fixture(t); h.session.payment_status = 'unpaid'; h.payment.amount_received = 0; h.payment.latest_charge = null;
  h.payment.status = 'processing'; assert.equal((await h.read()).snapshot.paymentStatus, 'pending');
  h.payment.status = 'requires_payment_method'; h.payment.last_payment_error = { code: 'card_declined' };
  assert.equal((await h.read()).snapshot.paymentStatus, 'failed');
});

test('refund pagination sums unique succeeded IDs and preserves partial then full refund', async (t) => {
  const h = fixture(t); const first = refund('re_one', 5000), second = refund('re_two', 17500);
  h.refunds = [first]; const partial = await h.read();
  assert.equal(partial.snapshot.refundStatus, 'partial'); assert.equal(partial.snapshot.succeededRefundAmountCents, 5000);
  h.refundPage = (query) => query.get('starting_after') ? { data: [first, second], has_more: false } : { data: [first], has_more: true };
  const full = await h.read(); assert.equal(full.snapshot.refundStatus, 'full'); assert.equal(full.snapshot.paidAmountCents, 22500);
  assert.equal(full.snapshot.succeededRefundAmountCents, 22500); assert.deepEqual(full.succeededRefundIds, ['re_one', 're_two']);
});

test('pending/failed/canceled refunds are not successful, including a later authoritative refund failure', async (t) => {
  const h = fixture(t); h.refunds = [refund('re_pending', 22500, 'pending')];
  const pending = await h.read(); assert.equal(pending.snapshot.refundStatus, 'pending'); assert.equal(pending.snapshot.succeededRefundAmountCents, 0);
  for (const status of ['requires_action', 'failed', 'canceled']) {
    h.refunds[0].status = status;
    const result = await h.read({ previous: { paymentIntentId: 'pi_synthetic', chargeId: 'ch_synthetic', snapshot: { paidAmountCents: 22500, succeededRefundAmountCents: 22500, refundStatus: 'full' } } });
    assert.equal(result.ok, true); assert.equal(result.snapshot.succeededRefundAmountCents, 0);
    assert.notEqual(result.snapshot.refundStatus, 'full');
  }
});
for (const [label, values] of [
  ['foreign payment', [{ ...refund('re_bad', 1000), payment_intent: 'pi_other' }]],
  ['foreign charge', [{ ...refund('re_bad', 1000), charge: 'ch_other' }]],
  ['foreign currency', [{ ...refund('re_bad', 1000), currency: 'eur' }]],
  ['impossible total', [refund('re_big', 22501)]],
  ['unknown refund status', [refund('re_bad', 1000, 'invented')]]
]) test(`${label} refund fails closed`, async (t) => {
  const h = fixture(t); h.refunds = values; const result = await h.read(); assert.equal(result.ok, false); assert.equal(result.retryable, false);
});

test('incomplete or repeated pagination is bounded and retryable instead of accepting a partial refund list', async (t) => {
  const h = fixture(t); h.refundPage = () => ({ data: [refund('re_repeat', 1)], has_more: true });
  const result = await h.read(); assert.equal(result.ok, false); assert.equal(result.retryable, true); assert.ok(h.requests.length < 20);
});
for (const status of [429, 500, 503]) test(`provider HTTP${status} is retryable without financial evidence`, async (t) => {
  const h = fixture(t); h.respond = (url) => url.pathname === '/v1/account' ? Response.json({ error: { message: 'Synthetic secret must never appear in result' } }, { status }) : null;
  const result = await h.read(); assert.equal(result.ok, false); assert.equal(result.retryable, true); assert.doesNotMatch(JSON.stringify(result), /Synthetic secret/);
});
test('provider authorization failure is a permanent safe failure and malformed JSON is retryable', async (t) => {
  const h = fixture(t); h.respond = () => Response.json({ error: 'private' }, { status: 401 });
  assert.equal((await h.read()).retryable, false);
  h.respond = () => new Response('{'); assert.equal((await h.read()).retryable, true);
});

test('deadline covers a provider response body that stalls after headers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); let signal;
  fixture(t, { respond: (_url, init) => {
    signal = init.signal;
    return new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new DOMException('Synthetic abort', 'AbortError')), { once: true }); } }));
  } });
  const pending = verifyBookingProviderScope({ config, scope });
  for (let n = 0; n < 8; n++) await Promise.resolve();
  t.mock.timers.tick(3000);
  const result = await pending; assert.equal(signal.aborted, true); assert.equal(result.ok, false); assert.equal(result.retryable, true);
});

test('resolve uses current provider Session and stored association, never webhook metadata alone', async (t) => {
  const h = fixture(t); const resolved = await resolveProviderBooking({ config, scope, event: h.event, store: h.store });
  assert.equal(resolved.ok, true); assert.equal(resolved.booking.id, h.booking.id);
  h.session.metadata.booking_id = 'book_foreign';
  assert.equal((await resolveProviderBooking({ config, scope, event: h.event, store: h.store })).ok, false);
});

test('refund before paid resolves through provider PaymentIntent→Session and original stored booking', async (t) => {
  const h = fixture(t); h.refunds = [refund('re_early', 5000)];
  h.event.type = 'refund.updated'; h.event.data.object = { id: 're_early', metadata: { booking_id: 'book_attacker' } };
  const result = await resolveProviderBooking({ config, scope, event: h.event, store: h.store });
  assert.equal(result.ok, true); assert.equal(result.booking.id, h.booking.id);
  assert.ok(h.requests.some((url) => url.startsWith('/v1/checkout/sessions?payment_intent=')));
});

test('pre-attachment and unrecognized events cannot be discarded or attached using metadata alone', async (t) => {
  const h = fixture(t); h.store.getBookingBySessionId = async () => null;
  h.store.getBookingById = async () => ({ ...h.booking, stripeCheckoutSessionId: '' });
  const unresolved = await resolveProviderBooking({ config, scope, event: h.event, store: h.store });
  assert.equal(unresolved.ok, false); assert.equal(unresolved.retryable, true); assert.equal(unresolved.unresolved, true);
  h.event.type = 'invoice.paid'; const unsupported = await resolveProviderBooking({ config, scope, event: h.event, store: h.store });
  assert.equal(unsupported.ok, false); assert.equal(unsupported.retryable, false);
});


test('a refund callback whose current refund is missing from the list remains retryable', async (t) => {
  const h = fixture(t); h.refunds = [refund('re_just_created', 5000)];
  h.refundPage = () => ({ data: [], has_more: false });
  h.event.type = 'refund.updated'; h.event.data.object = { id: 're_just_created' };
  const result = await h.read(); assert.equal(result.ok, false); assert.equal(result.retryable, true);
  assert.equal(result.reason, 'provider_refund_list_stale');
});

test('a refund changing while pages are read is retried instead of sealing mixed observations', async (t) => {
  const h = fixture(t); h.refundPage = (query) => query.get('starting_after')
    ? { data: [refund('re_one', 5000, 'failed')], has_more: false }
    : { data: [refund('re_one', 5000)], has_more: true };
  const result = await h.read(); assert.equal(result.ok, false); assert.equal(result.retryable, true);
  assert.equal(result.reason, 'provider_refund_changed_during_read');
});

test('aggregate provider read budget bounds a sequence of individually successful calls', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(at) });
  const h = fixture(t); h.respond = () => { t.mock.timers.setTime(Date.now() + 3100); return null; };
  const result = await h.read(); assert.equal(result.ok, false); assert.equal(result.retryable, true);
  assert.equal(result.reason, 'provider_deadline'); assert.ok(h.requests.length <= 4);
});
