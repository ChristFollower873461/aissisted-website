import {
  badRequest,
  conflict,
  forbidden,
  json,
  methodNotAllowed,
  serverError,
  unsupportedMediaType,
  readJson
} from "../_lib/http.js";
import { getBookingStore } from "../_lib/storage.js";
import {
  TransactionSafetyError,
  cleanString,
  createContactDuplicateFingerprint,
  createIdempotencyExpiry,
  createRequestFingerprint,
  createSafeJsonBody,
  getIdempotencyDecision,
  getIdempotencyKey,
  hashIdempotencyKey,
  normalizeContactAudience,
  normalizeContactMessage,
  normalizeEmail,
  normalizeRelativePath,
  normalizeWhitespace,
  sha256Hex
} from "../_lib/transaction-safety.js";

const COMMAND_ID = "submit_contact_inquiry";
const RISK = "external_write";
const DUPLICATE_WINDOW_HOURS = 24;

const FIELD_LIMITS = {
  name: 100,
  email: 200,
  phone: 40,
  company: 120,
  message: 2000,
  sourcePage: 160,
  honeypot: 120
};

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function limitString(value, fieldName, maximumLength) {
  const trimmed = cleanString(value);
  if (trimmed.length > maximumLength) {
    throw new ValidationError(
      "validation_failed",
      `${fieldName} must be ${maximumLength} characters or fewer.`
    );
  }
  return trimmed;
}

function isAllowedOrigin(request, url) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) return true;
  try {
    return new URL(originHeader).origin === url.origin;
  } catch (error) {
    return false;
  }
}

function errorResponse(status, code, message, extra = {}) {
  return json({ ok: false, error: message, code, ...extra }, status);
}

function inquiryResponse(inquiry, replayed = false) {
  return {
    ok: true,
    replayed,
    inquiry: {
      id: inquiry.id,
      status: inquiry.status,
      createdAt: inquiry.createdAt,
      deliveryStatus: inquiry.deliveryStatus
    },
    nextStep:
      "AIssisted Consulting will review the inquiry and respond through the public contact details."
  };
}

function duplicateResponse(existingInquiry) {
  return {
    ok: false,
    error: "A matching inquiry was already received recently.",
    code: "duplicate_inquiry",
    existingInquiry: {
      id: existingInquiry.id,
      createdAt: existingInquiry.createdAt
    }
  };
}

function replayResponse(record) {
  if (!record.responseBodyJson) {
    return json({ ok: false, error: "Idempotent response is unavailable.", code: "in_progress" }, 409);
  }
  const body = JSON.parse(record.responseBodyJson);
  body.replayed = true;
  return json(body, record.responseStatus || 200);
}

async function writeAudit(store, input) {
  try {
    await store.logAgentTransactionAudit(input);
  } catch (error) {
    console.warn("[contact] Agent transaction audit failed.", error);
  }
}

function normalizePayload(payload) {
  const honeypot = limitString(
    payload.websiteLeaveBlank || payload.botField,
    "Bot field",
    FIELD_LIMITS.honeypot
  );
  if (honeypot) {
    throw new ValidationError("unable_to_submit", "Unable to submit inquiry.");
  }

  const name = normalizeWhitespace(limitString(payload.name, "Name", FIELD_LIMITS.name));
  const email = normalizeEmail(limitString(payload.email, "Email", FIELD_LIMITS.email));
  const phone = normalizeWhitespace(limitString(payload.phone, "Phone", FIELD_LIMITS.phone));
  const company = normalizeWhitespace(
    limitString(payload.company, "Company", FIELD_LIMITS.company)
  );
  const audience = normalizeContactAudience(payload.audience);
  const message = normalizeWhitespace(
    limitString(payload.message, "Message", FIELD_LIMITS.message)
  );
  const sourcePage = normalizeRelativePath(
    limitString(payload.sourcePage, "Source page", FIELD_LIMITS.sourcePage)
  );

  if (!name || !email || !message) {
    throw new ValidationError("validation_failed", "Name, email, and message are required.");
  }

  if (!isValidEmail(email)) {
    throw new ValidationError("validation_failed", "Please provide a valid email address.");
  }

  if (payload.consentToSubmit !== true) {
    throw new ValidationError("consent_required", "Consent is required before submission.");
  }

  return {
    name,
    email,
    emailNormalized: email,
    phone,
    company,
    audience,
    audienceNormalized: audience,
    message,
    sourcePage,
    consentToSubmit: true
  };
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const requestUrl = new URL(context.request.url);
  const store = getBookingStore(context.env);
  let idempotencyKeyHash = "";
  let requestFingerprint = "";
  let idempotencyRecord = null;
  let normalized = null;

  try {
    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return unsupportedMediaType("Contact submissions must use application/json.");
    }

    if (!isAllowedOrigin(context.request, requestUrl)) {
      return forbidden("Cross-origin contact submissions are not allowed.");
    }

    const idempotencyKey = getIdempotencyKey(context.request);
    idempotencyKeyHash = await hashIdempotencyKey(idempotencyKey);

    const payload = await readJson(context.request);
    normalized = normalizePayload(payload);
    requestFingerprint = await createRequestFingerprint({
      commandId: COMMAND_ID,
      risk: RISK,
      input: normalized
    });

    const existing = await store.getIdempotencyRecord({
      commandId: COMMAND_ID,
      idempotencyKeyHash
    });
    const decision = getIdempotencyDecision(existing, requestFingerprint);
    if (decision.action === "replay") {
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: existing.id,
        idempotencyKeyHash,
        requestFingerprint,
        targetType: existing.targetType,
        targetId: existing.targetId,
        result: "replayed",
        responseStatus: decision.status,
        safeSummaryJson: existing.requestSummaryJson
      });
      return replayResponse(existing);
    }
    if (decision.action !== "start") {
      const response = errorResponse(
        decision.status,
        decision.code,
        decision.code === "in_progress"
          ? "The original request is still being processed."
          : "This idempotency key was already used for a different request."
      );
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: existing?.id || null,
        idempotencyKeyHash,
        requestFingerprint,
        result: decision.action === "conflict" ? "conflict" : "rejected",
        responseStatus: response.status,
        errorCode: decision.code,
        safeSummaryJson: createSafeJsonBody({ email: normalized.email, audience: normalized.audience })
      });
      return response;
    }

    idempotencyRecord = await store.startIdempotencyRecord({
      commandId: COMMAND_ID,
      risk: RISK,
      idempotencyKeyHash,
      requestFingerprint,
      requestSummaryJson: createSafeJsonBody({
        email: normalized.email,
        audience: normalized.audience,
        sourcePage: normalized.sourcePage
      }),
      expiresAt: createIdempotencyExpiry({ retentionHours: 7 * 24 })
    });

    const messageHash = await sha256Hex(normalizeContactMessage(normalized.message));
    const duplicateFingerprint = await createContactDuplicateFingerprint(normalized);
    const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const duplicate = await store.findRecentContactInquiryByDuplicateFingerprint({
      duplicateFingerprint,
      sinceIso: since
    });
    if (duplicate) {
      const body = duplicateResponse(duplicate);
      await store.markIdempotencyFailed(idempotencyRecord.id, {
        responseStatus: 409,
        responseBodyJson: JSON.stringify(body),
        errorCode: "duplicate_inquiry"
      });
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: idempotencyRecord.id,
        idempotencyKeyHash,
        requestFingerprint,
        targetType: "contact_inquiry",
        targetId: duplicate.id,
        result: "duplicate",
        responseStatus: 409,
        errorCode: "duplicate_inquiry",
        safeSummaryJson: idempotencyRecord.requestSummaryJson
      });
      return json(body, 409);
    }

    const createdAt = new Date().toISOString();
    const inquiry = await store.createContactInquiry({
      ...normalized,
      messageHash,
      duplicateFingerprint,
      consentAt: createdAt,
      createdAt,
      status: "received",
      deliveryStatus: "local_record_only",
      idempotencyRecordId: idempotencyRecord.id
    });
    const body = inquiryResponse(inquiry);
    await store.markIdempotencySucceeded(idempotencyRecord.id, {
      targetType: "contact_inquiry",
      targetId: inquiry.id,
      responseStatus: 200,
      responseBodyJson: JSON.stringify(body)
    });
    await writeAudit(store, {
      commandId: COMMAND_ID,
      risk: RISK,
      actorType: "agent_assisted",
      idempotencyRecordId: idempotencyRecord.id,
      idempotencyKeyHash,
      requestFingerprint,
      targetType: "contact_inquiry",
      targetId: inquiry.id,
      result: "accepted",
      responseStatus: 200,
      safeSummaryJson: idempotencyRecord.requestSummaryJson
    });

    return json(body);
  } catch (error) {
    if (error instanceof TransactionSafetyError) {
      return errorResponse(error.status, error.code, error.message);
    }

    if (error instanceof ValidationError) {
      const status = error.code === "duplicate_inquiry" ? 409 : 400;
      return errorResponse(status, error.code, error.message);
    }

    if (idempotencyRecord) {
      await store.markIdempotencyFailed(idempotencyRecord.id, {
        responseStatus: 500,
        responseBodyJson: JSON.stringify({
          ok: false,
          error: "Unexpected server error.",
          code: "internal_error"
        }),
        errorCode: "internal_error"
      });
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: idempotencyRecord.id,
        idempotencyKeyHash,
        requestFingerprint,
        result: "failed",
        responseStatus: 500,
        errorCode: "internal_error",
        safeSummaryJson: normalized
          ? createSafeJsonBody({ email: normalized.email, audience: normalized.audience })
          : null
      });
    }

    return serverError(error);
  }
}
