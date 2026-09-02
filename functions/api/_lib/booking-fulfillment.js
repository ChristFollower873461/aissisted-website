import { calculateDeliveryDueAt } from "./delivery-clock.js";

const SHA256_HEX = /^[a-f0-9]{64}$/;
const CORRECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const DELIVERY_CALENDARS = Object.freeze({
  aissisted_us_federal_observed_2026_v1: Object.freeze({
    calendarId: "aissisted_us_federal_observed_2026_v1",
    timezone: "America/New_York",
    dueLocalTime: "17:00",
    observedDates: Object.freeze([
      "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25",
      "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12",
      "2026-11-11", "2026-11-26", "2026-12-25"
    ])
  })
});

function requireIso(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error(`${label} must be an ISO timestamp.`);
  return date.toISOString();
}

function eventInput({ bookingId, eventType, priorState, newState, actorRef, at, idempotencyKey, safe = {}, roundNumber = null }) {
  return {
    bookingId,
    eventType,
    priorState,
    newState,
    actorRef,
    eventAt: at,
    idempotencyKey,
    roundNumber,
    safeMetadataJson: JSON.stringify(safe),
    createdAt: at
  };
}

export async function applyFulfillmentAction({ store, bookingId, action, actorRef, idempotencyKey, at, data = {} }) {
  if (!store || !bookingId || !action || !actorRef || !idempotencyKey) {
    throw new Error("Fulfillment action input is incomplete.");
  }
  const actionAt = requireIso(at || new Date().toISOString(), "Action time");
  const contract = await store.getBookingContract(bookingId);
  const deliverable = await store.getBookingDeliverable(bookingId);
  if (!contract || Number(contract.offerVersion) < 2 || !deliverable) {
    throw new Error("The booking has no v2 delivery obligation.");
  }
  const events = await store.listBookingContractEvents(bookingId);
  const replay = events.find((event) => event.idempotencyKey === idempotencyKey);
  if (replay) return { replayed: true, deliverable, event: replay };

  let patch;
  let expectedStatuses;
  let eventType;
  let safe = {};
  let roundNumber = null;

  switch (action) {
    case "session_completed": {
      const completedAt = requireIso(data.sessionCompletedAt || actionAt, "Session completion time");
      const calendar = DELIVERY_CALENDARS[contract.deliveryCalendarId];
      if (!calendar) throw new Error("The stored delivery calendar is unavailable.");
      patch = {
        status: "pending",
        sessionCompletedAt: completedAt,
        dueAt: calculateDeliveryDueAt({ sessionCompletedAt: completedAt, calendar }),
        remedyStatus: "none"
      };
      expectedStatuses = ["awaiting_session"];
      eventType = "session_completed";
      safe = { dueAt: patch.dueAt, calendarId: calendar.calendarId };
      break;
    }
    case "session_rescheduled":
      patch = {
        status: "awaiting_session",
        expectedSessionEndAt: requireIso(data.expectedSessionEndAt, "Expected session end")
      };
      expectedStatuses = ["awaiting_session"];
      eventType = "session_rescheduled";
      safe = { expectedSessionEndAt: patch.expectedSessionEndAt };
      break;
    case "session_no_show":
    case "session_canceled":
      patch = { status: "canceled", remedyStatus: "closed" };
      expectedStatuses = ["awaiting_session"];
      eventType = action;
      break;
    case "deliverable_delivered":
      if (data.artifactSha256 && !SHA256_HEX.test(data.artifactSha256)) {
        throw new Error("Artifact SHA-256 is invalid.");
      }
      patch = {
        status: "delivered",
        deliveredAt: requireIso(data.deliveredAt || actionAt, "Delivery time"),
        artifactRef: String(data.artifactRef || "").trim() || null,
        artifactSha256: data.artifactSha256 || null,
        remedyStatus: "closed"
      };
      expectedStatuses = ["pending", "late"];
      eventType = "deliverable_delivered";
      safe = { artifactRefPresent: Boolean(patch.artifactRef), artifactHashPresent: Boolean(patch.artifactSha256) };
      break;
    case "deliverable_late":
      if (!deliverable.dueAt || new Date(actionAt) <= new Date(deliverable.dueAt)) {
        throw new Error("The approved delivery deadline has not passed.");
      }
      patch = { status: "late", lateDetectedAt: actionAt, remedyStatus: "awaiting_customer_choice" };
      expectedStatuses = ["pending"];
      eventType = "deliverable_late";
      break;
    case "customer_chose_wait":
      patch = { status: "late", remedyStatus: "revised_date_selected" };
      expectedStatuses = ["late"];
      eventType = "remedy_selected";
      safe = { choice: "wait" };
      break;
    case "customer_chose_refund":
      patch = { status: "refund_requested", remedyStatus: "refund_requested" };
      expectedStatuses = ["late"];
      eventType = "refund_requested";
      safe = { choice: "refund" };
      break;
    case "customer_canceled_with_notice_refund":
    case "aissisted_canceled_refund":
      patch = { status: "refund_requested", remedyStatus: "refund_requested" };
      expectedStatuses = ["awaiting_session"];
      eventType = "refund_requested";
      safe = {
        choice: "refund",
        reason: action === "customer_canceled_with_notice_refund"
          ? "customer_canceled_with_notice"
          : "aissisted_canceled"
      };
      break;
    case "refund_reconciled":
      patch = {
        status: "refunded",
        remedyStatus: "refunded",
        refundReference: String(data.refundReference || "").trim()
      };
      if (!patch.refundReference) throw new Error("Refund reconciliation requires a provider reference.");
      expectedStatuses = ["refund_requested"];
      eventType = "refund_reconciled";
      break;
    case "correction_requested": {
      const requestedAt = requireIso(data.requestedAt || actionAt, "Correction request time");
      const priorRound = events.find((event) => event.eventType === "correction_requested" && Number(event.roundNumber) === 1);
      if (priorRound) {
        eventType = "correction_rejected_duplicate_round";
      } else if (!deliverable.deliveredAt || new Date(requestedAt).getTime() > new Date(deliverable.deliveredAt).getTime() + CORRECTION_WINDOW_MS) {
        eventType = "correction_rejected_out_of_window";
      } else if (data.inScope !== true) {
        eventType = "correction_rejected_out_of_scope";
      } else {
        eventType = "correction_requested";
      }
      patch = { status: "delivered" };
      expectedStatuses = ["delivered"];
      roundNumber = 1;
      safe = { outcome: eventType, requestedAt };
      break;
    }
    case "correction_accepted":
    case "correction_delivered":
      patch = { status: "delivered" };
      expectedStatuses = ["delivered"];
      eventType = action;
      roundNumber = 1;
      break;
    default:
      throw new Error("Unsupported fulfillment action.");
  }

  const updated = await store.updateBookingDeliverable({
    bookingId,
    expectedStatuses,
    patch,
    at: actionAt
  });
  if (!updated) throw new Error("Fulfillment action conflicts with the current state.");
  const event = await store.appendBookingContractEvent(eventInput({
    bookingId,
    eventType,
    priorState: deliverable.status,
    newState: updated.status,
    actorRef,
    at: actionAt,
    idempotencyKey,
    safe,
    roundNumber
  }));
  return { replayed: false, deliverable: updated, event };
}
