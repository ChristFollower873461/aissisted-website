import { relayWebsiteIntakeToAicCrm } from "./aic-crm.js";
import { buildCrmAttribution } from "./crm-attribution.js";

const MAX_ATTEMPTS = 8;
const LEASE_MS = 45_000;
const RETRYABLE_CLIENT_STATUSES = new Set([408, 409, 425, 429]);

// Persist the exact payload and globally distinct event ID in the same
// transaction as the enquiry, before any network attempt can take place.
export async function createContactInquiryWithCrmDelivery({ store, input, kind = "contact" }) {
  if (!["contact", "fit_call"].includes(kind)) throw new Error("Unknown inquiry kind.");
  const id = input.id || `inq_${crypto.randomUUID().replace(/-/g, "")}`;
  const fitCall = kind === "fit_call";
  const eventId = `${fitCall ? "fit-call" : "website-contact"}-${id}`;
  const payload = {
    name: input.name,
    email: input.email,
    phone: input.phone || "",
    companyName: input.company || "",
    inquiryType: fitCall ? "fit_call_request" : input.audience || "send_inquiry",
    message: input.message,
    ...buildCrmAttribution({
      sourcePage: input.sourcePage,
      fallbackPath: fitCall ? "/book/" : "/contact/",
      sourceChannel: fitCall ? "fit_call_request" : "website",
      formName: fitCall ? "fit-call-request" : "contact-page",
      qualifiedSourceEventId: eventId
    }),
    consent: input.consentToSubmit === true,
    consentedAt: input.consentAt,
    websiteLeaveBlank: ""
  };
  return store.createContactInquiry({ ...input, id, crmDelivery: { eventId, payloadJson: JSON.stringify(payload) } });
}

function failureCode(result) {
  if (result.skipped) return `crm_${result.reason}`;
  if (result.status === 200) return "crm_invalid_acknowledgement";
  return result.status ? `crm_http_${result.status}` : "crm_transport_error";
}

async function attemptDelivery({ store, env, item }) {
  const at = new Date().toISOString();
  const leaseToken = crypto.randomUUID();
  const claimed = await store.claimCrmDelivery(item.id, {
    at, leaseToken, leaseExpiresAt: new Date(Date.parse(at) + LEASE_MS).toISOString()
  });
  if (!claimed) return { attempted: false };

  let result;
  if (claimed.attempts > MAX_ATTEMPTS) {
    // An eighth attempt may have died without recording its result. Reclaim
    // that expired lease so it becomes visible instead of staying processing.
    result = { ok: false, exhausted: true };
  } else {
    try {
      result = await relayWebsiteIntakeToAicCrm(env, JSON.parse(claimed.payloadJson));
    } catch (_error) {
      result = { ok: false, invalidPayload: true };
    }
  }
  const finishedAt = new Date().toISOString();
  const permanent = result.invalidPayload || result.exhausted ||
    (result.status >= 400 && result.status < 500 && !RETRYABLE_CLIENT_STATUSES.has(result.status));
  const state = result.ok ? "delivered" : permanent || claimed.attempts >= MAX_ATTEMPTS ? "needs_attention" : "pending";
  const delayMs = Math.max(
    Math.min(60_000 * 2 ** (claimed.attempts - 1), 60 * 60_000),
    result.retryAfterMs || 0
  );
  const committed = await store.finishCrmDelivery(claimed.id, {
    leaseToken, state, at: finishedAt,
    nextAttemptAt: state === "pending" ? new Date(Date.parse(finishedAt) + delayMs).toISOString() : null,
    lastSafeErrorCode: result.ok ? "" : result.exhausted ? "crm_attempt_limit" : result.invalidPayload ? "crm_invalid_payload" : failureCode(result),
    submissionId: result.ok ? result.submissionId : "",
    deliveryStatus: result.ok ? "crm_relay_delivered" : result.skipped ? "local_record_only" : "crm_relay_failed"
  });
  return { attempted: true, state: committed ? state : "lease_lost" };
}

export async function deliverContactInquiryToCrm({ store, env, inquiry }) {
  try {
    const item = await store.getCrmDeliveryByInquiryId(inquiry.id);
    if (item) await attemptDelivery({ store, env, item });
    return await store.getContactInquiryById(inquiry.id) || inquiry;
  } catch (_error) {
    // The enquiry and delivery intent already committed. An unavailable
    // acknowledgement write leaves a lease for the monitor to recover.
    console.warn("[contact-crm] Accepted inquiry delivery remains unresolved.");
    return inquiry;
  }
}

export async function drainContactCrmDeliveries({ store, env, at = new Date().toISOString() }) {
  const due = await store.listDueCrmDeliveries({ at, limit: 10 });
  let attempted = 0;
  for (const item of due) {
    // Claim immediately before each request, not the whole sequential batch.
    try {
      const result = await attemptDelivery({ store, env, item });
      if (result.attempted) attempted += 1;
    } catch (_error) {
      console.warn("[contact-crm] Monitor delivery remains unresolved.");
    }
  }
  return { attemptedThisRun: attempted, ...await store.getCrmDeliverySummary({ at: new Date().toISOString() }) };
}
