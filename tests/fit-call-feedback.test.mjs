import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../book/fit-call.js", import.meta.url), "utf8");
const bookingPage = await readFile(new URL("../book/index.html", import.meta.url), "utf8");
const statusClasses = bookingPage.match(/class="([^"]+)"\s+data-fit-call-status/)?.[1];
assert.ok(statusClasses, "the rendered booking page provides the Fit Call status container");

const receipt = {
  ok: true, inquiryId: "contact_synthetic_fit", status: "pending_manual_review",
  durationMinutes: 15, weeklyCapacity: 2, scheduled: false, paymentRequired: false
};

async function flushMicrotasks() {
  for (let step = 0; step < 12; step += 1) await Promise.resolve();
}

function harness(fetchResponse, options = {}) {
  const status = { className: statusClasses, textContent: "" };
  const button = { disabled: false };
  const values = new Map([
    ["name", "Synthetic Preview Owner"], ["email", "synthetic@example.test"],
    ["routeId", "workflow_improvement"], ["summary", "Synthetic fit question"],
    ["consentToSubmit", "on"]
  ]);
  let listener;
  let resetCount = 0;
  const requests = [];
  const signals = [];
  const timers = new Map();
  let nextTimer = 0;
  let now = 0;
  const form = {
    querySelector: (selector) => selector === "[data-fit-call-status]" ? status : button,
    addEventListener: (name, callback) => { if (name === "submit") listener = callback; },
    reset: () => { resetCount += 1; values.clear(); },
    reportValidity: () => options.valid !== false
  };
  vm.runInContext(source, vm.createContext({
    document: { querySelector: () => form },
    FormData: class {
      constructor() {
        if (options.formDataFails) throw new Error("Synthetic local form failure");
        this.values = new Map(values);
      }
      get(name) { return this.values.get(name) ?? ""; }
    },
    Error, AbortController,
    AicAdsTracking: options.tracking,
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url, options) => {
      assert.equal(url, "/api/book/fit-call");
      requests.push(JSON.parse(options.body));
      signals.push(options.signal);
      return fetchResponse(options);
    }
  }));
  return {
    status, button, requests, values, signals,
    get resetCount() { return resetCount; },
    get timerCount() { return timers.size; },
    advance: (milliseconds) => {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
    },
    submit: () => listener({ preventDefault() {} })
  };
}

function visible(run, tone) {
  for (const name of statusClasses.split(/\s+/)) {
    assert.ok(run.status.className.split(/\s+/).includes(name), "feedback preserves the rendered page's status styling");
  }
  assert.ok(run.status.className.split(/\s+/).includes("is-visible"), "the existing CSS requires is-visible to render the status");
  if (tone) assert.ok(run.status.className.split(/\s+/).includes(`is-${tone}`));
}

test("Fit Call exposes pending and successful feedback and resets only after receipt", async () => {
  let complete;
  const run = harness(() => new Promise((resolve) => { complete = resolve; }));
  const submitted = run.submit();
  assert.equal(run.button.disabled, true);
  assert.equal(run.status.textContent, "Sending your request...");
  const pendingClass = run.status.className;
  assert.equal(run.resetCount, 0);
  complete(Response.json(receipt));
  await submitted;
  assert.ok(pendingClass.split(/\s+/).includes("is-visible"), "sending feedback must be visible while the request is pending");
  visible(run, "success");
  assert.equal(run.status.textContent, "Request received. AIssisted Consulting will review the fit before scheduling anything.");
  assert.equal(run.resetCount, 1);
  assert.equal(run.button.disabled, false);
  assert.equal(run.requests.length, 1);
  assert.equal(run.requests[0].email, "synthetic@example.test");
  assert.equal(run.timerCount, 0);
});

test("Fit Call exposes receiver rejection and retains the user's input", async () => {
  const run = harness(() => Response.json({ ok: false, error: "A matching Fit Call request was already received recently." }, { status: 409 }));
  await run.submit();
  visible(run, "error");
  assert.equal(run.status.textContent, "A matching Fit Call request was already received recently.");
  assert.equal(run.values.get("summary"), "Synthetic fit question");
  assert.equal(run.resetCount, 0);
  assert.equal(run.button.disabled, false);
});

test("Fit Call shows a network error and clears its error styling on a successful retry", async () => {
  let attempt = 0;
  const run = harness(() => {
    if (++attempt === 1) throw new Error("Synthetic connection failure");
    return Response.json(receipt);
  });
  await run.submit();
  visible(run, "error");
  assert.match(run.status.textContent, /couldn't confirm whether your request was received/i);
  assert.equal(run.resetCount, 0);
  assert.equal(run.button.disabled, false);
  await run.submit();
  visible(run, "success");
  assert.equal(run.status.className.includes("is-error"), false);
  assert.equal(run.resetCount, 1);
  assert.deepEqual(run.requests[1], run.requests[0], "retry retains the original form data");
});

test("Fit Call visibly reports an unreadable API response without resetting input", async () => {
  const run = harness(() => new Response("Synthetic invalid JSON", { status: 502 }));
  await run.submit();
  visible(run, "error");
  assert.match(run.status.textContent, /couldn't confirm whether your request was received/i);
  assert.equal(run.resetCount, 0);
  assert.equal(run.button.disabled, false);
});

test("Fit Call ignores overlapping submissions without changing pending feedback", async () => {
  let complete;
  const run = harness(() => new Promise((resolve) => { complete = resolve; }));
  const pending = run.submit();
  void run.submit();
  await flushMicrotasks();
  assert.equal(run.requests.length, 1);
  assert.equal(run.button.disabled, true);
  assert.equal(run.status.textContent, "Sending your request...");
  complete(Response.json(receipt));
  await pending;
  assert.equal(run.resetCount, 1);
});

for (const phase of ["request", "response body"]) {
  test(`Fit Call bounds a stalled ${phase} without claiming rejection or automatically resending`, async () => {
    let complete;
    let attempt = 0;
    const run = harness(() => {
      if (++attempt > 1) return Response.json(receipt);
      const pending = new Promise((resolve) => { complete = resolve; });
      return phase === "request" ? pending : { ok: true, json: () => pending };
    });
    const submitted = run.submit();
    await flushMicrotasks();
    run.advance(14999);
    await flushMicrotasks();
    assert.equal(run.button.disabled, true);
    run.advance(1);
    await flushMicrotasks();
    assert.equal(run.button.disabled, false, "a deadline must release the form even if transport ignores abort");
    await submitted;
    visible(run, "error");
    assert.match(run.status.textContent, /couldn't confirm whether your request was received/i);
    assert.match(run.status.textContent, /contact us before submitting again/i);
    assert.equal(run.signals[0].aborted, true);
    assert.equal(run.requests.length, 1, "a timeout must not automatically resend an external write");
    assert.equal(run.values.get("summary"), "Synthetic fit question");
    assert.equal(run.resetCount, 0);
    const uncertainStatus = run.status.textContent;
    complete(phase === "request" ? Response.json(receipt) : receipt);
    await flushMicrotasks();
    assert.equal(run.status.textContent, uncertainStatus, "a late result cannot overwrite the outcome of a settled attempt");
    assert.equal(run.resetCount, 0);
    assert.equal(run.timerCount, 0);
    await run.submit();
    visible(run, "success");
    assert.deepEqual(run.requests[1], run.requests[0], "an explicit retry retains the unchanged details");
    assert.equal(run.resetCount, 1);
  });
}

for (const [name, body] of [
  ["missing acknowledgement", {}],
  ["truthy but nonboolean acknowledgement", { ...receipt, ok: "true" }],
  ["missing inquiry identity", { ...receipt, inquiryId: "" }],
  ["wrong review status", { ...receipt, status: "scheduled" }],
  ["scheduled appointment", { ...receipt, scheduled: true }],
  ["payment request", { ...receipt, paymentRequired: true }]
]) {
  test(`Fit Call does not reset inputs for a 200 response with ${name}`, async () => {
    const run = harness(() => Response.json(body));
    await run.submit();
    visible(run, "error");
    assert.match(run.status.textContent, /couldn't confirm whether your request was received/i);
    assert.equal(run.resetCount, 0);
    assert.equal(run.values.get("summary"), "Synthetic fit question");
    assert.equal(run.button.disabled, false);
    assert.equal(run.timerCount, 0);
  });
}

test("Fit Call rechecks native form validity before a request", async () => {
  const run = harness(() => Response.json(receipt), { valid: false });
  await run.submit();
  assert.equal(run.requests.length, 0);
  assert.equal(run.resetCount, 0);
  assert.equal(run.status.textContent, "");
  assert.equal(run.button.disabled, false);
  assert.equal(run.timerCount, 0);
});

test("Fit Call handles local payload preparation exceptions and leaves the form usable", async () => {
  const run = harness(() => Response.json(receipt), { formDataFails: true });
  await run.submit();
  visible(run, "error");
  assert.match(run.status.textContent, /could not prepare your request/i);
  assert.equal(run.requests.length, 0);
  assert.equal(run.resetCount, 0);
  assert.equal(run.button.disabled, false);
  assert.equal(run.timerCount, 0);
});

test("Fit Call preserves newer edits when the original pending request succeeds", async () => {
  let complete;
  let attributionCalls = 0;
  const run = harness(() => new Promise((resolve) => { complete = resolve; }), {
    tracking: { attributionSourcePage: () => `/book/?touch=${++attributionCalls}#fit-call` }
  });
  const submitted = run.submit();
  run.values.set("summary", "Newer unsent question");
  complete(Response.json(receipt));
  await submitted;
  visible(run, "success");
  assert.equal(run.requests.length, 1);
  assert.equal(run.requests[0].reason, "Synthetic fit question");
  assert.equal(run.values.get("summary"), "Newer unsent question");
  assert.equal(run.resetCount, 0);
  assert.match(run.status.textContent, /original request received/i);
  assert.match(run.status.textContent, /newer changes.*not been sent/i);
  assert.equal(attributionCalls, 1, "derived attribution is not part of the raw field comparison");
  assert.equal(run.button.disabled, false);
  assert.equal(run.timerCount, 0);
});

test("Fit Call uses its source fallback when the optional attribution helper throws", async () => {
  const run = harness(() => Response.json(receipt), {
    tracking: { attributionSourcePage: () => { throw new Error("Synthetic attribution failure"); } }
  });
  await run.submit();
  visible(run, "success");
  assert.equal(run.requests.length, 1);
  assert.equal(run.requests[0].sourcePage, "/book/#fit-call");
  assert.equal(run.resetCount, 1);
  assert.equal(run.button.disabled, false);
  assert.equal(run.timerCount, 0);
});
