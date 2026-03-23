-- Index for Stripe webhook lookups by customer ID.
-- Stripe webhooks include a `customer` field (cus_xxx) and WRL must resolve
-- this to a tenantId. Without an index this is a full scan of the tenants
-- table on every billing event.
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer_id
  ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
