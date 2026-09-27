import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../contact/contact.js", import.meta.url), "utf8");
const initialValues = {
  name: "Synthetic Contact Owner", email: "synthetic@example.test", phone: "",
  company: "Synthetic project", audience: "custom_development",
  message: "Synthetic inquiry A", sourcePage: "/contact/", websiteLeaveBlank: "",
  consentToSubmit: "on"
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function receipt(overrides = {}) {
  return {
    ok: true, replayed: false,
    inquiry: {
      id: "inq_0123456789abcdef0123456789abcdef", status: "received",
      createdAt: "2026-09-27T12:00:00.000Z", deliveryStatus: "crm_relay_delivered"
    },
    nextStep: "AIssisted Consulting will review the inquiry and respond through the public contact details.",
    ...overrides
  };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

async function flush() {
  for (let i = 0; i < 24; i += 1) await Promise.resolve();
}

function harness(transport, { axonThrows = false, adsThrows = false, search = "", initialAudience = initialValues.audience } = {}) {
  const values = new Map(Object.entries(initialValues));
  values.set("audience", initialAudience);
  const status = { className: "contact-submit-status", textContent: "" };
  status.classList = {
    add: (...names) => { status.className = [...new Set([...status.className.split(/\s+/), ...names])].join(" "); }
  };
  const button = { disabled: false, textContent: "Send inquiry" };
  const requests = [];
  const tracks = { axon: 0, ads: 0 };
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  let uuid = 0;
  let resetCount = 0;
  let storageCalls = 0;
  let listener;
  let sourcePage = "/services/?utm_source=synthetic&utm_campaign=first";
  const audience = {
    get value() { return values.get("audience"); },
    set value(value) { values.set("audience", value); }
  };
  const form = {
    querySelector: (selector) => selector === 'select[name="audience"]' ? audience : button,
    addEventListener: (name, callback) => { if (name === "submit") listener = callback; },
    reportValidity: () => true,
    reset: () => { resetCount += 1; values.clear(); }
  };
  const storage = Object.fromEntries(["getItem", "setItem", "removeItem"].map((name) => [name, () => {
    storageCalls += 1;
    throw new Error("Contact drafts must not use browser storage.");
  }]));
  const context = {
    document: {
      querySelector: () => form,
      getElementById: () => status
    },
    FormData: class { get(name) { return values.get(name) ?? ""; } },
    Error, AbortController, URLSearchParams,
    location: { search },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}` },
    localStorage: storage, sessionStorage: storage,
    setTimeout: (callback, delay) => {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) => {
      assert.equal(url, "/api/contact/submit");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["content-type"], "application/json");
      requests.push({ body: options.body, key: options.headers["idempotency-key"], signal: options.signal });
      return transport(requests.length);
    },
    aissistedAxon: { trackGenerateLead: () => { tracks.axon += 1; if (axonThrows) throw new Error("Synthetic Axon failure"); } },
    AicAdsTracking: {
      attributionSourcePage: () => sourcePage,
      emit: () => { tracks.ads += 1; if (adsThrows) throw new Error("Synthetic Ads failure"); }
    }
  };
  context.window = context;
  vm.runInContext(source, vm.createContext(context));
  return {
    values, status, button, requests, tracks,
    get resetCount() { return resetCount; },
    get storageCalls() { return storageCalls; },
    get timerCount() { return timers.size; },
    setSourcePage: (value) => { sourcePage = value; },
    refill: () => { for (const [key, value] of Object.entries(initialValues)) values.set(key, value); },
    submit: () => listener({ preventDefault() {} }),
    advance: async (milliseconds) => {
      now += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) { timers.delete(id); timer.callback(); }
      }
      await flush();
    }
  };
}

test("contact Build link presets its supported topic and submits the visitor's later choice", async () => {
  const services = await readFile(new URL("../services/index.html", import.meta.url), "utf8");
  const buildLane = services.match(/<a class="lane" href="([^"]+)">\s*<span class="num">02<\/span>\s*<h3>Build something new<\/h3>/);
  assert.ok(buildLane, "the Services Build lane must remain an actual navigable link");
  const destination = new URL(buildLane[1], "https://aissistedconsulting.com/services/");
  assert.equal(destination.pathname, "/contact/");
  assert.equal(destination.searchParams.get("topic"), "custom_development");
  const run = harness(() => response(receipt()), { search: destination.search, initialAudience: "small_business_workflow" });
  assert.equal(run.values.get("audience"), "custom_development");
  run.values.set("audience", "individual_software_build");
  await run.submit();
  assert.equal(JSON.parse(run.requests[0].body).audience, "individual_software_build");
  assert.equal(run.storageCalls, 0);
});

test("contact topic preset uses exact supported values without overriding restored input", () => {
  for (const search of ["", "?topic=", "?topic=other", "?topic=CUSTOM_DEVELOPMENT", "?topic=custom_development_extra"]) {
    const run = harness(() => response(receipt()), { search, initialAudience: "small_business_workflow" });
    assert.equal(run.values.get("audience"), "small_business_workflow", search);
  }
  const preset = harness(() => response(receipt()), { search: "?topic=custom_development", initialAudience: "small_business_workflow" });
  assert.equal(preset.values.get("audience"), "custom_development");
  const restored = harness(() => response(receipt()), { search: "?topic=custom_development", initialAudience: "family_ai_question" });
  assert.equal(restored.values.get("audience"), "family_ai_question");
  assert.equal(restored.storageCalls, 0);
});

function confirmed(run, resets = 1) {
  assert.match(run.status.className, /\bis-visible\b/);
  assert.match(run.status.className, /\bis-success\b/);
  assert.match(run.status.textContent, /inquiry received/i);
  assert.equal(run.resetCount, resets);
  assert.equal(run.button.disabled, false);
  assert.equal(run.button.textContent, "Send inquiry");
  assert.equal(run.timerCount, 0);
  assert.equal(run.storageCalls, 0);
}

function uncertain(run) {
  assert.doesNotMatch(run.status.className, /\bis-success\b/);
  assert.match(run.status.className, /\bis-visible\b/);
  assert.match(run.status.textContent, /confirm/i, "lost acknowledgements must say receipt is unconfirmed");
  assert.doesNotMatch(run.status.textContent, /could not be sent|was not sent|rejected|inquiry received/i);
  assert.equal(run.resetCount, 0);
  assert.equal(run.values.get("message"), initialValues.message);
  assert.equal(run.button.disabled, false);
  assert.equal(run.button.textContent, "Send inquiry");
  assert.equal(run.timerCount, 0);
  assert.equal(run.storageCalls, 0);
}

test("contact accepts the backend inquiry receipt, including replay and unresolved CRM delivery", async () => {
  for (const deliveryStatus of ["local_record_only", "crm_relay_delivered", "crm_relay_failed"]) {
    const body = receipt();
    body.inquiry.deliveryStatus = deliveryStatus;
    body.replayed = deliveryStatus === "crm_relay_failed";
    const run = harness(() => response(body));
    await run.submit();
    confirmed(run);
    assert.deepEqual(run.tracks, { axon: 1, ads: 1 });
  }
});

test("contact requires a valid explicit receipt instead of treating HTTP success as acceptance", async (t) => {
  const invalidResponses = [
    ["200 empty object", () => response({})],
    ["204 empty body", () => ({ ok: true, status: 204, text: async () => "" })],
    ["200 null", () => response(null)],
    ["200 malformed body", () => ({ ok: true, status: 200, text: async () => '<script>private-provider-debug</script>' })],
    ["200 uppercase malformed body", () => ({ ok: true, status: 200, text: async () => '<SCRIPT>PRIVATE-PROVIDER-DEBUG</SCRIPT>' })],
    ["200 ok without inquiry", () => response({ ok: true })],
    ["200 empty inquiry id", () => response(receipt({ inquiry: { id: "" } }))],
    ["200 non-string inquiry id", () => response(receipt({ inquiry: { id: 42 } }))],
    ["200 non-boolean ok", () => response(receipt({ ok: "true" }))]
  ];
  for (const [name, makeResponse] of invalidResponses) {
    await t.test(name, async () => {
      const run = harness(makeResponse);
      await run.submit();
      uncertain(run);
      assert.doesNotMatch(run.status.textContent, /private-provider-debug/i);
      assert.equal(run.status.textContent.includes("<"), false);
      assert.equal(run.status.textContent.includes(">"), false);
      assert.deepEqual(run.tracks, { axon: 0, ads: 0 });
    });
  }
});

test("lost-response retry preserves the exact key and serialized request despite attribution changes", async () => {
  const run = harness((attempt) => {
    if (attempt === 1) throw new Error("Synthetic lost acknowledgement");
    return response(receipt());
  });
  await run.submit();
  assert.equal(run.resetCount, 0);
  assert.equal(run.button.disabled, false);
  assert.doesNotMatch(run.status.className, /\bis-success\b/);
  run.setSourcePage("/contact/?utm_source=synthetic&utm_campaign=changed");
  await run.submit();
  assert.equal(run.requests[1].key, run.requests[0].key);
  assert.equal(run.requests[1].body, run.requests[0].body);
  confirmed(run);
  assert.match(run.requests[0].key, /^contact-/);
  run.refill();
  await run.submit();
  confirmed(run, 2);
  assert.notEqual(run.requests[2].key, run.requests[0].key, "confirmed inquiry allows a fresh next submission");
  assert.equal(JSON.parse(run.requests[2].body).sourcePage, "/contact/?utm_source=synthetic&utm_campaign=changed");
  assert.deepEqual(run.tracks, { axon: 1, ads: 1 }, "a replayed receipt must not duplicate conversions within the page");
});

test("editing an uncertain inquiry creates a new identity and reverting recovers its original identity", async () => {
  const run = harness(() => { throw new Error("Synthetic lost acknowledgement"); });
  await run.submit();
  run.values.set("message", "Synthetic inquiry B");
  await run.submit();
  run.values.set("message", initialValues.message);
  run.setSourcePage("/contact/?utm_source=synthetic&utm_campaign=changed");
  await run.submit();
  assert.notEqual(run.requests[1].key, run.requests[0].key);
  assert.notEqual(run.requests[1].body, run.requests[0].body);
  assert.equal(run.requests[2].key, run.requests[0].key);
  assert.equal(run.requests[2].body, run.requests[0].body);
  uncertain(run);
});

for (const stage of ["fetch", "body"]) {
  test(`contact deadline covers pending ${stage}, unlocks for safe retry, and ignores late success`, async () => {
    const pending = deferred();
    const run = harness((attempt) => {
      if (attempt > 1) return response(receipt());
      return stage === "fetch" ? pending.promise : { ok: true, status: 200, text: () => pending.promise };
    });
    let settled = false;
    const submitted = Promise.resolve(run.submit()).then(() => { settled = true; });
    await flush();
    assert.equal(run.button.disabled, true);
    await run.advance(14_999);
    assert.equal(settled, false);
    assert.equal(run.button.disabled, true);
    await run.advance(1);
    assert.equal(settled, true, "the 15 second deadline must settle even if transport ignores abort");
    await submitted;
    uncertain(run);
    assert.equal(run.requests[0].signal?.aborted, true);
    await run.submit();
    confirmed(run);
    assert.equal(run.requests[1].key, run.requests[0].key);
    assert.equal(run.requests[1].body, run.requests[0].body);
    pending.resolve(stage === "fetch" ? response(receipt()) : JSON.stringify(receipt()));
    await flush();
    confirmed(run);
    assert.deepEqual(run.tracks, { axon: 1, ads: 1 });
  });
}

for (const failingTracker of ["axonThrows", "adsThrows"]) {
  test(`confirmed contact receipt survives ${failingTracker} and still resets and runs the other tracker`, async () => {
    const run = harness(() => response(receipt()), { [failingTracker]: true });
    await run.submit();
    confirmed(run);
    assert.equal(run.values.size, 0);
    assert.deepEqual(run.tracks, { axon: 1, ads: 1 });
  });
}

test("overlapping contact submits dispatch only one request and reset only after its receipt", async () => {
  const pending = deferred();
  const run = harness(() => pending.promise);
  const first = run.submit();
  const second = run.submit();
  assert.equal(run.requests.length, 1);
  assert.equal(run.button.disabled, true);
  assert.equal(run.resetCount, 0);
  pending.resolve(response(receipt()));
  await Promise.all([first, second]);
  confirmed(run);
  assert.deepEqual(run.tracks, { axon: 1, ads: 1 });
});

test("receipt for an in-flight inquiry preserves newer edits and gives the next inquiry a new identity", async () => {
  const pending = deferred();
  const run = harness((attempt) => attempt === 1 ? pending.promise : response(receipt()));
  const first = run.submit();
  run.values.set("message", "Synthetic inquiry B typed while A was pending");
  pending.resolve(response(receipt()));
  await first;
  assert.equal(run.resetCount, 0);
  assert.equal(run.values.get("message"), "Synthetic inquiry B typed while A was pending");
  assert.match(run.status.className, /\bis-success\b/);
  assert.match(run.status.textContent, /inquiry received/i);
  assert.match(run.status.textContent, /newer edits/i);
  assert.equal(run.button.disabled, false);
  assert.equal(run.timerCount, 0);
  assert.equal(run.storageCalls, 0);
  await run.submit();
  confirmed(run);
  assert.notEqual(run.requests[1].key, run.requests[0].key);
  assert.equal(JSON.parse(run.requests[1].body).message, "Synthetic inquiry B typed while A was pending");
});

test("explicit validation rejection retains form data without claiming receipt", async () => {
  const run = harness(() => response({ ok: false, code: "validation_failed", error: "Please provide a valid email address." }, 400));
  await run.submit();
  assert.doesNotMatch(run.status.className, /\bis-success\b/);
  assert.match(run.status.textContent, /valid email/i);
  assert.equal(run.resetCount, 0);
  assert.equal(run.values.get("message"), initialValues.message);
  assert.equal(run.button.disabled, false);
  assert.equal(run.timerCount, 0);
  assert.equal(run.storageCalls, 0);
  assert.deepEqual(run.tracks, { axon: 0, ads: 0 });
});
