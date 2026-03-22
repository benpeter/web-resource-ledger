-- WRL webhook registrations
-- Stores outbound webhook configuration for tenant event notifications.
-- Delivery attempt history is logged to Coralogix, not stored in D1.
PRAGMA foreign_keys = ON;

CREATE TABLE webhooks (
  id          TEXT    NOT NULL PRIMARY KEY
                        CHECK (id GLOB 'whk_[a-f0-9]*' AND length(id) = 36),
  tenant_id   TEXT    NOT NULL REFERENCES tenants(id),
  url         TEXT    NOT NULL CHECK (length(url) <= 2048),
  name        TEXT    NOT NULL,
  secret      TEXT    NOT NULL,
  events      TEXT    NOT NULL,   -- JSON array: ["capture.complete","capture.failed"]
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);

CREATE INDEX idx_webhooks_tenant
  ON webhooks (tenant_id, active, created_at);
