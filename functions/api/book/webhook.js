import {
  getBookingConfig,
  isStripeWebhookConfigured
} from "../_lib/config.js";
import { json, methodNotAllowed, unavailable } from "../_lib/http.js";
import {
  sendBookingNotifications,
  sendManualReviewNotification
} from "../_lib/notifications.js";
import { verifyStripeWebhook } from "../_lib/stripe.js";
import { getBookingStore } from "../_lib/storage.js";

async function handleCompletedCheckout(store, event, config) {
  const session = event.data.object;
  const bookingId = session.metadata?.booking_id || "";
  const sessionId = session.id;
  let booking = bookingId
    ? await store.getBookingById(bookingId)
    : await store.getBookingBySessionId(sessionId);

  if (!booking) {
    await store.logEvent({
      eventType: "stripe.checkout.completed.unmatched",
      payload: {
        eventId: event.id,
        sessionId,
        metadata: session.metadata || {}
      }
    });
    return json({ ok: true, ignored: true });
  }

  const confirmationResult = await store.confirmBookingFromCheckout({
    bookingId: booking.id,
    sessionId,
    paymentReference:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_status,
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : "",
    confirmedAt: new Date().toISOString()
  });
  booking = confirmationResult.booking;
  if (!booking) {
    return json({ ok: true, ignored: true });
  }

  await store.logEvent({
    bookingId: booking.id,
    eventType: "stripe.checkout.session.completed",
    payload: {
      eventId: event.id,
      sessionId,
      confirmationState: confirmationResult.state,
      confirmationReason: confirmationResult.reason,
      paymentIntent:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null
    }
  });

  if (confirmationResult.state === "confirmed") {
    await sendBookingNotifications({ config, booking });
  } else if (confirmationResult.state === "manual_review") {
    await sendManualReviewNotification({
      config,
      booking,
      reason: confirmationResult.reason,
      eventId: event.id
    });
  }

  return json({
    ok: true,
    bookingId: booking.id,
    confirmationState: confirmationResult.state,
    reason: confirmationResult.reason
  });
}

async function handleSessionOutcome(store, event, bookingStatus, paymentStatus) {
  const session = event.data.object;
  const booking = await store.markBookingOutcomeBySession({
    sessionId: session.id,
    bookingStatus,
    paymentStatus,
    at: new Date().toISOString()
  });

  await store.logEvent({
    bookingId: booking?.id || null,
    eventType: `stripe.${event.type}`,
    payload: {
      eventId: event.id,
      sessionId: session.id
    }
  });

  return json({ ok: true, bookingId: booking?.id || null });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const url = new URL(context.request.url);
  const config = getBookingConfig(context.env, url.origin);
  if (!isStripeWebhookConfigured(config)) {
    return unavailable(
      "Stripe webhook configuration is incomplete. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET."
    );
  }

  const payload = await context.request.text();
  let event;

  try {
    event = await verifyStripeWebhook(
      payload,
      context.request.headers.get("stripe-signature"),
      config.stripeWebhookSecret
    );
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }

  const store = getBookingStore(context.env);
  await store.cleanupExpiredHolds();

  switch (event.type) {
    case "checkout.session.completed":
      return handleCompletedCheckout(store, event, config);
    case "checkout.session.expired":
      return handleSessionOutcome(store, event, "expired", "expired");
    case "checkout.session.async_payment_failed":
      return handleSessionOutcome(store, event, "payment_failed", "failed");
    default:
      return json({ ok: true, ignored: true, type: event.type });
  }
}
