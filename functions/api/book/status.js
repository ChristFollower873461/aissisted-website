import { getBookingConfig, isStripeConfigured } from "../_lib/config.js";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../_lib/http.js";
import { retrieveCheckoutSession } from "../_lib/stripe.js";
import { formatCurrency, formatSlotLabel, maskEmail } from "../_lib/time.js";
import { getBookingStore } from "../_lib/storage.js";

function getConfirmationState(booking, stripeSession) {
  if (booking.bookingStatus === "confirmed") {
    return "confirmed";
  }

  if (booking.bookingStatus === "expired") {
    return "expired";
  }

  if (booking.bookingStatus === "payment_failed") {
    return "failed";
  }

  if (booking.bookingStatus === "manual_review") {
    return "manual_review";
  }

  if (stripeSession?.status === "expired") {
    return "expired";
  }

  if (stripeSession?.payment_status === "paid" || stripeSession?.status === "complete") {
    return "awaiting_webhook";
  }

  return "processing";
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  try {
    const url = new URL(context.request.url);
    const bookingId = url.searchParams.get("booking_id") || "";
    const sessionId = url.searchParams.get("session_id") || "";

    if (!bookingId && !sessionId) {
      return badRequest("A booking_id or session_id query parameter is required.");
    }

    const store = getBookingStore(context.env);
    await store.cleanupExpiredHolds();

    let booking = bookingId ? await store.getBookingById(bookingId) : null;
    if (!booking && sessionId) {
      booking = await store.getBookingBySessionId(sessionId);
    }

    if (!booking) {
      return notFound("Booking record not found.");
    }

    const config = getBookingConfig(context.env, url.origin);
    const effectiveSessionId = sessionId || booking.stripeCheckoutSessionId;
    let stripeSession = null;

    if (
      effectiveSessionId &&
      !["confirmed", "expired", "payment_failed", "manual_review"].includes(
        booking.bookingStatus
      ) &&
      isStripeConfigured(config)
    ) {
      try {
        stripeSession = await retrieveCheckoutSession(config, effectiveSessionId);
        if (stripeSession?.status === "expired") {
          booking = await store.markBookingOutcomeBySession({
            sessionId: effectiveSessionId,
            bookingStatus: "expired",
            paymentStatus: "expired",
            at: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn("[booking] Unable to retrieve Stripe session snapshot.");
      }
    }

    const isVersionedPlan = Number(booking.offerVersion) >= 2;
    const bookingPayload = {
      id: booking.id,
      bookingStatus: booking.bookingStatus,
      paymentStatus: booking.paymentStatus,
      holdExpiresAt: booking.temporaryHoldExpiresAt,
      confirmedAt: booking.confirmedAt,
      offer: {
        releaseId: booking.releaseId || "legacy_v1_2026_04_06",
        offerId: booking.offerId || "legacy_consult_reservation_225",
        offerVersion: booking.offerVersion || 1,
        termsVersion: booking.termsVersion || booking.policyVersion
      },
      feeAmountCents: booking.reservationAmount,
      feeAmountFormatted: formatCurrency(booking.reservationAmount, booking.currency),
      slot: {
        startsAt: booking.selectedTimeWindowStart,
        endsAt: booking.selectedTimeWindowEnd,
        timezone: booking.selectedTimeZone,
        label: formatSlotLabel(
          booking.selectedTimeWindowStart,
          booking.selectedTimeWindowEnd,
          booking.selectedTimeZone
        )
      },
      prospect: {
        name: booking.prospectName,
        emailMasked: maskEmail(booking.prospectEmail),
        company: booking.prospectCompany
      }
    };
    if (isVersionedPlan) {
      bookingPayload.delivery = {
        status: booking.deliverableStatus || "awaiting_payment_confirmation",
        dueAt: booking.deliverableDueAt,
        deliveredAt: booking.deliverableDeliveredAt
      };
    } else {
      bookingPayload.depositCredit = {
        available: booking.depositCreditAvailable,
        amountCents: booking.depositCreditAmount,
        amountFormatted: formatCurrency(booking.depositCreditAmount, booking.currency),
        applied: booking.depositCreditApplied,
        appliedAt: booking.depositCreditAppliedAt,
        invoiceReference: booking.depositCreditAppliedInvoiceReference
      };
    }

    return json({
      ok: true,
      confirmationState: getConfirmationState(booking, stripeSession),
      booking: bookingPayload,
      stripeSession: stripeSession
        ? {
            id: stripeSession.id,
            status: stripeSession.status,
            paymentStatus: stripeSession.payment_status
          }
        : null
    });
  } catch (error) {
    return serverError(error);
  }
}
