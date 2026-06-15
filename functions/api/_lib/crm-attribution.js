const SITE_ORIGIN = "https://aissistedconsulting.com";

function cleanString(value) {
  return String(value || "").trim();
}

function safeLimit(value, maxLength) {
  return cleanString(value).slice(0, maxLength);
}

export function normalizeCrmSourcePage(value, fallbackPath = "/") {
  const fallback = cleanString(fallbackPath).startsWith("/") ? cleanString(fallbackPath) : "/";
  const raw = cleanString(value);
  if (!raw) return fallback;

  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return safeLimit(raw, 500);
  }

  try {
    const parsed = new URL(raw);
    if (parsed.origin !== SITE_ORIGIN) return fallback;
    return safeLimit(`${parsed.pathname}${parsed.search}`, 500);
  } catch (error) {
    return fallback;
  }
}

export function buildCrmAttribution({
  sourcePage,
  fallbackPath,
  sourceChannel,
  formName,
  qualifiedSourceEventId
} = {}) {
  const normalizedSourcePage = normalizeCrmSourcePage(sourcePage, fallbackPath);
  const sourceUrl = new URL(normalizedSourcePage, SITE_ORIGIN);
  const params = sourceUrl.searchParams;

  return {
    sourceUrl: sourceUrl.toString(),
    sourcePage: normalizedSourcePage,
    sourceChannel: safeLimit(sourceChannel, 120),
    formName: safeLimit(formName, 120),
    utmSource: safeLimit(params.get("utm_source"), 120),
    utmMedium: safeLimit(params.get("utm_medium"), 120),
    utmCampaign: safeLimit(params.get("utm_campaign"), 160),
    utmContent: safeLimit(params.get("utm_content"), 160),
    utmTerm: safeLimit(params.get("utm_term"), 160),
    gclid: safeLimit(params.get("gclid"), 300),
    fbclid: safeLimit(params.get("fbclid"), 300),
    landingPage: `${sourceUrl.origin}${sourceUrl.pathname}`,
    qualificationStatus: "marketing_qualified",
    qualifiedSourceEventId: safeLimit(qualifiedSourceEventId, 160)
  };
}
