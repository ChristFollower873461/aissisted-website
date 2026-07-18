import {
  getBookingConfig,
  isGoogleCalendarConfigured,
  isStripeWebhookConfigured
} from "../_lib/config.js";
import { relayWebsiteIntakeToAicCrm } from "../_lib/aic-crm.js";
import { buildCrmAttribution } from "../_lib/crm-attribution.js";
import { createGoogleCalendarBookingEvent } from "../_lib/google-calendar.js";
import { json, methodNotAllowed, unavailable } from "../_lib/http.js";
import {
  sendBookingNotifications,
  sendManualReviewNotification
} from "../_lib/notifications.js";
import { verifyStripeWebhook } from "../_lib/stripe.js";
import { getBookingStore } from "../_lib/storage.js";
import {
  createContactDuplicateFingerprint,
  normalizeContactAudience,
  normalizeContactMessage,
  normalizeEmail,
  sha256Hex
} from "../_lib/transaction-safety.js";

const GRAIL_PAYMENT_LINKS = {
  plink_1TnH36P3Zy09i3ccRpajeOKT: {
    plan: "local_agent",
    planName: "Grail Local Agent"
  },
  plink_1TnH37P3Zy09i3ccsUxHzWZD: {
    plan: "growth",
    planName: "Grail Growth"
  },
  plink_1TuZOKP3Zy09i3ccKKJklwAy: {
    plan: "premium",
    planName: "Grail Premium"
  }
};

function cleanString(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

function getGrailPaymentLinkPlan(session) {
  const paymentLinkId =
    typeof session.payment_link === "string" ? session.payment_link : "";
  const knownPlan = GRAIL_PAYMENT_LINKS[paymentLinkId];
  if (!knownPlan) return null;
  return { ...knownPlan, paymentLinkId };
}

async function handleGrailPaymentLinkCheckout(store, event, env, session, plan) {
  const customer = session.customer_details || {};
  const metadata = session.metadata || {};
  const email = normalizeEmail(customer.email || session.customer_email || "");
  const name = cleanString(customer.name || metadata.customer_name || "Grail customer", 120);
  const phone = cleanString(customer.phone || metadata.customer_phone || "", 40);
  const company = cleanString(metadata.company || metadata.company_name || "", 120);
  const sessionId = cleanString(session.id, 160);
  const audience = normalizeContactAudience("small_business_workflow");
  const message = [
    `${plan.planName} payment completed through Stripe Payment Link.`,
    sessionId ? `Stripe checkout session: ${sessionId}.` : "",
    typeof session.subscription === "string"
      ? `Stripe subscription: ${session.subscription}.`
      : "",
    "Next step: create the Grail customer workspace and collect approved proof sources."
  ].filter(Boolean).join("\n");
  const sourcePage =
    `/grail/activation?utm_source=stripe&utm_medium=payment_link&utm_campaign=grail_first_sales_202607&utm_content=${encodeURIComponent(plan.plan)}`;
  const createdAt = new Date().toISOString();
  const normalized = {
    name,
    email,
    emailNormalized: email,
    phone,
    company,
    audience,
    audienceNormalized: audience,
    message,
    sourcePage,
    consentToSubmit: true
  };
  const duplicateFingerprint = await createContactDuplicateFingerprint(normalized);
  const duplicate = await store.findRecentContactInquiryByDuplicateFingerprint({
    duplicateFingerprint,
    sinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  });

  if (duplicate) {
    await store.logEvent({
      eventType: "stripe.grail_payment_link.duplicate_contact_signal",
      payload: {
        eventId: event.id,
        sessionId,
        inquiryId: duplicate.id,
        plan: plan.plan,
        paymentLinkId: plan.paymentLinkId
      }
    });
    return json({
      ok: true,
      grailCustomerSignal: true,
      duplicate: true,
      inquiryId: duplicate.id
    });
  }

  const inquiry = await store.createContactInquiry({
    ...normalized,
    messageHash: await sha256Hex(normalizeContactMessage(message)),
    duplicateFingerprint,
    consentAt: createdAt,
    createdAt,
    status: "received",
    deliveryStatus: "local_record_only",
    idempotencyRecordId: null
  });
  const crmAttribution = buildCrmAttribution({
    sourcePage,
    fallbackPath: "/grail/activation",
    sourceChannel: "stripe_payment_link",
    formName: "grail-payment-link",
    qualifiedSourceEventId: `stripe-grail-${sessionId || inquiry.id}`
  });
  const crmRelay = await relayWebsiteIntakeToAicCrm(env, {
    name,
    email,
    phone,
    companyName: company,
    inquiryType: "grail_paid_customer",
    message,
    ...crmAttribution,
    consent: true,
    websiteLeaveBlank: ""
  });
  const deliveryStatus = crmRelay.ok
    ? "crm_relay_delivered"
    : crmRelay.skipped
      ? "local_record_only"
      : "crm_relay_failed";

  await store.logEvent({
    eventType: "stripe.grail_payment_link.customer_signal",
    payload: {
      eventId: event.id,
      sessionId,
      inquiryId: inquiry.id,
      deliveryStatus,
      plan: plan.plan,
      planName: plan.planName,
      paymentLinkId: plan.paymentLinkId
    }
  });

  return json({
    ok: true,
    grailCustomerSignal: true,
    inquiryId: inquiry.id,
    deliveryStatus
  });
}

async function handleCompletedCheckout(store, event, config, env) {
  const session = event.data.object;
  const bookingId = session.metadata?.booking_id || "";
  const sessionId = session.id;
  let booking = bookingId
    ? await store.getBookingById(bookingId)
    : await store.getBookingBySessionId(sessionId);

  if (!booking) {
    const grailPlan = getGrailPaymentLinkPlan(session);
    if (grailPlan) {
      return handleGrailPaymentLinkCheckout(store, event, env, session, grailPlan);
    }
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

async function createCalendarEventAfterPayment(store, config, booking) {
  if (!config.googleCalendarCreateEvents || !isGoogleCalendarConfigured(config)) {
    return null;
  }

  try {
    const event = await createGoogleCalendarBookingEvent({ config, booking });
    await store.logEvent({
      bookingId: booking.id,
      eventType: "google_calendar.event_created",
      payload: {
        eventId: event.eventId,
        htmlLink: event.htmlLink
      }
    });
    return event;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown Google Calendar error");
    await store.logEvent({
      bookingId: booking.id,
      eventType: "google_calendar.event_failed",
      payload: { message }
    });
    await sendManualReviewNotification({
      config,
      booking,
      reason: `Google Calendar event was not created: ${message}`,
      eventId: ""
    });
    return null;
  }
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
    await createCalendarEventAfterPayment(store, config, booking);
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
      return handleCompletedCheckout(store, event, config, context.env);
    case "checkout.session.expired":
      return handleSessionOutcome(store, event, "expired", "expired");
    case "checkout.session.async_payment_failed":
      return handleSessionOutcome(store, event, "payment_failed", "failed");
    default:
      return json({ ok: true, ignored: true, type: event.type });
  }
}
