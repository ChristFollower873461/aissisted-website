import { getBookingConfig, isStripeConfigured } from "../_lib/config.js";
import { getGrailPaymentLinkPlan } from "../_lib/grail.js";
import {
  badRequest,
  json,
  methodNotAllowed,
  notFound,
  unavailable
} from "../_lib/http.js";
import { retrieveCheckoutSession } from "../_lib/stripe.js";

const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:live|test)_[A-Za-z0-9_-]{8,220}$/;

function verifiedCheckoutNotFound() {
  return notFound("Verified Grail checkout not found.");
}

function conversionValue(session, plan) {
  const amountCents = Number.isInteger(session.amount_total) && session.amount_total >= 0
    ? session.amount_total
    : plan.monthlyPriceCents;

  return {
    amountCents,
    value: Number((amountCents / 100).toFixed(2))
  };
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(context.request.url);
  const sessionId = url.searchParams.get("session_id") || "";
  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
    return badRequest("A valid Stripe checkout session_id is required.");
  }

  const config = getBookingConfig(context.env, url.origin);
  if (!isStripeConfigured(config)) {
    return unavailable("Checkout verification is temporarily unavailable.");
  }

  let session;
  try {
    session = await retrieveCheckoutSession(config, sessionId);
  } catch (_error) {
    console.warn("[grail] Stripe checkout verification failed.");
    return verifiedCheckoutNotFound();
  }

  const plan = getGrailPaymentLinkPlan(session);
  if (
    !plan ||
    session.status !== "complete" ||
    session.payment_status !== "paid"
  ) {
    return verifiedCheckoutNotFound();
  }

  const currency = String(session.currency || "usd").toUpperCase();
  const amount = conversionValue(session, plan);

  return json({
    ok: true,
    checkout: {
      verified: true,
      plan: plan.plan,
      planName: plan.planName,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
      value: amount.value,
      amountCents: amount.amountCents
    }
  });
}
