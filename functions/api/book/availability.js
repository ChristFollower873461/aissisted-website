import { getBookingConfig } from "../_lib/config.js";
import { json, methodNotAllowed, serverError, unavailable } from "../_lib/http.js";
import { formatCurrency } from "../_lib/time.js";
import { getBookingStore } from "../_lib/storage.js";
import { listSlotsWithStatus } from "../_lib/availability.js";

const CALENDAR_UNAVAILABLE_MESSAGE = "Booking availability is temporarily unavailable.";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  try {
    const url = new URL(context.request.url);
    const config = getBookingConfig(context.env, url.origin);
    const days = Number.parseInt(url.searchParams.get("days") || "", 10) || 14;
    const store = getBookingStore(context.env);

    await store.cleanupExpiredHolds();

    const slots = await listSlotsWithStatus({
      env: context.env,
      origin: url.origin,
      store,
      days
    });

    return json({
      ok: true,
      timezone: config.timezone,
      reservationAmountCents: config.reservationAmountCents,
      currency: config.currency,
      reservationAmountFormatted: formatCurrency(
        config.reservationAmountCents,
        config.currency
      ),
      policyVersion: config.policyVersion,
      policyText: config.policyText,
      slots
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Google Calendar availability is required")
    ) {
      console.error("[booking] Required Google Calendar availability failed.", error);
      return unavailable(CALENDAR_UNAVAILABLE_MESSAGE);
    }

    return serverError(error);
  }
}
