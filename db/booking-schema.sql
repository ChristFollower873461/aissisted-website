PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  company TEXT,
  intake_json TEXT,
  stripe_customer_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  selected_time_window_start TEXT NOT NULL,
  selected_time_window_end TEXT NOT NULL,
  selected_time_zone TEXT NOT NULL,
  booking_status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  reservation_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_reference TEXT,
  confirmed_at TEXT,
  canceled_at TEXT,
  temporary_hold_expires_at TEXT,
  checkout_started_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_accepted_at TEXT NOT NULL,
  intake_summary TEXT,
  checkout_idempotency_record_id TEXT,
  checkout_audit_id TEXT,
  FOREIGN KEY (prospect_id) REFERENCES prospects(id)
);

CREATE TABLE IF NOT EXISTS deposit_credits (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  prospect_id TEXT NOT NULL,
  deposit_credit_available INTEGER NOT NULL DEFAULT 0,
  deposit_credit_amount INTEGER NOT NULL,
  deposit_credit_applied INTEGER NOT NULL DEFAULT 0,
  deposit_credit_applied_at TEXT,
  deposit_credit_applied_invoice_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (prospect_id) REFERENCES prospects(id)
);

CREATE TABLE IF NOT EXISTS booking_events (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

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

-- Versioned v2 contract and fulfillment layer. Keep this in sync with
-- migrations/0004_offer_contracts_and_deliverables.sql.

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
  status TEXT NOT NULL CHECK (status IN ('awaiting_session', 'pending', 'delivered', 'late', 'refund_requested', 'refunded', 'canceled')),
  expected_session_end_at TEXT NOT NULL,
  session_completed_at TEXT,
  due_at TEXT,
  delivered_at TEXT,
  artifact_ref TEXT,
  artifact_sha256 TEXT CHECK (artifact_sha256 IS NULL OR length(artifact_sha256) = 64),
  late_detected_at TEXT,
  remedy_status TEXT CHECK (remedy_status IS NULL OR remedy_status IN ('none', 'awaiting_customer_choice', 'revised_date_selected', 'refund_requested', 'refunded', 'closed')),
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
  event_type TEXT NOT NULL CHECK (event_type IN ('contract_created', 'contract_validated', 'contract_mismatch_manual_review', 'session_completed', 'session_rescheduled', 'session_no_show', 'session_canceled', 'session_reconciliation_overdue', 'deliverable_due_set', 'deliverable_deadline_warning', 'deliverable_delivered', 'deliverable_late', 'remedy_selected', 'refund_requested', 'refund_reconciled', 'correction_requested', 'correction_accepted', 'correction_delivered', 'correction_rejected_duplicate_round', 'correction_rejected_out_of_window', 'correction_rejected_out_of_scope')),
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
  state TEXT NOT NULL CHECK (state IN ('prepared', 'session_created', 'attached', 'expired', 'failed', 'manual_review')),
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
  effect_type TEXT NOT NULL CHECK (effect_type IN ('calendar', 'customer_notification', 'internal_notification')),
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

CREATE INDEX IF NOT EXISTS idx_booking_contracts_offer ON booking_contracts(offer_id, offer_version, accepted_at);
CREATE INDEX IF NOT EXISTS idx_booking_contracts_terms ON booking_contracts(terms_version, terms_sha256);
CREATE INDEX IF NOT EXISTS idx_booking_contracts_stripe_price ON booking_contracts(stripe_price_ref);
CREATE INDEX IF NOT EXISTS idx_booking_deliverables_status_due ON booking_deliverables(status, due_at);
CREATE INDEX IF NOT EXISTS idx_booking_deliverables_expected_end ON booking_deliverables(status, expected_session_end_at);
CREATE INDEX IF NOT EXISTS idx_booking_contract_events_booking_time ON booking_contract_events(booking_id, event_at);
CREATE INDEX IF NOT EXISTS idx_checkout_intents_booking_state ON checkout_intents(booking_id, state, updated_at);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_state_next ON integration_outbox(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_booking ON integration_outbox(booking_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_booking_contracts_immutable_update
BEFORE UPDATE ON booking_contracts BEGIN SELECT RAISE(ABORT, 'booking_contracts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_booking_contracts_immutable_delete
BEFORE DELETE ON booking_contracts BEGIN SELECT RAISE(ABORT, 'booking_contracts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS trg_booking_contract_events_append_only_update
BEFORE UPDATE ON booking_contract_events BEGIN SELECT RAISE(ABORT, 'booking_contract_events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_booking_contract_events_append_only_delete
BEFORE DELETE ON booking_contract_events BEGIN SELECT RAISE(ABORT, 'booking_contract_events are append-only'); END;


PRAGMA foreign_keys = ON;

-- New contact inquiries may opt in to durable CRM delivery. Historical
-- inquiries are deliberately not backfilled, replayed, or marked delivered.
CREATE TABLE IF NOT EXISTS contact_crm_delivery (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL UNIQUE CHECK (length(trim(event_id)) > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  state TEXT NOT NULL CHECK (state IN ('pending', 'processing', 'delivered', 'needs_attention')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_safe_error_code TEXT NOT NULL DEFAULT '',
  submission_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (state = 'processing' AND lease_token IS NOT NULL AND length(trim(lease_token)) > 0
      AND lease_expires_at IS NOT NULL AND lease_expires_at > updated_at)
    OR (state != 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  FOREIGN KEY (inquiry_id) REFERENCES contact_inquiries(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_contact_crm_delivery_due
  ON contact_crm_delivery(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_contact_crm_delivery_expired_lease
  ON contact_crm_delivery(state, lease_expires_at);

-- Every attempt must replay the exact originally accepted event and payload.
CREATE TRIGGER IF NOT EXISTS contact_crm_delivery_immutable_event
BEFORE UPDATE OF id, inquiry_id, event_id, payload_json, created_at ON contact_crm_delivery
WHEN NEW.id IS NOT OLD.id OR NEW.inquiry_id IS NOT OLD.inquiry_id
  OR NEW.event_id IS NOT OLD.event_id OR NEW.payload_json IS NOT OLD.payload_json
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'contact CRM delivery event is immutable');
END;
