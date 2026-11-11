import { forbidden, json, methodNotAllowed, readJson, unavailable } from "../_lib/http.js";
import { getBookingStore } from "../_lib/storage.js";

const DISPOSITIONS = new Set(["fit_call_accepted", "fit_call_redirected_to_paid_plan", "fit_call_declined"]);

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
  if (!secret) return unavailable("Fit Call disposition actions are not configured.");
  const provided = String(context.request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!constantTimeEqual(provided, secret)) return forbidden("Owner authorization is required.");
  const body = await readJson(context.request);
  const inquiryId = String(body.inquiryId || "").trim();
  const disposition = String(body.disposition || "").trim();
  if (!inquiryId || !DISPOSITIONS.has(disposition)) {
    return json({ ok: false, error: "A valid inquiry and disposition are required." }, 400);
  }
  const store = getBookingStore(context.env);
  const inquiry = await store.updateContactInquiryStatus(inquiryId, disposition);
  if (!inquiry) return json({ ok: false, error: "Fit Call inquiry was not found." }, 404);
  await store.logEvent({
    eventType: `fit_call.${disposition.replace("fit_call_", "")}`,
    payload: { inquiryId, disposition, actorRef: "pj_owner_action" }
  });
  return json({ ok: true, inquiryId, disposition });
}
