# Test Minion Review: Scheduled Captures (Cron)

**Verdict: APPROVE**

The test task (Task 5) is well-designed and comprehensive. My review below notes a few specific items to watch during implementation, but none are blockers.

---

## What the plan gets right

**Coverage is complete for the risk surface.** Every new code path has a corresponding test:
- `src/cron.js` -> `test/cron-parse.test.js` (pure unit tests, fast, no bindings needed)
- `src/schedules.js` + `src/db.js` schedule functions -> `test/schedule-crud.test.js`
- Per-tenant schedule limits -> `test/schedule-limits.test.js`
- `src/scheduler.js` fan-out handler -> `test/scheduled-handler.test.js`
- `scheduleId` field propagation -> additions to `test/list-captures.test.js` and `test/capture-retrieval.test.js`

**Strategy matches the project's existing infrastructure.** The plan correctly uses `@cloudflare/vitest-pool-workers` with miniflare-backed D1, follows the `webhook-crud.test.js` / `quota-enforcement.test.js` templates, and avoids mocking D1 (consistent with the project philosophy and prior feedback on this point).

**Edge cases with real consequence are explicitly called out:**
- CAS idempotency on `advanceSchedule` (duplicate-tick prevention)
- IDOR protection on `GET /v1/schedules/:id` and `DELETE` (verified via cross-tenant fixture)
- Over-quota tenant: skip capture but still advance `next_run_at`
- Paused schedule: absent from `getDueSchedules` query results

**The cron validation test matrix is appropriately parameterized.** Using `it.each` for the valid/invalid/sub-hourly cases is the right call -- it keeps the file short while covering the full input space.

---

## Items to watch during implementation

### 1. FK ordering in `cleanDb` -- plan contradicts itself

The plan text says two different things:

In the Task 1 prompt (line ~109): "delete captures first (they reference schedules), then schedules"
In the Task 5 prompt (line ~587): "place it AFTER webhooks delete and BEFORE captures delete ... delete schedules after captures but before tenants"

The correct FK-safe order given the schema (captures.schedule_id -> schedules.id, schedules.tenant_id -> tenants.id) is:

```
sessions, github_users, webhooks, captures, schedules, usage_counters, api_keys, signing_keys, tenants
```

captures must be deleted BEFORE schedules (captures reference schedules). The Task 5 ordering is correct; the Task 1 note is wrong. The implementing agent should follow the Task 5 order. Worth verifying at the approval gate for Task 1.

### 2. `createScheduledController` availability -- plan includes the right fallback

The plan correctly notes that `createScheduledController` may not exist in `@cloudflare/vitest-pool-workers` v0.12.21 and provides the manual fallback. The implementing agent should use the fallback by default rather than trying the import first, since the fallback is safe regardless of version.

### 3. `PATCH paused: true` and `nextRunAt` nulling -- plan spec vs. test assertion mismatch

The PATCH test case says: "Pause: `{ paused: true }` sets paused and nulls nextRunAt". However, the schema keeps `next_run_at` as a non-nullable column with no NULL check in the migration spec shown. The test should verify whatever the implementation actually does (either null the field or leave the last value). This needs to be consistent between `src/schedules.js`, `src/db.js`, and the test assertion. The implementing agent should align these three; the test is the contract.

### 4. Missing test: `seedCapture` backward compatibility

The plan modifies `seedCapture` to accept an optional `scheduleId` parameter. There should be a check that existing tests calling `seedCapture` without `scheduleId` still pass (null default). This is implicit -- none of the existing ~40 test files will need changes -- but the agent should run the full suite after modifying fixtures.js to confirm no regressions.

### 5. `nextRun` / `nextRunAfter` tests use a fixed reference date

The plan pins test reference times to `2026-03-23T10:30:00Z`. This is correct practice (deterministic, no wall-clock dependency). The implementing agent should use `new Date('2026-03-23T10:30:00Z')` as the `afterDate` argument and assert the exact ISO string. Do not use `Date.now()` in these assertions.

### 6. Queue message assertions in `scheduled-handler.test.js`

The plan says to verify the D1 state after the handler runs but does not explicitly mention asserting the queue messages sent via `env.CAPTURE_QUEUE.sendBatch()`. The miniflare test pool provides a queue binding that captures sent messages. The implementation should also assert that `env.CAPTURE_QUEUE` received the correct message payloads (captureId, url, scheduleId, tenantId). This closes the gap between "capture row created" and "capture actually enqueued".

---

## What is explicitly out of scope (correct)

- No E2E/Playwright tests (appropriate -- staging validation is post-deploy)
- No UI DOM testing (no DOM testing framework in this project)
- No Coralogix delivery assertions (fire-and-forget, correct to skip)
- No mocking of D1 (correct per project philosophy)

---

## Summary

The test plan covers all new code paths, uses the correct testing infrastructure, applies the right patterns from existing test files, and identifies the high-stakes edge cases (CAS idempotency, IDOR, quota skip with next_run_at advancement). The FK ordering contradiction between Task 1 and Task 5 is the only real risk -- it needs to be caught at the Task 1 approval gate or the test suite will fail with FK violations. Everything else is implementation hygiene.
