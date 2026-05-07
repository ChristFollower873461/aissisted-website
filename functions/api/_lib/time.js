const WEEKDAY_ORDER = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY"
];

function partsToObject(parts) {
  return parts.reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }

    return accumulator;
  }, {});
}

export function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = partsToObject(formatter.formatToParts(date));

  return {
    weekday: String(parts.weekday || "").toUpperCase(),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

export function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

export function zonedTimeToUtc({ year, month, day, hour, minute, second = 0, timeZone }) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  const firstPass = utcGuess - offset;
  const recalculatedOffset = getTimeZoneOffsetMs(new Date(firstPass), timeZone);

  return new Date(utcGuess - recalculatedOffset);
}

export function getLocalDateSequence({ from = new Date(), days, timeZone }) {
  const start = getTimeZoneParts(from, timeZone);
  const base = new Date(Date.UTC(start.year, start.month - 1, start.day, 12, 0, 0));
  const sequence = [];

  for (let index = 0; index < days; index += 1) {
    const anchor = new Date(base);
    anchor.setUTCDate(base.getUTCDate() + index);
    const parts = getTimeZoneParts(anchor, timeZone);
    sequence.push({
      dateKey: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
      weekday: parts.weekday,
      year: parts.year,
      month: parts.month,
      day: parts.day
    });
  }

  return sequence;
}

export function formatSlotLabel(startIso, endIso, timeZone) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });

  return `${dayFormatter.format(start)} • ${timeFormatter.format(start)} - ${timeFormatter.format(end)}`;
}

export function formatDetailedSlot(startIso, endIso, timeZone) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  });

  return `${dayFormatter.format(start)} from ${timeFormatter.format(start)} to ${timeFormatter.format(end)} ${timeZone}`;
}

export function formatCurrency(amountCents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format((amountCents || 0) / 100);
}

export function makeSlotId(startIso, endIso) {
  return `${startIso}|${endIso}`;
}

export function parseSlotId(slotId) {
  const [startIso, endIso] = String(slotId || "").split("|");
  if (!startIso || !endIso) {
    return null;
  }

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return null;
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

export function intervalOverlaps(aStartIso, aEndIso, bStartIso, bEndIso) {
  return (
    new Date(aStartIso).getTime() < new Date(bEndIso).getTime() &&
    new Date(bStartIso).getTime() < new Date(aEndIso).getTime()
  );
}

export function addMinutes(isoLike, minutes) {
  const date = new Date(isoLike);
  date.setTime(date.getTime() + minutes * 60 * 1000);
  return date.toISOString();
}

export function normalizeWeekday(day) {
  const normalized = String(day || "").trim().toUpperCase();
  return WEEKDAY_ORDER.includes(normalized) ? normalized : null;
}

export function maskEmail(email) {
  if (!email || !email.includes("@")) {
    return "";
  }

  const [localPart, domain] = email.split("@");
  if (localPart.length <= 2) {
    return `${localPart[0] || ""}*@${domain}`;
  }

  return `${localPart[0]}${"*".repeat(Math.max(localPart.length - 2, 1))}${localPart.slice(-1)}@${domain}`;
}
