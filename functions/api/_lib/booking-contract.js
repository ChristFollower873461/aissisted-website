import {
  buildStripeContractMetadata,
  contractMatchesRelease,
  shouldCreateImplementationCredit
} from "./booking-releases.js";

export function createBookingContractSnapshot({ bookingId, release, acceptedAt, termsSnapshot }) {
  if (!bookingId || !release || !acceptedAt || !termsSnapshot) {
    throw new Error("Booking contract snapshot input is incomplete.");
  }
  const snapshot = {
    bookingId,
    releaseId: release.releaseId,
    offerId: release.offerId,
    offerVersion: release.offerVersion,
    termsVersion: release.termsVersion,
    termsSha256: release.termsSha256,
    termsSnapshotJson: JSON.stringify(termsSnapshot),
    amountCents: release.amountCents,
    currency: release.currency,
    stripeProductRef: release.stripeProductRef,
    stripePriceRef: release.stripePriceRef,
    paymentMethodPolicy: release.paymentMethodPolicy,
    stripePaymentMethodConfigurationRef:
      release.stripePaymentMethodConfigurationRef || "",
    stripeCustomerCopyJson: JSON.stringify({
      title: release.title,
      productDescription: release.stripeDescription,
      receiptDescription: release.stripeReceiptDescription,
      checkoutTermsMessage: release.stripeCheckoutTermsMessage,
      integrationIdentifier: release.stripeIntegrationIdentifier
    }),
    implementationCreditEnabled: release.implementationCreditEnabled,
    implementationCreditTermsJson: shouldCreateImplementationCredit(release)
      ? JSON.stringify({ governedBy: release.termsVersion })
      : null,
    deliveryCalendarId: release.deliveryCalendarId,
    acceptedAt,
    createdAt: acceptedAt
  };
  if (!contractMatchesRelease(snapshot, release)) {
    throw new Error("Booking contract snapshot does not match the selected release.");
  }
  return Object.freeze(snapshot);
}

export function createStripeMetadataForContract(contract) {
  return buildStripeContractMetadata(
    {
      releaseId: contract.releaseId,
      offerId: contract.offerId,
      offerVersion: Number(contract.offerVersion),
      termsVersion: contract.termsVersion,
      termsSha256: contract.termsSha256,
      projectionSha256: contract.projectionSha256 || "0".repeat(64),
      amountCents: Number(contract.amountCents),
      currency: contract.currency,
      paymentMethodPolicy: contract.paymentMethodPolicy || "stored_contract",
      confirmationRequires: contract.confirmationRequires || "paid",
      implementationCreditEnabled: Boolean(contract.implementationCreditEnabled),
      deliveryCalendarId: contract.deliveryCalendarId,
      stripePriceEnvKey: "stored_contract"
    },
    contract.bookingId
  );
}

function lineItemPriceAndProduct(session) {
  const item = session?.line_items?.data?.[0] || null;
  const price = item?.price || null;
  return {
    priceRef: typeof price === "string" ? price : price?.id || "",
    productRef:
      typeof price?.product === "string" ? price.product : price?.product?.id || ""
  };
}

export function validateCheckoutSessionAgainstContract({ session, contract, expectedLivemode }) {
  if (!session || !contract || typeof expectedLivemode !== "boolean") {
    return { ok: false, reasons: ["reconciliation_input_incomplete"] };
  }
  const metadata = session.metadata || {};
  const provider = lineItemPriceAndProduct(session);
  const paymentMethodTypes = Array.isArray(session.payment_method_types)
    ? session.payment_method_types
    : [];
  const checks = [
    [session.livemode === expectedLivemode, "livemode_mismatch"],
    [session.id === contract.stripeCheckoutSessionId, "session_id_mismatch"],
    [session.payment_status === "paid", "payment_not_paid"],
    [Number(session.amount_total) === Number(contract.amountCents), "amount_mismatch"],
    [String(session.currency || "").toLowerCase() === contract.currency, "currency_mismatch"],
    [provider.priceRef === contract.stripePriceRef, "price_mismatch"],
    [provider.productRef === contract.stripeProductRef, "product_mismatch"],
    [
      contract.paymentMethodPolicy !== "synchronous_card_only" ||
        (paymentMethodTypes.length === 1 && paymentMethodTypes[0] === "card"),
      "payment_method_policy_mismatch"
    ],
    [metadata.booking_id === contract.bookingId, "booking_metadata_mismatch"],
    [metadata.release_id === contract.releaseId, "release_metadata_mismatch"],
    [metadata.offer_id === contract.offerId, "offer_metadata_mismatch"],
    [Number(metadata.offer_version) === Number(contract.offerVersion), "offer_version_metadata_mismatch"],
    [metadata.terms_version === contract.termsVersion, "terms_version_metadata_mismatch"],
    [metadata.terms_sha256 === contract.termsSha256, "terms_hash_metadata_mismatch"]
  ];
  const reasons = checks.filter(([ok]) => !ok).map(([, reason]) => reason);
  return { ok: reasons.length === 0, reasons };
}
