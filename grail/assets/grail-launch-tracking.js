(function () {
  "use strict";

  var STORAGE_KEY = "grail_last_touch";
  var GOOGLE_ADS_TAG_ID = "AW-17956049177";
  var DEFAULT_GOOGLE_ADS_CONVERSIONS = {
    grail_activation_submit: {
      eventName: "ads_conversion_Thanks_Page_1"
    },
    grail_book_click: "",
    grail_checkout_click_local_agent: "",
    grail_checkout_click_growth: "",
    grail_checkout_click_premium: ""
  };
  var UTM_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
    "ttclid",
    "msclkid",
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
      // Tracking is best-effort and must never break checkout or activation.
    }
  }

  function getCurrentTouch() {
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
    if (window.location.pathname.indexOf("/grail/activation") === 0) {
      return "activation";
    }

    return "grail_primary";
  }

  function conversionLabels() {
    return Object.assign(
      {},
      DEFAULT_GOOGLE_ADS_CONVERSIONS,
      window.GRAIL_GOOGLE_ADS_CONVERSIONS || {}
    );
  }

  function normalizedConversionLabel(label) {
    var value = String(label || "").trim();
    if (!value) {
      return "";
    }

    if (value.indexOf("/") >= 0) {
      return value;
    }

    return GOOGLE_ADS_TAG_ID + "/" + value;
  }

  function normalizedConversionConfig(eventName, explicitLabel, payload) {
    var configured = explicitLabel || (payload || {}).google_ads_conversion_label || conversionLabels()[eventName];
    if (!configured) {
      return {};
    }

    if (typeof configured === "string") {
      if (configured.indexOf("ads_conversion_") === 0) {
        return { eventName: configured };
      }
      return { sendTo: normalizedConversionLabel(configured) };
    }

    if (typeof configured === "object") {
      return {
        eventName: String(configured.eventName || configured.event_name || "").trim(),
        sendTo: normalizedConversionLabel(configured.sendTo || configured.send_to || configured.label || "")
      };
    }

    return {};
  }

  function recordGoogleAdsConversion(eventName, payload, explicitLabel) {
    if (typeof window.gtag !== "function") {
      return false;
    }

    var conversion = normalizedConversionConfig(eventName, explicitLabel, payload);
    if (!conversion.eventName && !conversion.sendTo) {
      return false;
    }

    var conversionPayload = Object.assign({}, payload || {}, {
      event_category: "grail",
      event_label: eventName
    });
    if (conversion.sendTo) {
      conversionPayload.send_to = conversion.sendTo;
    }

    window.gtag("event", conversion.eventName || "conversion", conversionPayload);
    return true;
  }

  function emit(eventName, detail) {
    var touch = getCurrentTouch();
    var payload = Object.assign(
      {
        event: eventName,
        event_name: eventName,
        product: "grail",
        landing_variant: pageVariant(),
        page_path: window.location.pathname,
        page_title: document.title,
        timestamp: new Date().toISOString(),
        utm_source: touch.utm_source || "direct",
        utm_medium: touch.utm_medium || "none",
        utm_campaign: touch.utm_campaign || "grail_first_sales_202607",
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

    if (typeof window.fbq === "function") {
      window.fbq("trackCustom", eventName, payload);
    }

    window.dispatchEvent(new CustomEvent("grail:tracking", { detail: payload }));

    if (new URLSearchParams(window.location.search).get("grail_debug") === "1") {
      console.info("[grail tracking]", payload);
    }
  }

  function trackPricingView() {
    var pricing = document.getElementById("pricing");
    if (!pricing || typeof IntersectionObserver !== "function") {
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            emit("grail_pricing_view", {
              pricing_plan: "comparison_view",
              channel: "website",
              creative_angle: "pricing_review",
            });
            observer.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );

    observer.observe(pricing);
  }

  function bindClicks() {
    document.addEventListener(
      "click",
      function (event) {
        var target = event.target.closest("[data-grail-event]");
        if (!target) {
          return;
        }

        emit(target.getAttribute("data-grail-event"), {
          pricing_plan: target.getAttribute("data-grail-plan") || "not_selected",
          cta: target.getAttribute("data-grail-cta") || target.textContent.trim().slice(0, 80),
          href_domain: target.hostname || "",
          href_path: target.pathname || "",
          channel: target.getAttribute("data-grail-channel") || "website",
          creative_angle: target.getAttribute("data-grail-angle") || "site_cta",
          google_ads_conversion_label: target.getAttribute("data-google-ads-conversion-label") || "",
        });
      },
      true
    );

    document.querySelectorAll("[data-grail-form]").forEach(function (form) {
      form.addEventListener(
        "submit",
        function () {
          emit(form.getAttribute("data-grail-form"), {
            pricing_plan: form.getAttribute("data-grail-plan") || "not_selected",
            channel: "post_checkout",
            creative_angle: "activation",
            proof_source_type: "customer_submitted",
          });
        },
        true
      );
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var activationPage = pageVariant() === "activation";

    emit(activationPage ? "grail_activation_start" : "grail_page_view", {
      pricing_plan: activationPage ? "post_checkout" : "not_selected",
      channel: activationPage ? "post_checkout" : "website",
      creative_angle: activationPage ? "activation" : "site_visit",
      proof_source_type: "none_yet",
    });

    bindClicks();
    trackPricingView();
  });

  window.GrailLaunchTracking = {
    emit: emit,
    recordGoogleAdsConversion: recordGoogleAdsConversion
  };
})();
