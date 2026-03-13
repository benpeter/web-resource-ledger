You are wiring the capture endpoints into the Web Resource Ledger Worker's route table and writing integration tests.

## Context
Working directory: /Users/ben/github/benpeter/web-resource-ledger
Read these files:
- src/index.js -- existing route table pattern
- src/auth.js -- verifyApiKey(request, env) -> { ok, response }
- src/kv.js -- createCapture, getCapture
- src/capture.js -- performCapture(env, url, ip, captureId, renderer)
- src/responses.js -- problemResponse, jsonResponse
- src/url-validation.js -- validateUrl(rawUrl, resolvers) -> { ok, url, ip } | { ok, status, detail }
- openapi.yaml -- the API contract (source of truth for response shapes)
- test/health.test.js -- integration test pattern using SELF.fetch

## What to produce

### Update src/index.js
Add two routes to the route table:

```js
const routes = [
  ['GET',  /^\/health$/, handleHealth],
  ['POST', /^\/v1\/captures$/, handleCreateCapture],
  ['GET',  /^\/v1\/captures\/(cap_[a-f0-9]{32})\/status$/, handleCaptureStatus],
];
```

**handleCreateCapture(request, env, ctx, match)**:
1. Check Content-Type: if not 'application/json', return problemResponse(415, 'Content-Type must be application/json')
2. Auth check: `const auth = verifyApiKey(request, env); if (!auth.ok) return auth.response;`
3. Rate limit check (if CAPTURE_RATE_LIMITER binding exists):
   ```js
   if (env.CAPTURE_RATE_LIMITER) {
     const { success } = await env.CAPTURE_RATE_LIMITER.limit({
       key: request.headers.get('CF-Connecting-IP') || 'unknown',
     });
     if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
   }
   ```
4. Parse JSON body. On parse failure: return problemResponse(400, 'Request body must be valid JSON')
5. Validate `url` field exists and is a string. Missing: problemResponse(400, "Field 'url' is required"). Wrong type: problemResponse(400, "Field 'url' must be a string")
6. Call validateUrl(body.url). If !result.ok: return problemResponse(result.status, result.detail)
7. Generate capture ID: `const captureId = 'cap_' + crypto.randomUUID().replace(/-/g, '')`
8. Write pending to KV (SYNCHRONOUSLY before returning 202):
   `await createCapture(env.KV, captureId, result.url, result.ip)`
   If KV write fails, return problemResponse(500, 'Could not create capture record')
9. Trigger background capture:
   `ctx.waitUntil(performCapture(env, result.url, result.ip, captureId))`
10. Build absolute status URL: `const statusUrl = new URL(\`/v1/captures/\${captureId}/status\`, request.url).href`
11. Return 202:
    ```js
    return jsonResponse({
      id: captureId,
      statusUrl,
      note: 'No list endpoint is available. Store the capture ID -- it is the only way to access this capture.',
    }, 202, { 'Retry-After': '5' });
    ```

Add security headers to ALL responses. The cleanest approach: add them after route dispatch in the main fetch handler:
```js
async fetch(request, env, ctx) {
  const response = await handleRequest(request, env, ctx);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
```

**handleCaptureStatus(request, env, ctx, match)**:
The regex capture group provides the validated captureId (match[1]).
1. The regex already enforces `cap_[a-f0-9]{32}` format. No additional validation needed.
2. Call getCapture(env.KV, match[1])
3. ADVISORY (security): If null, return problemResponse(404, 'Capture not found') -- use a STATIC string, do NOT echo match[1] back in the response body.
4. Build response based on status:
   - pending: `{ id, status: 'pending' }` with `Retry-After: 5` header and `Cache-Control: private, no-store`
   - complete: `{ id, status: 'complete', captureUrl }` where captureUrl is absolute URL to `/v1/captures/{id}` (Step 5 endpoint). `Cache-Control: private, no-store`
   - failed: `{ id, status: 'failed', error, retryable }` with `Cache-Control: private, no-store`

**Import additions at top of index.js**:
```js
import { verifyApiKey } from './auth.js';
import { validateUrl } from './url-validation.js';
import { createCapture, getCapture } from './kv.js';
import { performCapture } from './capture.js';
```

### test/capture-integration.test.js
Integration tests using SELF.fetch(). This tests the full HTTP request/response cycle.

IMPORTANT ADVISORY (test-minion): You MUST activate fetchMock in ALL tests that trigger a capture (POST that returns 202). The capture background task calls captureHeaders which does an outbound fetch. Without fetchMock active, either:
- The real network is hit (unreliable)
- The fetch throws (capture fails with wrong error)

```js
import { env, SELF, fetchMock } from 'cloudflare:test';
```

Set up fetchMock in beforeEach for tests that POST captures:
```js
beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  // Mock the outbound header fetch
  fetchMock.get('https://example.com').intercept({ path: '/' }).reply(200, 'ok', {
    headers: { 'content-type': 'text/html' },
  });
});
afterEach(() => {
  fetchMock.deactivate();
});
```

For the renderer stub in integration tests, you need to inject it. Since there's no setRenderer, use createExecutionContext + worker.fetch directly for status transition tests:

```js
import { createExecutionContext, waitOnExecutionContext, env } from 'cloudflare:test';
import worker from '../src/index.js';
```

Test cases for POST /v1/captures:
- Happy path: 202, body has id (matches /^cap_[a-f0-9]{32}$/), statusUrl (absolute URL), note field. Retry-After: 5 header. Content-Type: application/json.
- Missing auth header: 401 with WWW-Authenticate and RFC 9457 shape
- Wrong API key: 401 with RFC 9457 shape
- Missing Content-Type: 415 with RFC 9457 shape
- Missing body: 400 with RFC 9457 shape
- Invalid JSON body: 400
- Missing url field: 400 with detail mentioning 'url'
- url field not a string: 400
- URL validation failure: use 'ftp://example.com' (fails at scheme check with 400)
- Security headers present on all responses: Referrer-Policy, X-Content-Type-Options

Test cases for GET /v1/captures/{id}/status:
- Create a capture first (POST), then GET status -> 200 with id and status field. Cache-Control: private, no-store.
- Unknown ID (valid format): 404 with RFC 9457 shape
- Malformed ID (e.g., "badid"): 404 from route not matching
- No auth required on status endpoint (no Authorization header needed)

For SELF.fetch tests, auth header must use the key from vitest.config.js: 'test-api-key-for-vitest'.

## What NOT to do
- Do not modify src/auth.js, src/kv.js, or src/capture.js (those are done)
- Do not implement the actual /v1/captures/{id} retrieval endpoint (Step 5)
- Do not write evolution log docs
- Do not implement 405 Method Not Allowed (current 404 behavior is acceptable)

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced