import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { parse } from "parse5";
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
    setAttribute() {},
    scrollIntoView() {},
    reset() {}
  };
}

async function submitForm(formType, attributionMode, campaignQuery = CAMPAIGN_QUERY, browser = {}) {
  const requests = [];
  const nodes = new Map();
  const documentListeners = {};
  const slotButton = createNode();
  slotButton.getAttribute = () => "synthetic-slot";
  const fitForm = createNode();
  const fitStatus = createNode();
  const fitButton = createNode();
  let fitResetCount = 0;
  fitForm.reportValidity = () => true;
  fitForm.reset = () => { fitResetCount += 1; };
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
    location: new URL(`https://aissistedconsulting.com/book/?${browser.query ?? campaignQuery}`),
    localStorage: createStorage(),
    sessionStorage: browser.sessionStorage || createStorage(),
    URL,
    URLSearchParams,
    console,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001", subtle: webcrypto.subtle },
    TextEncoder,
    AbortController,
    setTimeout,
    clearTimeout,
    FormData: class {
      constructor() { this.values = { ...FORM_VALUES }; }
      get(key) { return this.values[key] ?? ""; }
    },
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
      return Response.json(formType === "checkout"
        ? { ok: true, checkoutUrl: "https://example.invalid/synthetic-checkout" }
        : {
          ok: true, inquiryId: "contact_synthetic_fit", status: "pending_manual_review",
          durationMinutes: 15, weeklyCapacity: 2, scheduled: false, paymentRequired: false
        });
    }
  });
  context.window = context;
  if (browser.saved !== undefined) context.sessionStorage.setItem("aic_paid_plan_funnel_v1", browser.saved);

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
  if (formType === "fit-call") {
    assert.equal(fitResetCount, 1, "the actual Fit Call receipt is accepted before resetting");
    assert.match(fitStatus.textContent, /^Request received\./);
    assert.equal(fitButton.disabled, false);
  }
  return requests[0];
}

function publicBookingPairs() {
  const pairs = new Map();
  const root = new URL("../", import.meta.url);
  const files = execFileSync("git", ["ls-files", "-z", "*.html"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  for (const file of files) {
    const visit = (node) => {
      if (node.tagName === "a") {
        const href = node.attrs.find((attr) => attr.name === "href")?.value;
        if (href) {
          const url = new URL(href, `https://aissistedconsulting.com/${file}`);
          if (url.origin === "https://aissistedconsulting.com" && ["/book/", "/book"].includes(url.pathname)
              && (url.searchParams.has("entry_route") || url.searchParams.has("cta_id"))) {
            const pair = { entryRoute: url.searchParams.get("entry_route"), ctaId: url.searchParams.get("cta_id") };
            pairs.set(JSON.stringify(pair), pair);
          }
        }
      }
      for (const child of node.childNodes || []) visit(child);
    };
    visit(parse(readFileSync(new URL(file, root), "utf8")));
  }
  return [...pairs.values()];
}

const savedFunnel = { funnelId: "funnel_original_12345", entryRoute: "home", ctaId: "home_hero_paid_plan" };
const measurementConfig = () => getBookingConfig({
  BOOKING_CHECKOUT_ENABLED: "true", ACTIVE_BOOKING_RELEASE: "legacy_v1_2026_04_06",
  STRIPE_BOOKING_PRICE_ID: "price_legacy_test"
}, "https://aissistedconsulting.com");

test("booking attribution preserves every emitted public CTA pair through browser and server", async (t) => {
  const pairs = publicBookingPairs();
  assert.ok(pairs.length >= 31, "inventory includes the known public CTA surface");
  for (const pair of [...pairs, { entryRoute: "book", ctaId: "book_direct" }, { entryRoute: "other", ctaId: "other" }]) {
    await t.test(`${pair.entryRoute}/${pair.ctaId}`, async () => {
      const query = new URLSearchParams({ entry_route: pair.entryRoute, cta_id: pair.ctaId }).toString();
      const request = await submitForm("checkout", "missing-tracker", "", { query, saved: JSON.stringify(savedFunnel) });
      assert.deepEqual(request.measurement, { ...savedFunnel, ...pair });
      const normalized = normalizeCheckoutPayload(request, measurementConfig());
      assert.equal(normalized.measurement.entryRoute, pair.entryRoute);
      assert.equal(normalized.measurement.ctaId, pair.ctaId);
      assert.equal(normalized.measurement.funnelId, savedFunnel.funnelId);
      assert.equal(normalized.measurement.laneId, FORM_VALUES.routeId);
    });
  }
});

test("booking attribution chooses current parameters atomically instead of borrowing saved credit", async (t) => {
  for (const query of [
    "entry_route=unknown&cta_id=unknown", "entry_route=services", "cta_id=services_hero_paid_plan",
    "entry_route=&cta_id=", "entry_route=services&cta_id=", "entry_route=&cta_id=services_hero_paid_plan",
    "entry_route=services&cta_id=home_hero_paid_plan", "entry_route=home&cta_id=services_hero_paid_plan"
  ]) {
    await t.test(query, async () => {
      const request = await submitForm("checkout", "missing-tracker", "", { query, saved: JSON.stringify(savedFunnel) });
      assert.deepEqual(request.measurement, { ...savedFunnel, entryRoute: "book", ctaId: "book_direct" });
    });
  }
  const retained = await submitForm("checkout", "missing-tracker", "", { query: "utm_source=synthetic", saved: JSON.stringify(savedFunnel) });
  assert.deepEqual(retained.measurement, savedFunnel, "only absent current pair preserves valid session continuity");
});

test("booking attribution tolerates invalid or unavailable funnel storage without inventing a pair", async (t) => {
  for (const saved of ["{", "null", "42", '"text"', "[]", JSON.stringify({ ...savedFunnel, entryRoute: "services" }), JSON.stringify({ ...savedFunnel, ctaId: "unknown" })]) {
    await t.test(saved, async () => {
      const request = await submitForm("checkout", "missing-tracker", "", { query: "", saved });
      assert.equal(request.measurement.entryRoute, "book");
      assert.equal(request.measurement.ctaId, "book_direct");
      assert.match(request.measurement.funnelId, /^funnel_[A-Za-z0-9_-]{8,80}$/);
    });
  }
  const storage = createStorage();
  const unavailable = {
    getItem(key) { if (key === "aic_paid_plan_funnel_v1") throw new Error("Synthetic funnel storage unavailable"); return storage.getItem(key); },
    setItem(key, value) { if (key === "aic_paid_plan_funnel_v1") throw new Error("Synthetic funnel storage unavailable"); storage.setItem(key, value); }
  };
  const request = await submitForm("checkout", "missing-tracker", "", {
    query: "entry_route=contact&cta_id=contact_aside_paid_plan", sessionStorage: unavailable
  });
  assert.equal(request.measurement.entryRoute, "contact");
  assert.equal(request.measurement.ctaId, "contact_aside_paid_plan");
});

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
      if (formType === "fit-call") {
        assert.equal(attribution.qualificationStatus, "unknown");
        assert.equal(attribution.consent, true);
        assert.match(attribution.qualifiedSourceEventId, /^fit-call-/);
      }
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

test("fit-call relay stays unknown when the submission claims a qualification status", async () => {
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
        body: JSON.stringify({
          name: "Pat Owner",
          email: "pat@example.com",
          phone: "352-555-0199",
          company: "Pat's Services",
          routeId: "workflow_improvement",
          reason: "Need a practical follow-up workflow.",
          sourcePage: "/book/?utm_source=internal&utm_medium=qa",
          consentToSubmit: true,
          qualificationStatus: "customer",
          qualification_status: "sales_qualified"
        })
      }),
      env
    });
    assert.equal(response.status, 200);
    assert.equal(crmPayload.qualificationStatus, "unknown");
    assert.equal(crmPayload.inquiryType, "fit_call_request");
    assert.equal(crmPayload.consent, true);
    assert.match(crmPayload.qualifiedSourceEventId, /^fit-call-/);
    assert.equal(crmPayload.utmSource, "internal");
    assert.equal(crmPayload.utmMedium, "qa");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__aissistedBookingStore;
  }
});
