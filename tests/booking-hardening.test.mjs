import test from "node:test";
import assert from "node:assert/strict";

import { getBookingConfig } from "../functions/api/_lib/config.js";
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
