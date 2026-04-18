// JSON-RPC 2.0 transport for the AIssisted MCP server.
//
// Exposes:
//   POST /mcp        — single request or batch
//   OPTIONS /mcp     — CORS preflight
//   GET /mcp         — harmless welcome ping (useful for humans visiting the URL)
//
// Supported methods:
//   - initialize
//   - tools/list
//   - tools/call           (wraps our six tools)
//   - ping                 (returns {})

import {
  TOOLS,
  TOOL_BUCKET,
  getToolByName,
  McpToolError
} from "../api/_lib/mcp-tools.js";
import { checkRateLimit } from "../api/_lib/mcp-rate-limit.js";
import { hashParams, logMcpCall } from "../api/_lib/mcp-log.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "aissisted-consulting",
  version: "1.0.0"
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400"
};

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined && data !== null) {
    error.data = data;
  }
  return { jsonrpc: "2.0", id: id ?? null, error };
}

function getClientIp(request) {
  const cf = request.cf || {};
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    cf.ip ||
    ""
  );
}

async function handleInitialize(params) {
  return rpcResult(undefined, {
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: SERVER_INFO,
    capabilities: {
      tools: { listChanged: false }
    },
    instructions:
      "AIssisted Consulting MCP server. Use list_services first, then check_availability + start_booking for discovery consults. Paid bookings return a Stripe Checkout URL that the human must open."
  });
}

function serializeToolResult(value) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: value,
    isError: false
  };
}

function serializeToolError(message, data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message, data: data ?? null }, null, 2)
      }
    ],
    isError: true
  };
}

async function callTool(env, name, args, ctx) {
  const tool = getToolByName(name);
  if (!tool) {
    throw new McpToolError(-32601, `Unknown tool: ${name}`);
  }

  const bucket = TOOL_BUCKET[name] || "read";
  const rate = await checkRateLimit(env, { bucket, ip: ctx.ip });
  if (!rate.ok) {
    throw new McpToolError(
      -32000,
      `Rate limit exceeded for ${name}. Retry after ${rate.retryAfterSec} seconds.`,
      {
        retry_after_seconds: rate.retryAfterSec,
        limit: rate.limit,
        window_seconds: rate.windowSec
      }
    );
  }

  return tool.handler(env || {}, args || {}, ctx);
}

async function handleToolsList() {
  return rpcResult(undefined, {
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  });
}

async function handleToolsCall(env, params, ctx) {
  const name = params?.name;
  const args = params?.arguments || {};
  if (!name || typeof name !== "string") {
    throw new McpToolError(-32602, "tools/call requires 'name'.");
  }

  const startedAt = Date.now();
  try {
    const result = await callTool(env, name, args, ctx);
    const paramsHash = await hashParams({ name, args });
    await logMcpCall(env, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      method: name,
      paramsHash,
      resultStatus: "ok",
      agentName: args?.agent_metadata?.agent_name || null,
      bookingId: result?.booking_id || null
    });
    return rpcResult(undefined, serializeToolResult(result));
  } catch (error) {
    const paramsHash = await hashParams({ name, args });
    await logMcpCall(env, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      method: name,
      paramsHash,
      resultStatus: error instanceof McpToolError ? `err_${error.code}` : "err_500",
      agentName: args?.agent_metadata?.agent_name || null,
      bookingId: null
    });
    if (error instanceof McpToolError) {
      // Errors raised by tool handlers are reported as JSON-RPC errors rather
      // than as tool-call results. Per MCP spec this is the right shape when
      // the method itself failed (vs. tool returning structured failure).
      throw error;
    }
    console.error(`[mcp] tool ${name} threw`, error);
    throw new McpToolError(-32603, "Internal error while running tool.", {
      tool: name,
      duration_ms: Date.now() - startedAt
    });
  }
}

async function dispatchSingle(env, rpcRequest, ctx) {
  if (!rpcRequest || rpcRequest.jsonrpc !== "2.0") {
    return rpcError(rpcRequest?.id, -32600, "Invalid JSON-RPC 2.0 request.");
  }
  const { id, method, params } = rpcRequest;

  try {
    switch (method) {
      case "initialize": {
        const r = await handleInitialize(params);
        return { ...r, id: id ?? null };
      }
      case "notifications/initialized":
      case "initialized":
        // Notifications do not produce a response.
        return null;
      case "ping":
        return rpcResult(id, {});
      case "tools/list": {
        const r = await handleToolsList();
        return { ...r, id: id ?? null };
      }
      case "tools/call": {
        const r = await handleToolsCall(env, params, ctx);
        return { ...r, id: id ?? null };
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    if (error instanceof McpToolError) {
      return rpcError(id, error.code, error.message, error.data);
    }
    console.error("[mcp] dispatch error", error);
    return rpcError(id, -32603, "Internal error.");
  }
}

async function readJson(request) {
  const text = await request.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Request body must be valid JSON.");
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === "GET") {
    return jsonResponse({
      ok: true,
      server: SERVER_INFO,
      docs: "https://aissistedconsulting.com/docs/mcp",
      manifest: "https://aissistedconsulting.com/.well-known/mcp.json",
      message:
        "This endpoint accepts JSON-RPC 2.0 over POST. Point an MCP-capable client at this URL."
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      rpcError(null, -32600, "Only POST, GET, and OPTIONS are accepted."),
      405,
      { allow: "POST, GET, OPTIONS" }
    );
  }

  const ctx = {
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") || "",
    origin: new URL(request.url).origin
  };

  let payload;
  try {
    payload = await readJson(request);
  } catch (error) {
    return jsonResponse(rpcError(null, -32700, error.message), 400);
  }

  if (payload === null || payload === undefined) {
    return jsonResponse(rpcError(null, -32600, "Empty request body."), 400);
  }

  // Batch support (MCP clients rarely use this, but spec-compliant).
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return jsonResponse(rpcError(null, -32600, "Empty batch."), 400);
    }
    const results = await Promise.all(
      payload.map((item) => dispatchSingle(env, item, ctx))
    );
    const filtered = results.filter(Boolean);
    if (filtered.length === 0) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    return jsonResponse(filtered);
  }

  const result = await dispatchSingle(env, payload, ctx);
  if (!result) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return jsonResponse(result);
}
