-- Add email verification pending state to notification_preferences.
-- pending_email: new address awaiting verification. NULL when no verification is in flight.
-- verification_sent_at: ISO 8601 timestamp of last verification email send.
--   Used to enforce a 60-second resend cooldown.
ALTER TABLE notification_preferences ADD COLUMN pending_email        TEXT DEFAULT NULL;
ALTER TABLE notification_preferences ADD COLUMN verification_sent_at TEXT DEFAULT NULL;
