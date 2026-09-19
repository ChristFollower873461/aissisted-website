import test from "node:test";
import assert from "node:assert/strict";
import { relayWebsiteIntakeToAicCrm } from "../functions/api/_lib/aic-crm.js";

const env = {
  AIC_CRM_INTAKE_URL: "https://crm.example.test/intake/website",
  AIC_CRM_INTAKE_TOKEN: "synthetic-relay-token"
};
const payload = { sourceEventId: "synthetic-contact-response-test" };

function mockResponse(t, body, options = {}) {
  return t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, env.AIC_CRM_INTAKE_URL);
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), payload);
    return new Response(body, { status: 200, ...options });
  });
}

const invalidAcknowledgements = [
  ["HTML proxy page", "<html>Temporarily unavailable</html>"],
  ["malformed JSON", '{"ok":true,'],
  ["empty body", ""],
  ["JSON null", "null"],
  ["JSON array", "[]"],
  ["missing acknowledgement", JSON.stringify({ submission: { id: "intake_synthetic" } })],
  ["false acknowledgement", JSON.stringify({ ok: false, submission: { id: "intake_synthetic" } })],
  ["string acknowledgement", JSON.stringify({ ok: "true", submission: { id: "intake_synthetic" } })],
  ["numeric acknowledgement", JSON.stringify({ ok: 1, submission: { id: "intake_synthetic" } })],
  ["null acknowledgement", JSON.stringify({ ok: null, submission: { id: "intake_synthetic" } })],
  ["missing submission", JSON.stringify({ ok: true })],
  ...[
    ["missing ID", undefined],
    ["null ID", null],
    ["numeric ID", 123],
    ["boolean ID", true],
    ["array ID", ["intake_synthetic"]],
    ["object ID", { value: "intake_synthetic" }],
    ["empty ID", ""],
    ["whitespace ID", " \t\n "],
    ["overlong ID", "i".repeat(201)]
  ].map(([name, id]) => [name, JSON.stringify({ ok: true, submission: { id } })])
];

for (const [name, body] of invalidAcknowledgements) {
  test(`CRM relay rejects HTTP 200 with ${name}`, async (t) => {
    const fetchMock = mockResponse(t, body);
    const result = await relayWebsiteIntakeToAicCrm(env, payload);
    assert.equal(result.ok, false, "an HTTP success must not acknowledge an unconfirmed CRM intake");
    assert.equal(result.status, 200, "retain the actual response status for delivery retry decisions");
    assert.equal(fetchMock.mock.callCount(), 1);
  });
}

for (const id of ["intake_synthetic", "  intake_synthetic  ", "i".repeat(200)]) {
  test(`CRM relay accepts an explicit acknowledgement with ${id.length}-character ID`, async (t) => {
    mockResponse(t, JSON.stringify({ ok: true, submission: { id } }));
    const result = await relayWebsiteIntakeToAicCrm(env, payload);
    assert.equal(result.ok, true);
    assert.equal(result.submissionId, id.trim());
    assert.equal(result.status, 200);
  });
}

for (const status of [201, 202, 204, 409, 503]) {
  test(`CRM relay does not acknowledge HTTP ${status}`, async (t) => {
    mockResponse(t, status === 204 ? null : JSON.stringify({
      ok: true, submission: { id: "intake_synthetic" }
    }), { status });
    const result = await relayWebsiteIntakeToAicCrm(env, payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
  });
}

const now = Date.parse("2026-09-04T12:00:00Z");
for (const [name, header, expected] of [
  ["seconds", "120", 120_000],
  ["zero seconds", "0", 0],
  ["future HTTP date", new Date(now + 95_000).toUTCString(), 95_000],
  ["past HTTP date", new Date(now - 60_000).toUTCString(), 0],
  ["bounded seconds", "86401", 86_400_000],
  ["bounded HTTP date", new Date(now + 2 * 86_400_000).toUTCString(), 86_400_000],
  ["invalid header", "not-a-retry-time", 0],
  ["absent header", null, 0]
]) {
  test(`CRM relay preserves Retry-After guidance: ${name}`, async (t) => {
    t.mock.timers.enable({ apis: ["Date"], now });
    mockResponse(t, JSON.stringify({ ok: false, error: "Synthetic CRM unavailability" }), {
      status: 503,
      headers: header === null ? {} : { "retry-after": header }
    });
    const result = await relayWebsiteIntakeToAicCrm(env, payload);
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.equal(result.error, "Synthetic CRM unavailability");
    assert.equal(result.retryAfterMs, expected);
  });
}

test("CRM relay times out when headers arrive but the response body stalls", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  let bodyController;
  let bodyRequested = false;
  let response;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    signal = init.signal;
    response = new Response(new ReadableStream({
      start(controller) {
        bodyController = controller;
        signal.addEventListener("abort", () => {
          controller.error(new DOMException("Synthetic response body aborted", "AbortError"));
        }, { once: true });
      },
      pull() { bodyRequested = true; }
    }));
    return response;
  });
  let settled = false;
  const pending = relayWebsiteIntakeToAicCrm(env, payload).then((result) => {
    settled = true;
    return result;
  });
  try {
    // Let fetch return its headers and response.text() begin reading the real stream.
    for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
    assert.equal(bodyRequested, true);
    assert.equal(response.body.locked, true, "response.text() must have started consuming the body");
    assert.equal(settled, false);
    t.mock.timers.tick(2999);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    assert.equal(signal.aborted, true, "the deadline must cover body consumption after fetch resolves");
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.match(result.error, /response body aborted/);
  } finally {
    // Also settle the pre-fix helper, whose timer is cleared on receipt of headers.
    if (!signal.aborted) bodyController.error(new Error("Synthetic test cleanup"));
    await pending;
  }
});

test("CRM relay clears its timeout after a complete acknowledgement", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    signal = init.signal;
    return Response.json({ ok: true, submission: { id: "intake_synthetic" } });
  });
  const result = await relayWebsiteIntakeToAicCrm(env, payload);
  assert.equal(result.ok, true);
  t.mock.timers.tick(3000);
  assert.equal(signal.aborted, false, "completed delivery must not retain an abort timer");
});
