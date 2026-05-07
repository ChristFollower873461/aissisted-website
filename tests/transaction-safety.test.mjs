import test from "node:test";
import assert from "node:assert/strict";

import { getBookingStore } from "../functions/api/_lib/storage.js";
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
