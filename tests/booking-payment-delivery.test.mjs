import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bookingPaymentEnabled, bookingPaymentScope, buildBookingStartEvent, deliverBookingEvent } from '../functions/api/_lib/booking-payment-reconciliation.js';
import { canonicalBookingJson, verifyBookingEvent } from '../functions/api/_lib/booking-events.js';

const event = JSON.parse(fs.readFileSync(new URL('./fixtures/booking-event-v1.json', import.meta.url)));
const env = { BOOKING_DB: {}, AIC_CRM_BOOKING_EVENTS_ENABLED: 'true',
  AIC_CRM_BOOKING_EVENTS_SOURCE_ENVIRONMENT: 'staging', AIC_CRM_BOOKING_EVENTS_PROVIDER_ACCOUNT_ID: 'acct_synthetic',
  AIC_CRM_BOOKING_EVENTS_URL: 'https://crm.example.test/intake/website/booking-events', AIC_CRM_BOOKING_EVENTS_TOKEN: 'synthetic-only' };
const config = { stripeExpectedLivemode: false };
const ack = { ok: true, eventId: event.eventId, payloadHash: event.payloadHash,
  bookingId: event.bookingId, acceptedRevision: event.bookingRevision, submissionId: 'synthetic_intake' };

test('receiver-produced immutable protocol vector verifies with sender code', async () => {
  assert.equal((await verifyBookingEvent(event)).payloadHash, 'c1daa521331fd7b4a802046d58569ead96e8955b369d3d5bb04149bc1d6d21f4');
  await assert.rejects(verifyBookingEvent({ ...event, bookingRevision: 2 }), /payload_hash_mismatch/);
});

test('checkout-start event preserves original consent and attribution without claiming payment', async () => {
  const built = await buildBookingStartEvent({ scope: bookingPaymentScope(env, config), booking: { id: event.bookingId },
    contract: event.contract, session: { id: event.checkoutSessionId, livemode: false, status: 'open', created: 1788624000 },
    intake: event.intake, at: event.observedAt });
  assert.deepEqual(built, event);
  assert.equal(built.snapshot.paymentStatus, 'unpaid');
  assert.equal(built.intake.qualifiedSourceEventId, `website-booking-${event.bookingId}`);
});

test('feature stays disabled until explicitly configured; malformed flags fail closed', () => {
  assert.equal(bookingPaymentEnabled({}), false);
  assert.equal(bookingPaymentEnabled({ AIC_CRM_BOOKING_EVENTS_ENABLED: 'false' }), false);
  for (const value of ['TRUE', '', true, 1]) assert.throws(() => bookingPaymentEnabled({ AIC_CRM_BOOKING_EVENTS_ENABLED: value }));
});

test('new machine authority cannot silently use old intake URL, secret, or ambiguous scope', () => {
  assert.deepEqual(bookingPaymentScope(env, config), { sourceEnvironment: 'staging', providerAccountId: 'acct_synthetic', livemode: false });
  for (const changes of [
    { BOOKING_DB: null }, { AIC_CRM_BOOKING_EVENTS_TOKEN: '' },
    { AIC_CRM_BOOKING_EVENTS_SOURCE_ENVIRONMENT: '' }, { AIC_CRM_BOOKING_EVENTS_PROVIDER_ACCOUNT_ID: '' },
    { AIC_CRM_BOOKING_EVENTS_URL: 'http://crm.example.test/intake/website/booking-events' },
    { AIC_CRM_BOOKING_EVENTS_URL: 'https://crm.example.test/intake/website' },
    { AIC_CRM_BOOKING_EVENTS_URL: 'https://name:password@crm.example.test/intake/website/booking-events' },
    { AIC_CRM_BOOKING_EVENTS_URL: 'https://crm.example.test/intake/website/booking-events?route=alternate' }
  ]) assert.throws(() => bookingPaymentScope({ ...env, ...changes }, config));
  assert.throws(() => bookingPaymentScope(env, {}));
});

test('delivery uses only exact machine URL, rejects redirects, and sends the immutable payload', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, env.AIC_CRM_BOOKING_EVENTS_URL);
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.authorization, 'Bearer synthetic-only');
    assert.equal(init.body, canonicalBookingJson(event));
    return Response.json(ack);
  });
  assert.equal((await deliverBookingEvent({ env, event })).ok, true);
});

for (const [field, value] of [['ok', false], ['eventId', 'another-event'], ['payloadHash', '0'.repeat(64)],
  ['bookingId', 'another-booking'], ['acceptedRevision', 999]]) {
  test(`a 200 response with mismatched ${field} does not acknowledge delivery`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ ...ack, [field]: value }));
    const result = await deliverBookingEvent({ env, event });
    assert.equal(result.ok, false); assert.equal(result.reason, 'receiver_ack_mismatch');
  });
}

test('explicit immutable event conflict requires attention while provider outages remain retryable', async (t) => {
  let status = 409;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false }, { status }));
  assert.equal((await deliverBookingEvent({ env, event })).retryable, false);
  status = 503;
  assert.equal((await deliverBookingEvent({ env, event })).retryable, true);
});

test('delivery deadline includes response body consumption', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => ({ status: 200,
    json: () => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('synthetic body stalled')), { once: true });
    }) }));
  const result = await deliverBookingEvent({ env, event, timeoutMs: 5 });
  assert.equal(result.ok, false); assert.equal(result.reason, 'receiver_unavailable');
});


test('a redirect response cannot acknowledge delivery or forward the machine token', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
    return Response.json(ack, { status: 302, headers: { location: 'https://elsewhere.example.test/' } });
  });
  assert.equal((await deliverBookingEvent({ env, event })).ok, false);
  assert.equal(calls, 1);
});
