-- WRL email notification preferences and deduplication
-- notification_preferences: one row per tenant, created lazily on first PUT.
-- notification_sent: deduplication log for threshold/periodic notifications.
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- notification_preferences
-- Per-tenant notification settings. Row is created on first PUT (lazy).
-- email_source tracks whether the address came from GitHub OAuth ('github')
-- or was manually overridden ('manual').
-- All notify_* columns default to 1 (subscribed). Set to 0 to unsubscribe.
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  tenant_id              TEXT    NOT NULL PRIMARY KEY REFERENCES tenants(id),
  email                  TEXT    CHECK (email IS NULL
                                         OR (length(email) >= 3
                                             AND length(email) <= 320)),
  email_verified         INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  email_source           TEXT    NOT NULL DEFAULT 'github'
                                   CHECK (email_source IN ('github', 'manual')),
  notify_capture_failure    INTEGER NOT NULL DEFAULT 1 CHECK (notify_capture_failure    IN (0, 1)),
  notify_approaching_limit  INTEGER NOT NULL DEFAULT 1 CHECK (notify_approaching_limit  IN (0, 1)),
  notify_limit_reached      INTEGER NOT NULL DEFAULT 1 CHECK (notify_limit_reached      IN (0, 1)),
  notify_invoice_generated  INTEGER NOT NULL DEFAULT 1 CHECK (notify_invoice_generated  IN (0, 1)),
  notify_payment_failure    INTEGER NOT NULL DEFAULT 1 CHECK (notify_payment_failure    IN (0, 1)),
  notify_weekly_digest      INTEGER NOT NULL DEFAULT 1 CHECK (notify_weekly_digest      IN (0, 1)),
  created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at             TEXT
);

-- ---------------------------------------------------------------------------
-- notification_sent
-- Deduplication table for threshold and periodic notifications.
-- Composite PK ensures at most one send per (tenant, period, event_type).
-- period format: YYYY-MM (e.g. '2026-03') -- checked via GLOB and length.
-- ---------------------------------------------------------------------------
CREATE TABLE notification_sent (
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  period      TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
                                     AND length(period) = 7),
  event_type  TEXT NOT NULL,
  sent_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, period, event_type)
);
