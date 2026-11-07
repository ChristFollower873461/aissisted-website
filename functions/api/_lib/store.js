// Paid digital download: "Sell Them a Hammer" (PDF + EPUB + toolkit zip).
// Files live in a private R2 bucket bound as BOOK_FILES. They are never in the
// repo or served as static assets. A paid Stripe Checkout Session carrying this
// product's metadata is the only thing that unlocks a download.

import { retrieveCheckoutSession } from "./stripe.js";

export const STORE_PRODUCT_ID = "sell_them_a_hammer_digital_v1";
export const STORE_PRODUCT_NAME = "Sell Them a Hammer (PDF + EPUB + toolkit)";
export const STORE_PRODUCT_DESCRIPTION =
  "Digital book by PJ Standley: PDF, EPUB and 10 editable templates.";
export const STORE_PRICE_CENTS = 2900;
export const STORE_CURRENCY = "usd";
export const STORE_PAGE_PATH = "/sell-them-a-hammer/";
export const STORE_DOWNLOAD_DAYS = 30;
export const STORE_FILES_BINDING = "BOOK_FILES";

// The only downloadable objects. The request picks a key from this map; it can
// never name an object path itself.
export const STORE_FILES = Object.freeze({
  pdf: {
    objectKey: "sell-them-a-hammer/v1/Sell-Them-a-Hammer.pdf",
    filename: "Sell-Them-a-Hammer.pdf",
    contentType: "application/pdf",
    label: "PDF"
  },
  epub: {
    objectKey: "sell-them-a-hammer/v1/Sell-Them-a-Hammer.epub",
    filename: "Sell-Them-a-Hammer.epub",
    contentType: "application/epub+zip",
    label: "EPUB"
  },
  toolkit: {
    objectKey: "sell-them-a-hammer/v1/Sell-Them-a-Hammer-Toolkit.zip",
    filename: "Sell-Them-a-Hammer-Toolkit.zip",
    contentType: "application/zip",
    label: "Toolkit"
  }
});

export const CHECKOUT_SESSION_ID_PATTERN = /^cs_(?:live|test)_[A-Za-z0-9_-]{8,220}$/;

function parseStrictBoolean(value) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

function normalizeOrigin(value, fallback) {
  try {
    return new URL(String(value || fallback || "")).origin;
  } catch (_error) {
    return new URL(fallback).origin;
  }
}

export function getStoreConfig(env, origin) {
  const siteOrigin = env.PREVIEW_ACCESS_REQUIRED === "true" && origin
    ? origin : env.PUBLIC_SITE_ORIGIN;
  return {
    saleEnabled: env.BOOK_SALE_ENABLED === "true",
    siteOrigin: normalizeOrigin(siteOrigin, origin),
    stripeSecretKey: env.STRIPE_SECRET_KEY || "",
    stripeExpectedLivemode: parseStrictBoolean(env.STRIPE_EXPECTED_LIVEMODE),
    stripeApiVersion: env.STRIPE_API_VERSION || "2026-06-24.dahlia",
    files: env[STORE_FILES_BINDING] || null
  };
}

export function storeReady(config) {
  return Boolean(config.saleEnabled && config.stripeSecretKey && config.files);
}

export function buildStoreCheckoutParams(config) {
  const page = `${config.siteOrigin}${STORE_PAGE_PATH}`;
  return {
    mode: "payment",
    // Card only (Apple Pay and Google Pay ride on card): payment is final at
    // checkout, so the thanks page never sees a pending bank payment.
    "payment_method_types[0]": "card",
    success_url: `${page}thanks/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: page,
    submit_type: "pay",
    locale: "auto",
    billing_address_collection: "auto",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": STORE_CURRENCY,
    "line_items[0][price_data][unit_amount]": STORE_PRICE_CENTS,
    "line_items[0][price_data][product_data][name]": STORE_PRODUCT_NAME,
    "line_items[0][price_data][product_data][description]": STORE_PRODUCT_DESCRIPTION,
    "metadata[store_product]": STORE_PRODUCT_ID,
    "payment_intent_data[metadata][store_product]": STORE_PRODUCT_ID,
    "payment_intent_data[description]": STORE_PRODUCT_NAME,
    "custom_text[submit][message]":
      "Your download links appear on the next page right after payment."
  };
}

// Returns { ok: true, session, expiresAt } or { ok: false, status, code, message }.
export async function verifyPaidStoreSession(config, sessionId, now = Date.now()) {
  if (!CHECKOUT_SESSION_ID_PATTERN.test(String(sessionId || ""))) {
    return { ok: false, status: 404, code: "missing_session", message: "We could not find that purchase. Use the link from your checkout page." };
  }

  let session;
  try {
    session = await retrieveCheckoutSession(config, sessionId, { expandCharge: true });
  } catch (_error) {
    console.warn("[store] Stripe checkout lookup failed.");
    return { ok: false, status: 404, code: "unknown_session", message: "We could not find that purchase. Use the link from your checkout page." };
  }

  const denied = (code) => ({
    ok: false,
    status: 403,
    code,
    message: "This checkout has no download attached. If you paid and see this, email pj@aissistedconsulting.com."
  });
  if (!session || session.id !== sessionId) return denied("unknown_session");
  if (session.metadata?.store_product !== STORE_PRODUCT_ID) return denied("wrong_product");
  if (typeof config.stripeExpectedLivemode === "boolean" && session.livemode !== config.stripeExpectedLivemode) {
    return denied("wrong_mode");
  }
  if (session.status !== "complete" || session.payment_status !== "paid") return denied("unpaid");

  // A refund (full or partial) ends access. Stripe keeps payment_status=paid
  // after a refund, so read the charge. If it is not there, fail closed.
  const charge = session.payment_intent?.latest_charge;
  if (!charge || typeof charge !== "object") return denied("unverified_charge");
  if (charge.refunded === true || Number(charge.amount_refunded) > 0) {
    return { ok: false, status: 403, code: "refunded", message: "This order was refunded." };
  }

  const createdMs = Number(session.created) * 1000;
  if (!Number.isFinite(createdMs) || createdMs <= 0) return denied("unknown_session");
  const expiresAt = createdMs + STORE_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000;
  if (now > expiresAt) {
    return {
      ok: false,
      status: 403,
      code: "expired",
      message: `Download links last ${STORE_DOWNLOAD_DAYS} days. Email pj@aissistedconsulting.com with your receipt and we'll send a fresh copy.`
    };
  }

  return { ok: true, session, expiresAt: new Date(expiresAt).toISOString() };
}
