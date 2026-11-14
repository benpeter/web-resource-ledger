-- Account deletion requests (phase 0152).
-- deletion_requested_at: ISO 8601 timestamp of the request. NULL when no
--   deletion is pending. While set, the tenant can't capture and its schedules
--   are skipped; 30 days after it, an operator may purge the tenant's data.
ALTER TABLE tenants ADD COLUMN deletion_requested_at TEXT DEFAULT NULL;
