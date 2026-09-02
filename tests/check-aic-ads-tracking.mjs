import { readFileSync, statSync } from "node:fs";
import vm from "node:vm";

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function read(path) {
  return readFileSync(path, "utf8");
}

function assertFile(path) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size === 0) {
    fail(`${path} is missing or empty`);
  } else {
    pass(`${path} exists`);
  }
}

function assertIncludes(path, snippets) {
  const text = read(path);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) {
      fail(`${path} missing required snippet: ${snippet}`);
    }
  }
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

function runTrackingScript({
  url = "https://aissistedconsulting.com/small-business-ai-help/?utm_source=google&utm_medium=cpc&utm_campaign=aic_local_ai_202607&gclid=test-gclid",
  conversions = {}
} = {}) {
  const listeners = {};
  const gtagCalls = [];
  const appendedScripts = [];
  const location = new URL(url);
  const window = {
    location,
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    dataLayer: [],
    AIC_GOOGLE_ADS_CONVERSIONS: conversions,
    dispatchEvent() {}
  };
  const document = {
    title: "Small Business AI Help",
    readyState: "loading",
    head: {
      appendChild(node) {
        appendedScripts.push(node);
      }
    },
    createElement(tagName) {
      return { tagName, async: false, src: "" };
    },
    querySelector() {
      return null;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
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

  vm.runInContext(read("assets/aic-google-ads-tracking.js"), context);
  listeners.DOMContentLoaded();
  window.gtag = (...args) => gtagCalls.push(args);

  return { window, gtagCalls, appendedScripts };
}

function assertConversionBridge() {
  const run = runTrackingScript({
    conversions: {
      aic_contact_submit: "contactLabel123",
      aic_booking_confirmed: { label: "AW-17956049177/bookedLabel456" }
    }
  });

  const contactRecorded = run.window.AicAdsTracking.recordGoogleAdsConversion(
    "aic_contact_submit",
    { inquiry_topic: "small_business_workflow" }
  );
  const bookingRecorded = run.window.AicAdsTracking.recordGoogleAdsConversion(
    "aic_booking_confirmed",
    { confirmation_state: "confirmed" }
  );
  const unconfiguredRecorded = run.window.AicAdsTracking.recordGoogleAdsConversion(
    "aic_phone_click",
    {}
  );

  if (!contactRecorded || !bookingRecorded) {
    fail("AIC bridge did not record configured Google Ads conversions");
  }
  if (unconfiguredRecorded) {
    fail("AIC bridge recorded an unconfigured optional conversion");
  }

  const contactConversion = run.gtagCalls.find(
    (call) => call[0] === "event" && call[1] === "conversion" && call[2].send_to === "AW-17956049177/contactLabel123"
  );
  const bookingConversion = run.gtagCalls.find(
    (call) => call[0] === "event" && call[1] === "conversion" && call[2].send_to === "AW-17956049177/bookedLabel456"
  );

  if (!contactConversion) {
    fail("AIC bridge is missing the normalized contact conversion send_to");
  }
  if (!bookingConversion) {
    fail("AIC bridge is missing the preserved booking conversion send_to");
  }

  pass("AIC Google Ads conversion bridge behavior verified");
}

function assertConfiguredGoogleAdsLabels() {
  const run = runTrackingScript();

  run.window.AicAdsTracking.recordGoogleAdsConversion("aic_contact_submit", {});
  run.window.AicAdsTracking.recordGoogleAdsConversion("aic_booking_confirmed", {});

  const contactConversion = run.gtagCalls.find(
    (call) => call[0] === "event" && call[1] === "conversion" && call[2].send_to === "AW-17956049177/BxPjCKTg9swcEJmijvJC"
  );
  const bookingConversion = run.gtagCalls.find(
    (call) => call[0] === "event" && call[1] === "conversion" && call[2].send_to === "AW-17956049177/k5PuCKfg9swcEJmijvJC"
  );

  if (!contactConversion) {
    fail("Configured AIC contact conversion label is missing");
  }
  if (!bookingConversion) {
    fail("Configured AIC booking conversion label is missing");
  }
  for (const conversion of [contactConversion, bookingConversion].filter(Boolean)) {
    if (conversion[2].value !== 1 || conversion[2].currency !== "USD") {
      fail("Configured AIC conversion is missing its default value or currency");
    }
  }

  pass("Configured AIC Google Ads conversion labels verified");
}

function assertAttributionSourcePage() {
  const run = runTrackingScript();
  const sourcePage = run.window.AicAdsTracking.attributionSourcePage("/contact/");
  const sourceUrl = new URL(sourcePage, "https://aissistedconsulting.com");

  if (sourceUrl.pathname !== "/small-business-ai-help/") {
    fail("AIC bridge did not preserve the paid landing path");
  }
  if (sourceUrl.searchParams.get("utm_source") !== "google") {
    fail("AIC bridge did not preserve utm_source");
  }
  if (sourceUrl.searchParams.get("utm_campaign") !== "aic_local_ai_202607") {
    fail("AIC bridge did not preserve utm_campaign");
  }
  if (sourceUrl.searchParams.get("gclid") !== "test-gclid") {
    fail("AIC bridge did not preserve gclid");
  }

  pass("AIC paid attribution source page verified");
}

function assertAnalyticsConfiguration() {
  const run = runTrackingScript();
  const configs = run.window.dataLayer.filter((call) => call[0] === "config");
  const consent = run.window.dataLayer.find(
    (call) => call[0] === "consent" && call[1] === "default"
  );

  if (!configs.some((call) => call[1] === "G-4PD9VYERRY")) {
    fail("AIC bridge is missing the GA4 measurement destination");
  }
  if (!configs.some((call) => call[1] === "AW-17956049177")) {
    fail("AIC bridge is missing the Google Ads destination");
  }
  if (!consent || consent[2].analytics_storage !== "denied" || !consent[2].region.includes("GB")) {
    fail("AIC bridge is missing restricted-region consent defaults");
  }

  pass("AIC GA4 and restricted-region consent configuration verified");
}

function assertPreviewSuppression(url, label) {
  const run = runTrackingScript({ url });

  if (run.appendedScripts.length !== 0) {
    fail(`${label} appended a production Google tag loader`);
  }
  if (run.window.__aicTrackingSuppressed !== "nonproduction_preview") {
    fail(`${label} did not expose its tracking-suppression state`);
  }
  if (run.window.AicAdsTracking.recordGoogleAdsConversion("aic_booking_confirmed", {})) {
    fail(`${label} recorded a Google Ads conversion`);
  }
  if (run.gtagCalls.length !== 0) {
    fail(`${label} emitted a Google measurement call`);
  }

  pass(`${label} Google measurement suppression verified`);
}

assertFile("assets/aic-google-ads-tracking.js");
assertIncludes("index.html", ["assets/aic-google-ads-tracking.js"]);
assertIncludes("small-business-ai-help/index.html", [
  "assets/aic-google-ads-tracking.js",
  "aic_contact_click"
]);
assertIncludes("family-ai-help/index.html", ["assets/aic-google-ads-tracking.js"]);
assertIncludes("contact/index.html", ["assets/aic-google-ads-tracking.js"]);
assertIncludes("book/index.html", ["assets/aic-google-ads-tracking.js"]);
assertIncludes("book/success/index.html", ["assets/aic-google-ads-tracking.js"]);
assertIncludes("contact/contact.js", [
  "aic_contact_submit",
  "AicAdsTracking.emit",
  "AicAdsTracking?.attributionSourcePage",
  "aissistedAxon"
]);
assertIncludes("book/booking.js", ["aic_booking_checkout_start", "AicAdsTracking.emit"]);
assertIncludes("book/status.js", ["aic_booking_confirmed", "AicAdsTracking.emit", "localStorage", "transaction_id"]);
assertIncludes("assets/aic-google-ads-tracking.js", [
  "AW-17956049177",
  "G-4PD9VYERRY",
  "BxPjCKTg9swcEJmijvJC",
  "k5PuCKfg9swcEJmijvJC",
  "AIC_GOOGLE_ADS_CONVERSIONS",
  "recordGoogleAdsConversion",
  "attributionSourcePage",
  "aic_ad_landing_page_view",
  "aic_contact_submit",
  "aic_booking_confirmed"
]);

assertConversionBridge();
assertConfiguredGoogleAdsLabels();
assertAttributionSourcePage();
assertAnalyticsConfiguration();
assertPreviewSuppression(
  "http://localhost:8788/book/?utm_source=local_qa",
  "AIC local preview"
);
assertPreviewSuppression(
  "https://aissisted-offer-v2-preview.pages.dev/book/?utm_source=hosted_qa",
  "AIC hosted preview"
);
assertPreviewSuppression(
  "https://fd7f6ff.aissisted-offer-v2-preview.pages.dev/book/?utm_source=hosted_qa",
  "AIC immutable hosted preview"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("AIC Google Ads tracking guard passed.");
