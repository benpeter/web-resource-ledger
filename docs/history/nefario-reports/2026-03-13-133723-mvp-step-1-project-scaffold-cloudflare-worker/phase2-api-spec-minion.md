# api-spec-minion: RFC 9457 Error Utility Design

## Recommendations

### 1. Use `about:blank` for all `type` values -- no custom URIs

RFC 9457 Section 4.2.1 states: "The 'about:blank' URI, when used as a problem type, indicates that the problem has no additional semantics beyond that of the HTTP status code."

Every error case in the WRL MVP maps directly to a standard HTTP status code:

| Status | Meaning in WRL | Additional semantics needed? |
|--------|---------------|------------------------------|
| 404 | Unknown capture ID | No -- "not found" says it all |
| 401 | Missing/invalid API key | No -- "unauthorized" says it all |
| 422 | Invalid URL | No -- `detail` field carries the specifics |
| 503 | Backpressure | No -- `Retry-After` header carries the timing |
| 405 | Wrong HTTP method | No -- `Allow` header carries the valid methods |

Custom type URIs (like `urn:wrl:error:not-found` or `https://wrl.example/problems/invalid-url`) add value only when the problem has semantics *beyond* the HTTP status code -- for example, when a 422 could mean three different domain-specific things that the client needs to distinguish programmatically. WRL's 4-endpoint MVP does not have that ambiguity. Each status code maps 1:1 to a single error condition per endpoint.

Custom URIs also create a maintenance burden: they imply a namespace you need to manage, possibly a documentation page to host, and a contract clients may depend on. YAGNI.

**Since `about:blank` is the default when `type` is omitted, the implementation can simply omit the `type` field entirely.** RFC 9457 explicitly says: "any problem details object not carrying an explicit `type` member implicitly uses this URI." This is the leanest compliant approach. However, I recommend including `type: "about:blank"` explicitly for clarity -- it costs 23 bytes and makes the response self-documenting for any developer reading it without knowing the RFC default. This is a judgment call; omitting it is equally correct.

### 2. Include exactly these fields: `type`, `status`, `title`, `detail`

RFC 9457 makes ALL members optional. The MVP.md says "RFC 9457 requires: type, title, status, detail" -- this is slightly inaccurate per the RFC, but including all four is the right call for this API regardless. Here is why each one earns its place:

- **`type`**: `"about:blank"` -- identifies this as a standard HTTP error, no custom semantics. Explicit is better than implicit.
- **`status`**: The HTTP status code as an integer. Redundant with the HTTP response status, but RFC 9457 Section 3.1 explains this is intentional: intermediaries (proxies, CDNs) can change the HTTP status code, and the `status` member preserves the origin server's intent. For a Cloudflare Worker behind Cloudflare's edge, this is a real concern.
- **`title`**: Short human-readable summary. When using `about:blank`, this SHOULD match the HTTP reason phrase per Section 4.2.1 (e.g., "Not Found", "Unauthorized").
- **`detail`**: Human-readable explanation specific to this occurrence. This is where the useful information goes: "Capture cap_abc123 not found", "URL scheme 'ftp' is not allowed", "Missing Authorization header".

**Omit `instance` for now.** The `instance` member is a URI reference identifying this specific occurrence -- useful for correlating with server logs. WRL has no log aggregation system in the MVP. Adding `instance` now would mean generating a value nobody can look up. Add it when observability infrastructure exists (e.g., a request ID that maps to Coralogix traces). This is a clean YAGNI cut.

### 3. The utility MUST return a complete `Response` object, not just the JSON body

This is the strongest recommendation in this contribution. The error utility must produce a fully-formed `Response` because the error response has requirements that span beyond the JSON body:

1. **`Content-Type: application/problem+json`** -- RFC 9457 Section 3 requires this media type. If the utility returns only a JSON object, every call site must remember to set this header. One forgotten `Content-Type` and the response is technically non-compliant. A `Response`-returning utility makes compliance automatic.

2. **Status code consistency** -- the HTTP status code and the `status` field in the body must match. A `Response`-returning utility enforces this by construction (one `status` argument sets both).

3. **Additional headers per error type** -- 405 responses MUST include an `Allow` header (RFC 9110 Section 15.5.6). 503 responses SHOULD include `Retry-After`. These are not part of the JSON body. A body-only utility cannot express them.

4. **Call-site ergonomics** -- route handlers should be able to `return problemResponse(404, 'Capture cap_abc123 not found')` as a one-liner. No assembling headers, no remembering content types.

### 4. Proposed utility API shape

```js
// src/errors.js

/**
 * Creates an RFC 9457 application/problem+json Response.
 *
 * @param {number} status - HTTP status code
 * @param {string} detail - Human-readable explanation of this occurrence
 * @param {Record<string, string>} [headers] - Additional response headers
 * @returns {Response}
 */
export function problemResponse(status, detail, headers = {}) {
  const titles = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Content',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };

  const body = {
    type: 'about:blank',
    status,
    title: titles[status] || 'Error',
    detail,
  };

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...headers,
    },
  });
}
```

Usage at call sites:

```js
// 404 -- one-liner
return problemResponse(404, `Capture ${id} not found`);

// 405 -- with required Allow header
return problemResponse(405, 'POST is not allowed on this endpoint', {
  'Allow': 'GET',
});

// 503 -- with Retry-After
return problemResponse(503, 'Service is at capacity', {
  'Retry-After': '30',
});

// 401 -- missing auth
return problemResponse(401, 'Missing Authorization header');

// 422 -- invalid input
return problemResponse(422, `URL scheme '${scheme}' is not allowed; use http or https`);
```

**Why this shape and not something else:**

- **Not a class/constructor**: No need for `new ProblemError(...)` or a class hierarchy. There is one function, it returns a Response. KISS.
- **Not throwing**: Cloudflare Workers use `return` from the `fetch` handler, not `throw`. A thrown error would need a `try/catch` wrapper in the router. Returning a Response directly is idiomatic for Workers.
- **Title is derived, not passed**: Since we use `about:blank`, the title is always the standard HTTP reason phrase. No call site should ever need to pass a custom title. This eliminates a parameter and a class of inconsistency bugs.
- **Headers as third argument**: Optional, flat object. Covers `Allow`, `Retry-After`, and any future needs without adding dedicated parameters.
- **The title map includes status codes beyond the 5 MVP cases**: 400, 403, 409, 429 are cheap to include (6 extra lines) and prevent a runtime gap if a new error condition is added in steps 2-8. This is not speculative feature-building -- it is a lookup table that costs nothing and prevents a "titles[status] returns undefined" bug.

### 5. Schema for the OpenAPI spec (Step 8)

When the OpenAPI spec is authored in Step 8, the error schema should be defined once in `components/schemas/` and referenced from every error response. Here is what it should look like:

```yaml
components:
  schemas:
    ProblemDetail:
      type: object
      description: >-
        RFC 9457 Problem Details object. All errors from this API use
        the about:blank problem type, meaning the HTTP status code
        fully describes the error category.
      properties:
        type:
          type: string
          format: uri
          description: >-
            Problem type URI. Always "about:blank" for this API,
            indicating no additional semantics beyond the HTTP status code.
          default: 'about:blank'
          examples:
            - 'about:blank'
        status:
          type: integer
          description: >-
            The HTTP status code for this occurrence, matching the
            response status code.
          examples:
            - 404
        title:
          type: string
          description: >-
            Short human-readable summary. Matches the standard HTTP
            reason phrase for the status code.
          examples:
            - 'Not Found'
        detail:
          type: string
          description: >-
            Human-readable explanation specific to this occurrence
            of the problem.
          examples:
            - 'Capture cap_abc123def456 not found'
      required:
        - type
        - status
        - title
        - detail
```

Note: the `required` array in the schema reflects what WRL always sends, not what RFC 9457 mandates. This is correct -- the OpenAPI spec documents WRL's contract, not the RFC's minimum.

### 6. `detail` messages should be stable, specific, and actionable

Establish a convention now that `detail` strings:

- Name the specific resource or field that caused the error: "Capture cap_abc123 not found", not "Resource not found"
- State what is wrong and what the caller should do: "URL scheme 'ftp' is not allowed; use http or https", not "Invalid URL"
- Are human-readable, not machine-parseable (clients should switch on `status`, not parse `detail` strings)
- Do not leak internal implementation details: no stack traces, no internal error codes, no storage key formats

## Risks

### R1: Extending the error shape later requires careful versioning

If WRL later needs custom problem types (e.g., to distinguish "capture failed because browser timed out" from "capture failed because DNS resolution returned a private IP"), adding a custom `type` URI changes the error contract. Clients that only switch on `status` will be fine. Clients that parse `type` will need to handle new values. This is manageable but should be documented when it happens. The `about:blank` starting point is the safest default precisely because it makes no promises beyond HTTP semantics.

### R2: Inconsistent `Content-Type` if the utility is bypassed

If any code path returns an error response without using `problemResponse()` -- for example, a raw `new Response('Not found', { status: 404 })` -- the API contract is broken. Mitigation: the Spectral ruleset for the OpenAPI spec (Step 8) should enforce that all non-2xx responses reference the `ProblemDetail` schema. In code, a linting rule or code review convention should flag raw `new Response(...)` with non-2xx status codes.

### R3: `detail` string inconsistency across 8 implementation steps

Seven different steps will call `problemResponse()`. Without a convention, detail messages will drift in style ("not found" vs "Not Found" vs "does not exist" vs "unknown"). Establishing the convention in Step 1 (sentence case, name the resource, state the fix) prevents this.

## Dependencies

- **RFC 9457 compliance is self-contained** -- no external libraries needed. The utility is ~25 lines of vanilla JS using the Web-standard `Response` constructor available in Cloudflare Workers.
- **The error utility must be in place before Step 2** -- URL validation (Step 2) is the first consumer of 422 errors. Steps 3-8 all depend on it.
- **The OpenAPI `ProblemDetail` schema (Step 8) must match the utility output exactly** -- the schema and the code must be kept in sync. Since both are small and live in the same repo, this is low risk.

## Proposed Tasks (for Step 1)

1. **Create `src/errors.js`** with the `problemResponse()` function as specified above. Single export, no dependencies.
2. **Write tests for `problemResponse()`** in `test/errors.test.js`:
   - Returns correct `Content-Type: application/problem+json`
   - Returns correct HTTP status code matching the `status` field in the body
   - Body contains `type`, `status`, `title`, `detail` with correct values
   - Additional headers (e.g., `Allow`, `Retry-After`) are included when passed
   - Unknown status codes fall back to `title: "Error"` (defensive)
3. **Use `problemResponse()` in the route dispatcher** for the 404 (unknown route) and 405 (wrong method) cases that exist from Step 1.
4. **Document the `detail` message convention** in a code comment at the top of `src/errors.js` -- keep it to 3-4 lines, not a separate document.

## Additional Agents

No additional specialists are needed for this specific question. The decisions here are purely about spec compliance and utility API shape, which is squarely in api-spec-minion's domain.

One note: when Step 8 arrives and the OpenAPI spec is authored, I should be consulted again to ensure the `ProblemDetail` schema, the error response references across all endpoints, and the Spectral ruleset are all consistent with what was implemented in Step 1. The error contract is a cross-cutting concern that touches every endpoint.
