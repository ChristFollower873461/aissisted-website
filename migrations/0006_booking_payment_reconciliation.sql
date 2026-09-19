PRAGMA foreign_keys = ON;

-- Additive. No historical booking/payment facts or customer records are inferred.
CREATE TABLE booking_payment_state (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  source_environment TEXT NOT NULL CHECK(source_environment IN ('production','staging')),
  provider_account_id TEXT NOT NULL,
  livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
  checkout_session_id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL CHECK(revision > 0),
  verified_at TEXT,
  envelope_json TEXT NOT NULL CHECK(json_valid(envelope_json)),
  facts_json TEXT NOT NULL CHECK(json_valid(facts_json)),
  succeeded_refund_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(succeeded_refund_ids_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','needs_attention')),
  failures INTEGER NOT NULL DEFAULT 0 CHECK(failures >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK((state='processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
     OR (state!='processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE TABLE booking_provider_receipts (
  id TEXT PRIMARY KEY,
  provider_account_id TEXT NOT NULL,
  livemode INTEGER NOT NULL CHECK(livemode IN (0,1)),
  provider_event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK(json_valid(event_json)),
  booking_id TEXT REFERENCES bookings(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','delivered','needs_attention')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_account_id,livemode,provider_event_id),
  CHECK((state='processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
     OR (state!='processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE TABLE booking_crm_delivery (
  event_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES booking_payment_state(booking_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK(revision > 0),
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','delivered','needs_attention')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT NOT NULL,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(booking_id,revision),
  CHECK((state='processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
     OR (state!='processing' AND lease_token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX booking_payment_due ON booking_payment_state(state,next_attempt_at);
CREATE INDEX booking_provider_due ON booking_provider_receipts(state,next_attempt_at);
CREATE INDEX booking_crm_due ON booking_crm_delivery(state,next_attempt_at);
CREATE TRIGGER booking_payment_identity_immutable BEFORE UPDATE ON booking_payment_state
WHEN NEW.booking_id != OLD.booking_id OR NEW.source_environment != OLD.source_environment
 OR NEW.provider_account_id != OLD.provider_account_id OR NEW.livemode != OLD.livemode
 OR NEW.checkout_session_id != OLD.checkout_session_id OR NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT,'booking payment identity is immutable'); END;
CREATE TRIGGER booking_receipt_immutable BEFORE UPDATE ON booking_provider_receipts
WHEN NEW.id != OLD.id OR NEW.provider_account_id != OLD.provider_account_id
 OR NEW.livemode != OLD.livemode OR NEW.provider_event_id != OLD.provider_event_id
 OR NEW.payload_hash != OLD.payload_hash OR NEW.event_json != OLD.event_json OR NEW.created_at != OLD.created_at
 OR (OLD.booking_id IS NOT NULL AND NEW.booking_id IS NOT OLD.booking_id)
BEGIN SELECT RAISE(ABORT,'provider receipt is immutable'); END;
CREATE TRIGGER booking_crm_payload_immutable BEFORE UPDATE ON booking_crm_delivery
WHEN NEW.event_id != OLD.event_id OR NEW.booking_id != OLD.booking_id OR NEW.revision != OLD.revision
 OR NEW.payload_hash != OLD.payload_hash OR NEW.payload_json != OLD.payload_json OR NEW.created_at != OLD.created_at
BEGIN SELECT RAISE(ABORT,'booking delivery payload is immutable'); END;
