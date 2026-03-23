# Code Review: Scheduled Captures Feature (Issue #107)

**Verdict: ADVISE**

No blocking security vulnerabilities or data-corrupting bugs were found. All
findings are correctness or maintainability issues that should be addressed
before the next production deployment, but none are acute enough to block
merging if the team accepts the risk.

---

## Findings

### [ADVISE] src/scheduler.js:183-209 -- Partial sendBatch failure orphans completed batches' captures

When `queueMessages.length > BATCH_SIZE` (100) the loop sends multiple
`sendBatch` calls sequentially. If the second (or later) call throws, the
`catch` block logs the error but usage is *not* incremented for *any* batch —
including batches that already succeeded. More importantly, the captures
inserted into D1 for the already-enqueued batch are marked `pending` and
*will* be processed (the queue already has them), but usage will never be
incremented for those tenants.

In practice this scenario requires > 100 due schedules in one tick, which is
unlikely at current scale. But the logic is wrong in principle: if the loop
sends batch 1 successfully and batch 2 fails, batch 1's captures are real
queue work that will consume quota with no usage record.

FIX: Track which batches were sent successfully and increment usage only for
those tenants, regardless of later batch failures. Simplest approach: move the
`usageByTenant` increment inside the loop, right after each successful
`sendBatch`, so partial success is correctly accounted for.

---

### [ADVISE] src/db.js:1151 -- `tenant_id` leaks into schedule API responses

`rowToSchedule()` includes `tenant_id: row.tenant_id` in the returned object.
This field is then serialized into `GET /v1/schedules` and `GET /v1/schedules/:id`
API responses. The `tenant_id` is redundant (the caller is the tenant) and
leaks an internal identifier into the public API surface that is not documented
in `openapi.yaml`.

This is not a security vulnerability (the tenant already knows their own ID),
but it inflates response size, is undocumented, and creates a backwards
compatibility obligation if removed later.

FIX: Remove `tenant_id` from `rowToSchedule()` return shape, or explicitly
exclude it in the handlers if the internal shape is needed elsewhere (e.g. in
`getDueSchedules` which uses the same transformer and legitimately needs
`tenant_id`). The cleanest fix is a separate `rowToSchedulePublic()` for API
responses vs `rowToSchedule()` for internal use.

---

### [ADVISE] src/ui/ui-schedules.js:61 -- `schedule.active` field does not exist

`scheduleStatusBadge()` branches on `schedule.active`, but `rowToSchedule()`
(and therefore every API response) does not include an `active` field. The
schedule has a `paused` boolean. As a result, `schedule.active` is always
`undefined` (falsy), so *every* schedule renders as "Paused" in the badge,
regardless of actual paused state.

This is a confirmed correctness bug in the UI. Active schedules show
"Paused" badge instead of "Active" or "Pending".

FIX: Change `scheduleStatusBadge()` to check `schedule.paused`:

```js
if (schedule.paused) {   // was: if (!schedule.active)
```

---

### [ADVISE] src/schedules.js:42-57 -- `verifyAuth` duplicated from src/index.js

`schedules.js` contains a private `verifyAuth()` function that is byte-for-byte
identical to the `verifyAuth()` in `index.js`. Both perform the same cookie
sniff → session verify → API key fallback pattern. This is a DRY violation:
any future change to session cookie name, session verification logic, or auth
return shape must be made in two places.

FIX: Extract `verifyAuth` to a shared module (e.g. `src/auth-utils.js` or
export from `src/session.js`) and import it in both `index.js` and
`schedules.js`. The same pattern already appears in `webhooks.js` — check
whether that file also carries a copy, and consolidate all three.

---

### [ADVISE] src/scheduler.js:73 -- `checkQuota` called with `schedules.length` but quota is per-capture

`checkQuota(env.DB, tenantId, schedules.length)` passes the number of
schedules as the `count` argument. `checkQuota` treats `count` as the number
of captures being requested and checks `captureCount + count > quota`. This
means if a tenant has 5 schedules due, the quota check asks "can I add 5?"
rather than checking whether each individual schedule's capture fits within
the remaining headroom incrementally.

For most cases this is correct and is actually the desired bulk-pre-check
behavior. However, if the tenant has, say, 3 captures remaining and 5 schedules
due, the bulk check returns `allowed: false` and *all 5 schedules are skipped*
— even though 3 could be served within quota. The comment says "one quota check
per tenant" but does not acknowledge this all-or-nothing consequence.

This is a product decision rather than a code bug, but it should be an explicit
decision. As currently implemented, partial fulfillment of due schedules when
near the quota limit is not possible.

FIX (if all-or-nothing is acceptable): add a code comment stating the
intentional all-or-nothing semantics so the next engineer does not assume
partial fulfillment is supported.

FIX (if partial fulfillment is desired): iterate schedules one at a time,
checking and decrementing available quota per schedule.

---

### [ADVISE] src/cron.js:96-102 -- `validateCron` 2-year lookahead creates a third Cron instance unnecessarily

`validateCron` constructs three `Cron` instances: one for initial parse, one
for the 2-year lookahead, one for the interval check. The third (`checkCron`)
is identical to the first. The try/catch wrapper around the third construction
is noted as "unreachable" in a comment, which is correct. The duplication is
harmless but adds noise.

FIX: Reuse the `fireTimes` data already computed from the `lookahead` instance
(which runs from now) for the interval check. If `firstTwo.length >= 2`, the
interval between `firstTwo[0]` and `firstTwo[1]` already covers the minimum
interval check. If more than 2 consecutive checks are desired, compute
`lookahead.nextRuns(INTERVAL_CHECK_COUNT)` and eliminate the third `Cron`
construction entirely.

---

## What Is Correct

- **SSRF defense**: URL passes through `validateUrl()` before being stored. The
  scheduler re-validates URLs pulled from the queue (in `index.js` queue
  consumer) via the same `validateUrl` call. Defense in depth is present.

- **IDOR protection**: `getSchedule`, `deleteSchedule`, and `listSchedules` all
  scope queries to `tenant_id`. The `getSchedule` and `deleteSchedule` handlers
  use `tenant_id` as a second bind parameter, not as a post-hoc filter.

- **SQL injection**: All D1 queries use parameterized `bind()` calls. No string
  interpolation into SQL.

- **Schedule limit enforcement**: `countSchedules` + `getEffectiveScheduleLimit`
  correctly reads the per-tenant config override before checking. The limit
  check uses `>=` (not `>`) so the limit is exact, not off-by-one.

- **Cron minimum interval**: `validateCron` checks 5 consecutive fire times,
  not just the first pair. This correctly catches expressions like `0,30 * * *`
  where the first two runs might be an hour apart but subsequent runs are 30
  minutes apart.

- **next_run_at advancement for quota-exhausted schedules**: Schedules that are
  skipped due to quota still have their `next_run_at` advanced. This prevents
  them from piling up and triggering a thundering herd when quota resets.

- **Migration safety**: `ALTER TABLE captures ADD COLUMN schedule_id` uses no
  `NOT NULL` constraint, correctly allowing the new column to be added without
  backfilling existing rows.

- **Test isolation**: IP counters are distinct between test files and increment
  per test, preventing cross-test rate limiter exhaustion. `cleanDb` + `beforeEach`
  pattern is correct.

- **Auth in scheduler**: The scheduled handler (`handleScheduledTick`) does not
  accept external HTTP requests and does not perform auth — the Cloudflare
  runtime enforces that `scheduled()` is only called by the cron trigger.
