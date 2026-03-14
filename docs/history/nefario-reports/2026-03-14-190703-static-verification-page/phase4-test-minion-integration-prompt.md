# Task 4: Integration Tests for Content Negotiation

Create `test/verify-html.test.js` with integration tests that exercise the
full Worker content negotiation through `SELF.fetch()`. These tests verify
that the Accept header correctly routes to HTML or JSON responses.

## Test Infrastructure

Use the same pattern as `test/verify-integration.test.js`:

```js
import { env, SELF, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture } from '../src/capture.js';
import { createCapture } from '../src/kv.js';
```

The beforeEach/afterEach setup should mirror `verify-integration.test.js`:
create a real capture with a signed WACZ using `performCapture`. This gives
us a valid capture ID that the verify endpoint can process.

## Test Cases

**Content negotiation -- Accept header routing:**
1. `Accept: text/html` -> returns HTML (Content-Type: text/html)
2. `Accept: application/json` -> returns JSON (Content-Type: application/json)
3. No Accept header -> returns JSON (backward compatibility)
4. `Accept: */*` -> returns JSON (curl default)
5. `Accept: text/html, application/json` -> returns HTML (browser default)

**HTML response correctness:**
6. HTML response status is 200
7. HTML response has `Content-Security-Policy` header with `default-src 'none'`
8. HTML response has `Vary: Accept`

**Vary header on JSON responses:**
9. JSON response (default Accept) has `Vary: Accept`

**Cache-Control parity:**
10. HTML and JSON responses for the same capture have the same Cache-Control value

**JSON API regression guard:**
11. JSON response shape is unchanged (has verified, capture, signing, checks)
12. `capture.url` is still absent from JSON verify response

**HTML template content verification:**
13. HTML body contains `Accept` header string set to `application/json`
    in a fetch context (prevents content negotiation loop)

**Error paths stay JSON:**
14. 404 error path returns `application/problem+json` even with `Accept: text/html`
    -- use a non-existent capture ID (e.g., `cap_${'0'.repeat(32)}`) that was
    never created in beforeEach
15. Unverified capture HTML response has appropriate Cache-Control (should NOT
    be long-cached with public)

## Testing Notes

- Use `await res.text()` for HTML responses, `await res.json()` for JSON
- For HTML content assertions, use `toContain()` string checks
- Do NOT add DOM parsing dependencies
- To set Accept header: `new Request(url, { headers: { Accept: '...' } })`
  passed to `SELF.fetch()`
- The existing beforeEach with `performCapture` creates a fully verified
  capture, so `Accept: text/html` on the verify endpoint should return HTML
  for a verified capture

**IMPORTANT: Error path tests (test 14) must use a DIFFERENT, non-existent
capture ID (e.g., `cap_${'0'.repeat(32)}`), NOT the beforeEach capture ID.**
Using the beforeEach capture ID for error tests would return a 200 HTML page
instead of the expected error, causing confusing test failures.

## What NOT to Do

- Do NOT modify existing test files
- Do NOT modify source files
- Do NOT add npm dependencies
- Do NOT test the HTML template content in detail (Task 3 covers that)
- Do NOT use snapshot testing

## Deliverables

Single file: `test/verify-html.test.js`

Target: ~15 tests. Focus on content negotiation routing, not HTML template details.

## Completion

When you finish, mark the task as completed with TaskUpdate and send a message
to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
