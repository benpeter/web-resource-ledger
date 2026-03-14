# Task 3: Unit Tests for `src/verify-page.js`

Create `test/verify-page.test.js` with unit tests for the HTML generation
function. These tests exercise the pure function directly, without Worker
infrastructure.

## Import

```js
import { htmlVerifyResponse, escapeHtml } from '../src/verify-page.js';
```

## Function Signature

```js
htmlVerifyResponse(captureId, origin, cacheControl) -> Response
```

- `captureId`: string like `cap_ffffffffffffffffffffffffffffffff`
- `origin`: string like `https://worker.test`
- `cacheControl`: string like `public, max-age=86400, stale-while-revalidate=604800`

## Test Strategy

Use string assertions on `await response.text()`. Do NOT use DOM parsing
(no jsdom, linkedom, happy-dom). The project runs in workerd (Cloudflare's
runtime), not Node.js. String matching via `toContain()` and `toMatch()` is
correct for this environment.

Do NOT use snapshot testing. Large HTML snapshots break constantly and get
blindly updated.

## Test Cases

**Response structure:**
1. Returns a Response object with status 200
2. Content-Type is `text/html; charset=utf-8`
3. Cache-Control matches the provided parameter
4. CSP header is present with `default-src 'none'`
5. `X-Frame-Options: DENY` is present
6. `Vary: Accept` is present

**HTML content:**
7. Contains `<!DOCTYPE html>` and `<html lang="en">`
8. Contains the capture ID in the noscript block
9. Contains a link to the JSON API endpoint in noscript: `/v1/verify/{captureId}`
10. Contains `<noscript>` tag
11. Contains the API fetch URL pattern with the captureId
12. Contains inline `<style>` and `<script>` tags (no external resources)
13. Does NOT contain `<link rel="stylesheet"` or `<script src="`

**escapeHtml function:**
14. Escapes `<` to `&lt;`
15. Escapes `>` to `&gt;`
16. Escapes `&` to `&amp;`
17. Escapes `"` to `&quot;`
18. Escapes `'` to `&#x27;`
19. Returns empty string for non-string input
20. Returns the same string if no special characters

**Security:**
21. The capture ID in the HTML is HTML-escaped (verify the noscript contains
    the escaped form of the captureId)
22. The origin in the noscript block is HTML-escaped (verify escapeHtml is
    applied to origin)
23. The HTML template contains a URL scheme validation function (search for
    `http:` and `https:` protocol checks in the JS portion -- the `safeUrl`
    function or equivalent that validates schemes before setting href/src)
24. The HTML template contains `Accept` header set to `application/json`
    in the fetch call (prevents content negotiation loop)

**NOTE on innerHTML check:** The implementation uses `innerHTML` for
structural HTML rendering (SVG icons, CSS classes) while using `textContent`
for all user-controlled data. This is an acceptable pattern. Do NOT add a
blanket "no innerHTML" test -- it would fail because the structural rendering
uses it. Instead, test #23 and #24 verify the actual security controls.

## Test File Pattern

Follow the existing pattern in the project. Use vitest:

```js
import { describe, it, expect } from 'vitest';
```

Group tests with describe blocks: 'htmlVerifyResponse -- response headers',
'htmlVerifyResponse -- HTML content', 'escapeHtml', 'security'.

## What NOT to Do

- Do NOT import or use `SELF`, `env`, or `fetchMock` from `cloudflare:test`
  (those are for integration tests)
- Do NOT add any npm dependencies
- Do NOT test the content negotiation logic (that is Task 4's scope)
- Do NOT parse the HTML with a DOM parser
- Do NOT use snapshot testing

## Deliverables

Single file: `test/verify-page.test.js`

Target: ~20 tests. Keep it focused and avoid overlap with integration tests.

## Completion

When you finish, mark the task as completed with TaskUpdate and send a message
to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
