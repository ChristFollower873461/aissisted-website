PRAGMA foreign_keys = OFF;

-- V11.11 upgrade for the existing aissisted-booking D1 database.
-- Current production already has the base booking tables, so this migration adds
-- the new transactional safety surface without dropping existing booking data.

ALTER TABLE bookings ADD COLUMN checkout_idempotency_record_id TEXT;
ALTER TABLE bookings ADD COLUMN checkout_audit_id TEXT;

CREATE TABLE IF NOT EXISTS agent_idempotency_records (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL,
  risk TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  request_summary_json TEXT,
  status TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  response_status INTEGER,
  response_body_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  audience TEXT NOT NULL,
  audience_normalized TEXT NOT NULL,
  message TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  duplicate_fingerprint TEXT NOT NULL,
  source_page TEXT,
  consent_to_submit INTEGER NOT NULL,
  consent_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL,
  idempotency_record_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (idempotency_record_id) REFERENCES agent_idempotency_records(id)
);

CREATE TABLE IF NOT EXISTS agent_transaction_audits (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  command_id TEXT NOT NULL,
  risk TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  idempotency_record_id TEXT,
  idempotency_key_hash TEXT,
  request_fingerprint TEXT,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL,
  response_status INTEGER,
  error_code TEXT,
  safe_summary_json TEXT,
  FOREIGN KEY (idempotency_record_id) REFERENCES agent_idempotency_records(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_active_slot
  ON bookings(slot_id)
  WHERE booking_status IN ('hold', 'confirmed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_checkout_session
  ON bookings(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_window
  ON bookings(selected_time_window_start, selected_time_window_end);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking
  ON booking_events(booking_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_idempotency_command_key
  ON agent_idempotency_records(command_id, idempotency_key_hash);

CREATE INDEX IF NOT EXISTS idx_agent_idempotency_target
  ON agent_idempotency_records(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_agent_idempotency_expires
  ON agent_idempotency_records(expires_at);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email_created
  ON contact_inquiries(email_normalized, created_at);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_duplicate
  ON contact_inquiries(duplicate_fingerprint, created_at);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_idempotency
  ON contact_inquiries(idempotency_record_id);

CREATE INDEX IF NOT EXISTS idx_agent_audits_command_created
  ON agent_transaction_audits(command_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_audits_target
  ON agent_transaction_audits(target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_agent_audits_idempotency
  ON agent_transaction_audits(idempotency_record_id);

PRAGMA foreign_keys = ON;
