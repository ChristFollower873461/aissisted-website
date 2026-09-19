import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { onRequest as monitor } from "../functions/api/book/monitor.js";
import { onRequest as submit } from "../functions/api/contact/submit.js";
import { onRequest as fitCall } from "../functions/api/book/fit-call.js";
import { onRequest as middleware } from "../functions/_middleware.js";
import { createBookingSqliteFixture } from "./fixtures/booking-sqlite.mjs";

const start = Date.parse("2026-09-05T12:00:00Z");
const origin = "https://synthetic-preview.example.test";
const monitorToken = "synthetic-monitor-secret";
const protectedTables = ["prospects", "bookings", "booking_contracts", "booking_deliverables",
  "booking_contract_events", "integration_outbox", "checkout_intents", "booking_checkout_commands",
  "booking_payment_state", "booking_provider_receipts", "booking_crm_delivery"];

function invoke(env, { token = monitorToken, method = "POST", query = "", body, cookie } = {}) {
  return monitor({ env, request: new Request(`${origin}/api/book/monitor${query}`, {
    method, headers: { authorization: `Bearer ${token}`, ...(cookie ? { cookie } : {}) }, body
  }) });
}

function envFor(h) {
  return { BOOKING_DB: h.db, BOOKING_MONITOR_TOKEN: monitorToken,
    BOOKING_MONITOR_SCOPE: "contacts", FIT_CALL_REQUESTS_ENABLED: "true" };
}

async function seedInquiries(env) {
  const contact = { name: "Synthetic contact", email: "scope-contact@example.test",
    message: "Synthetic contact scope regression", consentToSubmit: true,
    sourcePage: "/contact/?utm_source=synthetic&utm_campaign=scope" };
  const tasks = [];
  const accepted = await submit({ env, waitUntil: (task) => tasks.push(task),
    request: new Request(`${origin}/api/contact/submit`, { method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "synthetic-scope-contact-0001" },
      body: JSON.stringify(contact) }) });
  await Promise.all(tasks);
  assert.equal(accepted.status, 200);
  const fit = await fitCall({ env, request: new Request(`${origin}/api/book/fit-call`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Synthetic fit call", email: "scope-fit@example.test",
      reason: "Synthetic fit call scope regression", routeId: "workflow_improvement",
      sourcePage: "/book/?utm_source=synthetic", consentToSubmit: true }) }) });
  assert.equal(fit.status, 200);
}

function seedUnrelatedWork(h) {
  h.sqlite.exec(`
    INSERT INTO prospects(id,name,email,created_at,updated_at)
      VALUES('synthetic-prospect','Synthetic prior booking','prior@example.test','2026-09-01','2026-09-01');
    INSERT INTO bookings(id,prospect_id,slot_id,selected_time_window_start,selected_time_window_end,
      selected_time_zone,booking_status,payment_status,reservation_amount,currency,
      created_at,updated_at,policy_version,policy_accepted_at)
      VALUES('synthetic-booking','synthetic-prospect','synthetic-slot','2026-09-01T12:00:00Z',
      '2026-09-01T13:00:00Z','UTC','confirmed','paid',22500,'usd','2026-09-01','2026-09-01','synthetic-v1','2026-09-01');
    INSERT INTO booking_deliverables(id,booking_id,deliverable_type,status,expected_session_end_at,
      session_completed_at,due_at,created_at,updated_at)
      VALUES('synthetic-deliverable','synthetic-booking','workflow_map','pending',
      '2026-09-01T13:00:00Z','2026-09-01T13:00:00Z','2026-09-02T13:00:00Z','2026-09-01','2026-09-01');
    INSERT INTO integration_outbox(id,booking_id,event_type,effect_type,dedupe_key,state,
      next_attempt_at,created_at,updated_at)
      VALUES('synthetic-outbox','synthetic-booking','booking.confirmed','customer_notification',
      'synthetic-pending-notification','pending','2026-09-01','2026-09-01','2026-09-01');
  `);
}

function snapshot(h) {
  return Object.fromEntries(protectedTables.map((table) => [table,
    h.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
}

function preventUnrelatedReads(h) {
  return { ...h.db, prepare(sql) {
    assert.ok(!protectedTables.some((table) => new RegExp(`\\b${table}\\b`, "i").test(sql)),
      "contact recovery must not query booking, fulfillment, outbox or financial tables");
    return h.db.prepare(sql);
  } };
}

test("contact-only recovery survives restart and leaves overdue fulfillment, pending notifications and payments untouched", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  await seedInquiries(env);
  seedUnrelatedWork(h);
  const before = snapshot(h);
  const originalPayloads = h.sqlite.prepare("SELECT payload_json FROM contact_crm_delivery ORDER BY event_id").all().map((x) => x.payload_json);
  h.reopen();
  t.mock.timers.setTime(start + 10 * 60_000);
  const sent = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "https://crm.example.test/intake/website", "only the configured CRM intake may be called");
    sent.push(init.body);
    return Response.json({ ok: true, submission: { id: `synthetic-${sent.length}` } });
  });
  const active = { ...env, BOOKING_DB: preventUnrelatedReads(h),
    AIC_CRM_INTAKE_URL: "https://crm.example.test/intake/website", AIC_CRM_INTAKE_TOKEN: "synthetic-intake-token",
    AIC_CRM_BOOKING_EVENTS_ENABLED: "true", STRIPE_SECRET_KEY: "synthetic-never-use",
    AIC_EMAIL_PROVIDER: "resend", GRAIL_EMAIL_API_KEY: "synthetic-never-use",
    BOOKING_NOTIFICATION_WEBHOOK_URL: "https://notification.example.invalid/never",
    BOOKING_CONFIRMATION_WEBHOOK_URL: "https://notification.example.invalid/never" };
  const response = await invoke(active, { query: "?scope=all", body: JSON.stringify({ scope: "all" }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.summary.scope, "contacts");
  assert.equal(result.summary.crmDelivery.delivered, 2);
  assert.deepEqual([...sent].sort(), [...originalPayloads].sort());
  assert.deepEqual(snapshot(h), before, "all unrelated stored rows must be byte-for-byte equivalent");
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE event_type='booking.fulfillment_monitor.completed'").get().n, 0);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE event_type='contact.crm_monitor.completed'").get().n, 1);
  const status = h.sqlite.prepare("SELECT status FROM contact_inquiries WHERE email='scope-fit@example.test'").get();
  assert.equal(status.status, "fit_call_pending_review");
  assert.doesNotMatch(JSON.stringify(result), /scope-contact@|scope-fit@|Synthetic|utm_campaign|token/);
  await invoke(active);
  assert.equal(sent.length, 2, "delivered entries must not be sent again");
});

test("contact-only authentication and configuration denial happen before any database access", async () => {
  const db = { prepare() { assert.fail("unauthorized or invalid scope must not access the database"); } };
  const env = { BOOKING_DB: db, BOOKING_MONITOR_TOKEN: monitorToken, BOOKING_MONITOR_SCOPE: "contacts" };
  assert.equal((await invoke(env, { method: "GET" })).status, 405);
  assert.equal((await invoke({ ...env, BOOKING_MONITOR_TOKEN: "" })).status, 503);
  assert.equal((await invoke(env, { token: "wrong" })).status, 403);
  for (const scope of ["", "contact", "ALL", "unknown"]) {
    assert.equal((await invoke({ ...env, BOOKING_MONITOR_SCOPE: scope })).status, 503);
  }
});

test("contact-only concurrent invocations retain the existing single-claim delivery fence", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  await seedInquiries(env);
  t.mock.timers.setTime(start + 10 * 60_000);
  const identities = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    identities.push(JSON.parse(init.body).qualifiedSourceEventId);
    return Response.json({ ok: true, submission: { id: "synthetic-receiver-ack" } });
  });
  const active = { ...env, BOOKING_DB: preventUnrelatedReads(h),
    AIC_CRM_INTAKE_URL: "https://crm.example.test/intake/website", AIC_CRM_INTAKE_TOKEN: "synthetic-token" };
  const results = await Promise.all(Array.from({ length: 8 }, () => invoke(active)));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(identities.length, 2);
  assert.equal(new Set(identities).size, 2);
});

test("contact and full monitor freshness receipts do not mask one another", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: start });
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  h.sqlite.prepare("INSERT INTO booking_events(id,event_type,payload_json,created_at) VALUES(?,?,?,?)")
    .run("synthetic-old-full", "booking.fulfillment_monitor.completed", "{}", new Date(start - 60 * 60_000).toISOString());
  const first = await (await invoke(env)).json();
  assert.equal(first.summary.previousRunStale, false, "a first contact run has no previous contact receipt");
  const full = await (await invoke({ ...env, BOOKING_MONITOR_SCOPE: "all" })).json();
  assert.equal(full.summary.previousRunStale, true, "a recent contact run must not freshen fulfillment monitoring");
  t.mock.timers.setTime(start + 21 * 60_000);
  const next = await (await invoke(env)).json();
  assert.equal(next.summary.previousRunStale, true);
});

test("omitting the scope retains the existing full-monitor behavior", async (t) => {
  const h = createBookingSqliteFixture(t);
  const env = envFor(h);
  delete env.BOOKING_MONITOR_SCOPE;
  const result = await (await invoke(env)).json();
  assert.equal(result.ok, true);
  assert.equal(result.summary.outboxBookingsProcessed, 0);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE event_type='booking.fulfillment_monitor.completed'").get().n, 1);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE event_type='contact.crm_monitor.completed'").get().n, 0);
});

test("preview access and monitor authorization remain separate requirements", async (t) => {
  const h = createBookingSqliteFixture(t);
  const env = { ...envFor(h), PREVIEW_ACCESS_REQUIRED: "true", PREVIEW_ACCESS_TOKEN: "synthetic-preview-secret" };
  const cookie = `__Host-aic_preview=${createHash("sha256").update(`aissisted-preview-session:${env.PREVIEW_ACCESS_TOKEN}`).digest("hex")}`;
  async function gated(token, includeCookie) {
    const request = new Request(`${origin}/api/book/monitor`, { method: "POST",
      headers: { authorization: `Bearer ${token}`, ...(includeCookie ? { cookie } : {}) } });
    return middleware({ env, request, next: () => monitor({ env, request }) });
  }
  assert.equal((await gated(monitorToken, false)).status, 401);
  assert.equal((await gated(env.PREVIEW_ACCESS_TOKEN, false)).status, 403);
  assert.equal((await gated("wrong-monitor", true)).status, 403);
  const accepted = await gated(monitorToken, true);
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).summary.scope, "contacts");
});

test("contact-only missing queue schema cannot report a completed run", async (t) => {
  const h = createBookingSqliteFixture(t);
  h.sqlite.exec("DROP TABLE contact_crm_delivery");
  await assert.rejects(invoke(envFor(h)), /contact_crm_delivery/);
  assert.equal(h.sqlite.prepare("SELECT COUNT(*) AS n FROM booking_events WHERE event_type='contact.crm_monitor.completed'").get().n, 0);
});
