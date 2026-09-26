import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sources = await Promise.all([
  "../assets/aic-google-ads-tracking.js",
  "../axon-pixel.js"
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

function harness(url, { existingSdk = false, missingOrigin = false } = {}) {
  const location = new URL(url);
  const scripts = [];
  const googleCalls = [];
  const axonCalls = [];
  const events = [];
  const listeners = new Map();
  const sentinel = { event: "existing_unrelated_event" };
  const window = {
    location: missingOrigin ? {
      hostname: location.hostname,
      pathname: location.pathname,
      protocol: location.protocol,
      search: location.search
    } : location,
    localStorage: storage(),
    sessionStorage: storage(),
    dataLayer: [sentinel],
    dispatchEvent: (event) => events.push(event)
  };
  if (existingSdk) {
    window.gtag = (...args) => googleCalls.push(args);
    window.axon = (...args) => axonCalls.push(args);
  }
  const initialGtag = window.gtag;
  const initialAxon = window.axon;
  const document = {
    title: "Synthetic marketing isolation check",
    readyState: existingSdk ? "complete" : "loading",
    head: { appendChild: (script) => scripts.push(script.src) },
    createElement: () => ({ src: "", async: false }),
    querySelector: () => null,
    getElementsByTagName: () => [{
      parentNode: { insertBefore: (script) => scripts.push(script.src) }
    }],
    addEventListener(name, callback) {
      listeners.set(name, [...(listeners.get(name) || []), callback]);
    }
  };
  const context = vm.createContext({
    window, document, URLSearchParams, console,
    CustomEvent: class {
      constructor(type, { detail }) { this.type = type; this.detail = detail; }
    }
  });
  for (const source of sources) vm.runInContext(source, context);
  for (const callback of listeners.get("DOMContentLoaded") || []) callback();
  return {
    window, scripts, googleCalls, axonCalls, events, sentinel, initialGtag, initialAxon,
    rerun: () => vm.runInContext(sources[1], context),
    click() {
      const target = {
        textContent: "Contact us", hostname: location.hostname, pathname: "/contact/",
        getAttribute: (name) => name === "data-aic-event" ? "aic_contact_click" : ""
      };
      for (const callback of listeners.get("click") || []) {
        callback({ target: { closest: (selector) => selector === "[data-aic-event]" ? target : null } });
      }
    }
  };
}

const nonproductionOrigins = [
  "http://localhost:8788", "http://app.localhost:8788", "http://127.0.0.1:8788",
  "http://[::1]:8788", "file://",
  "https://aissisted-offer-v2-preview.pages.dev",
  "https://candidate.aissisted-offer-v2-preview.pages.dev",
  "https://aissisted-website.pages.dev",
  "https://d3004614.aissisted-website.pages.dev",
  "https://codex-test.aissisted-website.pages.dev",
  "https://preview.aissistedconsulting.com",
  "https://aissistedconsulting.com.attacker.invalid",
  "https://unrecognized.invalid",
  "https://aissistedconsulting.com:8443",
  "http://aissistedconsulting.com"
];

for (const origin of nonproductionOrigins) {
  for (const existingSdk of [false, true]) {
    test(`marketing stays silent on ${origin}, existing SDKs: ${existingSdk}`, () => {
      const run = harness(`${origin}/?utm_source=readiness&utm_campaign=synthetic&gclid=synthetic-click`, { existingSdk });
      const ads = run.window.AicAdsTracking;
      run.click();
      const payload = ads.emit("aic_contact_submit", { inquiry_topic: "synthetic" });
      assert.equal(ads.recordGoogleAdsConversion("aic_booking_confirmed", { transaction_id: "synthetic" }), false);
      run.window.aissistedAxon.trackGenerateLead({ currency: "USD", value: 25 });
      run.rerun();
      assert.equal(ads.ensureGoogleTag(), false);
      assert.equal(ads.isTrackingSuppressed(), true);
      assert.deepEqual(run.scripts, [], "no external marketing loader may be inserted");
      assert.deepEqual(run.googleCalls, [], "even an existing Google SDK must stay unused");
      assert.deepEqual(run.axonCalls, [], "even an existing Axon SDK must stay unused");
      assert.deepEqual(run.window.dataLayer, [run.sentinel], "do not publish into an existing measurement queue");
      assert.deepEqual(run.events, [], "do not broadcast synthetic conversions to tracking listeners");
      assert.equal(run.window.gtag, run.initialGtag);
      assert.equal(run.window.axon, run.initialAxon, "do not initialize or replace an Axon SDK");
      assert.equal(payload.event, "aic_contact_submit", "callers retain the locally computed payload");
      assert.equal(payload.utm_source, "readiness");
      const sourcePage = ads.attributionSourcePage("/contact/");
      const attribution = new URL(sourcePage, "https://example.invalid");
      assert.equal(attribution.searchParams.get("utm_source"), "readiness");
      assert.equal(attribution.searchParams.get("utm_campaign"), "synthetic");
      assert.equal(attribution.searchParams.get("gclid"), "synthetic-click");
      assert.ok(sourcePage.length <= 500);
      assert.equal(JSON.parse(run.window.localStorage.getItem("aic_last_touch")).gclid, "synthetic-click");
    });
  }
}

test("a missing origin cannot enable marketing from a production-looking hostname", () => {
  const run = harness("https://aissistedconsulting.com/", { missingOrigin: true, existingSdk: true });
  run.window.AicAdsTracking.emit("aic_contact_submit", {});
  run.window.aissistedAxon.trackGenerateLead({});
  assert.equal(run.window.AicAdsTracking.isTrackingSuppressed(), true);
  assert.deepEqual(run.scripts, []);
  assert.deepEqual(run.googleCalls, []);
  assert.deepEqual(run.axonCalls, []);
  assert.deepEqual(run.events, []);
  assert.deepEqual(run.window.dataLayer, [run.sentinel]);
});

for (const origin of ["https://aissistedconsulting.com", "https://www.aissistedconsulting.com"]) {
  for (const existingSdk of [false, true]) {
    test(`production marketing retains its destinations and events on ${origin}, existing SDKs: ${existingSdk}`, () => {
      const run = harness(`${origin}/?utm_source=google&gclid=synthetic-click`, { existingSdk });
      const ads = run.window.AicAdsTracking;
      assert.equal(ads.isTrackingSuppressed(), false);
      assert.ok(run.scripts.includes("https://www.googletagmanager.com/gtag/js?id=AW-17956049177"));
      if (!existingSdk) {
        assert.ok(run.scripts.includes("https://s.axon.ai/pixel.js"));
        assert.ok(run.scripts.includes("https://res4.applovin.com/p/l/loader.iife.js"));
      }
      run.click();
      ads.emit("aic_contact_submit", { inquiry_topic: "synthetic" });
      assert.equal(ads.recordGoogleAdsConversion("aic_booking_confirmed", { transaction_id: "synthetic" }), true);
      run.window.aissistedAxon.trackGenerateLead({ currency: "eur", value: 12 });
      run.window.aissistedAxon.trackGenerateLead({ currency: "invalid", value: -1 });
      const calls = existingSdk ? run.googleCalls : run.window.dataLayer;
      for (const destination of ["AW-17956049177", "G-4PD9VYERRY"]) {
        assert.ok(calls.some((call) => call[0] === "config" && call[1] === destination));
      }
      const consentIndex = calls.findIndex((call) => call[0] === "consent" && call[1] === "default");
      assert.ok(consentIndex >= 0 && consentIndex < calls.findIndex((call) => call[0] === "config"));
      assert.equal(calls[consentIndex][2].analytics_storage, "denied");
      assert.ok(calls[consentIndex][2].region.includes("GB"));
      for (const eventName of ["aic_ad_landing_page_view", "aic_contact_click", "aic_contact_submit"]) {
        assert.ok(calls.some((call) => call[0] === "event" && call[1] === eventName));
        assert.ok(run.events.some((event) => event.type === "aic:tracking" && event.detail.event === eventName));
      }
      for (const label of ["BxPjCKTg9swcEJmijvJC", "k5PuCKfg9swcEJmijvJC"]) {
        const conversion = calls.find((call) => call[0] === "event" && call[1] === "conversion" && call[2].send_to === `AW-17956049177/${label}`);
        assert.equal(conversion?.[2].currency, "USD");
        assert.equal(conversion?.[2].value, 1);
      }
      const axon = existingSdk ? run.axonCalls : run.window.axon.operationQueue;
      assert.deepEqual(Array.from(axon[0]), ["init"]);
      assert.deepEqual(Array.from(axon[1]), ["track", "page_view"]);
      assert.equal(axon[2][1], "generate_lead");
      assert.equal(axon[2][2].currency, "EUR");
      assert.equal(axon[2][2].value, 12);
      assert.equal(axon[3][2].currency, "USD");
      assert.equal(axon[3][2].value, 25);
      run.rerun();
      assert.equal(axon.length, 4, "loading the wrapper again must not duplicate events");
    });
  }
}
