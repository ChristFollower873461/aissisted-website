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
