# Domain Plan Contribution: test-minion

## Recommendations

### Overall Strategy: Both Unit and Integration Tests

Usage metering requires **both** layers, and the split is clear:

- **Unit tests** for the counter data access module (the new functions in `db.js` or a new `usage.js` DAL): Test increment semantics, monotonicity invariant, period key derivation, byte accumulation logic. These run against real D1 via miniflare (following `test/db.test.js` patterns), but call the DAL functions directly -- no HTTP routing, no auth.

- **Integration tests** for `GET /v1/admin/usage`: Test the admin endpoint via `SELF.fetch()` (following `test/admin-keys.test.js` patterns). These cover auth, query parameter parsing, response shape, period filtering, and cache headers. They also serve as end-to-end proof that counter increments from earlier operations show up in the usage response.

Do NOT add E2E tests for this feature. The admin endpoint is consumed programmatically, not by browsers. The miniflare-backed integration tests with real D1 and real HTTP routing provide sufficient confidence.

### Test Boundary Decisions for Each Counter Concern

**1. Monotonicity (counters never decrease within a period)**

This is the core correctness invariant. Test at the **unit level** against the DAL.

Approach: Call the increment function N times sequentially with the same tenant+period, and after each call, query the counter value. Assert that each read is >= the previous read. This validates the SQL increment logic (likely `UPDATE ... SET count = count + N` or INSERT-on-conflict pattern).

Concurrency note: True concurrent `waitUntil` writes cannot be meaningfully tested in Vitest because miniflare's D1 is single-connection SQLite -- there is no concurrent write contention to simulate. This is acceptable because:
- D1 in production uses SQLite WAL mode with serialized writes per database.
- The monotonicity guarantee comes from the SQL semantics (`SET col = col + 1` is atomic within a D1 transaction), not from application-level locking.
- The real concurrency risk is lost writes (two `waitUntil` calls read the same value and both write `value + 1`), which is eliminated if the implementation uses `UPDATE ... SET col = col + N` rather than read-then-write.

Recommended tests:
- `increment N times, read after each -- value is monotonically non-decreasing`
- `increment with count > 1 (batch captures) -- value increases by batch size`
- `incrementing one tenant does not affect another tenant's counter`
- `incrementing one period does not affect another period's counter`

**2. Period boundaries (capture starts in March, completes in April)**

This is a **design decision** that the test suite validates, not discovers. The test strategy depends on which period gets the count:

- **Option A: Count at capture creation time** (`created_at` determines period). Simpler; the period is known at enqueue time. The counter increment for capture_count happens when the capture row is created (in `handleCreateCapture`). Storage bytes are counted when `completeCapture` runs (which could be a different month).
- **Option B: Count at capture completion time** (`completed_at` determines period). More accurate for billing, but storage bytes and capture count land in different periods if the capture spans a month boundary.
- **Option C: All counters use the same period key derived from the event timestamp**. API call count uses request time, capture count uses creation time, storage bytes use completion time. Each counter type has its own natural timestamp.

Recommendation: **Option C** is the most honest and simplest to implement. Each increment call computes its own period from `new Date()`. This means a capture created on March 31 at 23:59 UTC that completes on April 1 at 00:01 UTC will have its `capture_count` in March and its `storage_bytes` in April. This is correct: March consumed the API call and queue slot, April consumed the storage.

Test approach (unit level):
- Seed a counter for period `2026-03`, then call increment with a mocked/controlled timestamp that falls in `2026-04`. Assert the March counter is unchanged and the April counter has the new value.
- The DAL function should accept an optional `periodOverride` or derive the period from `new Date()`. For testing, inject a specific date. The existing codebase uses `new Date().toISOString()` throughout `db.js` -- follow the same pattern but extract period computation into a pure function that can be unit-tested independently.

Recommended tests:
- `period key derivation: 2026-03-15T10:00:00Z -> '2026-03'`
- `period key derivation: 2026-03-01T00:00:00Z -> '2026-03'` (boundary)
- `period key derivation: 2026-02-28T23:59:59.999Z -> '2026-02'` (just before boundary)
- `increment in March does not affect April counter`
- `querying March returns March data, querying April returns April data`

**3. Storage byte accuracy (computed from buffers vs actual R2 sizes)**

This is the trickiest counter. R2 `put()` does not return the stored size. The byte count must be computed BEFORE the upload, from the artifact buffers themselves.

In `capture.js`, the artifacts stored are:
- `screenshot` (Uint8Array from Playwright) -- use `.byteLength`
- `screenshotBefore` (Uint8Array, optional) -- use `.byteLength`
- `html` (string) -- use `new TextEncoder().encode(html).byteLength` or `new Blob([html]).size`
- `headers.json` (JSON.stringify result, string) -- same encoding calculation
- WACZ bundle (Uint8Array) -- `waczBytes.byteLength` (already computed in capture.js as `waczInfo.size`)

The total storage bytes for a capture = sum of all artifact sizes that were actually put to R2.

Test approach (unit level):
- Create known-size artifacts (specific byte arrays and strings).
- Call the storage byte computation function with these artifacts.
- Assert the result matches the expected sum.
- Include edge cases: no headers (header fetch failed), no screenshotBefore (no consent), no WACZ (signing key absent), partial capture (no WACZ, no screenshotBefore).

Test approach (integration level):
- After a full capture pipeline run (using `stubRenderer` from fixtures.js), read the usage endpoint and verify `storage_bytes` matches the expected total computed from `PNG_BYTES.byteLength + TEST_HTML.length + headers JSON length`.

Recommended tests:
- `computeStorageBytes with full capture artifacts returns correct total`
- `computeStorageBytes with no headers returns correct total (excludes headers)`
- `computeStorageBytes with no screenshotBefore returns correct total`
- `computeStorageBytes with WACZ returns correct total (includes wacz size)`
- `computeStorageBytes with partial capture (screenshot + html only)`
- Integration: `after successful capture, usage storage_bytes matches artifact sizes`

**4. Failed captures -- count or not?**

Recommendation: **Count failed captures in `capture_count` and `api_calls`, but NOT in `storage_bytes`**.

Rationale:
- A failed capture still consumed compute (browser session, queue processing, CPU time). Billing should reflect resource consumption, not just successful outcomes.
- A failed capture produces no R2 artifacts (or at most partial artifacts that may be cleaned up), so `storage_bytes` should only count what is actually stored.
- The `api_calls` counter increments at request authentication time -- before the outcome is known. It counts regardless.
- The `capture_count` counter should increment when the capture row is created (`status: pending`). The capture consumed a queue slot and processing resources whether or not it succeeded. If the team decides only successful captures should count, change the increment point to `completeCapture`.

Test approach:
- Unit test: seed a pending capture, call `failCapture`, then verify `capture_count` reflects the increment (if counted at creation) or does not (if counted at completion).
- Unit test: verify `storage_bytes` is NOT incremented for a failed capture.
- Integration test: submit a capture via HTTP, have it fail (e.g., renderer throws), then query usage and verify `capture_count` is 1 but `storage_bytes` is 0.

Recommended tests:
- `failed capture increments capture_count` (or `does not increment`, depending on design decision)
- `failed capture does not increment storage_bytes`
- `api_calls increments on every authenticated request regardless of outcome`

**5. Admin endpoint integration tests**

Follow the `test/admin-keys.test.js` pattern exactly: `SELF.fetch()` with admin auth headers, unique IPs per describe block to avoid rate limit bleed-over, cleanup via `cleanDb()` in beforeEach/afterEach.

Recommended test file: `test/admin-usage.test.js`

Recommended tests:
- `GET /v1/admin/usage without auth returns 401`
- `GET /v1/admin/usage?tenant=acme returns 200 with usage data`
- `GET /v1/admin/usage?tenant=acme returns current period when period param omitted`
- `GET /v1/admin/usage?tenant=acme&period=2026-03 returns specified period`
- `GET /v1/admin/usage?tenant=nonexistent returns empty/zero counters (not 404)`
- `response shape includes capture_count, storage_bytes, api_calls, period, tenant`
- `response includes period boundaries (period_start, period_end) as ISO timestamps`
- `sets Cache-Control: private, no-store`
- `invalid period format returns 400`
- `invalid tenant format returns 400`
- `CAPTURE_API_KEY on usage endpoint returns 401 (admin-only)`

### Test Data Strategy

Use the existing `seedApiKey`, `seedCapture`, and `cleanDb` fixtures from `test/fixtures.js`. Add a new `seedUsageCounter` fixture helper:

```js
export async function seedUsageCounter(db, {
  tenantId = 'default',
  period = '2026-03',
  captureCount = 0,
  storageBytes = 0,
  apiCalls = 0,
} = {}) {
  // Insert or update the usage_counters row directly
  await db.prepare(
    `INSERT INTO usage_counters (tenant_id, period, capture_count, storage_bytes, api_calls)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (tenant_id, period) DO UPDATE SET
       capture_count = excluded.capture_count,
       storage_bytes = excluded.storage_bytes,
       api_calls = excluded.api_calls`
  ).bind(tenantId, period, captureCount, storageBytes, apiCalls).run();
}
```

Update `cleanDb` to include `DELETE FROM usage_counters` in the batch (add it before `DELETE FROM captures` in FK-safe order).

### Test Organization

Two test files:

1. **`test/usage-counters.test.js`** -- Unit tests for the counter DAL functions.
   - Period key derivation (pure function, no D1 needed)
   - Counter increment semantics (real D1 via miniflare)
   - Monotonicity assertions
   - Multi-tenant isolation
   - Storage byte computation (pure function)

2. **`test/admin-usage.test.js`** -- Integration tests for `GET /v1/admin/usage`.
   - Full HTTP round-trip via `SELF.fetch()`
   - Auth, response shape, query params, error cases
   - End-to-end: seed counters, query endpoint, verify response

### What NOT to Test

- Do not test `ctx.waitUntil()` reliability. That is a Cloudflare Workers runtime guarantee, not application logic. The unit tests verify the increment SQL is correct; whether `waitUntil` actually executes the promise is a platform concern.
- Do not test D1 write concurrency. Miniflare D1 is single-connection SQLite; it cannot reproduce production write contention. The monotonicity guarantee comes from SQL atomicity, which is covered by the sequential increment tests.
- Do not test the R2 `put()` return value. We already know it does not return Content-Length. The test strategy is to verify buffer size computation, not R2 behavior.

## Proposed Tasks

### Task 1: Counter DAL Unit Tests (`test/usage-counters.test.js`)
**Deliverables**: New test file with ~15-20 tests covering:
- Period key derivation function (4-5 tests: normal, boundaries, edge cases)
- `incrementUsage()` function (6-8 tests: basic increment, multi-field, batch count, monotonicity, tenant isolation, period isolation)
- `getUsage()` function (3-4 tests: existing period, missing period returns zeros, multi-period query)
- `computeStorageBytes()` helper (4-5 tests: full artifacts, partial, no WACZ, no headers)

**Depends on**: Migration schema (from data-minion) and DAL function signatures (from implementation).

**Estimation**: These are fast, self-contained D1 tests. Should run in under 2 seconds.

### Task 2: Admin Usage Endpoint Integration Tests (`test/admin-usage.test.js`)
**Deliverables**: New test file with ~12-15 tests covering:
- Auth enforcement (2 tests: no auth, wrong auth type)
- Happy path with tenant and period params (3-4 tests)
- Default period behavior (1 test)
- Error cases: invalid tenant, invalid period, missing tenant (3 tests)
- Response shape validation (1 test with detailed assertions)
- Cache headers (1 test)
- Cross-tenant isolation (1 test: tenant A cannot see tenant B's usage)

**Depends on**: Admin endpoint implementation and counter DAL.

**Estimation**: HTTP round-trip tests, ~3-4 seconds total.

### Task 3: Fixture and Cleanup Updates
**Deliverables**:
- Add `seedUsageCounter()` to `test/fixtures.js`
- Update `cleanDb()` to include `usage_counters` table
- Add `computeStorageBytes` export from the counter module for direct testing

**Depends on**: Migration schema.

### Task 4: End-to-End Counter Accuracy Test
**Deliverables**: One integration test (in `test/admin-usage.test.js` or a dedicated describe block) that:
1. Seeds an API key for a tenant
2. Submits a capture via `POST /v1/captures` (using the seeded key)
3. Directly increments counters (simulating what `performCapture` would do, since we cannot run the full browser pipeline in unit tests)
4. Queries `GET /v1/admin/usage` for that tenant
5. Asserts all three counters reflect the operations

This is NOT a browser-based E2E test. It validates the full HTTP -> counter -> query loop without the browser dependency.

**Depends on**: All above tasks.

## Risks and Concerns

### Risk 1: `waitUntil` Writes Are Untestable at the Transport Level

Counter increments happen inside `ctx.waitUntil()`. In Vitest with miniflare, `createExecutionContext()` + `waitUntil()` calls resolve before assertions in most test patterns, but this is not guaranteed. If tests become flaky because waitUntil writes have not flushed:

**Mitigation**: For integration tests via `SELF.fetch()`, miniflare awaits all waitUntil promises before returning the response in the test harness. For unit tests that call DAL functions directly, this is not a concern -- the increment is a direct `await db.prepare(...).run()` call.

If the increment is truly fire-and-forget (no await in the handler), integration tests that query the usage endpoint immediately after a capture request may need a small delay or a direct DB read to verify the counter. Document this explicitly in test comments.

### Risk 2: Storage Byte Computation Diverges from Reality

The byte count computed from buffers before R2 upload may not match the actual stored size if R2 applies compression or encoding changes. In practice, R2 stores objects as-is (no server-side transformation for binary data), but this is an assumption.

**Mitigation**: The integration test pipeline (capture-pipeline.test.js in test/integration/) runs real captures against real R2. Add a storage byte assertion there if a full E2E test later validates the complete pipeline. For now, buffer-level byte computation is sufficient.

### Risk 3: Schema Migration Dependency

All test tasks depend on the D1 migration adding the `usage_counters` table. The migration must be finalized before test implementation begins. If the schema changes after tests are written, tests must be updated.

**Mitigation**: Write tests against the DAL function interface, not raw SQL. If the underlying table structure changes but the function signatures remain stable, tests do not need modification.

### Risk 4: Period Boundary Testing Requires Time Control

Testing month boundaries requires controlling `new Date()`. The existing codebase does NOT mock time anywhere -- it uses real timestamps. Options:
- **Option A**: Use `vi.useFakeTimers()` from Vitest. This replaces `Date`, `setTimeout`, etc. globally. It works but may interfere with miniflare's internal timers.
- **Option B**: Extract period computation into a pure function `computePeriod(date)` that accepts a Date argument. Test the pure function with explicit dates. The DAL increment function calls `computePeriod(new Date())` in production but tests can verify the period logic independently.

**Recommendation**: Option B. It is simpler, does not risk miniflare timer interference, and follows the project's pattern of not mocking internal systems. The DAL function should accept an optional `now` parameter for testing, similar to how `performCapture` accepts an optional `renderer` parameter.

### Risk 5: Counter Table Cleanup in `cleanDb`

Adding `DELETE FROM usage_counters` to `cleanDb()` means all existing tests that call `cleanDb` will also clean the usage counters table. This is correct behavior (clean slate between tests) but if the table does not exist in test environments that have not run the migration, `cleanDb` will throw.

**Mitigation**: The test setup (`apply-migrations.js`) runs all migrations before any test executes. As long as the migration is in the `migrations/` directory, this is handled automatically by `readD1Migrations` + `applyD1Migrations`.

## Additional Agents Needed

None. The test strategy is self-contained. Implementation of the tests depends on outputs from data-minion (schema) and api-design-minion (endpoint shape, increment placement), but no additional planning consultations are needed for the test dimension.
