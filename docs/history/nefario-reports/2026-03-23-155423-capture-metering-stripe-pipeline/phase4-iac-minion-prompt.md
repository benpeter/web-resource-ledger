## Task: Implement meter reporter module and wire into cron handler

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/expressive-fluttering-axolotl

The D1 migration (0008) added reported_capture_count and last_reported_at columns to usage_counters. The pricing module (src/pricing.js) exports computeBillableDelta(captureCount, reportedCaptureCount).

### Deliverable 1: src/meter-reporter.js

Create a new module with one exported function:

```js
export async function reportPendingMeterEvents(env, ctx) { ... }
```

Implementation:

1. Query paid tenants with unreported usage. Use a simple two-period IN clause (current period + previous period) to handle month boundaries without time-based conditionals:

```sql
SELECT uc.tenant_id, uc.period, uc.capture_count, uc.reported_capture_count,
       t.stripe_customer_id
FROM usage_counters uc
JOIN tenants t ON t.id = uc.tenant_id
WHERE t.stripe_customer_id IS NOT NULL
  AND t.payment_method_added_at IS NOT NULL
  AND uc.capture_count > uc.reported_capture_count
  AND uc.period IN (?, ?)
```

Pass current period and previous period as parameters. Import computePeriod from ./db.js. Compute previous period from current: decrement month, handle January -> December rollover.

2. For each tenant row with delta > 0:
   - Compute delta: capture_count - reported_capture_count
   - Build idempotency key: `wrl-meter:${tenantId}:${period}:${captureCount}` (prefixed per security review)
   - Call reportMeterEvent(env, { event_name: 'captures', payload: { stripe_customer_id: row.stripe_customer_id, value: String(delta) }, identifier: idempotencyKey, timestamp: Math.floor(Date.now() / 1000) })
   - Import reportMeterEvent from ./stripe.js
   - On success: UPDATE usage_counters SET reported_capture_count = ?, last_reported_at = ? WHERE tenant_id = ? AND period = ? using the SNAPSHOT capture_count value
   - On failure: log error, do NOT update watermark. Include HTTP status and stripeErrorType in log event (per observability review).

3. Error handling: each tenant independent. If tenant A fails, continue with B.

4. Coralogix logging (use log from ./log.js, subsystem 'meter'):
   - meter.report_cycle_start (severity 3): tenantCount, period(s) queried
   - meter.report_success (severity 3): tenantId, period, delta, identifier, previousWatermark (reported_capture_count before update)
   - meter.report_fail (severity 5): tenantId, period, errorMessage, httpStatus, stripeErrorType, captureCount, reportedCaptureCount
   - meter.report_cycle_complete (severity 3): reported count, failed count, durationMs, periods queried

5. Stripe 200 response on duplicate identifier: treat as success, update watermark (this is how Stripe handles meter event deduplication -- returns 200, not 409).

### Deliverable 2: Wire into cron handler

Modify src/index.js in the scheduled() export:

```js
async scheduled(controller, env, ctx) {
  await handleScheduledTick(controller, env, ctx);
  if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
    ctx.waitUntil(reportPendingMeterEvents(env, ctx));
  }
},
```

Import reportPendingMeterEvents from ./meter-reporter.js at the top of index.js.

### Deliverable 3: Tests

Create test/meter-reporting.test.js with unit tests:

1. Paid tenant with delta: reports correct value to Stripe, updates watermark
2. Paid tenant no delta: no Stripe call
3. Free tenant (no stripe_customer_id): skipped
4. Stripe 500 error: watermark NOT updated, error logged
5. Stripe 200 on duplicate identifier: treat as success, update watermark (NOT 409 -- per testing/gru review)
6. Multiple tenants: independent calls; one failure doesn't block others
7. Idempotency key: assert key is wrl-meter:{tenantId}:{period}:{captureCount}
8. Watermark set to snapshot value

Create test/meter-batch.test.js with integration tests:
1. Hourly tick (HH:00:00) fires reporting
2. Non-hourly tick (HH:15:00) skips reporting
3. Both schedule fan-out and meter reporting execute without interference

Use vi.useFakeTimers(), vi.setSystemTime() for time control. Mock globalThis.fetch to intercept Stripe API calls. Use miniflare D1 for real database operations. See test/scheduled-handler.test.js and test/billing.test.js for patterns.

### What NOT to do
- Do NOT add separate cron trigger to wrangler.toml
- Do NOT deduct free tier (200) before reporting -- report ALL captures
- Do NOT modify src/scheduler.js
- Do NOT add retry logic beyond natural hourly cadence

### Context
- reportMeterEvent() exists at src/stripe.js:119-121
- Stripe meter event_name is 'captures'
- computePeriod() from src/db.js returns YYYY-MM
- log() from src/log.js is Coralogix logger
- STRIPE_SECRET_KEY already configured as worker secret
- Existing cron: src/index.js scheduled() handler
- Test pattern: test/scheduled-handler.test.js

### After writing code
Run: npx vitest run test/meter-reporting.test.js test/meter-batch.test.js
Fix any failures. All tests must pass.

When done, report: file paths with change scope and line counts, 1-2 sentence summary.