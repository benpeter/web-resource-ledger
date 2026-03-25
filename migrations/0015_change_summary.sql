-- Add change summary for scheduled capture change detection.
-- JSON column populated asynchronously at capture completion time.
-- NULL for non-scheduled captures, first-in-schedule captures, or
-- captures completed before this migration.
ALTER TABLE captures ADD COLUMN change_summary TEXT;
