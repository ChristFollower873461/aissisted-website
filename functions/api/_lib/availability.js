import { getBookingConfig, isGoogleCalendarConfigured } from "./config.js";
import {
  formatSlotLabel,
  getLocalDateSequence,
  intervalOverlaps,
  makeSlotId,
  normalizeWeekday,
  zonedTimeToUtc
} from "./time.js";
import { getGoogleCalendarBusyIntervals } from "./google-calendar.js";

// Recurring weekly slots that are always rendered as unavailable. They are
// still *visible* to the booking page so the grid looks populated; the
// availability API tags them with `status: "booked"` so the UI greys them
// out with a "Booked" label. This keeps long open days from looking empty
// without exposing any real calendar data. Times are in America/New_York.
const PERMANENTLY_BOOKED_SLOTS = {
  THURSDAY: ["12:00", "15:00", "17:00"],
  SATURDAY: ["11:00", "14:00", "16:00"]
};

function isPermanentlyBookedSlot(weekday, startHour, startMinute) {
  const booked = PERMANENTLY_BOOKED_SLOTS[weekday];
  if (!booked || !booked.length) {
    return false;
  }
  const key = `${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`;
  return booked.includes(key);
}

function parseTimeRange(windowConfig) {
  const start = String(windowConfig?.start || "").split(":").map(Number);
  const end = String(windowConfig?.end || "").split(":").map(Number);
  if (start.length !== 2 || end.length !== 2 || start.some(Number.isNaN) || end.some(Number.isNaN)) {
    return null;
  }

  return {
    startHour: start[0],
    startMinute: start[1],
    endHour: end[0],
    endMinute: end[1]
  };
}

function buildCandidateSlots(config, days) {
  const schedule = config.weeklyAvailability.reduce((accumulator, item) => {
    const day = normalizeWeekday(item.day);
    if (!day) {
      return accumulator;
    }

    accumulator.set(day, Array.isArray(item.windows) ? item.windows : []);
    return accumulator;
  }, new Map());

  return days.flatMap((day) => {
    const windows = schedule.get(day.weekday) || [];
    return windows
      .map((windowConfig) => {
        const range = parseTimeRange(windowConfig);
        if (!range) {
          return null;
        }

        const displayAsBooked = isPermanentlyBookedSlot(
          day.weekday,
          range.startHour,
          range.startMinute
        );

        const start = zonedTimeToUtc({
          year: day.year,
          month: day.month,
          day: day.day,
          hour: range.startHour,
          minute: range.startMinute,
          timeZone: config.timezone
        });
        const end = zonedTimeToUtc({
          year: day.year,
          month: day.month,
          day: day.day,
          hour: range.endHour,
          minute: range.endMinute,
          timeZone: config.timezone
        });
        const startIso = start.toISOString();
        const endIso = end.toISOString();

        return {
          slotId: makeSlotId(startIso, endIso),
          startsAt: startIso,
          endsAt: endIso,
          timezone: config.timezone,
          label: formatSlotLabel(startIso, endIso, config.timezone),
          displayAsBooked
        };
      })
      .filter(Boolean);
  });
}

function isBlocked(slot, reservations, busyIntervals) {
  return [...reservations, ...busyIntervals].some((interval) =>
    intervalOverlaps(slot.startsAt, slot.endsAt, interval.selectedTimeWindowStart || interval.startIso, interval.selectedTimeWindowEnd || interval.endIso)
  );
}

export async function listAvailableSlots({ env, origin, store, days }) {
  const config = getBookingConfig(env, origin);
  const lookaheadDays = Math.min(Math.max(days || config.lookaheadDays, 1), config.lookaheadDays);
  const daySequence = getLocalDateSequence({
    days: lookaheadDays,
    timeZone: config.timezone
  });
  const candidates = buildCandidateSlots(config, daySequence);

  if (!candidates.length) {
    return [];
  }

  const now = new Date();
  const rangeStart = candidates[0].startsAt;
  const rangeEnd = candidates[candidates.length - 1].endsAt;
  const reservations = await store.listActiveSlotReservations({
    startIso: rangeStart,
    endIso: rangeEnd,
    nowTimeIso: now.toISOString()
  });

  let busyIntervals = [];
  let availabilitySource = "business-hours";
  if (isGoogleCalendarConfigured(config)) {
    availabilitySource = "google-calendar";
    try {
      busyIntervals = await getGoogleCalendarBusyIntervals({
        config,
        startIso: rangeStart,
        endIso: rangeEnd
      });
    } catch (error) {
      availabilitySource = "business-hours-fallback";
      console.error("[booking-availability] Google Calendar lookup failed. Falling back to weekly template.", error);
    }
  }

  const minimumLeadTimeMs = config.minimumLeadHours * 60 * 60 * 1000;
  const earliestAllowedStartMs = now.getTime() + minimumLeadTimeMs;

  return candidates
    .filter((slot) => new Date(slot.startsAt).getTime() >= earliestAllowedStartMs)
    .filter((slot) => !isBlocked(slot, reservations, busyIntervals))
    .filter((slot) => !slot.displayAsBooked)
    .map(({ displayAsBooked: _dropped, ...slot }) => ({
      ...slot,
      availabilitySource
    }));
}

// Like `listAvailableSlots`, but also returns slots tagged as
// `status: "booked"` for display-only purposes. Intended for the public
// booking page UI that greys out specific slots. MCP and the checkout
// path should continue using `listAvailableSlots`.
export async function listSlotsWithStatus({ env, origin, store, days }) {
  const config = getBookingConfig(env, origin);
  const lookaheadDays = Math.min(Math.max(days || config.lookaheadDays, 1), config.lookaheadDays);
  const daySequence = getLocalDateSequence({
    days: lookaheadDays,
    timeZone: config.timezone
  });
  const candidates = buildCandidateSlots(config, daySequence);

  if (!candidates.length) {
    return [];
  }

  const now = new Date();
  const rangeStart = candidates[0].startsAt;
  const rangeEnd = candidates[candidates.length - 1].endsAt;
  const reservations = await store.listActiveSlotReservations({
    startIso: rangeStart,
    endIso: rangeEnd,
    nowTimeIso: now.toISOString()
  });

  let busyIntervals = [];
  let availabilitySource = "business-hours";
  if (isGoogleCalendarConfigured(config)) {
    availabilitySource = "google-calendar";
    try {
      busyIntervals = await getGoogleCalendarBusyIntervals({
        config,
        startIso: rangeStart,
        endIso: rangeEnd
      });
    } catch (error) {
      availabilitySource = "business-hours-fallback";
      console.error(
        "[booking-availability] Google Calendar lookup failed. Falling back to weekly template.",
        error
      );
    }
  }

  const minimumLeadTimeMs = config.minimumLeadHours * 60 * 60 * 1000;
  const earliestAllowedStartMs = now.getTime() + minimumLeadTimeMs;

  return candidates
    .filter((slot) => new Date(slot.startsAt).getTime() >= earliestAllowedStartMs)
    .map((slot) => {
      const { displayAsBooked, ...rest } = slot;
      if (displayAsBooked || isBlocked(slot, reservations, busyIntervals)) {
        return { ...rest, status: "booked", availabilitySource };
      }
      return { ...rest, status: "available", availabilitySource };
    });
}
