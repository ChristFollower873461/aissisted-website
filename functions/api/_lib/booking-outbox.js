import { isGoogleCalendarConfigured } from "./config.js";
import { createGoogleCalendarBookingEvent } from "./google-calendar.js";
import { sendBookingNotificationEffect } from "./notifications.js";

function retryAt(at, minutes = 5) {
  return new Date(new Date(at).getTime() + minutes * 60 * 1000).toISOString();
}

export async function drainBookingOutbox({ store, config, bookingId, at = new Date().toISOString() }) {
  const booking = await store.getBookingById(bookingId);
  if (!booking) throw new Error("Outbox booking is missing.");
  const pending = await store.listBookingOutbox(bookingId);
  const results = [];
  for (const item of pending) {
    const claimed = await store.claimBookingOutbox(item.id, at);
    if (!claimed) continue;
    try {
      let providerResult;
      if (claimed.effectType === "calendar") {
        if (!config.googleCalendarCreateEvents) {
          providerResult = { status: "skipped", reason: "calendar_creation_disabled" };
        } else {
          if (!isGoogleCalendarConfigured(config)) {
            throw new Error("calendar_configuration_incomplete");
          }
          providerResult = await createGoogleCalendarBookingEvent({ config, booking });
        }
      } else {
        providerResult = await sendBookingNotificationEffect({
          config,
          booking,
          effectType: claimed.effectType,
          dedupeKey: claimed.dedupeKey
        });
      }
      await store.finishBookingOutbox(claimed.id, { state: "sent", at });
      results.push({ id: claimed.id, effectType: claimed.effectType, state: "sent", providerResult });
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : "integration_failed";
      await store.finishBookingOutbox(claimed.id, {
        state: "failed",
        at,
        nextAttemptAt: retryAt(at),
        lastSafeErrorCode: code
      });
      results.push({ id: claimed.id, effectType: claimed.effectType, state: "failed", code });
    }
  }
  return results;
}
