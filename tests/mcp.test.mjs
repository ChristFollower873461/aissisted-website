import test from "node:test";
import assert from "node:assert/strict";

import {
  SERVICES,
  TOOL_NAMES,
  TOOL_BUCKET,
  getToolByName,
  listServicesTool,
  getBusinessInfoTool,
  getQuoteTool,
  checkAvailabilityTool,
  startBookingTool,
  getBookingStatusTool,
  McpToolError
} from "../functions/api/_lib/mcp-tools.js";
import { onRequest as mcpEndpoint } from "../functions/mcp/index.js";
import { onRequest as manifestEndpoint } from "../functions/.well-known/mcp.json.js";

function resetMemoryStore() {
  delete globalThis.__aissistedBookingStore;
}

function freezeTime(isoString) {
  const original = Date.now;
  const fixed = new Date(isoString).getTime();
  Date.now = () => fixed;
  return () => {
    Date.now = original;
  };
}

// Compute a date range ~4 days out to ~14 days out, using the real wall clock
// (the underlying availability helpers call `new Date()` directly).
function liveDateRange() {
  const now = new Date();
  const from = new Date(now.getTime() + 4 * 86400000);
  const to = new Date(now.getTime() + 14 * 86400000);
  const fmt = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { from: fmt(from), to: fmt(to) };
}

function makeRequest(body, { method = "POST", headers = {} } = {}) {
  return new Request("https://aissistedconsulting.com/mcp", {
    method,
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": "198.51.100.42",
      "user-agent": "test-agent/1.0",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function invoke(rpc) {
  const response = await mcpEndpoint({
    request: makeRequest(rpc),
    env: {}
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

// -------- Static / lightweight tools --------

test("tool registry exposes exactly the six spec tools", () => {
  assert.deepEqual(new Set(TOOL_NAMES), new Set([
    "list_services",
    "get_business_info",
    "get_quote",
    "check_availability",
    "start_booking",
    "get_booking_status"
  ]));
  for (const name of TOOL_NAMES) {
    assert.ok(TOOL_BUCKET[name], `bucket defined for ${name}`);
  }
});

test("list_services marks only paid-consult as bookable_via_mcp", async () => {
  const result = await listServicesTool.handler({});
  const byId = Object.fromEntries(result.services.map((s) => [s.id, s]));

  // Everything the business offers is visible to agents...
  assert.ok(byId["ai-hardware-setup"]);
  assert.equal(byId["ai-hardware-setup"].price_usd, 1500);
  assert.equal(byId["ai-hardware-setup"].bookable_via_mcp, false);

  assert.ok(byId["monthly-service"]);
  assert.equal(byId["monthly-service"].price_usd, 500);
  assert.equal(byId["monthly-service"].bookable_via_mcp, false);

  assert.ok(byId["discovery-consult"]);
  assert.equal(byId["discovery-consult"].price_usd, 0);
  // ...but the free conversation is NOT bookable by agents.
  assert.equal(byId["discovery-consult"].bookable_via_mcp, false);
  assert.match(byId["discovery-consult"].booking_url || "", /contact/);

  // Only the paid consult is bookable.
  assert.ok(byId["paid-consult"]);
  assert.equal(byId["paid-consult"].price_usd, 105);
  assert.equal(byId["paid-consult"].bookable_via_mcp, true);

  const bookable = result.services.filter((s) => s.bookable_via_mcp);
  assert.deepEqual(
    bookable.map((s) => s.id),
    ["paid-consult"],
    "exactly one service is bookable via MCP"
  );
});

test("get_business_info returns Ocala/Florida and founder credentials", async () => {
  const info = await getBusinessInfoTool.handler({});
  assert.equal(info.location.city, "Ocala");
  assert.equal(info.location.state, "Florida");
  assert.ok(info.founder.credentials.includes("CAIC"));
  assert.ok(info.founder.credentials.includes("CAIS"));
  assert.match(info.contact.email, /aissistedconsulting\.com$/);
});

test("get_quote computes 7% Florida tax and 7-day validity", async () => {
  const restore = freezeTime("2026-04-17T12:00:00.000Z");
  try {
    const quote = await getQuoteTool.handler({}, { service_id: "paid-consult" });
    assert.equal(quote.base_price_usd, 105);
    assert.equal(quote.tax_usd, 7.35);
    assert.equal(quote.total_usd, 112.35);
    assert.equal(quote.currency, "usd");
    const validUntilMs = Date.parse(quote.valid_until);
    const expected = Date.parse("2026-04-17T12:00:00.000Z") + 7 * 86400000;
    assert.equal(validUntilMs, expected);
  } finally {
    restore();
  }
});

test("get_quote rejects an unknown service", async () => {
  await assert.rejects(
    () => getQuoteTool.handler({}, { service_id: "nope" }),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

// -------- check_availability --------

test("check_availability rejects free discovery consult", async () => {
  await assert.rejects(
    () =>
      checkAvailabilityTool.handler(
        {},
        {
          date_from: "2026-04-20",
          date_to: "2026-04-27",
          service_id: "discovery-consult"
        }
      ),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

test("check_availability rejects hardware", async () => {
  await assert.rejects(
    () =>
      checkAvailabilityTool.handler(
        {},
        {
          date_from: "2026-04-20",
          date_to: "2026-04-27",
          service_id: "ai-hardware-setup"
        }
      ),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

test("check_availability returns slots within the requested window for paid-consult", async () => {
  resetMemoryStore();
  const { from, to } = liveDateRange();
  const result = await checkAvailabilityTool.handler(
    {},
    {
      date_from: from,
      date_to: to,
      service_id: "paid-consult"
    }
  );
  assert.equal(result.timezone, "America/New_York");
  assert.equal(result.service_id, "paid-consult");
  assert.ok(result.slots.length > 0, `expected at least one slot in ${from}..${to}`);

  const windowStartMs = Date.parse(`${from}T00:00:00-04:00`);
  const windowEndMs = Date.parse(`${to}T23:59:59-04:00`);
  for (const slot of result.slots) {
    const startMs = Date.parse(slot.starts_at);
    assert.ok(startMs >= windowStartMs && startMs <= windowEndMs,
      `slot ${slot.starts_at} fell outside ${from}..${to}`);
    assert.match(slot.slot_id, /\|/);
    assert.ok(slot.label);
  }
});

// -------- start_booking --------

async function pickFirstPaidSlot(env) {
  const { from, to } = liveDateRange();
  const availability = await checkAvailabilityTool.handler(env, {
    date_from: from,
    date_to: to,
    service_id: "paid-consult"
  });
  assert.ok(availability.slots.length, `need at least one available slot in ${from}..${to}`);
  return availability.slots[0];
}

test("start_booking refuses discovery-consult (free) even with valid slot", async () => {
  resetMemoryStore();
  const env = {};
  const slot = await pickFirstPaidSlot(env);
  await assert.rejects(
    () =>
      startBookingTool.handler(env, {
        service_id: "discovery-consult",
        slot_id: slot.slot_id,
        contact: { name: "Freeloader", email: "free@example.com" }
      }, { ip: "198.51.100.60" }),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

test("start_booking refuses ai-hardware-setup", async () => {
  await assert.rejects(
    () =>
      startBookingTool.handler({}, {
        service_id: "ai-hardware-setup",
        slot_id: "nonsense|slot",
        contact: { name: "X", email: "x@example.com" }
      }, { ip: "198.51.100.50" }),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

test("start_booking refuses monthly-service", async () => {
  await assert.rejects(
    () =>
      startBookingTool.handler({}, {
        service_id: "monthly-service",
        slot_id: "nonsense|slot",
        contact: { name: "X", email: "x@example.com" }
      }, { ip: "198.51.100.51" }),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

test("start_booking for paid-consult without Stripe configured returns -32603", async () => {
  resetMemoryStore();
  const env = {}; // no STRIPE_SECRET_KEY -> isStripeConfigured=false
  const slot = await pickFirstPaidSlot(env);
  await assert.rejects(
    () =>
      startBookingTool.handler(env, {
        service_id: "paid-consult",
        slot_id: slot.slot_id,
        contact: {
          name: "Paid Tester",
          email: "paid-test@example.com"
        },
        agent_metadata: {
          agent_name: "claude-desktop",
          agent_version: "4.7"
        }
      }, { ip: "198.51.100.52" }),
    (err) => err instanceof McpToolError && err.code === -32603
  );
});

test("start_booking returns slot-unavailable error for stale slot id", async () => {
  resetMemoryStore();
  await assert.rejects(
    () =>
      startBookingTool.handler({}, {
        service_id: "paid-consult",
        slot_id: "2020-01-01T00:00:00.000Z|2020-01-01T00:30:00.000Z",
        contact: { name: "A", email: "a@example.com" }
      }, { ip: "198.51.100.53" }),
    (err) => err instanceof McpToolError && err.code === -32001
  );
});

test("start_booking validates contact fields", async () => {
  resetMemoryStore();
  const env = {};
  const slot = await pickFirstPaidSlot(env);
  await assert.rejects(
    () =>
      startBookingTool.handler(env, {
        service_id: "paid-consult",
        slot_id: slot.slot_id,
        contact: { name: "No Email" } // email missing
      }, { ip: "198.51.100.54" }),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

// -------- get_booking_status --------

test("get_booking_status errors cleanly on unknown id", async () => {
  await assert.rejects(
    () => getBookingStatusTool.handler({}, { booking_id: "book_missing" }),
    (err) => err instanceof McpToolError && err.code === -32602
  );
});

// -------- JSON-RPC transport --------

test("POST /mcp initialize returns server info + protocol version", async () => {
  const { status, body } = await invoke({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {}
  });
  assert.equal(status, 200);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.serverInfo.name, "aissisted-consulting");
  assert.match(body.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(body.result.capabilities.tools);
});

test("POST /mcp tools/list returns all six tools with schemas", async () => {
  const { body } = await invoke({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });
  const names = body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "check_availability",
    "get_booking_status",
    "get_business_info",
    "get_quote",
    "list_services",
    "start_booking"
  ]);
  for (const tool of body.result.tools) {
    assert.ok(tool.description, `${tool.name} has description`);
    assert.equal(tool.inputSchema.type, "object");
  }
});

test("POST /mcp tools/call list_services returns structuredContent", async () => {
  const { body } = await invoke({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "list_services", arguments: {} }
  });
  assert.equal(body.result.isError, false);
  assert.ok(Array.isArray(body.result.content));
  assert.equal(body.result.structuredContent.services.length, SERVICES.length);
});

test("POST /mcp tools/call unknown tool returns JSON-RPC -32601", async () => {
  const { body } = await invoke({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "does_not_exist", arguments: {} }
  });
  assert.equal(body.error.code, -32601);
});

test("POST /mcp tools/call with invalid arguments returns JSON-RPC -32602", async () => {
  const { body } = await invoke({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "get_quote",
      arguments: { service_id: "nope" }
    }
  });
  assert.equal(body.error.code, -32602);
});

test("unknown top-level method returns -32601", async () => {
  const { body } = await invoke({
    jsonrpc: "2.0",
    id: 6,
    method: "not/a/method"
  });
  assert.equal(body.error.code, -32601);
});

test("GET /mcp returns a human-friendly welcome", async () => {
  const response = await mcpEndpoint({
    request: new Request("https://aissistedconsulting.com/mcp", { method: "GET" }),
    env: {}
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.server.name, "aissisted-consulting");
});

test("OPTIONS /mcp returns CORS preflight", async () => {
  const response = await mcpEndpoint({
    request: new Request("https://aissistedconsulting.com/mcp", { method: "OPTIONS" }),
    env: {}
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("POST /mcp batch request is handled", async () => {
  const response = await mcpEndpoint({
    request: makeRequest([
      { jsonrpc: "2.0", id: "a", method: "ping" },
      { jsonrpc: "2.0", id: "b", method: "tools/list" }
    ]),
    env: {}
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 2);
  const a = body.find((r) => r.id === "a");
  const b = body.find((r) => r.id === "b");
  assert.deepEqual(a.result, {});
  assert.equal(b.result.tools.length, 6);
});

test("malformed JSON returns -32700", async () => {
  const response = await mcpEndpoint({
    request: new Request("https://aissistedconsulting.com/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json"
    }),
    env: {}
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, -32700);
});

// -------- Manifest --------

test("/.well-known/mcp.json returns a valid manifest", async () => {
  const response = await manifestEndpoint({});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.name, "aissisted-consulting");
  assert.equal(body.endpoint, "https://aissistedconsulting.com/mcp");
  assert.ok(body.tools.includes("list_services"));
  assert.ok(body.auth.human_approval_required.includes("start_booking"));
  assert.deepEqual(body.bookable_services, ["paid-consult"]);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("getToolByName returns null for unknown name", () => {
  assert.equal(getToolByName("ghost"), null);
});
