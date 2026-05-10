import test from "node:test";
import assert from "node:assert/strict";

import { listAvailableSlots } from "../functions/api/_lib/availability.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";
import { onRequest } from "../functions/api/book/create-checkout.js";

const ORIGIN = "https://aissistedconsulting.com";

function resetMemoryStore() {
  delete globalThis.__aissistedBookingStore;
}

function testEnv(overrides = {}) {
  return {
    STRIPE_SECRET_KEY: "sk_test_local",
    PUBLIC_SITE_ORIGIN: ORIGIN,
    ...overrides
  };
}

async function firstAvailableSlot(env) {
  const store = getBookingStore(env);
  const slots = await listAvailableSlots({
    env,
    origin: ORIGIN,
    store,
    days: 7
  });
  assert.ok(slots.length > 0);
  return slots[0];
}

function validCheckoutPayload(slotId, overrides = {}) {
  return {
    slotId,
    websiteLeaveBlank: "",
    policyAccepted: true,
    checkoutConsent: true,
    confirmedReservationAmountCents: 22500,
    confirmedCurrency: "usd",
    confirmedPolicyVersion: "2026-04-06",
    contact: {
      name: "Pat Owner",
      email: "pat@example.com",
      phone: "352-555-0199",
      company: "Pat's Services"
    },
    intake: {
      companyWebsite: "https://example.com",
      industry: "Home services",
      primaryGoal: "Follow up with missed calls",
      notes: "Need a practical workflow."
    },
    ...overrides
  };
}

function createCheckoutRequest(body, key = "checkout-test-key-0001") {
  return new Request(`${ORIGIN}/api/book/create-checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      "idempotency-key": key
    },
    body: JSON.stringify(body)
  });
}

async function callCheckout({ env, body, key }) {
  const response = await onRequest({
    request: createCheckoutRequest(body, key),
    env
  });
  const payload = await response.json();
  return { response, payload };
}

function installStripeMock() {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || "POST",
      headers: options.headers || {},
      body: String(options.body || "")
    });

    if (String(url).endsWith("/customers")) {
      return Response.json({ id: "cus_test_local" });
    }

    if (String(url).endsWith("/checkout/sessions")) {
      return Response.json({
        id: "cs_test_local",
        url: "https://checkout.stripe.com/c/pay/cs_test_local",
        customer: "cus_test_local",
        expires_at: Math.floor(Date.now() / 1000) + 1800
      });
    }

    return Response.json({ error: { message: "Unexpected Stripe path" } }, { status: 404 });
  };

  return {
    calls,
    restore() {
      global.fetch = originalFetch;
    }
  };
}

test("booking checkout requires idempotency and financial confirmation", async () => {
  resetMemoryStore();
  const env = testEnv();
  const slot = await firstAvailableSlot(env);
  const stripe = installStripeMock();

  try {
    const missingKey = await onRequest({
      request: new Request(`${ORIGIN}/api/book/create-checkout`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN
        },
        body: JSON.stringify(validCheckoutPayload(slot.slotId))
      }),
      env
    });
    const missingConsent = await callCheckout({
      env,
      key: "checkout-missing-consent-01",
      body: validCheckoutPayload(slot.slotId, { checkoutConsent: false })
    });
    const wrongAmount = await callCheckout({
      env,
      key: "checkout-wrong-amount-001",
      body: validCheckoutPayload(slot.slotId, { confirmedReservationAmountCents: 22400 })
    });
    const wrongPolicy = await callCheckout({
      env,
      key: "checkout-wrong-policy-001",
      body: validCheckoutPayload(slot.slotId, { confirmedPolicyVersion: "old" })
    });
    const missingKeyPayload = await missingKey.json();

    assert.equal(missingKey.status, 400);
    assert.equal(missingKeyPayload.code, "missing_idempotency_key");
    assert.equal(missingConsent.response.status, 400);
    assert.equal(wrongAmount.response.status, 400);
    assert.equal(wrongPolicy.response.status, 400);
    assert.equal(stripe.calls.length, 0);
  } finally {
    stripe.restore();
  }
});

test("booking checkout creates audited replay-safe Stripe checkout", async () => {
  resetMemoryStore();
  const env = testEnv();
  const slot = await firstAvailableSlot(env);
  const stripe = installStripeMock();
  const key = "checkout-replay-key-0001";

  try {
    const first = await callCheckout({
      env,
      key,
      body: validCheckoutPayload(slot.slotId)
    });
    const second = await callCheckout({
      env,
      key,
      body: validCheckoutPayload(slot.slotId)
    });
    const store = getBookingStore(env);
    const booking = await store.getBookingById(first.payload.bookingId);
    const audits = await store.listAgentTransactionAudits();

    assert.equal(first.response.status, 200);
    assert.equal(first.payload.ok, true);
    assert.equal(second.response.status, 200);
    assert.equal(second.payload.replayed, true);
    assert.equal(second.payload.bookingId, first.payload.bookingId);
    assert.equal(second.payload.sessionId, first.payload.sessionId);
    assert.equal(booking.checkoutIdempotencyRecordId.startsWith("idem_"), true);
    assert.equal(audits.some((audit) => audit.result === "accepted"), true);
    assert.equal(audits.some((audit) => audit.result === "replayed"), true);
    assert.equal(stripe.calls.length, 2);
    assert.equal(stripe.calls[0].headers["idempotency-key"].startsWith("aic-customer-"), true);
    assert.equal(stripe.calls[1].headers["idempotency-key"].startsWith("aic-checkout-"), true);
  } finally {
    stripe.restore();
  }
});

test("booking checkout rejects conflicting retries and unavailable duplicate slots", async () => {
  resetMemoryStore();
  const env = testEnv();
  const slot = await firstAvailableSlot(env);
  const stripe = installStripeMock();

  try {
    const first = await callCheckout({
      env,
      key: "checkout-conflict-key-01",
      body: validCheckoutPayload(slot.slotId)
    });
    const conflict = await callCheckout({
      env,
      key: "checkout-conflict-key-01",
      body: validCheckoutPayload(slot.slotId, {
        intake: {
          ...validCheckoutPayload(slot.slotId).intake,
          notes: "Different checkout request."
        }
      })
    });
    const duplicateSlot = await callCheckout({
      env,
      key: "checkout-duplicate-slot-01",
      body: validCheckoutPayload(slot.slotId, {
        contact: {
          name: "Second Owner",
          email: "second@example.com",
          phone: "",
          company: "Second Co"
        }
      })
    });
    const store = getBookingStore(env);
    const audits = await store.listAgentTransactionAudits();

    assert.equal(first.response.status, 200);
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.payload.code, "idempotency_conflict");
    assert.equal(duplicateSlot.response.status, 409);
    assert.equal(duplicateSlot.payload.code, "slot_unavailable");
    assert.equal(audits.some((audit) => audit.result === "conflict"), true);
    assert.equal(audits.some((audit) => audit.errorCode === "slot_unavailable"), true);
  } finally {
    stripe.restore();
  }
});
