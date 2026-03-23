-- Track Stripe meter event reporting state.
-- reported_capture_count: capture_count value at last successful Stripe report.
-- last_reported_at: ISO 8601 timestamp of last successful report.
-- Existing rows get reported_capture_count=0 (never reported) and last_reported_at=NULL.
ALTER TABLE usage_counters ADD COLUMN reported_capture_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_counters ADD COLUMN last_reported_at TEXT;
