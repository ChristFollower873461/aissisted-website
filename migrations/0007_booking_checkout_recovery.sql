PRAGMA foreign_keys = ON;

-- Prepared before the first Session request. No secret or raw provider payload.
CREATE TABLE booking_checkout_commands (
  idempotency_record_id TEXT PRIMARY KEY REFERENCES agent_idempotency_records(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  request_fingerprint TEXT NOT NULL,
  stripe_idempotency_key TEXT NOT NULL UNIQUE,
  stripe_request_body TEXT NOT NULL,
  stripe_api_version TEXT NOT NULL,
  scope_json TEXT NOT NULL CHECK(json_valid(scope_json)),
  context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  session_json TEXT CHECK(session_json IS NULL OR json_valid(session_json)),
  state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','processing','attached','needs_attention')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_expires_at TEXT,
  retry_before TEXT NOT NULL,
  last_safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((state='processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state!='processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE TRIGGER booking_checkout_command_immutable BEFORE UPDATE ON booking_checkout_commands
WHEN NEW.idempotency_record_id != OLD.idempotency_record_id OR NEW.booking_id != OLD.booking_id
 OR NEW.request_fingerprint != OLD.request_fingerprint OR NEW.stripe_idempotency_key != OLD.stripe_idempotency_key
 OR NEW.stripe_request_body != OLD.stripe_request_body OR NEW.stripe_api_version != OLD.stripe_api_version
 OR NEW.scope_json != OLD.scope_json OR NEW.context_json != OLD.context_json
 OR NEW.retry_before != OLD.retry_before OR NEW.created_at != OLD.created_at
 OR (OLD.session_json IS NOT NULL AND NEW.session_json IS NOT OLD.session_json)
BEGIN SELECT RAISE(ABORT,'checkout recovery command is immutable'); END;
