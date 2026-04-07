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
