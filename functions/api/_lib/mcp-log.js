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

export async function recordFreeBooking(env, entry) {
  const db = env?.BOOKING_DB;
  if (!db) {
    return;
  }

  try {
    await db
      .prepare(
        `
          INSERT INTO mcp_free_booking_log (ts, email, ip, booking_id)
          VALUES (?1, ?2, ?3, ?4)
        `
      )
      .bind(
        entry.ts ?? Math.floor(Date.now() / 1000),
        (entry.email || "").toLowerCase() || null,
        entry.ip || null,
        entry.bookingId || null
      )
      .run();
  } catch (error) {
    console.error("[mcp-log] failed to write mcp_free_booking_log entry", error);
  }
}

export async function countFreeBookings(env, { email, ip, sinceTs }) {
  const db = env?.BOOKING_DB;
  if (!db) {
    return { byEmail: 0, byIp: 0 };
  }

  try {
    const [emailResult, ipResult] = await Promise.all([
      email
        ? db
            .prepare(
              `SELECT COUNT(*) AS c FROM mcp_free_booking_log WHERE email = ?1 AND ts >= ?2`
            )
            .bind(email.toLowerCase(), sinceTs)
            .first()
        : Promise.resolve({ c: 0 }),
      ip
        ? db
            .prepare(
              `SELECT COUNT(*) AS c FROM mcp_free_booking_log WHERE ip = ?1 AND ts >= ?2`
            )
            .bind(ip, sinceTs)
            .first()
        : Promise.resolve({ c: 0 })
    ]);

    return {
      byEmail: Number(emailResult?.c || 0),
      byIp: Number(ipResult?.c || 0)
    };
  } catch (error) {
    console.error("[mcp-log] failed to count free bookings", error);
    return { byEmail: 0, byIp: 0 };
  }
}
