## Delegation Plan

**Team name**: r8-auth-identity-r1-list-captures
**Description**: Implement auth identity enrichment (R8/#38) and list captures endpoint (R1/#31) for Web Resource Ledger. R8 adds tenantId to verifyApiKey() and threads it through logging and KV operations. R1 adds GET /v1/captures with cursor-based pagination, status filter, and tenant-scoped secondary KV index.

### Task 1: R8 -- Auth identity enrichment + tenantId threading

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Auth Identity Enrichment (R8 / Issue #38)

    You are implementing auth identity enrichment for the Web Resource Ledger
    Cloudflare Worker. This is a focused refactor: `verifyApiKey()` currently
    returns `{ ok: true }` on success; change it to return
    `{ ok: true, tenantId: 'default' }`. Then thread `tenantId` through logging
    and KV operations so the system is ready for tenant-scoped features.

    ### What to do

    **1. `src/auth.js` -- Enrich verifyApiKey() return value**

    - Change line 80 from `return { ok: true }` to `return { ok: true, tenantId: 'default' }`.
    - Add tenantId validation with regex `/^[a-z0-9_-]{1,64}$/` even though
      the value is hardcoded today. This establishes the validation contract
      that R12 (per-tenant keys) will depend on. Apply the validation in
      verifyApiKey() itself -- it is the trust boundary.
    - Update the JSDoc `@returns` to reflect `{ ok: true, tenantId: string }`.
      Document: "tenantId matches /^[a-z0-9_-]{1,64}$/ -- callers may use it
      in key construction without further sanitization."
    - Error results must NOT include tenantId. A failed auth reveals nothing
      about tenant structure.

    **2. `src/kv.js` -- Add tenantPrefix helper and index key writes**

    - Add a `tenantPrefix(tenantId)` helper that validates tenantId with
      `/^[a-z0-9_-]{1,64}$/` and returns `tenant:${tenantId}:`. This is
      defense-in-depth against bypass of auth-layer validation. If validation
      fails, throw (fail closed).
    - Modify `createCapture(kv, captureId, url, ip, tenantId)` to:
      - Accept `tenantId` as a required 5th parameter (no default value).
      - Store `tenantId` in the primary record value object.
      - Generate `createdAt` timestamp ONCE and use for both the primary
        record and the index key.
      - After writing the primary record, write the secondary index key:
        `tenant:{tenantId}:ts:{createdAt}:{captureId}` with value `''`
        (empty string) and same `expirationTtl: 86400`.
      - If the index write fails, log a warning but do NOT throw -- the
        primary record exists and the capture is functional. The capture
        just won't appear in listings.
    - Modify `completeCapture()` to also re-write the index key without TTL.
      Extract `createdAt` and `tenantId` from the existing record to
      reconstruct the index key. If the existing record has no tenantId
      (pre-R8 records), default to `'default'`.
    - Modify `failCapture()` with the same index key TTL update as
      completeCapture().
    - Export `tenantPrefix` for use by the list endpoint (Task 2).
    - Keep `KEY_PREFIX = 'capture:'` as-is for primary keys.

    **3. `src/index.js` -- Thread tenantId through handleCreateCapture**

    - After auth succeeds at line 70-74, destructure `tenantId` from `auth`:
      `const { tenantId } = auth;`
    - Pass `tenantId` to `createCapture()` call at line 124:
      `await createCapture(env.KV, captureId, result.url, result.ip, tenantId);`
    - Pass `tenantId` to `performCapture()` call at line 130:
      `ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId));`
    - Add `tenantId` to the `security.ssrf_block` log at line 115.

    **4. `src/capture.js` -- Thread tenantId through capture pipeline**

    - Change `performCapture` signature from
      `(env, url, ip, captureId, renderer = defaultRenderer)` to
      `(env, url, ip, captureId, tenantId, renderer = defaultRenderer)`.
    - Add `tenantId` to ALL six log calls in the capture pipeline:
      `capture.stage.fail`, `capture.header_fail`, `capture.wacz_fail`,
      `capture.success`, `capture.fail`, `capture.kv_fail`.
    - Pass `tenantId` to `completeCapture()` -- not needed as a parameter
      since completeCapture reads it from the existing record.
    - Do NOT add tenantId to pre-auth/unauthenticated log calls
      (`security.auth_fail`, `security.rate_limit`, `security.capacity_limit`).

    **5. Update tests for signature changes**

    All existing test call sites for `createCapture()` will break because
    of the new required `tenantId` parameter. Fix these:

    - `test/kv.test.js` -- Update all `createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP)`
      calls to `createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default')`.
      Add tests:
      - `createCapture` stores tenantId in the primary record value.
      - `createCapture` writes index key `tenant:default:ts:{ISO}:{id}`
        (verify via `env.KV.list({ prefix: 'tenant:default:ts:' })`).
      - Index key format matches `/^tenant:default:ts:\d{4}-\d{2}-\d{2}T.+:cap_/`.
      - `completeCapture` re-writes index key (verify it still exists
        after completion and has no TTL -- miniflare KV.getWithMetadata
        can check this).
      - `failCapture` re-writes index key similarly.
    - `test/auth.test.js` -- Update the success test to assert
      `result.tenantId === 'default'`. Add test that error results have
      `result.tenantId === undefined`.
    - `test/capture.test.js` -- Update `performCapture()` calls to
      include `tenantId` parameter. The renderer parameter moves to position 6.
    - `test/capture-integration.test.js` -- Update any direct
      `createCapture` calls. Add assertion that the KV record includes
      `tenantId: 'default'` after a successful POST.
    - `test/capture-retrieval.test.js` -- Update `createCapture` and
      `completeCapture` calls to include tenantId.

    ### What NOT to do

    - Do NOT change primary KV keys from `capture:{captureId}`. Only add
      the new secondary index keys.
    - Do NOT add a `requireAuth()` wrapper function -- the current inline
      pattern is fine for 2-3 authenticated endpoints. KISS.
    - Do NOT create a separate cursor module yet -- that is Task 2's scope.
    - Do NOT change the `note` field in the 202 response yet -- that is
      Task 3's scope.
    - Do NOT modify `log.js` -- tenantId is just another field in the data
      object; no schema changes needed at the transport layer.
    - Do NOT change unauthenticated endpoints or their tests.

    ### Codebase context

    - `src/auth.js` (82 lines) -- verifyApiKey function
    - `src/kv.js` (101 lines) -- KV access layer
    - `src/index.js` (383 lines) -- router + handlers
    - `src/capture.js` (~395 lines) -- capture pipeline
    - `src/log.js` (37 lines) -- Coralogix logging (NO changes needed)
    - `src/responses.js` (43 lines) -- response helpers (NO changes needed)

    ### Deliverables

    Modified files: `src/auth.js`, `src/kv.js`, `src/index.js`,
    `src/capture.js`, `test/auth.test.js`, `test/kv.test.js`,
    `test/capture.test.js`, `test/capture-integration.test.js`,
    `test/capture-retrieval.test.js`

    ### Success criteria

    - `npx vitest run` passes with all existing + new tests green.
    - `verifyApiKey()` returns `{ ok: true, tenantId: 'default' }`.
    - Every `createCapture()` call writes both primary and index keys.
    - `completeCapture()` and `failCapture()` re-write index keys without TTL.
    - All post-auth log calls include `tenantId` in the data object.
    - No pre-auth log calls include `tenantId`.

- **Deliverables**: Modified `src/auth.js`, `src/kv.js`, `src/index.js`, `src/capture.js`, and 5 updated test files with new assertions for tenantId threading and index key writes.
- **Success criteria**: All existing tests pass with updated signatures. New tests verify tenantId in auth return, index key format, and tenantId in log data.

### Task 2: R1 -- List captures endpoint implementation

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: The API contract (response envelope, cursor format, CaptureSummary projection, status filter behavior) and KV key schema are hard-to-reverse decisions with downstream dependents (Task 3 docs, all future API consumers, future D1 migration). Combined gate for both concerns since they are tightly coupled.
- **Prompt**: |
    ## Task: List Captures Endpoint (R1 / Issue #31)

    You are implementing `GET /v1/captures` for the Web Resource Ledger
    Cloudflare Worker. This endpoint lists captures with cursor-based
    pagination, optional status filtering, and Bearer auth. The secondary
    KV index keys (`tenant:{tenantId}:ts:{ISO}:{captureId}`) are already
    written by Task 1 (R8 auth enrichment).

    ### API Contract

    **Endpoint:** `GET /v1/captures`

    **Auth:** Bearer token required (same as POST /v1/captures). Uses
    existing `verifyApiKey()` which returns `{ ok: true, tenantId }`.

    **Query parameters:**
    - `limit` -- integer, default 20, min 1, max 100. Values > 100 are
      silently clamped to 100. Values < 1, non-integer, or non-numeric
      return 400.
    - `cursor` -- opaque string. If provided, resume from this position.
      If absent, start from the beginning.
    - `status` -- enum: `pending`, `complete`, `failed`. Optional filter.
      Invalid values return 400 with detail:
      `"Query parameter 'status' must be one of: pending, complete, failed."`

    **Response envelope:**
    ```json
    {
      "data": [ ...CaptureSummary items... ],
      "pagination": {
        "cursor": "opaque-base64url-string-or-null",
        "hasMore": true,
        "limit": 20
      }
    }
    ```

    - `data` is always an array (empty array for no results, never null).
    - `pagination.cursor` is present (string) when `hasMore` is true,
      null when `hasMore` is false.
    - `pagination.limit` echoes the effective page size applied.
    - No `totalCount` field. KV does not support it cheaply. YAGNI.
    - Return 200 with empty data array for no results. Never 404.

    **CaptureSummary item shape:**
    ```json
    {
      "id": "cap_...",
      "status": "complete",
      "url": "https://example.com",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "completedAt": "2024-01-15T10:30:45.123Z"
    }
    ```

    Fields by status:
    - Always present: `id`, `status`, `url`, `createdAt`
    - `complete`: adds `completedAt`
    - `failed`: adds `failedAt`, `error`, `retryable`
    - `pending`: no additional fields

    SECURITY: Never include `ip`, R2 keys (`artifacts.*` values, `wacz.key`),
    or any internal fields in CaptureSummary.

    **Error responses (existing RFC 9457 ProblemDetail pattern):**
    - 401: Missing/invalid auth (existing verifyApiKey behavior)
    - 400: Invalid `status`, invalid `cursor` (malformed), invalid `limit`
    - 429: Rate limited (reuse existing rate limiter)
    - 503: Service misconfigured (no API key env var)

    **Headers:**
    - `Cache-Control: private, no-store`
    - Standard security headers (added by router post-handler)

    ### What to do

    **1. `src/kv.js` -- Add listCaptures function**

    Add a new exported function:
    ```js
    export async function listCaptures(kv, tenantId, { cursor, limit, status } = {})
    ```

    Implementation:
    - Use `tenantPrefix(tenantId)` (from Task 1) to build the prefix:
      `${tenantPrefix(tenantId)}ts:`.
    - Call `kv.list({ prefix, limit: effectiveLimit + 1, cursor: kvCursor })`.
      Fetch `limit + 1` keys to determine if there are more results
      (the +1 trick: if you get limit+1 results, there are more; return
      only limit items and set hasMore=true).
    - For each key, extract captureId from the key suffix. The captureId
      is always the last colon-delimited segment: use
      `key.name.slice(key.name.lastIndexOf(':') + 1)`.
    - Fetch all capture records in parallel:
      `await Promise.all(captureIds.map(id => getCapture(kv, id)))`.
    - Filter out null records (expired/orphaned index keys -- skip silently).
    - If `status` filter is provided, filter records by status in memory.

    **Cursor strategy -- use custom opaque cursor, NOT KV native cursor:**
    - Encode cursor as base64url of JSON `{"ts":"<ISO>","id":"<captureId>"}`.
      These are the last item's timestamp and ID from the current page.
    - On decode: use the ts+id to construct the KV list start-after key.
      KV `list()` does not have a `startAfter` parameter, but it does have
      `cursor` which is KV's own pagination token. Instead, use the custom
      cursor to construct a prefix-based approach: pass
      `prefix: tenant:{tenantId}:ts:` and the KV-native cursor from the
      list result for actual pagination.
    - SIMPLER APPROACH: Use KV's native `list_complete` and `cursor` from
      the KV list result directly. Wrap the KV cursor in a base64url JSON
      envelope: `{"kv":"<kv-native-cursor>"}`. This decouples the API cursor
      format from the KV cursor format while using KV's native pagination.
      On the first request (no cursor), call `kv.list({ prefix, limit })`.
      On subsequent requests, decode the API cursor, extract the KV cursor,
      call `kv.list({ prefix, limit, cursor: kvCursor })`.
    - Return `{ data: [...records], pagination: { cursor, hasMore, limit } }`.

    **Status filtering with over-fetch:**
    When `status` is specified, records are filtered in memory after fetch.
    This means a page might have fewer items than `limit`. To handle this:
    - Fetch `limit * 3` keys from KV when status filter is active.
    - Filter, take up to `limit` matching records.
    - If fewer than `limit` match and KV has more keys (`list_complete`
      is false), continue fetching in a loop (max 3 iterations to bound
      cost).
    - Set a scan depth limit of 500 keys total to prevent runaway scans.
    - Return whatever matches within the budget with `hasMore: true` if
      the scan budget is exhausted (there might be more matching records
      beyond the scan limit).

    **Sort order:** Ascending chronological (oldest-first). KV `list()`
    returns keys in lexicographic ascending order, and ISO timestamps sort
    chronologically ascending. Accept this for MVP per KISS/YAGNI. Document
    that sort order is ascending. Do NOT use reverse-timestamp encoding.

    **2. `src/index.js` -- Add route and handler**

    - Add route to the routes array, BEFORE the captureId routes:
      `['GET', /^\/v1\/captures$/, handleListCaptures]`
      (This regex won't conflict with the captureId regex because
      `/v1/captures` without a trailing segment doesn't match
      `/v1\/captures\/(cap_...)`)
    - Import `listCaptures` from `./kv.js`.
    - Implement `handleListCaptures(request, env, ctx, match)`:

    ```
    Step 1: Auth check -- call verifyApiKey(), return auth.response on failure.
            Log security.auth_fail on failure (same pattern as handleCreateCapture).
    Step 2: Parse query params from new URL(request.url).searchParams.
            - limit: parseInt, validate 1-100, clamp > 100 to 100, return 400
              for non-positive/non-numeric.
            - cursor: string or undefined.
            - status: validate against ['pending', 'complete', 'failed'] if present.
    Step 3: const start = Date.now();
    Step 4: Call listCaptures(env.KV, auth.tenantId, { cursor, limit, status }).
    Step 5: Build CaptureSummary projection from each record. Strip internal
            fields (ip, artifacts.* R2 keys, wacz.key). Keep only:
            id, status, url, createdAt, and conditional fields per status.
    Step 6: Log list.success: { event: 'list.success', tenantId, resultCount,
            cursor: pagination.cursor ? 'present' : 'absent', durationMs }.
    Step 7: Return jsonResponse({ data, pagination }, 200,
            { 'Cache-Control': 'private, no-store' }).
    ```

    - On KV errors: catch, log `list.error` with tenantId and errorClass,
      return problemResponse(500, 'Could not list captures').
    - On invalid cursor (base64 decode or JSON parse fails): return
      problemResponse(400, "Query parameter 'cursor' is invalid.").
    - Rate limiting: reuse existing `CAPTURE_RATE_LIMITER` for the list
      endpoint. It is the same authenticated surface. A dedicated limiter
      can be added later if needed.

    **3. `openapi.yaml` -- Add endpoint and schemas**

    Add these new component schemas:
    - `CaptureSummary` -- with fields per status as described above.
    - `Pagination` -- `{ cursor: string|null, hasMore: boolean, limit: integer }`.
    - `CaptureListResponse` -- `{ data: CaptureSummary[], pagination: Pagination }`.

    Add the path `GET /v1/captures`:
    - operationId: `listCaptures`
    - security: `[bearerAuth: []]`
    - Query parameters: `limit`, `cursor`, `status`
    - 200 response with `CaptureListResponse`
    - 400, 401, 429 error responses
    - Description: Note that only captures created after this feature
      was deployed appear in list results. Older captures remain
      accessible via direct ID.

    Bump `info.version` from `0.1.0` to `0.2.0`.

    **4. `test/list-captures.test.js` -- New test file**

    Create a comprehensive test file. Use the same patterns as existing
    test files: import `env, SELF` from `cloudflare:test`, seed data via
    KV module functions (not HTTP POST), use `vi.useFakeTimers()` to
    control timestamps for ordering assertions.

    Test structure:
    ```
    describe('GET /v1/captures -- auth')
      - 401 without Authorization header
      - 401 with wrong API key
      - 200 with valid Bearer token

    describe('GET /v1/captures -- empty results')
      - returns { data: [], pagination: { hasMore: false, cursor: null, limit: 20 } }

    describe('GET /v1/captures -- populated results')
      - returns correct CaptureSummary shape for complete captures
      - returns correct shape for failed captures (includes error, retryable)
      - returns correct shape for pending captures (no completedAt)
      - does not include ip field
      - does not include R2 keys (artifacts values, wacz.key)

    describe('GET /v1/captures -- status filter')
      - ?status=complete returns only complete captures
      - ?status=pending returns only pending captures
      - ?status=failed returns only failed captures
      - ?status=invalid returns 400

    describe('GET /v1/captures -- pagination')
      - default limit is 20
      - respects custom limit
      - limit > 100 clamped to 100
      - limit=0 returns 400
      - limit=-1 returns 400
      - limit=abc returns 400
      - first page has hasMore: true and cursor when more items exist
      - passing cursor returns next page
      - final page has hasMore: false and cursor: null
      - CRITICAL: round-trip pagination (seed 25 items, paginate with
        limit=10, collect all, assert 25 unique items, no duplicates,
        correct order)
      - invalid cursor returns 400

    describe('GET /v1/captures -- headers')
      - Cache-Control: private, no-store
      - Content-Type: application/json
      - standard security headers
    ```

    AUTH constant: `'Bearer test-api-key-for-vitest'` (matches wrangler.toml
    test configuration). Use `SELF.fetch()` for HTTP-level tests.

    Seed data using `createCapture()` (from `../src/kv.js`), then
    `completeCapture()` or `failCapture()` to set status. Remember:
    `createCapture` now requires tenantId as 5th param (from Task 1).

    For pagination tests with timestamp ordering, use `vi.useFakeTimers()`
    to control `new Date()` output:
    ```js
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await createCapture(env.KV, id1, url, ip, 'default');
    vi.setSystemTime(new Date('2026-01-01T00:01:00.000Z'));
    await createCapture(env.KV, id2, url, ip, 'default');
    // etc.
    vi.useRealTimers(); // in afterEach
    ```

    **5. Update `test/kv.test.js` -- Add listCaptures unit tests**

    Add a describe block for `listCaptures`:
    - Returns empty array for empty KV
    - Returns captures for given tenantId
    - Respects limit parameter
    - Returns cursor when more results exist
    - Returns no cursor on final page
    - Applies status filter
    - Handles orphaned index keys (key exists but record expired)

    ### What NOT to do

    - Do NOT use reverse-timestamp encoding for index keys. Ascending is fine.
    - Do NOT add totalCount to the response envelope.
    - Do NOT create per-status secondary indexes.
    - Do NOT create a separate cursor.js module -- keep cursor encode/decode
      in kv.js alongside listCaptures. KISS.
    - Do NOT add a dedicated rate limiter binding for the list endpoint.
      Reuse the existing CAPTURE_RATE_LIMITER.
    - Do NOT change the 202 response `note` field yet (Task 3 handles this).
    - Do NOT version the cursor format. If the format changes, old cursors
      will fail gracefully with 400. This is acceptable.
    - Do NOT add CORS headers to the list endpoint (it requires auth;
      CORS is handled separately in R3).

    ### Codebase context

    - `src/kv.js` -- already has `tenantPrefix()` and index key writes from Task 1
    - `src/index.js` -- router pattern: `[method, regex, handler]`
    - `src/responses.js` -- `jsonResponse()` and `problemResponse()` helpers
    - `src/auth.js` -- `verifyApiKey()` returns `{ ok: true, tenantId }` after Task 1
    - `openapi.yaml` -- existing schemas under components/schemas
    - `test/capture-integration.test.js` -- reference for SELF.fetch pattern
    - `test/capture-retrieval.test.js` -- reference for seeding data via KV module functions

    ### Deliverables

    Modified: `src/kv.js`, `src/index.js`, `openapi.yaml`, `test/kv.test.js`
    New: `test/list-captures.test.js`

    ### Success criteria

    - `npx vitest run` passes with all existing + new tests green.
    - `GET /v1/captures` returns 401 without auth.
    - `GET /v1/captures` returns `{ data: [], pagination }` when empty.
    - Pagination round-trip test passes (25 items, 3 pages, all unique).
    - Status filter returns only matching captures.
    - CaptureSummary does not include ip or R2 keys.
    - `Cache-Control: private, no-store` on all list responses.
    - openapi.yaml validates (if redocly/cli is available).

- **Deliverables**: Modified `src/kv.js`, `src/index.js`, `openapi.yaml`; new `test/list-captures.test.js`; updated `test/kv.test.js`.
- **Success criteria**: Full test suite passes. Pagination round-trip test verifies no duplicates/missing items. OpenAPI spec validates. API contract matches documented envelope.

### Task 3: Documentation cleanup -- lost-ID warnings and list endpoint docs

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Documentation Cleanup -- Lost-ID Warnings and List Endpoint Docs

    The list endpoint (GET /v1/captures) has shipped. Now clean up all
    "lost-ID" warnings across the codebase and add list endpoint
    documentation to the README.

    ### What to do

    **1. `src/index.js` -- Update 202 response note**

    Change line 139 from:
    ```
    note: 'No list endpoint is available. Store the capture ID -- it is the only way to access this capture.',
    ```
    to:
    ```
    note: 'Use GET /v1/captures to list and search your captures.',
    ```

    **2. `openapi.yaml` -- Update lost-ID language**

    - `CaptureRecord` description (around line 192-193): Remove the sentence
      "Store it; there is no listing endpoint to recover it." Replace with
      "Captures are also accessible via GET /v1/captures."
    - `CaptureAccepted.properties.note.description`: Change from
      "Advisory message reminding callers to store the capture ID" to
      "Advisory message about related API capabilities."
    - POST 202 response example `note` value (around line 580): Change to
      match the new runtime value.
    - `CaptureId` description: Change "Also serves as the access secret --
      store it." to "Also serves as the access secret for per-capture access."

    **3. `README.md` -- Update lost-ID warnings and add list endpoint usage**

    - Line 44 (example response JSON): Update the `note` field value to
      match the new runtime value.
    - Line 48: Replace "Store the capture ID. There is no listing endpoint
      to recover it." with: "Your captures are always accessible. Use
      `GET /v1/captures` to list them, or save the capture ID for direct access."
    - Line 74: Change "The raw capture ID grants full access to all artifacts --
      treat it as a secret." to "The capture ID grants full access to all
      artifacts without authentication -- treat it as a secret. Anyone with
      the ID can view the capture."
    - Add a brief usage example for `GET /v1/captures` near the existing
      usage examples. Include a curl command with Bearer auth and a sample
      paginated response showing the `{ data, pagination }` envelope.
    - Add a 2-3 sentence conceptual framing of the dual-access model:
      "**Finding captures:** `GET /v1/captures` lists your captures (requires
      your API key). Use it to browse and recover capture IDs.
      **Sharing captures:** The capture ID in any URL works without
      authentication. Share verification URLs freely."

    **4. `docs/MVP.md` -- Annotate resolved limitations**

    - Line 48 ("There is no list endpoint in the MVP..."): Add inline
      annotation: "*(Resolved: R1 added `GET /v1/captures` with pagination
      and status filter.)*"
    - Line 71 ("List/search captures" in "What's Out" table): Add annotation
      in the same row: "Resolved in R1."
    - Do NOT delete the original text -- it documents the MVP scope decision.

    **5. `docs/backlog.md` -- Clean up resolved items**

    - Remove the "Capture ID recovery" row (marked as "Solved by R1").
    - Mark R1 as complete/shipped in whatever format the backlog uses.

    ### What NOT to do

    - Do NOT change any functional code (handlers, KV operations, auth).
    - Do NOT add a "Security Model" section or lengthy access pattern
      explanation. Keep it brief: 2-3 sentences in the right place.
    - Do NOT remove the `note` field from the schema. It is `required`
      in `CaptureAccepted`. Removing it would be a breaking API change.
    - Do NOT touch the HTML verification page (`verify-page.js`).

    ### Codebase context

    - `src/index.js` line 139 -- runtime note string
    - `openapi.yaml` -- search for "no listing endpoint", "store it",
      "Store the capture ID"
    - `README.md` -- search for "no listing endpoint", "Store the capture ID"
    - `docs/MVP.md` -- search for "no list endpoint", "List/search captures"
    - `docs/backlog.md` -- search for "Capture ID recovery"

    ### Deliverables

    Modified: `src/index.js` (one-line change), `openapi.yaml`, `README.md`,
    `docs/MVP.md`, `docs/backlog.md`

    ### Success criteria

    - Zero instances of "no list endpoint" or "no listing endpoint" remain
      in src/ or openapi.yaml.
    - The 202 response note references GET /v1/captures.
    - README has a usage example for the list endpoint.
    - `npx vitest run` still passes (the note value change is covered by
      capture-integration tests that may assert the response body shape
      but should not assert the exact note string).

- **Deliverables**: Updated `src/index.js`, `openapi.yaml`, `README.md`, `docs/MVP.md`, `docs/backlog.md` with all lost-ID language replaced.
- **Success criteria**: No instances of "no list endpoint" language remain in src/ or spec. README includes list endpoint usage example.

### Cross-Cutting Coverage

- **Testing**: Covered by Task 1 (test signature updates, tenantId assertions) and Task 2 (new test/list-captures.test.js, kv.test.js list tests). Phase 6 post-execution will run the full suite.
- **Security**: security-minion's recommendations are embedded in Task 1 (tenantId validation regex at auth boundary, tenantPrefix defense-in-depth in kv.js) and Task 2 (CaptureSummary field stripping, 200-not-404 for empty results, cursor validation, Cache-Control headers). No separate security task needed -- the security requirements are specific enough to inline.
- **Usability -- Strategy**: ux-strategy-minion's recommendations are embedded in Task 3 (note field update, README dual-access framing, lost-ID language cleanup). The mental model framing ("finding captures" vs. "sharing captures") is implemented as documentation changes.
- **Usability -- Design**: Not applicable. No user-facing UI is produced. The endpoint is API-only.
- **Documentation**: Covered by Task 2 (OpenAPI spec additions) and Task 3 (README, MVP.md, backlog.md updates). Phase 8 post-execution will review documentation completeness.
- **Observability**: observability-minion's recommendations are embedded in Task 1 (tenantId in all post-auth log calls) and Task 2 (list.success and list.error log events with durationMs). No separate observability task needed.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: Plan includes runtime components (new list endpoint handler) with specific latency SLO (<300ms) and new log events. Needs coordinated review of durationMs logging and Coralogix alert setup referenced in Tasks 1-2.
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no HTML/UI), sitespeed-minion (no web-facing pages), user-docs-minion (documentation changes are minor inline updates, not user guides)

### Conflict Resolutions

**1. Sort order (ascending vs. descending):**
api-design-minion recommended newest-first with reverse-timestamp encoding as "more robust." data-minion recommended ascending (oldest-first) for YAGNI/KISS. **Resolution: ascending (oldest-first).** The Helix manifesto's KISS principle wins. Reverse-timestamp encoding adds complexity to key format, debugging, and the complete/fail index key updates. The API contract does not promise sort order, so this can change with D1 migration (R12). Both specialists acknowledged ascending as acceptable for MVP.

**2. Cursor strategy (custom vs. KV-native):**
api-design-minion proposed custom base64url cursor encoding `{ts, id}` for D1 migration insulation. security-minion recommended using KV's native cursor directly (server-signed, not forgeable). **Resolution: wrap KV's native cursor in a custom envelope** (`{"kv":"<native-cursor>"}`). This gives D1 migration insulation (the envelope format is ours; we can swap the internals) while leveraging KV's built-in cursor mechanics (no need to implement start-after logic). The API cursor is opaque to clients in both cases.

**3. Note field -- keep vs. remove:**
api-design-minion considered removing the `note` field. ux-strategy-minion recommended keeping it but changing the value to a capability pointer. software-docs-minion noted it is `required` in the schema. **Resolution: keep field, change value.** Removing a required field is a breaking change. The new value points to the list endpoint, serving progressive disclosure.

**4. requireAuth() wrapper:**
security-minion recommended extracting a `requireAuth()` helper. **Resolution: defer.** With only 2 authenticated endpoints (POST and GET /v1/captures), inline auth checks are simpler and more explicit. Per KISS, this refactor can happen when a 3rd authenticated endpoint is added. The security logging pattern is duplicated in exactly 2 places, which is acceptable.

**5. Index key write order:**
data-minion recommended primary-first-then-index (synchronous). api-design-minion suggested index-first for safer failure mode. **Resolution: primary first, then index.** data-minion's analysis is more thorough: primary write failure returns 500 (no index written); index write failure after primary success is acceptable degradation (capture works, just not listed). This matches the pre-R1 behavior for all captures.

**6. CaptureSummary naming:**
api-design-minion called it `CaptureSummary`, software-docs-minion called it `CaptureListItem`. **Resolution: `CaptureSummary`.** It is more descriptive of what the schema represents (a summary projection) vs. where it is used (a list item). The name is independent of the endpoint.

### Risks and Mitigations

**HIGH -- KV key prefix injection (tenantId in key construction)**
If tenantId is ever derived from external input (R12) without validation, an attacker could manipulate KV list() prefixes to enumerate another tenant's captures. **Mitigation:** Dual-layer validation -- regex in verifyApiKey() (auth boundary) AND defensive re-validation in tenantPrefix() (KV layer). Both layers ship in Task 1.

**MEDIUM -- Status filtering O(n) worst case**
When filtering by status, a page of 20 might require scanning hundreds of index keys if few records match. **Mitigation:** Scan depth limit of 500 keys and max 3 fetch iterations in the listCaptures function (Task 2). Returns partial results with `hasMore: true` if budget exhausted. Documented as a known limitation for D1 to resolve.

**MEDIUM -- Secondary index consistency (dual-write without transactions)**
KV has no atomic multi-key writes. Primary write can succeed while index write fails. **Mitigation:** Write order (primary first) ensures the failure mode is "capture works but isn't listed" rather than "listed but doesn't exist." Index write failure logs warning. R12 migration can detect and repair orphaned records.

**LOW -- Existing captures not indexed**
Pre-R1 captures won't appear in list results. **Mitigation:** Explicitly documented in the API and OpenAPI spec. This is a strict improvement (from "no listing at all" to "listing for new captures"). R12 handles backfill.

**LOW -- KV eventual consistency (global propagation ~60s)**
A capture created in one region may not appear in list results from another region for up to 60 seconds. **Mitigation:** Inherent to KV. At single-operator scale, irrelevant. Documented in the API spec.

**LOW -- Index key orphaning on complete/fail**
If TTL removal on the index key fails during completeCapture/failCapture, the index key retains its 24h TTL and the capture disappears from listings after 24 hours. **Mitigation:** Best-effort re-write with warning log. R12 migration detects and repairs. Probability is low (two sequential KV writes in an already-running Worker).

### Execution Order

```
Batch 1 (parallel: none -- sequential dependency)
  Task 1: R8 auth enrichment + tenantId threading
    |
    v
  [APPROVAL GATE: API contract + KV schema review for Task 2]
    |
    v
Batch 2
  Task 2: R1 list captures endpoint implementation
    |
    v
Batch 3
  Task 3: Documentation cleanup
```

3 tasks, strictly sequential. The gate between Task 1 and Task 2 reviews
the API contract (response envelope, CaptureSummary fields, cursor format)
and KV key schema (index key format, TTL behavior) before implementation
begins. Task 1 establishes the KV index key format that the gate validates;
Task 2 implements the endpoint that consumes it.

### Verification Steps

After all tasks complete:

1. `npx vitest run` -- full test suite passes (existing + new tests).
2. Manual curl verification against wrangler dev:
   - `POST /v1/captures` returns new note text.
   - `GET /v1/captures` with Bearer auth returns `{ data, pagination }`.
   - Pagination: create 3 captures, list with limit=2, follow cursor, verify all 3 returned.
   - Status filter: `?status=pending` returns only pending captures.
   - No auth: `GET /v1/captures` without Bearer returns 401.
3. Grep for "no list endpoint" and "no listing endpoint" in src/, openapi.yaml, README.md -- zero results.
4. OpenAPI spec validation: `npx @redocly/cli lint openapi.yaml` (if available).
