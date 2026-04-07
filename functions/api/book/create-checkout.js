import { listAvailableSlots } from "../_lib/availability.js";
import { getBookingConfig, isStripeConfigured } from "../_lib/config.js";
import {
  badRequest,
  conflict,
  forbidden,
  json,
  methodNotAllowed,
  serverError,
  unavailable,
  unsupportedMediaType,
  readJson
} from "../_lib/http.js";
import {
  createStripeCustomer,
  createCheckoutSession,
  expireCheckoutSession
} from "../_lib/stripe.js";
import { addMinutes } from "../_lib/time.js";
import { getBookingStore, SlotUnavailableError } from "../_lib/storage.js";

const FIELD_LIMITS = {
  slotId: 160,
  name: 100,
  email: 200,
  phone: 40,
  company: 120,
  companyWebsite: 200,
  industry: 80,
  primaryGoal: 120,
  notes: 2000,
  honeypot: 120
};

class ValidationError extends Error {}

function cleanString(value) {
  return String(value || "").trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function limitString(value, fieldName, maximumLength) {
  const trimmed = cleanString(value);
  if (trimmed.length > maximumLength) {
    throw new ValidationError(`${fieldName} must be ${maximumLength} characters or fewer.`);
  }

  return trimmed;
}

function normalizeWebsiteUrl(value) {
  const trimmed = cleanString(value);
  if (!trimmed) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new ValidationError("Website must be a valid URL including http:// or https://.");
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    throw new ValidationError("Website must use http:// or https://.");
  }

  return parsed.toString();
}

function isAllowedOrigin(request, url, config) {
  const originHeader = request.headers.get("origin");
  if (!originHeader) {
    return true;
  }

  try {
    const requestOrigin = new URL(originHeader).origin;
    const allowedOrigins = new Set(
      [url.origin, config.siteOrigin].filter(Boolean).map((value) => new URL(value).origin)
    );
    return allowedOrigins.has(requestOrigin);
  } catch (error) {
    return false;
  }
}

function summarizeIntake(intake) {
  const parts = [
    intake.industry ? `Industry: ${intake.industry}` : "",
    intake.companyWebsite ? `Website: ${intake.companyWebsite}` : "",
    intake.primaryGoal ? `Goal: ${intake.primaryGoal}` : "",
    intake.notes ? `Notes: ${intake.notes}` : ""
  ].filter(Boolean);

  return parts.join(" | ");
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const requestUrl = new URL(context.request.url);
  const config = getBookingConfig(context.env, requestUrl.origin);
  let bookingId = "";
  let createdSessionId = "";

  try {
    if (!isStripeConfigured(config)) {
      return unavailable(
        "Stripe checkout is not configured yet. Add the Stripe environment values and try again."
      );
    }

    const contentType = context.request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return unsupportedMediaType("Booking checkout requests must use application/json.");
    }

    if (!isAllowedOrigin(context.request, requestUrl, config)) {
      return forbidden("Cross-origin booking requests are not allowed.");
    }

    const payload = await readJson(context.request);
    const contact = payload.contact || {};
    const intake = payload.intake || {};
    const honeypot = limitString(
      payload.websiteLeaveBlank || payload.botField,
      "Bot field",
      FIELD_LIMITS.honeypot
    );
    if (honeypot) {
      return badRequest("Unable to create checkout.");
    }

    const slotId = limitString(payload.slotId, "Appointment window", FIELD_LIMITS.slotId);
    const name = limitString(contact.name, "Name", FIELD_LIMITS.name);
    const email = limitString(contact.email, "Email", FIELD_LIMITS.email).toLowerCase();
    const phone = limitString(contact.phone, "Phone", FIELD_LIMITS.phone);
    const company = limitString(contact.company, "Company", FIELD_LIMITS.company);
    const companyWebsite = normalizeWebsiteUrl(
      limitString(intake.companyWebsite, "Website", FIELD_LIMITS.companyWebsite)
    );
    const industry = limitString(intake.industry, "Industry", FIELD_LIMITS.industry);
    const primaryGoal = limitString(
      intake.primaryGoal,
      "Primary goal",
      FIELD_LIMITS.primaryGoal
    );
    const notes = limitString(intake.notes, "Notes", FIELD_LIMITS.notes);

    if (!slotId || !name || !email) {
      return badRequest("Name, email, and an appointment window are required.");
    }

    if (!isValidEmail(email)) {
      return badRequest("Please provide a valid email address.");
    }

    if (payload.policyAccepted !== true) {
      return badRequest("The reservation policy must be accepted before checkout.");
    }

    const store = getBookingStore(context.env);
    await store.cleanupExpiredHolds();

    const availableSlots = await listAvailableSlots({
      env: context.env,
      origin: requestUrl.origin,
      store,
      days: config.lookaheadDays
    });
    const slot = availableSlots.find((candidate) => candidate.slotId === slotId);

    if (!slot) {
      return conflict(
        "That appointment window is no longer available. Please choose another slot."
      );
    }

    const createdAt = new Date().toISOString();
    const holdExpiresAt = addMinutes(createdAt, config.holdMinutes);
    const intakeJson = JSON.stringify({
      industry,
      companyWebsite,
      primaryGoal,
      notes
    });
    const prospect = await store.upsertProspect({
      name,
      email,
      phone,
      company,
      intakeJson
    });
    const booking = await store.createBookingHold({
      prospectId: prospect.id,
      slotId: slot.slotId,
      selectedTimeWindowStart: slot.startsAt,
      selectedTimeWindowEnd: slot.endsAt,
      selectedTimeZone: slot.timezone,
      reservationAmount: config.reservationAmountCents,
      currency: config.currency,
      temporaryHoldExpiresAt: holdExpiresAt,
      createdAt,
      policyVersion: config.policyVersion,
      policyAcceptedAt: createdAt,
      intakeSummary: summarizeIntake(JSON.parse(intakeJson))
    });
    bookingId = booking.id;

    await store.logEvent({
      bookingId,
      eventType: "booking.hold_created",
      payload: {
        slotId: slot.slotId,
        holdExpiresAt
      }
    });

    let stripeCustomerId = prospect.stripeCustomerId || "";
    if (!stripeCustomerId) {
      try {
        const customer = await createStripeCustomer(config, {
          name,
          email,
          phone,
          company
        });
        stripeCustomerId = customer.id;
      } catch (error) {
        console.warn("[booking] Stripe customer creation failed; continuing without saved customer.");
      }
    }

    const session = await createCheckoutSession(config, booking, {
      ...prospect,
      stripeCustomerId
    });
    createdSessionId = session.id;

    await store.attachCheckoutSession(booking.id, {
      sessionId: session.id,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : stripeCustomerId
    });
    await store.logEvent({
      bookingId,
      eventType: "stripe.checkout.created",
      payload: {
        sessionId: session.id,
        expiresAt: session.expires_at
          ? new Date(session.expires_at * 1000).toISOString()
          : holdExpiresAt
      }
    });

    return json({
      ok: true,
      bookingId: booking.id,
      checkoutUrl: session.url,
      holdExpiresAt,
      sessionId: session.id
    });
  } catch (error) {
    if (createdSessionId && isStripeConfigured(config)) {
      try {
        await expireCheckoutSession(config, createdSessionId);
      } catch (expireError) {
        console.error("[booking] Failed to expire orphaned checkout session.", expireError);
      }
    }

    if (bookingId) {
      const store = getBookingStore(context.env);
      await store.markCheckoutFailure(bookingId);
      await store.logEvent({
        bookingId,
        eventType: "stripe.checkout.failed",
        payload: {
          message: error instanceof Error ? error.message : "Unknown checkout error"
        }
      });
    }

    if (error instanceof SlotUnavailableError) {
      return conflict(error.message);
    }

    if (error instanceof ValidationError) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}
