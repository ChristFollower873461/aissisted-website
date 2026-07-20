PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS grail_workspaces (
  id TEXT PRIMARY KEY,
  access_code_hash TEXT NOT NULL UNIQUE,
  access_code_hint TEXT NOT NULL,
  customer_email_normalized TEXT NOT NULL,
  customer_name TEXT,
  company TEXT,
  plan TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  state_json TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE TABLE IF NOT EXISTS grail_workspace_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES grail_workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_grail_workspaces_email
  ON grail_workspaces(customer_email_normalized, created_at);

CREATE INDEX IF NOT EXISTS idx_grail_workspaces_subscription
  ON grail_workspaces(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_grail_workspace_events_workspace
  ON grail_workspace_events(workspace_id, created_at);
