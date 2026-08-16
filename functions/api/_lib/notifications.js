import { formatCurrency, formatDetailedSlot } from "./time.js";

async function postJson(url, payload, idempotencyKey = "") {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Notification webhook responded with ${response.status}.`);
  }
}

async function sendResendEmail({
  config,
  idempotencyKey,
  subject,
  text,
  to,
  replyTo = ""
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  const body = {
    from: config.emailFrom,
    to: [to],
    subject,
    text
  };

  if (replyTo) {
    body.reply_to = replyTo;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.emailApiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Resend responded with ${response.status}.`);
    }

    const payload = await response.json().catch(() => ({}));
    return String(payload.id || "");
  } finally {
    clearTimeout(timeoutId);
  }
}

function contactTopicLabel(value) {
  const labels = {
    small_business_workflow: "Small business workflow",
    custom_development: "Custom software development",
    individual_software_build: "Individual software build",
    family_ai_question: "Family AI question",
    privacy_and_control: "Privacy and control",
    booking_or_consult: "Booking or consult",
    other: "General inquiry"
  };
  return labels[value] || labels.other;
}

export async function sendContactInquiryNotification({ config, inquiry, contact }) {
  const summary = {
    inquiryId: inquiry.id,
    status: inquiry.status,
    deliveryStatus: inquiry.deliveryStatus,
    sourcePage: contact.sourcePage || "",
    company: contact.company || "",
    customerName: contact.name || "",
    customerEmail: contact.email || "",
    customerPhone: contact.phone || "",
    audience: contact.audience || "",
    createdAt: inquiry.createdAt
  };
  const result = {
    email: { status: "skipped", provider: config.emailProvider || "none" },
    webhook: { status: "skipped" }
  };

  console.log("[contact-inquiry-received]", {
    inquiryId: summary.inquiryId,
    status: summary.status,
    deliveryStatus: summary.deliveryStatus,
    sourcePage: summary.sourcePage,
    audience: summary.audience,
    createdAt: summary.createdAt
  });

  if (config.internalNotificationWebhook) {
    try {
      await postJson(config.internalNotificationWebhook, {
        type: "contact.inquiry_received",
        audience: "internal",
        summary
      });
      result.webhook = { status: "delivered" };
    } catch (error) {
      console.error("[contact-inquiry-received] Internal notification failed.", error);
      result.webhook = { status: "failed" };
    }
  }

  if (config.emailProvider !== "resend") {
    return result;
  }
  if (!config.emailApiKey || !config.emailFrom || !config.ownerAlertEmail) {
    result.email = {
      status: "skipped",
      provider: "resend",
      reason: "email_configuration_incomplete"
    };
    return result;
  }

  const topic = contactTopicLabel(contact.audience);
  const text = [
    "A new AIssisted Consulting inquiry was submitted.",
    "",
    `Topic: ${topic}`,
    `Name: ${contact.name || "Not provided"}`,
    `Email: ${contact.email || "Not provided"}`,
    `Phone: ${contact.phone || "Not provided"}`,
    `Company: ${contact.company || "Not provided"}`,
    `CRM delivery: ${inquiry.deliveryStatus || "unknown"}`,
    `Source: ${contact.sourcePage || "/contact/"}`,
    `Inquiry ID: ${inquiry.id}`,
    "",
    "Message:",
    contact.message || "No message provided."
  ].join("\n");

  try {
    const providerMessageId = await sendResendEmail({
      config,
      idempotencyKey: `aic-contact-owner-alert-${inquiry.id}`,
      subject: `New AIssisted inquiry: ${topic}`,
      text,
      to: config.ownerAlertEmail,
      replyTo: contact.email || ""
    });
    result.email = {
      status: "delivered",
      provider: "resend",
      providerMessageId
    };
  } catch (error) {
    console.error("[contact-inquiry-received] Owner email failed.", error);
    result.email = {
      status: "failed",
      provider: "resend",
      reason: error instanceof Error ? error.message : "email_delivery_failed"
    };
  }

  return result;
}

export async function sendBookingNotifications({ config, booking }) {
  const summary = {
    bookingId: booking.id,
    company: booking.prospectCompany || "",
    customerName: booking.prospectName || "",
    customerEmail: booking.prospectEmail || "",
    slot: formatDetailedSlot(
      booking.selectedTimeWindowStart,
      booking.selectedTimeWindowEnd,
      booking.selectedTimeZone
    ),
    amount: formatCurrency(booking.reservationAmount, booking.currency),
    depositCreditAvailable: Boolean(booking.depositCreditAvailable)
  };

  console.log("[booking-confirmed]", summary);

  if (config.internalNotificationWebhook) {
    try {
      await postJson(config.internalNotificationWebhook, {
        type: "booking.confirmed",
        audience: "internal",
        summary
      });
    } catch (error) {
      console.error("[booking-confirmed] Internal notification failed.", error);
    }
  }

  if (config.customerNotificationWebhook) {
    try {
      await postJson(config.customerNotificationWebhook, {
        type: "booking.confirmed",
        audience: "customer",
        summary
      });
    } catch (error) {
      console.error("[booking-confirmed] Customer notification failed.", error);
    }
  }
}

export async function sendBookingNotificationEffect({ config, booking, effectType, dedupeKey }) {
  const summary = {
    bookingId: booking.id,
    company: booking.prospectCompany || "",
    customerName: booking.prospectName || "",
    customerEmail: booking.prospectEmail || "",
    slot: formatDetailedSlot(
      booking.selectedTimeWindowStart,
      booking.selectedTimeWindowEnd,
      booking.selectedTimeZone
    ),
    amount: formatCurrency(booking.reservationAmount, booking.currency),
    offerId: booking.offerId || "legacy",
    offerVersion: booking.offerVersion || 1,
    implementationCreditAvailable: Boolean(booking.depositCreditAvailable)
  };
  const isInternal = effectType === "internal_notification";
  const url = isInternal
    ? config.internalNotificationWebhook
    : effectType === "customer_notification"
      ? config.customerNotificationWebhook
      : "";
  if (!url) return { status: "skipped", reason: "not_configured" };
  await postJson(url, {
    type: "booking.confirmed",
    audience: isInternal ? "internal" : "customer",
    summary
  }, dedupeKey);
  return { status: "delivered" };
}

export async function sendManualReviewNotification({ config, booking, reason, eventId }) {
  const summary = {
    bookingId: booking.id,
    reason,
    eventId: eventId || "",
    customerName: booking.prospectName || "",
    customerEmail: booking.prospectEmail || "",
    company: booking.prospectCompany || "",
    slot: formatDetailedSlot(
      booking.selectedTimeWindowStart,
      booking.selectedTimeWindowEnd,
      booking.selectedTimeZone
    ),
    amount: formatCurrency(booking.reservationAmount, booking.currency)
  };

  console.error("[booking-manual-review]", summary);

  if (config.internalNotificationWebhook) {
    try {
      await postJson(config.internalNotificationWebhook, {
        type: "booking.manual_review",
        audience: "internal",
        summary
      });
    } catch (error) {
      console.error("[booking-manual-review] Internal notification failed.", error);
    }
  }
}
