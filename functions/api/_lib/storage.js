import { intervalOverlaps } from "./time.js";
import { createBookingContractSnapshot } from "./booking-contract.js";
import { shouldCreateImplementationCredit } from "./booking-releases.js";

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
    amountCents: Number(record.amountCents ?? record.reservationAmount ?? 0),
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
      record.depositCreditAppliedInvoiceReference || null,
    releaseId: record.releaseId || "",
    offerId: record.offerId || "",
    offerVersion: Number(record.offerVersion || 0) || null,
    termsVersion: record.termsVersion || record.policyVersion || "",
    termsSha256: record.termsSha256 || "",
    stripeProductRef: record.stripeProductRef || "",
    stripePriceRef: record.stripePriceRef || "",
    paymentMethodPolicy: record.paymentMethodPolicy || "",
    stripePaymentMethodConfigurationRef:
      record.stripePaymentMethodConfigurationRef || "",
    stripeCustomerCopyJson: record.stripeCustomerCopyJson || "",
    implementationCreditEnabled:
      record.implementationCreditEnabled === undefined || record.implementationCreditEnabled === null
        ? null
        : toBoolean(record.implementationCreditEnabled),
    deliveryCalendarId: record.deliveryCalendarId || "",
    deliverableId: record.deliverableId || "",
    deliverableStatus: record.deliverableStatus || "",
    deliverableDueAt: record.deliverableDueAt || null,
    deliverableDeliveredAt: record.deliverableDeliveredAt || null
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
      bookingContracts: new Map(),
      bookingDeliverables: new Map(),
      checkoutIntents: new Map(),
      integrationOutbox: new Map(),
      bookingContractEvents: [],
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
  for (const key of ["bookingContracts", "bookingDeliverables", "checkoutIntents", "integrationOutbox"]) {
    if (!globalThis.__aissistedBookingStore[key]) {
      globalThis.__aissistedBookingStore[key] = new Map();
    }
  }
  if (!globalThis.__aissistedBookingStore.bookingContractEvents) {
    globalThis.__aissistedBookingStore.bookingContractEvents = [];
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
    const contract = state.bookingContracts.get(booking.id) || null;
    const deliverable = state.bookingDeliverables.get(booking.id) || null;

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
        deposit?.depositCreditAppliedInvoiceReference || null,
      ...(contract || {}),
      deliverableId: deliverable?.id || "",
      deliverableStatus: deliverable?.status || "",
      deliverableDueAt: deliverable?.dueAt || null,
      deliverableDeliveredAt: deliverable?.deliveredAt || null
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

    async updateContactInquiryDeliveryStatus(id, deliveryStatus, updatedAt = nowIso()) {
      const inquiry = state.contactInquiries.get(id);
      if (!inquiry) return null;
      inquiry.deliveryStatus = deliveryStatus;
      inquiry.updatedAt = updatedAt;
      return normalizeContactInquiry(inquiry);
    },

    async updateContactInquiryStatus(id, status, updatedAt = nowIso()) {
      const inquiry = state.contactInquiries.get(id);
      if (!inquiry) return null;
      inquiry.status = status;
      inquiry.updatedAt = updatedAt;
      return normalizeContactInquiry(inquiry);
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

      if (input.contractInput) {
        const contract = createBookingContractSnapshot({
          bookingId: booking.id,
          ...input.contractInput
        });
        state.bookingContracts.set(booking.id, contract);
        state.checkoutIntents.set(booking.id, {
          id: createId("checkout_intent"),
          bookingId: booking.id,
          stripeIdempotencyKey: input.stripeCheckoutIdempotencyKey,
          releaseId: contract.releaseId,
          offerId: contract.offerId,
          offerVersion: contract.offerVersion,
          termsVersion: contract.termsVersion,
          termsSha256: contract.termsSha256,
          state: "prepared",
          stripeSessionRef: "",
          createdAt: input.createdAt,
          updatedAt: input.createdAt
        });
      }

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
      const checkoutIntent = state.checkoutIntents.get(booking.id);
      if (checkoutIntent) {
        checkoutIntent.state = "attached";
        checkoutIntent.stripeSessionRef = input.sessionId;
        checkoutIntent.updatedAt = booking.updatedAt;
      }

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

    async getBookingContract(bookingId) {
      return state.bookingContracts.get(bookingId) || null;
    },

    async getCheckoutIntent(bookingId) {
      return state.checkoutIntents.get(bookingId) || null;
    },

    async markBookingManualReview(input) {
      const booking = state.bookings.get(input.bookingId);
      if (!booking) return null;
      const timestamp = input.at || nowIso();
      booking.bookingStatus = "manual_review";
      booking.paymentStatus = input.paymentStatus || "paid_manual_review";
      booking.updatedAt = timestamp;
      booking.temporaryHoldExpiresAt = null;
      return hydrate(booking);
    },

    async getBookingDeliverable(bookingId) {
      return state.bookingDeliverables.get(bookingId) || null;
    },

    async updateBookingDeliverable(input) {
      const deliverable = state.bookingDeliverables.get(input.bookingId);
      if (!deliverable || !input.expectedStatuses.includes(deliverable.status)) return null;
      Object.assign(deliverable, input.patch, { updatedAt: input.at || nowIso() });
      return { ...deliverable };
    },

    async appendBookingContractEvent(input) {
      const existing = state.bookingContractEvents.find(
        (event) => event.idempotencyKey === input.idempotencyKey
      );
      if (existing) return { ...existing };
      const event = { id: createId("contract_event"), ...input, createdAt: input.createdAt || nowIso() };
      state.bookingContractEvents.push(event);
      return { ...event };
    },

    async listBookingContractEvents(bookingId) {
      return state.bookingContractEvents
        .filter((event) => event.bookingId === bookingId)
        .map((event) => ({ ...event }));
    },

    async listBookingOutbox(bookingId = "") {
      return Array.from(state.integrationOutbox.values())
        .filter((item) => !bookingId || item.bookingId === bookingId)
        .filter((item) => ["pending", "failed"].includes(item.state))
        .map((item) => ({ ...item }));
    },

    async claimBookingOutbox(id, at = nowIso()) {
      const item = Array.from(state.integrationOutbox.values()).find((candidate) => candidate.id === id);
      if (!item || !["pending", "failed"].includes(item.state)) return null;
      item.state = "processing";
      item.attempts += 1;
      item.updatedAt = at;
      return { ...item };
    },

    async finishBookingOutbox(id, input) {
      const item = Array.from(state.integrationOutbox.values()).find((candidate) => candidate.id === id);
      if (!item || item.state !== "processing") return null;
      item.state = input.state;
      item.lastSafeErrorCode = input.lastSafeErrorCode || null;
      item.sentAt = input.state === "sent" ? input.at : null;
      item.updatedAt = input.at;
      return { ...item };
    },

    async listFulfillmentWatchItems(input) {
      const nowMs = new Date(input.nowIso).getTime();
      const awaitingCutoff = nowMs - input.awaitingGraceMinutes * 60 * 1000;
      const deadlineHorizon = nowMs + input.deadlineLeadMinutes * 60 * 1000;
      return Array.from(state.bookingDeliverables.values())
        .filter((item) =>
          (item.status === "awaiting_session" && new Date(item.expectedSessionEndAt).getTime() <= awaitingCutoff) ||
          (item.status === "pending" && item.dueAt && new Date(item.dueAt).getTime() <= deadlineHorizon)
        )
        .map((item) => ({ ...item }));
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

      const contract = state.bookingContracts.get(booking.id) || null;
      if (!contract || shouldCreateImplementationCredit(contract)) {
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
      } else if (!state.bookingDeliverables.has(booking.id)) {
        state.bookingDeliverables.set(booking.id, {
          id: createId("deliverable"),
          bookingId: booking.id,
          deliverableType: "workflow_map_first_build_plan",
          status: "awaiting_session",
          expectedSessionEndAt: booking.selectedTimeWindowEnd,
          sessionCompletedAt: null,
          dueAt: null,
          deliveredAt: null,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        const validationKey = `${booking.id}:contract_validated:${input.sessionId}`;
        if (!state.bookingContractEvents.some((event) => event.idempotencyKey === validationKey)) {
          state.bookingContractEvents.push({
            id: createId("contract_event"),
            bookingId: booking.id,
            eventType: "contract_validated",
            priorState: "hold",
            newState: "confirmed",
            actorRef: "stripe_webhook",
            eventAt: timestamp,
            idempotencyKey: validationKey,
            safeMetadataJson: JSON.stringify({
              releaseId: contract.releaseId,
              termsSha256: contract.termsSha256
            }),
            createdAt: timestamp
          });
        }
        for (const effectType of ["calendar", "customer_notification", "internal_notification"]) {
          const dedupeKey = `${booking.id}:payment_confirmed:${effectType}`;
          state.integrationOutbox.set(dedupeKey, {
            id: createId("outbox"),
            bookingId: booking.id,
            eventType: "payment_confirmed",
            effectType,
            dedupeKey,
            state: "pending",
            attempts: 0,
            createdAt: timestamp,
            updatedAt: timestamp
          });
        }
      }

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
    },

    async deleteExpiredMeasurementEvents(at = nowIso()) {
      const kept = state.events.filter((event) => {
        if (event.eventType !== "paid_plan_start") return true;
        try {
          const deleteAfter = JSON.parse(event.payloadJson || "{}").retentionDeleteAfter;
          return !deleteAfter || deleteAfter > at;
        } catch (_error) {
          return true;
        }
      });
      const removed = state.events.length - kept.length;
      state.events.splice(0, state.events.length, ...kept);
      return removed;
    },

    async getLatestEventByType(eventType) {
      return [...state.events]
        .filter((event) => event.eventType === eventType)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
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
    d.deposit_credit_applied_invoice_reference AS depositCreditAppliedInvoiceReference,
    c.release_id AS releaseId,
    c.offer_id AS offerId,
    c.offer_version AS offerVersion,
    c.terms_version AS termsVersion,
    c.terms_sha256 AS termsSha256,
    c.stripe_product_ref AS stripeProductRef,
    c.stripe_price_ref AS stripePriceRef,
    c.payment_method_policy AS paymentMethodPolicy,
    c.stripe_payment_method_configuration_ref AS stripePaymentMethodConfigurationRef,
    c.stripe_customer_copy_json AS stripeCustomerCopyJson,
    c.implementation_credit_enabled AS implementationCreditEnabled,
    c.delivery_calendar_id AS deliveryCalendarId,
    v.id AS deliverableId,
    v.status AS deliverableStatus,
    v.due_at AS deliverableDueAt,
    v.delivered_at AS deliverableDeliveredAt
  FROM bookings b
  LEFT JOIN prospects p ON p.id = b.prospect_id
  LEFT JOIN deposit_credits d ON d.booking_id = b.id
  LEFT JOIN booking_contracts c ON c.booking_id = b.id
  LEFT JOIN booking_deliverables v ON v.booking_id = b.id
`;

function createD1Store(db) {
  async function fetchBooking(whereClause, value) {
    const record = await db
      .prepare(`${BOOKING_SELECT} WHERE ${whereClause} LIMIT 1`)
      .bind(value)
      .first();
    return normalizeBooking(record);
  }

  async function fetchBookingContract(bookingId) {
    return db
      .prepare(
        `SELECT
          booking_id AS bookingId,
          release_id AS releaseId,
          offer_id AS offerId,
          offer_version AS offerVersion,
          terms_version AS termsVersion,
          terms_sha256 AS termsSha256,
          terms_snapshot_json AS termsSnapshotJson,
          amount_cents AS amountCents,
          currency,
          stripe_product_ref AS stripeProductRef,
          stripe_price_ref AS stripePriceRef,
          payment_method_policy AS paymentMethodPolicy,
          stripe_payment_method_configuration_ref AS stripePaymentMethodConfigurationRef,
          stripe_customer_copy_json AS stripeCustomerCopyJson,
          implementation_credit_enabled AS implementationCreditEnabled,
          implementation_credit_terms_json AS implementationCreditTermsJson,
          delivery_calendar_id AS deliveryCalendarId,
          accepted_at AS acceptedAt,
          created_at AS createdAt
        FROM booking_contracts WHERE booking_id = ?1 LIMIT 1`
      )
      .bind(bookingId)
      .first();
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

    async updateContactInquiryDeliveryStatus(id, deliveryStatus, updatedAt = nowIso()) {
      await db
        .prepare(
          `
            UPDATE contact_inquiries
            SET delivery_status = ?2,
                updated_at = ?3
            WHERE id = ?1
          `
        )
        .bind(id, deliveryStatus, updatedAt)
        .run();
      return this.getContactInquiryById(id);
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

    async updateContactInquiryStatus(id, status, updatedAt = nowIso()) {
      await db
        .prepare("UPDATE contact_inquiries SET status = ?1, updated_at = ?2 WHERE id = ?3")
        .bind(status, updatedAt, id)
        .run();
      const record = await db
        .prepare(
          `SELECT id, status, name, email, email_normalized, phone, company,
             audience, audience_normalized, message, message_hash,
             duplicate_fingerprint, source_page, consent_to_submit, consent_at,
             delivery_status, idempotency_record_id, created_at, updated_at
           FROM contact_inquiries WHERE id = ?1 LIMIT 1`
        )
        .bind(id)
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
      const bookingInsert = db
        .prepare(
          `
            INSERT INTO bookings (
              id, prospect_id, slot_id, selected_time_window_start,
              selected_time_window_end, selected_time_zone, booking_status,
              payment_status, reservation_amount, currency,
              stripe_checkout_session_id, stripe_payment_reference,
              confirmed_at, canceled_at, temporary_hold_expires_at,
              checkout_started_at, created_at, updated_at, policy_version,
              policy_accepted_at, checkout_idempotency_record_id,
              checkout_audit_id, intake_summary
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
        );

      try {
        if (!input.contractInput) {
          await bookingInsert.run();
        } else {
          const contract = createBookingContractSnapshot({
            bookingId,
            ...input.contractInput
          });
          if (!input.stripeCheckoutIdempotencyKey) {
            throw new Error("A stable Stripe idempotency key is required for a versioned booking.");
          }
          await db.batch([
            bookingInsert,
            db.prepare(
              `INSERT INTO booking_contracts (
                booking_id, release_id, offer_id, offer_version, terms_version,
                terms_sha256, terms_snapshot_json, amount_cents, currency,
                stripe_product_ref, stripe_price_ref,
                payment_method_policy, stripe_payment_method_configuration_ref,
                stripe_customer_copy_json,
                implementation_credit_enabled, implementation_credit_terms_json,
                delivery_calendar_id, accepted_at, created_at
              ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19)`
            ).bind(
              contract.bookingId,
              contract.releaseId,
              contract.offerId,
              contract.offerVersion,
              contract.termsVersion,
              contract.termsSha256,
              contract.termsSnapshotJson,
              contract.amountCents,
              contract.currency,
              contract.stripeProductRef,
              contract.stripePriceRef,
              contract.paymentMethodPolicy,
              contract.stripePaymentMethodConfigurationRef || null,
              contract.stripeCustomerCopyJson,
              contract.implementationCreditEnabled ? 1 : 0,
              contract.implementationCreditTermsJson,
              contract.deliveryCalendarId,
              contract.acceptedAt,
              contract.createdAt
            ),
            db.prepare(
              `INSERT INTO booking_contract_events (
                id, booking_id, event_type, prior_state, new_state,
                actor_ref, event_at, idempotency_key, safe_metadata_json, created_at
              ) VALUES (?1,?2,'contract_created',NULL,'accepted','website',?3,?4,?5,?3)`
            ).bind(
              createId("contract_event"),
              bookingId,
              input.createdAt,
              `${bookingId}:contract_created`,
              JSON.stringify({ releaseId: contract.releaseId, termsSha256: contract.termsSha256 })
            ),
            db.prepare(
              `INSERT INTO checkout_intents (
                id, booking_id, stripe_idempotency_key, release_id, offer_id,
                offer_version, terms_version, terms_sha256, state,
                stripe_session_ref, created_at, updated_at
              ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'prepared',NULL,?9,?9)`
            ).bind(
              createId("checkout_intent"),
              bookingId,
              input.stripeCheckoutIdempotencyKey,
              contract.releaseId,
              contract.offerId,
              contract.offerVersion,
              contract.termsVersion,
              contract.termsSha256,
              input.createdAt
            )
          ]);
        }
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
      await db.batch([
        db.prepare(
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
        ),
        db.prepare(
          `UPDATE checkout_intents
           SET state = 'attached', stripe_session_ref = ?1, updated_at = ?2
           WHERE booking_id = ?3 AND state IN ('prepared','session_created')`
        ).bind(input.sessionId, timestamp, bookingId)
      ]);

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

    async getBookingContract(bookingId) {
      const record = await fetchBookingContract(bookingId);
      if (!record) return null;
      return {
        ...record,
        offerVersion: Number(record.offerVersion),
        amountCents: Number(record.amountCents),
        implementationCreditEnabled: toBoolean(record.implementationCreditEnabled)
      };
    },

    async getCheckoutIntent(bookingId) {
      return db
        .prepare(
          `SELECT id, booking_id AS bookingId,
             stripe_idempotency_key AS stripeIdempotencyKey,
             release_id AS releaseId, offer_id AS offerId,
             offer_version AS offerVersion, terms_version AS termsVersion,
             terms_sha256 AS termsSha256, state,
             stripe_session_ref AS stripeSessionRef,
             last_safe_error_code AS lastSafeErrorCode,
             created_at AS createdAt, updated_at AS updatedAt
           FROM checkout_intents WHERE booking_id = ?1 LIMIT 1`
        )
        .bind(bookingId)
        .first();
    },

    async markBookingManualReview(input) {
      return markBookingForManualReview({
        bookingId: input.bookingId,
        sessionId: input.sessionId || null,
        paymentReference: input.paymentReference || null,
        stripeCustomerId: input.stripeCustomerId || null,
        at: input.at || nowIso()
      });
    },

    async getBookingDeliverable(bookingId) {
      return db
        .prepare(
          `SELECT id, booking_id AS bookingId, deliverable_type AS deliverableType,
             status, expected_session_end_at AS expectedSessionEndAt,
             session_completed_at AS sessionCompletedAt, due_at AS dueAt,
             delivered_at AS deliveredAt, artifact_ref AS artifactRef,
             artifact_sha256 AS artifactSha256, late_detected_at AS lateDetectedAt,
             remedy_status AS remedyStatus, refund_reference AS refundReference,
             created_at AS createdAt, updated_at AS updatedAt
           FROM booking_deliverables WHERE booking_id = ?1 LIMIT 1`
        )
        .bind(bookingId)
        .first();
    },

    async updateBookingDeliverable(input) {
      const allowed = new Set([
        "awaiting_session", "pending", "delivered", "late",
        "refund_requested", "refunded", "canceled"
      ]);
      if (!Array.isArray(input.expectedStatuses) || !input.expectedStatuses.length ||
          !input.expectedStatuses.every((status) => allowed.has(status)) ||
          !allowed.has(input.patch.status)) {
        throw new Error("Invalid deliverable transition state.");
      }
      const placeholders = input.expectedStatuses.map((_, index) => `?${index + 12}`).join(",");
      const result = await db
        .prepare(
          `UPDATE booking_deliverables SET
             status = ?1,
             expected_session_end_at = COALESCE(?2, expected_session_end_at),
             session_completed_at = COALESCE(?3, session_completed_at),
             due_at = COALESCE(?4, due_at),
             delivered_at = COALESCE(?5, delivered_at),
             artifact_ref = COALESCE(?6, artifact_ref),
             artifact_sha256 = COALESCE(?7, artifact_sha256),
             late_detected_at = COALESCE(?8, late_detected_at),
             remedy_status = COALESCE(?9, remedy_status),
             refund_reference = COALESCE(?10, refund_reference),
             updated_at = ?11
           WHERE booking_id = ?${11 + input.expectedStatuses.length + 1}
             AND status IN (${placeholders})`
        )
        .bind(
          input.patch.status,
          input.patch.expectedSessionEndAt || null,
          input.patch.sessionCompletedAt || null,
          input.patch.dueAt || null,
          input.patch.deliveredAt || null,
          input.patch.artifactRef || null,
          input.patch.artifactSha256 || null,
          input.patch.lateDetectedAt || null,
          input.patch.remedyStatus || null,
          input.patch.refundReference || null,
          input.at || nowIso(),
          ...input.expectedStatuses,
          input.bookingId
        )
        .run();
      return result.meta?.changes ? this.getBookingDeliverable(input.bookingId) : null;
    },

    async appendBookingContractEvent(input) {
      await db
        .prepare(
          `INSERT INTO booking_contract_events (
             id, booking_id, event_type, prior_state, new_state, actor_ref,
             event_at, idempotency_key, round_number, safe_metadata_json, created_at
           ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)
           ON CONFLICT(idempotency_key) DO NOTHING`
        )
        .bind(
          createId("contract_event"), input.bookingId, input.eventType,
          input.priorState || null, input.newState || null, input.actorRef,
          input.eventAt, input.idempotencyKey, input.roundNumber || null,
          input.safeMetadataJson || null, input.createdAt || input.eventAt
        )
        .run();
      const record = await db
        .prepare(
          `SELECT id, booking_id AS bookingId, event_type AS eventType,
             prior_state AS priorState, new_state AS newState,
             actor_ref AS actorRef, event_at AS eventAt,
             idempotency_key AS idempotencyKey, round_number AS roundNumber,
             safe_metadata_json AS safeMetadataJson, created_at AS createdAt
           FROM booking_contract_events WHERE idempotency_key = ?1 LIMIT 1`
        )
        .bind(input.idempotencyKey)
        .first();
      return record;
    },

    async listBookingContractEvents(bookingId) {
      const results = await db
        .prepare(
          `SELECT id, booking_id AS bookingId, event_type AS eventType,
             prior_state AS priorState, new_state AS newState,
             actor_ref AS actorRef, event_at AS eventAt,
             idempotency_key AS idempotencyKey, round_number AS roundNumber,
             safe_metadata_json AS safeMetadataJson, created_at AS createdAt
           FROM booking_contract_events WHERE booking_id = ?1 ORDER BY event_at, id`
        )
        .bind(bookingId)
        .all();
      return results.results || [];
    },

    async listBookingOutbox(bookingId = "") {
      const where = bookingId
        ? "WHERE booking_id = ?1 AND state IN ('pending','failed')"
        : "WHERE state IN ('pending','failed')";
      const statement = db.prepare(
        `SELECT id, booking_id AS bookingId, event_type AS eventType,
           effect_type AS effectType, dedupe_key AS dedupeKey,
           safe_payload_json AS safePayloadJson, state, attempts,
           next_attempt_at AS nextAttemptAt, last_safe_error_code AS lastSafeErrorCode,
           created_at AS createdAt, updated_at AS updatedAt, sent_at AS sentAt
         FROM integration_outbox ${where} ORDER BY created_at, id`
      );
      const results = bookingId ? await statement.bind(bookingId).all() : await statement.all();
      return results.results || [];
    },

    async claimBookingOutbox(id, at = nowIso()) {
      const result = await db
        .prepare(
          `UPDATE integration_outbox SET state='processing', attempts=attempts+1, updated_at=?1
           WHERE id=?2 AND state IN ('pending','failed')`
        )
        .bind(at, id)
        .run();
      if (!result.meta?.changes) return null;
      return db
        .prepare(
          `SELECT id, booking_id AS bookingId, event_type AS eventType,
             effect_type AS effectType, dedupe_key AS dedupeKey, state, attempts,
             updated_at AS updatedAt FROM integration_outbox WHERE id=?1`
        )
        .bind(id)
        .first();
    },

    async finishBookingOutbox(id, input) {
      if (!["sent", "failed"].includes(input.state)) throw new Error("Invalid outbox result state.");
      await db
        .prepare(
          `UPDATE integration_outbox SET state=?1, last_safe_error_code=?2,
             sent_at=CASE WHEN ?1='sent' THEN ?3 ELSE sent_at END,
             next_attempt_at=CASE WHEN ?1='failed' THEN ?4 ELSE NULL END,
             updated_at=?3 WHERE id=?5 AND state='processing'`
        )
        .bind(
          input.state,
          input.lastSafeErrorCode || null,
          input.at,
          input.nextAttemptAt || null,
          id
        )
        .run();
      return true;
    },

    async listFulfillmentWatchItems(input) {
      const awaitingCutoff = new Date(
        new Date(input.nowIso).getTime() - input.awaitingGraceMinutes * 60 * 1000
      ).toISOString();
      const deadlineHorizon = new Date(
        new Date(input.nowIso).getTime() + input.deadlineLeadMinutes * 60 * 1000
      ).toISOString();
      const results = await db
        .prepare(
          `SELECT id, booking_id AS bookingId, deliverable_type AS deliverableType,
             status, expected_session_end_at AS expectedSessionEndAt,
             session_completed_at AS sessionCompletedAt, due_at AS dueAt,
             delivered_at AS deliveredAt, late_detected_at AS lateDetectedAt,
             remedy_status AS remedyStatus, updated_at AS updatedAt
           FROM booking_deliverables
           WHERE (status='awaiting_session' AND expected_session_end_at <= ?1)
              OR (status='pending' AND due_at IS NOT NULL AND due_at <= ?2)
           ORDER BY COALESCE(due_at, expected_session_end_at), id`
        )
        .bind(awaitingCutoff, deadlineHorizon)
        .all();
      return results.results || [];
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

      const contract = await fetchBookingContract(input.bookingId);
      const confirmationStatements = [
        db.prepare(
          `UPDATE bookings
           SET booking_status = 'confirmed', payment_status = 'paid',
               stripe_checkout_session_id = COALESCE(?1, stripe_checkout_session_id),
               stripe_payment_reference = COALESCE(?2, stripe_payment_reference),
               confirmed_at = COALESCE(confirmed_at, ?3), canceled_at = NULL,
               temporary_hold_expires_at = NULL, updated_at = ?3
           WHERE id = ?4 AND booking_status = 'hold'
             AND temporary_hold_expires_at IS NOT NULL
             AND temporary_hold_expires_at > ?3`
        ).bind(
          input.sessionId || null,
          input.paymentReference || null,
          timestamp,
          input.bookingId
        )
      ];

      if (!contract || toBoolean(contract.implementationCreditEnabled)) {
        confirmationStatements.push(
          db.prepare(
            `INSERT INTO deposit_credits (
              id, booking_id, prospect_id, deposit_credit_available,
              deposit_credit_amount, deposit_credit_applied,
              deposit_credit_applied_at, deposit_credit_applied_invoice_reference,
              created_at, updated_at
            ) SELECT ?1,b.id,b.prospect_id,1,b.reservation_amount,0,NULL,NULL,?3,?3
              FROM bookings b
              WHERE b.id = ?2 AND b.booking_status = 'confirmed' AND b.confirmed_at = ?3
            ON CONFLICT(booking_id) DO UPDATE SET
              deposit_credit_available = 1,
              deposit_credit_amount = excluded.deposit_credit_amount,
              updated_at = excluded.updated_at`
          ).bind(
            createId("credit"),
            currentBooking.id,
            timestamp
          )
        );
      } else {
        confirmationStatements.push(
          db.prepare(
            `INSERT INTO booking_deliverables (
              id, booking_id, deliverable_type, status,
              expected_session_end_at, remedy_status, created_at, updated_at
            ) SELECT ?1,b.id,'workflow_map_first_build_plan','awaiting_session',?3,'none',?4,?4
              FROM bookings b
              WHERE b.id = ?2 AND b.booking_status = 'confirmed' AND b.confirmed_at = ?4
            ON CONFLICT(booking_id, deliverable_type) DO NOTHING`
          ).bind(
            createId("deliverable"),
            currentBooking.id,
            currentBooking.selectedTimeWindowEnd,
            timestamp
          ),
          db.prepare(
            `INSERT INTO booking_contract_events (
              id, booking_id, event_type, prior_state, new_state,
              actor_ref, event_at, idempotency_key, safe_metadata_json, created_at
            ) SELECT ?1,b.id,'contract_validated','hold','confirmed','stripe_webhook',?3,?4,?5,?3
              FROM bookings b
              WHERE b.id = ?2 AND b.booking_status = 'confirmed' AND b.confirmed_at = ?3
            ON CONFLICT(idempotency_key) DO NOTHING`
          ).bind(
            createId("contract_event"),
            currentBooking.id,
            timestamp,
            `${currentBooking.id}:contract_validated:${input.sessionId}`,
            JSON.stringify({ releaseId: contract.releaseId, termsSha256: contract.termsSha256 })
          )
        );
        for (const effectType of ["calendar", "customer_notification", "internal_notification"]) {
          confirmationStatements.push(
            db.prepare(
              `INSERT INTO integration_outbox (
                id, booking_id, event_type, effect_type, dedupe_key,
                safe_payload_json, state, attempts, next_attempt_at,
                created_at, updated_at
              ) SELECT ?1,b.id,'payment_confirmed',?3,?4,?5,'pending',0,?6,?6,?6
                FROM bookings b
                WHERE b.id = ?2 AND b.booking_status = 'confirmed' AND b.confirmed_at = ?6
              ON CONFLICT(dedupe_key) DO NOTHING`
            ).bind(
              createId("outbox"),
              currentBooking.id,
              effectType,
              `${currentBooking.id}:payment_confirmed:${effectType}`,
              JSON.stringify({ bookingId: currentBooking.id, releaseId: contract.releaseId }),
              timestamp
            )
          );
        }
      }

      try {
        const results = await db.batch(confirmationStatements);
        if (!results[0]?.meta?.changes) {
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
    },

    async deleteExpiredMeasurementEvents(at = nowIso()) {
      const result = await db
        .prepare(
          `DELETE FROM booking_events
           WHERE event_type='paid_plan_start'
             AND json_extract(payload_json, '$.retentionDeleteAfter') IS NOT NULL
             AND json_extract(payload_json, '$.retentionDeleteAfter') <= ?1`
        )
        .bind(at)
        .run();
      return Number(result.meta?.changes || 0);
    },

    async getLatestEventByType(eventType) {
      return db
        .prepare(
          `SELECT id, booking_id AS bookingId, event_type AS eventType,
             payload_json AS payloadJson, created_at AS createdAt
           FROM booking_events WHERE event_type=?1 ORDER BY created_at DESC LIMIT 1`
        )
        .bind(eventType)
        .first();
    }
  };
}

export function getBookingStore(env) {
  return env.BOOKING_DB ? createD1Store(env.BOOKING_DB) : createMemoryStore();
}
