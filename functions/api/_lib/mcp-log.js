// MCP call logging + free-booking ledger for abuse controls.
// All writes are best-effort: a logging failure must never break a tool call.

async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input || ""));
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashParams(params) {
  try {
    return await sha256Hex(JSON.stringify(params ?? {}));
  } catch {
    return "";
  }
}

export async function logMcpCall(env, entry) {
  const db = env?.BOOKING_DB;
  if (!db) {
    return;
  }

  try {
    await db
      .prepare(
        `
          INSERT INTO mcp_log (
            ts, ip, user_agent, method, params_hash,
            result_status, agent_name, booking_id
          )
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        `
      )
      .bind(
        entry.ts ?? Math.floor(Date.now() / 1000),
        entry.ip || null,
        entry.userAgent || null,
        entry.method || null,
        entry.paramsHash || null,
        entry.resultStatus || null,
        entry.agentName || null,
        entry.bookingId || null
      )
      .run();
  } catch (error) {
    console.error("[mcp-log] failed to write mcp_log entry", error);
  }
}

