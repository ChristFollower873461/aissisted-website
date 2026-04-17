// Sliding-ish rate limits implemented as fixed windows in D1.
// Keyed by (method-or-bucket, ip, window-seconds). Lightweight enough for v1.
//
// We deliberately keep the math on the application side and store a
// (window_start, count) row per bucket. Concurrent callers can race here, but
// the consequences are bounded (a handful of extra allowed requests) and do
// not affect payment correctness.

const DAY_SECONDS = 24 * 60 * 60;

export const RATE_LIMITS = {
  read: [
    { windowSec: 60, max: 20 },
    { windowSec: 3600, max: 300 }
  ],
  write: [
    { windowSec: 60, max: 5 },
    { windowSec: 3600, max: 20 }
  ]
};

export const FREE_BOOKING_LIMITS = {
  perEmailPerDay: 1,
  perIpPerDay: 3,
  turnstileThresholdInWindow: 2,
  turnstileWindowSec: 600
};

function bucketKey({ bucket, ip, windowStart }) {
  return `${bucket}|${ip}|${windowStart}`;
}

async function incrementBucket(db, key, windowStart, nowSec) {
  // Use INSERT ... ON CONFLICT to keep this single round-trip when possible.
  // D1 supports returning via SELECT after the upsert.
  await db
    .prepare(
      `
        INSERT INTO mcp_rate_counters (key, window_start, count, updated_at)
        VALUES (?1, ?2, 1, ?3)
        ON CONFLICT(key) DO UPDATE SET
          count = mcp_rate_counters.count + 1,
          updated_at = excluded.updated_at
      `
    )
    .bind(key, windowStart, nowSec)
    .run();

  const row = await db
    .prepare(`SELECT count FROM mcp_rate_counters WHERE key = ?1`)
    .bind(key)
    .first();
  return Number(row?.count || 0);
}

/**
 * Check rate limits for a bucket. Returns { ok, retryAfterSec, limit, count }.
 * Passing no DB short-circuits to allow (dev/test without D1 binding still works).
 */
export async function checkRateLimit(env, { bucket, ip }) {
  const db = env?.BOOKING_DB;
  const rules = RATE_LIMITS[bucket];
  if (!rules || !ip) {
    return { ok: true };
  }
  if (!db) {
    return { ok: true };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  for (const rule of rules) {
    const windowStart = Math.floor(nowSec / rule.windowSec) * rule.windowSec;
    const key = bucketKey({ bucket, ip, windowStart });
    let count;
    try {
      count = await incrementBucket(db, key, windowStart, nowSec);
    } catch (error) {
      console.error("[mcp-rate-limit] failed to increment bucket", error);
      return { ok: true };
    }

    if (count > rule.max) {
      const retryAfterSec = Math.max(
        1,
        windowStart + rule.windowSec - nowSec
      );
      return {
        ok: false,
        retryAfterSec,
        limit: rule.max,
        count,
        windowSec: rule.windowSec
      };
    }
  }

  return { ok: true };
}

/**
 * Best-effort cleanup. Call occasionally (e.g. from free-booking path)
 * to keep the counter table from growing without bound.
 */
export async function cleanupRateCounters(env, { retainSec = DAY_SECONDS } = {}) {
  const db = env?.BOOKING_DB;
  if (!db) {
    return;
  }
  const cutoff = Math.floor(Date.now() / 1000) - retainSec;
  try {
    await db
      .prepare(`DELETE FROM mcp_rate_counters WHERE updated_at < ?1`)
      .bind(cutoff)
      .run();
  } catch (error) {
    console.error("[mcp-rate-limit] cleanup failed", error);
  }
}
