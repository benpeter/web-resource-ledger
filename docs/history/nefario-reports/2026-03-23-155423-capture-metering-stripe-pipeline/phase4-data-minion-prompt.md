## Task: Create pricing module and D1 migration for metering state

You are working on the WRL Cloudflare Worker project. Your task has three deliverables.

### Deliverable 1: src/pricing.js

Create a new module src/pricing.js that exports:

1. VOLUME_TIERS -- a constant array matching Stripe sandbox graduated pricing:
   - { id: 'tier_0', name: 'Free', unitPrice: 0, from: 1, to: 200 }
   - { id: 'tier_1', name: 'Standard', unitPrice: 0.05, from: 201, to: 10000 }
   - { id: 'tier_2', name: 'Volume', unitPrice: 0.035, from: 10001, to: 100000 }
   - { id: 'tier_3', name: 'High Volume', unitPrice: 0.015, from: 100001, to: null }

2. INVOICE_THRESHOLD_EUR = 5.00

3. calculateCharges(captureCount) -- pure function computing graduated charges:
   - Walk each tier bracket, compute units in that bracket, multiply by unitPrice, sum.
   - Return { amount, currency: 'EUR', currentTier, tiers: VOLUME_TIERS }
   - amount must be rounded to 2 decimal places (Math.round(amount * 100) / 100).
   - Graduated pricing: each unit priced at its bracket rate, not highest bracket rate.

4. computeBillableDelta(captureCount, reportedCaptureCount) -- incremental delta:
   - return Math.max(0, captureCount - reportedCaptureCount)

Add JSDoc at top noting tier definitions mirror Stripe Dashboard capture_volume_monthly config.

### Deliverable 2: migrations/0008_metering.sql

Add two columns to existing usage_counters table:

```sql
ALTER TABLE usage_counters ADD COLUMN reported_capture_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_counters ADD COLUMN last_reported_at TEXT;
```

### Deliverable 3: test/pricing.test.js

Parameterized tests (it.each) for calculateCharges:
- 0 -> 0.00, tier_0
- 1 -> 0.00, tier_0
- 200 -> 0.00, tier_0
- 201 -> 0.05, tier_1
- 250 -> 2.50, tier_1 (50 billable at 0.05)
- 10000 -> 490.00, tier_1 (9800 at 0.05)
- 10001 -> 490.04, tier_2 (9800*0.05 + 1*0.035, rounded)
- 10500 -> 507.50, tier_2 (9800*0.05 + 500*0.035)
- 100000 -> 3640.00, tier_2 (9800*0.05 + 90000*0.035)
- 100001 -> 3640.02, tier_3 (9800*0.05 + 90000*0.035 + 1*0.015, rounded)
- 100500 -> 3647.50, tier_3

Also test computeBillableDelta:
- (300, 0) -> 300
- (300, 300) -> 0
- (300, 250) -> 50
- (0, 0) -> 0

### What NOT to do
- Do NOT modify src/quotas.js
- Do NOT add Stripe API calls -- this is pure data and math
- Do NOT create a separate meter_reporting_log table

### Context
- Migration pattern: see migrations/0006_billing.sql
- Test pattern: see test/quotas.test.js for vitest patterns
- Run tests with: npx vitest run test/pricing.test.js

When done, report: file paths with change scope, 1-2 sentence summary.