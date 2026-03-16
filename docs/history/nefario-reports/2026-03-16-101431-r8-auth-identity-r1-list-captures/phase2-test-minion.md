## Domain Plan Contribution: test-minion

### Recommendations

#### R8: Auth Identity Enrichment -- Test Strategy

**1. Extend existing `test/auth.test.js` to verify tenantId in return value.**

The current success test asserts `result.ok === true` and `result.response === undefined`. After R8, the success result shape changes to `{ ok: true, tenantId: 'default' }`. Update the existing success test and add a dedicated assertion:

```js
it('returns { ok: true, tenantId: "default" } for correct key', async () => {
  const result = await verifyApiKey(makeRequest(`Bearer ${TEST_KEY}`), makeEnv());
  expect(result.ok).toBe(true);
  expect(result.tenantId).toBe('default');
  expect(result.response).toBeUndefined();
});
```

This is a modification of an existing test, not a new test file. Keep it in `test/auth.test.js`.

**2. Verify tenantId is absent from error results (security).**

Error results should NOT include a tenantId field -- a failed auth should reveal nothing about tenant structure:

```js
it('error results do not contain tenantId', async () => {
  const result = await verifyApiKey(makeRequest('Bearer wrong-key'), makeEnv());
  expect(result.ok).toBe(false);
  expect(result.tenantId).toBeUndefined();
});
```

**3. KV key format assertion test in `test/kv.test.js`.**

This is the most important test for catching regressions in tenant-scoped key generation. The issue specifies new index keys of shape `tenant:default:ts:{ISO}:{captureId}`. Add a describe block that asserts on the exact key format:

```js
describe('tenant-scoped index key', () => {
  it('createCapture writes index key with format tenant:{tenantId}:ts:{ISO}:{id}', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const list = await env.KV.list({ prefix: 'tenant:default:ts:' });
    expect(list.keys.length).toBe(1);
    expect(list.keys[0].name).toMatch(
      /^tenant:default:ts:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*:cap_/
    );
  });
});
```

This test uses KV `list()` directly against the miniflare binding, which is the exact operation the list endpoint will use. If the key format ever drifts, this test catches it.

**4. Completeness check for tenantId threading -- integration-level guard.**

Rather than trying to check every call site statically, add an integration test that verifies the full POST flow threads tenantId into the KV record. In `test/capture-integration.test.js`, after creating a capture, read the raw KV record and verify:

```js
it('capture KV record includes tenantId after successful POST', async () => {
  const res = await postCapture({ url: VALID_URL });
  const { id } = await res.json();
  const record = await env.KV.get(`capture:${id}`, 'json');
  expect(record.tenantId).toBe('default');
});
```

This catches the case where someone adds a new handler that calls `createCapture` without passing tenantId. Combined with the unit test on `createCapture` requiring tenantId as a parameter (not defaulting it silently), any missing call site will fail at the integration level.

**5. Log enrichment test in `test/log.test.js`.**

The existing log tests verify payload shape. Add a test that verifies tenantId appears in the log data when provided:

```js
it('includes tenantId in log data when provided', async () => {
  let capturedBody;
  fetchMock.get(MOCK_ORIGIN)
    .intercept({ path: MOCK_PATH, method: 'POST' })
    .reply(200, (req) => { capturedBody = JSON.parse(req.body); return 'ok'; });

  await log(mockEnv, 3, 'capture', { event: 'capture.success', tenantId: 'default' });
  const text = JSON.parse(capturedBody[0].text);
  expect(text.tenantId).toBe('default');
});
```

This is a lightweight test -- the log module is a pass-through, so we are really testing that callers pass the right data. The integration test (above) provides stronger coverage of the actual threading.

#### R1: List Captures Endpoint -- Test Strategy

**6. KV `list()` behavior in vitest cloudflare:test.**

The `cloudflare:test` pool uses miniflare under the hood. Miniflare's KV `list()` implementation faithfully supports `prefix`, `cursor`, and `limit` parameters. I verified this by examining how `test/kv.test.js` already uses `env.KV` (a real miniflare KV binding, not a mock) for get/put operations. The `list()` operation is equally reliable in this environment.

**However, there is one behavioral difference worth noting**: miniflare KV `list()` returns results deterministically by key name (lexicographic order), while production KV eventually-consistent `list()` may show slightly different ordering during propagation delays. This is not a concern for testing because:
- The key format `tenant:{tenantId}:ts:{ISO}:{captureId}` sorts chronologically by design
- The test environment has no eventual consistency lag
- Cursor-based pagination behavior is identical

**Recommendation**: Test against the real miniflare KV binding (as the project already does for all KV tests). Do NOT mock KV `list()` -- that would test the mock, not the pagination logic.

**7. New test file: `test/list-captures.test.js`.**

Create a dedicated test file for the list endpoint. This is a new feature with enough test surface to warrant its own file, consistent with the existing pattern where each endpoint gets its own test file (e.g., `capture-retrieval.test.js`, `verify.test.js`).

Test structure:

```
describe('GET /v1/captures -- auth')
  - returns 401 without Authorization header
  - returns 401 with wrong API key
  - returns 200 with valid Bearer token

describe('GET /v1/captures -- empty results')
  - returns { data: [], pagination: { hasMore: false } } when no captures exist

describe('GET /v1/captures -- populated results')
  - returns captures in reverse chronological order
  - response shape: { data: [...], pagination: { cursor?, hasMore } }
  - each item has: id, status, url, createdAt
  - does not leak ip field in list items
  - does not leak R2 keys in list items

describe('GET /v1/captures -- status filter')
  - ?status=complete returns only complete captures
  - ?status=pending returns only pending captures
  - ?status=failed returns only failed captures
  - ?status=invalid returns 400

describe('GET /v1/captures -- cursor pagination')
  - first page returns hasMore: true and cursor when more items exist
  - passing cursor returns next page
  - final page has hasMore: false and no cursor
  - round-trip: paginating through all pages yields all items exactly once
  - invalid cursor returns 400 (not 500)

describe('GET /v1/captures -- limit parameter')
  - respects limit query parameter (default 20)
  - limit > 100 capped at 100
  - limit=0 or negative returns 400

describe('GET /v1/captures -- security headers')
  - Cache-Control: private, no-store
  - standard security headers present
```

**8. Pagination round-trip test is the highest-value test.**

This test seeds N items (e.g., 25), requests with limit=10, follows cursors, and asserts:
- Total collected items == 25
- No duplicates (by captureId)
- No missing items
- Items are in correct order

This is the test that catches real-world bugs: off-by-one errors, cursor encoding issues, duplicate items at page boundaries. Implementation:

```js
it('paginating through all pages yields all items exactly once', async () => {
  // Seed 25 captures
  const ids = [];
  for (let i = 0; i < 25; i++) {
    const id = `cap_${String(i).padStart(32, '0')}`;
    ids.push(id);
    await createCapture(env.KV, id, 'https://example.com', '1.2.3.4', 'default');
    await completeCapture(env.KV, id, { screenshot: 'x', html: 'y' });
  }

  const collected = [];
  let cursor;
  let pages = 0;
  do {
    const params = new URLSearchParams({ limit: '10' });
    if (cursor) params.set('cursor', cursor);
    const res = await SELF.fetch(
      `https://worker.test/v1/captures?${params}`,
      { headers: { Authorization: AUTH } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    collected.push(...body.data);
    cursor = body.pagination.cursor;
    pages++;
  } while (cursor);

  expect(pages).toBe(3); // 10 + 10 + 5
  expect(collected).toHaveLength(25);
  const uniqueIds = new Set(collected.map(c => c.id));
  expect(uniqueIds.size).toBe(25);
});
```

**9. Test data seeding strategy.**

For list tests, seed data directly via KV module functions (`createCapture`, `completeCapture`, `failCapture`), not via HTTP POST. This is the same pattern used in `test/capture-retrieval.test.js` and avoids needing fetchMock, rate limiter interaction, and background capture execution. It also runs much faster.

Use unique capture IDs per test to avoid collisions (the project already uses `isolatedStorage: false`). Clean up in `beforeEach`:

```js
const TEST_IDS = Array.from({ length: 30 }, (_, i) =>
  `cap_list${String(i).padStart(28, '0')}`
);

beforeEach(async () => {
  await Promise.all(TEST_IDS.map(id => env.KV.delete(`capture:${id}`)));
  // Also delete index keys
  await Promise.all(TEST_IDS.map(id => env.KV.delete(`tenant:default:ts:...`)));
});
```

**Important cleanup note**: Since index keys include timestamps, we cannot construct them deterministically in cleanup. Two options:
- Option A: Use `env.KV.list({ prefix: 'tenant:default:' })` in `beforeEach` to find and delete all index keys. Adds a small overhead per test but is thorough.
- Option B: Control timestamps with a clock mock (vi.useFakeTimers). This makes key format predictable and enables order assertions.

**Recommend Option B** (fake timers) for pagination tests because it also lets us assert that results are in correct chronological order without depending on execution timing.

**10. KV module unit tests for the new `listCaptures` function.**

Before testing at the HTTP level, add unit tests for the KV layer function that wraps `kv.list()`. In `test/kv.test.js`:

```
describe('listCaptures')
  - returns empty array for empty KV
  - returns captures for given tenantId only
  - respects limit parameter
  - returns cursor when more results exist
  - returns no cursor on final page
  - applies status filter by reading each record
```

This tests the KV layer independently of routing, auth, and HTTP response formatting.

### Proposed Tasks

Listed in dependency order:

1. **Update `test/auth.test.js`** -- Modify existing success test to assert `tenantId: 'default'`. Add test that error results have no tenantId. (~15 min)

2. **Add KV key format assertion tests in `test/kv.test.js`** -- Test that `createCapture` with tenantId writes both the `capture:{id}` record and the `tenant:{tenantId}:ts:{ISO}:{id}` index key. Test key format with regex. (~20 min)

3. **Add `listCaptures` unit tests in `test/kv.test.js`** -- Test the new KV layer function: empty results, pagination cursor, limit, status filter. Seed data with `createCapture`/`completeCapture` directly. (~30 min)

4. **Create `test/list-captures.test.js`** -- HTTP-level integration tests for `GET /v1/captures`. Auth enforcement, response shape, pagination round-trip, status filter, security headers, limit validation. (~45 min)

5. **Update `test/capture-integration.test.js`** -- Add assertion that KV record includes tenantId after POST. Verify index key is written. (~10 min)

6. **Update `test/log.test.js`** -- Add tenantId propagation test. (~5 min)

7. **Update `test/capture.test.js`** -- `performCapture` may need tenantId threaded; update fixture calls to pass tenantId. Verify completed/failed records still include tenantId. (~15 min)

8. **Run full suite, fix any breakage from signature changes** -- `createCapture` gaining a tenantId parameter will break every existing call site in tests. Update all callers. (~20 min)

### Risks and Concerns

**Risk 1: Signature change cascade.**
Adding `tenantId` as a parameter to `createCapture()` will break calls in at least 5 test files: `kv.test.js`, `capture.test.js`, `capture-integration.test.js`, `capture-retrieval.test.js`, and the lifecycle smoke test. This is mechanical but must be done carefully -- a default parameter value (`tenantId = 'default'`) would avoid breakage but hides missing threading. **Recommendation**: Make tenantId required in `createCapture` (no default). Fix all call sites. The compilation of failures serves as an exhaustive inventory of code paths that need updating.

**Risk 2: KV `list()` cost and performance.**
Issue #31 notes: "KV `list()` returns keys only; each page of 20 results costs 21 KV operations." This is correct -- `list()` returns keys, then each record requires a `get()`. The test suite should verify this works but also test the edge case where a key exists in the index but the record has expired (24h TTL on pending captures). The list endpoint should gracefully skip expired records without crashing or returning null entries in the `data` array.

**Risk 3: Index key cleanup for expired captures.**
When a pending capture expires (24h TTL), its `capture:{id}` key vanishes but its `tenant:default:ts:{ISO}:{id}` index key persists (no TTL on index keys, or needs its own TTL). The list endpoint must handle this gracefully. Tests should verify: seed an index key without a corresponding capture record, call list, and confirm the endpoint either skips the orphan or handles it cleanly.

**Risk 4: Test isolation with shared KV.**
The project uses `isolatedStorage: false`. List endpoint tests that seed multiple captures could interfere with other test files that create captures in the same KV namespace. **Mitigation**: Use a distinctive ID prefix for list test captures (e.g., `cap_list...`) and clean up in `beforeEach`. The `tenant:default:` prefix scoping also helps -- list only returns items for the authenticated tenant.

**Risk 5: Cursor opaqueness.**
The cursor value should be opaque to clients (they pass it back verbatim). Tests should not parse or construct cursors -- they should only use cursors received from previous responses. One exception: test that a garbage cursor returns 400, not 500. KV's native cursor is a base64-encoded string; miniflare may use a different encoding. Test the contract (opaque string in, next page out), not the implementation.

**Risk 6: Status filter interacting with pagination.**
When filtering by status, the list operation must still paginate correctly. If the KV index keys don't encode status, the filter happens after fetching each record. This means a page of 20 might contain fewer items after filtering. The endpoint must handle this: either continue fetching until the page is full, or return a short page with `hasMore: true`. Tests should verify: seed 15 complete and 15 failed, request `?status=complete&limit=10`, verify correct count and cursor behavior.

### Additional Agents Needed

None beyond those already consulted. The test strategy is self-contained and depends only on:
- **api-design-minion**: For confirming the response envelope shape (`{ data, pagination }`) and query parameter names so tests assert against the agreed contract.
- **data-minion**: For confirming the KV index key format (`tenant:{tenantId}:ts:{ISO}:{captureId}`) so key format tests use the correct pattern. Also for confirming whether index keys should carry TTL matching pending capture TTL.
