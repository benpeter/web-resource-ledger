# Outcome -- Phase 0107

## What was built

The billing UI now shows Stripe's actual upcoming invoice amount for paid
tenants instead of a locally computed estimate. The system works as follows:

1. **Hourly meter reporter** pushes usage events to Stripe, then fetches
   `GET /v1/invoices/upcoming` per tenant and caches `amount_due` + `currency`
   on the `tenants` table in D1.

2. **Usage endpoint** (`GET /v1/account/usage`) reads the cached amount for
   paid tenants and returns it with `source: 'stripe'`. Falls back to
   `calculateCharges()` with `source: 'local'` for free tenants or when
   cache is empty.

3. **Subscription deletion webhook** clears the cache so the UI doesn't
   show stale amounts after cancellation.

4. **UI annotation**: Billing view shows "(estimated)" next to the charges
   label when `source: 'local'` and tenant has a payment method, indicating
   the amount hasn't been confirmed by Stripe yet.

## Files changed

| File | Change |
|------|--------|
| `src/stripe.js` | Fixed GET param handling in `stripeRequest`; added `getUpcomingInvoice` |
| `src/db.js` | Added `cacheStripeInvoice`, `clearStripeInvoiceCache` |
| `src/meter-reporter.js` | Added invoice cache refresh pass after meter events |
| `src/account.js` | Read cache in `handleAccountGetUsage`, return `source` field |
| `src/billing.js` | Clear cache in `handleSubscriptionDeleted` |
| `src/ui/ui-billing.js` | "(estimated)" annotation for local-source charges |
| `migrations/0017_invoice_cache.sql` | 3 new columns on `tenants` table |
| `test/stripe.test.js` | GET param handling tests |
| `test/billing.test.js` | Invoice cache DB functions, usage source field, sub deletion cache clear |

## API response change

The `billing.currentCharges` object in `GET /v1/account/usage` now includes
a `source` field:

```json
{
  "billing": {
    "currentCharges": {
      "amount": 7.50,
      "currency": "EUR",
      "source": "stripe"
    }
  }
}
```

This is an additive change -- existing clients ignore the new field.

## Backlog changes

- **Deferred**: Daily full-refresh for inactive tenants (acceptable staleness
  at early stage)
- **Deferred**: eIDAS invoice caching (not yet broken out in Stripe invoices)
