import test from "node:test";
import assert from "node:assert/strict";

import { onRequest } from "../functions/api/book/webhook.js";

const ORIGIN = "https://aissistedconsulting.com";
const WEBHOOK_SECRET = "whsec_test_local";

function resetMemoryStore() {
  delete globalThis.__aissistedBookingStore;
}

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function callWebhook(event, envOverrides = {}) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(WEBHOOK_SECRET, `${timestamp}.${body}`);
  const response = await onRequest({
    request: new Request(`${ORIGIN}/api/book/webhook`, {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body
    }),
    env: {
      STRIPE_SECRET_KEY: "sk_test_local",
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      PUBLIC_SITE_ORIGIN: ORIGIN,
      ...envOverrides
    }
  });
  return { response, payload: await response.json() };
}

function completedCheckout(overrides = {}) {
  return {
    id: "evt_test_grail_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_grail_checkout",
        payment_status: "paid",
        payment_link: "plink_1TnH36P3Zy09i3ccRpajeOKT",
        customer_details: {
          name: "Test Owner",
          email: "owner@example.com"
        },
        metadata: { company: "Test Services" },
        ...overrides
      }
    }
  };
}

test("Grail Payment Link checkout creates an operational customer signal", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  let crmPayload = null;
  global.fetch = async (_url, options = {}) => {
    crmPayload = JSON.parse(String(options.body || "{}"));
    return Response.json({ ok: true, submission: { id: "intake_test" } });
  };

  try {
    const result = await callWebhook(completedCheckout(), {
      AIC_CRM_INTAKE_URL: "https://aiccrm.aissistedconsulting.com/intake/website",
      AIC_CRM_INTAKE_TOKEN: "test-token"
    });
    const signal = globalThis.__aissistedBookingStore.events.find(
      (event) => event.eventType === "stripe.grail_payment_link.customer_signal"
    );
    const signalPayload = JSON.parse(signal.payloadJson);

    assert.equal(result.response.status, 200);
    assert.equal(result.payload.grailCustomerSignal, true);
    assert.equal(result.payload.deliveryStatus, "crm_relay_delivered");
    assert.match(result.payload.inquiryId, /^inq_/);
    assert.equal(crmPayload.inquiryType, "grail_paid_customer");
    assert.equal(crmPayload.sourceChannel, "stripe_payment_link");
    assert.equal(crmPayload.formName, "grail-payment-link");
    assert.equal(signalPayload.plan, "local_agent");
    assert.equal(signalPayload.paymentLinkId, "plink_1TnH36P3Zy09i3ccRpajeOKT");
  } finally {
    global.fetch = originalFetch;
  }
});

test("all approved Grail plans are recognized while other links stay ignored", async () => {
  resetMemoryStore();
  const growth = await callWebhook(completedCheckout({
    id: "cs_test_grail_growth",
    payment_link: "plink_1TnH37P3Zy09i3ccsUxHzWZD"
  }));
  assert.equal(growth.payload.grailCustomerSignal, true);
  assert.equal(growth.payload.deliveryStatus, "local_record_only");

  resetMemoryStore();
  const premium = await callWebhook(completedCheckout({
    id: "cs_test_grail_premium",
    payment_link: "plink_1TuZOKP3Zy09i3ccKKJklwAy"
  }));
  const premiumSignal = globalThis.__aissistedBookingStore.events.find(
    (event) => event.eventType === "stripe.grail_payment_link.customer_signal"
  );
  const premiumSignalPayload = JSON.parse(premiumSignal.payloadJson);
  assert.equal(premium.payload.grailCustomerSignal, true);
  assert.equal(premium.payload.deliveryStatus, "local_record_only");
  assert.equal(premiumSignalPayload.plan, "premium");
  assert.equal(premiumSignalPayload.paymentLinkId, "plink_1TuZOKP3Zy09i3ccKKJklwAy");

  resetMemoryStore();
  const other = await callWebhook(completedCheckout({
    id: "cs_test_other_checkout",
    payment_link: "plink_other_product",
    metadata: {}
  }));
  assert.equal(other.payload.ignored, true);
  assert.equal(other.payload.grailCustomerSignal, undefined);
});
