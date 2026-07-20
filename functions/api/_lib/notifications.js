import { formatCurrency, formatDetailedSlot } from "./time.js";

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Notification webhook responded with ${response.status}.`);
  }
}

async function sendResendEmail({ config, idempotencyKey, subject, text, to }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.emailApiKey}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject,
      text
    })
  });

  if (!response.ok) {
    throw new Error(`Resend responded with ${response.status}.`);
  }

  const payload = await response.json().catch(() => ({}));
  return String(payload.id || "");
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

export async function sendGrailWorkspaceAccessEmail({
  config,
  eventId,
  contact,
  plan,
  accessCode
}) {
  if (config.emailProvider !== "resend") {
    return {
      status: "skipped",
      provider: config.emailProvider || "none",
      reason: "provider_not_configured"
    };
  }
  if (!config.emailApiKey || !config.emailFrom || !contact.email || !accessCode) {
    return {
      status: "skipped",
      provider: "resend",
      reason: "workspace_email_configuration_incomplete"
    };
  }

  const subject = `Your ${plan.planName || "Grail"} workspace is ready`;
  const text = [
    `Welcome to ${plan.planName || "Grail"}.`,
    "",
    "Open the Grail app, choose 'Already subscribed?', and enter this private workspace code:",
    "",
    accessCode,
    "",
    "Keep this code private. It opens your business workspace.",
    "Your dashboard starts in setup mode so Grail can collect approved services, reviews, photos, offers, and channel access before preparing public work.",
    "",
    "Need help? Reply to this email or contact pj@aissistedconsulting.com."
  ].join("\n");

  try {
    const providerMessageId = await sendResendEmail({
      config,
      idempotencyKey: `grail-workspace-access-${eventId || accessCode.slice(-8)}`,
      subject,
      text,
      to: contact.email
    });
    return { status: "delivered", provider: "resend", providerMessageId };
  } catch (error) {
    console.error("[grail-workspace-access] Email delivery failed.", error);
    return {
      status: "failed",
      provider: "resend",
      reason: error instanceof Error ? error.message : "email_delivery_failed"
    };
  }
}
