# R31: Capture metering to Stripe pipeline

Issue: #108

**Outcome**: Usage counters from WRL's metering system feed into Stripe's single capture meter, producing accurate invoices at period end. Tenants see their consumption and current charges on a dashboard. Volume discounts apply automatically at higher usage levels. Invoices are only generated when the €5 threshold is reached.

**Success criteria**:
- Usage records reported to Stripe for the captures meter at least hourly
- Volume discount tiers applied automatically: €0.05 (201-10k), €0.035 (10k-100k), €0.015 (100k+)
- First 200 captures/month are free and not reported to Stripe as billable usage
- Dashboard endpoint (or web UI panel) shows: captures this period, current charges, applicable price tier, threshold progress
- Invoice threshold enforced: Stripe invoice finalization deferred until accumulated charges >= threshold; sub-threshold balances roll over
- Invoices generated automatically at billing period end (if threshold met) with a single line item showing capture count and tiered pricing
- Usage reporting is idempotent (duplicate reports don't double-count)
- Metering data reconcilable: internal counters match Stripe usage records within 1% tolerance
- Failed usage report submissions retried and logged to Coralogix

**Scope**:
- In: Usage record submission to Stripe API (captures only), consumption dashboard data endpoint, volume discount tier configuration, invoice threshold logic, retry on submission failure, reconciliation logging
- Out: Storage or API call metering to Stripe (observability only, not billed), real-time billing, custom invoice templates, credit system

**Constraints**:
- Depends on R25 (metering infrastructure) for the usage counters that feed Stripe
- Depends on R29 (Stripe integration) for customer/meter setup
- Stripe usage records must include idempotency keys to prevent double-billing
- Usage reporting must not be in the capture request hot path; use async submission
