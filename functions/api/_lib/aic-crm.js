function cleanString(value) {
  return String(value || "").trim();
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
    const text = await response.text();
    let body = {};

    try {
      body = text ? JSON.parse(text) : {};
    } catch (error) {
      body = { raw: text.slice(0, 240) };
    }

    return {
      ok: response.ok && body.ok !== false,
      status: response.status,
      submissionId: body.submission?.id || "",
      error: body.error || ""
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "CRM relay failed."
    };
  }
}
