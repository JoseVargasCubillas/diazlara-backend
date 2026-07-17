-- Migration: add columns to CITAS to persist Google Calendar linkage
-- Run:
--   mysql -u <user> -p <db> < scripts/2026-07-add-calendar-account-to-citas.sql
-- Reversible: drop columns if needed.

ALTER TABLE CITAS
  ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255) NULL AFTER meet_link,
  ADD COLUMN IF NOT EXISTS calendar_account_key VARCHAR(64) NULL AFTER google_event_id;

-- Index to make cancel/reconciliation lookups by (accountKey, eventId) fast.
CREATE INDEX IF NOT EXISTS idx_citas_calendar_event
  ON CITAS (calendar_account_key, google_event_id);
