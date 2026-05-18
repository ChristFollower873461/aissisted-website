const DEFAULT_JSON_LIMIT_BYTES = 16 * 1024;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "x-frame-options": "SAMEORIGIN"
};

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

export function methodNotAllowed(allowed) {
  return json(
    { ok: false, error: "Method not allowed." },
    405,
    { allow: allowed.join(", ") }
  );
}

export function badRequest(message, details) {
  return json({ ok: false, error: message, details: details || null }, 400);
}

export function forbidden(message, details) {
  return json({ ok: false, error: message || "Forbidden.", details: details || null }, 403);
}

export function conflict(message, details) {
  return json({ ok: false, error: message, details: details || null }, 409);
}

export function notFound(message) {
  return json({ ok: false, error: message || "Not found." }, 404);
}

export function unsupportedMediaType(message) {
  return json(
    { ok: false, error: message || "Unsupported media type." },
    415
  );
}

export function unavailable(message) {
  return json({ ok: false, error: message || "Service unavailable." }, 503);
}

export function serverError(error) {
  console.error("[api] Unexpected server error.", error);
  return json({ ok: false, error: "Unexpected server error." }, 500);
}

export async function readJson(request, limitBytes = DEFAULT_JSON_LIMIT_BYTES) {
  const contentLength = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isInteger(contentLength) && contentLength > limitBytes) {
    throw new Error("Request body is too large.");
  }

  const body = await request.text();
  if (!body) {
    return {};
  }

  if (new TextEncoder().encode(body).length > limitBytes) {
    throw new Error("Request body is too large.");
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Request body must be valid JSON.");
  }
}
