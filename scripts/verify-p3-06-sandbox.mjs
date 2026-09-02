import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";

import { getBookingConfig } from "../functions/api/_lib/config.js";
import { getTermsSnapshotForRelease } from "../functions/api/_lib/booking-terms.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";
import { onRequest as receiveStripeWebhook } from "../functions/api/book/webhook.js";
import { onRequest as readBookingStatus } from "../functions/api/book/status.js";

const API_VERSION = "2026-06-24.dahlia";
const RELEASE_ID = "aissisted_booking_v2_2026_08_15";
const PRODUCT_ID = "prod_V52nwNYF46RY5U";
const PRICE_ID = "price_1U4shaP3Zy09i3ccRusbjik5";
const PAYMENT_METHOD_CONFIGURATION_ID = "pmc_1U4skSP3Zy09i3cc4vMQTswL";
const SESSION_ID = process.argv[2];

if (!/^cs_test_[A-Za-z0-9]+$/.test(SESSION_ID || "")) {
  throw new Error("Pass exactly one Stripe Sandbox Checkout Session ID.");
}

function runStripe(args) {
  const result = spawnSync("stripe", [...args, "--stripe-version", API_VERSION], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Stripe CLI failed: ${args.join(" ")}`);
  }
  return JSON.parse(result.stdout);
}

function metadataArgs(metadata) {
  return Object.entries(metadata).flatMap(([key, value]) => ["-d", `metadata[${key}]=${value}`]);
}

const initialSession = runStripe([
  "checkout",
  "sessions",
  "retrieve",
  SESSION_ID,
  "-e",
  "payment_intent",
  "-e",
  "line_items.data.price.product"
]);

assert.equal(initialSession.livemode, false);
assert.equal(initialSession.status, "complete");
assert.equal(initialSession.payment_status, "paid");
assert.equal(initialSession.amount_total, 22500);
assert.equal(initialSession.currency, "usd");
assert.equal(initialSession.line_items.data[0].price.id, PRICE_ID);
assert.equal(initialSession.line_items.data[0].price.product.id, PRODUCT_ID);
assert.deepEqual(initialSession.payment_method_types, ["card"]);

const isolatedEnv = {
  BOOKING_CHECKOUT_ENABLED: "true",
  ACTIVE_BOOKING_RELEASE: RELEASE_ID,
  BOOKING_V2_STRIPE_PRODUCT_ID: PRODUCT_ID,
  BOOKING_V2_STRIPE_PRICE_ID: PRICE_ID,
  BOOKING_V2_PAYMENT_METHOD_CONFIGURATION_ID: PAYMENT_METHOD_CONFIGURATION_ID,
  STRIPE_SECRET_KEY: "sk_test_isolated_harness_not_a_provider_key",
  STRIPE_WEBHOOK_SECRET: "whsec_isolated_p3_06_signature_test",
  STRIPE_EXPECTED_LIVEMODE: "false",
  BOOKING_CREATE_GOOGLE_CALENDAR_EVENT: "false",
  PUBLIC_SITE_ORIGIN: "https://aissistedconsulting.com"
};

const config = getBookingConfig(isolatedEnv, isolatedEnv.PUBLIC_SITE_ORIGIN);
const release = config.activeRelease;
const store = getBookingStore(isolatedEnv);
const createdAt = new Date().toISOString();
const prospect = await store.upsertProspect({
  name: "AIssisted E3 Isolated Test",
  email: `p3-06-${Date.now()}@example.com`
});
const booking = await store.createBookingHold({
  prospectId: prospect.id,
  slotId: `slot_p3_06_${Date.now()}`,
  selectedTimeWindowStart: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  selectedTimeWindowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
  selectedTimeZone: "America/New_York",
  reservationAmount: release.amountCents,
  currency: release.currency,
  temporaryHoldExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  createdAt,
  policyVersion: release.termsVersion,
  policyAcceptedAt: createdAt,
  contractInput: {
    release,
    acceptedAt: createdAt,
    termsSnapshot: getTermsSnapshotForRelease(release.releaseId)
  },
  stripeCheckoutIdempotencyKey: `p3_06_${SESSION_ID}`
});

const metadata = {
  booking_id: booking.id,
  offer_id: release.offerId,
  offer_version: String(release.offerVersion),
  release_id: release.releaseId,
  terms_sha256: release.termsSha256,
  terms_version: release.termsVersion
};

runStripe([
  "checkout",
  "sessions",
  "update",
  SESSION_ID,
  "--confirm",
  ...metadataArgs(metadata)
]);

const paymentIntentId = typeof initialSession.payment_intent === "string"
  ? initialSession.payment_intent
  : initialSession.payment_intent.id;
runStripe([
  "payment_intents",
  "update",
  paymentIntentId,
  "--confirm",
  ...metadataArgs(metadata)
]);

await store.attachCheckoutSession(booking.id, { sessionId: SESSION_ID });

const providerSession = runStripe([
  "checkout",
  "sessions",
  "retrieve",
  SESSION_ID,
  "-e",
  "payment_intent",
  "-e",
  "line_items.data.price.product"
]);
const webhookSession = {
  ...providerSession,
  payment_intent: paymentIntentId
};
const event = {
  id: `evt_test_p3_06_${Date.now()}`,
  object: "event",
  livemode: false,
  type: "checkout.session.completed",
  data: { object: webhookSession }
};
const payload = JSON.stringify(event);
const timestamp = Math.floor(Date.now() / 1000);
const signature = createHmac("sha256", isolatedEnv.STRIPE_WEBHOOK_SECRET)
  .update(`${timestamp}.${payload}`)
  .digest("hex");

const originalFetch = global.fetch;
global.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target.includes(`/v1/checkout/sessions/${SESSION_ID}`) && (options.method || "GET") === "GET") {
    return Response.json(providerSession);
  }
  throw new Error(`external_effect_blocked:${new URL(target).hostname}`);
};

let webhookResponse;
try {
  webhookResponse = await receiveStripeWebhook({
    request: new Request(`${isolatedEnv.PUBLIC_SITE_ORIGIN}/api/book/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`
      },
      body: payload
    }),
    env: isolatedEnv
  });
} finally {
  global.fetch = originalFetch;
}

const webhookResult = await webhookResponse.json();
assert.equal(webhookResponse.status, 200);
assert.equal(webhookResult.ok, true);
assert.equal(webhookResult.confirmationState, "confirmed");

const storedBooking = await store.getBookingById(booking.id);
const storedContract = await store.getBookingContract(booking.id);
const deliverable = await store.getBookingDeliverable(booking.id);
const contractEvents = await store.listBookingContractEvents(booking.id);
const remainingOutbox = await store.listBookingOutbox(booking.id);
assert.equal(storedBooking.bookingStatus, "confirmed");
assert.equal(storedBooking.paymentStatus, "paid");
assert.equal(storedBooking.depositCreditAvailable, false);
assert.equal(storedBooking.depositCreditAmount, 0);
assert.equal(storedContract.implementationCreditEnabled, false);
assert.equal(storedContract.stripeCheckoutSessionId, undefined);
assert.equal(deliverable.status, "awaiting_session");
assert.equal(contractEvents.some((item) => item.eventType === "contract_validated"), true);
assert.equal(remainingOutbox.length, 0);

const statusResponse = await readBookingStatus({
  request: new Request(`${isolatedEnv.PUBLIC_SITE_ORIGIN}/api/book/status?session_id=${SESSION_ID}`),
  env: isolatedEnv
});
const statusPayload = await statusResponse.json();
assert.equal(statusResponse.status, 200);
assert.equal(statusPayload.booking.paymentStatus, "paid");
assert.equal("depositCredit" in statusPayload.booking, false);
assert.equal(statusPayload.booking.delivery.status, "awaiting_session");

const paymentIntent = runStripe(["payment_intents", "retrieve", paymentIntentId]);
assert.equal(paymentIntent.livemode, false);
assert.equal(paymentIntent.status, "succeeded");
assert.equal(paymentIntent.amount_received, 22500);
assert.deepEqual(paymentIntent.metadata, metadata);

process.stdout.write(JSON.stringify({
  generatedAt: new Date().toISOString(),
  scope: "Stripe Sandbox plus isolated in-memory booking store",
  provider: {
    livemode: providerSession.livemode,
    sessionStatus: providerSession.status,
    paymentStatus: providerSession.payment_status,
    amountTotal: providerSession.amount_total,
    currency: providerSession.currency,
    productId: providerSession.line_items.data[0].price.product.id,
    priceId: providerSession.line_items.data[0].price.id,
    paymentMethodTypes: providerSession.payment_method_types,
    paymentIntentStatus: paymentIntent.status,
    receiptUrlPresent: Boolean(paymentIntent.latest_charge)
  },
  webhook: {
    signatureVerified: true,
    responseStatus: webhookResponse.status,
    confirmationState: webhookResult.confirmationState,
    wholeContractMetadataMatched: true
  },
  booking: {
    bookingStatus: storedBooking.bookingStatus,
    paymentStatus: storedBooking.paymentStatus,
    releaseId: storedBooking.releaseId,
    offerVersion: storedBooking.offerVersion,
    termsVersion: storedBooking.termsVersion,
    termsSha256: storedBooking.termsSha256,
    deliverableStatus: deliverable.status,
    implementationCreditEnabled: storedContract.implementationCreditEnabled,
    depositCreditAvailable: storedBooking.depositCreditAvailable,
    depositCreditAmount: storedBooking.depositCreditAmount,
    pendingOutboxCount: remainingOutbox.length,
    contractEventTypes: contractEvents.map((item) => item.eventType)
  },
  isolation: {
    database: "ephemeral in-memory test store",
    calendar: "disabled",
    notifications: "sink/no provider configuration",
    liveStripeMutation: false,
    productionDatabaseMutation: false,
    customerContact: false
  }
}, null, 2));
