-- WRL scheduled captures
-- Recurring capture schedules with cron-based scheduling.
-- Delivery history is tracked via last_capture_id/last_capture_status on the schedule row.
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- schedules
-- Per-tenant recurring capture registrations.
-- id format: sch_ + 32 lowercase hex chars (total length 36)
-- ---------------------------------------------------------------------------
CREATE TABLE schedules (
  id                  TEXT    NOT NULL PRIMARY KEY
                                CHECK (id GLOB 'sch_[a-f0-9]*' AND length(id) = 36),
  tenant_id           TEXT    NOT NULL REFERENCES tenants(id),
  url                 TEXT    NOT NULL CHECK (length(url) <= 2048),
  name                TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  cron                TEXT    NOT NULL CHECK (length(cron) <= 128),
  next_run_at         TEXT    NOT NULL,
  paused              INTEGER NOT NULL DEFAULT 0 CHECK (paused IN (0, 1)),
  last_run_at         TEXT,
  last_capture_id     TEXT,
  last_capture_status TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT
);

-- Due-schedules query: fetch all unpaused schedules whose next_run_at has passed.
-- Covers the primary scheduled() handler query.
CREATE INDEX idx_schedules_due
  ON schedules (next_run_at, tenant_id)
  WHERE paused = 0;

-- Tenant listing: reverse chronological per-tenant schedule list.
CREATE INDEX idx_schedules_tenant
  ON schedules (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Extend captures with schedule linkage
-- Optional back-reference so a capture can be traced to its originating schedule.
-- ---------------------------------------------------------------------------
ALTER TABLE captures ADD COLUMN schedule_id TEXT REFERENCES schedules(id);

-- Filtered listing: all captures produced by a given schedule.
CREATE INDEX idx_captures_schedule
  ON captures (schedule_id, created_at DESC)
  WHERE schedule_id IS NOT NULL;
