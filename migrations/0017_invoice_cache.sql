-- Cache upcoming invoice amounts from Stripe on the tenants table.
-- Populated by the hourly meter reporter after pushing meter events.
ALTER TABLE tenants ADD COLUMN stripe_invoice_amount_cents INTEGER;
ALTER TABLE tenants ADD COLUMN stripe_invoice_currency TEXT;
ALTER TABLE tenants ADD COLUMN stripe_invoice_cached_at TEXT;
