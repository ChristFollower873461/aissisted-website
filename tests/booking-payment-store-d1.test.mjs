import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test as nodeTest } from "node:test";
import { Miniflare, Log, LogLevel } from "miniflare";
import { createBookingPaymentStore } from "../functions/api/_lib/booking-payment-store.js";
import { getBookingStore } from "../functions/api/_lib/storage.js";
import { sealBookingEvent } from "../functions/api/_lib/booking-events.js";
import { migrateBookingD1 } from "./helpers/booking-payments/migrations.mjs";
const vector = JSON.parse(readFileSync(new URL("./fixtures/booking-event-v1.json", import.meta.url), "utf8"));
// Execute the actual store against all checked-in migrations on isolated D1.
// No ambient platform configuration, customer data or outbound requests are used.
nodeTest("booking payment store transactions on local Cloudflare D1", { timeout: 60_000 }, async (t) => {
  let outboundRequests = 0;
  const mf = new Miniflare({ modules: true, script: 'export default { fetch(){return new Response("Synthetic local D1 only");} };', compatibilityDate: "2026-05-18", host: "127.0.0.1", port: 0, cf: false, d1Persist: false, log: new Log(LogLevel.ERROR), d1Databases: { DB: "synthetic-booking-store-tests" }, outboundService() {
    outboundRequests++;
    throw new Error("External requests forbidden in booking store tests");
  } });
  const at = "2026-09-05T17:00:00.000Z";
  const plus = (seconds) => new Date(Date.parse(at) + seconds * 1e3).toISOString();
  const scope = { sourceEnvironment: "staging", providerAccountId: "acct_synthetic", livemode: false };
  let seq = 0;
  try {
    const db = await mf.getD1Database("DB");
    const store = createBookingPaymentStore(db);
    const bookingStore = getBookingStore({ BOOKING_DB: db });
    const appliedMigrations = await migrateBookingD1(db);
    assert.ok(appliedMigrations.includes("0006_booking_payment_reconciliation.sql"));
    const q = (sql, ...args) => db.prepare(sql).bind(...args);
    const rows = async (sql, ...args) => (await q(sql, ...args).all()).results;
    const snapshot = async () => {
      const s = {};
      for (const table of ["prospects", "bookings", "checkout_intents", "agent_idempotency_records", "booking_payment_state", "booking_crm_delivery", "booking_provider_receipts", "booking_deliverables", "deposit_credits", "integration_outbox", "booking_contract_events"]) s[table] = await rows(`SELECT * FROM ${table} ORDER BY rowid`);
      return s;
    };
    const seed = async () => {
      const n = ++seq;
      const id = `booking_store_${n}`;
      const v = structuredClone(vector);
      Object.assign(v, { bookingId: id, eventId: `booking-start:${id}:v1`, rootQualifiedSourceEventId: `website-booking-${id}`, checkoutSessionId: `cs_test_${id}`, observedAt: at });
      v.intake.qualifiedSourceEventId = v.rootQualifiedSourceEventId;
      await db.batch([
        q("INSERT INTO prospects(id,name,email,created_at,updated_at) VALUES(?,'Synthetic',?,?,?)", `prospect_${n}`, `synthetic${n}@example.test`, at, at),
        q("INSERT INTO agent_idempotency_records(id,command_id,risk,idempotency_key_hash,request_fingerprint,status,created_at,updated_at) VALUES(?,'booking','test',?,?,'started',?,?)", `idem_${n}`, `key_${n}`, `request_${n}`, at, at),
        q("INSERT INTO bookings(id,prospect_id,slot_id,selected_time_window_start,selected_time_window_end,selected_time_zone,booking_status,payment_status,reservation_amount,currency,temporary_hold_expires_at,created_at,updated_at,policy_version,policy_accepted_at,checkout_idempotency_record_id) VALUES(?,?,?,?,?,'UTC','hold','unpaid',22500,'usd',?,?,?,?,?,?)", id, `prospect_${n}`, `slot_${n}`, plus(3600), plus(7200), plus(900), at, at, "synthetic-v1", at, `idem_${n}`),
        q("INSERT INTO checkout_intents(id,booking_id,stripe_idempotency_key,release_id,offer_id,offer_version,terms_version,terms_sha256,state,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,'prepared',?,?)", `intent_${n}`, id, `stripe_key_${n}`, v.contract.releaseId, v.contract.offerId, v.contract.termsVersion, v.contract.termsSha256, at, at)
      ]);
      const event = await sealBookingEvent(v);
      const input = { event, idempotencyRecordId: `idem_${n}`, responseBody: { ok: true, bookingId: id, checkoutUrl: `https://checkout.example.test/${id}` }, stripeCustomerId: `cus_synthetic_${n}`, at };
      return { id, n, event, input, contract: { ...v.contract, implementationCreditEnabled: false } };
    };
    const attach = async () => {
      const s = await seed();
      await store.attachStart(s.input);
      return s;
    };
    const facts = (s) => ({ paymentIntentId: `pi_${s.id}`, chargeId: `ch_${s.id}`, snapshot: { checkoutStatus: "complete", paymentStatus: "paid", paidAmountCents: 22500, succeededRefundAmountCents: 0, refundStatus: "none", bookingStatus: "confirmed" }, provenance: { providerEventId: `evt_${s.id}`, providerEventType: "checkout.session.completed", providerCreatedAt: 1788624e3, verifiedAt: at }, succeededRefundIds: [] });
    const receipt = async (s) => {
      const r = await store.recordReceipt({ event: { id: `evt_${s.id}`, type: "checkout.session.completed" }, payloadHash: "a".repeat(64), scope, at });
      return store.claimQueue("receipt", { id: r.id, at });
    };
    const commitInput = async (s, options = {}) => ({ lease: await store.claimBooking({ bookingId: s.id, scope, at: options.at || at }), booking: await bookingStore.getBookingById(s.id), contract: s.contract, facts: facts(s), at: options.at || at, ...options });
    const test = (name, fn) => t.test(name, fn);
    await test("start atomically associates session, reply, original event and delivery", async () => {
      const s = await attach();
      const b = await bookingStore.getBookingById(s.id);
      assert.equal(b.stripeCheckoutSessionId, s.event.checkoutSessionId);
      assert.equal(b.paymentStatus, "checkout_created");
      const i = await q("SELECT * FROM agent_idempotency_records WHERE id=?", s.input.idempotencyRecordId).first();
      assert.equal(i.status, "succeeded");
      assert.deepEqual(JSON.parse(i.response_body_json), s.input.responseBody);
      assert.equal((await rows("SELECT * FROM booking_crm_delivery WHERE booking_id=?", s.id)).length, 1);
    });
    for (const [label, trigger] of [["payment state", "BEFORE INSERT ON booking_payment_state"], ["delivery", "BEFORE INSERT ON booking_crm_delivery"], ["idempotency reply", "BEFORE UPDATE ON agent_idempotency_records"]]) await test(`start ${label} failure rolls back all association and can retry`, async () => {
      const s = await seed();
      const before = await snapshot();
      await q(`CREATE TRIGGER synthetic_failure ${trigger} BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END`).run();
      await assert.rejects(() => store.attachStart(s.input));
      assert.deepEqual(await snapshot(), before);
      await q("DROP TRIGGER synthetic_failure").run();
      assert.equal((await store.attachStart(s.input)).committed, true);
    });
    await test("simultaneous start attachment creates one immutable event and response", async () => {
      const s = await seed();
      const r = await Promise.allSettled([store.attachStart(s.input), store.attachStart(s.input)]);
      assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal((await rows("SELECT * FROM booking_crm_delivery WHERE booking_id=?", s.id)).length, 1);
      assert.equal((await q("SELECT status FROM agent_idempotency_records WHERE id=?", s.input.idempotencyRecordId).first()).status, "succeeded");
    });
    await test("expired hold cannot attach or cache successful checkout reply", async () => {
      const s = await seed();
      await q("UPDATE bookings SET temporary_hold_expires_at=? WHERE id=?", plus(-1), s.id).run();
      const before = await snapshot();
      await assert.rejects(() => store.attachStart(s.input));
      assert.deepEqual(await snapshot(), before);
    });
    await test("receipt hash conflict is immutable; queue claim is exclusive", async () => {
      const s = await attach();
      const event = { id: `evt_${s.id}` };
      const r = await store.recordReceipt({ event, payloadHash: "b".repeat(64), scope, at });
      const before = await snapshot();
      await assert.rejects(() => store.recordReceipt({ event, payloadHash: "c".repeat(64), scope, at }));
      assert.deepEqual(await snapshot(), before);
      const claims = await Promise.all([store.claimQueue("receipt", { id: r.id, at }), store.claimQueue("receipt", { id: r.id, at })]);
      assert.equal(claims.filter(Boolean).length, 1);
    });
    for (const kind of ["receipt", "delivery"]) await test(`${kind} stale lease cannot finish and crash on final attempt becomes needs_attention`, async () => {
      const s = await attach();
      let id = s.event.eventId;
      if (kind === "receipt") {
        const r = await store.recordReceipt({ event: { id: `evt_${s.id}` }, payloadHash: "a".repeat(64), scope, at });
        id = r.id;
      }
      const old = await store.claimQueue(kind, { id, at });
      const fresh = await store.claimQueue(kind, { id, at: plus(121) });
      assert.ok(fresh);
      assert.notEqual(fresh.lease_token, old.lease_token);
      assert.equal(await store.finishQueue(kind, old, { ok: true, at: plus(122) }), false);
      const [table, key] = kind === "receipt" ? ["booking_provider_receipts", "id"] : ["booking_crm_delivery", "event_id"];
      await q(`UPDATE ${table} SET attempts=8 WHERE ${key}=?`, id).run();
      assert.equal(await store.claimQueue(kind, { id, at: plus(242) }), null);
      const row = await q(`SELECT * FROM ${table} WHERE ${key}=?`, id).first();
      assert.equal(row.state, "needs_attention");
      assert.equal(row.last_safe_error_code, "attempts_exhausted");
    });
    await test("paid commit atomically confirms fulfillment,3effect intents, receipt and CRM snapshot", async () => {
      const s = await attach();
      const r = await receipt(s);
      const input = await commitInput(s, { receipt: r });
      const result = await store.commitFacts(input);
      assert.equal(result.committed, true);
      assert.equal(result.changed, true);
      assert.equal((await bookingStore.getBookingById(s.id)).bookingStatus, "confirmed");
      assert.equal((await rows("SELECT * FROM booking_deliverables WHERE booking_id=?", s.id)).length, 1);
      assert.equal((await rows("SELECT * FROM integration_outbox WHERE booking_id=?", s.id)).length, 3);
      assert.equal((await rows("SELECT * FROM booking_crm_delivery WHERE booking_id=?", s.id)).length, 2);
      assert.equal((await q("SELECT * FROM booking_provider_receipts WHERE id=?", r.id).first()).state, "delivered");
    });
    for (const [label, trigger] of [["deliverable", "BEFORE INSERT ON booking_deliverables"], ["effect intent", "BEFORE INSERT ON integration_outbox"], ["receipt completion", "BEFORE UPDATE ON booking_provider_receipts"]]) await test(`financial ${label} failure rolls back projection, fulfillment, delivery and can retry`, async () => {
      const s = await attach();
      const r = await receipt(s);
      const input = await commitInput(s, { receipt: r });
      const before = await snapshot();
      await q(`CREATE TRIGGER synthetic_failure ${trigger} BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END`).run();
      await assert.rejects(() => store.commitFacts(input));
      assert.deepEqual(await snapshot(), before);
      await q("DROP TRIGGER synthetic_failure").run();
      assert.equal((await store.commitFacts(input)).committed, true);
    });
    await test("expired booking lease loses to fresh worker; stale financial commit and release do nothing", async () => {
      const s = await attach();
      const old = await commitInput(s);
      const fresh = await commitInput(s, { at: plus(121) });
      assert.notEqual(old.lease.lease_token, fresh.lease.lease_token);
      const before = await snapshot();
      assert.equal((await store.commitFacts({ ...old, at: plus(122) })).committed, false);
      assert.equal(await store.releaseBooking(old.lease, { reason: "old_worker", at: plus(122) }), false);
      assert.deepEqual(await snapshot(), before);
      assert.equal((await store.commitFacts(fresh)).committed, true);
    });
    await test("unchanged financial facts reuse revision; stale booking guard cannot mutate no-delta path", async () => {
      const s = await attach();
      await store.commitFacts(await commitInput(s));
      const stable = await commitInput(s, { at: plus(1) });
      const beforeRev = stable.lease.revision;
      const unchanged = await store.commitFacts(stable);
      assert.equal(unchanged.committed, true);
      assert.equal(unchanged.changed, false);
      assert.equal((await store.getState(s.id)).revision, beforeRev);
      const stale = await commitInput(s, { at: plus(2) });
      await q("UPDATE bookings SET booking_status='canceled',updated_at=? WHERE id=?", plus(3), s.id).run();
      const before = await snapshot();
      assert.equal((await store.commitFacts(stale)).committed, false);
      assert.deepEqual(await snapshot(), before);
    });
    await test("late payment after expired hold records manual review and no fulfillment effects", async () => {
      const s = await attach();
      await q("UPDATE bookings SET booking_status='expired',temporary_hold_expires_at=NULL,updated_at=? WHERE id=?", plus(901), s.id).run();
      const result = await store.commitFacts(await commitInput(s, { at: plus(902) }));
      assert.equal(result.committed, true);
      assert.equal((await bookingStore.getBookingById(s.id)).bookingStatus, "manual_review");
      assert.equal((await rows("SELECT * FROM integration_outbox WHERE booking_id=?", s.id)).length, 0);
      assert.equal((await rows("SELECT * FROM booking_deliverables WHERE booking_id=?", s.id)).length, 0);
    });
    await test("booking crashed on last attempt is terminal and wrong scope cannot claim", async () => {
      const s = await attach();
      assert.equal(await store.claimBooking({ bookingId: s.id, scope: { ...scope, providerAccountId: "acct_other" }, at }), null);
      const lease = await store.claimBooking({ bookingId: s.id, scope, at });
      assert.ok(lease);
      await q("UPDATE booking_payment_state SET failures=8 WHERE booking_id=?", s.id).run();
      assert.equal(await store.claimBooking({ bookingId: s.id, scope, at: plus(121) }), null);
      assert.equal((await store.getState(s.id)).state, "needs_attention");
    });
    const fullRefund = async () => {
      const s = await attach();
      await store.commitFacts(await commitInput(s));
      const full = facts(s);
      full.snapshot.refundStatus = "full";
      full.snapshot.succeededRefundAmountCents = 22500;
      full.succeededRefundIds = [`re_${s.id}`];
      full.provenance = { ...full.provenance, providerEventId: `evt_refund_${s.id}`, providerEventType: "refund.updated" };
      const input = await commitInput(s, { facts: full, at: plus(1) });
      assert.equal((await store.commitFacts(input)).committed, true);
      await q("UPDATE booking_deliverables SET status='refund_requested',remedy_status='refund_requested' WHERE booking_id=?", s.id).run();
      s.full = full;
      s.refundInput = { bookingId: s.id, refundReference: `re_${s.id}`, actorRef: "synthetic-operator", idempotencyKey: `refund_${s.id}`, at: plus(2) };
      return s;
    };
    await test("exact current full refund atomically reconciles deliverable and factual contract event", async () => {
      const s = await fullRefund();
      const before = await store.getState(s.id);
      assert.equal((await store.reconcileVerifiedRefund(s.refundInput)).committed, true);
      const d = await q("SELECT * FROM booking_deliverables WHERE booking_id=?", s.id).first();
      assert.equal(d.status, "refunded");
      assert.equal(d.refund_reference, s.refundInput.refundReference);
      const e = await q("SELECT * FROM booking_contract_events WHERE booking_id=? AND event_type='refund_reconciled'", s.id).first();
      assert.equal(JSON.parse(e.safe_metadata_json).verifiedAt, before.verified_at);
      const state = await store.getState(s.id);
      assert.equal(state.state, "pending");
      assert.equal(state.lease_token, null);
    });
    for (const label of ["partial", "pending", "foreign reference", "unverified", "old verification", "future verification"]) await test(`${label} refund proof cannot mark deliverable refunded`, async () => {
      const s = await fullRefund();
      if (["partial", "pending"].includes(label)) {
        const f = structuredClone(s.full);
        f.snapshot.refundStatus = label;
        f.snapshot.succeededRefundAmountCents = label === "partial" ? 1e4 : 0;
        await store.commitFacts(await commitInput(s, { facts: f, at: plus(2) }));
      } else if (label === "foreign reference") s.refundInput.refundReference = "re_foreign";
      else if (label === "unverified") await q("UPDATE booking_payment_state SET verified_at=NULL WHERE booking_id=?", s.id).run();
      else if (label === "old verification") s.refundInput.at = plus(902);
      else s.refundInput.at = at;
      const before = await snapshot();
      await assert.rejects(() => store.reconcileVerifiedRefund(s.refundInput));
      assert.deepEqual(await snapshot(), before);
    });
    await test("refund event insertion failure rolls back deliverable and claim then retry succeeds", async () => {
      const s = await fullRefund();
      const before = await snapshot();
      await q("CREATE TRIGGER synthetic_failure BEFORE INSERT ON booking_contract_events WHEN NEW.event_type='refund_reconciled' BEGIN SELECT RAISE(ABORT,'Synthetic failure'); END").run();
      await assert.rejects(() => store.reconcileVerifiedRefund(s.refundInput));
      assert.deepEqual(await snapshot(), before);
      await q("DROP TRIGGER synthetic_failure").run();
      assert.equal((await store.reconcileVerifiedRefund(s.refundInput)).committed, true);
    });
    await test("first provider observation already fully refunded yields manual review without fulfillment", async () => {
      const s = await attach();
      const f = facts(s);
      f.snapshot.refundStatus = "full";
      f.snapshot.succeededRefundAmountCents = 22500;
      f.succeededRefundIds = ["re_already_refunded"];
      assert.equal((await store.commitFacts(await commitInput(s, { facts: f }))).committed, true);
      assert.equal((await bookingStore.getBookingById(s.id)).bookingStatus, "manual_review");
      assert.equal((await rows("SELECT * FROM integration_outbox WHERE booking_id=?", s.id)).length, 0);
      assert.equal((await rows("SELECT * FROM booking_deliverables WHERE booking_id=?", s.id)).length, 0);
    });
    for (const changesFacts of [true, false]) await test(`new ${changesFacts ? "changed" : "no-delta"} provider verification blocks stale refund proof CAS`, async () => {
      const s = await fullRefund();
      let injected = false;
      const intercepted = { prepare: db.prepare.bind(db), async batch(statements) {
        if (!injected) {
          injected = true;
          const newest = structuredClone(s.full);
          if (changesFacts) {
            newest.snapshot.refundStatus = "partial";
            newest.snapshot.succeededRefundAmountCents = 10000;
          }
          const fresh = await commitInput(s, { facts: newest, at: plus(3) });
          const committed = await store.commitFacts(fresh);
          assert.equal(committed.committed, true);
          assert.equal(committed.changed, changesFacts);
        }
        return db.batch(statements);
      } };
      const raced = createBookingPaymentStore(intercepted);
      await assert.rejects(() => raced.reconcileVerifiedRefund(s.refundInput));
      const d = await q("SELECT * FROM booking_deliverables WHERE booking_id=?", s.id).first();
      assert.equal(d.status, "refund_requested");
      assert.equal((await store.getState(s.id)).verified_at, plus(3));
    });
    assert.equal(outboundRequests, 0);
  } finally {
    await mf.dispose();
  }
});
