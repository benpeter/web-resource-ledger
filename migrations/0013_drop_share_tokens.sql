-- Drop the share_tokens table (share token system removed in #169)
DROP INDEX IF EXISTS idx_share_tokens_expires_at;
DROP INDEX IF EXISTS idx_share_tokens_tenant;
DROP INDEX IF EXISTS idx_share_tokens_capture;
DROP TABLE IF EXISTS share_tokens;
