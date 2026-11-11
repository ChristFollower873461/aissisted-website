import { resolveBookingControls, resolveFitCallControls } from "./booking-releases.js";
import { getTermsSnapshotForRelease } from "./booking-terms.js";

export const RESERVATION_POLICY_TEXT =
  "This payment reserves your 60-minute appointment window. If you move forward as a customer, the $225 will be credited toward your service. If you do not move forward, the reservation payment is non-refundable.";
export const STRIPE_MINIMUM_SESSION_MINUTES = 30;
export const STRIPE_MAXIMUM_SESSION_MINUTES = 24 * 60;

// Weekly availability template. Slots are 60 minutes long ($225 / hour).
// Weekday evenings (Mon/Tue/Wed/Fri): one slot at 4:30pm–5:30pm.
// Thursday + Saturday: 10:00am through 7:00pm, back-to-back 60-min slots.
// Sunday is closed.
const WEEKDAY_EVENING_WINDOWS = [
  { start: "16:30", end: "17:30" }
];

const LONG_DAY_WINDOWS = (() => {
  const windows = [];
  // 10am through 6pm start times, each a 60-min slot; last slot 6:00–7:00pm.
  for (let hour = 10; hour <= 18; hour += 1) {
    const hh = String(hour).padStart(2, "0");
    const next = String(hour + 1).padStart(2, "0");
    windows.push({ start: `${hh}:00`, end: `${next}:00` });
  }
  return windows;
})();

const DEFAULT_WEEKLY_AVAILABILITY = [
  { day: "MONDAY", windows: WEEKDAY_EVENING_WINDOWS },
  { day: "TUESDAY", windows: WEEKDAY_EVENING_WINDOWS },
  { day: "WEDNESDAY", windows: WEEKDAY_EVENING_WINDOWS },
  { day: "THURSDAY", windows: LONG_DAY_WINDOWS },
  { day: "FRIDAY", windows: WEEKDAY_EVENING_WINDOWS },
  { day: "SATURDAY", windows: LONG_DAY_WINDOWS }
];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseStrictBoolean(value) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return null;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeOrigin(origin, fallback) {
  const candidate = String(origin || fallback || "").trim();
  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate).origin;
  } catch (error) {
    return new URL(fallback).origin;
  }
}

function parseWeeklyAvailability(value) {
  if (!value) {
    return DEFAULT_WEEKLY_AVAILABILITY;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_WEEKLY_AVAILABILITY;
  } catch (error) {
    return DEFAULT_WEEKLY_AVAILABILITY;
  }
}

export function getBookingConfig(env, origin) {
  const requestedHoldMinutes = parsePositiveInteger(env.BOOKING_HOLD_MINUTES, 20);
  const bookingControls = resolveBookingControls(env);
  const fitCallControls = resolveFitCallControls(env);
  const activeRelease = bookingControls.release;
  const termsSnapshot = activeRelease
    ? getTermsSnapshotForRelease(activeRelease.releaseId)
    : null;
  const siteOrigin = env.PREVIEW_ACCESS_REQUIRED === "true" && origin
    ? origin : env.PUBLIC_SITE_ORIGIN;

  return {
    businessTitle: env.BOOKING_BUSINESS_TITLE || "AIssisted Consulting",
    siteOrigin: normalizeOrigin(siteOrigin, origin),
    checkoutEnabled: bookingControls.checkoutEnabled,
    checkoutDisabledReason: bookingControls.reason,
    activeRelease,
    termsSnapshot,
    fitCallEnabled: fitCallControls.enabled,
    fitCallDisabledReason: fitCallControls.reason,
    reservationAmountCents:
      activeRelease?.amountCents || parsePositiveInteger(env.BOOKING_RESERVATION_AMOUNT_CENTS, 22500),
    currency: activeRelease?.currency || String(env.BOOKING_CURRENCY || "usd").toLowerCase(),
    timezone: env.BOOKING_TIMEZONE || "America/New_York",
    holdMinutes: clamp(
      requestedHoldMinutes,
      STRIPE_MINIMUM_SESSION_MINUTES,
      STRIPE_MAXIMUM_SESSION_MINUTES
    ),
    minimumLeadHours: parsePositiveInteger(env.BOOKING_MINIMUM_LEAD_HOURS, 48),
    lookaheadDays: parsePositiveInteger(env.BOOKING_LOOKAHEAD_DAYS, 21),
    weeklyAvailability: parseWeeklyAvailability(env.BOOKING_WEEKLY_AVAILABILITY_JSON),
    policyVersion: activeRelease?.termsVersion || env.BOOKING_POLICY_VERSION || "2026-04-06",
    policySha256: activeRelease?.termsSha256 || "",
    policyText:
      termsSnapshot?.renderedTerms || termsSnapshot?.customerPolicyText || RESERVATION_POLICY_TEXT,
    policyHeading: termsSnapshot?.policyHeading || "Reservation policy",
    policyAcceptanceText: termsSnapshot?.customerAcceptanceText || "",
    supportEmail: env.BOOKING_SUPPORT_EMAIL || "pj@aissistedconsulting.com",
    stripeSecretKey: env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    stripeExpectedLivemode: parseStrictBoolean(env.STRIPE_EXPECTED_LIVEMODE),
    stripeApiVersion: env.STRIPE_API_VERSION || "2026-06-24.dahlia",
    stripePriceId: activeRelease?.stripePriceRef || "",
    stripeProductId: activeRelease?.stripeProductRef || "",
    googleCalendarId: env.GOOGLE_CALENDAR_ID || "primary",
    googleServiceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    googlePrivateKey: env.GOOGLE_PRIVATE_KEY || "",
    googleOAuthClientId: env.GOOGLE_OAUTH_CLIENT_ID || "",
    googleOAuthClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    googleOAuthRefreshToken: env.GOOGLE_OAUTH_REFRESH_TOKEN || "",
    googleCalendarRequired: parseBoolean(env.BOOKING_REQUIRE_GOOGLE_CALENDAR, false),
    googleCalendarCreateEvents: parseBoolean(env.BOOKING_CREATE_GOOGLE_CALENDAR_EVENT, true),
    googleCalendarSendUpdates: String(env.GOOGLE_CALENDAR_SEND_UPDATES || "all"),
    emailProvider: String(
      env.AIC_EMAIL_PROVIDER || env.GRAIL_EMAIL_PROVIDER || ""
    ).trim().toLowerCase(),
    emailApiKey: env.AIC_EMAIL_API_KEY || env.GRAIL_EMAIL_API_KEY || "",
    emailFrom: env.AIC_EMAIL_FROM || env.GRAIL_EMAIL_FROM || "",
    ownerAlertEmail:
      env.AIC_OWNER_ALERT_EMAIL ||
      env.GRAIL_OWNER_ALERT_EMAIL ||
      env.BOOKING_SUPPORT_EMAIL ||
      "pj@aissistedconsulting.com",
    internalNotificationWebhook: env.BOOKING_NOTIFICATION_WEBHOOK_URL || "",
    customerNotificationWebhook: env.BOOKING_CONFIRMATION_WEBHOOK_URL || ""
  };
}

export function isStripeConfigured(config) {
  return Boolean(config.stripeSecretKey);
}

export function isStripeWebhookConfigured(config) {
  return Boolean(config.stripeSecretKey && config.stripeWebhookSecret);
}

export function isGoogleCalendarConfigured(config) {
  const hasServiceAccount = Boolean(
    config.googleCalendarId &&
      config.googleServiceAccountEmail &&
      config.googlePrivateKey
  );
  const hasOAuthRefresh = Boolean(
    config.googleCalendarId &&
      config.googleOAuthClientId &&
      config.googleOAuthClientSecret &&
      config.googleOAuthRefreshToken
  );

  return hasServiceAccount || hasOAuthRefresh;
}
