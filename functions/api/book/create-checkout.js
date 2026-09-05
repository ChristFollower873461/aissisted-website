import { listAvailableSlots } from "../_lib/availability.js";
import { relayWebsiteIntakeToAicCrm } from "../_lib/aic-crm.js";
import { buildCrmAttribution } from "../_lib/crm-attribution.js";
import { getBookingConfig, isStripeConfigured } from "../_lib/config.js";
import {
  forbidden,
  json,
  methodNotAllowed,
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
import {
  TransactionSafetyError,
  createIdempotencyExpiry,
  createRequestFingerprint,
  createSafeJsonBody,
  createStripeIdempotencyKey,
  getIdempotencyDecision,
  getIdempotencyKey,
  hashIdempotencyKey,
  normalizeEmail,
  normalizeRelativePath,
  normalizeWhitespace
} from "../_lib/transaction-safety.js";

const COMMAND_ID = "create_booking_checkout";
const RISK = "financial";
const FUNNEL_ID = /^funnel_[A-Za-z0-9_-]{8,80}$/;
const FUNNEL_RETENTION_DAYS = 180;
const MEASUREMENT_CONTRACT_ID = "aissisted_paid_plan_pilot_v1";
const ENTRY_ROUTES = new Set(["book", "home", "services", "navigation", "other"]);
const CTA_IDS = new Set([
  "book_direct",
  "home_hero_paid_plan",
  "home_catalog_paid_plan",
  "home_footer_paid_plan",
  "services_hero_paid_plan",
  "primary_nav_book",
  "other"
]);

const FIELD_LIMITS = {
  slotId: 160,
  name: 100,
  email: 200,
  phone: 40,
  company: 120,
  companyWebsite: 200,
  industry: 80,
  primaryGoal: 120,
  routeId: 80,
  notes: 2000,
  sourcePage: 500,
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
    intake.routeId ? `Route: ${intake.routeId}` : "",
    intake.industry ? `Industry: ${intake.industry}` : "",
    intake.companyWebsite ? `Website: ${intake.companyWebsite}` : "",
    intake.primaryGoal ? `Goal: ${intake.primaryGoal}` : "",
    intake.notes ? `Notes: ${intake.notes}` : ""
  ].filter(Boolean);

  return parts.join(" | ");
}

function errorResponse(status, code, message, extra = {}) {
  return json({ ok: false, error: message, code, ...extra }, status);
}

function replayResponse(record) {
  if (!record.responseBodyJson) {
    return errorResponse(409, "in_progress", "Idempotent checkout response is unavailable.");
  }

  const body = JSON.parse(record.responseBodyJson);
  body.replayed = true;
  return json(body, record.responseStatus || 200);
}

async function writeAudit(store, input) {
  try {
    return await store.logAgentTransactionAudit(input);
  } catch (error) {
    console.warn("[booking] Agent transaction audit failed.", error);
    return null;
  }
}

export function normalizeCheckoutPayload(payload, config) {
  const contact = payload.contact || {};
  const intake = payload.intake || {};
  const honeypot = limitString(
    payload.websiteLeaveBlank || payload.botField,
    "Bot field",
    FIELD_LIMITS.honeypot
  );
  if (honeypot) {
    throw new ValidationError("Unable to create checkout.");
  }

  const slotId = limitString(payload.slotId, "Appointment window", FIELD_LIMITS.slotId);
  const name = normalizeWhitespace(limitString(contact.name, "Name", FIELD_LIMITS.name));
  const email = normalizeEmail(limitString(contact.email, "Email", FIELD_LIMITS.email));
  const phone = normalizeWhitespace(limitString(contact.phone, "Phone", FIELD_LIMITS.phone));
  const company = normalizeWhitespace(limitString(contact.company, "Company", FIELD_LIMITS.company));
  const companyWebsite = normalizeWebsiteUrl(
    limitString(intake.companyWebsite, "Website", FIELD_LIMITS.companyWebsite)
  );
  const industry = normalizeWhitespace(limitString(intake.industry, "Industry", FIELD_LIMITS.industry));
  const primaryGoal = normalizeWhitespace(
    limitString(intake.primaryGoal, "Primary goal", FIELD_LIMITS.primaryGoal)
  );
  const routeId = normalizeWhitespace(limitString(intake.routeId, "Project route", FIELD_LIMITS.routeId));
  const notes = normalizeWhitespace(limitString(intake.notes, "Notes", FIELD_LIMITS.notes));
  const sourcePage = normalizeRelativePath(
    limitString(payload.sourcePage, "Source page", FIELD_LIMITS.sourcePage),
    FIELD_LIMITS.sourcePage
  ) || "/book/";
  const submittedMeasurement = payload.measurement || {};
  const submittedFunnelId = limitString(
    submittedMeasurement.funnelId,
    "Funnel ID",
    96
  );
  const entryRouteCandidate = limitString(
    submittedMeasurement.entryRoute,
    "Entry route",
    40
  );
  const ctaIdCandidate = limitString(submittedMeasurement.ctaId, "CTA ID", 80);

  if (!slotId || !name || !email) {
    throw new ValidationError("Name, email, and an appointment window are required.");
  }

  if (!isValidEmail(email)) {
    throw new ValidationError("Please provide a valid email address.");
  }

  if (payload.policyAccepted !== true) {
    throw new ValidationError("The booking terms must be accepted before checkout.");
  }

  if (payload.checkoutConsent !== true) {
    throw new ValidationError("Confirm the Stripe payment before checkout.");
  }

  const release = config.activeRelease;
  if (!config.checkoutEnabled || !release) {
    throw new ValidationError("Online checkout is temporarily unavailable.");
  }

  const confirmedReservationAmountCents = Number(
    payload.confirmedAmountCents ?? payload.confirmedReservationAmountCents
  );
  if (
    !Number.isInteger(confirmedReservationAmountCents) ||
    confirmedReservationAmountCents !== config.reservationAmountCents
  ) {
    throw new ValidationError("Confirm the current booking amount before checkout.");
  }

  const confirmedCurrency = cleanString(payload.confirmedCurrency).toLowerCase();
  if (confirmedCurrency !== config.currency) {
    throw new ValidationError("Confirm the current booking currency before checkout.");
  }

  const confirmedPolicyVersion = cleanString(
    payload.confirmedTermsVersion || payload.confirmedPolicyVersion
  );
  if (confirmedPolicyVersion !== config.policyVersion) {
    throw new ValidationError("Confirm the current booking terms before checkout.");
  }

  if (release.offerVersion >= 2) {
    if (
      cleanString(payload.confirmedReleaseId) !== release.releaseId ||
      cleanString(payload.confirmedOfferId) !== release.offerId ||
      Number(payload.confirmedOfferVersion) !== release.offerVersion ||
      cleanString(payload.confirmedTermsSha256) !== release.termsSha256
    ) {
      throw new ValidationError("The booking offer changed. Refresh and accept the current terms.");
    }
    if (!release.intakeRouteIds.includes(routeId)) {
      throw new ValidationError("Choose whether you want to improve a workflow or build something new.");
    }
  }

  return {
    slotId,
    policyAccepted: true,
    checkoutConsent: true,
    confirmedReservationAmountCents,
    confirmedCurrency,
    confirmedPolicyVersion,
    confirmedReleaseId: release.releaseId,
    confirmedOfferId: release.offerId,
    confirmedOfferVersion: release.offerVersion,
    confirmedTermsSha256: release.termsSha256,
    contact: {
      name,
      email,
      phone,
      company
    },
    intake: {
      companyWebsite,
      industry,
      primaryGoal,
      routeId,
      notes
    },
    measurement: {
      funnelId: FUNNEL_ID.test(submittedFunnelId) ? submittedFunnelId : "",
      entryRoute: ENTRY_ROUTES.has(entryRouteCandidate) ? entryRouteCandidate : "book",
      ctaId: CTA_IDS.has(ctaIdCandidate) ? ctaIdCandidate : "book_direct",
      laneId: routeId
    },
    sourcePage
  };
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const requestUrl = new URL(context.request.url);
  const config = getBookingConfig(context.env, requestUrl.origin);
  let bookingId = "";
  let createdSessionId = "";
  let store = null;
  let idempotencyKeyHash = "";
  let requestFingerprint = "";
  let idempotencyRecord = null;
  let normalized = null;

  try {
    if (!config.checkoutEnabled || !config.activeRelease) {
      return unavailable("Online checkout is temporarily unavailable. Please use the contact page.");
    }
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

    const idempotencyKey = getIdempotencyKey(context.request);
    idempotencyKeyHash = await hashIdempotencyKey(idempotencyKey);

    const payload = await readJson(context.request);
    normalized = normalizeCheckoutPayload(payload, config);
    if (!normalized.measurement.funnelId) {
      normalized.measurement.funnelId = `funnel_${idempotencyKeyHash.slice(0, 24)}`;
    }
    requestFingerprint = await createRequestFingerprint({
      commandId: COMMAND_ID,
      risk: RISK,
      input: normalized
    });

    store = getBookingStore(context.env);
    await store.deleteExpiredMeasurementEvents(new Date().toISOString());
    const existing = await store.getIdempotencyRecord({
      commandId: COMMAND_ID,
      idempotencyKeyHash
    });
    const decision = getIdempotencyDecision(existing, requestFingerprint);
    if (decision.action === "replay") {
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: existing.id,
        idempotencyKeyHash,
        requestFingerprint,
        targetType: existing.targetType,
        targetId: existing.targetId,
        result: "replayed",
        responseStatus: decision.status,
        safeSummaryJson: existing.requestSummaryJson
      });
      return replayResponse(existing);
    }
    if (decision.action !== "start") {
      const response = errorResponse(
        decision.status,
        decision.code,
        decision.code === "in_progress"
          ? "The original checkout request is still being processed."
          : "This idempotency key was already used for a different checkout request."
      );
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: existing?.id || null,
        idempotencyKeyHash,
        requestFingerprint,
        result: decision.action === "conflict" ? "conflict" : "rejected",
        responseStatus: response.status,
        errorCode: decision.code,
        safeSummaryJson: createSafeJsonBody({
          slotId: normalized.slotId,
          email: normalized.contact.email
        })
      });
      return response;
    }

    idempotencyRecord = await store.startIdempotencyRecord({
      commandId: COMMAND_ID,
      risk: RISK,
      idempotencyKeyHash,
      requestFingerprint,
      requestSummaryJson: createSafeJsonBody({
        slotId: normalized.slotId,
        email: normalized.contact.email,
        amountCents: normalized.confirmedReservationAmountCents,
        currency: normalized.confirmedCurrency,
        policyVersion: normalized.confirmedPolicyVersion,
        releaseId: normalized.confirmedReleaseId,
        offerId: normalized.confirmedOfferId,
        offerVersion: normalized.confirmedOfferVersion,
        termsSha256: normalized.confirmedTermsSha256
      }),
      expiresAt: createIdempotencyExpiry({ retentionHours: 7 * 24 })
    });

    await store.cleanupExpiredHolds();

    const availableSlots = await listAvailableSlots({
      env: context.env,
      origin: requestUrl.origin,
      store,
      days: config.lookaheadDays
    });
    const slot = availableSlots.find((candidate) => candidate.slotId === normalized.slotId);

    if (!slot) {
      throw new SlotUnavailableError(
        "That appointment window is no longer available. Please choose another slot."
      );
    }

    const createdAt = new Date().toISOString();
    const holdExpiresAt = addMinutes(createdAt, config.holdMinutes);
    const stripeCheckoutIdempotencyKey = createStripeIdempotencyKey(
      "aic-checkout",
      idempotencyKeyHash,
      config.activeRelease.releaseId
    );
    const intakeJson = JSON.stringify({
      industry: normalized.intake.industry,
      companyWebsite: normalized.intake.companyWebsite,
      primaryGoal: normalized.intake.primaryGoal,
      routeId: normalized.intake.routeId,
      notes: normalized.intake.notes
    });
    const prospect = await store.upsertProspect({
      name: normalized.contact.name,
      email: normalized.contact.email,
      phone: normalized.contact.phone,
      company: normalized.contact.company,
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
      checkoutIdempotencyRecordId: idempotencyRecord.id,
      intakeSummary: summarizeIntake(JSON.parse(intakeJson)),
      contractInput: {
        release: config.activeRelease,
        acceptedAt: createdAt,
        termsSnapshot: config.termsSnapshot
      },
      stripeCheckoutIdempotencyKey
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
    await store.logEvent({
      bookingId,
      eventType: "paid_plan_start",
      payload: {
        funnelId: normalized.measurement.funnelId,
        entryRoute: normalized.measurement.entryRoute,
        ctaId: normalized.measurement.ctaId,
        laneId: normalized.measurement.laneId,
        releaseId: config.activeRelease.releaseId,
        measurementContractId: MEASUREMENT_CONTRACT_ID,
        retentionDeleteAfter: new Date(
          new Date(createdAt).getTime() + FUNNEL_RETENTION_DAYS * 24 * 60 * 60 * 1000
        ).toISOString()
      }
    });

    let stripeCustomerId = prospect.stripeCustomerId || "";
    if (!stripeCustomerId) {
      try {
        const customer = await createStripeCustomer(config, {
          name: normalized.contact.name,
          email: normalized.contact.email,
          phone: normalized.contact.phone,
          company: normalized.contact.company
        }, {
          idempotencyKey: createStripeIdempotencyKey(
            "aic-customer",
            idempotencyKeyHash,
            normalized.contact.email
          )
        });
        stripeCustomerId = customer.id;
      } catch (error) {
        console.warn("[booking] Stripe customer creation failed; continuing without saved customer.");
      }
    }

    const session = await createCheckoutSession(config, booking, {
      ...prospect,
      stripeCustomerId
    }, {
      idempotencyKey: stripeCheckoutIdempotencyKey
    });
    createdSessionId = session.id;

    await store.attachCheckoutSession(booking.id, {
      sessionId: session.id,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : stripeCustomerId,
      checkoutIdempotencyRecordId: idempotencyRecord.id
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

    const body = {
      ok: true,
      bookingId: booking.id,
      checkoutUrl: session.url,
      holdExpiresAt,
      sessionId: session.id,
      funnelId: normalized.measurement.funnelId
    };
    const crmAttribution = buildCrmAttribution({
      sourcePage: normalized.sourcePage,
      fallbackPath: "/book/",
      sourceChannel: "booking",
      formName: "booking-page",
      qualifiedSourceEventId: `website-booking-${booking.id}`
    });
    const crmRelay = await relayWebsiteIntakeToAicCrm(context.env, {
      name: normalized.contact.name,
      email: normalized.contact.email,
      phone: normalized.contact.phone,
      companyName: normalized.contact.company,
      inquiryType: "booking_request",
      message: [
        `Booking checkout started for ${slot.startsAt} to ${slot.endsAt} ${slot.timezone}.`,
        normalized.intake.primaryGoal ? `Primary goal: ${normalized.intake.primaryGoal}` : "",
        normalized.intake.industry ? `Industry: ${normalized.intake.industry}` : "",
        normalized.intake.companyWebsite ? `Website: ${normalized.intake.companyWebsite}` : "",
        normalized.intake.notes ? `Notes: ${normalized.intake.notes}` : "",
        `Booking ID: ${booking.id}`,
        `Stripe checkout session: ${session.id}`
      ].filter(Boolean).join("\n"),
      ...crmAttribution,
      consent: true,
      websiteLeaveBlank: ""
    });
    if (!crmRelay.ok && !crmRelay.skipped) {
      console.warn("[booking] CRM relay failed.");
    }
    await store.markIdempotencySucceeded(idempotencyRecord.id, {
      targetType: "booking",
      targetId: booking.id,
      responseStatus: 200,
      responseBodyJson: JSON.stringify(body)
    });
    await writeAudit(store, {
      commandId: COMMAND_ID,
      risk: RISK,
      actorType: "agent_assisted",
      idempotencyRecordId: idempotencyRecord.id,
      idempotencyKeyHash,
      requestFingerprint,
      targetType: "booking",
      targetId: booking.id,
      result: "accepted",
      responseStatus: 200,
      safeSummaryJson: idempotencyRecord.requestSummaryJson
    });

    return json(body);
  } catch (error) {
    if (createdSessionId && isStripeConfigured(config)) {
      try {
        await expireCheckoutSession(config, createdSessionId);
      } catch (expireError) {
        console.error("[booking] Failed to expire orphaned checkout session.", expireError);
      }
    }

    if (bookingId) {
      store = store || getBookingStore(context.env);
      await store.markCheckoutFailure(bookingId);
      await store.logEvent({
        bookingId,
        eventType: "stripe.checkout.failed",
        payload: {
          message: error instanceof Error ? error.message : "Unknown checkout error"
        }
      });
    }

    if (error instanceof TransactionSafetyError) {
      return errorResponse(error.status, error.code, error.message);
    }

    let responseStatus = 500;
    let responseBody = {
      ok: false,
      error: "Unexpected server error.",
      code: "internal_error"
    };

    if (error instanceof SlotUnavailableError) {
      responseStatus = 409;
      responseBody = {
        ok: false,
        error: error.message,
        code: "slot_unavailable"
      };
    } else if (error instanceof ValidationError) {
      responseStatus = 400;
      responseBody = {
        ok: false,
        error: error.message,
        code: "validation_failed"
      };
    } else {
      console.error("[booking] Checkout creation failed.", error);
    }

    if (idempotencyRecord && store) {
      await store.markIdempotencyFailed(idempotencyRecord.id, {
        responseStatus,
        responseBodyJson: JSON.stringify(responseBody),
        errorCode: responseBody.code
      });
      await writeAudit(store, {
        commandId: COMMAND_ID,
        risk: RISK,
        actorType: "agent_assisted",
        idempotencyRecordId: idempotencyRecord.id,
        idempotencyKeyHash,
        requestFingerprint,
        targetType: bookingId ? "booking" : null,
        targetId: bookingId || null,
        result: "failed",
        responseStatus,
        errorCode: responseBody.code,
        safeSummaryJson: idempotencyRecord.requestSummaryJson
      });
    }

    return json(responseBody, responseStatus);
  }
}
