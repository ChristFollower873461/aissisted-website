const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatter(timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
}

function zonedParts(date, timezone) {
  return Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

function utcDateFromLocal({ year, month, day, hour, minute, second = 0 }, timezone) {
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = new Date(targetWallTime);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(instant, timezone);
    const actualWallTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const correction = targetWallTime - actualWallTime;
    if (correction === 0) {
      return instant;
    }
    instant = new Date(instant.getTime() + correction);
  }
  const verified = zonedParts(instant, timezone);
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute
  ) {
    throw new Error("Unable to resolve the approved local delivery cutoff.");
  }
  return instant;
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addCalendarDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function weekday(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

function parseLocalTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) {
    throw new Error("Delivery dueLocalTime must use HH:MM.");
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function validateDeliveryCalendar(calendar) {
  if (!calendar?.calendarId || !calendar.timezone || !calendar.dueLocalTime) {
    throw new Error("Delivery calendar is incomplete.");
  }
  if (!Array.isArray(calendar.observedDates) || !calendar.observedDates.length) {
    throw new Error("Delivery calendar must contain an approved observed-date list.");
  }
  if (!calendar.observedDates.every((value) => DATE_RE.test(value))) {
    throw new Error("Delivery calendar contains an invalid date.");
  }
  const years = new Set(calendar.observedDates.map((value) => Number(value.slice(0, 4))));
  return { years, observed: new Set(calendar.observedDates), ...parseLocalTime(calendar.dueLocalTime) };
}

export function calculateDeliveryDueAt({ sessionCompletedAt, sessionStatus = "completed", calendar }) {
  if (["canceled", "no_show"].includes(sessionStatus)) {
    return null;
  }
  if (sessionStatus !== "completed") {
    throw new Error("A completed session is required before calculating delivery.");
  }
  const completed = new Date(sessionCompletedAt);
  if (Number.isNaN(completed.getTime())) {
    throw new Error("sessionCompletedAt must be an ISO timestamp.");
  }
  const validated = validateDeliveryCalendar(calendar);
  const localCompleted = zonedParts(completed, calendar.timezone);
  let candidate = { year: localCompleted.year, month: localCompleted.month, day: localCompleted.day };
  let qualifyingDays = 0;

  while (qualifyingDays < 2) {
    candidate = addCalendarDays(candidate, 1);
    if (!validated.years.has(candidate.year)) {
      throw new Error(`No approved delivery calendar is available for ${candidate.year}.`);
    }
    const dayOfWeek = weekday(candidate);
    if (dayOfWeek === 0 || dayOfWeek === 6 || validated.observed.has(dateKey(candidate))) {
      continue;
    }
    qualifyingDays += 1;
  }

  return utcDateFromLocal(
    { ...candidate, hour: validated.hour, minute: validated.minute, second: 0 },
    calendar.timezone
  ).toISOString();
}
