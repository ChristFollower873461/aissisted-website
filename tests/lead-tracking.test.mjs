import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const leadSource = readFileSync(new URL("../assets/aic-lead-tracking.js", import.meta.url), "utf8");
const googleSource = readFileSync(new URL("../assets/aic-google-ads-tracking.js", import.meta.url), "utf8");
function harness({ origin = "https://aissistedconsulting.com", ids = true, throwingStorage = false, storage = new Map() } = {}) {
  const scripts = [], events = [];
  const listeners = new Map();
  const box = { checked: false, addEventListener: (name, fn) => listeners.set(name, fn) };
  const window = {
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
  const context = vm.createContext({ window, document, URLSearchParams, console, setTimeout,
    CustomEvent: class { constructor(type, detail) { this.type = type; this.detail = detail; } } });
  vm.runInContext(leadSource, context);
  vm.runInContext(googleSource, context);
  return { window, scripts, storage, events,
    consent(value) { box.checked = value; listeners.get("change")(); },
    track(id = "inq_test") { return window.AicLeadTracking.trackReceipt(id); },
    meta() { return (window.fbq?.queue || []).filter(a => a[0] === "trackSingle"); },
    openai() { return (window.oaiq?.q || []).filter(a => a[0] === "measure"); },
    google() { return (window.dataLayer || []).filter(a => a[0] === "event" && a[1] === "conversion"); }
  };
}

test("consent is separate, defaults off, revokes and can be granted again", () => {
  const h = harness();
  h.track();
  assert.equal(h.scripts.length, 0);
  h.consent(true);
  assert.equal(h.scripts.length, 3);
  h.track();
  assert.equal(h.google().length, 1);
  assert.equal(h.meta().length, 1);
  assert.equal(h.openai().length, 1);
  assert.equal(h.google()[0][2].transaction_id, "inq_test");
  assert.equal(h.meta()[0][4].eventID, "inq_test");
  assert.equal(h.openai()[0][3].event_id, "inq_test");
  assert.equal(h.openai()[0][2].type, "customer_action");
  h.consent(false);
  h.track("inq_denied");
  assert.equal(h.meta().length, 1);
  h.consent(true);
  h.track("inq_new");
  assert.equal(h.meta().length, 2);
  assert.equal(h.scripts.length, 3);
  assert.equal(h.window.oaiq.q.filter(a => a[0] === "consent").at(-1)[1], true);
});

test("missing IDs never load their SDKs, but existing Google conversion works", () => {
  const h = harness({ ids: false });
  h.consent(true); h.track();
  assert.equal(h.scripts.length, 1);
  assert.match(h.scripts[0], /googletagmanager/);
  assert.equal(h.google().length, 1);
  assert.equal(h.window.fbq, undefined);
  assert.equal(h.window.oaiq, undefined);
});

test("receipt dedupe persists across page reload and blocked storage retains in-page dedupe", () => {
  const h = harness();
  h.consent(true); h.track(); h.track();
  assert.equal(h.meta().length, 1);
  const reload = harness({ storage: h.storage });
  reload.consent(true); reload.track();
  assert.equal(reload.google().length, 0);
  assert.equal(reload.meta().length, 0);
  assert.equal(reload.openai().length, 0);
  const blocked = harness({ throwingStorage: true });
  blocked.consent(true); blocked.track(); blocked.track();
  assert.equal(blocked.meta().length, 1);
});

for (const origin of ["http://localhost:4173", "https://candidate.pages.dev", "https://aissistedconsulting.com.attacker.test", ""]) {
  test("preview remains silent even with configured IDs and consent: " + origin, () => {
    const h = harness({ origin });
    h.consent(true); h.track();
    assert.equal(h.scripts.length, 0);
    assert.equal(h.events.length, 0);
    assert.equal(h.meta().length, 0);
    assert.equal(h.google().length, 0);
  });
}

test("attribution retains workflow form source and permitted click IDs", () => {
  const h = harness();
  const source = h.window.AicAdsTracking.attributionSourcePage("/workflow-check/");
  assert.match(source, /^\/workflow-check\/\?/);
  const url = new URL(source, "https://example.test");
  assert.equal(url.searchParams.get("utm_source"), "meta");
  assert.equal(url.searchParams.get("fbclid"), "test-click");
  assert.equal(url.searchParams.get("oppref"), "test-openai");
});

test("SDK exceptions cannot block other conversions or escape the receipt handler", () => {
  const h = harness();
  h.consent(true);
  h.window.fbq = () => { throw Error("SDK failure"); };
  assert.doesNotThrow(() => h.track());
  assert.equal(h.google().length, 1);
  assert.equal(h.openai().length, 1);
  h.track("");
  assert.equal(h.openai().length, 1);
});
