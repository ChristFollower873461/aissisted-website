import { applyFulfillmentAction } from "../_lib/booking-fulfillment.js";
import { drainBookingOutbox } from "../_lib/booking-outbox.js";
import { getBookingConfig } from "../_lib/config.js";
import { forbidden, json, methodNotAllowed, unavailable } from "../_lib/http.js";
import { sendManualReviewNotification } from "../_lib/notifications.js";
import { getBookingStore } from "../_lib/storage.js";

function constantTimeEqual(first, second) {
  const a = String(first || "");
  const b = String(second || "");
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function onRequest(context) {
  if (context.request.method !== "POST") return methodNotAllowed(["POST"]);
  const secret = String(context.env.BOOKING_MONITOR_TOKEN || context.env.BOOKING_OWNER_ACTION_TOKEN || "");
  if (!secret) return unavailable("Booking monitoring is not configured.");
  const provided = String(context.request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!constantTimeEqual(provided, secret)) return forbidden("Monitor authorization is required.");

  const now = new Date().toISOString();
  const store = getBookingStore(context.env);
  const config = getBookingConfig(context.env, new URL(context.request.url).origin);
  const previous = await store.getLatestEventByType("booking.fulfillment_monitor.completed");
  const maxGapMinutes = positiveInteger(context.env.BOOKING_MONITOR_MAX_GAP_MINUTES, 20);
  const previousRunStale = Boolean(
    previous?.createdAt && new Date(now).getTime() - new Date(previous.createdAt).getTime() > maxGapMinutes * 60 * 1000
  );
  const watchItems = await store.listFulfillmentWatchItems({
    nowIso: now,
    awaitingGraceMinutes: 30,
    deadlineLeadMinutes: 120
  });
  const summary = {
    awaitingSessionAlerts: 0,
    deadlineWarnings: 0,
    lateTransitions: 0,
    outboxBookingsProcessed: 0,
    previousRunStale
  };

  for (const item of watchItems) {
    const booking = await store.getBookingById(item.bookingId);
    const events = await store.listBookingContractEvents(item.bookingId);
    if (item.status === "awaiting_session") {
      const key = `${item.bookingId}:session_reconciliation_overdue:${item.expectedSessionEndAt}`;
      if (!events.some((event) => event.idempotencyKey === key)) {
        await store.appendBookingContractEvent({
          bookingId: item.bookingId,
          eventType: "session_reconciliation_overdue",
          priorState: "awaiting_session",
          newState: "awaiting_session",
          actorRef: "fulfillment_monitor",
          eventAt: now,
          idempotencyKey: key,
          safeMetadataJson: JSON.stringify({ expectedSessionEndAt: item.expectedSessionEndAt }),
          createdAt: now
        });
        await sendManualReviewNotification({
          config,
          booking,
          reason: "Session completion needs reconciliation: mark completed, rescheduled, no-show, or canceled.",
          eventId: key
        });
        summary.awaitingSessionAlerts += 1;
      }
      continue;
    }

    if (item.status === "pending" && new Date(now) > new Date(item.dueAt)) {
      const result = await applyFulfillmentAction({
        store,
        bookingId: item.bookingId,
        action: "deliverable_late",
        actorRef: "fulfillment_monitor",
        idempotencyKey: `${item.bookingId}:deliverable_late:${item.dueAt}`,
        at: now
      });
      if (!result.replayed) {
        await sendManualReviewNotification({
          config,
          booking,
          reason: "The Workflow Map delivery deadline has passed; record the customer's wait-or-refund choice.",
          eventId: result.event.id
        });
        summary.lateTransitions += 1;
      }
    } else if (item.status === "pending") {
      const key = `${item.bookingId}:deadline_warning:${item.dueAt}`;
      if (!events.some((event) => event.idempotencyKey === key)) {
        await store.appendBookingContractEvent({
          bookingId: item.bookingId,
          eventType: "deliverable_deadline_warning",
          priorState: "pending",
          newState: "pending",
          actorRef: "fulfillment_monitor",
          eventAt: now,
          idempotencyKey: key,
          safeMetadataJson: JSON.stringify({ dueAt: item.dueAt }),
          createdAt: now
        });
        await sendManualReviewNotification({
          config,
          booking,
          reason: "The Workflow Map delivery deadline is within two hours.",
          eventId: key
        });
        summary.deadlineWarnings += 1;
      }
    }
  }

  const outbox = await store.listBookingOutbox();
  const bookingIds = [...new Set(outbox.map((item) => item.bookingId))];
  for (const bookingId of bookingIds) {
    await drainBookingOutbox({ store, config, bookingId, at: now });
    summary.outboxBookingsProcessed += 1;
  }

  await store.logEvent({
    eventType: "booking.fulfillment_monitor.completed",
    payload: summary
  });
  return json({ ok: true, summary });
}
