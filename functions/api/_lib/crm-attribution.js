const SITE_ORIGIN = "https://aissistedconsulting.com";
const MAX_CRM_URL_LENGTH = 500;

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

function boundedSourceUrl(url) {
  if (url.href.length <= MAX_CRM_URL_LENGTH) return url.href;

  const bounded = new URL(url);
  bounded.search = "";
  bounded.hash = "";
  // Optional URL fields stay empty when even the original path cannot fit.
  if (bounded.href.length > MAX_CRM_URL_LENGTH) return "";

  // The receiver limits the absolute URL, including its origin. Keep only
  // complete pairs here; the original source page and structured fields survive.
  for (const [key, value] of url.searchParams) {
    const candidate = new URL(bounded);
    candidate.searchParams.append(key, value);
    if (candidate.href.length <= MAX_CRM_URL_LENGTH) bounded.search = candidate.search;
  }
  if ((bounded.href + url.hash).length <= MAX_CRM_URL_LENGTH) bounded.hash = url.hash;
  return bounded.href;
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
  const landingPage = `${sourceUrl.origin}${sourceUrl.pathname}`;

  return {
    sourceUrl: boundedSourceUrl(sourceUrl),
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
    landingPage: landingPage.length <= MAX_CRM_URL_LENGTH ? landingPage : "",
    qualificationStatus: "marketing_qualified",
    qualifiedSourceEventId: safeLimit(qualifiedSourceEventId, 160)
  };
}
