# Domain Plan Contribution: test-minion

## Recommendations

### Test Architecture Overview

The schedule feature touches five boundaries: D1 schema, HTTP CRUD handlers, cron expression parsing, the `scheduled()` handler with fan-out, and capture-to-schedule linking. The test strategy must cover each boundary with the right test type while staying consistent with the existing 42-file test suite.

The existing suite uses `@cloudflare/vitest-pool-workers` (v0.12.21) with `vitest` (v3.2.4), running against miniflare-backed D1, R2, KV, and queue bindings. Integration tests run via `vitest.integration.config.js` with real network. E2E tests use Playwright against staging. All three tiers are relevant here.

### Unit-Testable Components (vitest, `wrangler.test.toml`)

**1. Cron expression parsing and validation**
This is the highest-value unit test target. A pure function that takes a cron string and returns either a parsed schedule or a validation error. Test cases:

- Valid hourly-or-coarser expressions: `0 * * * *`, `30 8 * * 1-5`, `0 0 1 * *`
- Rejection of sub-hourly expressions: `*/5 * * * *`, `0,30 * * * *`, `* * * * *`
- Rejection of malformed strings: `not-a-cron`, empty string, missing fields, extra fields, `0 25 * * *` (invalid hour)
- Edge cases: `0 0 29 2 *` (Feb 29), `0 0 31 * *` (day 31 in short months), six-field cron with seconds (reject -- Cloudflare uses five-field)
- Next-run-at computation: given a cron expression and a reference time, verify the computed next execution timestamp. This is critical for the fan-out query and for the list response's `nextRunAt` field.

This should be a standalone test file (`test/cron-parse.test.js` or similar) with no D1 or HTTP dependencies. Pure input/output. Ideal candidate for parameterized tests (`it.each`).

**2. Schedule CRUD handlers (D1 + SELF.fetch)**
Follow the exact pattern from `test/webhook-crud.test.js`: use `SELF.fetch()` against the worker with `seedApiKey` + `TEST_TENANT_KEY` auth, miniflare-backed D1. File: `test/schedule-crud.test.js`.

Test cases:
- `POST /v1/schedules`: valid create returns 201 with `sch_` prefixed ID, cron, url, nextRunAt
- `POST /v1/schedules`: rejects missing fields (url, cron), invalid cron, non-HTTPS URL (reuses `validateUrl`)
- `POST /v1/schedules`: rejects unknown fields (following webhook pattern)
- `GET /v1/schedules`: returns tenant-scoped list with nextRunAt computed
- `GET /v1/schedules`: empty list for tenant with no schedules
- `DELETE /v1/schedules/:id`: returns 200 with `{ deleted: true }` for own schedule
- `DELETE /v1/schedules/:id`: returns 404 for non-existent or other-tenant's schedule
- Auth: 401 for missing/invalid API key, works with both session and API key auth

Rate limit note: follow the webhook-crud.test.js pattern of unique IPs per describe block to avoid cross-test rate limit exhaustion.

**3. Per-tenant schedule limit enforcement**
Test cases within `test/schedule-crud.test.js` or a dedicated `test/schedule-limits.test.js`:

- Free tier tenant: create up to limit (e.g., 10), then verify 429 on the 11th
- Tenant with config override: respects higher limit from `tenants.config` JSON
- Deleting a schedule frees up a slot (create limit+1 after deleting one succeeds)
- 429 response body includes clear message and `detail` field

This is analogous to `test/quota-enforcement.test.js` -- seed usage counters and config, then hit the endpoint.

**4. D1 layer functions**
Add schedule-related DB function tests to `test/db.test.js` (or a new `test/schedule-db.test.js` if the file is getting large). Follow the existing pattern of testing `createSchedule`, `getSchedule`, `listSchedules`, `deleteSchedule`, `countSchedules` directly against miniflare D1:

- Schema verification: migration creates `schedules` table with expected columns and indexes
- CRUD: insert, read back, list by tenant, delete
- `schedule_id` column on captures: verify FK linkage, test that `listCaptures` with `scheduleId` filter works
- `countSchedules` returns correct count for limit enforcement

**5. Schedule-to-capture linking**
Test that captures created by a schedule include the `scheduleId` field:

- `GET /v1/captures/:id` returns `scheduleId` when set
- `GET /v1/captures?scheduleId=sch_...` filters correctly (if implemented)
- `GET /v1/captures` list response includes `scheduleId` (null for ad-hoc captures)

This can be tested by seeding captures directly with `seedCapture` (add `scheduleId` param to the fixture helper).

### Integration-Testable Components (vitest, `vitest.integration.config.js`)

**6. `scheduled()` handler fan-out**
This is the most important integration test. The `@cloudflare/vitest-pool-workers` package provides `createScheduledController` and `createExecutionContext` from `cloudflare:test`. The pattern:

```js
import { env, createScheduledController, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import worker from '../src/index.js';

const ctrl = createScheduledController({ scheduledTime: new Date(), cron: '0 * * * *' });
const ctx = createExecutionContext();
await worker.scheduled(ctrl, env, ctx);
await waitOnExecutionContext(ctx);
```

However, there is a significant wrinkle: the `scheduled()` handler will enqueue messages on the `CAPTURE_QUEUE`. In the unit test config (`wrangler.test.toml`), queue consumers are omitted to prevent auto-consumption. For `scheduled()` handler tests, we want to verify that messages were enqueued with the correct `scheduleId` but NOT have them auto-consumed (which would try to launch a browser).

Recommended approach: test the `scheduled()` handler in the unit test suite (not integration), using `wrangler.test.toml` where queue consumers are disabled. After calling `worker.scheduled()`, query D1 to verify:
- Schedules with `next_run_at <= now` had captures created in `pending` status
- Each capture row has the correct `schedule_id` FK
- Schedule's `last_run_at` was updated
- Schedules belonging to over-quota tenants were skipped (and logged)
- The queue received messages (inspect via the queue producer binding if the test framework supports it, or verify indirectly by checking D1 capture rows)

Test cases:
- No due schedules: `scheduled()` completes without errors or side effects
- One due schedule: creates one pending capture with correct `schedule_id`, enqueues one message
- Multiple tenants with due schedules: fan-out creates captures for each, tenant isolation preserved
- Tenant over quota: schedule is skipped, capture is NOT created, schedule's `last_run_at` is NOT updated (or updated with error status)
- Idempotency: if `scheduled()` fires twice in the same minute window, duplicate captures are prevented (check for guard based on `last_run_at` or a dedup window)
- Schedule with invalid/unreachable URL: capture is still created (URL validation happened at schedule creation time), enqueued for the queue consumer to handle
- CPU budget concern: test with 50+ seeded schedules to verify the handler completes within reasonable time

**7. Capture pipeline with scheduleId propagation**
Verify that when a capture message includes `scheduleId`, the complete capture pipeline preserves it. This is tricky because the queue consumer calls `performCapture()` which needs a real browser. Two approaches:

- **Preferred (unit test level)**: Seed a capture with `schedule_id` set, then call `completeCapture()` directly. Verify the capture detail response includes `scheduleId`. This tests the data layer without needing the full pipeline.
- **Integration test**: One test in `test/integration/` that creates a schedule via API, triggers `scheduled()`, and then waits for the capture to complete (with real browser). This is expensive but validates the full path. Only one test needed.

### E2E Tests (Playwright against staging)

**8. Schedule lifecycle E2E**
One Playwright spec: `test/e2e/schedule-lifecycle.spec.js`. Follows the `webhook-lifecycle.spec.js` pattern:

- Create a schedule (POST /v1/schedules with hourly cron)
- List schedules (GET /v1/schedules -- verify presence)
- Delete the schedule (DELETE /v1/schedules/:id)
- List schedules (verify absence)

This does NOT test cron execution (staging would need to wait for the trigger to fire, which is too slow for CI). It only tests the CRUD API against the real deployed worker.

Whether to add a separate E2E test that waits for a cron-triggered capture is a judgment call. I recommend against it -- it would require either waiting up to 60 minutes for a trigger, or hitting the `/__scheduled` test route, which is a wrangler dev-only feature not available in production. The unit/integration tests for `scheduled()` provide sufficient coverage of the execution path.

### Test Fixtures and Helpers

**9. Extend `test/fixtures.js`**:

- `seedSchedule(db, id, { tenantId, url, cron, name, nextRunAt, lastRunAt, createdAt })` -- follow the `seedWebhook` pattern exactly
- `seedCapture` overrides: add `scheduleId` parameter to the existing `seedCapture` function
- `cleanDb`: add `DELETE FROM schedules` to the cleanup batch (before `DELETE FROM captures` due to FK order, or after if the FK is nullable)
- Constants: `TEST_SCHEDULE_ID = 'sch_' + 'c'.repeat(28) + '0001'` (or similar)

### wrangler.test.toml Changes

The `wrangler.test.toml` must be updated to include the cron trigger configuration if the `scheduled()` export is to be testable. However, `@cloudflare/vitest-pool-workers` uses `createScheduledController` to invoke the handler directly -- no actual cron trigger configuration is needed in the test toml. The handler just needs to be exported from the worker. No changes needed to `wrangler.test.toml` for scheduled handler testing.

### vitest.config.js Changes

No changes needed. The `scheduled()` handler tests use `createScheduledController` from `cloudflare:test` and call `worker.scheduled()` directly. The existing config already provides D1, KV, R2, and queue producer bindings.

## Proposed Tasks

### Task 1: Cron expression parser unit tests (`test/cron-parse.test.js`)
- Create test file with parameterized tests for validation and next-run computation
- Pure function tests, no D1/HTTP/queue dependencies
- Cover valid expressions, sub-hourly rejection, malformed inputs, edge cases
- Estimated: ~60 test cases via `it.each`

### Task 2: Schedule CRUD endpoint tests (`test/schedule-crud.test.js`)
- Follow `webhook-crud.test.js` pattern exactly
- POST/GET/DELETE with auth, validation, error responses
- Unique IPs per describe block for rate limit isolation
- Depends on: D1 migration (0007), route handlers, fixtures

### Task 3: Schedule limit enforcement tests (`test/schedule-limits.test.js`)
- Seed tenant config, create schedules up to limit, verify 429
- Test config override path
- Test delete-then-recreate slot recovery
- Depends on: schedule CRUD handler, limit logic in handler or quotas module

### Task 4: D1 schedule functions tests (additions to `test/db.test.js`)
- Schema verification for new migration
- CRUD functions: createSchedule, getSchedule, listSchedules, deleteSchedule, countSchedules
- captures.schedule_id linkage tests
- Depends on: D1 migration, db.js functions

### Task 5: `scheduled()` handler unit tests (`test/scheduled-handler.test.js`)
- Use `createScheduledController` + `createExecutionContext` from `cloudflare:test`
- Test fan-out: no due schedules, one due, multiple tenants, over-quota skip
- Test idempotency guard
- Test scheduleId propagation to capture rows
- This is the highest-risk test area -- depends on the handler implementation
- Depends on: scheduled() export, D1 schema, queue producer binding

### Task 6: Test fixtures extension (`test/fixtures.js`)
- Add `seedSchedule()` helper
- Add `scheduleId` parameter to `seedCapture()`
- Update `cleanDb()` with schedules table cleanup
- Add test constants (TEST_SCHEDULE_ID, etc.)
- Should be done early -- Tasks 2-5 depend on it

### Task 7: E2E schedule lifecycle test (`test/e2e/schedule-lifecycle.spec.js`)
- Follow `webhook-lifecycle.spec.js` pattern
- CRUD only (no cron execution)
- Uses authenticated fetch helper from `test/e2e/helpers/api-client.js`
- Depends on: deployed schedule endpoints on staging

### Task 8: Capture list/detail scheduleId tests (additions to existing tests)
- Extend `test/list-captures.test.js`: verify `scheduleId` appears in list responses
- Extend `test/capture-retrieval.test.js`: verify `scheduleId` in detail response
- Test `scheduleId` filter parameter on `GET /v1/captures` (if implemented)
- Depends on: captures.schedule_id column, list handler changes

### Recommended Task Order

Task 6 (fixtures) must come first. Then Tasks 1 and 4 can run in parallel (pure data tests). Tasks 2 and 3 depend on handlers being built. Task 5 depends on the scheduled() handler. Task 8 depends on capture schema changes. Task 7 (E2E) is last, after staging deployment.

## Risks and Concerns

### Risk 1: `scheduled()` handler testability with queue consumers disabled
The `wrangler.test.toml` deliberately omits queue consumers to prevent auto-consumption during tests. When the `scheduled()` handler enqueues capture messages, those messages will sit in the queue unprocessed. This is fine for testing the handler's logic (verify D1 state changes and that messages were sent), but means we cannot test the full pipeline (scheduled -> enqueue -> dequeue -> capture) in the unit test suite. The integration test config uses the full `wrangler.toml` with consumers enabled, but that means auto-consumption with real browser binding, which may cause side effects. **Mitigation**: Test the handler and the pipeline separately. Handler tests verify D1 state. Pipeline tests (existing capture tests) verify queue consumption. One targeted integration test connects the two.

### Risk 2: `createScheduledController` availability
The `createScheduledController` helper from `cloudflare:test` is documented but I have not verified it exists in the specific `@cloudflare/vitest-pool-workers@0.12.21` version pinned in this project. **Mitigation**: Early verification -- run a minimal test that imports `createScheduledController` and confirm it resolves. If unavailable, fall back to calling `worker.scheduled()` directly with a manually constructed controller object `{ scheduledTime: Date.now(), cron: '0 * * * *', noRetry() {} }`.

### Risk 3: Fan-out test data scale
Testing with 50+ seeded schedules (to verify CPU budget and concurrency) may make the D1 setup slow in tests. The existing test suite uses `cleanDb` which deletes all rows between tests. With many schedules, batch inserts in beforeEach could add latency. **Mitigation**: Use a dedicated describe block with its own beforeAll (not beforeEach) for scale tests, and clean up in afterAll.

### Risk 4: Cron next-run-at computation correctness
If the implementation uses a third-party cron parser library, the tests must cover the same edge cases the library handles (DST transitions, month-end rollovers). If the implementation is a custom parser, the test surface is larger. **Mitigation**: Test against known-good reference timestamps. Include timezone edge cases even if the implementation uses UTC (to verify UTC assumption holds).

### Risk 5: Rate limit interference in CRUD tests
The schedule CRUD endpoints will likely share rate limiters with other endpoints (or have their own). Following the webhook-crud.test.js pattern of unique IPs per describe block is essential. **Mitigation**: Use the established `nextIp()` counter pattern. Document rate limiter namespace IDs in the test file header.

### Risk 6: FK ordering in cleanDb
If `schedules` has a FK to `tenants` and `captures` has a FK to `schedules`, the cleanup order in `cleanDb()` matters. Deleting captures before schedules before tenants. **Mitigation**: If `captures.schedule_id` is a nullable FK (no cascade), delete captures first, then schedules, then tenants. Test this explicitly -- a wrong FK order causes silent test failures that manifest as "unique constraint" errors in subsequent tests.

## Additional Agents Needed

None beyond what the meta-plan already includes. The test strategy aligns with the planned consultations. One note: **data-minion's schema recommendation directly determines the fixture helpers and cleanup order**, so the test task definitions may need adjustment after the schema is finalized. The test tasks above assume:
- A `schedules` table with `tenant_id` FK
- A nullable `schedule_id` column on `captures`
- Standard `sch_` prefixed IDs (following `whk_`, `cap_` patterns)

If data-minion recommends a different linking strategy (e.g., a join table), Task 4 and Task 8 will need to be restructured, and `seedSchedule` will need different parameters.
