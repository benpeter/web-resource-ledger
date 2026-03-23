---
phase: capture-metering-stripe-pipeline
reviewer: code-review-minion
files_reviewed:
  - src/pricing.js (new, 85 lines)
  - src/meter-reporter.js (new, 119 lines)
  - src/account.js (+17 lines)
  - src/index.js (+4 lines)
  - migrations/0008_metering.sql (new, 6 lines)
  - test/pricing.test.js (new, 53 lines)
  - test/account-usage.test.js (+89 lines)
  - test/meter-reporting.test.js (new, 303 lines)
  - test/meter-batch.test.js (new, 137 lines)
---

VERDICT: ADVISE

---

## Summary

The implementation is financially sound in its critical path. The snapshot
idempotency design is correct, the watermark-only-on-success guarantee is
upheld, and the graduated pricing arithmetic is verified by table-driven tests
that exercise every tier boundary. No SQL injection vectors exist (all queries
use parameterized `.bind()`). No secrets are hardcoded.

Three issues need attention before merge: one correctness ADVISE around
`computeBillableDelta` being unused in the reporter, one ADVISE around
`calculateCharges(0)` returning the wrong tier, and one ADVISE around an
untested but non-obvious code path in the previous-period window query. The
remaining findings are nits.

---

FINDINGS:

---

### 1. ADVISE — src/pricing.js:83 / src/meter-reporter.js:62

**`computeBillableDelta` exported but not used in the reporter; reporter
duplicates its logic inline.**

`pricing.js` exports `computeBillableDelta` (line 83). The reporter at line 62
computes the same thing with a raw expression:

```js
const delta = captureCount - reportedCaptureCount;
if (delta <= 0) continue;
```

The SQL `WHERE uc.capture_count > uc.reported_capture_count` already
guarantees delta > 0 before the loop body runs, so the `if (delta <= 0)
continue` guard at line 63 is dead code (the DB filter makes it unreachable).
That is not a bug, but it creates false confidence in a guard that won't fire.

More importantly: the exported helper is tested in `test/pricing.test.js` and
documented in the JSDoc, implying it is the canonical delta calculator. The
reporter ignoring it means the two implementations can drift if someone edits
one and not the other.

FIX: Either use `computeBillableDelta` in the reporter (remove the inline
expression and the dead guard), or delete the export if it is not intended to
be a shared primitive. The simpler fix is to use the export:

```js
import { computeBillableDelta } from './pricing.js';
// ...
const delta = computeBillableDelta(captureCount, reportedCaptureCount);
if (delta <= 0) continue; // now truly defensive, not dead code
```

---

### 2. ADVISE — src/pricing.js:51-73 / test/pricing.test.js:13

**`calculateCharges(0)` returns `currentTier: tier_0` but 0 captures falls
below tier_0's `from: 1`. This is a category error in the response.**

The test table (line 13 of `pricing.test.js`) asserts:

```js
[0, 0.00, 'tier_0'],
```

At `captureCount = 0`, the loop hits `if (captureCount < tier.from) break`
on the first iteration (0 < 1), so `currentTier` stays at the initialized
value `VOLUME_TIERS[0]` and the amount is 0. The amount is correct. But
`currentTier` being `tier_0` is semantically misleading: the tenant is below
tier_0, not in it. This tier value flows through to the `/v1/account/usage`
response as `billing.tier`, so the dashboard will show "Free" tier even for
zero usage, which happens to be correct by coincidence but is not a precise
model.

This is low impact for the MVP. The real risk is if downstream code branches
on `currentTier.id === 'tier_0'` to decide "no charge", which would also be
true for the first 200 paid captures — making that branch ambiguous.

FIX: Either (a) accept the current behavior and document it in the JSDoc
("returns tier_0 for 0 captures as a sentinel"), or (b) initialize
`currentTier` to `null` and handle the null case in callers. Option (a) is
sufficient for MVP.

---

### 3. ADVISE — src/meter-reporter.js:40-49

**Previous-period window is always included in the query, even for new
installs where no previous-period rows exist. This is not a bug, but the
two-period window has no test coverage.**

The query binds `[current, prev]` to `IN (?, ?)` (lines 48-49). This is
correct by design: it closes out January's unreported usage when February
starts. However, there is no test in `test/meter-reporting.test.js` that
seeds data in the previous period and verifies it gets reported. The
watermark-snapshot and multi-tenant tests use only the current period.

If `computePeriod()` ever returns a period string in a format that makes the
`previousPeriod()` arithmetic fail (e.g., a non-padded month), the query
would silently return no prev-period rows instead of throwing.

FIX: Add one test that seeds captureCount > reportedCaptureCount in the
previous period (e.g., `2026-02` when current is `2026-03`) and verifies the
reporter picks it up and advances the watermark. Also add one unit test for
`previousPeriod('2026-01')` returning `'2025-12'` (the January boundary case).

---

### 4. NIT — src/meter-reporter.js:76

**`timestamp` uses `Date.now()` inside the per-tenant loop, not the snapshot
time from the DB row.**

```js
timestamp: Math.floor(Date.now() / 1000),
```

The timestamp sent to Stripe reflects the moment the meter event is being
reported, not the moment the captures occurred. Stripe's meter event API
accepts a `timestamp` that pins the event to a billing period. If the cron
runs at 23:59 on the last day of a month and the DB query returns both current
and previous period rows, all events get the same wall-clock timestamp, which
is fine. But if the worker is delayed (e.g., a cold start) and reports at
00:01 of the new month, a previous-period event will carry a timestamp in the
new month.

This is not a financial correctness bug today (Stripe's graduated billing
meters accumulate by customer, not by timestamp), but it is architecturally
imprecise. Stripe's docs for meter events note that `timestamp` should reflect
when the usage occurred.

FIX (suggested): Use the `last_reported_at` timestamp as a lower bound, or
simply use the last second of the billing period for previous-period rows.
Alternatively, document the current behavior explicitly in the JSDoc as a
known approximation.

---

### 5. NIT — src/pricing.test.js:19

**One comment has a rounding note that disagrees with the actual rounding.**

Line 19:
```js
[10001, 490.04, 'tier_2'],   // 9800*0.05 + 1*0.035 = 490.035 -> 490.04
```

`Math.round(490.035 * 100) / 100` in JavaScript IEEE 754 yields `490.04`
(correct), but the comment implies `490.035` rounds up to `490.04`. Due to
floating point representation, `490.035` is stored as
`490.03499999999999...`, which actually rounds to `490.03` under standard
rules. The test passes because the actual arithmetic does not produce
exactly `490.035` — the intermediate `unitsInBracket * unitPrice` result has
a different representation. The test is verifying the right value, but the
comment is misleading about why.

FIX (nit): Change the comment to avoid implying `490.035 -> 490.04`:

```js
[10001, 490.04, 'tier_2'],   // 9800*0.05=490.00 + 1*0.035=0.035 => 490.035, rounds to 490.04
```

Or just remove the intermediate math from the comment since the test is the
spec.

---

### 6. NIT — migrations/0008_metering.sql:5

**`reported_capture_count INTEGER NOT NULL DEFAULT 0` — no index added for
the reporter's query pattern.**

The reporter queries:

```sql
WHERE t.stripe_customer_id IS NOT NULL
  AND t.payment_method_added_at IS NOT NULL
  AND uc.capture_count > uc.reported_capture_count
  AND uc.period IN (?, ?)
```

This is a join over `usage_counters` filtered on `period` and a column
comparison (`capture_count > reported_capture_count`). If the `usage_counters`
table is indexed on `(tenant_id, period)` already (as expected for the primary
key), the `IN (?, ?)` filter should use that index. But the
`capture_count > reported_capture_count` condition is a row-level filter
evaluated after the index seek, which is fine at current scale.

This is not an issue now but worth noting for future: if the usage_counters
table grows large (many tenants × many historical periods), a partial index
on `(period)` filtering for `capture_count > reported_capture_count` would
help.

FIX (nit, not required for MVP): Document the query plan assumption in a
comment in the migration, or add a TODO for an index if the table exceeds
10k rows.

---

### 7. NIT — src/account.js:524-537

**`calculateCharges` is called for all tenants, including free tenants with
0 captures. This is correct behavior but the result is presented regardless
of payment method status, which may create a UI concern.**

The `billing` object (lines 525-537) is returned in the `/v1/account/usage`
response for every tenant, including free tenants. A free tenant with 150
captures will see `billing.currentCharges.amount = 0` and
`billing.tier.id = 'tier_0'`. This is accurate (they owe nothing) but the
response includes `billing.tiers` with full pricing for all four tiers, which
is a pricing disclosure to free users on every call.

This is a product/UX decision, not a bug. Including pricing tiers in the API
response is reasonable for transparency. Just confirm it is intentional.

FIX (nit): No code change required. If desired, gate the full `tiers` array
on `hasPaymentMethod` to reduce noise for free tenants.

---

## Coverage Assessment

| Area | Coverage | Notes |
|------|----------|-------|
| Graduated pricing arithmetic | Strong | All tier boundaries tested with table-driven cases |
| `computeBillableDelta` | Adequate | Tested in isolation; not exercised via reporter |
| Watermark correctness (snapshot) | Strong | Explicit test at line 289 of meter-reporting.test.js |
| Idempotency key format | Strong | Verified via form body decode in test 7 |
| Stripe 500 error isolation | Strong | Per-tenant isolation tested with multi-tenant scenario |
| Previous-period window | Missing | No test for cross-period reporting |
| `previousPeriod('2026-01')` boundary | Missing | January → December rollover not unit-tested |
| Hourly cron guard | Strong | Both hourly and non-hourly tick tested in meter-batch.test.js |
| `calculateCharges(0)` sentinel | Weak | Behavior tested but not documented |

---

## Security Assessment

- No hardcoded secrets found. All credentials flow through `env.STRIPE_SECRET_KEY`.
- All D1 queries use parameterized `.bind()`. No string interpolation in SQL.
- No user-controlled input reaches the Stripe identifier or event_name fields.
  `tenantId` comes from a verified DB row (not the request), `period` from
  `computePeriod()`, `captureCount` from D1.
- The `STRIPE_SECRET_KEY` is not logged or included in thrown errors
  (`stripe.js:72` truncates to error message only).
- Auth guard on `/v1/account/usage` is session-only (`env._session.tenantId`);
  tenantId is never from the request body.

No security blocks.
