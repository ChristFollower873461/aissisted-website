import test from "node:test";
import assert from "node:assert/strict";

import { onRequest } from "../functions/api/grail/checkout-status.js";

const ORIGIN = "https://aissistedconsulting.com";
const SESSION_ID = "cs_test_grailcheckout123";

async function callStatus(sessionId = SESSION_ID, envOverrides = {}) {
  const response = await onRequest({
    request: new Request(
      `${ORIGIN}/api/grail/checkout-status?session_id=${encodeURIComponent(sessionId)}`
    ),
    env: {
      STRIPE_SECRET_KEY: "sk_test_local",
      PUBLIC_SITE_ORIGIN: ORIGIN,
      ...envOverrides
    }
  });

  return { response, payload: await response.json() };
}

function installStripeMock(overrides = {}) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({
      id: SESSION_ID,
      status: "complete",
      payment_status: "paid",
      payment_link: "plink_1TnH36P3Zy09i3ccRpajeOKT",
      amount_total: 12900,
      currency: "usd",
      customer_details: {
        email: "must-not-leak@example.com"
      },
      ...overrides
    });
  };

  return {
    calls,
    restore() {
      global.fetch = originalFetch;
    }
  };
}

test("Grail checkout status only returns safe fields for a paid approved plan", async () => {
  const stripe = installStripeMock();
  try {
    const result = await callStatus();

    assert.equal(result.response.status, 200);
    assert.deepEqual(result.payload, {
      ok: true,
      checkout: {
        verified: true,
        plan: "local_agent",
        planName: "Grail Local Agent",
        currency: "USD",
        value: 129,
        amountCents: 12900
      }
    });
    assert.equal(JSON.stringify(result.payload).includes("must-not-leak"), false);
    assert.equal(stripe.calls.length, 1);
    assert.match(stripe.calls[0].url, /\/v1\/checkout\/sessions\/cs_test_grailcheckout123$/);
    assert.equal(stripe.calls[0].options.method, "GET");
  } finally {
    stripe.restore();
  }
});

test("Grail checkout status rejects direct, unpaid, and unrelated sessions", async () => {
  const invalid = await callStatus("not-a-checkout-session");
  assert.equal(invalid.response.status, 400);

  const unconfigured = await callStatus(SESSION_ID, { STRIPE_SECRET_KEY: "" });
  assert.equal(unconfigured.response.status, 503);

  const unpaidStripe = installStripeMock({ payment_status: "unpaid" });
  try {
    const unpaid = await callStatus();
    assert.equal(unpaid.response.status, 404);
    assert.equal(unpaid.payload.checkout, undefined);
  } finally {
    unpaidStripe.restore();
  }

  const unrelatedStripe = installStripeMock({ payment_link: "plink_other_product" });
  try {
    const unrelated = await callStatus();
    assert.equal(unrelated.response.status, 404);
    assert.equal(unrelated.payload.checkout, undefined);
  } finally {
    unrelatedStripe.restore();
  }
});
