import {
  getBookingConfig,
  isGoogleCalendarConfigured,
  isStripeWebhookConfigured
} from "../_lib/config.js";
import { relayWebsiteIntakeToAicCrm } from "../_lib/aic-crm.js";
import { buildCrmAttribution } from "../_lib/crm-attribution.js";
import { getGrailPaymentLinkPlan } from "../_lib/grail.js";
import { createGoogleCalendarBookingEvent } from "../_lib/google-calendar.js";
import {
  provisionGrailWorkspace,
  syncGrailWorkspaceSubscriptionStatus
} from "../_lib/grail-workspaces.js";
import { json, methodNotAllowed, unavailable } from "../_lib/http.js";
import {
  sendBookingNotifications,
  sendGrailWorkspaceAccessEmail,
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

function cleanString(value, limit = 500) {
  return String(value || "").trim().slice(0, limit);
}

async function provisionAndNotifyGrailWorkspace({
  store,
  event,
  config,
  env,
  session,
  plan,
  contact,
  inquiry
}) {
  let workspaceProvision;
  try {
    workspaceProvision = await provisionGrailWorkspace({ env, session, plan, contact });
    await store.logEvent({
      eventType: workspaceProvision.ok
        ? "grail.workspace.provisioned"
        : "grail.workspace.provision_skipped",
      payload: {
        eventId: event.id,
        inquiryId: inquiry.id,
        workspaceId: workspaceProvision.workspaceId || "",
        created: workspaceProvision.created === true,
        reason: workspaceProvision.reason || ""
      }
    });
  } catch (error) {
    workspaceProvision = {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "workspace_provision_failed"
    };
    await store.logEvent({
      eventType: "grail.workspace.provision_failed",
      payload: {
        eventId: event.id,
        inquiryId: inquiry.id,
        reason: workspaceProvision.reason
      }
    });
  }

  if (workspaceProvision.ok && workspaceProvision.accessCode) {
    const workspaceEmail = await sendGrailWorkspaceAccessEmail({
      config,
      eventId: event.id,
      contact,
      plan,
      accessCode: workspaceProvision.accessCode
    });
    await store.logEvent({
      eventType: `notification.grail_workspace_access.${workspaceEmail.status}`,
      payload: {
        eventId: event.id,
        inquiryId: inquiry.id,
        workspaceId: workspaceProvision.workspaceId || "",
        provider: workspaceEmail.provider,
        providerMessageId: workspaceEmail.providerMessageId || "",
        reason: workspaceEmail.reason || ""
      }
    });
  }

  return workspaceProvision;
}

async function handleGrailPaymentLinkCheckout(store, event, config, env, session, plan) {
  const customer = session.customer_details || {};
  const metadata = session.metadata || {};
  const email = normalizeEmail(customer.email || session.customer_email || "");
  const fitCheckReference = cleanString(session.client_reference_id, 200);
  const fitCheckInquiry = /^inq_[A-Za-z0-9_-]+$/.test(fitCheckReference)
    ? await store.getContactInquiryById(fitCheckReference)
    : null;
  const linkedFitCheck =
    fitCheckInquiry && fitCheckInquiry.emailNormalized === email ? fitCheckInquiry : null;
  const name = cleanString(
    customer.name || linkedFitCheck?.name || metadata.customer_name || "Grail customer",
    120
  );
  const phone = cleanString(customer.phone || metadata.customer_phone || "", 40);
  const company = cleanString(
    linkedFitCheck?.company || metadata.company || metadata.company_name || "",
    120
  );
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
  const webhookIdempotency = await store.startIdempotencyRecord({
    commandId: "stripe.grail_payment_link.checkout",
    risk: "external_financial_signal",
    idempotencyKeyHash: await sha256Hex(`stripe-event:${event.id}`),
    requestFingerprint: await sha256Hex(
      `stripe-event:${event.id}:${sessionId}:${plan.plan}`
    ),
    requestSummaryJson: JSON.stringify({
      eventId: event.id,
      sessionId,
      plan: plan.plan
    }),
    targetType: "stripe_event",
    targetId: event.id,
    createdAt,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  });
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
    const workspaceProvision = await provisionAndNotifyGrailWorkspace({
      store,
      event,
      config,
      env,
      session,
      plan,
      contact: normalized,
      inquiry: duplicate
    });
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
    await store.markIdempotencySucceeded(webhookIdempotency.id, {
      targetType: "contact_inquiry",
      targetId: duplicate.id,
      responseStatus: 200,
      completedAt: new Date().toISOString()
    });
    return json({
      ok: true,
      grailCustomerSignal: true,
      duplicate: true,
      inquiryId: duplicate.id,
      workspaceProvisioned: workspaceProvision.ok === true
    });
  }

  let inquiry = await store.createContactInquiry({
    ...normalized,
    messageHash: await sha256Hex(normalizeContactMessage(message)),
    duplicateFingerprint,
    consentAt: createdAt,
    createdAt,
    status: "received",
    deliveryStatus: "local_record_only",
    idempotencyRecordId: webhookIdempotency.id
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
  if (crmRelay.ok) {
    inquiry =
      (await store.updateContactInquiryDeliveryStatus(
        inquiry.id,
        "crm_relay_delivered"
      )) || inquiry;
  } else if (!crmRelay.skipped) {
    inquiry =
      (await store.updateContactInquiryDeliveryStatus(inquiry.id, "crm_relay_failed")) ||
      inquiry;
  }

  const workspaceProvision = await provisionAndNotifyGrailWorkspace({
    store,
    event,
    config,
    env,
    session,
    plan,
    contact: normalized,
    inquiry
  });

  await store.logEvent({
    eventType: "stripe.grail_payment_link.customer_signal",
    payload: {
      eventId: event.id,
      sessionId,
      inquiryId: inquiry.id,
      deliveryStatus: inquiry.deliveryStatus,
      plan: plan.plan,
      planName: plan.planName,
      paymentLinkId: plan.paymentLinkId
    }
  });

  await store.markIdempotencySucceeded(webhookIdempotency.id, {
    targetType: "contact_inquiry",
    targetId: inquiry.id,
    responseStatus: 200,
    completedAt: new Date().toISOString()
  });

  return json({
    ok: true,
    grailCustomerSignal: true,
    inquiryId: inquiry.id,
    deliveryStatus: inquiry.deliveryStatus,
    workspaceProvisioned: workspaceProvision.ok === true
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
      return handleGrailPaymentLinkCheckout(store, event, config, env, session, grailPlan);
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

function subscriptionIdFromEvent(event) {
  const object = event.data?.object || {};
  if (event.type.startsWith("customer.subscription.")) {
    return cleanString(object.id, 160);
  }

  const subscription =
    object.subscription || object.parent?.subscription_details?.subscription || "";
  return cleanString(
    typeof subscription === "string" ? subscription : subscription?.id,
    160
  );
}

async function handleGrailSubscriptionStatusEvent(store, event, env) {
  const object = event.data?.object || {};
  const subscriptionId = subscriptionIdFromEvent(event);
  const subscriptionStatus =
    event.type === "customer.subscription.deleted"
      ? "canceled"
      : event.type === "invoice.payment_failed"
        ? "past_due"
        : event.type === "invoice.paid"
          ? "active"
          : cleanString(object.status, 80);
  const result = await syncGrailWorkspaceSubscriptionStatus({
    env,
    subscriptionId,
    subscriptionStatus
  });

  if (!result.ok) {
    return json({
      ok: true,
      ignored: true,
      reason: result.reason || "workspace_not_found"
    });
  }

  await store.logEvent({
    eventType: "grail.workspace.subscription_status_changed",
    payload: {
      eventId: event.id,
      workspaceId: result.workspaceId,
      workspaceStatus: result.status
    }
  });
  return json({
    ok: true,
    workspaceUpdated: true,
    workspaceStatus: result.status
  });
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
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "invoice.payment_failed":
    case "invoice.paid":
      return handleGrailSubscriptionStatusEvent(store, event, context.env);
    default:
      return json({ ok: true, ignored: true, type: event.type });
  }
}
