## Domain Plan Contribution: test-minion

### Recommendations

#### 1. Injectable Safe Browsing Client (Same Pattern as url-validation.js DNS Injection)

The existing `url-validation.js` establishes a clean injectable dependency pattern: `validateUrl(rawUrl, { resolve4, resolve6 } = defaultResolvers)`. The Safe Browsing client must follow the same approach.

The new Safe Browsing module (e.g., `src/safe-browsing.js`) should export a function like:

```js
export async function checkSafeBrowsing(url, { lookup } = defaultLookup) { ... }
```

Where `defaultLookup` calls the real Google Safe Browsing API (using `fetch()` with the API key from env), and tests inject a stub `lookup` function that returns canned threat/clean responses without any network call.

This is the correct approach because:
- It matches the established project pattern (url-validation.js DNS injection, `performCapture()` renderer injection via `stubRenderer`/`consentNotDetectedRenderer`/etc. in fixtures.js)
- It avoids module-scoped mutable state (the CLAUDE.md philosophy: "no module-scoped mutable state")
- It allows unit tests to run without API keys, network access, or fetchMock complexity
- The real implementation is tested in integration tests (advisory pattern) that hit the actual Google API

The function should return a discriminated result:
```js
{ ok: true, safe: true }                    // URL is clean
{ ok: true, safe: false, threats: [...] }   // URL has threats
{ ok: false, error: string }                // API unreachable (degrade gracefully)
```

**Important**: The capture hot path must handle API failures gracefully. If Safe Browsing is unreachable, captures should proceed (log a warning, do not block) -- this aligns with the Helix Manifesto principle "ops reliability wins" and the "fail loudly, degrade intentionally" rule. The system must distinguish "service unavailable" from "URL is unsafe" in both logs and API responses.

#### 2. Unit Test Strategy for Safe Browsing Client

Create `test/safe-browsing.test.js` with injectable stubs. The test file structure should follow the existing url-validation.test.js pattern:

**Stub definitions at top of file:**
```js
const cleanLookup = async (url) => ({ safe: true, threats: [] });
const malwareLookup = async (url) => ({ safe: false, threats: ['MALWARE'] });
const socialEngineeringLookup = async (url) => ({ safe: false, threats: ['SOCIAL_ENGINEERING'] });
const multiThreatLookup = async (url) => ({ safe: false, threats: ['MALWARE', 'SOCIAL_ENGINEERING'] });
const apiErrorLookup = async (url) => { throw new Error('API unavailable'); };
const timeoutLookup = async (url) => { throw new Error('Request timed out'); };
```

**Test categories (following AAA pattern):**
1. **Clean URL returns safe=true** -- verifies the happy path
2. **Malware URL returns safe=false with threat types** -- each threat type individually
3. **Multiple threat types returned correctly** -- combined threat response
4. **API failure degrades gracefully** -- returns `{ ok: false, error }` not throws
5. **Timeout handling** -- does not hang indefinitely, returns degraded result
6. **URL normalization** -- same URL in different forms gets consistent results
7. **Empty/null URL rejected** -- input validation

#### 3. Unit Tests for Pre-Capture Safe Browsing Check

The capture creation endpoint (`POST /v1/captures`) already calls `validateUrl()` before accepting the request. The Safe Browsing check should be added at a similar point. Tests in `test/capture-integration.test.js` (which uses `SELF.fetch()` against the real worker) should verify:

1. **Capture rejected for unsafe URL** -- `POST /v1/captures` with URL known-unsafe returns 422 (or 403) with RFC 9457 problem response, detail indicates threat type
2. **Capture accepted for safe URL** -- existing happy path continues working
3. **Capture proceeds when Safe Browsing API unavailable** -- graceful degradation; capture still accepted with a logged warning

The Safe Browsing check in the capture endpoint needs to be mockable. Since `capture-integration.test.js` uses `SELF.fetch()` (full HTTP through the worker), the mock must be at the `fetch()` level using `fetchMock` from `cloudflare:test`. The Safe Browsing API call will be an outbound `fetch()` to Google's API endpoint, so `fetchMock` can intercept it:

```js
fetchMock.get('https://safebrowsing.googleapis.com')
  .intercept({ path: /\/v4\/threatMatches:find/ })
  .reply(200, JSON.stringify({ matches: [{ threatType: 'MALWARE' }] }));
```

This is exactly how `capture-integration.test.js` already mocks the header fetch to `93.184.216.34`.

#### 4. Quarantine Status and Artifact Retrieval Gate Tests

A new `quarantined` status value needs testing at the retrieval layer. Currently `handleGetCapture` and `handleGetCaptureArtifact` (lines 1294-1406 of index.js) only serve captures with `status === 'complete'`. Quarantined captures should be blocked.

**Option A (preferred): Add `quarantined` to status CHECK constraint, existing gates already block.**
The current code checks `record.status !== 'complete'` and returns 404. If quarantine sets status to something other than `complete`, the existing gates already block retrieval. The test only needs to verify the D1 row has the correct status and that retrieval returns 404/403.

**Option B: Separate quarantine column.**
Add a `quarantined_at` / `quarantine_reason` column to captures. Retrieval handlers check this column in addition to status. More explicit but requires modifying more retrieval paths.

Recommend Option A with status `'quarantined'` added to the CHECK constraint in a new migration, since the pattern is consistent with `'pending'`/`'complete'`/`'failed'`. Tests:

- In `test/capture-retrieval.test.js`: seed a capture with `status='quarantined'` via `seedCapture()`, verify GET metadata returns 404 (or 403 with a specific problem detail), verify GET artifact returns 404 (or 403)
- Verify the `GET /v1/verify/{id}` endpoint also blocks quarantined captures
- Verify `GET /v1/captures` list endpoint either filters out quarantined captures or includes them with `status: 'quarantined'` (design decision for the implementation team)

#### 5. Re-Scan Cron Test Strategy (Within Miniflare Constraints)

The existing `test/scheduled-handler.test.js` demonstrates the pattern perfectly: call `worker.scheduled(controller, env, ctx)` directly with a synthetic `ScheduledController`, then inspect D1 state. No real cron trigger needed.

The re-scan cron should be testable the same way. Key points:

**The re-scan handler should be a separate exported function** (like `handleScheduledTick` in `src/scheduler.js`) that can be called directly. Whether it runs on the same `*/1 * * * *` trigger or a separate cron expression (e.g., `0 */6 * * *` for every 6 hours), the test calls it the same way:

```js
const controller = { scheduledTime: Date.now(), cron: '0 */6 * * *', noRetry() {} };
const ctx = createExecutionContext();
await worker.scheduled(controller, env, ctx);
```

**Test scenarios for re-scan cron:**

1. **No captures to re-scan** -- handler completes without side effects. Seed only recent captures (created_at within 24h) and verify no changes.

2. **One stale capture found unsafe** -- Seed a `complete` capture with `created_at` older than the re-scan threshold. The Safe Browsing lookup stub returns unsafe. Verify:
   - Capture status transitions to `quarantined`
   - `quarantined_at` timestamp is set
   - Quarantine reason recorded (e.g., `safe_browsing:MALWARE`)

3. **One stale capture still clean** -- Safe Browsing stub returns safe. Verify capture remains `complete`, last_scanned_at updated.

4. **Re-scan respects batch limits** -- Seed more captures than the batch size. Verify only batch-size captures are processed per tick (prevents cron from running unbounded).

5. **Re-scan skips already-quarantined captures** -- Seed a quarantined capture. Verify it is not re-checked.

6. **API failure during re-scan** -- Safe Browsing stub throws. Verify capture remains `complete` (no false quarantine on API failure).

**Miniflare constraint**: The test must NOT rely on actual cron scheduling. Miniflare's `scheduled()` can be invoked programmatically. The `wrangler.test.toml` already omits `[triggers]` sections. The re-scan logic should be callable as a function, tested via direct invocation just like `handleScheduledTick`.

**D1 query for re-scan candidates**: The implementation will need an index on captures for the re-scan query. Something like:
```sql
SELECT id, url FROM captures
WHERE status = 'complete'
  AND (last_scanned_at IS NULL OR last_scanned_at < datetime('now', '-7 days'))
ORDER BY last_scanned_at ASC NULLS FIRST
LIMIT 50
```
The test seeds captures with specific `last_scanned_at` values and verifies the correct subset is selected.

#### 6. Integration Test for End-to-End Quarantine Behavior

An integration-level test (in `test/integration/` or as a thorough unit test using `SELF.fetch()`) should exercise the full quarantine lifecycle:

1. **Seed a complete capture** with R2 artifacts (using the pattern from `capture-retrieval.test.js`)
2. **Verify artifacts are accessible** -- GET artifact returns 200
3. **Trigger re-scan** that marks the capture quarantined (mock Safe Browsing returns unsafe)
4. **Verify artifacts are now blocked** -- GET artifact returns 404/403
5. **Verify capture metadata reflects quarantine** -- GET capture returns quarantined status (or 404, depending on design)

This is a critical user journey test. It must run within the miniflare unit test environment (no real Safe Browsing API needed since the lookup is injected).

#### 7. Fixtures and Test Helpers

Add to `test/fixtures.js`:

```js
// ---------------------------------------------------------------------------
// Safe Browsing stubs
// ---------------------------------------------------------------------------

export const safeBrowsingClean = async (url) => ({ safe: true, threats: [] });
export const safeBrowsingMalware = async (url) => ({ safe: false, threats: ['MALWARE'] });
export const safeBrowsingUnavailable = async (url) => { throw new Error('Safe Browsing API unavailable'); };
```

Add to `seedCapture()` in fixtures.js: support for `lastScannedAt` and `quarantinedAt` parameters once the migration adds those columns.

Update `cleanDb()` to handle any new tables/columns.

### Proposed Tasks

1. **Create Safe Browsing client module** (`src/safe-browsing.js`) with injectable `lookup` parameter, following the url-validation.js DNS injection pattern. Return discriminated result objects. Handle API failures gracefully (degrade, don't block).

2. **Write unit tests for Safe Browsing client** (`test/safe-browsing.test.js`). Cover: clean URL, each threat type, multi-threat, API failure, timeout, input validation. All tests use injected stubs -- zero network calls.

3. **Write D1 migration** (`migrations/0009_safe_browsing.sql`). Add `quarantined` to captures status CHECK constraint. Add `last_scanned_at` and `quarantine_reason` columns. Add index for re-scan query on `(status, last_scanned_at)`.

4. **Wire Safe Browsing check into capture creation** (pre-capture gate in `POST /v1/captures` handler). Add fetchMock-based tests in `test/capture-integration.test.js` for: rejected unsafe URL, accepted safe URL, graceful degradation when API unavailable.

5. **Wire quarantine blocking into retrieval handlers** (`handleGetCapture`, `handleGetCaptureArtifact`, `handleVerifyCapture`, `handleCaptureStatus`). Add tests in `test/capture-retrieval.test.js` using `seedCapture()` with quarantined status.

6. **Implement re-scan handler** (new function in `src/scheduler.js` or new `src/safe-browsing-rescan.js`). Export as callable function. Wire into `scheduled()` handler on appropriate cron expression.

7. **Write re-scan cron unit tests** (`test/safe-browsing-rescan.test.js`). Use `worker.scheduled()` direct invocation pattern from `scheduled-handler.test.js`. Cover: no candidates, unsafe found, clean confirmed, batch limits, skip quarantined, API failure safe.

8. **Write quarantine lifecycle integration test** (in existing `test/capture-retrieval.test.js` or new file). Full cycle: complete capture -> accessible -> re-scan quarantines -> blocked.

9. **Add Safe Browsing stubs to fixtures.js**. Export reusable stub functions for clean/malware/unavailable responses.

10. **Add advisory integration test** for real Safe Browsing API (in `test/integration/`). Pattern: call real Google API with known-safe URL (example.com), verify clean response. Allowed to fail (network isolation). Requires `SAFE_BROWSING_API_KEY` binding in vitest.config.js (test-only key, not production).

### Risks and Concerns

1. **Google Safe Browsing API key management**: The API key must be a Wrangler secret (`SAFE_BROWSING_API_KEY`). In tests, the binding can be a placeholder string since unit tests never call the real API. For integration tests, a real test key is needed. Risk: key not configured in CI causes advisory test failures (acceptable if advisory pattern followed).

2. **Capture hot path latency**: Safe Browsing lookup adds latency to `POST /v1/captures`. The Google Update API (v4) has a local hash prefix check that reduces API calls. Consider whether to implement local prefix matching (complexity) or accept the API roundtrip (simpler, ~50-100ms). The test strategy is the same either way -- the injectable lookup abstracts the implementation.

3. **Quarantine status in the CHECK constraint**: D1's ALTER TABLE support is limited. Adding a new value to an existing CHECK constraint requires `ALTER TABLE captures ADD CHECK(...)` which SQLite does NOT support. The migration must either:
   - Drop and recreate the table (data loss risk) -- NOT recommended
   - Remove the CHECK constraint and enforce status values in application code (already done for tiers/billing_status in db.js)
   - Create the column without modifying the existing CHECK (if `quarantined` is a separate column)

   **This is a significant technical constraint.** The implementation team must verify D1's migration support for CHECK constraint modification. If the existing CHECK cannot be altered, Option B (separate `quarantined_at` column) becomes necessary. Tests should assert the correct quarantine state regardless of schema approach.

4. **Re-scan batch size and cron frequency**: If re-scan processes 50 captures per tick and runs every 6 hours, a corpus of 10,000 captures takes ~8 days to fully re-scan. This may be acceptable for MVP. Tests should verify the batch limit is respected regardless of the actual value chosen.

5. **Queue consumer interaction**: The existing queue consumer (`handleCaptureMessage` in index.js) does a URL validation check before processing. Should it also do a Safe Browsing check? If so, a capture could be accepted by `POST /v1/captures` but rejected by the queue consumer if the URL becomes unsafe between enqueue and dequeue. This creates a race condition that should be explicitly tested (or explicitly documented as accepted risk).

6. **fetchMock scope in capture-integration tests**: The existing tests already use `fetchMock.activate()` / `fetchMock.disableNetConnect()` in beforeEach/afterEach. Adding Safe Browsing API mocking means every test that calls the capture endpoint will need to also mock the Safe Browsing API response. This is maintainable but adds boilerplate. Consider a shared helper function (like the existing `activateFetchMock()` in capture-integration.test.js) that sets up both the header fetch mock AND the Safe Browsing mock.

7. **Status transition integrity**: Currently captures transition `pending -> complete` or `pending -> failed`. Adding `complete -> quarantined` is a new post-terminal transition. Tests must verify that only `complete` captures can be quarantined (not `pending` or `failed`), and that quarantine is idempotent (re-scanning an already-quarantined capture is a no-op).

### Additional Agents Needed

- **api-design-minion**: Needs to define the API response shape for quarantined captures. Should `GET /v1/captures/{id}` return 404 (current behavior for non-complete) or a new 403/451 with problem detail explaining the quarantine? Should the list endpoint include quarantined captures with a `quarantined` status or filter them out? The Safe Browsing check rejection response on `POST /v1/captures` also needs a defined problem type.

- **iac-minion**: The `SAFE_BROWSING_API_KEY` secret needs to be provisioned in both staging and production environments via `wrangler secret put`. The 1Password WRL vault needs a new field. The wrangler.test.toml needs a placeholder binding for the key.
