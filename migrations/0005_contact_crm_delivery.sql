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
