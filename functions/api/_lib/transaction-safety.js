const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{16,200}$/;
const DEFAULT_DUPLICATE_WINDOW_HOURS = 24;

export class TransactionSafetyError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "TransactionSafetyError";
    this.code = code;
    this.status = status;
  }
}

export function cleanString(value) {
  return String(value ?? "").trim();
}

export function normalizeWhitespace(value) {
  return cleanString(value).replace(/\s+/g, " ");
}

export function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

export function normalizeRelativePath(value) {
  const path = cleanString(value);
  if (!path) return "";
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return "";
  return path.slice(0, 160);
}

export function validateIdempotencyKey(value) {
  const key = cleanString(value);
  if (!key) {
    throw new TransactionSafetyError(
      "missing_idempotency_key",
      "Idempotency-Key header is required."
    );
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new TransactionSafetyError(
      "invalid_idempotency_key",
      "Idempotency-Key must be 16 to 200 visible ASCII characters."
    );
  }

  return key;
}

export function getIdempotencyKey(request) {
  return validateIdempotencyKey(request.headers.get("idempotency-key"));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        if (value[key] !== undefined) {
          result[key] = canonicalize(value[key]);
        }
        return result;
      }, {});
  }

  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function hashIdempotencyKey(idempotencyKey) {
  return sha256Hex(validateIdempotencyKey(idempotencyKey));
}

export async function createRequestFingerprint({ commandId, risk, input }) {
  return sha256Hex(
    canonicalJson({
      commandId: cleanString(commandId),
      risk: cleanString(risk),
      input: canonicalize(input || {})
    })
  );
}

export function normalizeContactAudience(value) {
  const normalized = cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const allowed = new Set([
    "small_business_workflow",
    "family_ai_question",
    "privacy_and_control",
    "booking_or_consult",
    "other"
  ]);
  return allowed.has(normalized) ? normalized : "other";
}

export function normalizeContactMessage(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export async function createContactDuplicateFingerprint({ email, audience, message }) {
  return sha256Hex(
    canonicalJson({
      email: normalizeEmail(email),
      audience: normalizeContactAudience(audience),
      message: normalizeContactMessage(message)
    })
  );
}

export function createIdempotencyExpiry({
  now = new Date(),
  retentionHours = DEFAULT_DUPLICATE_WINDOW_HOURS
} = {}) {
  const expiresAt = new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
  return expiresAt.toISOString();
}

export function createStripeIdempotencyKey(prefix, idempotencyKeyHash, discriminator = "") {
  const safePrefix = cleanString(prefix).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  const safeHash = cleanString(idempotencyKeyHash).replace(/[^a-f0-9]/gi, "").slice(0, 64);
  const safeDiscriminator = cleanString(discriminator)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 64);
  return [safePrefix || "aic", safeHash, safeDiscriminator].filter(Boolean).join("-");
}

export function createSafeJsonBody(body) {
  return JSON.stringify(canonicalize(body || {}));
}

export function getIdempotencyDecision(existingRecord, requestFingerprint) {
  if (!existingRecord) {
    return { action: "start" };
  }

  if (existingRecord.requestFingerprint !== requestFingerprint) {
    return {
      action: "conflict",
      status: 409,
      code: "idempotency_conflict"
    };
  }

  if (existingRecord.status === "started") {
    return {
      action: "in_progress",
      status: 409,
      code: "in_progress"
    };
  }

  if (existingRecord.status === "succeeded") {
    return {
      action: "replay",
      status: existingRecord.responseStatus || 200,
      bodyJson: existingRecord.responseBodyJson || null
    };
  }

  if (existingRecord.status === "failed") {
    return {
      action: "failed_replay",
      status: existingRecord.responseStatus || 500,
      code: existingRecord.errorCode || "previous_request_failed",
      bodyJson: existingRecord.responseBodyJson || null
    };
  }

  return {
    action: "conflict",
    status: 409,
    code: existingRecord.errorCode || "idempotency_conflict"
  };
}
