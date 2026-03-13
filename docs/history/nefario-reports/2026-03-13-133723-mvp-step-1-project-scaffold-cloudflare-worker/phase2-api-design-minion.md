## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. Route Dispatch Pattern: Method + URL Pattern Matching (No Library)

For 6 routes growing to 8, a simple array-of-tuples approach is the
lightest pattern that stays readable without a router library. Each route
is a `[method, pattern, handler]` tuple. The `fetch` handler iterates the
array, matches method and path, and calls the first matching handler.

**Recommended pattern:**

```js
const routes = [
  ['GET',  /^\/health$/, handleHealth],
  ['POST', /^\/v1\/captures$/, handleCreateCapture],
  ['GET',  /^\/v1\/captures\/([^/]+)\/status$/, handleCaptureStatus],
  ['GET',  /^\/v1\/captures\/([^/]+)$/, handleCapture],
  ['GET',  /^\/v1\/verify\/([^/]+)$/, handleVerify],
  ['GET',  /^\/\.well-known\/signing-key$/, handleSigningKey],
];
```

The dispatch loop:

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    for (const [routeMethod, pattern, handler] of routes) {
      if (method !== routeMethod) continue;
      const match = url.pathname.match(pattern);
      if (match) return handler(request, env, ctx, match);
    }

    return problemResponse(404, 'not-found', 'Not Found',
      `No route matches ${method} ${url.pathname}`);
  }
};
```

**Why this over alternatives:**

- **`if/else` chain:** Works for 2-3 routes but becomes unreadable at 6-8.
  The regex array stays one line per route, and adding a new route in Steps
  2-8 is one line of code.
- **URLPattern API:** Cloudflare Workers support it, but it adds abstraction
  with no benefit over regex at this scale. Also, URLPattern's constructor
  arguments differ subtly from other environments, which could trip up
  contributors. Regex is universal.
- **Router library (itty-router, hono):** Violates Helix Manifesto's KISS
  and lean-and-mean for 8 routes. The dispatch loop above is ~10 lines. A
  library adds a dependency, its API idioms, version management, and bundle
  considerations -- all for something that's 10 lines of vanilla JS.

**Key design choice: regex capture groups for path parameters.** The `match`
array is passed to the handler. `match[1]` is the capture ID. This is
minimal and obvious. Handlers destructure what they need:

```js
async function handleCapture(request, env, ctx, match) {
  const id = match[1];
  // ...
}
```

**Route ordering matters.** `/v1/captures/{id}/status` must appear before
`/v1/captures/{id}` because the shorter pattern would match first. Document
this in a code comment at the routes array.

**Step 1 deliverable:** Only the `['GET', /^\/health$/, handleHealth]` route
and the fallback 404. The routes array and dispatch loop are established so
Steps 2-8 add one line each.

#### 2. RFC 9457 Error Utility: Separate Module (`src/errors.js`)

**Separate module, not inline.** Every endpoint (Steps 2-8) will produce
errors -- 401, 404, 422, 429, 503. Inlining the error shape in each handler
guarantees drift. A shared module guarantees consistency.

**The utility should return a full `Response` object**, not just a JSON body.
Rationale: the `Content-Type` header (`application/problem+json`) and status
code are integral to RFC 9457. If the utility only returns JSON, every handler
must remember to set the content type and status code correctly. That's
exactly the kind of thing that drifts.

**Recommended API shape:**

```js
// src/errors.js

/**
 * Creates an RFC 9457 problem+json Response.
 *
 * @param {number} status - HTTP status code
 * @param {string} type   - short error type identifier (e.g. 'not-found')
 * @param {string} title  - human-readable summary
 * @param {string} [detail] - specific occurrence explanation
 * @returns {Response}
 */
export function problemResponse(status, type, title, detail) {
  const body = {
    type: `about:blank#${type}`,
    title,
    status,
  };
  if (detail) body.detail = detail;

  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}
```

**Design decisions within the utility:**

- **`type` URI scheme: `about:blank#<short-name>`**. RFC 9457 says `type`
  should be a URI. Options:
  - Full URL like `https://api.wrl.example/errors/not-found` -- requires
    hosting error documentation at that URL. Overkill for 4 endpoints.
  - `about:blank` (the RFC default when type is generic) -- loses the ability
    to distinguish error types programmatically.
  - `about:blank#<short-name>` -- valid URI, machine-parseable via the
    fragment, no hosting requirement, trivially extensible.
  This is the KISS choice. If the project later hosts error docs, switching
  to full URLs is a one-line change in `problemResponse`.

- **No `instance` field in Step 1.** RFC 9457 allows it but doesn't require
  it. Adding it later (e.g., pointing to a request ID) is additive and
  non-breaking.

- **Error types to define in Step 1** (as named constants or just
  documented convention):
  - `not-found` -- 404 (unknown route, unknown capture ID)
  - `method-not-allowed` -- 405 (right path, wrong HTTP method)
  - `unauthorized` -- 401 (missing/invalid API key, Step 3)
  - `validation-error` -- 422 (invalid URL, Step 2)
  - `rate-limited` -- 429 (Step 6)
  - `service-unavailable` -- 503 (backpressure, Step 8)

  Only `not-found` and `method-not-allowed` are needed in Step 1. The others
  are listed so subsequent steps use consistent names.

- **`method-not-allowed` handling:** The dispatch loop as designed returns
  404 for all non-matches. Consider whether the fallback should distinguish
  "right path, wrong method" (405 with `Allow` header) from "no such route"
  (404). Recommendation: keep it as 404 in Step 1 for simplicity. If it
  matters later, the dispatch loop can be enhanced to detect path-matches-
  but-method-differs. This is a YAGNI call -- the API surface is small
  enough that 405 vs 404 distinction has minimal developer experience impact.

#### 3. Content-Type and Status Code Conventions

These conventions must be established in Step 1 and followed by all
subsequent steps. Document them as code comments in `src/index.js` or in a
brief `API_CONVENTIONS.md` (though code comments are more likely to be read).

**Response content types:**

| Scenario | Content-Type |
|----------|-------------|
| Success JSON responses | `application/json` |
| Error responses (all) | `application/problem+json` |
| HTML verification page (Step 7) | `text/html; charset=utf-8` |

No other content types until Step 7. This means the entry point can default
to `application/json` for success responses and let `problemResponse` handle
the error content type.

**JSON response helper (optional but recommended):**

```js
export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
```

This is the success-path counterpart to `problemResponse`. Same rationale:
if every handler constructs `new Response(JSON.stringify(...))` manually,
content-type headers will drift. Two helpers -- `jsonResponse` and
`problemResponse` -- cover 100% of responses until Step 7.

**Status code conventions (all steps):**

| Endpoint | Success Code | Rationale |
|----------|-------------|-----------|
| `GET /health` | 200 OK | Standard health check |
| `POST /v1/captures` | 202 Accepted | Async processing, not synchronous creation |
| `GET /v1/captures/{id}/status` | 200 OK | Returns current status |
| `GET /v1/captures/{id}` | 200 OK | Returns metadata |
| `GET /v1/verify/{id}` | 200 OK | Returns verification result |
| `GET /.well-known/signing-key` | 200 OK | Returns public key |

**Error status codes (all steps):**

| Condition | Status | Type slug |
|-----------|--------|-----------|
| No matching route | 404 | `not-found` |
| Unknown resource ID | 404 | `not-found` |
| Missing/invalid API key | 401 | `unauthorized` |
| Invalid input (URL validation fails) | 422 | `validation-error` |
| Rate limited | 429 | `rate-limited` |
| Service overloaded | 503 | `service-unavailable` |

**Why 422 for validation, not 400:** RFC 9110 defines 422 as "the server
understands the content type and syntax, but was unable to process the
contained instructions." This precisely describes URL validation failure:
the JSON was valid, but the URL within it was not acceptable. 400 is for
malformed requests (bad JSON, wrong content type). This distinction helps
API consumers differentiate "your JSON is broken" from "your URL is
invalid." Caveat: this is a reasonable position, not universal law. 400 is
also defensible. The important thing is consistency -- pick one and stick
with it across all endpoints.

**POST /v1/captures response shape (202):**

The 202 response should include enough information for the caller to
poll and retrieve:

```json
{
  "id": "cap_abc123...",
  "status": "pending",
  "statusUrl": "/v1/captures/cap_abc123.../status",
  "captureUrl": "/v1/captures/cap_abc123..."
}
```

Using relative URLs for `statusUrl` and `captureUrl` keeps the response
correct regardless of the host. This is fine for a single-worker API.

**Standard response headers (all responses):**

Every response should include these headers (added in the dispatch loop or
via a wrapper, not per-handler):

- `Content-Type` (via helpers)
- `Cache-Control: no-store` (default, overridden per-endpoint where caching
  makes sense -- Step 6 sets `public, immutable, max-age=31536000` on
  verification results)

Security headers (`Strict-Transport-Security`, `X-Content-Type-Options`,
`X-Frame-Options`) are Step 8's concern per MVP.md. Do not add them in
Step 1 -- YAGNI.

#### 4. Content Negotiation Preparation (Step 7)

Step 7 requires content negotiation on the verify endpoint: `Accept:
text/html` serves HTML, otherwise JSON. The route dispatch pattern
recommended above naturally supports this because the handler function
receives the full `request` and can inspect `Accept` headers.

No changes needed to the Step 1 scaffold to support this. The `handleVerify`
handler added in Step 6 will check `request.headers.get('Accept')` and
branch. This is worth noting in a code comment near the routes array so the
Step 7 implementer knows the pattern is designed for it.

#### 5. Trailing Slash Handling

Decide now: reject or redirect trailing slashes? Recommendation: **ignore
trailing slashes by stripping them before matching.** One line in the
dispatch loop:

```js
const pathname = url.pathname.replace(/\/$/, '') || '/';
```

This prevents subtle bugs where `/health/` returns 404 but `/health` works.
Cloudflare Workers don't auto-normalize trailing slashes.

### Proposed Tasks

**Task 1: Create `src/errors.js` -- RFC 9457 error utility**
- Deliverable: `problemResponse(status, type, title, detail)` function
  returning a `Response` with `application/problem+json`
- Type URI scheme: `about:blank#<slug>`
- Export a list of standard type slugs as comments or as named constants
- Dependencies: none

**Task 2: Create `src/response.js` -- JSON response helper**
- Deliverable: `jsonResponse(body, status, headers)` function returning a
  `Response` with `application/json`
- Dependencies: none
- Note: Could be merged into `src/errors.js` as `src/responses.js` if the
  team prefers a single response-utility module. Either way works. The key
  is that both helpers exist.

**Task 3: Create `src/index.js` -- Worker entry point with route dispatch**
- Deliverable: `export default { fetch }` with routes array, dispatch loop,
  trailing slash normalization, and fallback 404
- Step 1 routes: only `GET /health` and the 404 fallback
- Health handler returns `jsonResponse({ status: 'ok' })`
- Dependencies: Tasks 1 and 2

**Task 4: Document conventions in code comments**
- Deliverable: Comments in `src/index.js` documenting:
  - Route ordering rule (most specific first)
  - How to add a new route (add tuple, create handler)
  - Content-type convention (json for success, problem+json for errors)
  - Status code table reference (could point to MVP.md or inline)
- Dependencies: Task 3

### Risks and Concerns

1. **Route ordering bugs.** `/v1/captures/{id}` and `/v1/captures/{id}/status`
   will collide if ordered wrong. The regex patterns as written (`/status$`
   vs `$`) handle this if `/status` is first, but this must be documented
   and tested. Recommend a test in Step 3 that explicitly verifies both
   routes resolve correctly with the same capture ID.

2. **RFC 9457 `type` field drift.** If handlers construct error responses
   manually instead of using `problemResponse`, the `type` URIs will
   diverge. Mitigation: make `problemResponse` the only way to create error
   responses. Code review checklist item: "no `new Response` with status
   >= 400 outside of `problemResponse`."

3. **`application/problem+json` vs `application/json` for error responses.**
   Some HTTP clients and API testing tools don't parse `application/
   problem+json` automatically. This is correct per RFC 9457 and should not
   be weakened, but document it in the OpenAPI spec (Step 8) so SDK
   generators handle it properly.

4. **Capture ID format leaking into routing.** The regex `([^/]+)` matches
   any non-slash string as a capture ID. This is intentional and correct --
   the handler validates the ID against KV, not the router. Do not tighten
   the regex to match specific ID formats (e.g., `cap_[a-f0-9]+`) because
   it couples routing to ID generation, which is a different concern. If
   the ID format changes, the router should not need updating.

5. **No CORS headers in Step 1.** The static verification page (Step 7) runs
   from the same origin, so CORS is not needed. If a future step adds
   cross-origin consumers, CORS headers can be added to the response helpers
   or as middleware in the dispatch loop. Flag this for Step 7 review.

### Additional Agents Needed

None. The current team (iac-minion, api-design-minion, test-minion,
api-spec-minion) covers all four foundations. The route dispatch pattern,
error utility, and content-type conventions are squarely in api-design-minion
territory. The api-spec-minion consultation will refine the RFC 9457 details;
there is no conflict between the two contributions since this document
establishes the API-level design and api-spec-minion validates spec
compliance.
