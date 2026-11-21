(function () {
  "use strict";

  // This script precedes Google on inquiry pages. Consent is optional and separate
  // from permission to reply. Never load an advertising SDK before an opt-in.
  var consent = false;
  var sent = new Set();
  var storageKey = "aic_lead_receipts_v1";
  var config = window.AIC_LEAD_TRACKING_CONFIG || {};
  var metaReady = false;
  var openaiReady = false;
  window.AIC_REQUIRE_MEASUREMENT_CONSENT = true;

  function suppressed() {
    return !["https://aissistedconsulting.com", "https://www.aissistedconsulting.com"]
      .includes(String(window.location.origin || "").toLowerCase());
  }

  function attempt(callback) {
    try { callback(); } catch (_) { /* A tracker must never affect the receipt. */ }
  }

  function load(src) {
    var script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
  }

  function initializePixels() {
    if (!consent || suppressed()) return;
    if (!metaReady && /^[0-9]+$/.test(config.metaPixelId || "")) {
      if (!window.fbq) {
        var fbq = function () {
          if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
          else fbq.queue.push(arguments);
        };
        fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
        window.fbq = fbq;
        window._fbq = window._fbq || fbq;
        load("https://connect.facebook.net/en_US/fbevents.js");
      }
      window.fbq("consent", "grant");
      window.fbq("set", "autoConfig", false, config.metaPixelId);
      window.fbq("init", config.metaPixelId);
      metaReady = true;
    }
    if (!openaiReady && /^[A-Za-z0-9_-]+$/.test(config.openaiPixelId || "")) {
      if (!window.oaiq) {
        var oaiq = function () { oaiq.q.push(arguments); };
        oaiq.q = [];
        window.oaiq = oaiq;
        load("https://bzrcdn.openai.com/sdk/oaiq.min.js");
      }
      window.oaiq("consent", true);
      window.oaiq("init", { pixelId: config.openaiPixelId });
      openaiReady = true;
    }
  }

  function setConsent(value) {
    consent = value === true;
    if (suppressed()) return;
    attempt(function () {
      if (typeof window.gtag === "function") window.gtag("consent", "update", {
        ad_storage: consent ? "granted" : "denied",
        analytics_storage: consent ? "granted" : "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
    });
    if (consent) {
      if (metaReady) attempt(function () { window.fbq("consent", "grant"); });
      if (openaiReady) attempt(function () { window.oaiq("consent", true); });
      attempt(function () { window.AicAdsTracking?.ensureGoogleTag?.(); });
      attempt(initializePixels);
    } else {
      if (metaReady) attempt(function () { window.fbq("consent", "revoke"); });
      if (openaiReady) attempt(function () { window.oaiq("consent", false); });
    }
  }

  function once(provider, id, callback) {
    var key = provider + ":" + id;
    attempt(function () {
      JSON.parse(window.sessionStorage.getItem(storageKey) || "[]")
        .forEach(function (item) { sent.add(item); });
    });
    if (sent.has(key)) return;
    // SDK calls enqueue synchronously. Persist only after the enqueue succeeds.
    callback();
    sent.add(key);
    attempt(function () {
      window.sessionStorage.setItem(storageKey, JSON.stringify(Array.from(sent).slice(-500)));
    });
  }

  function trackReceipt(inquiryId, detail) {
    if (!consent || suppressed() || typeof inquiryId !== "string" || !inquiryId.trim()) return false;
    var id = inquiryId.trim();
    attempt(initializePixels);
    attempt(function () {
      if (typeof window.AicAdsTracking?.emit !== "function") return;
      once("google", id, function () {
        window.AicAdsTracking.emit("aic_contact_submit", {
          channel: detail?.channel || "website_contact",
          creative_angle: "local_ai_implementation",
          transaction_id: id
        });
      });
    });
    attempt(function () {
      if (!metaReady) return;
      once("meta", id, function () {
        window.fbq("trackSingle", config.metaPixelId, "Lead", {}, { eventID: id });
      });
    });
    attempt(function () {
      if (!openaiReady) return;
      once("openai", id, function () {
        window.oaiq("measure", "lead_created", { type: "customer_action" },
          { event_id: id, opt_out: true });
      });
    });
    attempt(function () {
      if (typeof window.aissistedAxon?.trackGenerateLead !== "function") return;
      once("axon", id, function () { window.aissistedAxon.trackGenerateLead({ currency: "USD", value: 25 }); });
    });
    return true;
  }

  window.AicLeadTracking = {
    hasConsent: function () { return consent; },
    setConsent: setConsent,
    trackReceipt: trackReceipt
  };
  var checkbox = document.querySelector("[data-measurement-consent]");
  if (checkbox) {
    checkbox.addEventListener("change", function () {
      // This is a visit-level choice, not inquiry content. Preserve its visible
      // checked state when the form clears, so pending SDK events aren't revoked.
      checkbox.defaultChecked = checkbox.checked;
      setConsent(checkbox.checked);
    });
  }
})();
