# Phase 0060: Capture Metering to Stripe Pipeline

Issue: #108 (R31)

## Task Briefing

Usage counters from WRL's metering system feed into Stripe's single capture
meter, producing accurate invoices at period end. Tenants see their consumption
and current charges on a dashboard. Volume discounts apply automatically at
higher usage levels. Invoices are only generated when the EUR 5 threshold is
reached.

## Success Criteria

- Usage records reported to Stripe for the captures meter at least hourly
- Volume discount tiers: EUR 0.05 (201-10k), EUR 0.035 (10k-100k), EUR 0.015 (100k+)
- First 200 captures/month are free and not reported as billable usage
- Dashboard endpoint shows: captures this period, current charges, applicable tier
- EUR 5 invoice threshold enforced; sub-EUR 5 balances roll over
- Usage reporting is idempotent (no double-counting)
- Metering data reconcilable within 1% tolerance
- Failed submissions retried and logged to Coralogix

## Scope

- In: Usage record submission to Stripe API, consumption dashboard, volume
  discount configuration, EUR 5 threshold logic, retry on failure, reconciliation
- Out: Storage/API call metering to Stripe, real-time billing, custom invoice
  templates, credit system

## Constraints

- Depends on R25 (metering), R29 (Stripe integration)
- Stripe usage records must include idempotency keys
- Usage reporting must not be in the capture request hot path
