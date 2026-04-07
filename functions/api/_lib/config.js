export const RESERVATION_POLICY_TEXT =
  "This payment reserves your appointment window. If you move forward as a customer, the $200 will be credited toward your service. If you do not move forward, the reservation payment is non-refundable.";
export const STRIPE_MINIMUM_SESSION_MINUTES = 30;
export const STRIPE_MAXIMUM_SESSION_MINUTES = 24 * 60;

const DEFAULT_WEEKLY_AVAILABILITY = [
  {
    day: "MONDAY",
    windows: [
      { start: "09:40", end: "10:25" },
      { start: "12:50", end: "13:40" },
      { start: "15:10", end: "16:05" }
    ]
  },
  {
    day: "TUESDAY",
    windows: [
      { start: "10:15", end: "11:05" },
      { start: "13:20", end: "14:10" },
      { start: "16:00", end: "16:45" }
    ]
  },
  {
    day: "WEDNESDAY",
    windows: [
      { start: "09:55", end: "10:40" },
      { start: "14:10", end: "15:00" }
    ]
  },
  {
    day: "THURSDAY",
    windows: [
      { start: "10:35", end: "11:20" },
      { start: "13:05", end: "13:55" },
      { start: "15:45", end: "16:35" }
    ]
  },
  {
    day: "FRIDAY",
    windows: [{ start: "10:20", end: "11:05" }]
  }
];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  return {
    businessTitle: env.BOOKING_BUSINESS_TITLE || "AIssisted Consulting",
    siteOrigin: normalizeOrigin(env.PUBLIC_SITE_ORIGIN, origin),
    reservationAmountCents: parsePositiveInteger(env.BOOKING_RESERVATION_AMOUNT_CENTS, 20000),
    currency: String(env.BOOKING_CURRENCY || "usd").toLowerCase(),
    timezone: env.BOOKING_TIMEZONE || "America/New_York",
    holdMinutes: clamp(
      requestedHoldMinutes,
      STRIPE_MINIMUM_SESSION_MINUTES,
      STRIPE_MAXIMUM_SESSION_MINUTES
    ),
    minimumLeadHours: parsePositiveInteger(env.BOOKING_MINIMUM_LEAD_HOURS, 48),
    lookaheadDays: parsePositiveInteger(env.BOOKING_LOOKAHEAD_DAYS, 21),
    weeklyAvailability: parseWeeklyAvailability(env.BOOKING_WEEKLY_AVAILABILITY_JSON),
    policyVersion: env.BOOKING_POLICY_VERSION || "2026-04-06",
    policyText: RESERVATION_POLICY_TEXT,
    supportEmail: env.BOOKING_SUPPORT_EMAIL || "pj@aissistedconsulting.com",
    stripeSecretKey: env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    stripePriceId: env.STRIPE_BOOKING_PRICE_ID || "",
    googleCalendarId: env.GOOGLE_CALENDAR_ID || "",
    googleServiceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    googlePrivateKey: env.GOOGLE_PRIVATE_KEY || "",
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
  return Boolean(
    config.googleCalendarId &&
      config.googleServiceAccountEmail &&
      config.googlePrivateKey
  );
}
