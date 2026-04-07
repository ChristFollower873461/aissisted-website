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

function getMemoryState() {
  if (!globalThis.__aissistedBookingStore) {
    globalThis.__aissistedBookingStore = {
      prospects: new Map(),
      prospectsByEmail: new Map(),
      bookings: new Map(),
      bookingsBySession: new Map(),
      depositCredits: new Map(),
      events: []
    };
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

  return {
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
                intake_summary
              )
              VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6,
                'hold', 'hold_created', ?7, ?8, NULL, NULL,
                NULL, NULL, ?9, ?10, ?10, ?10, ?11, ?12, ?13
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
                updated_at = ?2
            WHERE id = ?3
          `
        )
        .bind(input.sessionId, timestamp, bookingId)
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
