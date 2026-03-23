# Code Review: Content Security Scanning (R32)

**Verdict: ADVISE**

The implementation is fundamentally sound -- the core threat-check pipeline is
correct, the fail-open design is appropriate, and the quarantine gate coverage
across all four public endpoints (GET capture, GET artifact, verify, status) is
complete. No blocking bugs were found. Several issues warrant attention before
merge, none critical.

---

## Summary

| Category | Finding | Severity |
|----------|---------|----------|
| Bug | `quarantineCapture` exported but never called -- `threat_checks` audit row always inserted even on no-op UPDATE | Advise |
| Bug | `listCapturesNeedingThreatCheck`: `tenant_id` in GROUP BY without aggregation -- non-deterministic in SQLite | Advise |
| Bug | `buildWebhookPayload` has no `capture.quarantined` branch -- webhook payload missing `quarantinedAt` field | Advise |
| Security | `GOOGLE_WEB_RISK_API_KEY` secret not listed in `wrangler.toml` comment block or OPERATIONS.md | Advise |
| Correctness | Queue consumer idempotency guard does not account for `quarantined` status | Nit |
| Correctness | Rescan cron dispatch: hardcoded `'0 3 * * *'` -- staging cron (`'0 4 * * *'`) bypasses rescan entirely | Advise |
| Testing | No integration tests for quarantine gates on GET /captures/:id, GET /artifact, verify, status endpoints | Advise |
| Testing | No tests for `rescan.js` -- zero coverage on the cron handler | Advise |
| Design | Dead export: `quarantineCapture` (single-capture variant) has no callers | Nit |

---

## Findings

### Bug: `quarantineCapture` inserts audit row unconditionally even when UPDATE is a no-op

**File:** `src/db.js`, lines 1379-1393

`quarantineCapture` runs both statements as a single `db.batch()`. When the
`captures` UPDATE matches zero rows (because the capture is already quarantined
or not yet complete), the `threat_checks` INSERT still executes. The docstring
says "The WHERE clause is idempotent: a second call...produces zero changes and
no duplicate audit row" -- that claim is wrong. The batch does not make the
INSERT conditional on the UPDATE succeeding. A second call will produce a
duplicate audit row.

This function also has no callers anywhere in the codebase (confirmed by grep
across src/ and test/). It appears to be dead export code. Either wire it up or
remove it to avoid the misleading docstring and the latent bug.

**Recommended fix:** Either drop the function entirely (YAGNI) or restructure so
the INSERT is conditional:
```sql
INSERT INTO threat_checks (capture_id, checked_at, verdict, threat_types)
SELECT ?, ?, 'threat', ?
WHERE changes() > 0
```
Note: `changes()` in a batch depends on D1 batch semantics -- verify before
applying. If D1 does not support this pattern, issue two sequential statements
with an explicit check on `meta.changes` between them.

---

### Bug: Non-deterministic `tenant_id` in `listCapturesNeedingThreatCheck`

**File:** `src/db.js`, lines 1482-1490

```sql
SELECT MIN(id) AS capture_id, url, tenant_id
FROM captures
WHERE ...
GROUP BY url
```

`tenant_id` is selected without an aggregate function but is not in the GROUP BY
clause. In strict SQL this is an error. SQLite permits it but returns an
arbitrary row's `tenant_id` -- whichever the optimizer picks. When a URL has
captures owned by multiple tenants (cross-tenant URL reuse), the returned
`tenantId` may belong to the wrong tenant.

The consequence in `rescan.js` is that the wrong `tenantId` is logged and used
to build the minimal `captureRecord` for webhook dispatch. For webhooks, the
dispatch correctly iterates `quarantined` (which has the real per-capture
tenantId from `quarantineCapturesByUrl`), so webhook delivery is not affected.
But the log line at `event: 'threatcheck.rescan_degraded'` and the skip log at
`event: 'threatcheck.rescan_fail'` will record the wrong tenant when the URL is
shared.

**Recommended fix:** Add `tenant_id` to GROUP BY, or use `MIN(tenant_id)` to
make it deterministic:
```sql
SELECT MIN(id) AS capture_id, url, MIN(tenant_id) AS tenant_id
FROM captures
WHERE ...
GROUP BY url
```
Since the downstream code only uses `tenantId` for logging (not auth decisions),
this is low severity but should be fixed for log accuracy.

---

### Bug: `buildWebhookPayload` has no branch for `capture.quarantined`

**File:** `src/webhook-dispatch.js`, lines 113-120

`buildWebhookPayload` handles `capture.complete` and `capture.failed` event
types but has no branch for `capture.quarantined`. When `rescan.js` calls
`dispatchWebhooks(env, qTenantId, 'capture.quarantined', captureRecord)`, the
payload is built with only the base fields (`captureId`, `status`, `url`,
`verificationUrl`). The `quarantinedAt` and `quarantineReason` fields that
subscribers would need to act on are not included.

Additionally, the minimal `captureRecord` constructed in `rescan.js` (lines
135-139) only has `captureId`, `status`, and `url` -- it lacks `quarantinedAt`
and `quarantineReason` anyway. Even if `buildWebhookPayload` is fixed, the
upstream record needs those fields.

**Recommended fix:**
1. In `rescan.js`, hydrate the full capture record from DB before dispatch, or
   populate `quarantinedAt` and `quarantineReason` on the minimal record.
2. In `buildWebhookPayload`, add:
```js
} else if (eventType === 'capture.quarantined') {
  data.quarantinedAt = captureRecord.quarantinedAt;
  if (captureRecord.quarantineReason) data.quarantineReason = captureRecord.quarantineReason;
}
```

---

### Security: `GOOGLE_WEB_RISK_API_KEY` is not documented as a required secret

**Files:** `wrangler.toml` lines 140-148, `OPERATIONS.md`

The secret is consumed in `src/threat-check.js` via `env.GOOGLE_WEB_RISK_API_KEY`
but is not listed in the `wrangler.toml` comment block that enumerates required
secrets, and does not appear in `OPERATIONS.md`'s provisioning runbook. A
deployer following the documented setup steps will deploy without this secret,
causing all threat checks to degrade silently with `reason: 'no_api_key'` -- the
system will be live with threat screening effectively disabled and no alert to the
operator.

The fail-open behavior is intentional and correct. But the absence from
provisioning docs means operators may not notice the degraded state until an
incident reveals it.

**Recommended fix:** Add to `wrangler.toml` comment block:
```
# GOOGLE_WEB_RISK_API_KEY must be set via: wrangler secret put GOOGLE_WEB_RISK_API_KEY
```
And add to `OPERATIONS.md` secrets provisioning table.

---

### Correctness: Staging rescan cron is never dispatched

**Files:** `wrangler.toml` lines 233-234, `src/index.js` lines 299-304

The cron dispatch in `src/index.js` checks `controller.cron === '0 3 * * *'`
(production schedule). Staging is configured with `'0 4 * * *'`. This means the
staging rescan handler never runs -- the `scheduled()` handler falls through to
`handleScheduledTick` for the staging rescan cron tick.

This is likely unintentional. Staging should exercise the same rescan logic for
integration testing.

**Recommended fix:** Use a pattern that covers both crons:
```js
if (controller.cron === '0 3 * * *' || controller.cron === '0 4 * * *') {
```
Or better, move the cron value to a `[vars]` binding and check against it, so
the logic does not need code changes for env-specific schedules.

---

### Correctness (nit): Queue consumer idempotency guard does not cover `quarantined`

**File:** `src/index.js`, line 166

```js
if (existing && (existing.status === 'complete' || existing.status === 'failed')) {
```

If a capture is quarantined between queue enqueue and processing (unlikely but
possible during a rescan race), `existing.status` will be `'quarantined'` and
the guard will not skip it. The queue consumer will then try to capture an
already-complete (quarantined) URL and write over the existing complete record.

This is low probability given that captures are only quarantined after they
complete. However, the `existing.status === 'complete'` check was written before
quarantine existed -- the `rowToCapture` mapping now returns `'quarantined'`
instead of `'complete'` for quarantined rows, so the guard no longer catches
this case.

**Recommended fix:**
```js
if (existing && (
  existing.status === 'complete' ||
  existing.status === 'quarantined' ||
  existing.status === 'failed'
)) {
```

---

### Testing: No integration tests for quarantine endpoint gates

No test file other than `threat-check.test.js` references `quarantine`, `451`,
or `rescan`. The four public endpoints that now have quarantine gates (GET
capture, GET artifact, verify, status) have no tests exercising the quarantined
path. The DB-level quarantine logic (`quarantineCapturesByUrl`, `recordThreatCheck`)
has no tests either.

This is a meaningful gap because the quarantine gate logic in `src/index.js` is
non-trivial -- the GET capture endpoint returns 200 with metadata (not 451), the
artifact endpoint returns 451, verify returns 451, and status returns 200 with a
quarantined body. These four different behaviors need test coverage to prevent
regression.

**Recommended fix (for test-minion):** Add tests that:
1. Create a capture, manually set `quarantined=1` in DB, then assert each
   endpoint returns the correct response shape and status code.
2. Test `listCapturesNeedingThreatCheck` with a mix of checked/unchecked/quarantined
   captures to verify the query returns expected rows.
3. Test `rescan.js` `handleRescanTick` with a mocked `checkUrl` that returns
   threats, verifying quarantine DB writes and webhook dispatch.

---

### Testing: Zero test coverage for `rescan.js`

`rescan.js` is 173 lines of orchestration logic with branching for degraded API,
quarantine errors, safe/threat verdicts, and logging. None of this is covered by
the test suite. The scheduled handler test (`scheduled-handler.test.js`) only
tests the `*/1 * * * *` branch, not the new `0 3 * * *` branch.

---

## What the implementation does well

**threat-check.js:**
- API key sent in header, not query string. Correct and explicitly tested.
- Allowlist filtering of returned threat types guards against future API expansions.
- Fail-open on all error classes (timeout, network, 5xx, JSON parse failure).
- Injectable `lookup` function makes unit testing straightforward and clean.
- `checkUrls` uses `Promise.allSettled` correctly -- one URL's failure does not
  cancel others.

**db.js:**
- Virtual `quarantined` status pattern (quarantined=1 + status='complete' in DB,
  mapped to `'quarantined'` at the application layer) avoids the SQLite ALTER
  TABLE CHECK constraint limitation cleanly.
- `quarantineCapturesByUrl` uses `db.batch()` correctly for atomicity across
  multiple captures.
- `listCapturesNeedingThreatCheck` deduplicates by URL before the API fan-out --
  this correctly avoids redundant Web Risk API calls when multiple captures share
  a URL.
- Index `idx_captures_threat_rescan` is a partial index that stays small.

**index.js:**
- Quarantine gates are present on all four relevant endpoints.
- Batch capture refactor from `items.push()` to `items[i] =` correctly preserves
  position-indexed responses after splitting into validation + threat check phases.
- `problemResponse(451, ...)` for artifact access is semantically correct.
- `setCaptureThreatCheck` is correctly called async via `ctx.waitUntil` with a
  `.catch` so it never blocks the response.

**Migration:**
- Clean DDL. Partial index for the rescan cron query is appropriate.
- `threat_checks` audit table with `CHECK (verdict IN ('safe', 'threat'))` provides
  integrity constraint that the `captures` table columns lack (by necessity).
- Correct use of `NOT NULL DEFAULT 0` for `quarantined` to backfill existing rows.

**rescan.js:**
- Serial processing with 500-URL budget cap is correct for the stated rate limit
  concern.
- Skipped URLs (degraded API) naturally retry on next tick without cursor
  complexity (YAGNI applied correctly).
- `ctx.waitUntil` for webhook dispatch after quarantine write is correct -- does
  not block cron completion.
