import { BOOKING_RELEASES } from "../_lib/booking-releases.js";
import { getBookingConfig } from "../_lib/config.js";
import { forbidden, json, methodNotAllowed, readJson, unavailable } from "../_lib/http.js";
import {
  expireCheckoutSession,
  listOpenCheckoutSessionsForRelease
} from "../_lib/stripe.js";

function constantTimeEqual(first, second) {
  const a = String(first || "");
  const b = String(second || "");
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function strictEnabled(value) {
  return value === true || value === "true" || value === "1";
}

function safeSession(session) {
  return {
    id: session.id,
    status: session.status,
    paymentStatus: session.payment_status,
    livemode: session.livemode,
    amountTotal: session.amount_total,
    currency: session.currency,
    expiresAt: session.expires_at,
    releaseId: session.metadata?.release_id || ""
  };
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed(["POST"]);
  const ownerToken = String(context.env.BOOKING_OWNER_ACTION_TOKEN || "");
  if (!ownerToken) return unavailable("Owner checkout rollback actions are not configured.");
  const provided = String(context.request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "");
  if (!constantTimeEqual(provided, ownerToken)) {
    return forbidden("Owner authorization is required.");
  }

  try {
    const payload = await readJson(context.request);
    const action = String(payload.action || "inventory").trim();
    const releaseId = String(
      payload.releaseId || "aissisted_booking_v2_2026_08_15"
    ).trim();
    if (!BOOKING_RELEASES[releaseId]) {
      return json({ ok: false, error: "Unknown booking release." }, 400);
    }

    const config = getBookingConfig(context.env, new URL(context.request.url).origin);
    const sessions = await listOpenCheckoutSessionsForRelease(config, releaseId);
    if (action === "inventory") {
      return json({ ok: true, action, count: sessions.length, sessions: sessions.map(safeSession) });
    }
    if (action !== "expire_open") {
      return json({ ok: false, error: "Unsupported rollback action." }, 400);
    }
    if (!strictEnabled(context.env.BOOKING_OPEN_SESSION_EXPIRY_ENABLED)) {
      return forbidden("Open-Session expiry is disabled.");
    }

    const results = [];
    for (const session of sessions) {
      const expired = await expireCheckoutSession(config, session.id);
      results.push(safeSession(expired));
    }
    return json({ ok: true, action, count: results.length, sessions: results });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Checkout rollback action failed."
      },
      409
    );
  }
}
