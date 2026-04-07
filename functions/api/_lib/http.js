export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
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
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return json({ ok: false, error: message }, 500);
}

export async function readJson(request) {
  const body = await request.text();
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Request body must be valid JSON.");
  }
}
