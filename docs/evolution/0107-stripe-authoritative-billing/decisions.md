# Decisions -- Phase 0107

## Cache on `tenants` vs `usage_counters`

**Decision**: Cache invoice data on `tenants` table.

The upcoming invoice is per-customer (per-tenant), not per-period. A tenant's
invoice amount encompasses all usage across periods. Caching on `tenants`
avoids the question of which period row to use.

## GET param fix in `stripeRequest`

**Decision**: Fix `stripeRequest` to put params in query string for GET
requests.

`stripeRequest` previously always put params in the request body. Stripe's
`GET /v1/invoices/upcoming` requires the `customer` param in the query string.
This is a correctness fix that makes the helper usable for all GET endpoints.
POST requests continue using form-encoded body.

## Fallback for free tenants

**Decision**: Free tenants and paid tenants without a cached invoice fall
back to `calculateCharges()`.

The response includes `source: 'stripe'` or `source: 'local'` so the UI can
annotate estimates with "(estimated)". This is purely cosmetic but helps
users understand the data freshness.

## Invoice cache refresh timing

**Decision**: Refresh invoice cache in the same hourly cron run as meter
events, as a second pass after all meter events are pushed.

This ensures the cached amount reflects the latest usage that was just
reported. Alternatives considered:
- Separate cron job: unnecessary complexity for a single additional API call
- On every capture: too many Stripe API calls, would hit rate limits
- Daily batch: acceptable staleness, but hourly costs nothing extra since
  the meter reporter already runs hourly

## Stale cache on inactive tenants

**Decision**: Accept stale cache for inactive tenants (no usage in current
period).

If a tenant has no usage, they don't appear in the meter reporter query, so
their cache stays unchanged. At early stage this is acceptable -- the cache
will update as soon as any usage occurs. A future enhancement could add a
daily full-refresh for all paid tenants.

## Cache cleared on subscription deletion

**Decision**: Clear the invoice cache when a subscription is deleted.

The `customer.subscription.deleted` webhook handler already blocks captures.
Clearing the cache ensures the UI doesn't show a stale amount for a
cancelled subscription. The UI falls back to `calculateCharges()` which
will show EUR 0.00.
