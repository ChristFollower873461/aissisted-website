import { createContactInquiryWithCrmDelivery, deliverContactInquiryToCrm } from "../_lib/contact-crm-delivery.js";
import { getBookingConfig } from "../_lib/config.js";
import { conflict, forbidden, json, methodNotAllowed, readJson, unavailable, unsupportedMediaType } from "../_lib/http.js";
import { sendContactInquiryNotification } from "../_lib/notifications.js";
import { getBookingStore } from "../_lib/storage.js";
import {
  createIdempotencyExpiry,
  createContactDuplicateFingerprint,
  normalizeContactAudience,
  normalizeContactMessage,
  normalizeEmail,
  normalizeRelativePath,
  normalizeWhitespace,
  sha256Hex
} from "../_lib/transaction-safety.js";

const ROUTES = new Set(["workflow_improvement", "custom_development"]);
const COMMAND_ID = "request_fit_call";
const RISK = "external_write";

function sameOrigin(request, url) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === url.origin; } catch (_error) { return false; }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed(["POST"]);
  const url = new URL(context.request.url);
  const config = getBookingConfig(context.env, url.origin);
  if (!config.fitCallEnabled) return unavailable("Fit Call requests are temporarily closed.");
  if (!sameOrigin(context.request, url)) return forbidden("Cross-origin Fit Call requests are not allowed.");
  if (!(context.request.headers.get("content-type") || "").includes("application/json")) {
    return unsupportedMediaType("Fit Call requests must use application/json.");
  }

  try {
    const body = await readJson(context.request);
    const name = normalizeWhitespace(body.name).slice(0, 100);
    const email = normalizeEmail(body.email).slice(0, 200);
    const phone = normalizeWhitespace(body.phone).slice(0, 40);
    const company = normalizeWhitespace(body.company).slice(0, 120);
    const routeId = normalizeWhitespace(body.routeId).slice(0, 80);
    const reason = normalizeWhitespace(body.reason).slice(0, 1200);
    const sourcePage = normalizeRelativePath(body.sourcePage || "/book/", 500);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROUTES.has(routeId) || !reason) {
      return json({ ok: false, error: "Name, valid email, project route, and a short reason are required." }, 400);
    }
    if (body.consentToSubmit !== true) {
      return json({ ok: false, error: "Consent is required before submission." }, 400);
    }

    const audience = normalizeContactAudience("booking_or_consult");
    const message = [
      "15-Minute Fit Call request (manual review; not a scheduled appointment).",
      `Route: ${routeId}.`,
      `Reason: ${reason}`,
      "Permitted disposition: accept, redirect to the paid plan, or decline."
    ].join("\n");
    const normalized = {
      name, email, emailNormalized: email, phone, company,
      audience, audienceNormalized: audience, message, sourcePage,
      consentToSubmit: true
    };
    const duplicateFingerprint = await createContactDuplicateFingerprint(normalized);
    const store = getBookingStore(context.env);
    const duplicate = await store.findRecentContactInquiryByDuplicateFingerprint({
      duplicateFingerprint,
      sinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    });
    if (duplicate) return conflict("A matching Fit Call request was already received recently.");

    // Fit Call requests share the hardened contact-inquiry table, whose D1
    // schema requires every inquiry to reference a durable idempotency record.
    // Use the privacy-safe duplicate fingerprint as the stable request key so
    // the browser never needs to expose or persist customer text in headers.
    const idempotencyKeyHash = await sha256Hex(`fit-call:${duplicateFingerprint}`);
    const idempotencyRecord = await store.startIdempotencyRecord({
      commandId: COMMAND_ID,
      risk: RISK,
      idempotencyKeyHash,
      requestFingerprint: duplicateFingerprint,
      requestSummaryJson: JSON.stringify({ routeId, sourcePage }),
      expiresAt: createIdempotencyExpiry({ retentionHours: 7 * 24 })
    });

    const createdAt = new Date().toISOString();
    const inquiry = await createContactInquiryWithCrmDelivery({
      store,
      kind: "fit_call",
      input: {
        ...normalized,
        messageHash: await sha256Hex(normalizeContactMessage(message)),
        duplicateFingerprint,
        consentAt: createdAt,
        createdAt,
        status: "fit_call_pending_review",
        deliveryStatus: "local_record_only",
        idempotencyRecordId: idempotencyRecord.id
      }
    });
    const updatedInquiry = await deliverContactInquiryToCrm({ store, env: context.env, inquiry });
    const deliveryStatus = updatedInquiry.deliveryStatus;
    await sendContactInquiryNotification({ config, inquiry: { ...inquiry, deliveryStatus }, contact: normalized });
    await store.logEvent({
      eventType: "fit_call.requested",
      payload: { inquiryId: inquiry.id, routeId, weeklyCapacity: positiveInteger(context.env.FIT_CALL_WEEKLY_CAPACITY, 2) }
    });
    const responseBody = {
      ok: true,
      inquiryId: inquiry.id,
      status: "pending_manual_review",
      durationMinutes: 15,
      weeklyCapacity: positiveInteger(context.env.FIT_CALL_WEEKLY_CAPACITY, 2),
      scheduled: false,
      paymentRequired: false
    };
    await store.markIdempotencySucceeded(idempotencyRecord.id, {
      targetType: "contact_inquiry",
      targetId: inquiry.id,
      responseStatus: 200,
      responseBodyJson: JSON.stringify(responseBody),
      completedAt: new Date().toISOString()
    });
    return json(responseBody);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Fit Call request failed." }, 400);
  }
}
