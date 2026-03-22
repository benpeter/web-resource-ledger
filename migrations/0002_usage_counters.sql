-- WRL usage counters schema
-- Per-tenant monthly billing counters. Composite PK (tenant_id, period)
-- covers exact-match lookups; no secondary index needed.
PRAGMA foreign_keys = ON;

CREATE TABLE usage_counters (
  tenant_id       TEXT    NOT NULL REFERENCES tenants(id),
  period          TEXT    NOT NULL
                            CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
                                   AND length(period) = 7),
  capture_count   INTEGER NOT NULL DEFAULT 0 CHECK (capture_count >= 0),
  storage_bytes   INTEGER NOT NULL DEFAULT 0 CHECK (storage_bytes >= 0),
  api_call_count  INTEGER NOT NULL DEFAULT 0 CHECK (api_call_count >= 0),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT,
  PRIMARY KEY (tenant_id, period)
);
