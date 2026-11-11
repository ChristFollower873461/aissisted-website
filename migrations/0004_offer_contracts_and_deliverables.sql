PRAGMA foreign_keys = ON;

-- Additive v2 contract and fulfillment layer. Existing bookings remain
-- contractless legacy records and are never backfilled by this migration.

CREATE TABLE IF NOT EXISTS booking_contracts (
  booking_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  offer_version INTEGER NOT NULL CHECK (offer_version > 0),
  terms_version TEXT NOT NULL,
  terms_sha256 TEXT NOT NULL CHECK (length(terms_sha256) = 64),
  terms_snapshot_json TEXT NOT NULL CHECK (json_valid(terms_snapshot_json)),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = lower(currency)),
  stripe_product_ref TEXT NOT NULL,
  stripe_price_ref TEXT NOT NULL,
  payment_method_policy TEXT NOT NULL,
  stripe_payment_method_configuration_ref TEXT,
  stripe_customer_copy_json TEXT NOT NULL CHECK (json_valid(stripe_customer_copy_json)),
  implementation_credit_enabled INTEGER NOT NULL CHECK (implementation_credit_enabled IN (0, 1)),
  implementation_credit_terms_json TEXT,
  delivery_calendar_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (
    (implementation_credit_enabled = 0 AND implementation_credit_terms_json IS NULL)
    OR
    (implementation_credit_enabled = 1 AND implementation_credit_terms_json IS NOT NULL AND json_valid(implementation_credit_terms_json))
  ),
  CHECK (
    payment_method_policy != 'synchronous_card_only'
    OR length(stripe_payment_method_configuration_ref) > 0
  ),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS booking_deliverables (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'awaiting_session',
    'pending',
    'delivered',
    'late',
    'refund_requested',
    'refunded',
    'canceled'
  )),
  expected_session_end_at TEXT NOT NULL,
  session_completed_at TEXT,
  due_at TEXT,
  delivered_at TEXT,
  artifact_ref TEXT,
  artifact_sha256 TEXT CHECK (artifact_sha256 IS NULL OR length(artifact_sha256) = 64),
  late_detected_at TEXT,
  remedy_status TEXT CHECK (remedy_status IS NULL OR remedy_status IN (
    'none',
    'awaiting_customer_choice',
    'revised_date_selected',
    'refund_requested',
    'refunded',
    'closed'
  )),
  refund_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (booking_id, deliverable_type),
  CHECK (session_completed_at IS NOT NULL OR due_at IS NULL),
  CHECK (status != 'delivered' OR delivered_at IS NOT NULL),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS booking_contract_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'contract_created',
    'contract_validated',
    'contract_mismatch_manual_review',
    'session_completed',
    'session_rescheduled',
    'session_no_show',
    'session_canceled',
    'session_reconciliation_overdue',
    'deliverable_due_set',
    'deliverable_deadline_warning',
    'deliverable_delivered',
    'deliverable_late',
    'remedy_selected',
    'refund_requested',
    'refund_reconciled',
    'correction_requested',
    'correction_accepted',
    'correction_delivered',
    'correction_rejected_duplicate_round',
    'correction_rejected_out_of_window',
    'correction_rejected_out_of_scope'
  )),
  prior_state TEXT,
  new_state TEXT,
  actor_ref TEXT NOT NULL,
  event_at TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  round_number INTEGER CHECK (round_number IS NULL OR round_number > 0),
  safe_metadata_json TEXT CHECK (safe_metadata_json IS NULL OR json_valid(safe_metadata_json)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS checkout_intents (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  stripe_idempotency_key TEXT NOT NULL UNIQUE,
  release_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  offer_version INTEGER NOT NULL CHECK (offer_version > 0),
  terms_version TEXT NOT NULL,
  terms_sha256 TEXT NOT NULL CHECK (length(terms_sha256) = 64),
  state TEXT NOT NULL CHECK (state IN (
    'prepared',
    'session_created',
    'attached',
    'expired',
    'failed',
    'manual_review'
  )),
  stripe_session_ref TEXT UNIQUE,
  last_safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  effect_type TEXT NOT NULL CHECK (effect_type IN (
    'calendar',
    'customer_notification',
    'internal_notification'
  )),
  dedupe_key TEXT NOT NULL UNIQUE,
  safe_payload_json TEXT CHECK (safe_payload_json IS NULL OR json_valid(safe_payload_json)),
  state TEXT NOT NULL CHECK (state IN ('pending', 'processing', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  last_safe_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_booking_contracts_offer
  ON booking_contracts(offer_id, offer_version, accepted_at);

CREATE INDEX IF NOT EXISTS idx_booking_contracts_terms
  ON booking_contracts(terms_version, terms_sha256);

CREATE INDEX IF NOT EXISTS idx_booking_contracts_stripe_price
  ON booking_contracts(stripe_price_ref);

CREATE INDEX IF NOT EXISTS idx_booking_deliverables_status_due
  ON booking_deliverables(status, due_at);

CREATE INDEX IF NOT EXISTS idx_booking_deliverables_expected_end
  ON booking_deliverables(status, expected_session_end_at);

CREATE INDEX IF NOT EXISTS idx_booking_contract_events_booking_time
  ON booking_contract_events(booking_id, event_at);

CREATE INDEX IF NOT EXISTS idx_checkout_intents_booking_state
  ON checkout_intents(booking_id, state, updated_at);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_state_next
  ON integration_outbox(state, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_booking
  ON integration_outbox(booking_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_booking_contracts_immutable_update
BEFORE UPDATE ON booking_contracts
BEGIN
  SELECT RAISE(ABORT, 'booking_contracts are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_booking_contracts_immutable_delete
BEFORE DELETE ON booking_contracts
BEGIN
  SELECT RAISE(ABORT, 'booking_contracts are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_booking_contract_events_append_only_update
BEFORE UPDATE ON booking_contract_events
BEGIN
  SELECT RAISE(ABORT, 'booking_contract_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_booking_contract_events_append_only_delete
BEFORE DELETE ON booking_contract_events
BEGIN
  SELECT RAISE(ABORT, 'booking_contract_events are append-only');
END;
