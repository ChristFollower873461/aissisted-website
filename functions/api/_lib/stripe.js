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

export async function createStripeCustomer(config, prospect) {
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

  return stripeRequest(config, "/customers", { body });
}

export async function createCheckoutSession(config, booking, prospect) {
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
    "metadata[booking_id]": booking.id,
    "metadata[prospect_id]": booking.prospectId,
    "metadata[slot_id]": booking.slotId,
    "metadata[slot_start]": booking.selectedTimeWindowStart,
    "metadata[slot_end]": booking.selectedTimeWindowEnd,
    "metadata[policy_version]": booking.policyVersion,
    "payment_intent_data[metadata][booking_id]": booking.id,
    "payment_intent_data[metadata][prospect_id]": booking.prospectId,
    "payment_intent_data[metadata][slot_id]": booking.slotId,
    expires_at: Math.floor(new Date(booking.temporaryHoldExpiresAt).getTime() / 1000)
  });

  if (config.stripePriceId) {
    body.set("line_items[0][price]", config.stripePriceId);
  } else {
    body.set("line_items[0][price_data][currency]", booking.currency);
    body.set(
      "line_items[0][price_data][product_data][name]",
      "Appointment reservation deposit"
    );
    body.set(
      "line_items[0][price_data][product_data][description]",
      "Non-refundable $200 reservation deposit credited once toward service if you become a customer."
    );
    body.set(
      "line_items[0][price_data][unit_amount]",
      booking.reservationAmount
    );
  }

  return stripeRequest(config, "/checkout/sessions", { body });
}

export async function retrieveCheckoutSession(config, sessionId) {
  return stripeRequest(config, `/checkout/sessions/${encodeURIComponent(sessionId)}`, {
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
