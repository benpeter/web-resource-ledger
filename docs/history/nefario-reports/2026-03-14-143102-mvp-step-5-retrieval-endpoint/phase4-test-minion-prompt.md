## Context

You are working on `web-resource-ledger`, a Cloudflare Worker tested with
Vitest using `@cloudflare/vitest-pool-workers`. The existing test suite is in
`test/`. The vitest config sets `isolatedStorage: false` (due to R2 SQLite WAL
issues), so all tests share KV state -- explicit `beforeEach` cleanup is
mandatory.

Two new routes have been implemented in `src/index.js`:
- `GET /v1/captures/{captureId}` -- returns metadata + artifact links
- `GET /v1/captures/{captureId}/artifacts/{name}` -- proxies R2 artifact bytes

The handler for `GET /v1/captures/{id}` returns:
- 200 with JSON body for complete captures
- RFC 9457 404 (`application/problem+json`) for unknown IDs
- RFC 9457 404 for pending/failed captures (same static message: "Capture not found")

The response body for a complete capture:
```json
{
  "id": "cap_...",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "...",
  "completedAt": "...",
  "artifacts": {
    "screenshot": "https://worker.test/v1/captures/{id}/artifacts/screenshot",
    "html":       "https://worker.test/v1/captures/{id}/artifacts/html",
    "headers":    "https://worker.test/v1/captures/{id}/artifacts/headers"
  },
  "wacz": {
    "url":         "https://worker.test/v1/captures/{id}/artifacts/wacz",
    "size":        42000,
    "bundleHash":  "sha256:abc123..."
  }
}
```

KV seeding pattern (from `test/kv.test.js`):
```js
import { env } from 'cloudflare:test';
import { createCapture, completeCapture } from '../src/kv.js';
```

## File 1: `test/capture-retrieval.test.js` (new file)

Create this file from scratch. It must contain tests covering both
`GET /v1/captures/{id}` (metadata) AND `GET /v1/captures/{id}/artifacts/{name}` (artifact proxy).

Use a fixed seed ID: `'cap_' + 'a'.repeat(32)`.

```js
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCapture, completeCapture } from '../src/kv.js';

const SEED_ID = 'cap_' + 'a'.repeat(32);
const SEED_URL = 'https://example.com';
const SEED_ARTIFACTS = {
  screenshot: `captures/${SEED_ID}/screenshot.png`,
  html:       `captures/${SEED_ID}/rendered.html`,
  headers:    `captures/${SEED_ID}/headers.json`,
};
const SEED_WACZ = {
  key:        `captures/${SEED_ID}/bundle.wacz`,
  bundleHash: 'sha256:' + 'a'.repeat(64),
  size:       42000,
};

beforeEach(async () => {
  await env.KV.delete(`capture:${SEED_ID}`);
  await createCapture(env.KV, SEED_ID, SEED_URL, '93.184.216.34');
  await completeCapture(env.KV, SEED_ID, SEED_ARTIFACTS, SEED_WACZ);
});
```

### Metadata endpoint tests (describe block: 'GET /v1/captures/{id}')

1. **200 with correct shape** -- fetch SEED_ID, assert status 200,
   `Content-Type: application/json`, body has `id`, `status: 'complete'`,
   `url`, `completedAt`, `artifacts.screenshot`, `artifacts.html`, `wacz.url`,
   `wacz.size`, `wacz.bundleHash`

2. **Artifact URLs are absolute HTTP(S)** -- assert
   `body.artifacts.screenshot` matches `/^https?:\/\//`,
   `body.artifacts.html` matches `/^https?:\/\//`,
   `body.wacz.url` matches `/^https?:\/\//`

3. **No auth required** -- fetch without Authorization header, assert 200

4. **Security headers present** -- assert `Referrer-Policy: no-referrer` and
   `X-Content-Type-Options: nosniff` on the 200 response

5. **Cache-Control: private, no-store** on 200 response

6. **RFC 9457 404 for valid-format unknown ID** -- fetch
   `cap_bbbb...` (32 b's), assert status 404,
   `Content-Type: application/problem+json`,
   body matches `{ type: 'about:blank', status: 404 }`,
   body has `title` and `detail` fields,
   SECURITY: `body.detail` does not contain the capture ID

7. **RFC 9457 404 for malformed ID** -- fetch
   `https://worker.test/v1/captures/badid`, assert status 404

8. **Security: `ip` field absent from response** -- assert that
   `body.ip` is undefined (the internal IP field must never appear in responses)

### Artifact endpoint tests (describe block: 'GET /v1/captures/{id}/artifacts/{name}')

IMPORTANT: For artifact tests, you need to seed R2 objects. Before each artifact test,
write test data to R2:
```js
await env.BUCKET.put(SEED_ARTIFACTS.screenshot, new Uint8Array([137, 80, 78, 71])); // PNG magic bytes
await env.BUCKET.put(SEED_ARTIFACTS.html, '<html>test</html>');
await env.BUCKET.put(SEED_ARTIFACTS.headers, JSON.stringify({ 'content-type': 'text/html' }));
await env.BUCKET.put(SEED_WACZ.key, new Uint8Array([80, 75, 3, 4])); // ZIP magic bytes
```

Add this R2 seeding to the beforeEach block.

9. **html artifact served as text/plain** -- GET /artifacts/html, assert
   Content-Type header is 'text/plain' (NOT text/html -- XSS prevention)

10. **screenshot artifact served as image/png** -- GET /artifacts/screenshot,
    assert Content-Type is 'image/png'

11. **Content-Disposition: attachment on all artifacts** -- GET /artifacts/html,
    assert Content-Disposition header contains 'attachment'

12. **wacz-absent returns 404** -- create a capture WITHOUT wacz (pass null for wacz param),
    GET /artifacts/wacz, assert 404

13. **pending capture returns 404 on artifact route** -- create a pending capture
    (createCapture only, no completeCapture), GET /artifacts/screenshot, assert 404

14. **absent optional artifact (headers) returns 404** -- create a capture
    with no headers artifact (omit headers from artifacts object in completeCapture),
    GET /artifacts/headers, assert 404

## File 2: `test/capture-integration.test.js` (extend existing)

Read the existing file first. Append a new `describe('lifecycle smoke test', ...)` block
at the END of the existing file. Use Strategy A (direct KV advancement, no timing dependency).

Import `completeCapture` at the top of the file (add to existing imports from '../src/kv.js'):
```js
import { completeCapture } from '../src/kv.js';
```
And add `env` to the cloudflare:test import if not already present.

The smoke test:
```js
describe('lifecycle smoke test', () => {
  beforeEach(activateFetchMock);
  afterEach(() => fetchMock.deactivate());

  it('POST -> KV advance -> GET returns complete metadata', async () => {
    const createRes = await postCapture({ url: VALID_URL });
    expect(createRes.status).toBe(202);
    const { id, statusUrl } = await createRes.json();

    const statusRes = await SELF.fetch(statusUrl);
    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json();
    expect(statusBody.id).toBe(id);
    expect(['pending', 'complete']).toContain(statusBody.status);

    await completeCapture(env.KV, id, {
      screenshot: `captures/${id}/screenshot.png`,
      html:       `captures/${id}/rendered.html`,
      headers:    `captures/${id}/headers.json`,
    }, {
      key:        `captures/${id}/bundle.wacz`,
      bundleHash: 'sha256:' + 'b'.repeat(64),
      size:       1024,
    });

    const completedStatusRes = await SELF.fetch(statusUrl);
    const completedStatusBody = await completedStatusRes.json();
    expect(completedStatusBody.status).toBe('complete');
    expect(completedStatusBody.captureUrl).toContain(id);

    const captureRes = await SELF.fetch(`https://worker.test/v1/captures/${id}`);
    expect(captureRes.status).toBe(200);
    const captureBody = await captureRes.json();
    expect(captureBody.id).toBe(id);
    expect(captureBody.status).toBe('complete');
    expect(captureBody.artifacts).toBeDefined();
    expect(captureBody.artifacts.screenshot).toMatch(/^https?:\/\//);
    expect(captureBody.artifacts.html).toMatch(/^https?:\/\//);
    expect(captureBody.wacz).toBeDefined();
    expect(captureBody.wacz.url).toMatch(/^https?:\/\//);
  });
});
```

## What NOT to do

- Do not use sleep or polling loops in any test
- Do not assert the full absolute URL of artifact URLs (use regex)
- Do not add timing assertions
- Do not modify any existing test
- Do not import afterEach without using it

## Deliverables

- New file `test/capture-retrieval.test.js` with 14 tests (8 metadata + 6 artifact)
- Extended `test/capture-integration.test.js` with lifecycle smoke test

## Success criteria

- All new tests pass
- No existing tests broken
- `beforeEach` cleanup is in place for the fixed seed ID

When you finish your task, mark it completed with TaskUpdate (task ID: 4) and
send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced