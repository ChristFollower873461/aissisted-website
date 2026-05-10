import { intervalOverlaps } from "./time.js";

export class SlotUnavailableError extends Error {
  constructor(message = "That appointment window is no longer available.") {
    super(message);
    this.name = "SlotUnavailableError";
  }
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  return Boolean(Number(value));
}

function isActiveReservation(booking, currentTimeIso = nowIso()) {
  return (
    booking.bookingStatus === "confirmed" ||
    (booking.bookingStatus === "hold" &&
      booking.temporaryHoldExpiresAt &&
      booking.temporaryHoldExpiresAt > currentTimeIso)
  );
}

function normalizeBooking(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    prospectId: record.prospectId,
    slotId: record.slotId,
    selectedTimeWindowStart: record.selectedTimeWindowStart,
    selectedTimeWindowEnd: record.selectedTimeWindowEnd,
    selectedTimeZone: record.selectedTimeZone,
    bookingStatus: record.bookingStatus,
    paymentStatus: record.paymentStatus,
    reservationAmount: Number(record.reservationAmount || 0),
    currency: record.currency || "usd",
    stripeCheckoutSessionId: record.stripeCheckoutSessionId || "",
    stripePaymentReference: record.stripePaymentReference || "",
    confirmedAt: record.confirmedAt || null,
    canceledAt: record.canceledAt || null,
    temporaryHoldExpiresAt: record.temporaryHoldExpiresAt || null,
    checkoutStartedAt: record.checkoutStartedAt || null,
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
    policyVersion: record.policyVersion || "",
    policyAcceptedAt: record.policyAcceptedAt || null,
    checkoutIdempotencyRecordId:
      record.checkoutIdempotencyRecordId || record.checkout_idempotency_record_id || null,
    checkoutAuditId: record.checkoutAuditId || record.checkout_audit_id || null,
    intakeSummary: record.intakeSummary || "",
    prospectName: record.prospectName || "",
    prospectEmail: record.prospectEmail || "",
    prospectPhone: record.prospectPhone || "",
    prospectCompany: record.prospectCompany || "",
    stripeCustomerId: record.stripeCustomerId || "",
    depositCreditId: record.depositCreditId || "",
    depositCreditAvailable: toBoolean(record.depositCreditAvailable),
    depositCreditAmount: Number(record.depositCreditAmount || 0),
    depositCreditApplied: toBoolean(record.depositCreditApplied),
    depositCreditAppliedAt: record.depositCreditAppliedAt || null,
    depositCreditAppliedInvoiceReference:
      record.depositCreditAppliedInvoiceReference || null
  };
}

function normalizeProspect(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    email: record.email,
    phone: record.phone || "",
    company: record.company || "",
    intakeJson: record.intakeJson || null,
    stripeCustomerId: record.stripeCustomerId || "",
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function idempotencyRecordKey(commandId, idempotencyKeyHash) {
  return `${commandId}:${idempotencyKeyHash}`;
}

function idempotencyTargetKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

function normalizeIdempotencyRecord(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    commandId: record.commandId || record.command_id,
    risk: record.risk,
    idempotencyKeyHash: record.idempotencyKeyHash || record.idempotency_key_hash,
    requestFingerprint: record.requestFingerprint || record.request_fingerprint,
    requestSummaryJson: record.requestSummaryJson || record.request_summary_json || null,
    status: record.status,
    targetType: record.targetType || record.target_type || "",
    targetId: record.targetId || record.target_id || "",
    responseStatus: Number(record.responseStatus || record.response_status || 0) || null,
    responseBodyJson: record.responseBodyJson || record.response_body_json || null,
    errorCode: record.errorCode || record.error_code || null,
    createdAt: record.createdAt || record.created_at || null,
    updatedAt: record.updatedAt || record.updated_at || null,
    completedAt: record.completedAt || record.completed_at || null,
    expiresAt: record.expiresAt || record.expires_at || null
  };
}

function normalizeAgentTransactionAudit(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    createdAt: record.createdAt || record.created_at || null,
    commandId: record.commandId || record.command_id,
    risk: record.risk,
    actorType: record.actorType || record.actor_type || "unknown",
    idempotencyRecordId:
      record.idempotencyRecordId || record.idempotency_record_id || null,
    idempotencyKeyHash:
      record.idempotencyKeyHash || record.idempotency_key_hash || null,
    requestFingerprint:
      record.requestFingerprint || record.request_fingerprint || null,
    targetType: record.targetType || record.target_type || "",
    targetId: record.targetId || record.target_id || "",
    result: record.result,
    responseStatus: Number(record.responseStatus || record.response_status || 0) || null,
    errorCode: record.errorCode || record.error_code || null,
    safeSummaryJson: record.safeSummaryJson || record.safe_summary_json || null
  };
}

function normalizeContactInquiry(record) {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    status: record.status,
    name: record.name,
    email: record.email,
    emailNormalized: record.emailNormalized || record.email_normalized,
    phone: record.phone || "",
    company: record.company || "",
    audience: record.audience,
    audienceNormalized: record.audienceNormalized || record.audience_normalized,
    message: record.message,
    messageHash: record.messageHash || record.message_hash,
    duplicateFingerprint:
      record.duplicateFingerprint || record.duplicate_fingerprint,
    sourcePage: record.sourcePage || record.source_page || "",
    consentToSubmit: toBoolean(record.consentToSubmit ?? record.consent_to_submit),
    consentAt: record.consentAt || record.consent_at,
    deliveryStatus: record.deliveryStatus || record.delivery_status,
    idempotencyRecordId:
      record.idempotencyRecordId || record.idempotency_record_id,
    createdAt: record.createdAt || record.created_at,
    updatedAt: record.updatedAt || record.updated_at
  };
}

function getMemoryState() {
  if (!globalThis.__aissistedBookingStore) {
    globalThis.__aissistedBookingStore = {
      prospects: new Map(),
      prospectsByEmail: new Map(),
      bookings: new Map(),
      bookingsBySession: new Map(),
      depositCredits: new Map(),
      agentIdempotencyRecords: new Map(),
      agentIdempotencyRecordsById: new Map(),
      agentIdempotencyByTarget: new Map(),
      agentTransactionAudits: [],
      contactInquiries: new Map(),
      contactInquiryIdsByDuplicateFingerprint: new Map(),
      events: []
    };
  }

  if (!globalThis.__aissistedBookingStore.agentIdempotencyRecords) {
    globalThis.__aissistedBookingStore.agentIdempotencyRecords = new Map();
  }
  if (!globalThis.__aissistedBookingStore.agentIdempotencyRecordsById) {
    globalThis.__aissistedBookingStore.agentIdempotencyRecordsById = new Map();
  }
  if (!globalThis.__aissistedBookingStore.agentIdempotencyByTarget) {
    globalThis.__aissistedBookingStore.agentIdempotencyByTarget = new Map();
  }
  if (!globalThis.__aissistedBookingStore.agentTransactionAudits) {
    globalThis.__aissistedBookingStore.agentTransactionAudits = [];
  }
  if (!globalThis.__aissistedBookingStore.contactInquiries) {
    globalThis.__aissistedBookingStore.contactInquiries = new Map();
  }
  if (!globalThis.__aissistedBookingStore.contactInquiryIdsByDuplicateFingerprint) {
    globalThis.__aissistedBookingStore.contactInquiryIdsByDuplicateFingerprint = new Map();
  }

  return globalThis.__aissistedBookingStore;
}

function createMemoryStore() {
  const state = getMemoryState();

  function hydrate(booking) {
    if (!booking) {
      return null;
    }

    const prospect = state.prospects.get(booking.prospectId) || null;
    const deposit = state.depositCredits.get(booking.id) || null;

    return normalizeBooking({
      ...booking,
      prospectName: prospect?.name || "",
      prospectEmail: prospect?.email || "",
      prospectPhone: prospect?.phone || "",
      prospectCompany: prospect?.company || "",
      stripeCustomerId: prospect?.stripeCustomerId || "",
      depositCreditId: deposit?.id || "",
      depositCreditAvailable: deposit?.depositCreditAvailable || 0,
      depositCreditAmount: deposit?.depositCreditAmount || 0,
      depositCreditApplied: deposit?.depositCreditApplied || 0,
      depositCreditAppliedAt: deposit?.depositCreditAppliedAt || null,
      depositCreditAppliedInvoiceReference:
        deposit?.depositCreditAppliedInvoiceReference || null
    });
  }

  function rememberIdempotencyTarget(record) {
    if (record.targetType && record.targetId) {
      state.agentIdempotencyByTarget.set(
        idempotencyTargetKey(record.targetType, record.targetId),
        record.id
      );
    }
  }

  function putIdempotencyRecord(record) {
    state.agentIdempotencyRecords.set(
      idempotencyRecordKey(record.commandId, record.idempotencyKeyHash),
      record
    );
    state.agentIdempotencyRecordsById.set(record.id, record);
    rememberIdempotencyTarget(record);
    return normalizeIdempotencyRecord(record);
  }

  return {
    async getIdempotencyRecord(input) {
      return normalizeIdempotencyRecord(
        state.agentIdempotencyRecords.get(
          idempotencyRecordKey(input.commandId, input.idempotencyKeyHash)
        )
      );
    },

    async getIdempotencyRecordById(id) {
      return normalizeIdempotencyRecord(state.agentIdempotencyRecordsById.get(id));
    },

    async getIdempotencyRecordByTarget(input) {
      const id = state.agentIdempotencyByTarget.get(
        idempotencyTargetKey(input.targetType, input.targetId)
      );
      return id ? this.getIdempotencyRecordById(id) : null;
    },

    async startIdempotencyRecord(input) {
      const key = idempotencyRecordKey(input.commandId, input.idempotencyKeyHash);
      const existing = state.agentIdempotencyRecords.get(key);
      if (existing) {
        return normalizeIdempotencyRecord(existing);
      }

      const timestamp = input.createdAt || nowIso();
      return putIdempotencyRecord({
        id: input.id || createId("idem"),
        commandId: input.commandId,
        risk: input.risk,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestFingerprint: input.requestFingerprint,
        requestSummaryJson: input.requestSummaryJson || null,
        status: "started",
        targetType: input.targetType || "",
        targetId: input.targetId || "",
        responseStatus: null,
        responseBodyJson: null,
        errorCode: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        expiresAt: input.expiresAt || null
      });
    },

    async markIdempotencySucceeded(id, input = {}) {
      const record = state.agentIdempotencyRecordsById.get(id);
      if (!record) {
        return null;
      }

      const timestamp = input.completedAt || nowIso();
      record.status = "succeeded";
      record.targetType = input.targetType || record.targetType || "";
      record.targetId = input.targetId || record.targetId || "";
      record.responseStatus = input.responseStatus || record.responseStatus || 200;
      record.responseBodyJson =
        input.responseBodyJson !== undefined
          ? input.responseBodyJson
          : record.responseBodyJson;
      record.errorCode = null;
      record.updatedAt = timestamp;
      record.completedAt = timestamp;
      return putIdempotencyRecord(record);
    },

    async markIdempotencyFailed(id, input = {}) {
      const record = state.agentIdempotencyRecordsById.get(id);
      if (!record) {
        return null;
      }

      const timestamp = input.completedAt || nowIso();
      record.status = "failed";
      record.targetType = input.targetType || record.targetType || "";
      record.targetId = input.targetId || record.targetId || "";
      record.responseStatus = input.responseStatus || record.responseStatus || 500;
      record.responseBodyJson =
        input.responseBodyJson !== undefined
          ? input.responseBodyJson
          : record.responseBodyJson;
      record.errorCode = input.errorCode || record.errorCode || "internal_error";
      record.updatedAt = timestamp;
      record.completedAt = timestamp;
      return putIdempotencyRecord(record);
    },

    async markIdempotencyConflict(id, input = {}) {
      const record = state.agentIdempotencyRecordsById.get(id);
      if (!record) {
        return null;
      }

      const timestamp = input.completedAt || nowIso();
      record.status = "conflict";
      record.responseStatus = input.responseStatus || record.responseStatus || 409;
      record.responseBodyJson =
        input.responseBodyJson !== undefined
          ? input.responseBodyJson
          : record.responseBodyJson;
      record.errorCode = input.errorCode || record.errorCode || "idempotency_conflict";
      record.updatedAt = timestamp;
      record.completedAt = timestamp;
      return putIdempotencyRecord(record);
    },

    async logAgentTransactionAudit(input) {
      const audit = {
        id: input.id || createId("audit"),
        createdAt: input.createdAt || nowIso(),
        commandId: input.commandId,
        risk: input.risk,
        actorType: input.actorType || "unknown",
        idempotencyRecordId: input.idempotencyRecordId || null,
        idempotencyKeyHash: input.idempotencyKeyHash || null,
        requestFingerprint: input.requestFingerprint || null,
        targetType: input.targetType || "",
        targetId: input.targetId || "",
        result: input.result,
        responseStatus: input.responseStatus || null,
        errorCode: input.errorCode || null,
        safeSummaryJson: input.safeSummaryJson || null
      };
      state.agentTransactionAudits.push(audit);
      return normalizeAgentTransactionAudit(audit);
    },

    async listAgentTransactionAudits() {
      return state.agentTransactionAudits.map((audit) =>
        normalizeAgentTransactionAudit(audit)
      );
    },

    async createContactInquiry(input) {
      const timestamp = input.createdAt || nowIso();
      const inquiry = {
        id: input.id || createId("inq"),
        status: input.status || "received",
        name: input.name,
        email: input.email,
        emailNormalized: input.emailNormalized,
        phone: input.phone || "",
        company: input.company || "",
        audience: input.audience,
        audienceNormalized: input.audienceNormalized,
        message: input.message,
        messageHash: input.messageHash,
        duplicateFingerprint: input.duplicateFingerprint,
        sourcePage: input.sourcePage || "",
        consentToSubmit: input.consentToSubmit === true,
        consentAt: input.consentAt || timestamp,
        deliveryStatus: input.deliveryStatus || "local_record_only",
        idempotencyRecordId: input.idempotencyRecordId,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      state.contactInquiries.set(inquiry.id, inquiry);
      const duplicateIds =
        state.contactInquiryIdsByDuplicateFingerprint.get(inquiry.duplicateFingerprint) || [];
      duplicateIds.push(inquiry.id);
      state.contactInquiryIdsByDuplicateFingerprint.set(
        inquiry.duplicateFingerprint,
        duplicateIds
      );
      return normalizeContactInquiry(inquiry);
    },

    async getContactInquiryById(id) {
      return normalizeContactInquiry(state.contactInquiries.get(id));
    },

    async findRecentContactInquiryByDuplicateFingerprint(input) {
      const ids =
        state.contactInquiryIdsByDuplicateFingerprint.get(input.duplicateFingerprint) || [];
      const sinceIso = input.sinceIso || "";
      const inquiries = ids
        .map((id) => state.contactInquiries.get(id))
        .filter(Boolean)
        .filter((inquiry) => !sinceIso || inquiry.createdAt >= sinceIso)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return normalizeContactInquiry(inquiries[0]);
    },

    async cleanupExpiredHolds(currentTimeIso = nowIso()) {
      for (const booking of state.bookings.values()) {
        if (
          booking.bookingStatus === "hold" &&
          booking.temporaryHoldExpiresAt &&
          booking.temporaryHoldExpiresAt <= currentTimeIso
        ) {
          booking.bookingStatus = "expired";
          booking.paymentStatus = "expired";
          booking.canceledAt = currentTimeIso;
          booking.updatedAt = currentTimeIso;
        }
      }
    },

    async upsertProspect(prospectInput) {
      const email = String(prospectInput.email || "").trim().toLowerCase();
      const existingId = state.prospectsByEmail.get(email);
      const timestamp = nowIso();
      const prospect = existingId
        ? state.prospects.get(existingId)
        : {
            id: createId("cust"),
            createdAt: timestamp,
            stripeCustomerId: ""
          };

      prospect.name = prospectInput.name;
      prospect.email = email;
      prospect.phone = prospectInput.phone || "";
      prospect.company = prospectInput.company || "";
      prospect.intakeJson = prospectInput.intakeJson || null;
      prospect.updatedAt = timestamp;

      state.prospects.set(prospect.id, prospect);
      state.prospectsByEmail.set(email, prospect.id);

      return normalizeProspect(prospect);
    },

    async createBookingHold(input) {
      await this.cleanupExpiredHolds(input.createdAt);
      const blockingBooking = Array.from(state.bookings.values()).find((booking) => {
        if (booking.slotId !== input.slotId) {
          return false;
        }

        if (booking.bookingStatus === "confirmed") {
          return true;
        }

        return (
          booking.bookingStatus === "hold" &&
          booking.temporaryHoldExpiresAt &&
          booking.temporaryHoldExpiresAt > input.createdAt
        );
      });

      if (blockingBooking) {
        throw new SlotUnavailableError();
      }

      const booking = {
        id: createId("book"),
        prospectId: input.prospectId,
        slotId: input.slotId,
        selectedTimeWindowStart: input.selectedTimeWindowStart,
        selectedTimeWindowEnd: input.selectedTimeWindowEnd,
        selectedTimeZone: input.selectedTimeZone,
        bookingStatus: "hold",
        paymentStatus: "hold_created",
        reservationAmount: input.reservationAmount,
        currency: input.currency,
        stripeCheckoutSessionId: "",
        stripePaymentReference: "",
        confirmedAt: null,
        canceledAt: null,
        temporaryHoldExpiresAt: input.temporaryHoldExpiresAt,
        checkoutStartedAt: input.createdAt,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        policyVersion: input.policyVersion,
        policyAcceptedAt: input.policyAcceptedAt,
        checkoutIdempotencyRecordId: input.checkoutIdempotencyRecordId || null,
        checkoutAuditId: input.checkoutAuditId || null,
        intakeSummary: input.intakeSummary || ""
      };

      state.bookings.set(booking.id, booking);
      return hydrate(booking);
    },

    async attachCheckoutSession(bookingId, input) {
      const booking = state.bookings.get(bookingId);
      if (!booking) {
        return null;
      }

      booking.stripeCheckoutSessionId = input.sessionId;
      booking.paymentStatus = "checkout_created";
      booking.checkoutIdempotencyRecordId =
        input.checkoutIdempotencyRecordId || booking.checkoutIdempotencyRecordId || null;
      booking.checkoutAuditId = input.checkoutAuditId || booking.checkoutAuditId || null;
      booking.updatedAt = nowIso();
      state.bookingsBySession.set(input.sessionId, booking.id);

      if (input.stripeCustomerId) {
        const prospect = state.prospects.get(booking.prospectId);
        if (prospect) {
          prospect.stripeCustomerId = input.stripeCustomerId;
          prospect.updatedAt = booking.updatedAt;
        }
      }

      return hydrate(booking);
    },

    async markCheckoutFailure(bookingId) {
      const booking = state.bookings.get(bookingId);
      if (!booking) {
        return null;
      }

      const timestamp = nowIso();
      booking.bookingStatus = "payment_failed";
      booking.paymentStatus = "failed";
      booking.canceledAt = timestamp;
      booking.temporaryHoldExpiresAt = timestamp;
      booking.updatedAt = timestamp;
      return hydrate(booking);
    },

    async getBookingById(bookingId) {
      return hydrate(state.bookings.get(bookingId));
    },

    async getBookingBySessionId(sessionId) {
      const bookingId = state.bookingsBySession.get(sessionId);
      return bookingId ? hydrate(state.bookings.get(bookingId)) : null;
    },

    async listActiveSlotReservations({ startIso, endIso, nowTimeIso = nowIso() }) {
      await this.cleanupExpiredHolds(nowTimeIso);
      return Array.from(state.bookings.values())
        .filter((booking) => {
          return (
            isActiveReservation(booking, nowTimeIso) &&
            intervalOverlaps(
              booking.selectedTimeWindowStart,
              booking.selectedTimeWindowEnd,
              startIso,
              endIso
            )
          );
        })
        .map((booking) =>
          normalizeBooking({
            id: booking.id,
            slotId: booking.slotId,
            selectedTimeWindowStart: booking.selectedTimeWindowStart,
            selectedTimeWindowEnd: booking.selectedTimeWindowEnd,
            bookingStatus: booking.bookingStatus,
            paymentStatus: booking.paymentStatus
          })
        );
    },

    async confirmBookingFromCheckout(input) {
      const booking = state.bookings.get(input.bookingId);
      if (!booking) {
        return { state: "missing", booking: null, reason: "booking_missing" };
      }

      const timestamp = input.confirmedAt || nowIso();
      const prospect = state.prospects.get(booking.prospectId);
      if (prospect && input.stripeCustomerId) {
        prospect.stripeCustomerId = input.stripeCustomerId;
        prospect.updatedAt = timestamp;
      }

      booking.stripeCheckoutSessionId = input.sessionId || booking.stripeCheckoutSessionId;
      booking.stripePaymentReference = input.paymentReference || booking.stripePaymentReference;

      if (booking.bookingStatus === "confirmed") {
        return { state: "already_confirmed", booking: hydrate(booking), reason: "already_confirmed" };
      }

      if (booking.bookingStatus === "manual_review") {
        return { state: "manual_review", booking: hydrate(booking), reason: "already_manual_review" };
      }

      const conflictingBooking = Array.from(state.bookings.values()).find(
        (candidate) =>
          candidate.id !== booking.id &&
          candidate.slotId === booking.slotId &&
          isActiveReservation(candidate, timestamp)
      );
      const holdStillValid =
        booking.bookingStatus === "hold" &&
        booking.temporaryHoldExpiresAt &&
        booking.temporaryHoldExpiresAt > timestamp;

      if (!holdStillValid || conflictingBooking) {
        booking.bookingStatus = "manual_review";
        booking.paymentStatus = "paid_manual_review";
        booking.temporaryHoldExpiresAt = null;
        booking.updatedAt = timestamp;
        return {
          state: "manual_review",
          booking: hydrate(booking),
          reason: conflictingBooking ? "slot_conflict" : "expired_hold"
        };
      }

      booking.bookingStatus = "confirmed";
      booking.paymentStatus = "paid";
      booking.confirmedAt = booking.confirmedAt || timestamp;
      booking.canceledAt = null;
      booking.temporaryHoldExpiresAt = null;
      booking.updatedAt = timestamp;

      const existingCredit = state.depositCredits.get(booking.id);
      state.depositCredits.set(booking.id, {
        id: existingCredit?.id || createId("credit"),
        bookingId: booking.id,
        prospectId: booking.prospectId,
        depositCreditAvailable: 1,
        depositCreditAmount: booking.reservationAmount,
        depositCreditApplied: existingCredit?.depositCreditApplied || 0,
          depositCreditAppliedAt: existingCredit?.depositCreditAppliedAt || null,
          depositCreditAppliedInvoiceReference:
            existingCredit?.depositCreditAppliedInvoiceReference || null
      });

      return { state: "confirmed", booking: hydrate(booking), reason: null };
    },

    async markBookingOutcomeBySession(input) {
      const bookingId = state.bookingsBySession.get(input.sessionId);
      if (!bookingId) {
        return null;
      }

      const booking = state.bookings.get(bookingId);
      if (
        !booking ||
        booking.bookingStatus === "confirmed" ||
        booking.bookingStatus === "manual_review"
      ) {
        return hydrate(booking);
      }

      booking.bookingStatus = input.bookingStatus;
      booking.paymentStatus = input.paymentStatus;
      booking.canceledAt = input.at;
      booking.temporaryHoldExpiresAt = input.at;
      booking.updatedAt = input.at;
      return hydrate(booking);
    },

    async logEvent(event) {
      state.events.push({
        id: createId("evt"),
        bookingId: event.bookingId || null,
        eventType: event.eventType,
        payloadJson: JSON.stringify(event.payload || {}),
        createdAt: nowIso()
      });
    }
  };
}

const BOOKING_SELECT = `
  SELECT
    b.id AS id,
    b.prospect_id AS prospectId,
    b.slot_id AS slotId,
    b.selected_time_window_start AS selectedTimeWindowStart,
    b.selected_time_window_end AS selectedTimeWindowEnd,
    b.selected_time_zone AS selectedTimeZone,
    b.booking_status AS bookingStatus,
    b.payment_status AS paymentStatus,
    b.reservation_amount AS reservationAmount,
    b.currency AS currency,
    b.stripe_checkout_session_id AS stripeCheckoutSessionId,
    b.stripe_payment_reference AS stripePaymentReference,
    b.confirmed_at AS confirmedAt,
    b.canceled_at AS canceledAt,
    b.temporary_hold_expires_at AS temporaryHoldExpiresAt,
    b.checkout_started_at AS checkoutStartedAt,
    b.created_at AS createdAt,
    b.updated_at AS updatedAt,
    b.policy_version AS policyVersion,
    b.policy_accepted_at AS policyAcceptedAt,
    b.checkout_idempotency_record_id AS checkoutIdempotencyRecordId,
    b.checkout_audit_id AS checkoutAuditId,
    b.intake_summary AS intakeSummary,
    p.name AS prospectName,
    p.email AS prospectEmail,
    p.phone AS prospectPhone,
    p.company AS prospectCompany,
    p.stripe_customer_id AS stripeCustomerId,
    d.id AS depositCreditId,
    d.deposit_credit_available AS depositCreditAvailable,
    d.deposit_credit_amount AS depositCreditAmount,
    d.deposit_credit_applied AS depositCreditApplied,
    d.deposit_credit_applied_at AS depositCreditAppliedAt,
    d.deposit_credit_applied_invoice_reference AS depositCreditAppliedInvoiceReference
  FROM bookings b
  LEFT JOIN prospects p ON p.id = b.prospect_id
  LEFT JOIN deposit_credits d ON d.booking_id = b.id
`;

function createD1Store(db) {
  async function fetchBooking(whereClause, value) {
    const record = await db
      .prepare(`${BOOKING_SELECT} WHERE ${whereClause} LIMIT 1`)
      .bind(value)
      .first();
    return normalizeBooking(record);
  }

  async function fetchIdempotencyRecord(whereClause, ...values) {
    const record = await db
      .prepare(
        `
          SELECT
            id,
            command_id,
            risk,
            idempotency_key_hash,
            request_fingerprint,
            request_summary_json,
            status,
            target_type,
            target_id,
            response_status,
            response_body_json,
            error_code,
            created_at,
            updated_at,
            completed_at,
            expires_at
          FROM agent_idempotency_records
          WHERE ${whereClause}
          LIMIT 1
        `
      )
      .bind(...values)
      .first();
    return normalizeIdempotencyRecord(record);
  }

  async function updateProspectStripeCustomer(bookingId, stripeCustomerId, timestamp) {
    if (!stripeCustomerId) {
      return;
    }

    await db
      .prepare(
        `
          UPDATE prospects
          SET stripe_customer_id = COALESCE(stripe_customer_id, ?1),
              updated_at = ?2
          WHERE id = (SELECT prospect_id FROM bookings WHERE id = ?3)
        `
      )
      .bind(stripeCustomerId, timestamp, bookingId)
      .run();
  }

  async function markBookingForManualReview(input) {
    const timestamp = input.at || nowIso();
    await db
      .prepare(
        `
          UPDATE bookings
          SET booking_status = 'manual_review',
              payment_status = 'paid_manual_review',
              stripe_checkout_session_id = COALESCE(?1, stripe_checkout_session_id),
              stripe_payment_reference = COALESCE(?2, stripe_payment_reference),
              canceled_at = NULL,
              temporary_hold_expires_at = NULL,
              updated_at = ?3
          WHERE id = ?4
        `
      )
      .bind(
        input.sessionId || null,
        input.paymentReference || null,
        timestamp,
        input.bookingId
      )
      .run();

    await updateProspectStripeCustomer(
      input.bookingId,
      input.stripeCustomerId,
      timestamp
    );

    return fetchBooking("b.id = ?1", input.bookingId);
  }

  return {
    async getIdempotencyRecord(input) {
      return fetchIdempotencyRecord(
        "command_id = ?1 AND idempotency_key_hash = ?2",
        input.commandId,
        input.idempotencyKeyHash
      );
    },

    async getIdempotencyRecordById(id) {
      return fetchIdempotencyRecord("id = ?1", id);
    },

    async getIdempotencyRecordByTarget(input) {
      return fetchIdempotencyRecord(
        "target_type = ?1 AND target_id = ?2",
        input.targetType,
        input.targetId
      );
    },

    async startIdempotencyRecord(input) {
      const existing = await this.getIdempotencyRecord(input);
      if (existing) {
        return existing;
      }

      const timestamp = input.createdAt || nowIso();
      const id = input.id || createId("idem");
      await db
        .prepare(
          `
            INSERT INTO agent_idempotency_records (
              id,
              command_id,
              risk,
              idempotency_key_hash,
              request_fingerprint,
              request_summary_json,
              status,
              target_type,
              target_id,
              response_status,
              response_body_json,
              error_code,
              created_at,
              updated_at,
              completed_at,
              expires_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'started', ?7, ?8, NULL, NULL, NULL, ?9, ?9, NULL, ?10)
            ON CONFLICT(command_id, idempotency_key_hash) DO NOTHING
          `
        )
        .bind(
          id,
          input.commandId,
          input.risk,
          input.idempotencyKeyHash,
          input.requestFingerprint,
          input.requestSummaryJson || null,
          input.targetType || null,
          input.targetId || null,
          timestamp,
          input.expiresAt || null
        )
        .run();

      return this.getIdempotencyRecord(input);
    },

    async markIdempotencySucceeded(id, input = {}) {
      const timestamp = input.completedAt || nowIso();
      await db
        .prepare(
          `
            UPDATE agent_idempotency_records
            SET status = 'succeeded',
                target_type = COALESCE(?1, target_type),
                target_id = COALESCE(?2, target_id),
                response_status = COALESCE(?3, response_status, 200),
                response_body_json = COALESCE(?4, response_body_json),
                error_code = NULL,
                updated_at = ?5,
                completed_at = ?5
            WHERE id = ?6
          `
        )
        .bind(
          input.targetType || null,
          input.targetId || null,
          input.responseStatus || null,
          input.responseBodyJson === undefined ? null : input.responseBodyJson,
          timestamp,
          id
        )
        .run();

      return this.getIdempotencyRecordById(id);
    },

    async markIdempotencyFailed(id, input = {}) {
      const timestamp = input.completedAt || nowIso();
      await db
        .prepare(
          `
            UPDATE agent_idempotency_records
            SET status = 'failed',
                target_type = COALESCE(?1, target_type),
                target_id = COALESCE(?2, target_id),
                response_status = COALESCE(?3, response_status, 500),
                response_body_json = COALESCE(?4, response_body_json),
                error_code = COALESCE(?5, error_code, 'internal_error'),
                updated_at = ?6,
                completed_at = ?6
            WHERE id = ?7
          `
        )
        .bind(
          input.targetType || null,
          input.targetId || null,
          input.responseStatus || null,
          input.responseBodyJson === undefined ? null : input.responseBodyJson,
          input.errorCode || null,
          timestamp,
          id
        )
        .run();

      return this.getIdempotencyRecordById(id);
    },

    async markIdempotencyConflict(id, input = {}) {
      const timestamp = input.completedAt || nowIso();
      await db
        .prepare(
          `
            UPDATE agent_idempotency_records
            SET status = 'conflict',
                response_status = COALESCE(?1, response_status, 409),
                response_body_json = COALESCE(?2, response_body_json),
                error_code = COALESCE(?3, error_code, 'idempotency_conflict'),
                updated_at = ?4,
                completed_at = ?4
            WHERE id = ?5
          `
        )
        .bind(
          input.responseStatus || null,
          input.responseBodyJson === undefined ? null : input.responseBodyJson,
          input.errorCode || null,
          timestamp,
          id
        )
        .run();

      return this.getIdempotencyRecordById(id);
    },

    async logAgentTransactionAudit(input) {
      const id = input.id || createId("audit");
      const timestamp = input.createdAt || nowIso();
      await db
        .prepare(
          `
            INSERT INTO agent_transaction_audits (
              id,
              created_at,
              command_id,
              risk,
              actor_type,
              idempotency_record_id,
              idempotency_key_hash,
              request_fingerprint,
              target_type,
              target_id,
              result,
              response_status,
              error_code,
              safe_summary_json
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
          `
        )
        .bind(
          id,
          timestamp,
          input.commandId,
          input.risk,
          input.actorType || "unknown",
          input.idempotencyRecordId || null,
          input.idempotencyKeyHash || null,
          input.requestFingerprint || null,
          input.targetType || null,
          input.targetId || null,
          input.result,
          input.responseStatus || null,
          input.errorCode || null,
          input.safeSummaryJson || null
        )
        .run();

      return normalizeAgentTransactionAudit({
        id,
        createdAt: timestamp,
        commandId: input.commandId,
        risk: input.risk,
        actorType: input.actorType || "unknown",
        idempotencyRecordId: input.idempotencyRecordId || null,
        idempotencyKeyHash: input.idempotencyKeyHash || null,
        requestFingerprint: input.requestFingerprint || null,
        targetType: input.targetType || "",
        targetId: input.targetId || "",
        result: input.result,
        responseStatus: input.responseStatus || null,
        errorCode: input.errorCode || null,
        safeSummaryJson: input.safeSummaryJson || null
      });
    },

    async createContactInquiry(input) {
      const timestamp = input.createdAt || nowIso();
      const id = input.id || createId("inq");
      await db
        .prepare(
          `
            INSERT INTO contact_inquiries (
              id,
              status,
              name,
              email,
              email_normalized,
              phone,
              company,
              audience,
              audience_normalized,
              message,
              message_hash,
              duplicate_fingerprint,
              source_page,
              consent_to_submit,
              consent_at,
              delivery_status,
              idempotency_record_id,
              created_at,
              updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)
          `
        )
        .bind(
          id,
          input.status || "received",
          input.name,
          input.email,
          input.emailNormalized,
          input.phone || null,
          input.company || null,
          input.audience,
          input.audienceNormalized,
          input.message,
          input.messageHash,
          input.duplicateFingerprint,
          input.sourcePage || null,
          input.consentToSubmit === true ? 1 : 0,
          input.consentAt || timestamp,
          input.deliveryStatus || "local_record_only",
          input.idempotencyRecordId,
          timestamp
        )
        .run();

      return this.getContactInquiryById(id);
    },

    async getContactInquiryById(id) {
      const record = await db
        .prepare(
          `
            SELECT
              id,
              status,
              name,
              email,
              email_normalized,
              phone,
              company,
              audience,
              audience_normalized,
              message,
              message_hash,
              duplicate_fingerprint,
              source_page,
              consent_to_submit,
              consent_at,
              delivery_status,
              idempotency_record_id,
              created_at,
              updated_at
            FROM contact_inquiries
            WHERE id = ?1
            LIMIT 1
          `
        )
        .bind(id)
        .first();
      return normalizeContactInquiry(record);
    },

    async findRecentContactInquiryByDuplicateFingerprint(input) {
      const record = await db
        .prepare(
          `
            SELECT
              id,
              status,
              name,
              email,
              email_normalized,
              phone,
              company,
              audience,
              audience_normalized,
              message,
              message_hash,
              duplicate_fingerprint,
              source_page,
              consent_to_submit,
              consent_at,
              delivery_status,
              idempotency_record_id,
              created_at,
              updated_at
            FROM contact_inquiries
            WHERE duplicate_fingerprint = ?1
              AND created_at >= ?2
            ORDER BY created_at DESC
            LIMIT 1
          `
        )
        .bind(input.duplicateFingerprint, input.sinceIso || "")
        .first();
      return normalizeContactInquiry(record);
    },

    async cleanupExpiredHolds(currentTimeIso = nowIso()) {
      await db
        .prepare(
          `
            UPDATE bookings
            SET booking_status = 'expired',
                payment_status = 'expired',
                canceled_at = ?1,
                updated_at = ?1
            WHERE booking_status = 'hold'
              AND temporary_hold_expires_at IS NOT NULL
              AND temporary_hold_expires_at <= ?1
          `
        )
        .bind(currentTimeIso)
        .run();
    },

    async upsertProspect(prospectInput) {
      const timestamp = nowIso();
      const email = String(prospectInput.email || "").trim().toLowerCase();
      const intakeJson = prospectInput.intakeJson || null;

      await db
        .prepare(
          `
            INSERT INTO prospects (
              id,
              name,
              email,
              phone,
              company,
              intake_json,
              stripe_customer_id,
              created_at,
              updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7)
            ON CONFLICT(email) DO UPDATE SET
              name = excluded.name,
              phone = excluded.phone,
              company = excluded.company,
              intake_json = excluded.intake_json,
              updated_at = excluded.updated_at
          `
        )
        .bind(
          createId("cust"),
          prospectInput.name,
          email,
          prospectInput.phone || null,
          prospectInput.company || null,
          intakeJson,
          timestamp
        )
        .run();

      const record = await db
        .prepare(
          `
            SELECT
              id,
              name,
              email,
              phone,
              company,
              intake_json AS intakeJson,
              stripe_customer_id AS stripeCustomerId,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM prospects
            WHERE email = ?1
            LIMIT 1
          `
        )
        .bind(email)
        .first();

      return normalizeProspect(record);
    },

    async createBookingHold(input) {
      await this.cleanupExpiredHolds(input.createdAt);

      const existing = await db
        .prepare(
          `
            SELECT id
            FROM bookings
            WHERE slot_id = ?1
              AND (
                booking_status = 'confirmed'
                OR (booking_status = 'hold' AND temporary_hold_expires_at > ?2)
              )
            LIMIT 1
          `
        )
        .bind(input.slotId, input.createdAt)
        .first();

      if (existing) {
        throw new SlotUnavailableError();
      }

      const bookingId = createId("book");

      try {
        await db
          .prepare(
            `
              INSERT INTO bookings (
                id,
                prospect_id,
                slot_id,
                selected_time_window_start,
                selected_time_window_end,
                selected_time_zone,
                booking_status,
                payment_status,
                reservation_amount,
                currency,
                stripe_checkout_session_id,
                stripe_payment_reference,
                confirmed_at,
                canceled_at,
                temporary_hold_expires_at,
                checkout_started_at,
                created_at,
                updated_at,
                policy_version,
                policy_accepted_at,
                checkout_idempotency_record_id,
                checkout_audit_id,
                intake_summary
              )
              VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                'hold', 'hold_created', ?7, ?8, NULL, NULL,
                NULL, NULL, ?9, ?10, ?10, ?10, ?11, ?12, ?13, ?14, ?15
              )
            `
          )
          .bind(
            bookingId,
            input.prospectId,
            input.slotId,
            input.selectedTimeWindowStart,
            input.selectedTimeWindowEnd,
            input.selectedTimeZone,
            input.reservationAmount,
            input.currency,
            input.temporaryHoldExpiresAt,
            input.createdAt,
            input.policyVersion,
            input.policyAcceptedAt,
            input.checkoutIdempotencyRecordId || null,
            input.checkoutAuditId || null,
            input.intakeSummary || null
          )
          .run();
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          throw new SlotUnavailableError();
        }

        throw error;
      }

      return fetchBooking("b.id = ?1", bookingId);
    },

    async attachCheckoutSession(bookingId, input) {
      const timestamp = nowIso();
      await db
        .prepare(
          `
            UPDATE bookings
            SET stripe_checkout_session_id = ?1,
                payment_status = 'checkout_created',
                checkout_idempotency_record_id = COALESCE(?2, checkout_idempotency_record_id),
                checkout_audit_id = COALESCE(?3, checkout_audit_id),
                updated_at = ?4
            WHERE id = ?5
          `
        )
        .bind(
          input.sessionId,
          input.checkoutIdempotencyRecordId || null,
          input.checkoutAuditId || null,
          timestamp,
          bookingId
        )
        .run();

      await updateProspectStripeCustomer(bookingId, input.stripeCustomerId, timestamp);

      return fetchBooking("b.id = ?1", bookingId);
    },

    async markCheckoutFailure(bookingId) {
      const timestamp = nowIso();
      await db
        .prepare(
          `
            UPDATE bookings
            SET booking_status = 'payment_failed',
                payment_status = 'failed',
                canceled_at = ?1,
                temporary_hold_expires_at = ?1,
                updated_at = ?1
            WHERE id = ?2
          `
        )
        .bind(timestamp, bookingId)
        .run();

      return fetchBooking("b.id = ?1", bookingId);
    },

    async getBookingById(bookingId) {
      return fetchBooking("b.id = ?1", bookingId);
    },

    async getBookingBySessionId(sessionId) {
      return fetchBooking("b.stripe_checkout_session_id = ?1", sessionId);
    },

    async listActiveSlotReservations({ startIso, endIso, nowTimeIso = nowIso() }) {
      await this.cleanupExpiredHolds(nowTimeIso);
      const results = await db
        .prepare(
          `
            SELECT
              id AS id,
              slot_id AS slotId,
              selected_time_window_start AS selectedTimeWindowStart,
              selected_time_window_end AS selectedTimeWindowEnd,
              booking_status AS bookingStatus,
              payment_status AS paymentStatus
            FROM bookings
            WHERE selected_time_window_start < ?1
              AND selected_time_window_end > ?2
              AND (
                booking_status = 'confirmed'
                OR (booking_status = 'hold' AND temporary_hold_expires_at > ?3)
              )
          `
        )
        .bind(endIso, startIso, nowTimeIso)
        .all();

      return (results.results || []).map((record) => normalizeBooking(record));
    },

    async confirmBookingFromCheckout(input) {
      const timestamp = input.confirmedAt || nowIso();
      const currentBooking = await fetchBooking("b.id = ?1", input.bookingId);
      if (!currentBooking) {
        return { state: "missing", booking: null, reason: "booking_missing" };
      }

      if (currentBooking.bookingStatus === "confirmed") {
        await updateProspectStripeCustomer(
          input.bookingId,
          input.stripeCustomerId,
          timestamp
        );
        return {
          state: "already_confirmed",
          booking: await fetchBooking("b.id = ?1", input.bookingId),
          reason: "already_confirmed"
        };
      }

      if (currentBooking.bookingStatus === "manual_review") {
        return {
          state: "manual_review",
          booking: currentBooking,
          reason: "already_manual_review"
        };
      }

      const holdStillValid =
        currentBooking.bookingStatus === "hold" &&
        currentBooking.temporaryHoldExpiresAt &&
        currentBooking.temporaryHoldExpiresAt > timestamp;
      const conflictingBooking = await db
        .prepare(
          `
            SELECT id
            FROM bookings
            WHERE slot_id = ?1
              AND id != ?2
              AND (
                booking_status = 'confirmed'
                OR (booking_status = 'hold' AND temporary_hold_expires_at > ?3)
              )
            LIMIT 1
          `
        )
        .bind(currentBooking.slotId, currentBooking.id, timestamp)
        .first();

      if (!holdStillValid || conflictingBooking) {
        return {
          state: "manual_review",
          booking: await markBookingForManualReview({
            bookingId: input.bookingId,
            sessionId: input.sessionId,
            paymentReference: input.paymentReference,
            stripeCustomerId: input.stripeCustomerId,
            at: timestamp
          }),
          reason: conflictingBooking ? "slot_conflict" : "expired_hold"
        };
      }

      try {
        const result = await db
          .prepare(
            `
              UPDATE bookings
              SET booking_status = 'confirmed',
                  payment_status = 'paid',
                  stripe_checkout_session_id = COALESCE(?1, stripe_checkout_session_id),
                  stripe_payment_reference = COALESCE(?2, stripe_payment_reference),
                  confirmed_at = COALESCE(confirmed_at, ?3),
                  canceled_at = NULL,
                  temporary_hold_expires_at = NULL,
                  updated_at = ?3
              WHERE id = ?4
                AND booking_status = 'hold'
                AND temporary_hold_expires_at IS NOT NULL
                AND temporary_hold_expires_at > ?3
            `
          )
          .bind(
            input.sessionId || null,
            input.paymentReference || null,
            timestamp,
            input.bookingId
          )
          .run();

        if (!result.meta?.changes) {
          return {
            state: "manual_review",
            booking: await markBookingForManualReview({
              bookingId: input.bookingId,
              sessionId: input.sessionId,
              paymentReference: input.paymentReference,
              stripeCustomerId: input.stripeCustomerId,
              at: timestamp
            }),
            reason: "stale_hold"
          };
        }
      } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
          return {
            state: "manual_review",
            booking: await markBookingForManualReview({
              bookingId: input.bookingId,
              sessionId: input.sessionId,
              paymentReference: input.paymentReference,
              stripeCustomerId: input.stripeCustomerId,
              at: timestamp
            }),
            reason: "slot_conflict"
          };
        }

        throw error;
      }

      await updateProspectStripeCustomer(
        input.bookingId,
        input.stripeCustomerId,
        timestamp
      );

      const booking = await fetchBooking("b.id = ?1", input.bookingId);
      if (!booking) {
        return { state: "missing", booking: null, reason: "booking_missing" };
      }

      await db
        .prepare(
          `
            INSERT INTO deposit_credits (
              id,
              booking_id,
              prospect_id,
              deposit_credit_available,
              deposit_credit_amount,
              deposit_credit_applied,
              deposit_credit_applied_at,
              deposit_credit_applied_invoice_reference,
              created_at,
              updated_at
            )
            VALUES (?1, ?2, ?3, 1, ?4, 0, NULL, NULL, ?5, ?5)
            ON CONFLICT(booking_id) DO UPDATE SET
              deposit_credit_available = 1,
              deposit_credit_amount = excluded.deposit_credit_amount,
              updated_at = excluded.updated_at
          `
        )
        .bind(
          createId("credit"),
          booking.id,
          booking.prospectId,
          booking.reservationAmount,
          timestamp
        )
        .run();

      return {
        state: "confirmed",
        booking: await fetchBooking("b.id = ?1", booking.id),
        reason: null
      };
    },

    async markBookingOutcomeBySession(input) {
      await db
        .prepare(
          `
            UPDATE bookings
            SET booking_status = ?1,
                payment_status = ?2,
                canceled_at = ?3,
                temporary_hold_expires_at = ?3,
                updated_at = ?3
            WHERE stripe_checkout_session_id = ?4
              AND booking_status NOT IN ('confirmed', 'manual_review')
          `
        )
        .bind(input.bookingStatus, input.paymentStatus, input.at, input.sessionId)
        .run();

      return fetchBooking("b.stripe_checkout_session_id = ?1", input.sessionId);
    },

    async logEvent(event) {
      await db
        .prepare(
          `
            INSERT INTO booking_events (
              id,
              booking_id,
              event_type,
              payload_json,
              created_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5)
          `
        )
        .bind(
          createId("evt"),
          event.bookingId || null,
          event.eventType,
          JSON.stringify(event.payload || {}),
          nowIso()
        )
        .run();
    }
  };
}

export function getBookingStore(env) {
  return env.BOOKING_DB ? createD1Store(env.BOOKING_DB) : createMemoryStore();
}
