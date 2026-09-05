import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { onRequest } from "../functions/_middleware.js";

const root = new URL("../", import.meta.url);
const sources = await Promise.all([
  "assets/aic-google-ads-tracking.js", "axon-pixel.js", "grail/assets/grail-launch-tracking.js"
].map((path) => readFile(new URL(path, root), "utf8")));

async function htmlFiles(directory = root, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await htmlFiles(new URL(`${entry.name}/`, directory), `${path}/`));
    else if (entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

test("all unblocked HTML templates keep marketing loading and SDK calls in guarded local scripts", async () => {
  const violations = [];
  for (const path of await htmlFiles()) {
    // Use the real middleware's exclusions, not a duplicate list that can drift.
    // Redirected legacy templates are inspected too: redirects are not isolation.
    const response = await onRequest({
      request: new Request(`https://synthetic.pages.dev/${path}`, {
        headers: { authorization: "Bearer synthetic-local-inventory" }
      }),
      env: { PREVIEW_ACCESS_REQUIRED: "true", PREVIEW_ACCESS_TOKEN: "synthetic-local-inventory" },
      next: async () => new Response("Synthetic static response")
    });
    if ([404, 410].includes(response.status)) continue;
    assert.ok([200, 301].includes(response.status), `${path}: inventory must pass the synthetic preview gate`);
    const html = await readFile(new URL(path, root), "utf8");
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
    let guardedGoogleLoaders = 0;
    for (const [, attributes, body] of scripts) {
      const src = attributes.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] || "";
      if (/googletagmanager\.com|google-analytics\.com|s\.axon\.ai|res4\.applovin\.com/i.test(src)) {
        violations.push(`${path}: direct marketing loader ${src}`);
      }
      if (!src && /\b(?:gtag|axon|fbq)\s*\(|\bwindow\.dataLayer\s*=/.test(body)) {
        violations.push(`${path}: inline marketing SDK call or queue`);
      }
      if (src.includes("aic-google-ads-tracking.js")) {
        guardedGoogleLoaders += 1;
        const resolved = new URL(src, `https://synthetic.pages.dev/${path}`);
        assert.equal(resolved.origin, "https://synthetic.pages.dev", `${path}: shared loader must stay first-party`);
        assert.equal(resolved.pathname, "/assets/aic-google-ads-tracking.js");
      }
    }
    assert.ok(guardedGoogleLoaders <= 1, `${path}: shared Google wrapper must not be loaded twice`);
    if (path.startsWith("grail/") && html.includes("grail-launch-tracking.js")) {
      assert.equal(guardedGoogleLoaders, 1, `${path}: Grail retains its guarded production loader`);
    }
  }
  assert.deepEqual(violations, []);
});

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

function harness(origin, { existingSdk = false, missingOrigin = false } = {}) {
  const location = new URL(`${origin}/grail/?utm_source=readiness&utm_campaign=synthetic&gclid=synthetic-click`);
  const scripts = [], googleCalls = [], axonCalls = [], facebookCalls = [], events = [];
  const listeners = new Map();
  const sentinel = { event: "unrelated-existing-event" };
  const window = {
    location: missingOrigin ? { pathname: location.pathname, search: location.search, hostname: location.hostname } : location,
    localStorage: storage(), sessionStorage: storage(), dataLayer: [sentinel],
    dispatchEvent: (event) => events.push(event)
  };
  if (existingSdk) {
    window.gtag = (...args) => googleCalls.push(args);
    window.axon = (...args) => axonCalls.push(args);
    window.fbq = (...args) => facebookCalls.push(args);
  }
  const document = {
    title: "Synthetic Grail", readyState: "loading",
    addEventListener(name, callback) { listeners.set(name, [...(listeners.get(name) || []), callback]); },
    head: { appendChild: (script) => scripts.push(script.src) },
    createElement: () => ({ src: "", async: false }), querySelector: () => null,
    querySelectorAll: () => [], getElementById: () => null,
    getElementsByTagName: () => [{ parentNode: { insertBefore: (script) => scripts.push(script.src) } }]
  };
  const context = vm.createContext({
    window, document, URLSearchParams, console,
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } }
  });
  // The retained end-of-body Google include executes before the deferred Grail scripts.
  for (const source of sources) vm.runInContext(source, context);
  for (const callback of listeners.get("DOMContentLoaded") || []) callback();
  return { window, scripts, googleCalls, axonCalls, facebookCalls, events, sentinel };
}

const previewOrigins = [
  "http://localhost:8788", "http://app.localhost:8788", "http://127.0.0.1:8788", "http://[::1]:8788", "file://",
  "https://aissisted-offer-v2-preview.pages.dev", "https://candidate.aissisted-offer-v2-preview.pages.dev",
  "https://aissisted-website.pages.dev", "https://6f91e45b.aissisted-website.pages.dev",
  "https://branch.aissisted-website.pages.dev", "https://preview.aissistedconsulting.com",
  "https://aissistedconsulting.com.attacker.invalid", "https://unrecognized.invalid",
  "https://aissistedconsulting.com:8443", "http://aissistedconsulting.com"
];

for (const origin of previewOrigins) {
  for (const existingSdk of [false, true]) {
    test(`Grail stays silent on ${origin}, existing SDKs: ${existingSdk}`, () => {
      const run = harness(origin, { existingSdk });
      run.window.GrailLaunchTracking.emit("grail_activation_submit", { pricing_plan: "post_checkout" });
      assert.equal(run.window.GrailLaunchTracking.recordGoogleAdsConversion("grail_purchase_verified", {
        value: 199, currency: "USD", transaction_id: "synthetic-purchase"
      }), false);
      assert.deepEqual(run.scripts, []);
      assert.deepEqual(run.googleCalls, []);
      assert.deepEqual(run.axonCalls, []);
      assert.deepEqual(run.facebookCalls, []);
      assert.deepEqual(run.events, []);
      assert.deepEqual(run.window.dataLayer, [run.sentinel]);
      const attribution = JSON.parse(run.window.localStorage.getItem("grail_last_touch"));
      assert.equal(attribution.utm_source, "readiness");
      assert.equal(attribution.gclid, "synthetic-click");
    });
  }
}

test("Grail fails closed when the origin is missing even with an existing SDK", () => {
  const run = harness("https://aissistedconsulting.com", { existingSdk: true, missingOrigin: true });
  run.window.GrailLaunchTracking.emit("grail_activation_submit", {});
  assert.equal(run.window.GrailLaunchTracking.recordGoogleAdsConversion("grail_purchase_verified", {}), false);
  assert.deepEqual(run.googleCalls, []);
  assert.deepEqual(run.facebookCalls, []);
  assert.deepEqual(run.events, []);
  assert.deepEqual(run.window.dataLayer, [run.sentinel]);
});

for (const origin of ["https://aissistedconsulting.com", "https://www.aissistedconsulting.com"]) {
  for (const existingSdk of [false, true]) {
    test(`Grail production events and conversions survive shared loading on ${origin}, existing SDKs: ${existingSdk}`, () => {
      const run = harness(origin, { existingSdk });
      run.window.GrailLaunchTracking.emit("grail_activation_submit", { pricing_plan: "post_checkout" });
      assert.equal(run.window.GrailLaunchTracking.recordGoogleAdsConversion("grail_purchase_verified", {
        value: 199, currency: "USD", transaction_id: "synthetic-purchase"
      }), true);
      assert.equal(run.scripts.filter((src) => src.includes("googletagmanager.com/gtag/js")).length, 1);
      const calls = existingSdk ? run.googleCalls : run.window.dataLayer;
      for (const id of ["AW-17956049177", "G-4PD9VYERRY"]) {
        assert.equal(calls.filter((call) => call[0] === "config" && call[1] === id).length, 1);
      }
      assert.ok(calls.some((call) => call[0] === "event" && call[1] === "grail_page_view"));
      assert.ok(calls.some((call) => call[0] === "event" && call[1] === "ads_conversion_Thanks_Page_1"));
      const purchase = calls.find((call) => call[0] === "event" && call[1] === "conversion");
      assert.equal(purchase[2].send_to, "AW-17956049177/RF8hCNjF2tIcEJmijvJC");
      assert.equal(purchase[2].value, 199);
      assert.equal(purchase[2].currency, "USD");
      assert.equal(purchase[2].transaction_id, "synthetic-purchase");
      assert.ok(run.events.some((event) => event.type === "grail:tracking" && event.detail.utm_source === "readiness"));
      if (existingSdk) assert.ok(run.facebookCalls.some((call) => call[0] === "trackCustom" && call[1] === "grail_page_view"));
    });
  }
}
