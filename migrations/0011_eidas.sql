-- eIDAS qualified timestamp support.
--
-- eidas_qualified: per-tenant opt-in flag for qualified electronic timestamps
-- under eIDAS regulation. Default 0 (disabled). Application layer validates
-- 0/1 -- D1 ALTER TABLE ADD COLUMN does not support CHECK constraints.
--
-- eidas_capture_count: running count of captures that received a qualified
-- timestamp, parallel to the existing capture_count column.
--
-- reported_eidas_count: Stripe meter watermark for eIDAS captures, mirrors the
-- existing reported_capture_count pattern (value at last successful Stripe report).

ALTER TABLE tenants ADD COLUMN eidas_qualified INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usage_counters ADD COLUMN eidas_capture_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_counters ADD COLUMN reported_eidas_count INTEGER NOT NULL DEFAULT 0;
