import test from "node:test";
import assert from "node:assert/strict";

import { getBookingConfig } from "../functions/api/_lib/config.js";
import { createGoogleCalendarBookingEvent } from "../functions/api/_lib/google-calendar.js";
import { listAvailableSlots } from "../functions/api/_lib/availability.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";

function resetMemoryStore() {
  delete globalThis.__aissistedBookingStore;
}

async function createTestPrivateKeyPem() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const base64 = Buffer.from(pkcs8).toString("base64");
  const body = base64.match(/.{1,64}/g).join("\n");

  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
}

test("booking config clamps hold minutes to Stripe-safe minimum", () => {
  const config = getBookingConfig(
    { BOOKING_HOLD_MINUTES: "20" },
    "https://aissistedconsulting.com"
  );

  assert.equal(config.holdMinutes, 30);
  assert.equal(config.minimumLeadHours, 48);
});

test("availability excludes slots inside the 48-hour minimum lead time", async () => {
  resetMemoryStore();
  const originalDateNow = Date.now;
  Date.now = () => new Date("2026-04-06T12:00:00.000Z").getTime();

  try {
    const slots = await listAvailableSlots({
      env: {},
      origin: "https://aissistedconsulting.com",
      store: getBookingStore({}),
      days: 7
    });

    assert.ok(slots.length > 0);
    assert.ok(
      slots.every(
        (slot) =>
          new Date(slot.startsAt).getTime() >=
          new Date("2026-04-08T12:00:00.000Z").getTime()
      )
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test("availability falls back to weekly template when Google Calendar lookup fails", async () => {
  resetMemoryStore();
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const privateKeyPem = await createTestPrivateKeyPem();
  global.fetch = async () => {
    throw new Error("calendar unavailable");
  };
  console.error = () => {};

  try {
    const slots = await listAvailableSlots({
      env: {
        GOOGLE_CALENDAR_ID: "calendar-id",
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.com",
        GOOGLE_PRIVATE_KEY: privateKeyPem
      },
      origin: "https://aissistedconsulting.com",
      store: getBookingStore({}),
      days: 7
    });

    assert.ok(slots.length > 0);
    assert.ok(
      slots.every((slot) => slot.availabilitySource === "business-hours-fallback")
    );
  } finally {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

test("required Google Calendar availability fails closed instead of exposing fallback slots", async () => {
  resetMemoryStore();

  await assert.rejects(
    () =>
      listAvailableSlots({
        env: { BOOKING_REQUIRE_GOOGLE_CALENDAR: "true" },
        origin: "https://aissistedconsulting.com",
        store: getBookingStore({}),
        days: 7
      }),
    /Google Calendar availability is required but is not configured/
  );
});

test("confirmed paid bookings can create customer-visible Google Calendar events", async () => {
  const originalFetch = global.fetch;
  const privateKeyPem = await createTestPrivateKeyPem();
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      method: options.method || "GET",
      body: String(options.body || "")
    });

    if (String(url).includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "ya29.test-token" });
    }

    if (String(url).includes("/calendar/v3/calendars/primary/events")) {
      return Response.json({
        id: "event_test_123",
        htmlLink: "https://calendar.google.com/calendar/event?eid=test"
      });
    }

    return Response.json({ error: { message: "Unexpected request" } }, { status: 404 });
  };

  try {
    const config = getBookingConfig({
      GOOGLE_CALENDAR_ID: "primary",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.com",
      GOOGLE_PRIVATE_KEY: privateKeyPem
    }, "https://aissistedconsulting.com");
    const event = await createGoogleCalendarBookingEvent({
      config,
      booking: {
        id: "book_test_google",
        prospectName: "Pat Owner",
        prospectEmail: "pat@example.com",
        prospectPhone: "352-555-0199",
        prospectCompany: "Pat's Services",
        selectedTimeWindowStart: "2026-07-01T14:00:00.000Z",
        selectedTimeWindowEnd: "2026-07-01T15:00:00.000Z",
        selectedTimeZone: "America/New_York",
        reservationAmount: 22500,
        currency: "usd",
        intakeSummary: "Goal: Follow up with missed calls",
        stripeCheckoutSessionId: "cs_test_calendar"
      }
    });
    const calendarCall = calls.find((call) => call.url.includes("/calendar/v3/calendars/primary/events"));
    const body = JSON.parse(calendarCall.body);

    assert.equal(event.eventId, "event_test_123");
    assert.equal(calendarCall.method, "POST");
    assert.match(calendarCall.url, /sendUpdates=all/);
    assert.equal(body.start.timeZone, "America/New_York");
    assert.equal(body.end.timeZone, "America/New_York");
    assert.equal(body.attendees[0].email, "pat@example.com");
    assert.equal(body.extendedProperties.private.aissistedBookingId, "book_test_google");
  } finally {
    global.fetch = originalFetch;
  }
});

test("expired holds move paid checkouts into manual review instead of auto-confirming", async () => {
  resetMemoryStore();
  const store = getBookingStore({});
  const slots = await listAvailableSlots({
    env: {},
    origin: "https://aissistedconsulting.com",
    store,
    days: 7
  });
  const slot = slots[0];
  const createdAt = new Date().toISOString();
  const expiredAt = new Date(Date.now() - 60 * 1000).toISOString();
  const prospect = await store.upsertProspect({
    name: "Late Payer",
    email: "late-payer@example.com",
    intakeJson: "{}"
  });
  const booking = await store.createBookingHold({
    prospectId: prospect.id,
    slotId: slot.slotId,
    selectedTimeWindowStart: slot.startsAt,
    selectedTimeWindowEnd: slot.endsAt,
    selectedTimeZone: slot.timezone,
    reservationAmount: 20000,
    currency: "usd",
    temporaryHoldExpiresAt: expiredAt,
    createdAt,
    policyVersion: "2026-04-06",
    policyAcceptedAt: createdAt,
    intakeSummary: "Late checkout test"
  });

  const result = await store.confirmBookingFromCheckout({
    bookingId: booking.id,
    sessionId: "cs_test_late",
    paymentReference: "pi_test_late",
    stripeCustomerId: "cus_test_late",
    confirmedAt: new Date().toISOString()
  });

  assert.equal(result.state, "manual_review");
  assert.equal(result.booking.bookingStatus, "manual_review");
  assert.equal(result.booking.paymentStatus, "paid_manual_review");
  assert.equal(result.booking.depositCreditAvailable, false);
});

test("duplicate completed webhooks are idempotent once a booking is confirmed", async () => {
  resetMemoryStore();
  const store = getBookingStore({});
  const slots = await listAvailableSlots({
    env: {},
    origin: "https://aissistedconsulting.com",
    store,
    days: 7
  });
  const slot = slots[0];
  const createdAt = new Date().toISOString();
  const prospect = await store.upsertProspect({
    name: "Repeat Event",
    email: "repeat-event@example.com",
    intakeJson: "{}"
  });
  const booking = await store.createBookingHold({
    prospectId: prospect.id,
    slotId: slot.slotId,
    selectedTimeWindowStart: slot.startsAt,
    selectedTimeWindowEnd: slot.endsAt,
    selectedTimeZone: slot.timezone,
    reservationAmount: 20000,
    currency: "usd",
    temporaryHoldExpiresAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    createdAt,
    policyVersion: "2026-04-06",
    policyAcceptedAt: createdAt,
    intakeSummary: "Duplicate webhook test"
  });

  const first = await store.confirmBookingFromCheckout({
    bookingId: booking.id,
    sessionId: "cs_test_repeat",
    paymentReference: "pi_test_repeat",
    stripeCustomerId: "cus_test_repeat",
    confirmedAt: new Date().toISOString()
  });
  const second = await store.confirmBookingFromCheckout({
    bookingId: booking.id,
    sessionId: "cs_test_repeat",
    paymentReference: "pi_test_repeat",
    stripeCustomerId: "cus_test_repeat",
    confirmedAt: new Date().toISOString()
  });

  assert.equal(first.state, "confirmed");
  assert.equal(second.state, "already_confirmed");
  assert.equal(second.booking.bookingStatus, "confirmed");
  assert.equal(second.booking.depositCreditAvailable, true);
});
