(function () {
  "use strict";

  // This script precedes Google on inquiry pages. Load measurement only after
  // a successful receipt, and never when Global Privacy Control is enabled.
  var receiptAccepted = false;
  var sent = new Set();
  var storageKey = "aic_lead_receipts_v1";
  var config = window.AIC_LEAD_TRACKING_CONFIG || {};
  var metaReady = false;
  var openaiReady = false;
  var openaiCheck;
  window.AIC_REQUIRE_MEASUREMENT_CONSENT = true;

  function suppressed() {
    return !["https://aissistedconsulting.com", "https://www.aissistedconsulting.com"]
      .includes(String(window.location.origin || "").toLowerCase());
  }

  function hasConsent() {
    return receiptAccepted && window.navigator?.globalPrivacyControl !== true;
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
    if (!hasConsent() || suppressed()) return;
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
  }

  async function initializeOpenAI() {
    if (!hasConsent() || suppressed() || !/^[A-Za-z0-9_-]+$/.test(config.openaiPixelId || "")) return false;
    if (openaiReady) return true;
    if (!openaiCheck) {
      openaiCheck = (async function () {
        // OpenAI's SDK reads this public configuration itself. Fail closed:
        // never load it while account-side automatic field matching is on.
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 3000);
        try {
          var response = await window.fetch("https://bzrcdn.openai.com/pixel-config/v1/" +
            encodeURIComponent(config.openaiPixelId) + ".json", {
            credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
            signal: controller.signal
          });
          if (!response.ok) return false;
          var settings = await response.json();
          if (settings?.automatic_advanced_matching_enabled !== false ||
              !hasConsent() || suppressed()) return false;
          if (!window.oaiq) {
            var oaiq = function () { oaiq.q.push(arguments); };
            oaiq.q = [];
            window.oaiq = oaiq;
            load("https://bzrcdn.openai.com/sdk/oaiq.min.js");
          }
          window.oaiq("consent", true);
          window.oaiq("init", { pixelId: config.openaiPixelId });
          openaiReady = true;
          return true;
        } catch (_) {
          return false;
        } finally {
          clearTimeout(timeout);
        }
      })();
    }
    return openaiCheck;
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

  async function trackReceipt(inquiryId, detail) {
    if (window.navigator?.globalPrivacyControl === true || suppressed() ||
        typeof inquiryId !== "string" || !inquiryId.trim()) return false;
    var id = inquiryId.trim();
    receiptAccepted = true;
    attempt(function () { window.AicAdsTracking?.ensureGoogleTag?.(); });
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
    var openaiTask = initializeOpenAI().then(function (ready) {
      if (!ready || !hasConsent() || suppressed()) return;
      attempt(function () {
        once("openai", id, function () {
          window.oaiq("measure", "lead_created", { type: "customer_action" },
            { event_id: id, opt_out: true });
        });
      });
    }).catch(function () {});

    attempt(function () {
      if (typeof window.aissistedAxon?.trackGenerateLead !== "function") return;
      once("axon", id, function () { window.aissistedAxon.trackGenerateLead({ currency: "USD", value: 25 }); });
    });
    await openaiTask;
    return true;
  }

  window.AicLeadTracking = {
    hasConsent: hasConsent,
    trackReceipt: trackReceipt
  };
})();
