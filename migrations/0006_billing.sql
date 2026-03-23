-- Add Stripe billing columns to tenants.
--
-- billing_status values: 'active', 'grace_period', 'blocked'
-- Enforced at the application layer -- SQLite ALTER TABLE ADD COLUMN does not
-- support CHECK constraints, so invalid values are rejected before writes.
--
-- grace_period_end: ISO 8601 timestamp. Non-null only when billing_status =
-- 'grace_period'. Cleared (set to NULL) when transitioning back to 'active'
-- or forward to 'blocked'.
--
-- payment_method_added_at: ISO 8601 timestamp. Set once when
-- checkout.session.completed fires; never unset thereafter. NULL means the
-- tenant has not yet added a payment method.
--
-- stripe_customer_id: Stripe's cus_xxx identifier. NULL until the tenant
-- initiates billing via Stripe Checkout.
--
-- Existing rows receive billing_status = 'active' (safe default) and NULL for
-- all other new columns.

ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN billing_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN grace_period_end TEXT;
ALTER TABLE tenants ADD COLUMN payment_method_added_at TEXT;

-- Partial index for grace period queries.
-- Only indexes rows that require active management (non-active statuses),
-- keeping the index small and lookups fast.
CREATE INDEX idx_tenants_billing_status
  ON tenants (billing_status)
  WHERE billing_status != 'active';
