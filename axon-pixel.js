(function (window, document) {
  "use strict";

  if (window.__aissistedAxonPixelInitialized) return;
  window.__aissistedAxonPixelInitialized = true;

  var AXON_EVENT_KEY = "9b5458fd-2266-46fe-ad11-76bfcf5ce6ee";
  var isLocalPreview = /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(window.location.hostname);

  (function (targetWindow, targetDocument) {
    var sources = [
      "https://s.axon.ai/pixel.js",
      "https://res4.applovin.com/p/l/loader.iife.js"
    ];

    if (targetWindow.axon) return;

    var axon = targetWindow.axon = function () {
      if (axon.performOperation) {
        axon.performOperation.apply(axon, arguments);
        return;
      }
      axon.operationQueue.push(arguments);
    };

    axon.operationQueue = [];
    axon.ts = Date.now();
    axon.eventKey = AXON_EVENT_KEY;

    if (!isLocalPreview) {
      var firstScript = targetDocument.getElementsByTagName("script")[0];
      sources.forEach(function (source) {
        var script = targetDocument.createElement("script");
        script.async = true;
        script.src = source;
        firstScript.parentNode.insertBefore(script, firstScript);
      });
    }
  }(window, document));

  window.axon("init");

  function trackPageView() {
    window.axon("track", "page_view");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trackPageView, { once: true });
  } else {
    trackPageView();
  }

  window.aissistedAxon = Object.freeze({
    trackGenerateLead: function (options) {
      var settings = options || {};
      var currency = String(settings.currency || "USD").toUpperCase();
      var value = Number(settings.value);

      if (!/^[A-Z]{3}$/.test(currency)) currency = "USD";
      if (!Number.isFinite(value) || value < 0) value = 25;

      window.axon("track", "generate_lead", {
        currency: currency,
        value: value
      });
    }
  });
}(window, document));
