import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  BOOKING_RELEASES,
  buildStripeContractMetadata,
  contractMatchesRelease,
  resolveBookingControls,
  resolveFitCallControls,
  shouldCreateImplementationCredit
} from "../functions/api/_lib/booking-releases.js";
import {
  createBookingContractSnapshot,
  validateCheckoutSessionAgainstContract
} from "../functions/api/_lib/booking-contract.js";
import { getBookingConfig } from "../functions/api/_lib/config.js";
import { getTermsSnapshotForRelease } from "../functions/api/_lib/booking-terms.js";
import { normalizeCheckoutPayload } from "../functions/api/book/create-checkout.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";
import { applyFulfillmentAction } from "../functions/api/_lib/booking-fulfillment.js";
import { drainBookingOutbox } from "../functions/api/_lib/booking-outbox.js";
import {
  sendBookingNotifications,
  sendManualReviewNotification
} from "../functions/api/_lib/notifications.js";
import { createCheckoutSession } from "../functions/api/_lib/stripe.js";
import { onRequest as manageBooking } from "../functions/api/book/manage.js";
import { onRequest as manageOpenCheckouts } from "../functions/api/book/checkout-rollback.js";
import { onRequest as requestFitCall } from "../functions/api/book/fit-call.js";
import { onRequest as setFitCallDisposition } from "../functions/api/book/fit-call-disposition.js";
import { isPreviousMonitorRunStale } from "../functions/api/book/monitor.js";
import { onRequest as applySiteMiddleware } from "../functions/_middleware.js";
import { calculateDeliveryDueAt } from "../functions/api/_lib/delivery-clock.js";
import {
  buildPublicProjection,
  validateManifest,
  validatePublicProjection,
  validateReleaseParity
} from "../scripts/public-truth.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(path.join(root, "config/public-truth/manifest.v2.json"), "utf8"));
const v2Terms = JSON.parse(readFileSync(path.join(root, "config/booking/terms/workflow-map-v2.json"), "utf8"));
const measurementContract = JSON.parse(
  readFileSync(path.join(root, "config/measurement/paid-plan-pilot-v1.json"), "utf8")
);
const productionWrangler = readFileSync(path.join(root, "wrangler.toml"), "utf8");
const previewWrangler = readFileSync(path.join(root, "wrangler.preview.toml"), "utf8");
const developerVarsExample = readFileSync(path.join(root, ".dev.vars.example"), "utf8");
const calendar = {
  calendarId: manifest.offer.delivery.calendarId,
  timezone: manifest.offer.delivery.timezone,
  dueLocalTime: manifest.offer.delivery.dueLocalTime,
  observedDates: manifest.offer.delivery.observedDates
};

function v1Env(overrides = {}) {
  return {
    BOOKING_CHECKOUT_ENABLED: "true",
    ACTIVE_BOOKING_RELEASE: "legacy_v1_2026_04_06",
    STRIPE_BOOKING_PRICE_ID: "price_legacy_test",
    ...overrides
  };
}

function v2Env(overrides = {}) {
  return {
    BOOKING_CHECKOUT_ENABLED: "true",
    ACTIVE_BOOKING_RELEASE: "aissisted_booking_v2_2026_08_15",
    BOOKING_V2_STRIPE_PRODUCT_ID: "prod_v2_test",
    BOOKING_V2_STRIPE_PRICE_ID: "price_v2_test",
    BOOKING_V2_PAYMENT_METHOD_CONFIGURATION_ID: "pmc_v2_test",
    ...overrides
  };
}

test("release pointer and checkout kill switch fail closed", () => {
  assert.equal(resolveBookingControls({}).checkoutEnabled, false);
  assert.equal(resolveBookingControls({ BOOKING_CHECKOUT_ENABLED: "maybe" }).checkoutEnabled, false);
  assert.equal(resolveBookingControls({ BOOKING_CHECKOUT_ENABLED: "false" }).reason, "checkout_kill_switch");
  assert.equal(resolveBookingControls({ BOOKING_CHECKOUT_ENABLED: "true" }).checkoutEnabled, false);
  assert.equal(resolveBookingControls({ BOOKING_CHECKOUT_ENABLED: "true", ACTIVE_BOOKING_RELEASE: "unknown" }).checkoutEnabled, false);
  assert.equal(resolveBookingControls(v2Env({ BOOKING_V2_STRIPE_PRICE_ID: "" })).checkoutEnabled, false);
});

test("tracked production config stages the v2 contract with Checkout disabled", () => {
  assert.match(productionWrangler, /ACTIVE_BOOKING_RELEASE\s*=\s*"aissisted_booking_v2_2026_08_15"/);
  assert.match(productionWrangler, /BOOKING_CHECKOUT_ENABLED\s*=\s*"false"/);
  assert.match(productionWrangler, /BOOKING_V2_STRIPE_PRODUCT_ID\s*=\s*"prod_[^"]+"/);
  assert.match(productionWrangler, /BOOKING_V2_STRIPE_PRICE_ID\s*=\s*"price_[^"]+"/);
  assert.match(productionWrangler, /BOOKING_V2_PAYMENT_METHOD_CONFIGURATION_ID\s*=\s*"pmc_[^"]+"/);
  assert.match(productionWrangler, /STRIPE_EXPECTED_LIVEMODE\s*=\s*"true"/);
  assert.match(productionWrangler, /FIT_CALL_REQUESTS_ENABLED\s*=\s*"true"/);
  assert.match(developerVarsExample, /^ACTIVE_BOOKING_RELEASE=aissisted_booking_v2_2026_08_15$/m);
  assert.match(developerVarsExample, /^BOOKING_CHECKOUT_ENABLED=false$/m);
});

test("isolated hosted preview keeps Checkout disabled and production resources unbound", () => {
  assert.match(previewWrangler, /^name\s*=\s*"aissisted-offer-v2-preview"$/m);
  assert.match(previewWrangler, /PUBLIC_SITE_ORIGIN\s*=\s*"https:\/\/aissisted-offer-v2-preview\.pages\.dev"/);
  assert.match(previewWrangler, /ACTIVE_BOOKING_RELEASE\s*=\s*"aissisted_booking_v2_2026_08_15"/);
  assert.match(previewWrangler, /BOOKING_CHECKOUT_ENABLED\s*=\s*"false"/);
  assert.match(previewWrangler, /STRIPE_EXPECTED_LIVEMODE\s*=\s*"false"/);
  assert.match(previewWrangler, /BOOKING_CREATE_GOOGLE_CALENDAR_EVENT\s*=\s*"false"/);
  assert.match(previewWrangler, /AIC_EMAIL_PROVIDER\s*=\s*""/);
  assert.match(previewWrangler, /database_name\s*=\s*"aissisted-booking-preview-v2-20260815"/);
  assert.doesNotMatch(previewWrangler, /database_name\s*=\s*"aissisted-booking"\s*$/m);
  assert.doesNotMatch(previewWrangler, /STRIPE_EXPECTED_LIVEMODE\s*=\s*"true"/);
});

test("isolated preview access gate blocks anonymous traffic and issues an HttpOnly session", async () => {
  const env = {
    PREVIEW_ACCESS_TOKEN: "preview-test-token",
    PREVIEW_ACCESS_LABEL: "AIssisted Test Preview",
    PUBLIC_SITE_ORIGIN: "https://aissisted-offer-v2-preview.pages.dev"
  };
  let nextCalls = 0;
  const anonymous = await applySiteMiddleware({
    request: new Request("https://aissisted-offer-v2-preview.pages.dev/book/"),
    env,
    next: async () => {
      nextCalls += 1;
      return new Response("private candidate");
    }
  });
  assert.equal(anonymous.status, 401);
  assert.equal(nextCalls, 0);
  assert.match(await anonymous.text(), /access-controlled/);
  assert.match(anonymous.headers.get("x-robots-tag"), /noindex/);

  const login = await applySiteMiddleware({
    request: new Request("https://aissisted-offer-v2-preview.pages.dev/__preview-auth", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "preview-test-token" })
    }),
    env,
    next: async () => new Response("not reached")
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), "https://aissisted-offer-v2-preview.pages.dev/");
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /__Host-aic_preview=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const authorized = await applySiteMiddleware({
    request: new Request("https://aissisted-offer-v2-preview.pages.dev/book/", {
      headers: { cookie: cookie.split(";")[0] }
    }),
    env,
    next: async () => {
      nextCalls += 1;
      return new Response("private candidate");
    }
  });
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "private candidate");
  assert.equal(nextCalls, 1);
  assert.equal(authorized.headers.get("cache-control"), "private, no-store, max-age=0");

  const signedWebhookPath = await applySiteMiddleware({
    request: new Request("https://aissisted-offer-v2-preview.pages.dev/api/book/webhook", {
      method: "POST",
      body: "{}"
    }),
    env,
    next: async () => new Response("webhook-handler", { status: 400 })
  });
  assert.equal(signedWebhookPath.status, 400);
  assert.equal(await signedWebhookPath.text(), "webhook-handler");

  for (const pathname of [
    "/.dev.vars.example",
    "/.gitignore",
    "/.htaccess",
    "/wrangler.preview.toml",
    "/index.html.bak-certs"
  ]) {
    const blockedInternalFile = await applySiteMiddleware({
      request: new Request(`https://aissisted-offer-v2-preview.pages.dev${pathname}`, {
        headers: { authorization: "Bearer preview-test-token" }
      }),
      env,
      next: async () => new Response("must not be public")
    });
    assert.equal(blockedInternalFile.status, 404, pathname);
    assert.equal(await blockedInternalFile.text(), "Not found", pathname);
  }
});

test("one release pointer selects complete v1 or v2 purchase semantics", () => {
  const production = resolveBookingControls(v1Env());
  const preview = resolveBookingControls(v2Env());
  assert.equal(production.checkoutEnabled, true);
  assert.equal(production.release.offerVersion, 1);
  assert.equal(production.release.implementationCreditEnabled, true);
  assert.equal(preview.checkoutEnabled, true);
  assert.equal(preview.release.offerVersion, 2);
  assert.equal(preview.release.offerId, "workflow_map_build_discovery_225");
  assert.equal(preview.release.amountCents, 22500);
  assert.equal(preview.release.termsSha256, manifest.offer.termsSha256);
  assert.equal(preview.release.stripePriceRef, "price_v2_test");
  assert.equal(preview.release.implementationCreditEnabled, false);
  assert.equal(resolveFitCallControls({ FIT_CALL_REQUESTS_ENABLED: "true" }).enabled, true);
  assert.equal(resolveFitCallControls({ FIT_CALL_REQUESTS_ENABLED: "invalid" }).enabled, false);
});

test("v1 keeps credit semantics while v2 never creates a credit", () => {
  assert.equal(shouldCreateImplementationCredit(BOOKING_RELEASES.legacy_v1_2026_04_06), true);
  assert.equal(shouldCreateImplementationCredit(BOOKING_RELEASES.aissisted_booking_v2_2026_08_15), false);
});

test("contract snapshot is immutable, complete, and reconciles without private Stripe metadata", () => {
  const release = resolveBookingControls(v2Env()).release;
  const contract = createBookingContractSnapshot({
    bookingId: "book_test_v2",
    release,
    acceptedAt: "2026-08-15T21:00:00.000Z",
    termsSnapshot: v2Terms
  });
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(contractMatchesRelease(contract, release), true);
  assert.equal(contract.implementationCreditEnabled, false);
  assert.equal(contract.implementationCreditTermsJson, null);
  assert.equal(contract.stripeProductRef, "prod_v2_test");
  assert.equal(contract.stripePriceRef, "price_v2_test");
  assert.equal(contract.paymentMethodPolicy, "synchronous_card_only");
  assert.equal(contract.stripePaymentMethodConfigurationRef, "pmc_v2_test");
  assert.match(contract.stripeCustomerCopyJson, /Workflow Map & First-Build Plan/);
  const metadata = buildStripeContractMetadata(release, contract.bookingId);
  assert.deepEqual(Object.keys(metadata).sort(), ["booking_id", "offer_id", "offer_version", "release_id", "terms_sha256", "terms_version"]);
  assert.equal(JSON.stringify(metadata).includes("renderedTerms"), false);
  assert.equal(JSON.stringify(metadata).includes("example.com"), false);
  assert.equal(contractMatchesRelease({ ...contract, amountCents: 12500 }, release), false);
});

test("v2 checkout acceptance rejects stale or tampered offer fields and route IDs", () => {
  const config = getBookingConfig(v2Env(), "https://aissistedconsulting.com");
  const payload = {
    slotId: "slot_v2_acceptance",
    policyAccepted: true,
    checkoutConsent: true,
    confirmedAmountCents: 22500,
    confirmedCurrency: "usd",
    confirmedReleaseId: config.activeRelease.releaseId,
    confirmedOfferId: config.activeRelease.offerId,
    confirmedOfferVersion: config.activeRelease.offerVersion,
    confirmedTermsVersion: config.activeRelease.termsVersion,
    confirmedTermsSha256: config.activeRelease.termsSha256,
    contact: { name: "Test Buyer", email: "buyer@example.com" },
    intake: { routeId: "custom_development" },
    measurement: {
      funnelId: "funnel_preview_measurement_001",
      entryRoute: "services",
      ctaId: "services_hero_paid_plan"
    }
  };
  const normalized = normalizeCheckoutPayload(payload, config);
  assert.equal(normalized.intake.routeId, "custom_development");
  assert.deepEqual(normalized.measurement, {
    funnelId: "funnel_preview_measurement_001",
    entryRoute: "services",
    ctaId: "services_hero_paid_plan",
    laneId: "custom_development"
  });
  const privacyFallback = normalizeCheckoutPayload({
    ...payload,
    measurement: {
      funnelId: "customer@example.com",
      entryRoute: "https://example.com/?private=yes",
      ctaId: "free-form customer text"
    }
  }, config);
  assert.deepEqual(privacyFallback.measurement, {
    funnelId: "",
    entryRoute: "book",
    ctaId: "book_direct",
    laneId: "custom_development"
  });
  assert.throws(
    () => normalizeCheckoutPayload({ ...payload, confirmedAmountCents: 12500 }, config),
    /current booking amount/
  );
  assert.throws(
    () => normalizeCheckoutPayload({ ...payload, confirmedTermsSha256: "0".repeat(64) }, config),
    /offer changed/
  );
  assert.throws(
    () => normalizeCheckoutPayload({ ...payload, intake: { routeId: "personal_family_help" } }, config),
    /improve a workflow or build something new/
  );
});

test("v2 webhook reconciliation fails closed on provider or metadata mismatch", () => {
  const release = resolveBookingControls(v2Env()).release;
  const contract = {
    ...createBookingContractSnapshot({
      bookingId: "book_reconcile_v2",
      release,
      acceptedAt: "2026-08-15T21:00:00.000Z",
      termsSnapshot: v2Terms
    }),
    stripeCheckoutSessionId: "cs_test_expected"
  };
  const session = {
    id: "cs_test_expected",
    livemode: false,
    payment_status: "paid",
    payment_method_types: ["card"],
    amount_total: 22500,
    currency: "usd",
    metadata: buildStripeContractMetadata(release, contract.bookingId),
    line_items: { data: [{ price: { id: "price_v2_test", product: { id: "prod_v2_test" } } }] }
  };
  assert.deepEqual(
    validateCheckoutSessionAgainstContract({ session, contract, expectedLivemode: false }),
    { ok: true, reasons: [] }
  );
  const mismatch = validateCheckoutSessionAgainstContract({
    session: { ...session, amount_total: 12500 },
    contract,
    expectedLivemode: false
  });
  assert.equal(mismatch.ok, false);
  assert.deepEqual(mismatch.reasons, ["amount_mismatch"]);
  assert.equal(
    validateCheckoutSessionAgainstContract({ session, contract, expectedLivemode: null }).ok,
    false
  );
});

test("v2 Checkout uses the governed card-only configuration and receipt copy", async () => {
  const config = getBookingConfig(v2Env({
    STRIPE_SECRET_KEY: "sk_test_local",
    STRIPE_EXPECTED_LIVEMODE: "false"
  }), "https://aissistedconsulting.com");
  const contract = createBookingContractSnapshot({
    bookingId: "book_provider_contract_v2",
    release: config.activeRelease,
    acceptedAt: "2026-08-15T21:00:00.000Z",
    termsSnapshot: v2Terms
  });
  const booking = {
    ...contract,
    id: contract.bookingId,
    prospectId: "prospect_provider_contract_v2",
    slotId: "slot_provider_contract_v2",
    selectedTimeWindowStart: "2026-08-20T14:00:00.000Z",
    selectedTimeWindowEnd: "2026-08-20T15:00:00.000Z",
    temporaryHoldExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    policyVersion: contract.termsVersion
  };
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return Response.json({
      id: "cs_test_provider_contract_v2",
      livemode: false,
      payment_method_types: ["card"],
      status: "open",
      payment_status: "unpaid",
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      url: "https://checkout.stripe.com/c/pay/cs_test_provider_contract_v2"
    });
  };

  try {
    const session = await createCheckoutSession(config, booking, {
      email: "provider-contract@example.com",
      stripeCustomerId: ""
    }, { idempotencyKey: "aic-checkout-provider-contract-v2" });
    assert.equal(session.id, "cs_test_provider_contract_v2");
    assert.equal(calls.length, 1);
    const body = new URLSearchParams(String(calls[0].options.body));
    assert.equal(body.get("payment_method_configuration"), "pmc_v2_test");
    assert.equal(body.get("integration_identifier"), "aissisted_booking_v2_lwlonxpv");
    assert.equal(body.get("payment_intent_data[description]"), config.activeRelease.stripeReceiptDescription);
    assert.equal(body.get("custom_text[submit][message]"), config.activeRelease.stripeCheckoutTermsMessage);
    assert.equal([...body.keys()].some((key) => key.startsWith("payment_method_types")), false);
    assert.equal(calls[0].options.headers["stripe-version"], "2026-06-24.dahlia");
  } finally {
    global.fetch = originalFetch;
  }
});

test("v2 Checkout rejects and expires a provider Session that is not card-only", async () => {
  const config = getBookingConfig(v2Env({
    STRIPE_SECRET_KEY: "sk_test_local",
    STRIPE_EXPECTED_LIVEMODE: "false"
  }), "https://aissistedconsulting.com");
  const contract = createBookingContractSnapshot({
    bookingId: "book_provider_reject_v2",
    release: config.activeRelease,
    acceptedAt: "2026-08-15T21:00:00.000Z",
    termsSnapshot: v2Terms
  });
  const booking = {
    ...contract,
    id: contract.bookingId,
    prospectId: "prospect_provider_reject_v2",
    slotId: "slot_provider_reject_v2",
    selectedTimeWindowStart: "2026-08-20T14:00:00.000Z",
    selectedTimeWindowEnd: "2026-08-20T15:00:00.000Z",
    temporaryHoldExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    policyVersion: contract.termsVersion
  };
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/expire")) {
      return Response.json({ id: "cs_test_provider_reject_v2", livemode: false, status: "expired" });
    }
    return Response.json({
      id: "cs_test_provider_reject_v2",
      livemode: false,
      payment_method_types: ["card", "link"],
      status: "open",
      payment_status: "unpaid"
    });
  };

  try {
    await assert.rejects(
      createCheckoutSession(config, booking, {
        email: "provider-reject@example.com",
        stripeCustomerId: ""
      }),
      /not restricted to synchronous card payments/
    );
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /\/checkout\/sessions\/cs_test_provider_reject_v2\/expire$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("open-Checkout rollback inventory is mode-safe and expiry is separately gated", async () => {
  const env = {
    STRIPE_SECRET_KEY: "sk_test_local",
    STRIPE_EXPECTED_LIVEMODE: "false",
    BOOKING_OWNER_ACTION_TOKEN: "owner-rollback-test"
  };
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/expire")) {
      return Response.json({
        id: "cs_test_open_v2",
        livemode: false,
        status: "expired",
        payment_status: "unpaid",
        amount_total: 22500,
        currency: "usd",
        expires_at: 1786845012,
        metadata: { release_id: "aissisted_booking_v2_2026_08_15" }
      });
    }
    return Response.json({
      object: "list",
      has_more: false,
      data: [
        {
          id: "cs_test_open_v2",
          livemode: false,
          status: "open",
          payment_status: "unpaid",
          amount_total: 22500,
          currency: "usd",
          expires_at: 1786845012,
          metadata: { release_id: "aissisted_booking_v2_2026_08_15" }
        },
        {
          id: "cs_test_other_release",
          livemode: false,
          status: "open",
          metadata: { release_id: "other" }
        }
      ]
    });
  };

  const request = (action) => new Request(
    "https://aissistedconsulting.com/api/book/checkout-rollback",
    {
      method: "POST",
      headers: {
        authorization: "Bearer owner-rollback-test",
        "content-type": "application/json"
      },
      body: JSON.stringify({ action })
    }
  );

  try {
    const inventory = await manageOpenCheckouts({ request: request("inventory"), env });
    assert.equal(inventory.status, 200);
    assert.equal((await inventory.json()).count, 1);
    const blocked = await manageOpenCheckouts({ request: request("expire_open"), env });
    assert.equal(blocked.status, 403);
    const expired = await manageOpenCheckouts({
      request: request("expire_open"),
      env: { ...env, BOOKING_OPEN_SESSION_EXPIRY_ENABLED: "true" }
    });
    assert.equal(expired.status, 200);
    assert.equal((await expired.json()).sessions[0].status, "expired");
    assert.equal(calls.some((call) => call.url.endsWith("/expire")), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("dual-aware confirmation preserves v1 credit and creates v2 deliverable without credit", async () => {
  const store = getBookingStore({});
  const now = "2026-08-15T21:00:00.000Z";
  const holdEnd = "2026-08-15T23:00:00.000Z";

  async function createAndConfirm({ suffix, release }) {
    const prospect = await store.upsertProspect({
      name: `Buyer ${suffix}`,
      email: `buyer-${suffix}@example.com`
    });
    const booking = await store.createBookingHold({
      prospectId: prospect.id,
      slotId: `slot_${suffix}`,
      selectedTimeWindowStart: "2026-08-20T14:00:00.000Z",
      selectedTimeWindowEnd: "2026-08-20T15:00:00.000Z",
      selectedTimeZone: "America/New_York",
      reservationAmount: release.amountCents,
      currency: release.currency,
      temporaryHoldExpiresAt: holdEnd,
      createdAt: now,
      policyVersion: release.termsVersion,
      policyAcceptedAt: now,
      contractInput: {
        release,
        acceptedAt: now,
        termsSnapshot: getTermsSnapshotForRelease(release.releaseId)
      },
      stripeCheckoutIdempotencyKey: `idem_${suffix}`
    });
    await store.attachCheckoutSession(booking.id, { sessionId: `cs_${suffix}` });
    return store.confirmBookingFromCheckout({
      bookingId: booking.id,
      sessionId: `cs_${suffix}`,
      paymentReference: `pi_${suffix}`,
      confirmedAt: "2026-08-15T22:00:00.000Z"
    });
  }

  const v1 = await createAndConfirm({
    suffix: "dual_v1",
    release: resolveBookingControls(v1Env()).release
  });
  assert.equal(v1.state, "confirmed");
  assert.equal(v1.booking.depositCreditAvailable, true);
  assert.equal(v1.booking.deliverableStatus, "");

  const v2 = await createAndConfirm({
    suffix: "dual_v2",
    release: resolveBookingControls(v2Env()).release
  });
  assert.equal(v2.state, "confirmed");
  assert.equal(v2.booking.depositCreditAvailable, false);
  assert.equal(v2.booking.deliverableStatus, "awaiting_session");
});

async function createConfirmedV2Booking(suffix) {
  const store = getBookingStore({});
  const release = resolveBookingControls(v2Env()).release;
  const createdAt = "2026-08-15T21:00:00.000Z";
  const prospect = await store.upsertProspect({
    name: `Fulfillment ${suffix}`,
    email: `fulfillment-${suffix}@example.com`
  });
  const booking = await store.createBookingHold({
    prospectId: prospect.id,
    slotId: `slot_fulfillment_${suffix}`,
    selectedTimeWindowStart: "2026-08-20T14:00:00.000Z",
    selectedTimeWindowEnd: "2026-08-20T15:00:00.000Z",
    selectedTimeZone: "America/New_York",
    reservationAmount: 22500,
    currency: "usd",
    temporaryHoldExpiresAt: "2026-08-15T23:30:00.000Z",
    createdAt,
    policyVersion: release.termsVersion,
    policyAcceptedAt: createdAt,
    contractInput: {
      release,
      acceptedAt: createdAt,
      termsSnapshot: getTermsSnapshotForRelease(release.releaseId)
    },
    stripeCheckoutIdempotencyKey: `idem_fulfillment_${suffix}`
  });
  await store.attachCheckoutSession(booking.id, { sessionId: `cs_fulfillment_${suffix}` });
  await store.confirmBookingFromCheckout({
    bookingId: booking.id,
    sessionId: `cs_fulfillment_${suffix}`,
    paymentReference: `pi_fulfillment_${suffix}`,
    confirmedAt: "2026-08-15T22:00:00.000Z"
  });
  return { store, bookingId: booking.id };
}

test("owner fulfillment actions are state-safe, audited, and idempotent", async () => {
  const { store, bookingId } = await createConfirmedV2Booking("happy");
  const completed = await applyFulfillmentAction({
    store,
    bookingId,
    action: "session_completed",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:complete:1`,
    at: "2026-08-20T15:05:00.000Z",
    data: { sessionCompletedAt: "2026-08-20T15:00:00.000Z" }
  });
  assert.equal(completed.deliverable.status, "pending");
  assert.equal(completed.deliverable.dueAt, "2026-08-24T21:00:00.000Z");
  const replay = await applyFulfillmentAction({
    store,
    bookingId,
    action: "session_completed",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:complete:1`,
    at: "2026-08-20T15:05:00.000Z",
    data: { sessionCompletedAt: "2026-08-20T15:00:00.000Z" }
  });
  assert.equal(replay.replayed, true);

  await applyFulfillmentAction({
    store,
    bookingId,
    action: "deliverable_delivered",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:delivered:1`,
    at: "2026-08-21T18:00:00.000Z",
    data: { deliveredAt: "2026-08-21T18:00:00.000Z", artifactRef: "private:plan/happy" }
  });
  const correction = await applyFulfillmentAction({
    store,
    bookingId,
    action: "correction_requested",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:correction:1`,
    at: "2026-08-22T18:00:00.000Z",
    data: { inScope: true }
  });
  assert.equal(correction.event.eventType, "correction_requested");
  const duplicateRound = await applyFulfillmentAction({
    store,
    bookingId,
    action: "correction_requested",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:correction:2`,
    at: "2026-08-23T18:00:00.000Z",
    data: { inScope: true }
  });
  assert.equal(duplicateRound.event.eventType, "correction_rejected_duplicate_round");
});

test("late delivery records the customer refund choice and reconciliation", async () => {
  const { store, bookingId } = await createConfirmedV2Booking("late");
  const completed = await applyFulfillmentAction({
    store,
    bookingId,
    action: "session_completed",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:complete:1`,
    at: "2026-08-20T15:00:00.000Z",
    data: { sessionCompletedAt: "2026-08-20T15:00:00.000Z" }
  });
  const late = await applyFulfillmentAction({
    store,
    bookingId,
    action: "deliverable_late",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:late:1`,
    at: "2026-08-24T21:00:01.000Z"
  });
  assert.equal(late.deliverable.status, "late");
  assert.equal(completed.deliverable.dueAt, "2026-08-24T21:00:00.000Z");
  const requested = await applyFulfillmentAction({
    store,
    bookingId,
    action: "customer_chose_refund",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:refund-request:1`,
    at: "2026-08-24T22:00:00.000Z"
  });
  assert.equal(requested.deliverable.status, "refund_requested");
  const reconciled = await applyFulfillmentAction({
    store,
    bookingId,
    action: "refund_reconciled",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:refund-reconciled:1`,
    at: "2026-08-24T22:05:00.000Z",
    data: { refundReference: "re_test_safe_reference" }
  });
  assert.equal(reconciled.deliverable.status, "refunded");
});

for (const action of ["customer_canceled_with_notice_refund", "aissisted_canceled_refund"]) {
  test(`${action} records and reconciles an approved pre-session refund`, async () => {
    const { store, bookingId } = await createConfirmedV2Booking(action);
    const requested = await applyFulfillmentAction({
      store,
      bookingId,
      action,
      actorRef: "pj_owner_action",
      idempotencyKey: `${bookingId}:${action}:1`,
      at: "2026-08-18T14:00:00.000Z"
    });
    assert.equal(requested.deliverable.status, "refund_requested");
    assert.equal(requested.deliverable.remedyStatus, "refund_requested");
    assert.equal(requested.event.eventType, "refund_requested");

    const replay = await applyFulfillmentAction({
      store,
      bookingId,
      action,
      actorRef: "pj_owner_action",
      idempotencyKey: `${bookingId}:${action}:1`,
      at: "2026-08-18T14:00:00.000Z"
    });
    assert.equal(replay.replayed, true);

    const reconciled = await applyFulfillmentAction({
      store,
      bookingId,
      action: "refund_reconciled",
      actorRef: "pj_owner_action",
      idempotencyKey: `${bookingId}:refund-reconciled:1`,
      at: "2026-08-18T14:05:00.000Z",
      data: { refundReference: `re_test_${action}` }
    });
    assert.equal(reconciled.deliverable.status, "refunded");
    assert.equal(reconciled.deliverable.remedyStatus, "refunded");
  });
}

test("v2 integration outbox retries failures and drains configured skips exactly once", async () => {
  const first = await createConfirmedV2Booking("outbox_retry");
  const failingConfig = getBookingConfig({
    ...v2Env(),
    BOOKING_CREATE_GOOGLE_CALENDAR_EVENT: "true"
  }, "https://aissistedconsulting.com");
  const attempt = await drainBookingOutbox({
    store: first.store,
    config: failingConfig,
    bookingId: first.bookingId,
    at: "2026-08-15T22:01:00.000Z"
  });
  assert.equal(attempt.filter((item) => item.state === "failed").length, 1);
  assert.equal(attempt.filter((item) => item.state === "sent").length, 2);
  assert.equal((await first.store.listBookingOutbox(first.bookingId)).length, 1);

  const second = await createConfirmedV2Booking("outbox_skip");
  const disabledConfig = getBookingConfig({
    ...v2Env(),
    BOOKING_CREATE_GOOGLE_CALENDAR_EVENT: "false"
  }, "https://aissistedconsulting.com");
  const drained = await drainBookingOutbox({
    store: second.store,
    config: disabledConfig,
    bookingId: second.bookingId,
    at: "2026-08-15T22:02:00.000Z"
  });
  assert.equal(drained.length, 3);
  assert.equal(drained.every((item) => item.state === "sent"), true);
  assert.equal((await second.store.listBookingOutbox(second.bookingId)).length, 0);
  assert.deepEqual(
    await drainBookingOutbox({
      store: second.store,
      config: disabledConfig,
      bookingId: second.bookingId,
      at: "2026-08-15T22:03:00.000Z"
    }),
    []
  );
});

test("owner fulfillment endpoint is closed without its dedicated token", async () => {
  const { bookingId } = await createConfirmedV2Booking("owner_endpoint");
  const body = JSON.stringify({
    bookingId,
    action: "session_completed",
    idempotencyKey: `${bookingId}:owner-endpoint:1`,
    at: "2026-08-20T15:00:00.000Z",
    data: { sessionCompletedAt: "2026-08-20T15:00:00.000Z" }
  });
  const missingConfig = await manageBooking({
    request: new Request("https://aissistedconsulting.com/api/book/manage", { method: "POST", body }),
    env: {}
  });
  assert.equal(missingConfig.status, 503);
  const forbidden = await manageBooking({
    request: new Request("https://aissistedconsulting.com/api/book/manage", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body
    }),
    env: { BOOKING_OWNER_ACTION_TOKEN: "owner-test-token" }
  });
  assert.equal(forbidden.status, 403);
  const allowed = await manageBooking({
    request: new Request("https://aissistedconsulting.com/api/book/manage", {
      method: "POST",
      headers: { authorization: "Bearer owner-test-token" },
      body
    }),
    env: { BOOKING_OWNER_ACTION_TOKEN: "owner-test-token" }
  });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).deliverable.status, "pending");
});

test("awaiting-session watchdog query only returns records beyond its grace", async () => {
  const { store, bookingId } = await createConfirmedV2Booking("watchdog");
  await applyFulfillmentAction({
    store,
    bookingId,
    action: "session_rescheduled",
    actorRef: "pj_owner_action",
    idempotencyKey: `${bookingId}:reschedule:1`,
    at: "2026-08-15T20:00:00.000Z",
    data: { expectedSessionEndAt: "2026-08-15T20:00:00.000Z" }
  });
  const items = await store.listFulfillmentWatchItems({
    nowIso: "2026-08-15T21:00:01.000Z",
    awaitingGraceMinutes: 30,
    deadlineLeadMinutes: 120
  });
  assert.equal(items.some((item) => item.bookingId === bookingId), true);
});

test("Fit Call is a capacity-limited manual-review lane with no Stripe path", async () => {
  const env = {
    FIT_CALL_REQUESTS_ENABLED: "true",
    FIT_CALL_WEEKLY_CAPACITY: "2",
    BOOKING_OWNER_ACTION_TOKEN: "fit-owner-token",
    PUBLIC_SITE_ORIGIN: "https://aissistedconsulting.com"
  };
  const response = await requestFitCall({
    request: new Request("https://aissistedconsulting.com/api/book/fit-call", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://aissistedconsulting.com" },
      body: JSON.stringify({
        name: "Fit Buyer",
        email: "fit-buyer@example.com",
        routeId: "workflow_improvement",
        reason: "I need help deciding whether the paid plan fits.",
        consentToSubmit: true,
        sourcePage: "/book/"
      })
    }),
    env
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.durationMinutes, 15);
  assert.equal(payload.weeklyCapacity, 2);
  assert.equal(payload.scheduled, false);
  assert.equal(payload.paymentRequired, false);
  const fitInquiry = await getBookingStore(env).getContactInquiryById(payload.inquiryId);
  assert.match(fitInquiry.idempotencyRecordId, /^idem_/);
  const fitIdempotency = await getBookingStore(env).getIdempotencyRecordById(
    fitInquiry.idempotencyRecordId
  );
  assert.equal(fitIdempotency.status, "succeeded");
  assert.equal(fitIdempotency.targetId, payload.inquiryId);

  const disposition = await setFitCallDisposition({
    request: new Request("https://aissistedconsulting.com/api/book/fit-call-disposition", {
      method: "POST",
      headers: { authorization: "Bearer fit-owner-token", "content-type": "application/json" },
      body: JSON.stringify({
        inquiryId: payload.inquiryId,
        disposition: "fit_call_redirected_to_paid_plan"
      })
    }),
    env
  });
  assert.equal(disposition.status, 200);
  assert.equal((await disposition.json()).disposition, "fit_call_redirected_to_paid_plan");
});

test("delivery clock handles weekends, holidays, and daylight-saving changes", () => {
  assert.equal(
    calculateDeliveryDueAt({ sessionCompletedAt: "2026-08-14T18:00:00.000Z", calendar }),
    "2026-08-18T21:00:00.000Z"
  );
  assert.equal(
    calculateDeliveryDueAt({ sessionCompletedAt: "2026-09-04T18:00:00.000Z", calendar }),
    "2026-09-09T21:00:00.000Z"
  );
  assert.equal(
    calculateDeliveryDueAt({ sessionCompletedAt: "2026-03-06T20:00:00.000Z", calendar }),
    "2026-03-10T21:00:00.000Z"
  );
  assert.equal(
    calculateDeliveryDueAt({ sessionCompletedAt: "2026-10-30T19:00:00.000Z", calendar }),
    "2026-11-03T22:00:00.000Z"
  );
  assert.equal(calculateDeliveryDueAt({ sessionCompletedAt: null, sessionStatus: "canceled", calendar }), null);
  assert.equal(calculateDeliveryDueAt({ sessionCompletedAt: null, sessionStatus: "no_show", calendar }), null);
  assert.throws(
    () => calculateDeliveryDueAt({ sessionCompletedAt: "2026-12-30T18:00:00.000Z", calendar }),
    /No approved delivery calendar is available for 2027/
  );
  const once = calculateDeliveryDueAt({ sessionCompletedAt: "2026-08-14T18:00:00.000Z", calendar });
  const twice = calculateDeliveryDueAt({ sessionCompletedAt: "2026-08-14T18:00:00.000Z", calendar });
  assert.equal(once, twice);
});

test("public truth generator catches deliberate manifest and projection drift", () => {
  validateManifest(manifest);
  validateReleaseParity(manifest);
  validatePublicProjection(buildPublicProjection(manifest));
  assert.throws(
    () => validateManifest({ ...manifest, offer: { ...manifest.offer, amountCents: 12500 } }),
    /offer price drift/
  );
  assert.throws(
    () => validatePublicProjection({ ...buildPublicProjection(manifest), company: { ...manifest.company, category: "AI operations lab" } }),
    /forbidden public output/
  );
});

test("paid-plan measurement is allowlisted, opaque, and expires on schedule", async () => {
  const store = getBookingStore({});
  await store.logEvent({
    bookingId: "book_measurement_retention",
    eventType: "paid_plan_start",
    payload: {
      funnelId: "funnel_measurement_retention_001",
      entryRoute: "home",
      ctaId: "home_hero_paid_plan",
      laneId: "workflow_improvement",
      retentionDeleteAfter: "2026-08-15T00:00:00.000Z"
    }
  });
  const recorded = await store.getLatestEventByType("paid_plan_start");
  assert.match(recorded.payloadJson, /funnel_measurement_retention_001/);
  assert.doesNotMatch(recorded.payloadJson, /example\.com|private|customer text/i);
  assert.equal(await store.deleteExpiredMeasurementEvents("2026-08-16T00:00:00.000Z"), 1);
  assert.equal(await store.getLatestEventByType("paid_plan_start"), null);
});

test("pilot measurement contract covers required decisions without private analytics fields", () => {
  assert.equal(measurementContract.measurementContractId, "aissisted_paid_plan_pilot_v1");
  assert.equal(measurementContract.analyticsRetentionDays, 180);
  for (const field of [
    "paid_plan_start", "entry_route", "cta_id", "lane", "funnel_id", "booking_id",
    "payment_status", "session_completed_at", "delivery_due_at", "delivered_at",
    "correction_event", "refund_or_dispute_state", "fit_call_disposition"
  ]) {
    assert.equal(measurementContract.automaticFields.includes(field), true, field);
  }
  for (const field of [
    "intake_review_minutes", "session_minutes", "drafting_review_minutes",
    "administration_minutes", "expectation_mismatch_category", "buyer_clarity_score",
    "implementation_follow_on", "fit_call_scheduling_admin_minutes", "fit_call_minutes"
  ]) {
    assert.ok(measurementContract.ownerRecordedFields[field], field);
  }
  assert.deepEqual(
    measurementContract.prohibitedAnalyticsFields,
    ["name", "email", "phone", "ip_address", "raw_referrer", "raw_query_string", "free_text_intake", "plan_body", "payment_card_data"]
  );
});

test("booking operational logs exclude customer identity and contact fields", async () => {
  const emitted = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...items) => emitted.push(items);
  console.error = (...items) => emitted.push(items);
  const booking = {
    id: "book_log_privacy",
    offerId: "workflow_map_first_build_plan",
    offerVersion: 2,
    prospectName: "Private Buyer",
    prospectEmail: "private-buyer@example.com",
    prospectPhone: "3525550199",
    prospectCompany: "Private Company",
    selectedTimeWindowStart: "2026-08-20T14:00:00.000Z",
    selectedTimeWindowEnd: "2026-08-20T15:00:00.000Z",
    selectedTimeZone: "America/New_York",
    reservationAmount: 22500,
    currency: "usd",
    depositCreditAvailable: false
  };
  try {
    await sendBookingNotifications({ config: {}, booking });
    await sendManualReviewNotification({
      config: {},
      booking,
      reason: "Synthetic preview monitor rehearsal.",
      eventId: "evt_safe_monitor"
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  const serialized = JSON.stringify(emitted);
  assert.match(serialized, /book_log_privacy/);
  assert.doesNotMatch(serialized, /Private Buyer|private-buyer@example\.com|3525550199|Private Company/);
});

test("fulfillment monitor freshness threshold detects a synthetic missed run", () => {
  assert.equal(isPreviousMonitorRunStale({
    previousCreatedAt: "2026-08-15T20:00:00.000Z",
    now: "2026-08-15T20:21:00.000Z",
    maxGapMinutes: 20
  }), true);
  assert.equal(isPreviousMonitorRunStale({
    previousCreatedAt: "2026-08-15T20:05:00.000Z",
    now: "2026-08-15T20:21:00.000Z",
    maxGapMinutes: 20
  }), false);
});

function sqlite(databasePath, sql) {
  const result = spawnSync("sqlite3", [databasePath], { input: sql, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sqlite3 failed");
  }
  return result.stdout.trim();
}

const legacyFixture = `
PRAGMA foreign_keys = ON;
CREATE TABLE prospects (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, company TEXT, intake_json TEXT, stripe_customer_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE bookings (id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL, slot_id TEXT NOT NULL, selected_time_window_start TEXT NOT NULL, selected_time_window_end TEXT NOT NULL, selected_time_zone TEXT NOT NULL, booking_status TEXT NOT NULL, payment_status TEXT NOT NULL, reservation_amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'usd', stripe_checkout_session_id TEXT, stripe_payment_reference TEXT, confirmed_at TEXT, canceled_at TEXT, temporary_hold_expires_at TEXT, checkout_started_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, policy_version TEXT NOT NULL, policy_accepted_at TEXT NOT NULL, intake_summary TEXT, checkout_idempotency_record_id TEXT, checkout_audit_id TEXT, FOREIGN KEY (prospect_id) REFERENCES prospects(id));
CREATE TABLE deposit_credits (id TEXT PRIMARY KEY, booking_id TEXT NOT NULL UNIQUE, prospect_id TEXT NOT NULL, deposit_credit_available INTEGER NOT NULL DEFAULT 0, deposit_credit_amount INTEGER NOT NULL, deposit_credit_applied INTEGER NOT NULL DEFAULT 0, deposit_credit_applied_at TEXT, deposit_credit_applied_invoice_reference TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (booking_id) REFERENCES bookings(id), FOREIGN KEY (prospect_id) REFERENCES prospects(id));
CREATE TABLE booking_events (id TEXT PRIMARY KEY, booking_id TEXT, event_type TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL, FOREIGN KEY (booking_id) REFERENCES bookings(id));
CREATE UNIQUE INDEX idx_bookings_active_slot ON bookings(slot_id) WHERE booking_status IN ('hold','confirmed');
`;

test("0004 applies repeatably and preserves old-writer legacy behavior", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "aissisted-migration-"));
  const databasePath = path.join(directory, "legacy.sqlite");
  const migration = readFileSync(path.join(root, "migrations/0004_offer_contracts_and_deliverables.sql"), "utf8");
  try {
    sqlite(databasePath, `${legacyFixture}\n${migration}`);
    sqlite(databasePath, `
      INSERT INTO prospects VALUES ('prospect_v1','Legacy Buyer','legacy@example.com',NULL,NULL,NULL,NULL,'2026-08-15T00:00:00Z','2026-08-15T00:00:00Z');
      INSERT INTO bookings (id,prospect_id,slot_id,selected_time_window_start,selected_time_window_end,selected_time_zone,booking_status,payment_status,reservation_amount,currency,created_at,updated_at,policy_version,policy_accepted_at) VALUES ('book_v1','prospect_v1','slot_v1','2026-08-20T14:00:00Z','2026-08-20T15:00:00Z','America/New_York','confirmed','paid',22500,'usd','2026-08-15T00:00:00Z','2026-08-15T00:00:00Z','2026-04-06','2026-08-15T00:00:00Z');
      INSERT INTO deposit_credits (id,booking_id,prospect_id,deposit_credit_available,deposit_credit_amount,deposit_credit_applied,created_at,updated_at) VALUES ('credit_v1','book_v1','prospect_v1',1,22500,0,'2026-08-15T00:00:00Z','2026-08-15T00:00:00Z');
    `);
    assert.equal(sqlite(databasePath, "SELECT COUNT(*) FROM bookings;"), "1");
    assert.equal(sqlite(databasePath, "SELECT COUNT(*) FROM booking_contracts;"), "0");
    assert.equal(sqlite(databasePath, "SELECT COUNT(*) FROM deposit_credits;"), "1");
    sqlite(databasePath, migration);
    assert.equal(sqlite(databasePath, "SELECT COUNT(*) FROM bookings;"), "1");
    assert.equal(sqlite(databasePath, "SELECT COUNT(*) FROM deposit_credits;"), "1");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fresh schema creates constrained immutable v2 contract tables", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "aissisted-fresh-schema-"));
  const databasePath = path.join(directory, "fresh.sqlite");
  const schema = readFileSync(path.join(root, "db/booking-schema.sql"), "utf8");
  try {
    sqlite(databasePath, schema);
    const tables = sqlite(databasePath, "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('booking_contracts','booking_deliverables','booking_contract_events','checkout_intents','integration_outbox') ORDER BY name;").split("\n");
    assert.equal(tables.length, 5);
    sqlite(databasePath, `
      INSERT INTO prospects VALUES ('prospect_v2','V2 Buyer','v2@example.com',NULL,NULL,NULL,NULL,'2026-08-15T00:00:00Z','2026-08-15T00:00:00Z');
      INSERT INTO bookings (id,prospect_id,slot_id,selected_time_window_start,selected_time_window_end,selected_time_zone,booking_status,payment_status,reservation_amount,currency,created_at,updated_at,policy_version,policy_accepted_at) VALUES ('book_v2','prospect_v2','slot_v2','2026-08-20T14:00:00Z','2026-08-20T15:00:00Z','America/New_York','hold','hold_created',22500,'usd','2026-08-15T00:00:00Z','2026-08-15T00:00:00Z','workflow_map_build_discovery_225_terms_2026-08-15_v1','2026-08-15T00:00:00Z');
      INSERT INTO booking_contracts (
        booking_id,release_id,offer_id,offer_version,terms_version,terms_sha256,
        terms_snapshot_json,amount_cents,currency,stripe_product_ref,stripe_price_ref,
        payment_method_policy,stripe_payment_method_configuration_ref,stripe_customer_copy_json,
        implementation_credit_enabled,implementation_credit_terms_json,delivery_calendar_id,
        accepted_at,created_at
      ) VALUES (
        'book_v2','aissisted_booking_v2_2026_08_15','workflow_map_build_discovery_225',2,
        'workflow_map_build_discovery_225_terms_2026-08-15_v1','${manifest.offer.termsSha256}',
        '{}',22500,'usd','prod_v2','price_v2','synchronous_card_only','pmc_v2','{}',
        0,NULL,'aissisted_us_federal_observed_2026_v1','2026-08-15T00:00:00Z','2026-08-15T00:00:00Z'
      );
    `);
    assert.equal(sqlite(databasePath, "SELECT implementation_credit_enabled FROM booking_contracts WHERE booking_id='book_v2';"), "0");
    assert.equal(sqlite(databasePath, "SELECT COUNT(*) FROM deposit_credits WHERE booking_id='book_v2';"), "0");
    assert.throws(
      () => sqlite(databasePath, "UPDATE booking_contracts SET amount_cents=12500 WHERE booking_id='book_v2';"),
      /booking_contracts are immutable/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
