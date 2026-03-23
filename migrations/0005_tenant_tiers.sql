-- Add tier column to tenants.
-- SQLite/D1 does not support CHECK constraints in ALTER TABLE ADD COLUMN;
-- allowed-value validation ('free', 'pro') is enforced at the application layer.
ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
