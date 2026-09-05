import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../book/fit-call.js", import.meta.url), "utf8");

function harness(fetchResponse) {
  const status = { className: "contact-submit-status", textContent: "" };
  const button = { disabled: false };
  const values = new Map([
    ["name", "Synthetic Preview Owner"], ["email", "synthetic@example.test"],
    ["routeId", "workflow_improvement"], ["summary", "Synthetic fit question"],
    ["consentToSubmit", "on"]
  ]);
  let listener;
  let resetCount = 0;
  const requests = [];
  const form = {
    querySelector: (selector) => selector === "[data-fit-call-status]" ? status : button,
    addEventListener: (name, callback) => { if (name === "submit") listener = callback; },
    reset: () => { resetCount += 1; values.clear(); }
  };
  vm.runInContext(source, vm.createContext({
    document: { querySelector: () => form },
    FormData: class { get(name) { return values.get(name) ?? ""; } },
    Error,
    fetch: async (url, options) => {
      assert.equal(url, "/api/book/fit-call");
      requests.push(JSON.parse(options.body));
      return fetchResponse();
    }
  }));
  return {
    status, button, requests, values,
    get resetCount() { return resetCount; },
    submit: () => listener({ preventDefault() {} })
  };
}

function visible(run, tone) {
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
  complete(Response.json({ ok: true }));
  await submitted;
  assert.ok(pendingClass.split(/\s+/).includes("is-visible"), "sending feedback must be visible while the request is pending");
  visible(run, "success");
  assert.equal(run.status.textContent, "Request received. AIssisted Consulting will review the fit before scheduling anything.");
  assert.equal(run.resetCount, 1);
  assert.equal(run.button.disabled, false);
  assert.equal(run.requests.length, 1);
  assert.equal(run.requests[0].email, "synthetic@example.test");
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
    return Response.json({ ok: true });
  });
  await run.submit();
  visible(run, "error");
  assert.equal(run.status.textContent, "Synthetic connection failure");
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
  assert.equal(run.status.textContent, "We could not send the request.");
  assert.equal(run.resetCount, 0);
  assert.equal(run.button.disabled, false);
});
