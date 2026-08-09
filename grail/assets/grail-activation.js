(function (window, document) {
  "use strict";

  var SESSION_ID_PATTERN = /^cs_(?:live|test)_[A-Za-z0-9_-]{8,220}$/;
  var AXON_REPORTED_PREFIX = "grail_axon_checkout_reported:";
  var GOOGLE_REPORTED_PREFIX = "grail_google_checkout_reported:";
  var verifiedCheckout = null;

  function checkoutSessionId() {
    var sessionId = new URLSearchParams(window.location.search).get("session_id") || "";
    return SESSION_ID_PATTERN.test(sessionId) ? sessionId : "";
  }

  function wasReported(prefix, sessionId) {
    try {
      return window.localStorage.getItem(prefix + sessionId) === "1";
    } catch (_error) {
      return false;
    }
  }

  function markReported(prefix, sessionId) {
    try {
      window.localStorage.setItem(prefix + sessionId, "1");
    } catch (_error) {
      // Conversion reporting must not interfere with customer activation.
    }
  }

  async function verifyAndTrackPurchase() {
    var sessionId = checkoutSessionId();
    if (!sessionId) {
      return { tracked: false, reason: "missing_or_invalid_session" };
    }
    if (
      wasReported(AXON_REPORTED_PREFIX, sessionId) &&
      wasReported(GOOGLE_REPORTED_PREFIX, sessionId)
    ) {
      return { tracked: false, reason: "already_reported" };
    }
    var response;
    try {
      response = await window.fetch(
        "/api/grail/checkout-status?session_id=" + encodeURIComponent(sessionId),
        { headers: { accept: "application/json" } }
      );
    } catch (_error) {
      return { tracked: false, reason: "verification_unavailable" };
    }

    if (!response.ok) {
      return { tracked: false, reason: "checkout_not_verified" };
    }

    var payload;
    try {
      payload = await response.json();
    } catch (_error) {
      return { tracked: false, reason: "invalid_verification_response" };
    }

    var checkout = payload && payload.checkout;
    if (!checkout || checkout.verified !== true) {
      return { tracked: false, reason: "checkout_not_verified" };
    }
    verifiedCheckout = checkout;
    var form = document.getElementById("welcomeForm");
    if (form) {
      form.setAttribute("data-grail-plan", checkout.plan);
    }

    var axonTracked = false;
    if (
      !wasReported(AXON_REPORTED_PREFIX, sessionId) &&
      window.aissistedAxon &&
      typeof window.aissistedAxon.trackGenerateLead === "function"
    ) {
      window.aissistedAxon.trackGenerateLead({
        currency: checkout.currency,
        value: checkout.value
      });
      markReported(AXON_REPORTED_PREFIX, sessionId);
      axonTracked = true;
    }

    var googleTracked = false;
    if (
      !wasReported(GOOGLE_REPORTED_PREFIX, sessionId) &&
      window.GrailLaunchTracking &&
      typeof window.GrailLaunchTracking.emit === "function"
    ) {
      window.GrailLaunchTracking.emit("grail_purchase_verified", {
        pricing_plan: checkout.plan,
        channel: "stripe_payment_link",
        creative_angle: "purchase",
        currency: checkout.currency,
        value: checkout.value,
        transaction_id: sessionId,
        axon_conversion: "generate_lead"
      });
      markReported(GOOGLE_REPORTED_PREFIX, sessionId);
      googleTracked = true;
    }

    if (!axonTracked && !googleTracked) {
      return { tracked: false, reason: "already_reported", checkout: checkout };
    }

    return {
      tracked: true,
      axonTracked: axonTracked,
      googleTracked: googleTracked,
      checkout: checkout
    };
  }

  window.GrailActivation = Object.freeze({
    getVerifiedCheckout: function () {
      return verifiedCheckout;
    },
    verifyAndTrackPurchase: verifyAndTrackPurchase
  });

  function initialize() {
    verifyAndTrackPurchase();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
}(window, document));
