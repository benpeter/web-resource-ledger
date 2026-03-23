-- Add threat intelligence / quarantine support to captures.
--
-- quarantined: artifact access gate. 0 = accessible, 1 = blocked.
--   DB status remains 'complete' for quarantined captures; the API layer
--   maps quarantined=1 to status:'quarantined' in responses. This avoids
--   modifying the existing CHECK (status IN ('pending','complete','failed'))
--   constraint, which D1/SQLite cannot alter after table creation.
--
-- quarantine_reason: threat type string (e.g. 'MALWARE'). NULL when not quarantined.
-- quarantined_at: ISO 8601 timestamp, NULL when not quarantined.
-- last_threat_check_at: most recent threat check time, used by re-scan cron.
-- threat_check: result of pre-capture URL check: 'pass', 'unavailable', or
--   NULL for captures created before this migration.
--
-- NOTE: D1 ALTER TABLE ADD COLUMN does NOT support CHECK constraints.
-- The quarantined IN (0,1) constraint is enforced at the application layer.
ALTER TABLE captures ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0;
ALTER TABLE captures ADD COLUMN quarantine_reason TEXT;
ALTER TABLE captures ADD COLUMN quarantined_at TEXT;
ALTER TABLE captures ADD COLUMN last_threat_check_at TEXT;
ALTER TABLE captures ADD COLUMN threat_check TEXT;

-- Partial index for the re-scan cron query.
-- Only indexes complete, non-quarantined captures so the index stays small
-- and the cron handler can efficiently find captures due for rescanning.
CREATE INDEX idx_captures_threat_rescan
  ON captures (last_threat_check_at)
  WHERE status = 'complete' AND quarantined = 0;

-- Audit log for every threat check performed against a capture URL.
-- verdict: 'safe' (no threats found) or 'threat' (flagged by threat intel).
-- threat_types: raw threat type string(s) from the provider, NULL on safe.
-- source: which provider performed the check (default 'web_risk').
CREATE TABLE threat_checks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id   TEXT    NOT NULL REFERENCES captures(id),
  checked_at   TEXT    NOT NULL,
  verdict      TEXT    NOT NULL CHECK (verdict IN ('safe', 'threat')),
  threat_types TEXT,
  source       TEXT    NOT NULL DEFAULT 'web_risk'
);

CREATE INDEX idx_threat_checks_capture
  ON threat_checks (capture_id, checked_at DESC);
