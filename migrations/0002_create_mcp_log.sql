PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mcp_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  method TEXT,
  params_hash TEXT,
  result_status TEXT,
  agent_name TEXT,
  booking_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_log_ts ON mcp_log(ts);
CREATE INDEX IF NOT EXISTS idx_mcp_log_ip_method_ts ON mcp_log(ip, method, ts);
CREATE INDEX IF NOT EXISTS idx_mcp_log_agent_ts ON mcp_log(agent_name, ts);

CREATE TABLE IF NOT EXISTS mcp_rate_counters (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_rate_counters_updated ON mcp_rate_counters(updated_at);
