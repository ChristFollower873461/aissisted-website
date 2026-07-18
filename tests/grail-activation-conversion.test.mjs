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

function runActivationScript(options = {}) {
  const axonCalls = [];
  const grailEvents = [];
  const fetchCalls = [];
  const formAttributes = new Map();
  const window = {
    location: new URL(options.url || "https://aissistedconsulting.com/grail/activation"),
    localStorage: createStorage(),
    async fetch(url, fetchOptions) {
      fetchCalls.push({ url, fetchOptions });
      return options.response || Response.json({ ok: false }, { status: 404 });
    },
    aissistedAxon: {
      trackGenerateLead(payload) {
        axonCalls.push(payload);
      }
    },
    GrailLaunchTracking: {
      emit(eventName, payload) {
        grailEvents.push({ eventName, payload });
      }
    }
  };
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (id !== "welcomeForm") return null;
      return {
        setAttribute(name, value) {
          formAttributes.set(name, value);
        }
      };
    }
  };
  const context = vm.createContext({
    window,
    document,
    URL,
    URLSearchParams,
    encodeURIComponent,
    console
  });

  vm.runInContext(readFileSync("grail/assets/grail-activation.js", "utf8"), context);
  return { window, axonCalls, grailEvents, fetchCalls, formAttributes };
}

test("paid Grail checkout emits exactly one Axon conversion", async () => {
  const run = runActivationScript({
    url: "https://aissistedconsulting.com/grail/activation?session_id=cs_test_paidgrail123",
    response: Response.json({
      ok: true,
      checkout: {
        verified: true,
        plan: "growth",
        planName: "Grail Growth",
        currency: "USD",
        value: 199,
        amountCents: 19900
      }
    })
  });

  const first = await run.window.GrailActivation.verifyAndTrackPurchase();
  const second = await run.window.GrailActivation.verifyAndTrackPurchase();

  assert.equal(first.tracked, true);
  assert.equal(second.tracked, false);
  assert.equal(second.reason, "already_reported");
  assert.equal(run.axonCalls.length, 1);
  assert.equal(run.axonCalls[0].currency, "USD");
  assert.equal(run.axonCalls[0].value, 199);
  assert.equal(run.fetchCalls.length, 1);
  assert.equal(run.grailEvents[0].eventName, "grail_purchase_verified");
  assert.equal(run.grailEvents[0].payload.pricing_plan, "growth");
  assert.equal(run.formAttributes.get("data-grail-plan"), "growth");
  assert.equal(run.window.GrailActivation.getVerifiedCheckout().plan, "growth");
});

test("direct and unverified activation visits never emit an Axon conversion", async () => {
  const direct = runActivationScript();
  const directResult = await direct.window.GrailActivation.verifyAndTrackPurchase();
  assert.equal(directResult.reason, "missing_or_invalid_session");
  assert.equal(direct.fetchCalls.length, 0);
  assert.equal(direct.axonCalls.length, 0);

  const unverified = runActivationScript({
    url: "https://aissistedconsulting.com/grail/activation?session_id=cs_test_unpaidgrail123",
    response: Response.json({ ok: false }, { status: 404 })
  });
  const unverifiedResult = await unverified.window.GrailActivation.verifyAndTrackPurchase();
  assert.equal(unverifiedResult.reason, "checkout_not_verified");
  assert.equal(unverified.axonCalls.length, 0);
});
