function cleanString(value) {
  return String(value || "").trim();
}

function retryAfterMs(value) {
  if (!value) return 0;
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : NaN;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 24 * 60 * 60 * 1000)) : 0;
}

function buildCrmUrl(env) {
  const rawUrl = cleanString(env.AIC_CRM_INTAKE_URL);
  if (!rawUrl) return "";
  const url = new URL(rawUrl.endsWith("/intake/website") ? rawUrl : `${rawUrl.replace(/\/+$/, "")}/intake/website`);

  const isLocalPreviewUrl =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

  if (url.protocol !== "https:" && !isLocalPreviewUrl) {
    throw new Error("AIC_CRM_INTAKE_URL must use https.");
  }

  return url.toString();
}

export function isAicCrmRelayConfigured(env = {}) {
  return Boolean(buildCrmUrl(env));
}

export async function relayWebsiteIntakeToAicCrm(env, payload) {
  let url = "";
  try {
    url = buildCrmUrl(env);
  } catch (error) {
    console.warn("[aic-crm] CRM relay is misconfigured.");
    return { ok: false, skipped: true, reason: "misconfigured" };
  }

  if (!url) {
    return { ok: false, skipped: true, reason: "not_configured" };
  }

  const token = cleanString(env.AIC_CRM_INTAKE_TOKEN);
  if (!token) {
    console.warn("[aic-crm] CRM relay token is not configured.");
    return { ok: false, skipped: true, reason: "missing_token" };
  }

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${token}`
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let body = {};

    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = { raw: text.slice(0, 240) };
    }

    const submissionId = typeof body?.submission?.id === "string" ? body.submission.id.trim() : "";
    return {
      ok: response.status === 200 && body?.ok === true && Boolean(submissionId) && submissionId.length <= 200,
      status: response.status,
      submissionId: submissionId.length <= 200 ? submissionId : "",
      retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
      error: body?.error || ""
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "CRM relay failed."
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
