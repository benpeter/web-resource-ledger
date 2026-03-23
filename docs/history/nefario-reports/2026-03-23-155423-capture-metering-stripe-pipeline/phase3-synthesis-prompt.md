MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

Wire WRL's D1 usage counters into Stripe's single capture meter, producing accurate invoices at period end. Tenants see their consumption and current charges on a dashboard. Volume discounts apply automatically at higher usage levels. Invoices are only generated when the EUR 5 threshold is reached.

Success criteria:
- Usage records reported to Stripe for the captures meter at least hourly
- Volume discount tiers: EUR 0.05 (201-10k), EUR 0.035 (10k-100k), EUR 0.015 (100k+)
- First 200 captures/month free and not reported as billable
- Dashboard endpoint shows: captures this period, current charges, applicable price tier, threshold progress
- EUR 5 invoice threshold enforced
- Idempotent reporting (no double-counting)
- Internal counters match Stripe within 1% tolerance
- Failed submissions retried and logged to Coralogix

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-data-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase2-test-minion.md

## Key consensus across specialists:

### iac-minion
- Piggyback on existing per-minute cron with hour-boundary detection (getUTCMinutes() === 0)
- New meter_reporting_log D1 table tracks per-tenant watermarks (last_reported_captures)
- New meter-reporter.js module separate from scheduler.js
- Deterministic idempotency key: wrl:{tenantId}:{period}:{hourTimestamp}:{fromCount}-{toCount}
- Only evaluate paid tenants (stripe_customer_id IS NOT NULL)
- Free tier: deduct first 200 before reporting delta to Stripe
- Retry is natural: if Stripe down, watermark stays, next hour-tick catches up

### data-minion
- Add reported_capture_count and last_reported_at columns to existing usage_counters table (NOT new table)
- Idempotency key: {tenantId}:{period}:{captureCount} -- deterministic, monotonically advancing
- Report ALL captures to Stripe (let graduated pricing handle free tier at EUR 0.00)
- Incremental deltas: delta = capture_count - reported_capture_count
- Reconciliation via Stripe meter event summary API with 10+ min lag tolerance
- CONFLICT with iac-minion: columns on existing table vs new table; report all vs deduct 200

### api-design-minion
- Server-side tier calculation (no Stripe API call for dashboard)
- New pure src/pricing.js module with VOLUME_TIERS constant and calculateCharges function
- Additive billing sub-object on existing GET /v1/account/usage response (non-breaking)
- Include billing data for ALL tenants (free sees tier_0, amount 0)
- projectedCharges starts as null (no historical data yet)

### test-minion
- Four test boundaries: meter reporting (~16), reconciliation (~8), dashboard (~12), cron batch (~10)
- Extract pure computeCharges as parameterized-testable function
- P0 edge cases: double reporting, free-tier not deducted, Stripe failure with marker update, non-deterministic keys
- Existing Object.keys assertion in account-usage.test.js line 102 will break -- coordinate update

## Conflicts requiring resolution:

1. **Storage for reporting state**: iac-minion proposes new meter_reporting_log table; data-minion proposes adding columns to existing usage_counters table. Evaluate which is cleaner.

2. **Free-tier handling**: iac-minion says deduct first 200 in code before reporting to Stripe; data-minion says report all captures and let Stripe's graduated pricing (tier 1: 1-200 at EUR 0.00) handle it. The Stripe sandbox has capture_volume_monthly with graduated pricing where 1-200 are free. Evaluate which approach is more robust.

3. **Idempotency key format**: iac-minion uses wrl:{tenantId}:{period}:{hourTimestamp}:{fromCount}-{toCount}; data-minion uses {tenantId}:{period}:{captureCount}. Both are deterministic. Evaluate which is more robust for retry scenarios.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve the three conflicts above with clear rationale
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xbSHAB/capture-metering-stripe-pipeline/phase3-synthesis.md

The execution plan must include:
- Task list with dependencies, agent assignments, model choices
- Approval gates (budget 2-3 max)
- Each task needs a complete prompt that an agent can execute independently
- Use the project's existing patterns (Cloudflare Workers, D1, vitest/miniflare)
