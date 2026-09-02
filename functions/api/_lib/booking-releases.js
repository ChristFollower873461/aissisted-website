const SHA256_HEX = /^[a-f0-9]{64}$/;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const BOOKING_RELEASES = deepFreeze({
  legacy_v1_2026_04_06: {
    releaseId: "legacy_v1_2026_04_06",
    offerId: "legacy_consult_reservation_225",
    offerVersion: 1,
    termsVersion: "2026-04-06",
    termsSha256: "b1b1a3e77b56aa7023623751e3c981d9adf4be00542f3cf4fe152eabfe685d06",
    projectionSha256: "a5f83547c941e68a6c4f42b6949bcff655635957779071f54baafc38c9712144",
    amountCents: 22500,
    currency: "usd",
    sessionMinutes: 60,
    paymentMethodPolicy: "legacy_provider_default",
    confirmationRequires: "checkout_session_completed",
    implementationCreditEnabled: true,
    deliveryCalendarId: "legacy_no_plan_delivery_calendar",
    title: "60-Minute AI Consult Reservation",
    stripeDescription: "Non-refundable $225 deposit for a 60-minute session with PJ Standley. Credited once toward service if you become a customer.",
    stripeReceiptDescription: "60-Minute AI Consult Reservation",
    stripeCheckoutTermsMessage: "",
    stripeIntegrationIdentifier: "",
    intakeRouteIds: [],
    stripeProductRef: "prod_UHv1U1ZmK4E51z",
    stripePriceEnvKey: "STRIPE_BOOKING_PRICE_ID"
  },
  aissisted_booking_v2_2026_08_15: {
    releaseId: "aissisted_booking_v2_2026_08_15",
    offerId: "workflow_map_build_discovery_225",
    offerVersion: 2,
    termsVersion: "workflow_map_build_discovery_225_terms_2026-08-15_v1",
    termsSha256: "4902ccab0f6fa2872b32e8dcf2ae4ec6b9145deadc92194b13cdc7ccaef35b2c",
    projectionSha256: "54352234514bcffebdf0a5436aef9c4044d72338af144af4e4738ed45371be74",
    amountCents: 22500,
    currency: "usd",
    sessionMinutes: 60,
    paymentMethodPolicy: "synchronous_card_only",
    confirmationRequires: "paid",
    implementationCreditEnabled: false,
    deliveryCalendarId: "aissisted_us_federal_observed_2026_v1",
    title: "Workflow Map & First-Build Plan",
    stripeDescription: "A 60-minute founder-led working session and a founder-reviewed one-page plan, delivered under the accepted terms.",
    stripeReceiptDescription: "Workflow Map & First-Build Plan: 60-minute working session plus one founder-reviewed one-page plan.",
    stripeCheckoutTermsMessage: "By paying, you agree to the terms accepted on the AIssisted Consulting booking page. The $225 fee covers the session and plan and creates no implementation credit.",
    stripeIntegrationIdentifier: "aissisted_booking_v2_lwlonxpv",
    intakeRouteIds: ["workflow_improvement", "custom_development"],
    stripeProductEnvKey: "BOOKING_V2_STRIPE_PRODUCT_ID",
    stripePriceEnvKey: "BOOKING_V2_STRIPE_PRICE_ID",
    stripePaymentMethodConfigurationEnvKey: "BOOKING_V2_PAYMENT_METHOD_CONFIGURATION_ID"
  }
});

function strictBoolean(value) {
  if (value === true || value === "true" || value === "1") {
    return { valid: true, value: true };
  }
  if (value === false || value === "false" || value === "0") {
    return { valid: true, value: false };
  }
  return { valid: false, value: false };
}

function validateReleaseRecord(record) {
  return Boolean(
    record &&
      record.releaseId &&
      record.offerId &&
      Number.isInteger(record.offerVersion) &&
      record.offerVersion > 0 &&
      record.termsVersion &&
      SHA256_HEX.test(record.termsSha256) &&
      SHA256_HEX.test(record.projectionSha256) &&
      Number.isInteger(record.amountCents) &&
      record.amountCents > 0 &&
      /^[a-z]{3}$/.test(record.currency) &&
      typeof record.paymentMethodPolicy === "string" &&
      typeof record.implementationCreditEnabled === "boolean" &&
      record.deliveryCalendarId &&
      record.title &&
      record.stripeDescription &&
      record.stripeReceiptDescription &&
      Array.isArray(record.intakeRouteIds) &&
      record.stripePriceEnvKey &&
      (record.paymentMethodPolicy !== "synchronous_card_only" ||
        (record.stripeCheckoutTermsMessage &&
          record.stripeIntegrationIdentifier &&
          record.stripePaymentMethodConfigurationEnvKey))
  );
}

export function resolveBookingControls(env = {}) {
  const checkoutFlag = strictBoolean(env.BOOKING_CHECKOUT_ENABLED);
  if (!checkoutFlag.valid) {
    return { checkoutEnabled: false, reason: "invalid_or_missing_checkout_flag", release: null };
  }
  if (!checkoutFlag.value) {
    return { checkoutEnabled: false, reason: "checkout_kill_switch", release: null };
  }

  const releaseId = String(env.ACTIVE_BOOKING_RELEASE || "").trim();
  if (!releaseId || releaseId === "disabled") {
    return { checkoutEnabled: false, reason: "release_disabled_or_missing", release: null };
  }

  const record = BOOKING_RELEASES[releaseId];
  if (!validateReleaseRecord(record)) {
    return { checkoutEnabled: false, reason: "unknown_or_malformed_release", release: null };
  }

  const stripePriceRef = String(env[record.stripePriceEnvKey] || "").trim();
  const stripeProductRef = record.stripeProductRef || String(env[record.stripeProductEnvKey] || "").trim();
  const stripePaymentMethodConfigurationRef = record.stripePaymentMethodConfigurationEnvKey
    ? String(env[record.stripePaymentMethodConfigurationEnvKey] || "").trim()
    : "";
  if (
    !stripePriceRef ||
    !stripeProductRef ||
    (record.paymentMethodPolicy === "synchronous_card_only" &&
      !stripePaymentMethodConfigurationRef)
  ) {
    return { checkoutEnabled: false, reason: "release_provider_refs_missing", release: null };
  }

  return {
    checkoutEnabled: true,
    reason: null,
    release: deepFreeze({
      ...record,
      stripePriceRef,
      stripeProductRef,
      stripePaymentMethodConfigurationRef
    })
  };
}

export function resolveFitCallControls(env = {}) {
  const flag = strictBoolean(env.FIT_CALL_REQUESTS_ENABLED);
  return flag.valid
    ? { enabled: flag.value, reason: flag.value ? null : "fit_call_disabled" }
    : { enabled: false, reason: "invalid_or_missing_fit_call_flag" };
}

export function shouldCreateImplementationCredit(contract) {
  return contract?.implementationCreditEnabled === true;
}

export function buildStripeContractMetadata(release, bookingId) {
  if (!validateReleaseRecord(release) || !bookingId) {
    throw new Error("A valid release and booking ID are required for Stripe metadata.");
  }
  return {
    booking_id: bookingId,
    release_id: release.releaseId,
    offer_id: release.offerId,
    offer_version: String(release.offerVersion),
    terms_version: release.termsVersion,
    terms_sha256: release.termsSha256
  };
}

export function contractMatchesRelease(contract, release) {
  if (!contract || !validateReleaseRecord(release)) {
    return false;
  }
  return (
    contract.releaseId === release.releaseId &&
    contract.offerId === release.offerId &&
    Number(contract.offerVersion) === release.offerVersion &&
    contract.termsVersion === release.termsVersion &&
    contract.termsSha256 === release.termsSha256 &&
    Number(contract.amountCents) === release.amountCents &&
    String(contract.currency || "").toLowerCase() === release.currency &&
    contract.stripeProductRef === release.stripeProductRef &&
    contract.stripePriceRef === release.stripePriceRef &&
    contract.paymentMethodPolicy === release.paymentMethodPolicy &&
    String(contract.stripePaymentMethodConfigurationRef || "") ===
      String(release.stripePaymentMethodConfigurationRef || "") &&
    contract.stripeCustomerCopyJson === JSON.stringify({
      title: release.title,
      productDescription: release.stripeDescription,
      receiptDescription: release.stripeReceiptDescription,
      checkoutTermsMessage: release.stripeCheckoutTermsMessage,
      integrationIdentifier: release.stripeIntegrationIdentifier
    }) &&
    contract.implementationCreditEnabled === release.implementationCreditEnabled &&
    contract.deliveryCalendarId === release.deliveryCalendarId
  );
}
