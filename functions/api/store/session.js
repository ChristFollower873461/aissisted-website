import { json, methodNotAllowed, unavailable } from "../_lib/http.js";
import { STORE_FILES, getStoreConfig, verifyPaidStoreSession } from "../_lib/store.js";

// Thanks page check: is this a paid book purchase, and which files can it fetch?
export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(context.request.url);
  const config = getStoreConfig(context.env, url.origin);
  if (!config.stripeSecretKey) {
    return unavailable("Downloads are not available right now. Please try again later.");
  }

  const sessionId = url.searchParams.get("session_id") || "";
  const result = await verifyPaidStoreSession(config, sessionId);
  if (!result.ok) {
    return json({ ok: false, code: result.code, error: result.message }, result.status);
  }

  const query = `session_id=${encodeURIComponent(sessionId)}`;
  return json({
    ok: true,
    expiresAt: result.expiresAt,
    files: Object.entries(STORE_FILES).map(([id, file]) => ({
      id,
      label: file.label,
      filename: file.filename,
      href: `/api/store/download?${query}&file=${id}`
    }))
  });
}
