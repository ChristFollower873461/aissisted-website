import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const source = readFileSync(new URL("../book/booking.js", import.meta.url), "utf8");
const storageKey = "aic_checkout_retry_v1";
const values = { name: "Synthetic Owner", email: "private@example.test", phone: "555-private",
  company: "Private Company", companyWebsite: "https://private.example.test", industry: "Private Industry",
  primaryGoal: "Private Goal", routeId: "workflow_improvement", notes: "Private intake notes", policyAccepted: "on", websiteLeaveBlank: "" };
const slots = [1, 2].map((n) => ({ slotId: `slot_${n}`, startsAt: `2030-01-0${n}T15:00:00.000Z`,
  endsAt: `2030-01-0${n}T16:00:00.000Z`, timezone: "America/New_York", label: `Synthetic time ${n}`,
  status: "available", availabilitySource: "booking-api" }));
const successful = () => Response.json({ ok: true, bookingId: "booking_synthetic", sessionId: "cs_test_synthetic",
  checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic" });
const unavailable = (code) => Response.json({ ok: false, code, error: "Synthetic unavailable" }, { status: code === "in_progress" ? 409 : 503 });

function deferredSignal() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForSignal(promise, description) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${description}`)), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

function node() {
  return { textContent: "", innerHTML: "", className: "", disabled: false, listeners: {}, classList: { add() {} },
    addEventListener(type, listener) { this.listeners[type] = listener; }, scrollIntoView() {} };
}
async function harness({ storage = new Map(), now = Date.now(), form = values, storageFails = false, manualTimers = false, crypto = webcrypto, checkout = unavailable } = {}) {
  const nodes = new Map(); const requests = []; const timers = new Set(); const data = { ...form }; let availabilityCalls = 0; let sequence = 0;
  const requestStarted = deferredSignal();
  const buttons = slots.map((s) => ({ ...node(), getAttribute: () => s.slotId }));
  const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); } };
  document.getElementById("availability-root").querySelectorAll = () => buttons;
  const location = new URL("https://aissistedconsulting.com/book/");
  const context = vm.createContext({ document, location, URL, URLSearchParams, TextEncoder, AbortController,
    setTimeout: manualTimers ? (callback) => { timers.add(callback); return callback; } : setTimeout,
    clearTimeout: manualTimers ? (callback) => timers.delete(callback) : clearTimeout, console,
    Date: class extends Date { static now() { return now; } },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`, subtle: crypto?.subtle },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null,
      setItem(key, value) { if (storageFails && key === storageKey) throw new Error("Synthetic storage blocked"); storage.set(key, String(value)); } },
    FormData: class { get(key) { return data[key] ?? ""; } },
    AicAdsTracking: { attributionSourcePage: () => "/book/?utm_source=synthetic", emit() {} },
    async fetch(url, options) {
      if (url === "/api/book/availability?days=14") {
        availabilityCalls++;
        return Response.json({ ok: true, slots, reservationAmountCents: 22500, currency: "usd", reservationAmountFormatted: "$225.00",
          policyVersion: "synthetic-terms", policySha256: "a".repeat(64), releaseId: "synthetic-release", offerId: "synthetic-offer", offerVersion: 2 });
      }
      assert.equal(url, "/api/book/create-checkout", "No actual browser or external dispatch is allowed");
      const request = { key: options.headers["idempotency-key"], body: options.body, signal: options.signal };
      requests.push(request);
      requestStarted.resolve(request);
      return checkout(request, requests.length);
    }
  });
  context.window = context;
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  return { nodes, buttons, data, requests, storage, context, location,
    get availabilityCalls() { return availabilityCalls; },
    waitForRequest() { return waitForSignal(requestStarted.promise, "checkout request start"); },
    expireRequest() { for (const callback of [...timers]) callback(); },
    select(index = 0) { buttons[index].listeners.click(); },
    submit() { return nodes.get("booking-form").listeners.submit({ preventDefault() {} }); },
    status() { return nodes.get("booking-submit-status").textContent; },
    saved() { return JSON.parse(storage.get(storageKey) || "null"); } };
}

for (const kind of ["network", "503", "in_progress", "checkout_recovery_paused", "malformed_ack"]) test(`${kind} retry uses the same key and exact request without clearing the selected time`, async () => {
  const h = await harness({ checkout: (_request, attempt) => {
    if (attempt > 1) return successful();
    if (kind === "network") throw new Error("Synthetic response lost");
    if (kind === "malformed_ack") return new Response('{"ok":', { status: 200 });
    return unavailable(["in_progress", "checkout_recovery_paused"].includes(kind) ? kind : "checkout_recovery_pending");
  } });
  h.select(); await h.submit();
  assert.equal(h.requests.length, 1); assert.ok(h.saved());
  assert.equal(h.availabilityCalls, 1); assert.equal(h.nodes.get("selected-slot-label").textContent, slots[0].label);
  assert.equal(h.nodes.get("booking-submit").textContent, "Retry checkout");
  // New tracking context must not alter an already dispatched body in this page.
  h.context.AicAdsTracking.attributionSourcePage = () => "/book/?utm_source=changed";
  await h.submit();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].key, h.requests[0].key); assert.equal(h.requests[1].body, h.requests[0].body);
  assert.equal(h.saved(), null); assert.equal(h.location.href, "https://checkout.stripe.com/c/pay/cs_test_synthetic");
  assert.equal(h.nodes.get("booking-submit").disabled, true);
  await h.submit(); assert.equal(h.requests.length, 2);
});

test("a double click cannot create a second request while hashing or awaiting the response", async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const h = await harness({ checkout: () => response }); h.select();
  const submissions = [h.submit(), h.submit()];
  try {
    await h.waitForRequest();
    assert.equal(h.requests.length, 1); assert.equal(h.nodes.get("booking-submit").disabled, true);
    // The first duplicate occurs during hashing; this one occurs with a pending response.
    submissions.push(h.submit());
    await waitForSignal(submissions[2], "pending-response duplicate submission");
    assert.equal(h.requests.length, 1);
  } finally {
    release(successful());
    await waitForSignal(Promise.all(submissions), "checkout submissions to settle");
  }
  assert.equal(h.requests.length, 1);
});

test("edited contact/intake and time cannot start a second checkout while the original is uncertain", async () => {
  const h = await harness(); h.select(); await h.submit(); const saved = h.saved();
  h.data.email = "changed@example.test"; await h.submit();
  assert.equal(h.requests.length, 1); assert.match(h.status(), /Restore the original details/);
  h.select(1); assert.equal(h.nodes.get("selected-slot-label").textContent, slots[0].label);
  h.data.email = values.email; await h.submit(); assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].body, h.requests[1].body); assert.equal(h.saved().key, saved.key);
});

for (const [status, code] of [[400, "validation_failed"], [409, "slot_unavailable"]]) test(`known first-attempt ${code} permits corrected details with a new key`, async () => {
  const h = await harness({ checkout: (_r, count) => count === 1 ? Response.json({ ok: false, code, error: "Correct the details" }, { status }) : successful() });
  h.select(); await h.submit(); assert.equal(h.saved(), null); assert.equal(h.availabilityCalls, 2);
  h.data.email = "corrected@example.test"; h.select(1); await h.submit();
  assert.notEqual(h.requests[0].key, h.requests[1].key); assert.equal(JSON.parse(h.requests[1].body).contact.email, h.data.email);
});

test("a validation-shaped response after uncertainty never clears the original key", async () => {
  const h = await harness({ checkout: (_r, n) => n === 1 ? unavailable() : Response.json({ ok: false, code: "validation_failed" }, { status: 400 }) });
  h.select(); await h.submit(); const key = h.saved().key; await h.submit();
  assert.equal(h.saved().key, key); assert.equal(h.availabilityCalls, 1);
});

test("reload restores only public booking context and requires matching re-entered details", async () => {
  const first = await harness(); first.select(); await first.submit();
  const serialized = first.storage.get(storageKey);
  for (const field of ["name", "email", "phone", "company", "companyWebsite", "industry", "primaryGoal", "notes"]) assert.ok(!serialized.includes(values[field]), `${field} is not persisted`);
  assert.ok(!serialized.includes("utm_source"), "attribution URLs are not persisted");
  const second = await harness({ storage: first.storage, form: { policyAccepted: "on" }, checkout: successful });
  assert.equal(second.availabilityCalls, 0); assert.equal(second.nodes.get("selected-slot-label").textContent, slots[0].label);
  await second.submit(); assert.equal(second.requests.length, 0); assert.match(second.status(), /Restore the original details/);
  Object.assign(second.data, values); await second.submit();
  assert.equal(second.requests[0].key, first.requests[0].key); assert.equal(second.requests[0].body, first.requests[0].body);
});

test("a changed attribution URL on reload must match the original fingerprint before a retry", async () => {
  const first = await harness(); first.select(); await first.submit();
  const second = await harness({ storage: first.storage }); second.context.AicAdsTracking.attributionSourcePage = () => "/book/?utm_source=different";
  await second.submit(); assert.equal(second.requests.length, 0); assert.equal(second.saved().key, first.saved().key);
});

for (const age of [23 * 60 * 60 * 1000 + 1, -1000]) test(`reload with invalid recovery age ${age} retains the key and requires review`, async () => {
  const first = await harness(); first.select(); await first.submit(); const saved = first.saved();
  const second = await harness({ storage: first.storage, now: saved.createdAt + age });
  assert.equal(second.nodes.get("booking-submit").disabled, true); assert.match(second.status(), /needs checking/);
  await second.submit(); assert.equal(second.requests.length, 0); assert.equal(second.saved().key, saved.key); assert.equal(second.availabilityCalls, 0);
});

for (const raw of ["{", JSON.stringify({ version: 1, key: "invalid" })]) test("corrupt recovery data does not silently authorize a new checkout", async () => {
  const storage = new Map([[storageKey, raw]]); const h = await harness({ storage });
  await h.submit(); assert.equal(h.requests.length, 0); assert.equal(h.availabilityCalls, 0); assert.equal(storage.get(storageKey), raw);
});

test("storage and fingerprint must be available before the first checkout request", async () => {
  for (const options of [{ storageFails: true }, { crypto: {} }]) {
    const h = await harness(options); h.select(); await h.submit();
    assert.equal(h.requests.length, 0); assert.match(h.status(), /could not save/);
  }
});

for (const code of ["checkout_recovery_expired", "checkout_recovery_exhausted", "checkout_recovery_needs_attention", "checkout_recovery_scope_changed", "checkout_recovery_booking_changed", "checkout_recovery_unprepared"]) test(`${code} retains the original key and prevents a replacement checkout`, async () => {
  const h = await harness({ checkout: () => Response.json({ ok: false, code }, { status: 409 }) }); h.select(); await h.submit();
  assert.ok(h.saved()); assert.equal(h.nodes.get("booking-submit").disabled, true); assert.match(h.status(), /needs checking/);
  await h.submit(); assert.equal(h.requests.length, 1);
});

test("an invalid success destination remains uncertain and analytics errors cannot block a verified redirect", async () => {
  const h = await harness({ checkout: (_r, n) => n === 1 ? Response.json({ ok: true, bookingId: "booking_synthetic", sessionId: "cs_test_synthetic", checkoutUrl: "https://other.example.test/" }) : successful() });
  h.select(); await h.submit(); assert.ok(h.saved()); assert.equal(h.location.hostname, "aissistedconsulting.com");
  h.context.AicAdsTracking.emit = () => { throw new Error("Synthetic analytics failure"); };
  await h.submit(); assert.equal(h.location.hostname, "checkout.stripe.com"); assert.equal(h.saved(), null);
});

for (const phase of ["request", "response body"]) test(`the checkout deadline bounds the ${phase} and keeps the original retry`, async () => {
  const abortListenerReady = deferredSignal();
  let releasePending;
  const h = await harness({ manualTimers: true, checkout: (request) => {
    const wait = () => new Promise((_resolve, reject) => {
      const abort = () => {
        request.signal.removeEventListener("abort", abort);
        const error = new Error("Synthetic timeout"); error.name = "AbortError"; reject(error);
      };
      releasePending = abort;
      request.signal.addEventListener("abort", abort, { once: true });
      abortListenerReady.resolve();
      if (request.signal.aborted) abort();
    });
    return phase === "request" ? wait() : { ok: true, status: 200, json: wait };
  } });
  h.select(); const submitted = h.submit();
  try {
    await h.waitForRequest();
    await waitForSignal(abortListenerReady.promise, `${phase} abort listener`);
    assert.equal(h.requests.length, 1);
    h.expireRequest();
    await waitForSignal(submitted, "timed-out checkout submission");
    assert.equal(h.requests[0].signal.aborted, true); assert.ok(h.saved());
    assert.equal(h.nodes.get("booking-submit").disabled, false); assert.equal(h.nodes.get("booking-submit").textContent, "Retry checkout");
    assert.match(h.status(), /taking longer/); assert.equal(h.availabilityCalls, 1);
    assert.equal(h.data.email, values.email); assert.equal(h.data.notes, values.notes);
  } finally {
    h.expireRequest();
    releasePending?.();
    await waitForSignal(submitted, "checkout timeout cleanup");
  }
});

test("invalid saved slot timezone fails closed without discarding the original key", async () => {
  const first = await harness(); first.select(); await first.submit();
  const saved = first.saved(); saved.slot.timezone = "Synthetic/Invalid";
  first.storage.set(storageKey, JSON.stringify(saved));
  const second = await harness({ storage: first.storage });
  await second.submit(); assert.equal(second.requests.length, 0);
  assert.equal(second.nodes.get("booking-submit").disabled, true); assert.equal(second.saved().key, saved.key);
});
