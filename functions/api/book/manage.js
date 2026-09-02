import { applyFulfillmentAction } from "../_lib/booking-fulfillment.js";
import { forbidden, json, methodNotAllowed, readJson, unavailable } from "../_lib/http.js";
import { getBookingStore } from "../_lib/storage.js";

function constantTimeEqual(first, second) {
  const a = String(first || "");
  const b = String(second || "");
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed(["POST"]);
  const secret = String(context.env.BOOKING_OWNER_ACTION_TOKEN || "");
  if (!secret) return unavailable("Owner fulfillment actions are not configured.");
  const provided = String(context.request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!constantTimeEqual(provided, secret)) return forbidden("Owner authorization is required.");

  try {
    const payload = await readJson(context.request);
    const result = await applyFulfillmentAction({
      store: getBookingStore(context.env),
      bookingId: String(payload.bookingId || "").trim(),
      action: String(payload.action || "").trim(),
      actorRef: "pj_owner_action",
      idempotencyKey: String(payload.idempotencyKey || "").trim(),
      at: payload.at || new Date().toISOString(),
      data: payload.data || {}
    });
    return json({ ok: true, replayed: result.replayed, deliverable: result.deliverable });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Fulfillment action failed." }, 409);
  }
}
