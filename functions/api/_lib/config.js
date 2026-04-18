export const RESERVATION_POLICY_TEXT =
  "This payment reserves your appointment window. If you move forward as a customer, the $200 will be credited toward your service. If you do not move forward, the reservation payment is non-refundable.";
export const STRIPE_MINIMUM_SESSION_MINUTES = 30;
export const STRIPE_MAXIMUM_SESSION_MINUTES = 24 * 60;

// Weekly availability template. Slots are 30 minutes back-to-back.
// Weekday evenings: two slots each (4:30pm and 5:15pm).
// Thursday + Saturday: 10:00am through 7:00pm, straight through.
// Sunday is closed.
const WEEKDAY_EVENING_WINDOWS = [
  { start: "16:30", end: "17:00" },
  { start: "17:15", end: "17:45" }
];

const LONG_DAY_WINDOWS = (() => {
  const windows = [];
  // 10:00am through 6:30pm in 30-min increments, last slot ends at 7:00pm.
  for (let hour = 10; hour < 19; hour += 1) {
    const hh = String(hour).padStart(2, "0");
    const next = String(hour + 1).padStart(2, "0");
    windows.push({ start: `${hh}:00`, end: `${hh}:30` });
    if (hour < 18) {
      // For the last hour (18:00), we still want the :00 slot (ends 18:30) and
      // one final slot 18:30–19:00, which the `if` block below handles.
      windows.push({ start: `${hh}:30`, end: `${next}:00` });
    }
  }
  windows.push({ start: "18:30", end: "19:00" });
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
