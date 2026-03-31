# Phase 0107: Stripe-Authoritative Billing Amounts

## Task

Make the billing UI show Stripe's actual upcoming invoice amount instead of
a locally computed estimate.

The billing UI currently computes charges via `calculateCharges(captureCount)`
in `src/pricing.js`. This is an estimate -- not what Stripe will actually
invoice. If Stripe applies credits, rounding differs, or pricing drifts
between `pricing.js` and the Stripe Dashboard, the UI shows the wrong number.

## Approach

After the hourly meter reporter pushes usage events to Stripe, have it also
pull back the upcoming invoice total via `GET /v1/invoices/upcoming` and cache
`amount_due` on the `tenants` table. The billing UI then reads the
Stripe-authoritative amount instead of computing locally. Free tenants (no
subscription) keep using `calculateCharges()`.

## Prior Work

- Calendar month billing anchor (phase 0102)
- Draft invoice hold via `invoice.created` webhook
- `updateInvoice` helper in `stripe.js`
- Meter reporter pushing usage events to Stripe
