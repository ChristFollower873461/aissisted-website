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

// On long open days (Thursday, Saturday) we render a handful of slots as
// `status: "booked"` so the grid looks lived-in instead of suspiciously
// empty. The pattern must look random across weeks but be deterministic
// per-week (so a page refresh doesn't flicker and two visitors see the same
// day). We hash (ISO year + ISO week + weekday) into a small LCG, then pick
// 2-4 interior slots from that day's candidate pool.
//
// Rules:
//  - Only applies to THURSDAY and SATURDAY.
//  - Never touches the first or last slot of the day (10am / 6pm) — a fully
//    empty bookend would still look empty, and real customers tend to book
//    edge slots last.
//  - Count varies 2-4 per day, driven by the same seed.
const FAKE_BOOKED_DAYS = new Set(["THURSDAY", "SATURDAY"]);

function getIsoWeek(date) {
  // ISO 8601 week number. Uses UTC for stability across server restarts;
  // the exact week boundary doesn't matter for this use case.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Sunday -> 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { isoYear: d.getUTCFullYear(), isoWeek: weekNum };
}

// Tiny string hash (djb2). Deterministic, fine for picking a few ints.
function hashSeed(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

// Linear congruential generator. Fast, stable, good enough for picking
// 3ish indices out of 9.
function makeRng(seed) {
  let state = seed || 1;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state;
  };
}

function pickFakeBookedIndices(totalSlots, seed) {
  if (totalSlots < 4) {
    return new Set();
  }
  const rng = makeRng(seed);
  // Count: 2..4, weighted toward 3.
  const countRoll = rng() % 10;
  const count = countRoll < 2 ? 2 : countRoll < 8 ? 3 : 4;
  // Candidate indices: exclude the first and last slot of the day.
  const candidates = [];
  for (let i = 1; i < totalSlots - 1; i += 1) {
    candidates.push(i);
  }
  // Fisher-Yates shuffle with the seeded RNG.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = rng() % (i + 1);
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  // Pick `count` indices, skipping any that would create a run of 3+
  // adjacent booked slots. That kind of block reads as "blocked off the
  // middle of the day" rather than "individual customers booked."
  const picked = new Set();
  for (const candidate of candidates) {
    if (picked.size >= count) {
      break;
    }
    if (picked.has(candidate - 1) && picked.has(candidate - 2)) {
      continue;
    }
    if (picked.has(candidate + 1) && picked.has(candidate + 2)) {
      continue;
    }
    if (picked.has(candidate - 1) && picked.has(candidate + 1)) {
      continue;
    }
    picked.add(candidate);
  }
  return picked;
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

    // Figure out which slot indices (if any) to render as fake-booked for
    // this specific day. Same day-of-year always yields the same pattern.
    let fakeBookedIndices = new Set();
    if (FAKE_BOOKED_DAYS.has(day.weekday) && windows.length) {
      const dateForSeed = new Date(Date.UTC(day.year, day.month - 1, day.day));
      const { isoYear, isoWeek } = getIsoWeek(dateForSeed);
      const seed = hashSeed(`${isoYear}-W${isoWeek}-${day.weekday}`);
      fakeBookedIndices = pickFakeBookedIndices(windows.length, seed);
    }

    return windows
      .map((windowConfig, windowIndex) => {
        const range = parseTimeRange(windowConfig);
        if (!range) {
          return null;
        }

        const displayAsBooked = fakeBookedIndices.has(windowIndex);

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
