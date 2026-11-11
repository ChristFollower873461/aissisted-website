import { forbidden, json, methodNotAllowed, unavailable } from "../_lib/http.js";
import { createPaymentCheckoutSession } from "../_lib/stripe.js";
import { buildStoreCheckoutParams, getStoreConfig, storeReady } from "../_lib/store.js";

function isAllowedOrigin(request, url, config) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return true;
  }

  try {
    const requestOrigin = new URL(originHeader).origin;
    return requestOrigin === url.origin || requestOrigin === config.siteOrigin;
  } catch (_error) {
    return false;
  }
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const url = new URL(context.request.url);
  const config = getStoreConfig(context.env, url.origin);
  if (!isAllowedOrigin(context.request, url, config)) {
    return forbidden("Checkout must start from this site.");
  }
  if (!storeReady(config)) {
    return unavailable("The book checkout is not open right now. Please try again later.");
  }

  let session;
  try {
    session = await createPaymentCheckoutSession(config, buildStoreCheckoutParams(config));
  } catch (_error) {
    console.error("[store] Stripe checkout creation failed.");
    return unavailable("We could not start checkout. Please try again in a minute.");
  }

  if (typeof config.stripeExpectedLivemode === "boolean" && session.livemode !== config.stripeExpectedLivemode) {
    console.error("[store] Stripe Checkout Session mode does not match the configured environment.");
    return unavailable("We could not start checkout. Please try again in a minute.");
  }
  if (!session.url || !String(session.url).startsWith("https://")) {
    return unavailable("We could not start checkout. Please try again in a minute.");
  }

  return json({ ok: true, url: session.url });
}
