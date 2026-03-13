You are writing the initial test suite for WRL (Web Resource Ledger), a
Cloudflare Worker project. The project scaffold and source code already exist.

Working directory: /Users/ben/github/benpeter/web-resource-ledger

Existing files:
- wrangler.toml -- Worker config with main = "src/index.js", R2/KV/Browser bindings
- vitest.config.js -- defineWorkersConfig pointing to wrangler.toml
- src/index.js -- Worker entry point with GET /health route and fallback 404
- src/responses.js -- problemResponse(status, detail, headers?) and jsonResponse(body, status?, headers?)
- Package versions: vitest@3.2.4, @cloudflare/vitest-pool-workers@0.12.21

## What to create

### 1. test/health.test.js -- Integration tests (SELF.fetch pattern)

```js
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
```

Tests to write:

| Test name | Method | Path | Expected status | Assertions |
|-----------|--------|------|----------------|------------|
| GET /health returns 200 with status ok | GET | /health | 200 | Body matches { status: 'ok' } using toMatchObject, Content-Type application/json |
| GET /health/ with trailing slash returns 200 | GET | /health/ | 200 | Same as above (trailing slash normalization) |
| POST /health returns 404 | POST | /health | 404 | Body has RFC 9457 shape (type, status, title, detail), Content-Type application/problem+json |
| GET /nonexistent returns 404 | GET | /nonexistent | 404 | Body has RFC 9457 shape, Content-Type application/problem+json |

SELF.fetch details:
- Use https://example.com as the dummy host: SELF.fetch('https://example.com/health')
- For POST: SELF.fetch('https://example.com/health', { method: 'POST' })

IMPORTANT advisories from architecture review:
- The POST /health test: Add an inline comment explaining this intentionally returns
  404 (not 405) because method dispatch is out of scope for Step 1. This tests the
  fallback dispatcher behavior.
- Health body assertion: Use toMatchObject({ status: 'ok' }) instead of toEqual.
  Strict equality breaks on any future field addition.
- Content-Type on 404 tests: Explicitly assert Content-Type contains
  'application/problem+json' on BOTH the /nonexistent and POST /health tests.

### 2. test/responses.test.js -- Unit tests (direct import pattern)

```js
import { problemResponse, jsonResponse } from '../src/responses.js';
import { describe, it, expect } from 'vitest';
```

Tests to write:

| Test name | What it tests |
|-----------|--------------|
| problemResponse returns correct RFC 9457 shape | Call with (404, 'Test detail'), assert body has type=about:blank, status=404, title=Not Found, detail=Test detail; Content-Type is application/problem+json |
| problemResponse response status matches body status | Call with (422, 'detail'), assert response.status === 422 AND body.status === 422 |
| problemResponse uses fallback title for unknown status codes | Call with (418, 'detail'), assert body.title === 'Error' |
| problemResponse includes additional headers | Call with (405, 'detail', { 'Allow': 'GET' }), assert response.headers.get('Allow') === 'GET' AND Content-Type is still application/problem+json |
| jsonResponse returns correct shape | Call with ({ status: 'ok' }), assert body equals { status: 'ok' }, status 200, Content-Type application/json |
| jsonResponse accepts custom status and headers | Call with ({ id: '123' }, 201, { 'X-Custom': 'val' }), assert status 201, Content-Type application/json, X-Custom header present |

### Test conventions
- Use describe blocks grouping by function/endpoint
- Each test is independent (no shared state between tests)
- Parse response body with await response.json() (not text)
- Assert both HTTP status and body fields in integration tests
- Use toEqual for object shape assertions in unit tests, toMatchObject for health body in integration tests
- Use toBe for primitives

## What NOT to do
- Do NOT use test.globals: true -- always import describe, it, expect from vitest
- Do NOT add coverage configuration
- Do NOT create test fixtures, factories, or shared test utilities
- Do NOT add tests for endpoints that do not exist yet (Steps 2-8)
- Do NOT mock anything -- these tests run in Miniflare which provides real bindings
- Do NOT use beforeAll/afterAll for these tests (not needed)
- Do NOT import env from cloudflare:test (not needed in Step 1)

## Verification
- npm test passes with all tests green

## Team context
Team name: wrl-scaffold
Your task ID: 3
When you finish, mark task 3 as completed with TaskUpdate and send a message to the team lead with file paths and a 1-2 sentence summary.
