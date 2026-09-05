import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as submitContact } from "../functions/api/contact/submit.js";
import { onRequest as monitor } from "../functions/api/book/monitor.js";
import { onRequest as fitCall } from "../functions/api/book/fit-call.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";
import { createBookingSqliteFixture } from "./fixtures/booking-sqlite.mjs";

const start = Date.parse("2026-09-04T12:00:00Z");
const contact = {
  name: "Synthetic Visitor", email: "visitor@example.test", phone: "", company: "Synthetic Co",
  audience: "small_business_workflow", message: "Synthetic workflow enquiry for a local regression.",
  sourcePage: "/contact/?utm_source=synthetic&utm_campaign=retry-proof", consentToSubmit: true
};

function envFor(h) {
  return {
    BOOKING_DB: h.db,
    AIC_CRM_INTAKE_URL: "https://crm.example.test/intake/website",
    AIC_CRM_INTAKE_TOKEN: "synthetic-crm-token",
    BOOKING_MONITOR_TOKEN: "synthetic-monitor-token"
  };
}

async function submit(env, key = "synthetic-contact-retry-0001", overrides = {}) {
  const tasks = [];
  const response = await submitContact({
    env, waitUntil: (task) => tasks.push(task),
    request: new Request("https://website.example.test/api/contact/submit", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ ...contact, ...overrides })
    })
  });
  await Promise.all(tasks);
  return { response, body: await response.json() };
}

async function runMonitor(env, token = env.BOOKING_MONITOR_TOKEN) {
  return monitor({ env, request: new Request("https://website.example.test/api/book/monitor", {
    method: "POST", headers: { authorization: `Bearer ${token}` }
  }) });
}

test("an accepted contact survives database reopening and retries CRM delivery through the monitor", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return requests.length === 1
      ? Response.json({ ok: false, error: "Synthetic unavailability" }, { status: 503 })
      : Response.json({ ok: true, submission: { id: "synthetic-crm-intake" } });
  });
  const accepted = await submit(env);
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.inquiry.deliveryStatus, "crm_relay_failed");
  h.reopen();
  t.mock.timers.setTime(start + 10 * 60_000);
  const result = await runMonitor(env);
  assert.equal(result.status, 200);
  assert.equal(requests.length, 2, "the monitor must recover the accepted but undelivered enquiry");
  assert.deepEqual(requests[1], requests[0], "retry must preserve exact original event identity and payload");
  const row = h.sqlite.prepare("SELECT delivery_status FROM contact_inquiries WHERE id = ?").get(accepted.body.inquiry.id);
  assert.equal(row.delivery_status, "crm_relay_delivered");
  await runMonitor(env);
  assert.equal(requests.length, 2, "delivered work must not be sent again");
});

test("HTML with HTTP 200 is not a CRM delivery acknowledgement", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  t.mock.method(globalThis, "fetch", async () => new Response("<html>Temporary proxy page</html>", { status: 200 }));
  const accepted = await submit(envFor(h));
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.inquiry.deliveryStatus, "crm_relay_failed");
});

test("a lost acknowledgement replays the exact event, attribution and original consent time", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  const received = new Map();
  const sent = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const payload = JSON.parse(init.body);
    sent.push(init.body);
    if (!received.has(payload.qualifiedSourceEventId)) {
      received.set(payload.qualifiedSourceEventId, { id: "original-intake", payload });
      throw new Error("Synthetic lost acknowledgement after receiver commit");
    }
    return Response.json({ ok: true, submission: { id: "original-intake", status: "reviewed" } });
  });
  const accepted = await submit(env);
  h.reopen();
  t.mock.timers.setTime(start + 10 * 60_000);
  await runMonitor(env);
  assert.equal(received.size, 1);
  assert.equal(sent.length, 2);
  assert.equal(sent[1], sent[0]);
  const original = JSON.parse(sent[0]);
  assert.equal(original.consentedAt, new Date(start).toISOString());
  assert.equal(original.utmCampaign, "retry-proof");
  assert.equal(original.inquiryType, "small_business_workflow");
  const delivery = await getBookingStore(env).getCrmDeliveryByInquiryId(accepted.body.inquiry.id);
  assert.equal(delivery.state, "delivered");
  assert.equal(delivery.submissionId, "original-intake");
  assert.equal(h.sqlite.prepare("SELECT status FROM contact_inquiries").get().status, "received", "delivery does not perform operator review or payment confirmation");
});

test("inquiry and CRM intent both roll back if the durable intent cannot be written", async (t) => {
  const h = createBookingSqliteFixture(t);
  h.sqlite.exec("CREATE TRIGGER synthetic_queue_failure BEFORE INSERT ON contact_crm_delivery BEGIN SELECT RAISE(ABORT, 'Synthetic queue write failure'); END");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; throw new Error("No send before durable commit"); });
  const result = await submit(envFor(h));
  assert.equal(result.response.status, 500);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS count FROM contact_inquiries").get().count, 0);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS count FROM contact_crm_delivery").get().count, 0);
  assert.equal(calls, 0);
  h.sqlite.exec("DROP TRIGGER synthetic_queue_failure");
  const retry = await submit({ ...envFor(h), AIC_CRM_INTAKE_TOKEN: "" }, "synthetic-contact-after-write-recovery");
  assert.equal(retry.response.status, 200);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS count FROM contact_inquiries").get().count, 1);
});

test("concurrent monitor calls claim one due delivery and authorization gates all sends", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1 ? new Response("Unavailable", { status: 503 }) : Response.json({ ok: true, submission: { id: "one-recovered-intake" } });
  });
  await submit(env);
  t.mock.timers.setTime(start + 10 * 60_000);
  assert.equal((await runMonitor(env, "wrong-token")).status, 403);
  assert.equal(calls, 1);
  const responses = await Promise.all([runMonitor(env), runMonitor(env)]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(calls, 2);
});

test("an expired attempt lease survives restart and a stale worker cannot undo delivery", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  const accepted = await submit({ ...env, AIC_CRM_INTAKE_TOKEN: "" });
  const store = getBookingStore(env);
  const item = await store.getCrmDeliveryByInquiryId(accepted.body.inquiry.id);
  t.mock.timers.setTime(start + 10 * 60_000);
  const oldClaim = await store.claimCrmDelivery(item.id, {
    at: new Date().toISOString(), leaseToken: "synthetic-dead-worker", leaseExpiresAt: new Date(Date.now() + 45_000).toISOString()
  });
  assert.ok(oldClaim);
  h.reopen();
  t.mock.timers.setTime(start + 11 * 60_000);
  t.mock.method(globalThis, "fetch", async () => Response.json({ ok: true, submission: { id: "recovered-after-death" } }));
  await runMonitor(env);
  const staleWrite = await store.finishCrmDelivery(item.id, {
    leaseToken: "synthetic-dead-worker", state: "pending", at: new Date().toISOString(),
    nextAttemptAt: new Date(Date.now() + 60_000).toISOString(), lastSafeErrorCode: "crm_transport_error", deliveryStatus: "crm_relay_failed"
  });
  assert.equal(staleWrite, false);
  assert.equal((await store.getCrmDeliveryByInquiryId(accepted.body.inquiry.id)).state, "delivered");
  assert.equal((await store.getContactInquiryById(accepted.body.inquiry.id)).deliveryStatus, "crm_relay_delivered");
});

test("a receiver Retry-After window delays retries and is not spent in a tight loop", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response("Rate limited", { status: 429, headers: { "retry-after": "600" } });
  });
  const accepted = await submit(env);
  const delivery = await getBookingStore(env).getCrmDeliveryByInquiryId(accepted.body.inquiry.id);
  assert.equal(delivery.nextAttemptAt, new Date(start + 600_000).toISOString());
  t.mock.timers.setTime(start + 9 * 60_000);
  await runMonitor(env);
  assert.equal(calls, 1);
  t.mock.timers.setTime(start + 10 * 60_000);
  await runMonitor(env);
  assert.equal(calls, 2);
});

test("permanent receiver rejection remains visible without leaking customer payloads in monitor output", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ ok: false, error: `Rejected ${contact.email}` }, { status: 422 });
  });
  const accepted = await submit(env);
  t.mock.timers.setTime(start + 24 * 60 * 60_000);
  const summary = await (await runMonitor(env)).json();
  assert.equal(calls, 1);
  assert.equal(summary.summary.crmDelivery.needsAttention, 1);
  assert.equal(summary.summary.crmDelivery.due, 0);
  const delivery = await getBookingStore(env).getCrmDeliveryByInquiryId(accepted.body.inquiry.id);
  assert.equal(delivery.lastSafeErrorCode, "crm_http_422");
  assert.equal(delivery.state, "needs_attention");
  assert.doesNotMatch(JSON.stringify(summary), /visitor@example|Synthetic Visitor|retry-proof|Rejected/);
});

test("the retry limit is finite and a crash during the last lease becomes needs_attention", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; throw new Error("Synthetic timeout"); });
  const accepted = await submit(env);
  for (let attempt = 2; attempt <= 7; attempt += 1) {
    t.mock.timers.setTime(start + attempt * 60 * 60_000);
    await runMonitor(env);
  }
  const store = getBookingStore(env);
  const item = await store.getCrmDeliveryByInquiryId(accepted.body.inquiry.id);
  assert.equal(item.attempts, 7);
  t.mock.timers.setTime(start + 8 * 60 * 60_000);
  const abandoned = await store.claimCrmDelivery(item.id, {
    at: new Date().toISOString(), leaseToken: "synthetic-last-attempt", leaseExpiresAt: new Date(Date.now() + 45_000).toISOString()
  });
  assert.equal(abandoned.attempts, 8);
  h.reopen();
  t.mock.timers.setTime(start + 9 * 60 * 60_000);
  await runMonitor(env);
  assert.equal(calls, 7, "recovering the exhausted lease must not send another request");
  const final = await store.getCrmDeliveryByInquiryId(accepted.body.inquiry.id);
  assert.equal(final.state, "needs_attention");
  assert.equal(final.lastSafeErrorCode, "crm_attempt_limit");
});

test("Fit Call retry preserves manual-review meaning even after its disposition changes", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = { ...envFor(h), FIT_CALL_REQUESTS_ENABLED: "true" };
  const calls = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return calls.length === 1 ? new Response("Unavailable", { status: 503 }) : Response.json({ ok: true, submission: { id: "fit-call-intake" } });
  });
  const response = await fitCall({ env, request: new Request("https://website.example.test/api/book/fit-call", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: contact.name, email: contact.email, routeId: "workflow_improvement", reason: "Synthetic manual review request", sourcePage: "/book/?utm_source=synthetic", consentToSubmit: true })
  }) });
  assert.equal(response.status, 200);
  const accepted = await response.json();
  assert.equal(accepted.scheduled, false);
  assert.equal(accepted.paymentRequired, false);
  await getBookingStore(env).updateContactInquiryStatus(accepted.inquiryId, "fit_call_redirected_to_paid_plan");
  h.reopen();
  t.mock.timers.setTime(start + 10 * 60_000);
  await runMonitor(env);
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(calls[1].inquiryType, "fit_call_request");
  assert.match(calls[1].message, /not a scheduled appointment/);
  assert.equal(calls[1].consentedAt, new Date(start).toISOString());
  const inquiry = await getBookingStore(env).getContactInquiryById(accepted.inquiryId);
  assert.equal(inquiry.status, "fit_call_redirected_to_paid_plan");
  assert.equal(inquiry.deliveryStatus, "crm_relay_delivered");
});

test("failed acknowledgement persistence cannot mark an inquiry delivered and retries the original event", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  h.sqlite.exec("CREATE TRIGGER synthetic_ack_failure BEFORE UPDATE ON contact_crm_delivery WHEN NEW.state = 'delivered' BEGIN SELECT RAISE(ABORT, 'Synthetic acknowledgement write failure'); END");
  const sent = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    sent.push(init.body);
    return Response.json({ ok: true, submission: { id: "one-accepted-receiver-record" } });
  });
  const accepted = await submit(env);
  assert.equal(accepted.response.status, 200);
  const store = getBookingStore(env);
  assert.notEqual((await store.getContactInquiryById(accepted.body.inquiry.id)).deliveryStatus, "crm_relay_delivered");
  assert.equal((await store.getCrmDeliveryByInquiryId(accepted.body.inquiry.id)).state, "processing");
  h.sqlite.exec("DROP TRIGGER synthetic_ack_failure");
  h.reopen();
  t.mock.timers.setTime(start + 60_000);
  await runMonitor(env);
  assert.equal(sent.length, 2);
  assert.equal(sent[1], sent[0]);
  assert.equal((await store.getContactInquiryById(accepted.body.inquiry.id)).deliveryStatus, "crm_relay_delivered");
});

test("the monitor bounds each run and configuration recovery drains the preserved payloads", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return Response.json({ ok: true, submission: { id: `synthetic-intake-${calls}` } });
  });
  for (let index = 0; index < 11; index += 1) {
    const accepted = await submit({ ...env, AIC_CRM_INTAKE_TOKEN: "" }, `synthetic-batch-${index}-key`, { email: `visitor${index}@example.test` });
    assert.equal(accepted.response.status, 200);
  }
  assert.equal(calls, 0);
  t.mock.timers.setTime(start + 10 * 60_000);
  const first = await (await runMonitor(env)).json();
  assert.equal(first.summary.crmDelivery.attemptedThisRun, 10);
  assert.equal(first.summary.crmDelivery.due, 1);
  assert.equal(calls, 10);
  const second = await (await runMonitor(env)).json();
  assert.equal(second.summary.crmDelivery.attemptedThisRun, 1);
  assert.equal(second.summary.crmDelivery.delivered, 11);
  assert.equal(calls, 11);
});
