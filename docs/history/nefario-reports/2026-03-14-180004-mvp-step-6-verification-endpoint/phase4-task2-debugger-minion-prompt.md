## Task: Wire up GET /v1/verify/{id} endpoint handler and rate limiter

Add the verification endpoint to the Cloudflare Worker router and create the HTTP handler that orchestrates KV lookup, R2 fetch, verification, and response assembly.

### Context

Task 1 produced `src/verify.js` with `verifyWacz(waczBytes, publicKeyBytes)`. This task wires it into the HTTP layer. The endpoint is public (no authentication), rate-limited, and cached.

### Changes to make

#### 1. Add route to `src/index.js`

Add to the `routes` array (before the catch-all, after the artifact route):
```js
['GET', /^\/v1\/verify\/(cap_[a-f0-9]{32})$/, handleVerifyCapture],
```

Import at top of file:
```js
import { verifyWacz } from './verify.js';
import { getSigningKeys } from './signing.js';
```

#### 2. Implement `handleVerifyCapture` in `src/index.js`

The handler follows this flow:

**Step 1: Rate limit check**
```js
if (env.VERIFY_RATE_LIMITER) {
  const { success } = await env.VERIFY_RATE_LIMITER.limit({
    key: request.headers.get('CF-Connecting-IP') || 'unknown',
  });
  if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
}
```
Note: The 'unknown' fallback is acceptable -- CF-Connecting-IP is always present in Cloudflare Workers production. In local dev, all requests share one rate limit bucket. Add a brief comment noting this.

**Step 2: Signing key availability check**
Call `getSigningKeys(env)`. If `null`, return `problemResponse(503, 'Verification service is not configured')`. This handles the case where `env.SIGNING_KEY` is not set.

**Step 3: KV lookup (fast-fail)**
Call `getCapture(env.KV, captureId)`. Return 404 (`'Capture not found'`, with `Cache-Control: no-store`) if:
- Record is null (does not exist)
- Record status is not `'complete'`
- Record has no `wacz` field (capture completed without signing)

This is the primary resource-exhaustion defense -- cheap KV read before expensive R2 fetch.

**Step 4: R2 fetch**
Fetch the WACZ from R2 using `record.wacz.key`. If the R2 object is null (data loss), return 200 with `verified: false` and all checks as `'fail'` with detail `'WACZ bundle not found in storage'`. Do NOT return 500 -- this is a verification result, not a server error.

**Step 5: Size guard -- BEFORE arrayBuffer()**
Check `obj.size`. If > 100MB (104857600 bytes), return `problemResponse(422, 'WACZ bundle exceeds maximum verifiable size')`.
CRITICAL: This check MUST happen BEFORE calling `obj.arrayBuffer()`. The size check gates the memory allocation.

**Step 6: Verify**
```js
const waczBytes = new Uint8Array(await obj.arrayBuffer());
const result = await verifyWacz(waczBytes, keys.publicKeyBytes);
```

**Step 7: Build response**
ADVISORY INCORPORATED -- DROP `capture.url` from verify response:
```js
const body = {
  verified: result.verified,
  capture: {
    id: record.captureId,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
  },
  signing: result.capture || null,
  checks: result.checks,
};
```
NOTE: Field is named `signing` (not `wacz`) to avoid collision with the retrieval endpoint's `wacz` field which has a different shape. The `capture.url` is intentionally omitted -- the retrieval endpoint uses `private, no-store` to protect URLs, and publishing them on a publicly-cached verification endpoint would break that access-control model.

**Step 8: Cache-Control and headers**
- If `result.verified === true`: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`
- If `result.verified === false`: `Cache-Control: no-store`
- Always: `Access-Control-Allow-Origin: *`

Return via `jsonResponse(body, 200, headers)`.

#### 3. Add `verifyUrl` to retrieval response

In the existing `handleGetCapture` function, add a `verifyUrl` field to the response body when the capture has WACZ data:
```js
if (record.wacz) {
  body.wacz = { /* existing fields */ };
  body.verifyUrl = `${base}/v1/verify/${captureId}`;
}
```

This completes the journey chain: POST -> status -> capture -> verify.

#### 4. Add rate limiter binding to `wrangler.toml`

Add a new `[[unsafe.bindings]]` block:
```toml
[[unsafe.bindings]]
name = "VERIFY_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1002"
simple = { limit = 60, period = 60 }
```

Use `namespace_id = "1002"` (different from the capture rate limiter's `"1001"`).

### What NOT to do

- Do NOT modify `src/verify.js` (Task 1's deliverable).
- Do NOT write tests (Tasks 3 and 4 handle that).
- Do NOT add any new dependencies.
- Do NOT change the behavior of any existing endpoints (except adding `verifyUrl` to retrieval).
- Do NOT add CORS preflight handling (not needed for GET-only endpoint with simple headers).

### Reference: existing patterns

- Rate limiting: see `handleCreateCapture` in `src/index.js`
- KV lookup + 404: see `handleGetCapture` in `src/index.js`
- Response assembly: see `handleGetCapture` for the pattern of building body + headers
- `jsonResponse` and `problemResponse` from `src/responses.js`

### Deliverables

- Modified `src/index.js` (new route, new handler, `verifyUrl` in retrieval)
- Modified `wrangler.toml` (new rate limiter binding)

### Success criteria

- `GET /v1/verify/cap_{valid_id}` returns 200 with verification result
- `GET /v1/verify/cap_{unknown_id}` returns 404
- Rate limiting returns 429 with `Retry-After: 60`
- Missing signing key returns 503
- `verifyUrl` appears in retrieval response when WACZ is present
- No new dependencies added
- `capture.url` is NOT in the verify response
- `signing` field (not `wacz`) contains verification metadata
- Size check happens BEFORE arrayBuffer() call

### Advisories incorporated
- [security] DROP capture.url from verify response -- retrieval uses private, no-store to protect URLs; public caching on verify would leak them
- [security] Size guard BEFORE arrayBuffer() -- memory exhaustion risk if R2 object unexpectedly large
- [ux-strategy] Rename wacz to signing in verify response -- avoid field name collision with retrieval endpoint
- [security] Comment on rate limiter 'unknown' fallback -- CF-Connecting-IP always present in production

When you finish, mark task #2 completed with TaskUpdate and send a message to the team lead with file paths, change scope, and line counts.
