## Domain Plan Contribution: test-minion

### Recommendations

#### Overall test file placement

Add a new file `test/capture-retrieval.test.js` rather than appending to
`capture-integration.test.js`. The integration file is already dense; the
retrieval endpoint has its own concerns (pre-seeded KV records, artifact URL
shape, no-auth security note) and deserves a focused file. The lifecycle smoke
test, because it crosses POST -> status polling -> GET, belongs at the bottom of
`capture-integration.test.js` where the POST helpers already live.

#### (a) Happy-path GET /v1/captures/{id}

The right approach is **direct KV seeding**, not triggering a real POST. The
existing `kv.test.js` already imports `createCapture` and `completeCapture` from
`src/kv.js` and calls them against `env.KV`. Use that same pattern in the
retrieval tests:

```js
import { env } from 'cloudflare:test';
import { createCapture, completeCapture } from '../src/kv.js';

const SEED_ID = 'cap_' + 'a'.repeat(32);
const SEED_ARTIFACTS = {
  screenshot: `captures/${SEED_ID}/screenshot.png`,
  html:       `captures/${SEED_ID}/page.html`,
  headers:    `captures/${SEED_ID}/headers.json`,
  wacz:       `captures/${SEED_ID}/bundle.wacz`,
};
const SEED_WACZ = {
  key:        `captures/${SEED_ID}/bundle.wacz`,
  bundleHash: 'abc123',
  size:       42000,
};

beforeEach(async () => {
  await env.KV.delete(`capture:${SEED_ID}`);
  await createCapture(env.KV, SEED_ID, 'https://example.com', '93.184.216.34');
  await completeCapture(env.KV, SEED_ID, SEED_ARTIFACTS, SEED_WACZ);
});
```

The test then exercises the HTTP layer only—no knowledge of KV internals inside
the assertions:

```js
it('returns 200 with capture metadata and artifact links', async () => {
  const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);

  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toContain('application/json');

  const body = await res.json();
  expect(body.id).toBe(SEED_ID);
  expect(body.status).toBe('complete');
  expect(body.url).toBe('https://example.com');
  expect(body.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  // Artifact URLs must be present and absolute (R2 public or pre-signed)
  expect(body.artifacts).toBeDefined();
  expect(body.artifacts.wacz).toMatch(/^https?:\/\//);
  expect(body.artifacts.screenshot).toMatch(/^https?:\/\//);
});
```

Key assertions to include beyond shape:

- `Cache-Control` should be `private, no-store` (same as status endpoint — this
  endpoint carries no auth so the response must not be cached by shared proxies)
- `Content-Type` is `application/json` (not `application/problem+json`)
- The capture ID is NOT echoed back in a way that exposes internal storage keys
- Artifact URLs are absolute HTTP(S), not bare R2 object paths

One additional test for the security model the issue documents: **no
Authorization header required**. A request without the `Authorization` header
should still return 200 for a known ID.

```js
it('no auth required', async () => {
  const res = await SELF.fetch(`https://worker.test/v1/captures/${SEED_ID}`);
  expect(res.status).toBe(200);
});
```

#### (b) RFC 9457 404 for unknown ID

Model this directly on the existing status-endpoint 404 test in
`capture-integration.test.js` (lines 266-286). The pattern is established and
correct:

```js
it('returns RFC 9457 404 for valid-format but unknown ID', async () => {
  const res = await SELF.fetch(
    'https://worker.test/v1/captures/cap_aaaabbbbccccddddaaaabbbbccccdddd',
  );

  expect(res.status).toBe(404);
  expect(res.headers.get('Content-Type')).toContain('application/problem+json');
  const body = await res.json();
  expect(body).toMatchObject({ type: 'about:blank', status: 404 });
  expect(body).toHaveProperty('title');
  expect(body).toHaveProperty('detail');
  // SECURITY: must not echo back the capture ID (CWE-209)
  expect(body.detail).not.toContain('cap_aaaabbbbccccddddaaaabbbbccccdddd');
});

it('returns 404 for malformed ID (route does not match)', async () => {
  const res = await SELF.fetch('https://worker.test/v1/captures/badid');
  expect(res.status).toBe(404);
});
```

#### (c) End-to-end lifecycle smoke test — handling ctx.waitUntil()

This is the design crux. The challenge: `ctx.waitUntil(performCapture(...))` is
fire-and-forget from the HTTP handler's perspective. The test infrastructure
(`@cloudflare/vitest-pool-workers`) does drain `waitUntil` promises before the
test worker request completes, but timing of the KV write relative to the HTTP
response varies.

**The correct approach: do not poll in a loop. Do not sleep.**

The existing status tests already document this behavior correctly (lines
244-253): "pending is the expected initial state; complete is acceptable if task
ran." The background task may or may not have written `complete` to KV by the
time the status fetch returns. This is not a bug; it is correct async behavior.

For the lifecycle smoke test, accept one of two strategies:

**Strategy A — Deferred completion via direct KV write (recommended)**

Don't try to observe `waitUntil` completion at all. POST to create, confirm the
202 and the pending record, then use `completeCapture` directly to advance the
record to `complete`, then fetch `GET /v1/captures/{id}`. This tests the full
HTTP surface without depending on background task timing:

```js
it('full lifecycle: POST -> complete via KV -> GET returns metadata', async () => {
  // 1. POST -- creates capture, returns 202
  const createRes = await postCapture({ url: VALID_URL });
  expect(createRes.status).toBe(202);
  const { id, statusUrl } = await createRes.json();

  // 2. Confirm pending state (status endpoint exists and record is accessible)
  const statusRes = await SELF.fetch(statusUrl);
  expect(statusRes.status).toBe(200);
  const statusBody = await statusRes.json();
  expect(statusBody.id).toBe(id);
  expect(['pending', 'complete']).toContain(statusBody.status);

  // 3. Advance to complete via KV directly (no timing dependency)
  const artifacts = {
    screenshot: `captures/${id}/screenshot.png`,
    html:       `captures/${id}/page.html`,
    headers:    `captures/${id}/headers.json`,
    wacz:       `captures/${id}/bundle.wacz`,
  };
  await completeCapture(env.KV, id, artifacts, {
    key: `captures/${id}/bundle.wacz`,
    bundleHash: 'testbundlehash',
    size: 1000,
  });

  // 4. Status endpoint reflects complete
  const completedStatusRes = await SELF.fetch(statusUrl);
  const completedStatusBody = await completedStatusRes.json();
  expect(completedStatusBody.status).toBe('complete');
  expect(completedStatusBody.captureUrl).toContain(id);

  // 5. GET /v1/captures/{id} returns metadata with artifact links
  const captureRes = await SELF.fetch(`https://worker.test/v1/captures/${id}`);
  expect(captureRes.status).toBe(200);
  const captureBody = await captureRes.json();
  expect(captureBody.id).toBe(id);
  expect(captureBody.status).toBe('complete');
  expect(captureBody.artifacts).toBeDefined();
  expect(captureBody.artifacts.wacz).toMatch(/^https?:\/\//);
});
```

This test exercises: POST handler, KV write, status endpoint read, KV update
(simulating background task completion), GET retrieval handler, artifact URL
construction. It is deterministic, runs in milliseconds, and does not flake.

**Strategy B — Wait for waitUntil drain (not recommended)**

`@cloudflare/vitest-pool-workers` v0.6+ exposes `waitUntilComplete()` via the
`cloudflare:test` helper module for some runtime builds. If the project's version
supports it, the lifecycle could await that directly after the POST. However:

- The API is not stable across versions and requires checking the exact pool
  workers version in use
- It still depends on `performCapture` actually succeeding against the mocked
  outbound fetch, which ties the smoke test to the full capture implementation
- If the capture pipeline has bugs (e.g. R2 mock behavior), the lifecycle test
  fails for reasons unrelated to the retrieval endpoint

Strategy A is strictly better for testing the retrieval endpoint in isolation
from capture pipeline correctness. Strategy B would be appropriate only for a
dedicated "pipeline integration" test that specifically validates background task
completion.

#### Artifact URL construction

The tests must assert that artifact URLs are absolute HTTP(S). The implementation
choice (direct R2 public URL vs pre-signed URL) determines the base URL pattern.
Tests should use a regex match (`/^https?:\/\//`) rather than asserting the full
URL, so tests remain valid as the base URL configuration changes between
environments. Add a single test that captures the shape contract explicitly:

```js
expect(body.artifacts.wacz).toMatch(/^https?:\/\/.+\.wacz$/);
```

#### Response time

The 300ms target is verified by the KV read architecture, not by tests. Do not
write timing assertions in unit/integration tests—they are environment-dependent
and will flake in shared CI runners. If a latency regression test is wanted,
it belongs in a dedicated performance test file (outside the standard Vitest
suite) run in a controlled environment. A comment in the test file is sufficient:

```js
// Response time target: <300ms (KV read only, no computation on hot path).
// Tested via load test, not here -- timing assertions are environment-dependent.
```

#### isolatedStorage: false note

The vitest config sets `isolatedStorage: false` due to R2 SQLite WAL issues.
This means all tests in the suite share KV state. The `beforeEach` cleanup
pattern from `kv.test.js` (explicit `env.KV.delete()`) must be followed for
every test that seeds KV. Use a fixed seed ID per `describe` block that is
deleted in `beforeEach`. The lifecycle smoke test generates a fresh ID via
POST, which is fine—it never collides with the fixed seed IDs.

---

### Proposed Tasks

**Task 1: Write `test/capture-retrieval.test.js`**

What: New test file covering `GET /v1/captures/{id}`. Tests:
1. 200 with correct shape (pre-seeded complete KV record)
2. Artifact URLs are absolute HTTP(S)
3. No auth required (request without Authorization header returns 200)
4. Security headers present (`Referrer-Policy`, `X-Content-Type-Options`)
5. `Cache-Control: private, no-store` on 200 response
6. RFC 9457 404 for valid-format unknown ID
7. RFC 9457 404 for malformed ID (route non-match)
8. Security: detail field does not echo capture ID

Deliverable: `test/capture-retrieval.test.js` with 8 tests, all green.
Dependencies: `GET /v1/captures/{id}` route must be implemented in `src/index.js`.

**Task 2: Add lifecycle smoke test to `test/capture-integration.test.js`**

What: Append a `describe('lifecycle smoke test', ...)` block using Strategy A
(POST -> confirm pending -> advance KV directly -> assert status -> GET capture).
Import `completeCapture` at the top of the file.

Deliverable: One new `it()` at the bottom of `capture-integration.test.js`,
green, no sleep/retry loops.
Dependencies: Task 1 (GET endpoint must exist).

**Task 3: Verify `beforeEach` cleanup scope in retrieval tests**

What: The test file uses a fixed seed ID (e.g. `cap_` + `'a'.repeat(32)`).
Each test that needs a pre-seeded record must `delete` + `createCapture` +
`completeCapture` in `beforeEach`. Verify no test leaves state that leaks into
others, given `isolatedStorage: false`.

Deliverable: Confirmed test isolation via review of cleanup calls.
Dependencies: Task 1.

---

### Risks and Concerns

**1. isolatedStorage: false is the main state-leak risk.**

With `isolatedStorage: false`, a failing test that skips teardown can corrupt
the KV state seen by the next test. The `beforeEach` delete must happen even if
the test creates the record itself (not just in tests that rely on a pre-seeded
record). If any test leaves behind a record with the same ID, the next test's
`beforeEach` must explicitly delete it before re-seeding.

**2. Artifact URL base depends on R2 bucket access policy — not yet decided.**

The issue notes that artifact links can be direct R2 public URLs or pre-signed
URLs. This is a design decision for the implementation agent (api-design-minion
or the implementing engineer). The test can only assert the shape (`^https?://`)
until the concrete URL prefix is known. If the implementation uses a configurable
R2 public URL base, the test environment may need a binding like `R2_PUBLIC_URL`
set in the vitest miniflare config. This must be coordinated with whoever
implements the handler.

**3. `completeCapture` signature includes optional `wacz` param.**

The `kv.js` `completeCapture` signature is `(kv, captureId, artifacts, wacz = null)`.
The retrieval endpoint presumably surfaces `wacz` metadata in the response. Tests
must seed both artifacts and wacz metadata to exercise the full response shape.
If the handler omits wacz from the response, the tests catch that gap.

**4. Lifecycle test depends on fetchMock being active.**

The lifecycle smoke test begins with a POST, which triggers `captureHeaders`
(an outbound fetch). `activateFetchMock()` must be called in `beforeEach` for
that test block. The existing pattern in `capture-integration.test.js` is:
`beforeEach(activateFetchMock); afterEach(() => fetchMock.deactivate())`. The
new lifecycle describe block must follow this same pattern.

**5. Strategy B (waitUntil drain) is fragile — avoid.**

If a future reviewer attempts to use `waitUntilComplete()` from
`cloudflare:test`, they may find it unavailable in the version pinned by the
project, or find that `performCapture` fails in test environment (R2 mock
limitations, WACZ signing complexity). The comment in the test code should
explicitly state why Strategy A was chosen over Strategy B, to prevent
well-meaning future changes that introduce timing dependencies.

---

### Additional Agents Needed

None. The test strategy is self-contained given the existing codebase patterns.

One coordination note: the implementation agent needs to confirm the artifact
URL construction approach (direct R2 public URL vs pre-signed, and the binding
name for the R2 public base URL) before the retrieval tests can assert concrete
URL prefixes. The test can use a regex match initially and be tightened once
the implementation is settled.
