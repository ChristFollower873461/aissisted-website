import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildCrmAttribution } from "../functions/api/_lib/crm-attribution.js";
import { getBookingConfig } from "../functions/api/_lib/config.js";
import { normalizeCheckoutPayload } from "../functions/api/book/create-checkout.js";
import { onRequest as requestFitCall } from "../functions/api/book/fit-call.js";

const SYNTHETIC_CLICK_ID = "x".repeat(130);
const CAMPAIGN_QUERY = `utm_source=google&utm_medium=cpc&utm_campaign=synthetic-campaign&gclid=${SYNTHETIC_CLICK_ID}`;
const FORM_VALUES = {
  name: "Synthetic Owner",
  email: "synthetic@example.com",
  company: "Synthetic Company",
  policyAccepted: "on",
  consentToSubmit: "on",
  routeId: "workflow_improvement",
  primaryGoal: "workflow_improvement",
  summary: "Synthetic workflow question"
};

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

function createNode() {
  return {
    textContent: "",
    innerHTML: "",
    className: "",
    disabled: false,
    classList: { add() {} },
    listeners: {},
    addEventListener(event, listener) { this.listeners[event] = listener; },
    scrollIntoView() {},
    reset() {}
  };
}

async function submitForm(formType, attributionMode, campaignQuery = CAMPAIGN_QUERY) {
  const requests = [];
  const nodes = new Map();
  const documentListeners = {};
  const slotButton = createNode();
  slotButton.getAttribute = () => "synthetic-slot";
  const fitForm = createNode();
  const fitStatus = createNode();
  const fitButton = createNode();
  fitForm.querySelector = (selector) => selector === "[data-fit-call-status]" ? fitStatus : fitButton;
  const document = {
    title: "Synthetic booking test",
    readyState: "loading",
    head: { appendChild() {} }, // Never fetch an analytics script.
    createElement: () => ({}),
    addEventListener(event, listener) { documentListeners[event] = listener; },
    querySelector: (selector) => selector === "[data-fit-call-form]" ? fitForm : null,
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, createNode());
      return nodes.get(id);
    }
  };
  document.getElementById("availability-root").querySelectorAll = () => [slotButton];
  const context = vm.createContext({
    document,
    location: new URL(`https://aissistedconsulting.com/book/?${campaignQuery}`),
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    URL,
    URLSearchParams,
    console,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    FormData: class { get(key) { return FORM_VALUES[key] ?? ""; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent() {},
    async fetch(url, options) {
      if (url === "/api/book/availability?days=14") {
        return Response.json({
          ok: true,
          slots: [{
            slotId: "synthetic-slot",
            startsAt: "2030-01-01T15:00:00.000Z",
            endsAt: "2030-01-01T16:00:00.000Z",
            timezone: "America/New_York",
            label: "Synthetic slot",
            status: "available"
          }]
        });
      }
      assert.equal(url, formType === "checkout" ? "/api/book/create-checkout" : "/api/book/fit-call");
      requests.push(JSON.parse(options.body));
      return Response.json({ ok: true, checkoutUrl: "https://example.invalid/synthetic-checkout" });
    }
  });
  context.window = context;

  if (attributionMode !== "missing-tracker") {
    const trackingSource = readFileSync("assets/aic-google-ads-tracking.js", "utf8");
    if (attributionMode === "stored-landing") {
      context.location = new URL(`https://aissistedconsulting.com/small-business-ai-help/?${campaignQuery}`);
    }
    vm.runInContext(trackingSource, context);
    documentListeners.DOMContentLoaded();
    if (attributionMode === "stored-landing") {
      // A later page load retains the landing touch in browser storage.
      context.location = new URL("https://aissistedconsulting.com/book/?entry_route=home&cta_id=home_hero_paid_plan");
      vm.runInContext(trackingSource, context);
      documentListeners.DOMContentLoaded();
    }
  }

  vm.runInContext(readFileSync(formType === "checkout" ? "book/booking.js" : "book/fit-call.js", "utf8"), context);
  if (formType === "checkout") {
    await new Promise(setImmediate);
    slotButton.listeners.click();
  }
  const form = formType === "checkout" ? nodes.get("booking-form") : fitForm;
  await form.listeners.submit({ preventDefault() {} });
  assert.equal(requests.length, 1, "the browser form must submit exactly one request");
  return requests[0];
}

async function relayAttribution(formType, request) {
  if (formType === "checkout") {
    const config = getBookingConfig({
      BOOKING_CHECKOUT_ENABLED: "true",
      ACTIVE_BOOKING_RELEASE: "legacy_v1_2026_04_06",
      STRIPE_BOOKING_PRICE_ID: "price_legacy_test"
    }, "https://aissistedconsulting.com");
    const normalized = normalizeCheckoutPayload(request, config);
    return buildCrmAttribution({ sourcePage: normalized.sourcePage, fallbackPath: "/book/" });
  }

  delete globalThis.__aissistedBookingStore;
  const env = {
    FIT_CALL_REQUESTS_ENABLED: "true",
    AIC_CRM_INTAKE_URL: "https://crm.example.invalid/intake/website",
    AIC_CRM_INTAKE_TOKEN: "synthetic-token"
  };
  const originalFetch = globalThis.fetch;
  let crmPayload;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), env.AIC_CRM_INTAKE_URL);
    crmPayload = JSON.parse(options.body);
    return Response.json({ ok: true, submission: { id: "synthetic-fit-call" } });
  };
  try {
    const response = await requestFitCall({
      request: new Request("https://aissistedconsulting.com/api/book/fit-call", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://aissistedconsulting.com" },
        body: JSON.stringify(request)
      }),
      env
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.ok(crmPayload, "the fit-call route must relay the browser request");
    return crmPayload;
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__aissistedBookingStore;
  }
}

for (const formType of ["checkout", "fit-call"]) {
  for (const attributionMode of ["current-query", "stored-landing"]) {
    test(`${formType} request preserves ${attributionMode} attribution for the CRM relay`, async () => {
      const request = await submitForm(formType, attributionMode);
      assert.ok(request.sourcePage.length > 160 && request.sourcePage.length <= 500);
      const attribution = await relayAttribution(formType, request);
      assert.equal(attribution.sourcePage, request.sourcePage);
      assert.equal(attribution.utmSource, "google");
      assert.equal(attribution.utmMedium, "cpc");
      assert.equal(attribution.utmCampaign, "synthetic-campaign");
      assert.equal(attribution.gclid, SYNTHETIC_CLICK_ID);
      assert.equal(attribution.landingPage, attributionMode === "stored-landing"
        ? "https://aissistedconsulting.com/small-business-ai-help/"
        : "https://aissistedconsulting.com/book/");
      if (formType === "checkout" && attributionMode === "stored-landing") {
        assert.equal(request.measurement.entryRoute, "home");
        assert.equal(request.measurement.ctaId, "home_hero_paid_plan");
      }
    });
  }

  test(`${formType} still submits when the attribution tracker is unavailable`, async () => {
    const request = await submitForm(formType, "missing-tracker");
    assert.equal(request.sourcePage, formType === "checkout" ? "/book/" : "/book/#fit-call");
  });
}


for (const formType of ["checkout", "fit-call"]) {
  test(`${formType} retains structured attribution when the absolute CRM URL reaches its limit`, async () => {
    const expected = {
      gclid: "x".repeat(140),
      utm_source: "s".repeat(110),
      utm_medium: "m".repeat(110),
      utm_campaign: "c".repeat(80)
    };
    const request = await submitForm(formType, "current-query", new URLSearchParams(expected).toString());
    assert.equal(request.sourcePage.length, 491);
    assert.ok(new URL(request.sourcePage, "https://aissistedconsulting.com").href.length > 500);
    const attribution = await relayAttribution(formType, request);
    assert.ok(attribution.sourceUrl.length <= 500, "receiver's absolute source URL budget includes the origin");
    assert.equal(attribution.sourcePage, request.sourcePage, "retain the full allowed source page");
    assert.equal(attribution.gclid, expected.gclid);
    assert.equal(attribution.utmSource, expected.utm_source);
    assert.equal(attribution.utmMedium, expected.utm_medium);
    assert.equal(attribution.utmCampaign, expected.utm_campaign);
    const boundedUrl = new URL(attribution.sourceUrl);
    assert.equal(boundedUrl.origin, "https://aissistedconsulting.com");
    assert.equal(boundedUrl.pathname, "/book/");
    for (const [key, value] of boundedUrl.searchParams) assert.equal(value, expected[key], "never cut a parameter value");
    assert.equal(boundedUrl.searchParams.get("utm_campaign"), null, "oversized URL details remain available in structured fields");
  });
}
