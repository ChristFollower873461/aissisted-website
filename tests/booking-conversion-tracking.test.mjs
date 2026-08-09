import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

function createNode() {
  return {
    textContent: "",
    className: "",
    innerHTML: ""
  };
}

function runBookingStatus() {
  const events = [];
  const storage = createStorage();
  const nodes = new Map([
    ["booking-state", createNode()],
    ["state-heading", createNode()],
    ["state-description", createNode()],
    ["state-meta", createNode()],
    ["state-pill", createNode()]
  ]);
  const response = {
    ok: true,
    booking: {
      slot: { label: "Tuesday at 10:00 AM" },
      prospect: { name: "Test Owner" },
      depositCredit: { available: true }
    },
    confirmationState: "confirmed"
  };
  const window = {
    location: new URL("https://aissistedconsulting.com/book/success/?session_id=cs_test_booking123"),
    localStorage: storage,
    AicAdsTracking: {
      emit(eventName, payload) {
        events.push({ eventName, payload });
      }
    },
    fetch: async () => Response.json(response),
    setTimeout() {}
  };
  const document = {
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };
  const context = vm.createContext({
    window,
    document,
    URL,
    URLSearchParams,
    encodeURIComponent,
    fetch: window.fetch,
    console
  });

  vm.runInContext(readFileSync("book/status.js", "utf8"), context);
  return { context, events };
}

test("confirmed booking reports one stable Google conversion across reloads", async () => {
  const run = runBookingStatus();
  await new Promise((resolve) => setTimeout(resolve, 0));
  vm.runInContext(readFileSync("book/status.js", "utf8"), run.context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(run.events.length, 1);
  assert.equal(run.events[0].eventName, "aic_booking_confirmed");
  assert.equal(run.events[0].payload.transaction_id, "cs_test_booking123");
});
