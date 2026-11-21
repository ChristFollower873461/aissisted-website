import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const leadSource = readFileSync(new URL("../assets/aic-lead-tracking.js", import.meta.url), "utf8");
const googleSource = readFileSync(new URL("../assets/aic-google-ads-tracking.js", import.meta.url), "utf8");
function harness({ origin = "https://aissistedconsulting.com", ids = true, throwingStorage = false, storage = new Map(), gpc = false, matching = false } = {}) {
  const scripts = [], events = [];
  const listeners = new Map();
  const box = { checked: false, addEventListener: (name, fn) => listeners.set(name, fn) };
  const window = {
    navigator: { globalPrivacyControl: gpc },
    fetch: async () => ({ ok: true, json: async () => ({ automatic_advanced_matching_enabled: matching }) }),
    location: { origin, pathname: "/workflow-check/", search: "?utm_source=meta&fbclid=test-click&oppref=test-openai" },
    sessionStorage: {
      getItem(key) { if (throwingStorage) throw Error("blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (throwingStorage) throw Error("blocked"); storage.set(key, value); }
    },
    localStorage: { getItem: () => null, setItem: () => {} },
    AIC_LEAD_TRACKING_CONFIG: ids ? { metaPixelId: "123456", openaiPixelId: "test_pixel" } : {},
    dispatchEvent: event => events.push(event)
  };
  const document = {
    title: "Workflow check", readyState: "complete",
    querySelector: selector => selector === "[data-measurement-consent]" ? box :
      (selector.includes("googletagmanager") && scripts.some(src => src.includes("googletagmanager")) ? {} : null),
    createElement: () => ({}), head: { appendChild: node => scripts.push(node.src) },
    addEventListener() {}
  };
  const context = vm.createContext({ window, document, URLSearchParams, console, setTimeout, clearTimeout, AbortController,
    CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } } });
  if (ids === "configured") vm.runInContext(readFileSync(new URL("../assets/aic-lead-tracking-config.js", import.meta.url), "utf8"), context);
  vm.runInContext(leadSource, context);
  vm.runInContext(googleSource, context);
  return { window, scripts, storage, events, context,
    gpc(value) { window.navigator.globalPrivacyControl = value; },
    track(id = "inq_test") { return window.AicLeadTracking.trackReceipt(id); },
    meta() { return (window.fbq?.queue || []).filter(a => a[0] === "trackSingle"); },
    openai() { return (window.oaiq?.q || []).filter(a => a[0] === "measure"); },
    google() { return (window.dataLayer || []).filter(a => a[0] === "event" && a[1] === "conversion"); }
  };
}

test("measurement defaults on only after a receipt and honors changing GPC", async () => {
  const h = harness();
  assert.equal(h.scripts.length, 0);
  await h.track();
  assert.equal(h.scripts.length, 3);
  assert.equal(h.google().length, 1);
  assert.equal(h.meta().length, 1);
  assert.equal(h.openai().length, 1);
  assert.equal(h.google()[0][2].transaction_id, "inq_test");
  assert.equal(h.meta()[0][4].eventID, "inq_test");
  assert.equal(h.openai()[0][3].event_id, "inq_test");
  assert.equal(h.openai()[0][2].type, "customer_action");
  h.gpc(true);
  await h.track("inq_denied");
  h.window.AicAdsTracking.emit("aic_contact_submit", {});
  assert.equal(h.meta().length, 1);
  assert.equal(h.google().length, 1);
  assert.equal(h.openai().length, 1);
});

test("GPC suppresses all SDK loads and events, without reading receipt storage", async () => {
  const h = harness({ gpc: true, throwingStorage: true });
  assert.equal(await h.track(), false);
  assert.equal(h.scripts.length, 0);
  assert.equal(h.events.length, 0);
  assert.equal(h.window.fbq, undefined);
  assert.equal(h.window.oaiq, undefined);
  assert.equal(h.window.gtag, undefined);
});

test("only boolean true enables the GPC opt-out", async () => {
  for (const gpc of [undefined, false, "true"]) {
    const h = harness({ gpc });
    await h.track();
    assert.equal(h.google().length, 1);
  }
});

test("missing IDs never load their SDKs, but existing Google conversion works", async () => {
  const h = harness({ ids: false });
  await h.track();
  assert.equal(h.scripts.length, 1);
  assert.match(h.scripts[0], /googletagmanager/);
  assert.equal(h.google().length, 1);
  assert.equal(h.window.fbq, undefined);
  assert.equal(h.window.oaiq, undefined);
});

test("receipt dedupe persists across page reload and blocked storage retains in-page dedupe", async () => {
  const h = harness();
  await h.track(); await h.track();
  assert.equal(h.meta().length, 1);
  const reload = harness({ storage: h.storage });
  await reload.track();
  assert.equal(reload.google().length, 0);
  assert.equal(reload.meta().length, 0);
  assert.equal(reload.openai().length, 0);
  const blocked = harness({ throwingStorage: true });
  await blocked.track(); await blocked.track();
  assert.equal(blocked.meta().length, 1);
});

for (const origin of ["http://localhost:4173", "https://candidate.pages.dev", "https://aissistedconsulting.com.attacker.test", ""]) {
  test("preview remains silent even with configured IDs: " + origin, async () => {
    const h = harness({ origin });
    await h.track();
    assert.equal(h.scripts.length, 0);
    assert.equal(h.events.length, 0);
    assert.equal(h.meta().length, 0);
    assert.equal(h.google().length, 0);
  });
}

test("attribution retains workflow form source and permitted click IDs", async () => {
  const h = harness();
  const source = h.window.AicAdsTracking.attributionSourcePage("/workflow-check/");
  assert.match(source, /^\/workflow-check\/\?/);
  const url = new URL(source, "https://example.test");
  assert.equal(url.searchParams.get("utm_source"), "meta");
  assert.equal(url.searchParams.get("fbclid"), "test-click");
  assert.equal(url.searchParams.get("oppref"), "test-openai");
});

test("OpenAI never loads when automatic matching is enabled, unknown, or unavailable", async () => {
  for (const matching of [true, null, "false"]) {
    const h = harness({ matching });
    await h.track();
    assert.equal(h.window.oaiq, undefined);
    assert.equal(h.openai().length, 0);
    assert.equal(h.google().length, 1);
    assert.equal(h.meta().length, 1);
  }
  const failed = harness();
  failed.window.fetch = async () => { throw Error("offline"); };
  await failed.track();
  assert.equal(failed.window.oaiq, undefined);
  assert.equal(failed.google().length, 1);
});

test("GPC enabled during the OpenAI configuration request prevents SDK initialization", async () => {
  const h = harness();
  let resolve;
  h.window.fetch = () => new Promise(done => { resolve = done; });
  const pending = h.track();
  h.gpc(true);
  resolve({ ok: true, json: async () => ({ automatic_advanced_matching_enabled: false }) });
  await pending;
  assert.equal(h.window.oaiq, undefined);
});

test("configured OpenAI ID initializes only after receipt; blank Meta stays off", async () => {
  const h = harness({ ids: "configured" });
  assert.equal(h.scripts.length, 0);
  await h.track();
  assert.equal(h.window.oaiq.q.find(a => a[0] === "init")[1].pixelId, "9EJG5cTw52d5ZtFUAkRz7J");
  assert.equal(h.openai().length, 1);
  assert.equal(h.window.fbq, undefined);
  const blocked = harness({ ids: "configured", gpc: true });
  await blocked.track();
  assert.equal(blocked.scripts.length, 0);
});

test("standalone Google and Axon wrappers honor GPC", async () => {
  const h = harness({ gpc: true });
  delete h.window.AIC_REQUIRE_MEASUREMENT_CONSENT;
  delete h.window.AicLeadTracking;
  h.window.AicAdsTracking.ensureGoogleTag();
  h.window.AicAdsTracking.emit("aic_contact_submit", {});
  vm.runInContext(readFileSync(new URL("../axon-pixel.js", import.meta.url), "utf8"), h.context);
  h.window.aissistedAxon.trackGenerateLead();
  assert.equal(h.scripts.length, 0);
  assert.equal(h.events.length, 0);
  assert.equal(h.window.axon, undefined);
});

test("SDK exceptions cannot block other conversions or escape the receipt handler", async () => {
  const h = harness();
  await h.track();
  h.window.fbq = () => { throw Error("SDK failure"); };
  await assert.doesNotReject(() => h.track("inq_second"));
  assert.equal(h.google().length, 2);
  assert.equal(h.openai().length, 2);
  await h.track("");
  assert.equal(h.openai().length, 2);
});
