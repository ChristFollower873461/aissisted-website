(function () {
  "use strict";

  var STORAGE_KEY = "aic_last_touch";
  var GOOGLE_ADS_TAG_ID = "AW-17956049177";
  var DEFAULT_GOOGLE_ADS_CONVERSIONS = {
    aic_ad_landing_page_view: "",
    aic_contact_click: "",
    aic_contact_submit: {
      label: "AW-17956049177/BxPjCKTg9swcEJmijvJC",
      value: 1,
      currency: "USD"
    },
    aic_booking_checkout_start: "",
    aic_booking_confirmed: {
      label: "AW-17956049177/k5PuCKfg9swcEJmijvJC",
      value: 1,
      currency: "USD"
    },
    aic_phone_click: ""
  };
  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "msclkid"
  ];

  function safeJsonParse(value) {
    try {
      return value ? JSON.parse(value) : {};
    } catch (_error) {
      return {};
    }
  }

  function readStoredTouch() {
    try {
      return safeJsonParse(window.localStorage.getItem(STORAGE_KEY));
    } catch (_error) {
      return {};
    }
  }

  function writeStoredTouch(touch) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(touch));
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(touch));
    } catch (_error) {
      // Tracking is best-effort and must never block forms or checkout.
    }
  }

  function ensureGoogleTag() {
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
    }

    if (!window.__aicGoogleAdsConfigured) {
      window.gtag("config", GOOGLE_ADS_TAG_ID);
      window.__aicGoogleAdsConfigured = true;
    }

    if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + GOOGLE_ADS_TAG_ID + '"]')) {
      var script = document.createElement("script");
      script.async = true;
      script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GOOGLE_ADS_TAG_ID);
      document.head.appendChild(script);
    }
  }

  function currentTouch() {
    var params = new URLSearchParams(window.location.search);
    var touch = {};

    UTM_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value) {
        touch[key] = value.slice(0, 160);
      }
    });

    if (Object.keys(touch).length) {
      touch.captured_at = new Date().toISOString();
      touch.landing_path = window.location.pathname;
      writeStoredTouch(touch);
      return touch;
    }

    return readStoredTouch();
  }

  function pageVariant() {
    if (window.location.pathname.indexOf("/small-business-ai-help") === 0) {
      return "small_business_ai_help";
    }

    if (window.location.pathname.indexOf("/book") === 0) {
      return "booking";
    }

    if (window.location.pathname.indexOf("/contact") === 0) {
      return "contact";
    }

    return "aic_site";
  }

  function conversionLabels() {
    return Object.assign(
      {},
      DEFAULT_GOOGLE_ADS_CONVERSIONS,
      window.AIC_GOOGLE_ADS_CONVERSIONS || {}
    );
  }

  function normalizedConversionLabel(label) {
    var value = String(label || "").trim();
    if (!value) return "";
    if (value.indexOf("/") >= 0) return value;
    return GOOGLE_ADS_TAG_ID + "/" + value;
  }

  function normalizedConversionConfig(eventName, explicitLabel, payload) {
    var configured = explicitLabel || (payload || {}).google_ads_conversion_label || conversionLabels()[eventName];
    if (!configured) return {};

    if (typeof configured === "string") {
      if (configured.indexOf("ads_conversion_") === 0) {
        return { eventName: configured };
      }
      return { sendTo: normalizedConversionLabel(configured) };
    }

    if (typeof configured === "object") {
      return {
        eventName: String(configured.eventName || configured.event_name || "").trim(),
        sendTo: normalizedConversionLabel(configured.sendTo || configured.send_to || configured.label || ""),
        value: configured.value,
        currency: configured.currency
      };
    }

    return {};
  }

  function recordGoogleAdsConversion(eventName, payload, explicitLabel) {
    if (typeof window.gtag !== "function") return false;

    var conversion = normalizedConversionConfig(eventName, explicitLabel, payload);
    if (!conversion.eventName && !conversion.sendTo) return false;

    var conversionPayload = Object.assign({}, payload || {}, {
      event_category: "aic_google_ads",
      event_label: eventName
    });
    if (conversion.sendTo) {
      conversionPayload.send_to = conversion.sendTo;
    }
    if (conversion.value !== undefined && conversion.value !== null && conversion.value !== "") {
      conversionPayload.value = Number(conversion.value);
    }
    if (conversion.currency) {
      conversionPayload.currency = conversion.currency;
    }

    window.gtag("event", conversion.eventName || "conversion", conversionPayload);
    return true;
  }

  function emit(eventName, detail) {
    var touch = currentTouch();
    var payload = Object.assign(
      {
        event: eventName,
        event_name: eventName,
        product: "aissisted_consulting",
        landing_variant: pageVariant(),
        page_path: window.location.pathname,
        page_title: document.title,
        timestamp: new Date().toISOString(),
        utm_source: touch.utm_source || "direct",
        utm_medium: touch.utm_medium || "none",
        utm_campaign: touch.utm_campaign || "aic_google_ads_202607"
      },
      touch,
      detail || {}
    );

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, payload);
    }

    recordGoogleAdsConversion(eventName, payload);
    window.dispatchEvent(new CustomEvent("aic:tracking", { detail: payload }));

    if (new URLSearchParams(window.location.search).get("aic_debug") === "1") {
      console.info("[aic tracking]", payload);
    }

    return payload;
  }

  function bindClicks() {
    document.addEventListener(
      "click",
      function (event) {
        var tracked = event.target.closest("[data-aic-event]");
        if (tracked) {
          emit(tracked.getAttribute("data-aic-event"), {
            cta: tracked.getAttribute("data-aic-cta") || tracked.textContent.trim().slice(0, 80),
            href_domain: tracked.hostname || "",
            href_path: tracked.pathname || "",
            channel: tracked.getAttribute("data-aic-channel") || "website",
            creative_angle: tracked.getAttribute("data-aic-angle") || "site_cta",
            google_ads_conversion_label: tracked.getAttribute("data-google-ads-conversion-label") || ""
          });
          return;
        }

        var phoneLink = event.target.closest('a[href^="tel:"]');
        if (phoneLink) {
          emit("aic_phone_click", {
            cta: phoneLink.textContent.trim().slice(0, 80) || "phone",
            href_path: phoneLink.getAttribute("href"),
            channel: "phone",
            creative_angle: "direct_contact"
          });
        }
      },
      true
    );
  }

  function initialize() {
    ensureGoogleTag();

    if (pageVariant() === "small_business_ai_help") {
      emit("aic_ad_landing_page_view", {
        channel: "google_search",
        creative_angle: "local_ai_implementation"
      });
    }

    bindClicks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }

  window.AicAdsTracking = {
    emit: emit,
    recordGoogleAdsConversion: recordGoogleAdsConversion,
    ensureGoogleTag: ensureGoogleTag
  };
})();
