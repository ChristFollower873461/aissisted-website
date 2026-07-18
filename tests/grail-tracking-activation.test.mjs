import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import vm from "node:vm";

function read(path) {
  return readFileSync(path, "utf8");
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function runTrackingScript() {
  const gtagCalls = [];
  const window = {
    location: new URL("https://aissistedconsulting.com/grail/activation?utm_source=stripe"),
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    dataLayer: [],
    gtag(...args) {
      gtagCalls.push(args);
    },
    dispatchEvent() {}
  };
  const document = {
    title: "Set Up Grail",
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const context = vm.createContext({
    window,
    document,
    console,
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
      }
    }
  });
  vm.runInContext(read("grail/assets/grail-launch-tracking.js"), context);
  return { window, gtagCalls };
}

test("Grail pages retain live purchase, activation, social, and Ads wiring", () => {
  const landing = read("grail/index.html");
  const activation = read("grail/activation.html");

  for (const required of [
    "AW-17956049177",
    "assets/grail-launch-tracking.js",
    "https://buy.stripe.com/28E7sN6EiddJagWadH00006",
    "https://buy.stripe.com/dRm00l5Ae7Tpbl01Hb00007",
    "https://buy.stripe.com/3cIbJ38Mqa1x1Kq3Pj00008",
    "grail-social-card-20260710.png"
  ]) {
    assert.ok(landing.includes(required), `landing missing ${required}`);
  }

  for (const required of [
    "AW-17956049177",
    "assets/grail-launch-tracking.js?v=20260718-2",
    "assets/grail-activation.js?v=20260718-2",
    'fetch("/api/contact/submit"',
    'audience: "booking_or_consult"',
    'sourcePage: "/grail/activation"',
    "Setup signal saved"
  ]) {
    assert.ok(activation.includes(required), `activation missing ${required}`);
  }

  const socialCard = statSync("grail/assets/grail-social-card-20260710.png");
  assert.ok(socialCard.isFile());
  assert.ok(socialCard.size > 0 && socialCard.size < 5 * 1024 * 1024);
});

test("Grail activation records the configured Google Ads conversion", () => {
  const run = runTrackingScript();
  const recorded = run.window.GrailLaunchTracking.recordGoogleAdsConversion(
    "grail_activation_submit",
    { pricing_plan: "post_checkout" }
  );
  const conversion = run.gtagCalls.find(
    (call) => call[0] === "event" && call[1] === "ads_conversion_Thanks_Page_1"
  );

  assert.equal(recorded, true);
  assert.ok(conversion);
  assert.equal(conversion[2].event_category, "grail");
  assert.equal(conversion[2].event_label, "grail_activation_submit");
  assert.equal(
    run.window.GrailLaunchTracking.recordGoogleAdsConversion(
      "grail_checkout_click_premium",
      {}
    ),
    false
  );
});

test("verified Grail purchases send revenue and a transaction ID to Google Ads", () => {
  const run = runTrackingScript();
  const recorded = run.window.GrailLaunchTracking.recordGoogleAdsConversion(
    "grail_purchase_verified",
    {
      pricing_plan: "growth",
      value: 199,
      currency: "USD",
      transaction_id: "cs_test_paidgrail123"
    }
  );
  const conversion = run.gtagCalls.find(
    (call) => call[0] === "event" && call[1] === "conversion"
  );

  assert.equal(recorded, true);
  assert.ok(conversion);
  assert.equal(conversion[2].send_to, "AW-17956049177/RF8hCNjF2tIcEJmijvJC");
  assert.equal(conversion[2].value, 199);
  assert.equal(conversion[2].currency, "USD");
  assert.equal(conversion[2].transaction_id, "cs_test_paidgrail123");
  assert.equal(conversion[2].event_label, "grail_purchase_verified");
});
