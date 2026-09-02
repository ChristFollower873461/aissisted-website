import { buildStripeContractMetadata, contractMatchesRelease } from "./booking-releases.js";

const STRIPE_API = "https://api.stripe.com/v1";

function asFormUrlEncoded(params) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });

  return searchParams;
}

async function stripeRequest(config, path, options = {}) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: options.method || "POST",
    headers: {
      authorization: `Bearer ${config.stripeSecretKey}`,
      ...(config.stripeApiVersion ? { "stripe-version": config.stripeApiVersion } : {}),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
      ...(options.body
        ? { "content-type": "application/x-www-form-urlencoded" }
        : {})
    },
    body: options.body ? options.body.toString() : undefined
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "Stripe API request failed.");
  }

  return payload;
}

function normalizeString(value) {
  return String(value || "").trim();
}

export async function createStripeCustomer(config, prospect, options = {}) {
  const body = asFormUrlEncoded({
    name: prospect.name,
    email: prospect.email,
    phone: prospect.phone,
    description: prospect.company
      ? `${config.businessTitle} booking prospect - ${prospect.company}`
      : `${config.businessTitle} booking prospect`,
    "metadata[company]": prospect.company,
    "metadata[source]": "website-booking"
  });

  return stripeRequest(config, "/customers", {
    body,
    idempotencyKey: options.idempotencyKey
  });
}

export async function createCheckoutSession(config, booking, prospect, options = {}) {
  if (!config.activeRelease || !contractMatchesRelease(booking, config.activeRelease)) {
    throw new Error("The stored booking contract does not match the active release.");
  }
  const contractMetadata = buildStripeContractMetadata(config.activeRelease, booking.id);
  const successUrl = `${config.siteOrigin}/book/success/?booking_id=${encodeURIComponent(booking.id)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${config.siteOrigin}/book/cancel/?booking_id=${encodeURIComponent(booking.id)}`;
  const body = asFormUrlEncoded({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: booking.id,
    customer: prospect.stripeCustomerId || undefined,
    customer_email: prospect.stripeCustomerId ? undefined : prospect.email,
    customer_creation: prospect.stripeCustomerId ? undefined : "always",
    billing_address_collection: "auto",
    locale: "auto",
    "phone_number_collection[enabled]": true,
    "line_items[0][quantity]": 1,
    payment_method_configuration:
      config.activeRelease.stripePaymentMethodConfigurationRef || undefined,
    integration_identifier:
      config.activeRelease.stripeIntegrationIdentifier || undefined,
    "payment_intent_data[description]":
      config.activeRelease.stripeReceiptDescription || undefined,
    "custom_text[submit][message]":
      config.activeRelease.stripeCheckoutTermsMessage || undefined,
    "metadata[booking_id]": contractMetadata.booking_id,
    "metadata[prospect_id]": booking.prospectId,
    "metadata[slot_id]": booking.slotId,
    "metadata[slot_start]": booking.selectedTimeWindowStart,
    "metadata[slot_end]": booking.selectedTimeWindowEnd,
    "metadata[policy_version]": booking.policyVersion,
    "metadata[release_id]": contractMetadata.release_id,
    "metadata[offer_id]": contractMetadata.offer_id,
    "metadata[offer_version]": contractMetadata.offer_version,
    "metadata[terms_version]": contractMetadata.terms_version,
    "metadata[terms_sha256]": contractMetadata.terms_sha256,
    "payment_intent_data[metadata][booking_id]": booking.id,
    "payment_intent_data[metadata][prospect_id]": booking.prospectId,
    "payment_intent_data[metadata][slot_id]": booking.slotId,
    "payment_intent_data[metadata][release_id]": contractMetadata.release_id,
    "payment_intent_data[metadata][offer_id]": contractMetadata.offer_id,
    "payment_intent_data[metadata][offer_version]": contractMetadata.offer_version,
    "payment_intent_data[metadata][terms_version]": contractMetadata.terms_version,
    "payment_intent_data[metadata][terms_sha256]": contractMetadata.terms_sha256,
    expires_at: Math.floor(new Date(booking.temporaryHoldExpiresAt).getTime() / 1000)
  });

  if (config.stripePriceId) {
    body.set("line_items[0][price]", config.stripePriceId);
  } else {
    body.set("line_items[0][price_data][currency]", booking.currency);
    body.set(
      "line_items[0][price_data][product_data][name]",
      config.activeRelease.title
    );
    body.set(
      "line_items[0][price_data][product_data][description]",
      config.activeRelease.stripeDescription
    );
    body.set(
      "line_items[0][price_data][unit_amount]",
      booking.reservationAmount
    );
  }

  const session = await stripeRequest(config, "/checkout/sessions", {
    body,
    idempotencyKey: options.idempotencyKey
  });
  if (config.activeRelease.paymentMethodPolicy === "synchronous_card_only") {
    try {
      if (typeof config.stripeExpectedLivemode !== "boolean") {
        throw new Error("Stripe environment mode must be explicit for the v2 booking release.");
      }
      if (session.livemode !== config.stripeExpectedLivemode) {
        throw new Error("Stripe Checkout Session mode does not match the configured environment.");
      }
      const types = Array.isArray(session.payment_method_types)
        ? session.payment_method_types
        : [];
      if (types.length !== 1 || types[0] !== "card") {
        throw new Error("Stripe Checkout Session is not restricted to synchronous card payments.");
      }
    } catch (error) {
      if (session.id) {
        try {
          await expireCheckoutSession(config, session.id);
        } catch (expireError) {
          console.error("[booking] Failed to expire a rejected Stripe Checkout Session.", expireError);
        }
      }
      throw error;
    }
  }
  return session;
}

export async function retrieveCheckoutSession(config, sessionId, options = {}) {
  const expand = options.expandContract === true
    ? "?expand[]=line_items.data.price.product"
    : "";
  return stripeRequest(config, `/checkout/sessions/${encodeURIComponent(sessionId)}${expand}`, {
    method: "GET"
  });
}

export async function expireCheckoutSession(config, sessionId) {
  return stripeRequest(
    config,
    `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
    { body: new URLSearchParams() }
  );
}

export async function listOpenCheckoutSessionsForRelease(
  config,
  releaseId,
  options = {}
) {
  if (!config.stripeSecretKey || typeof config.stripeExpectedLivemode !== "boolean") {
    throw new Error("Stripe key and explicit environment mode are required.");
  }
  const pageLimit = Math.min(Math.max(Number(options.pageLimit || 100), 1), 100);
  const maxPages = Math.min(Math.max(Number(options.maxPages || 10), 1), 10);
  const sessions = [];
  let startingAfter = "";

  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({ status: "open", limit: String(pageLimit) });
    if (startingAfter) query.set("starting_after", startingAfter);
    const payload = await stripeRequest(
      config,
      `/checkout/sessions?${query.toString()}`,
      { method: "GET" }
    );
    const data = Array.isArray(payload.data) ? payload.data : [];
    for (const session of data) {
      if (session.livemode !== config.stripeExpectedLivemode) {
        throw new Error("Stripe open-Session inventory crossed environment modes.");
      }
      if (session.metadata?.release_id === releaseId) sessions.push(session);
    }
    if (!payload.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }

  return sessions;
}

function parseSignatureHeader(signatureHeader) {
  return String(signatureHeader || "")
    .split(",")
    .reduce((accumulator, item) => {
      const [key, value] = item.split("=");
      if (!key || !value) {
        return accumulator;
      }

      if (!accumulator[key]) {
        accumulator[key] = [];
      }
      accumulator[key].push(value);
      return accumulator;
    }, {});
}

async function computeHmacHex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(signature);

  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  const first = normalizeString(a);
  const second = normalizeString(b);
  if (first.length !== second.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < first.length; index += 1) {
    mismatch |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function verifyStripeWebhook(payload, signatureHeader, webhookSecret) {
  const parsedSignature = parseSignatureHeader(signatureHeader);
  const timestamp = parsedSignature.t?.[0];
  const signatures = parsedSignature.v1 || [];

  if (!timestamp || !signatures.length) {
    throw new Error("Missing Stripe webhook signature.");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");
  }

  const expected = await computeHmacHex(webhookSecret, `${timestamp}.${payload}`);
  if (!signatures.some((candidate) => constantTimeEqual(candidate, expected))) {
    throw new Error("Stripe webhook signature verification failed.");
  }

  return JSON.parse(payload);
}
