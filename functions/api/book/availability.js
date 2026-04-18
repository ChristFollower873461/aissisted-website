import { getBookingConfig } from "../_lib/config.js";
import { json, methodNotAllowed, serverError } from "../_lib/http.js";
import { formatCurrency } from "../_lib/time.js";
import { getBookingStore } from "../_lib/storage.js";
import { listSlotsWithStatus } from "../_lib/availability.js";

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
      reservationAmountFormatted: formatCurrency(
        config.reservationAmountCents,
        config.currency
      ),
      policyText: config.policyText,
      slots
    });
  } catch (error) {
    return serverError(error);
  }
}
