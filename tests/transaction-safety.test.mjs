import test from "node:test";
import assert from "node:assert/strict";

import { getBookingStore } from "../functions/api/_lib/storage.js";
import { getBookingConfig } from "../functions/api/_lib/config.js";
import { normalizeCheckoutPayload, onRequest as createCheckout } from "../functions/api/book/create-checkout.js";
import {
  canonicalJson,
  createContactDuplicateFingerprint,
  createRequestFingerprint,
  createStripeIdempotencyKey,
  getIdempotencyDecision,
  hashIdempotencyKey,
  validateIdempotencyKey
} from "../functions/api/_lib/transaction-safety.js";

function resetMemoryStore() {
  delete globalThis.__aissistedBookingStore;
}

test("idempotency key validation rejects missing and malformed keys", () => {
  assert.throws(
    () => validateIdempotencyKey(""),
    /Idempotency-Key header is required/
  );
  assert.throws(
    () => validateIdempotencyKey("too-short"),
    /16 to 200 visible ASCII/
  );
  assert.throws(
    () => validateIdempotencyKey("0123456789abcde\n"),
    /16 to 200 visible ASCII/
  );
  assert.equal(validateIdempotencyKey("0123456789abcdef"), "0123456789abcdef");
});

test("request and duplicate fingerprints are stable across input key order", async () => {
  assert.equal(
    canonicalJson({ b: 2, a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"b":2}'
  );

  const first = await createRequestFingerprint({
    commandId: "submit_contact_inquiry",
    risk: "external_write",
    input: { email: "PJ@example.com", message: "Hi", audience: "other" }
  });
  const second = await createRequestFingerprint({
    risk: "external_write",
    commandId: "submit_contact_inquiry",
    input: { audience: "other", message: "Hi", email: "PJ@example.com" }
  });
  assert.equal(first, second);
  assert.equal(first.length, 64);

  const duplicate = await createContactDuplicateFingerprint({
    email: "PJ@Example.com",
    audience: "Small business workflow",
    message: "  Same   message "
  });
  assert.equal(duplicate.length, 64);
});

test("memory idempotency store supports first request and exact replay storage", async () => {
  resetMemoryStore();
  const store = getBookingStore({});
  const idempotencyKeyHash = await hashIdempotencyKey("0123456789abcdef");
  const requestFingerprint = await createRequestFingerprint({
    commandId: "submit_contact_inquiry",
    risk: "external_write",
    input: { email: "pj@example.com", message: "Hello" }
  });

  const first = await store.startIdempotencyRecord({
    commandId: "submit_contact_inquiry",
    risk: "external_write",
    idempotencyKeyHash,
    requestFingerprint,
    requestSummaryJson: "{}",
    expiresAt: "2026-05-08T00:00:00.000Z"
  });
  const retry = await store.startIdempotencyRecord({
    commandId: "submit_contact_inquiry",
    risk: "external_write",
    idempotencyKeyHash,
    requestFingerprint,
    requestSummaryJson: "{}",
    expiresAt: "2026-05-08T00:00:00.000Z"
  });
  assert.equal(first.id, retry.id);

  const succeeded = await store.markIdempotencySucceeded(first.id, {
    targetType: "contact_inquiry",
    targetId: "inq_test",
    responseStatus: 200,
    responseBodyJson: '{"ok":true,"replayed":false}'
  });
  const target = await store.getIdempotencyRecordByTarget({
    targetType: "contact_inquiry",
    targetId: "inq_test"
  });
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.responseBodyJson, '{"ok":true,"replayed":false}');
  assert.equal(target.id, first.id);
});

test("idempotency decisions distinguish start, in-progress, replay, and conflict", async () => {
  const requestFingerprint = await createRequestFingerprint({
    commandId: "create_booking_checkout",
    risk: "financial",
    input: { slotId: "slot-a" }
  });
  const otherFingerprint = await createRequestFingerprint({
    commandId: "create_booking_checkout",
    risk: "financial",
    input: { slotId: "slot-b" }
  });

  assert.deepEqual(getIdempotencyDecision(null, requestFingerprint), {
    action: "start"
  });
  assert.equal(
    getIdempotencyDecision(
      { status: "started", requestFingerprint },
      requestFingerprint
    ).action,
    "in_progress"
  );
  assert.equal(
    getIdempotencyDecision(
      { status: "succeeded", requestFingerprint, responseStatus: 200, responseBodyJson: '{"ok":true}' },
      requestFingerprint
    ).action,
    "replay"
  );
  assert.equal(
    getIdempotencyDecision(
      { status: "succeeded", requestFingerprint, responseStatus: 200 },
      otherFingerprint
    ).action,
    "conflict"
  );
});

test("audit helper writes append-only memory audit records", async () => {
  resetMemoryStore();
  const store = getBookingStore({});
  const audit = await store.logAgentTransactionAudit({
    commandId: "submit_contact_inquiry",
    risk: "external_write",
    actorType: "agent_assisted",
    idempotencyKeyHash: "hash",
    requestFingerprint: "fingerprint",
    targetType: "contact_inquiry",
    targetId: "inq_test",
    result: "accepted",
    responseStatus: 200,
    safeSummaryJson: "{}"
  });
  const audits = await store.listAgentTransactionAudits();

  assert.match(audit.id, /^audit_/);
  assert.equal(audit.result, "accepted");
  assert.equal(audits.length, 1);
});

test("Stripe idempotency keys are derived and sanitized", async () => {
  const hash = await hashIdempotencyKey("0123456789abcdef");
  const stripeKey = createStripeIdempotencyKey("aic-checkout", hash, "slot 1");

  assert.match(stripeKey, /^aic-checkout-[a-f0-9]{64}-slot-1$/);
});

test("booking attribution upgrade preserves only a complete legacy checkout fingerprint", async (t) => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("No provider dispatch is allowed in this test"); };
  t.after(() => { globalThis.fetch = originalFetch; resetMemoryStore(); });
  const origin = "https://aissistedconsulting.com";
  const env = { STRIPE_SECRET_KEY: "sk_test_synthetic", BOOKING_CHECKOUT_ENABLED: "true",
    ACTIVE_BOOKING_RELEASE: "legacy_v1_2026_04_06", STRIPE_BOOKING_PRICE_ID: "price_legacy_test", PUBLIC_SITE_ORIGIN: origin };
  const config = getBookingConfig(env, origin);
  for (const [entryRoute, ctaId] of [["home", "book_direct"], ["services", "home_hero_paid_plan"]]) {
    for (const status of ["started", "succeeded"]) {
      await t.test(`${entryRoute}/${ctaId} ${status}`, async () => {
        resetMemoryStore();
        const store = getBookingStore(env);
        const key = "checkout-original-legacy-0001";
        const idempotencyKeyHash = await hashIdempotencyKey(key);
        const body = {
          slotId: "synthetic-original-slot", policyAccepted: true, checkoutConsent: true,
          confirmedReservationAmountCents: 22500, confirmedCurrency: "usd", confirmedPolicyVersion: "2026-04-06",
          contact: { name: "Synthetic Owner", email: "synthetic@example.test" },
          intake: { routeId: "custom_development", notes: "Synthetic original notes" },
          sourcePage: "/book/?utm_source=synthetic",
          measurement: { funnelId: "", entryRoute, ctaId }
        };
        const legacyNormalized = normalizeCheckoutPayload(body, config);
        // Retained pre-upgrade contract: these separately allowlisted values
        // were accepted verbatim, even though they are not a valid new pair.
        legacyNormalized.measurement = {
          ...legacyNormalized.measurement, funnelId: `funnel_${idempotencyKeyHash.slice(0, 24)}`, entryRoute, ctaId
        };
        const requestFingerprint = await createRequestFingerprint({ commandId: "create_booking_checkout", risk: "financial", input: legacyNormalized });
        const summary = {
          slotId: legacyNormalized.slotId, email: legacyNormalized.contact.email,
          amountCents: legacyNormalized.confirmedReservationAmountCents, currency: legacyNormalized.confirmedCurrency,
          policyVersion: legacyNormalized.confirmedPolicyVersion, releaseId: legacyNormalized.confirmedReleaseId,
          offerId: legacyNormalized.confirmedOfferId, offerVersion: legacyNormalized.confirmedOfferVersion,
          termsSha256: legacyNormalized.confirmedTermsSha256
        };
        const record = await store.startIdempotencyRecord({ commandId: "create_booking_checkout", risk: "financial", idempotencyKeyHash, requestFingerprint, requestSummaryJson: JSON.stringify(summary) });
        const accepted = { ok: true, bookingId: "booking_original", sessionId: "cs_test_original", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_original" };
        if (status === "succeeded") await store.markIdempotencySucceeded(record.id, { responseStatus: 200, responseBodyJson: JSON.stringify(accepted) });
        const call = async (payload) => {
          const response = await createCheckout({ env, request: new Request(`${origin}/api/book/create-checkout`, {
            method: "POST", headers: { "content-type": "application/json", origin, "idempotency-key": key }, body: JSON.stringify(payload)
          }) });
          return { status: response.status, body: await response.json() };
        };
        const before = await store.getIdempotencyRecord({ commandId: "create_booking_checkout", idempotencyKeyHash });
        const result = await call(body);
        if (status === "succeeded") {
          assert.equal(result.status, 200);
          assert.deepEqual(result.body, { ...accepted, replayed: true });
        } else {
          assert.equal(result.status, 409);
          assert.equal(result.body.code, "in_progress", "same request remains the original pending command, not a conflict or new admission");
        }
        for (const changed of [
          { ...body, slotId: "different-slot" },
          { ...body, contact: { ...body.contact, email: "changed@example.test" } },
          { ...body, intake: { ...body.intake, notes: "Changed notes" } },
          { ...body, sourcePage: "/services/" },
          { ...body, measurement: { ...body.measurement, funnelId: "funnel_changed_12345" } },
          { ...body, measurement: { ...body.measurement, entryRoute: "home", ctaId: "home_footer_paid_plan" } }
        ]) {
          const rejected = await call(changed);
          assert.equal(rejected.status, 409);
          assert.equal(rejected.body.code, "idempotency_conflict");
        }
        const changedAmount = await call({ ...body, confirmedReservationAmountCents: 12500 });
        assert.equal(changedAmount.status, 400);
        assert.equal(changedAmount.body.code, "validation_failed");
        assert.deepEqual(await store.getIdempotencyRecord({ commandId: "create_booking_checkout", idempotencyKeyHash }), before);
        assert.equal(providerCalls, 0, "replay and pending recognition must never dispatch a new Stripe request");
        if (status === "succeeded") {
          for (const requestSummaryJson of [null, "{", "null", "[]", "42", "{}",
            JSON.stringify({ ...summary, measurementNormalizationVersion: 2 }),
            JSON.stringify({ ...summary, measurementNormalizationVersion: "unknown" })]) {
            resetMemoryStore();
            const incompatibleStore = getBookingStore(env);
            const incompatible = await incompatibleStore.startIdempotencyRecord({
              commandId: "create_booking_checkout", risk: "financial", idempotencyKeyHash, requestFingerprint, requestSummaryJson
            });
            await incompatibleStore.markIdempotencySucceeded(incompatible.id, { responseStatus: 200, responseBodyJson: JSON.stringify(accepted) });
            const rejected = await call(body);
            assert.equal(rejected.status, 409, `summary ${requestSummaryJson} must not authorize legacy normalization`);
            assert.equal(rejected.body.code, "idempotency_conflict");
            assert.equal(providerCalls, 0);
          }
        }
      });
    }
  }
});

test("booking attribution new records cannot use legacy rules to replay a changed valid pair", async (t) => {
  resetMemoryStore();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async () => { providerCalls += 1; throw new Error("No provider dispatch is allowed in this test"); };
  t.after(() => { globalThis.fetch = originalFetch; resetMemoryStore(); });
  const origin = "https://aissistedconsulting.com";
  const env = { STRIPE_SECRET_KEY: "sk_test_synthetic", BOOKING_CHECKOUT_ENABLED: "true",
    ACTIVE_BOOKING_RELEASE: "legacy_v1_2026_04_06", STRIPE_BOOKING_PRICE_ID: "price_legacy_test", PUBLIC_SITE_ORIGIN: origin };
  const key = "checkout-current-generic-0001";
  const body = {
    slotId: "synthetic-unavailable-slot", policyAccepted: true, checkoutConsent: true,
    confirmedReservationAmountCents: 22500, confirmedCurrency: "usd", confirmedPolicyVersion: "2026-04-06",
    contact: { name: "Synthetic Owner", email: "synthetic@example.test" },
    intake: { routeId: "custom_development" }, sourcePage: "/book/",
    measurement: { funnelId: "funnel_original_12345", entryRoute: "book", ctaId: "book_direct" },
    measurementNormalizationVersion: 1
  };
  const call = async (payload) => {
    const response = await createCheckout({ env, request: new Request(`${origin}/api/book/create-checkout`, {
      method: "POST", headers: { "content-type": "application/json", origin, "idempotency-key": key }, body: JSON.stringify(payload)
    }) });
    return { status: response.status, body: await response.json() };
  };
  const admitted = await call(body);
  assert.equal(admitted.status, 409);
  assert.equal(admitted.body.code, "slot_unavailable");
  const store = getBookingStore(env);
  const lookup = { commandId: "create_booking_checkout", idempotencyKeyHash: await hashIdempotencyKey(key) };
  const record = await store.getIdempotencyRecord(lookup);
  assert.equal(JSON.parse(record.requestSummaryJson).measurementNormalizationVersion, 2, "version is server-owned and persisted on new admission");
  const accepted = { ok: true, bookingId: "booking_original", sessionId: "cs_test_original", checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_original" };
  await store.markIdempotencySucceeded(record.id, { responseStatus: 200, responseBodyJson: JSON.stringify(accepted) });
  const unchanged = await call(body);
  assert.equal(unchanged.status, 200);
  assert.deepEqual(unchanged.body, { ...accepted, replayed: true });
  const changed = await call({ ...body, measurement: { ...body.measurement, entryRoute: "contact", ctaId: "contact_aside_paid_plan" } });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.code, "idempotency_conflict");
  const generic = await call({ ...body, measurement: { ...body.measurement, entryRoute: "unknown", ctaId: "unknown" } });
  assert.equal(generic.status, 200, "genuinely invalid labels retain the same normalized generic pair");
  assert.deepEqual(generic.body, { ...accepted, replayed: true });
  assert.equal(providerCalls, 0);
});
