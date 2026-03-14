## Task: Write integration tests for the verification endpoint

Create `test/verify-integration.test.js` with HTTP-level integration tests for `GET /v1/verify/{id}`.

### Context

The verification endpoint is wired up in `src/index.js`. It uses `verifyWacz` from `src/verify.js` internally. These tests exercise the full HTTP path: route matching, KV lookup, R2 fetch, verification, response shape, headers, and error cases.

### Test file structure

**File**: `test/verify-integration.test.js`

Read `src/index.js`, `src/verify.js`, `src/kv.js`, `src/capture.js`, `test/wacz.test.js`, and `test/verify.test.js` first to understand existing patterns and function signatures.

**Imports and setup** -- follow the pattern from `test/wacz.test.js`:
```js
import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture } from '../src/capture.js';
import { createCapture, getCapture, completeCapture } from '../src/kv.js';
import { unzipSync, zipSync } from 'fflate';
```

**Test capture ID**: Use a unique SEED_ID to avoid collisions with other test files (`isolatedStorage: false`):
```js
const TEST_ID = 'cap_' + 'f'.repeat(32);
const TEST_URL = 'https://example.com';
const TEST_IP = '93.184.216.34';
const TEST_ORIGIN = 'https://example.com';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEST_HTML = '<html><body>verify test</body></html>';

const stubRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
});
```

**beforeEach**: Clean up and create a REAL capture with a signed WACZ:
```js
beforeEach(async () => {
  // Clean KV
  await env.KV.delete(`capture:${TEST_ID}`);
  // Clean R2 WACZ objects
  const listed = await env.BUCKET.list({ prefix: 'captures/' });
  await Promise.all(
    listed.objects
      .filter(obj => obj.key.endsWith('.wacz') || obj.key.includes(TEST_ID))
      .map(obj => env.BUCKET.delete(obj.key)),
  );
  // Activate fetchMock for header fetch
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock.get(TEST_ORIGIN)
    .intercept({ path: '/', method: 'GET' })
    .reply(200, 'ok', { headers: { 'content-type': 'text/html' } });

  // Create a real capture with signed WACZ
  await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
  await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);
});

afterEach(() => {
  fetchMock.deactivate();
});
```

This uses `performCapture()` directly (same pattern as `test/wacz.test.js`) to produce a real, signed WACZ in R2. No `ctx.waitUntil()` timing issues.

### Tests to write

**describe('GET /v1/verify/{id} -- happy path')**:

1. `returns 200 with verified: true for valid capture` -- fetch `/v1/verify/{TEST_ID}`, assert status 200, `body.verified === true`.

2. `response has correct shape` -- assert `body` has `verified` (boolean), `capture` (object with `id`, `createdAt`, `completedAt` -- NO `url` field), `signing` (object -- note the field is called `signing` not `wacz`), `checks` (array of 3).

3. `all three checks pass` -- assert each check in `body.checks` has `status: 'pass'` and `name` is one of `artifactHashes`, `bundleHash`, `signature`.

4. `capture.id matches request` -- assert `body.capture.id === TEST_ID`.

**describe('GET /v1/verify/{id} -- tamper detection')**:

5. `detects tampered WACZ content` -- after `beforeEach` creates a valid capture:
   - Read the KV record to get the WACZ key: `const record = await getCapture(env.KV, TEST_ID);`
   - Fetch the WACZ from R2: `const obj = await env.BUCKET.get(record.wacz.key);`
   - Unzip, corrupt an inner file (append byte to `archive/data.warc`), re-zip, overwrite R2:
     ```js
     const waczBytes = new Uint8Array(await obj.arrayBuffer());
     const files = unzipSync(waczBytes);
     const warc = files['archive/data.warc'];
     const corrupted = new Uint8Array(warc.length + 1);
     corrupted.set(warc);
     corrupted[warc.length] = 0xFF;
     files['archive/data.warc'] = corrupted;
     // Re-zip with STORE mode
     const repackaged = zipSync(
       Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 0 }]]))
     );
     await env.BUCKET.put(record.wacz.key, repackaged);
     ```
   - Fetch `/v1/verify/{TEST_ID}`, assert `body.verified === false`.
   - Assert the `artifactHashes` check has `status: 'fail'`.

6. `returns 200 (not 4xx) for failed verification` -- same tampered scenario, assert `res.status === 200`.

**describe('GET /v1/verify/{id} -- error cases')**:

7. `404 for unknown capture ID` -- use `cap_` + `'0'.repeat(32)`, assert 404, RFC 9457 shape, detail does not contain the ID.

8. `404 for pending capture` -- create a pending-only capture (no `performCapture`), fetch verify, assert 404.

9. `404 for capture without WACZ` -- create a capture and complete it without WACZ data:
   ```js
   const noWaczId = 'cap_' + 'e'.repeat(31) + 'f';
   await env.KV.delete(`capture:${noWaczId}`);
   await createCapture(env.KV, noWaczId, TEST_URL, TEST_IP);
   await completeCapture(env.KV, noWaczId, {
     screenshot: `captures/${noWaczId}/screenshot.png`,
     html: `captures/${noWaczId}/rendered.html`,
   }, null);
   ```
   Fetch `/v1/verify/${noWaczId}`, assert 404.

10. `404 for malformed capture ID` -- fetch `/v1/verify/badid`, assert 404.

**ADVISORY: Add test for failed-status capture**:
11. `404 for failed capture` -- create a capture and set its status to 'failed':
   ```js
   const failedId = 'cap_' + 'd'.repeat(31) + 'f';
   await env.KV.delete(`capture:${failedId}`);
   await createCapture(env.KV, failedId, TEST_URL, TEST_IP);
   // Update the KV record to set status = 'failed'
   const record = await getCapture(env.KV, failedId);
   record.status = 'failed';
   await env.KV.put(`capture:${failedId}`, JSON.stringify(record));
   ```
   Fetch `/v1/verify/${failedId}`, assert 404.

**describe('GET /v1/verify/{id} -- headers')**:

12. `Cache-Control: public with max-age on verified: true` -- happy path response should have `Cache-Control` containing `public` and `max-age=86400`.

13. `Cache-Control: no-store on verified: false` -- tampered scenario, assert `Cache-Control: no-store`.

14. `Cache-Control: no-store on 404` -- unknown ID, assert `Cache-Control: no-store`.

15. `CORS header present` -- assert `Access-Control-Allow-Origin: *` on 200 response.

16. `security headers present` -- assert `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.

**describe('GET /v1/verify/{id} -- security')**:

17. `ip field absent from response` -- assert `body.ip` is undefined and `JSON.stringify(body)` does not contain `TEST_IP`.

18. `R2 keys absent from response` -- assert `JSON.stringify(body)` does not contain `captures/` (the R2 key prefix).

19. `capture.url absent from verify response` -- assert `body.capture.url` is undefined.

**describe('GET /v1/captures/{id} -- verifyUrl')**:

20. `retrieval response includes verifyUrl when WACZ present` -- fetch `/v1/captures/{TEST_ID}`, assert `body.verifyUrl` matches `/v1/verify/${TEST_ID}`.

21. `retrieval response omits verifyUrl when no WACZ` -- use the no-WACZ capture from test 9, fetch retrieval, assert `body.verifyUrl` is undefined.

### Important notes

- Use `SELF.fetch()` for all HTTP requests (standard Cloudflare Workers test pattern).
- The `beforeEach` creates a real WACZ via `performCapture()` with `stubRenderer`. This avoids fake hashes and produces a genuinely signed WACZ that the verification endpoint can validate.
- For the tamper test (test 5): use the surgical approach -- unzip, modify inner file, re-zip. Do NOT flip random bytes in the outer ZIP.
- Rate limiter testing: the `VERIFY_RATE_LIMITER` binding may not be available in the miniflare test environment. If `env.VERIFY_RATE_LIMITER` is undefined, skip the rate limit test with a `it.skipIf` guard and a comment explaining why. Check whether it exists first.
- All test IDs must be unique and not collide with IDs in other test files. The existing files use: `'a'.repeat(32)` (retrieval), `'wacztest1234567890abcdef1234'` (wacz). Use `'f'.repeat(32)` for the main test ID and distinct patterns for helper IDs.
- The response body uses `signing` field (not `wacz`) for verification metadata. The retrieval endpoint uses `wacz`. These are intentionally different.

### What NOT to do

- Do NOT write unit tests (Task 3 handles those).
- Do NOT modify any source files.
- Do NOT test the verification logic in isolation -- test it through the HTTP endpoint.
- Do NOT hardcode WACZ bytes or hash values.

### Deliverables

- `test/verify-integration.test.js` with ~21 integration tests

### Success criteria

- All tests pass when run with `npx vitest run test/verify-integration.test.js`
- Happy path confirms `verified: true` against a real, signed WACZ
- Tamper detection confirms `verified: false` with correct check identification
- All error cases return correct status codes and response shapes
- Headers (cache, CORS, security) verified
- No sensitive data leaks in responses
- `verifyUrl` journey coherence confirmed

### Advisories incorporated
- [testing] Added test 11 for failed-status capture (404)
- [security] Test 19 explicitly checks capture.url is absent from verify response

When you finish, mark task #4 completed with TaskUpdate and send a message to the team lead with file paths, change scope, and line counts.
