import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { onRequest } from "../functions/api/book/webhook.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";
import {
  createContactDuplicateFingerprint,
  sha256Hex
} from "../functions/api/_lib/transaction-safety.js";
import { createTestD1 } from "./helpers/d1-sqlite.mjs";

const ORIGIN = "https://aissistedconsulting.com";
const WEBHOOK_SECRET = "whsec_workspace_integration_test";
const bookingMigration = fileURLToPath(
  new URL("../migrations/0001_booking_schema.sql", import.meta.url)
);
const workspaceMigration = fileURLToPath(
  new URL("../migrations/0003_grail_workspaces.sql", import.meta.url)
);

async function hmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function callWebhook(event, env) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacHex(WEBHOOK_SECRET, `${timestamp}.${body}`);
  const response = await onRequest({
    request: new Request(`${ORIGIN}/api/book/webhook`, {
      method: "POST",
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
      body
    }),
    env
  });
  return { response, payload: await response.json() };
}

test("signed recurring checkout links the Fit Check, provisions access, and honors cancellation", async () => {
  const d1 = createTestD1(bookingMigration, workspaceMigration);
  const env = {
    BOOKING_DB: d1.binding,
    STRIPE_SECRET_KEY: "sk_test_workspace_integration",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    PUBLIC_SITE_ORIGIN: ORIGIN,
    GRAIL_WORKSPACE_SIGNING_SECRET:
      "workspace-integration-signing-secret-with-entropy",
    GRAIL_EMAIL_PROVIDER: "resend",
    GRAIL_EMAIL_API_KEY: "re_workspace_integration",
    GRAIL_EMAIL_FROM: "Grail <hello@aissistedconsulting.com>"
  };
  const store = getBookingStore(env);
  const fitCheckContact = {
    name: "Pat Owner",
    email: "pat@example.com",
    emailNormalized: "pat@example.com",
    phone: "",
    company: "Linked Fit Check Co",
    audience: "other",
    audienceNormalized: "other",
    message: "Structured Fit Check summary",
    sourcePage: "/grail-ios-app/fit-check",
    consentToSubmit: true
  };
  const fitCheckIdempotency = await store.startIdempotencyRecord({
    commandId: "contact.submit",
    risk: "external_low_impact",
    idempotencyKeyHash: await sha256Hex("fit-check-idempotency"),
    requestFingerprint: await sha256Hex("fit-check-request"),
    createdAt: new Date().toISOString()
  });
  const fitCheck = await store.createContactInquiry({
    ...fitCheckContact,
    messageHash: await sha256Hex(fitCheckContact.message),
    duplicateFingerprint: await createContactDuplicateFingerprint(fitCheckContact),
    consentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: "received",
    deliveryStatus: "local_record_only",
    idempotencyRecordId: fitCheckIdempotency.id
  });
  const emailRequests = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("api.resend.com/emails")) {
      emailRequests.push({
        ...JSON.parse(String(options.body || "{}")),
        idempotencyKey: options.headers?.["idempotency-key"] || ""
      });
      return Response.json({ id: "email_workspace_access_test" });
    }
    return Response.json({ ok: true });
  };

  const checkoutEvent = {
    id: "evt_workspace_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_workspace_checkout",
        payment_status: "paid",
        amount_total: 12900,
        currency: "usd",
        payment_link: "plink_1TnH36P3Zy09i3ccRpajeOKT",
        customer: "cus_workspace_checkout",
        subscription: "sub_workspace_checkout",
        client_reference_id: fitCheck.id,
        customer_details: { name: "Pat Owner", email: "pat@example.com" },
        metadata: { company: "Unlinked fallback company" }
      }
    }
  };

  try {
    const checkout = await callWebhook(checkoutEvent, env);
    const replay = await callWebhook(checkoutEvent, env);
    const stored = d1.database.prepare("SELECT * FROM grail_workspaces").get();
    const workspaceState = JSON.parse(stored.state_json);
    const accessEmail = emailRequests.find((message) =>
      String(message.text).includes("private workspace code")
    );
    const accessCode = String(accessEmail.text).match(/grl_[A-Za-z0-9_-]+/)[0];

    assert.equal(checkout.response.status, 200);
    assert.equal(checkout.payload.workspaceProvisioned, true);
    assert.equal(replay.payload.workspaceProvisioned, true);
    assert.equal(workspaceState.customer, "Linked Fit Check Co");
    assert.deepEqual(accessEmail.to, ["pat@example.com"]);
    assert.equal(JSON.stringify(stored).includes(accessCode), false);
    assert.equal(
      d1.database.prepare("SELECT COUNT(*) AS count FROM grail_workspaces").get().count,
      1
    );
    assert.equal(
      d1.database
        .prepare(
          "SELECT COUNT(*) AS count FROM agent_idempotency_records WHERE command_id = 'stripe.grail_payment_link.checkout'"
        )
        .get().count,
      1
    );
    assert.equal(emailRequests[0].idempotencyKey, emailRequests[1].idempotencyKey);

    const canceled = await callWebhook(
      {
        id: "evt_workspace_canceled",
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_workspace_checkout", status: "canceled" } }
      },
      env
    );
    const canceledRow = d1.database
      .prepare("SELECT status, state_json FROM grail_workspaces")
      .get();

    assert.equal(canceled.response.status, 200);
    assert.equal(canceled.payload.workspaceStatus, "canceled");
    assert.equal(canceledRow.status, "canceled");
    assert.equal(JSON.parse(canceledRow.state_json).subscription_status, "canceled");

    const restored = await callWebhook(
      {
        id: "evt_workspace_restored",
        type: "invoice.paid",
        data: {
          object: {
            parent: {
              subscription_details: { subscription: "sub_workspace_checkout" }
            }
          }
        }
      },
      env
    );
    assert.equal(restored.payload.workspaceStatus, "active");
  } finally {
    global.fetch = originalFetch;
    d1.close();
  }
});
