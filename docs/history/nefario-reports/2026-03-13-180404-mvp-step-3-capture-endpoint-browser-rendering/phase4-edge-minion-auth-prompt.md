You are implementing the API key authentication module for the Web Resource Ledger Cloudflare Worker.

## Context
Working directory: /Users/ben/github/benpeter/web-resource-ledger
Read these files first:
- src/responses.js -- problemResponse() and jsonResponse() helpers
- src/url-validation.js -- pattern to follow: exported function, discriminated result object, injectable dependencies
- src/index.js -- route table, handler signature (request, env, ctx, match)
- openapi.yaml -- the API contract
- vitest.config.js -- test configuration

## What to produce

### src/auth.js
Export a function `verifyApiKey(request, env)` that:
1. Checks env.CAPTURE_API_KEY is set. If not, return `{ ok: false, response: problemResponse(503, 'Service is not configured') }`
2. Extract Authorization header. If missing: return `{ ok: false, response: problemResponse(401, 'Authorization header is required', { 'WWW-Authenticate': 'Bearer' }) }`
3. Check header starts with 'Bearer '. If not: return `{ ok: false, response: problemResponse(401, 'Authorization header must use Bearer scheme', { 'WWW-Authenticate': 'Bearer' }) }`
4. Extract token after 'Bearer '
5. Compare token to env.CAPTURE_API_KEY using timing-safe comparison:
   ```js
   const enc = new TextEncoder();
   const a = enc.encode(provided);
   const b = enc.encode(expected);
   if (a.byteLength !== b.byteLength) {
     // ADVISORY: The length check leaks key length via timing, but key length
     // is fixed at deploy time and not secret. Document this in a code comment.
     return { ok: false, response: ... };
   }
   const match = crypto.subtle.timingSafeEqual(a, b);
   if (!match) return { ok: false, response: problemResponse(401, 'Invalid API key', { 'WWW-Authenticate': 'Bearer' }) };
   ```
6. On success: return `{ ok: true }`

Follow the discriminated result pattern from validateUrl -- callers check `result.ok` then use `result.response`.

SECURITY constraints:
- NEVER log or include the provided key in error responses
- NEVER echo the provided value back
- Use crypto.subtle.timingSafeEqual for comparison (available in Workers runtime)
- Return consistent 401 for both wrong-key and empty-key cases
- Add a code comment noting that the early return on byteLength mismatch leaks key length, but key length is fixed at deploy time and publicly known (not secret)

### test/auth.test.js
Unit tests importing verifyApiKey directly. Test cases:
- Correct key -> { ok: true }
- Wrong key -> 401 with WWW-Authenticate header
- Missing Authorization header -> 401
- Malformed header (not Bearer scheme, e.g., "Basic abc") -> 401
- Empty token ("Bearer ") -> 401
- Missing CAPTURE_API_KEY env var -> 503
- Response bodies are RFC 9457 shape (type, status, title, detail)
- Error responses never contain the test API key value

For tests, construct env objects directly:
```js
const env = { CAPTURE_API_KEY: 'test-key-abc123' };
const request = new Request('https://example.com/v1/captures', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer test-key-abc123' },
});
```

Follow existing test patterns from test/responses.test.js and test/url-validation.test.js:
- import from 'vitest' for describe, it, expect
- Descriptive test names
- Group with describe blocks

### vitest.config.js update
Add CAPTURE_API_KEY binding to miniflare config so integration tests can use it:
```js
miniflare: {
  browserRendering: { binding: 'BROWSER' },
  bindings: {
    CAPTURE_API_KEY: 'test-api-key-for-vitest',
  },
},
```

### responses.js update
Add `415: 'Unsupported Media Type'` to the titles map.

## Module header comment convention
Follow the pattern from url-validation.js: module-level block comment explaining purpose, trust boundaries, and attack categories.

## What NOT to do
- Do not implement the capture handler or route table changes
- Do not implement rate limiting
- Do not create more than the files listed above
- Do not use === for key comparison

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced