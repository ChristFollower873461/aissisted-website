import { badRequest, json, methodNotAllowed, unavailable } from "../_lib/http.js";
import { STORE_FILES, getStoreConfig, verifyPaidStoreSession } from "../_lib/store.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const url = new URL(context.request.url);
  const fileId = url.searchParams.get("file") || "";
  if (!Object.hasOwn(STORE_FILES, fileId)) {
    return badRequest("Pick pdf, epub or toolkit.");
  }

  const config = getStoreConfig(context.env, url.origin);
  if (!config.stripeSecretKey || !config.files) {
    return unavailable("Downloads are not available right now. Please try again later.");
  }

  const result = await verifyPaidStoreSession(config, url.searchParams.get("session_id") || "");
  if (!result.ok) {
    return json({ ok: false, code: result.code, error: result.message }, result.status);
  }

  const file = STORE_FILES[fileId];
  const object = await config.files.get(file.objectKey);
  if (!object) {
    console.error(`[store] Missing private object ${file.objectKey}.`);
    return unavailable("That file is missing on our side. Email pj@aissistedconsulting.com and we'll send it.");
  }

  const headers = {
    "content-type": file.contentType,
    "content-disposition": `attachment; filename="${file.filename}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-robots-tag": "noindex"
  };
  if (Number.isFinite(object.size)) {
    headers["content-length"] = String(object.size);
  }
  return new Response(object.body, { status: 200, headers });
}
