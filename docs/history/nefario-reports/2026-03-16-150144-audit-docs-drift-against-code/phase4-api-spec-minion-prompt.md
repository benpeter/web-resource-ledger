You are updating `openapi.yaml` in the web-resource-ledger project to fix 13
discrepancies between the spec and the actual implementation in `src/index.js`.

## Context

The OpenAPI spec is at version 0.3.0 and was last updated in phase 0019.
Recent PRs (#54-#57) added features that the spec partially documents but
with gaps. The spec is the API contract source of truth -- mock servers
(Prism), SDK generators, and contract tests depend on it.

## What to fix

**Must-fix (7 items):**

1. **Add OPTIONS /v1/captures operation** -- `src/index.js:55-67` handles
   CORS preflight returning 204 with Access-Control-Allow-Origin,
   Access-Control-Allow-Methods, Access-Control-Allow-Headers,
   Access-Control-Max-Age, Vary, and Cache-Control: no-store. Add this as
   an `options` operation under `/v1/captures`.

2. **Add 503 response to GET /v1/captures** -- `src/index.js:225-231`
   returns 503 when GLOBAL_CAPTURE_LIMITER rejects with Retry-After: 10.
   The spec lists only 400, 401, 429.

3. **Add 500 response to GET /v1/captures** -- `src/index.js:261-265`
   returns 500 on KV error. No 500 in spec.

4. **Add 422 response to GET /v1/verify/{captureId}** --
   `src/index.js:473-475` returns 422 for oversized WACZ bundles. Spec
   lists only 404, 429, 503.

5. **Add Link (TermsLink) header to ALL response definitions** --
   `src/index.js:107` sets the Link header on every response
   unconditionally. Currently only documented on GET /health 200. Add to
   all response definitions including all Problem response components
   (Problem400, Problem401, Problem404, Problem415, Problem422, Problem429,
   Problem503).

6. **Add Retry-After header to Problem503 component** -- `src/index.js:154`
   returns Retry-After: 10 on 503 capacity limit. Problem503 doesn't include it.

7. **Add CORS headers to POST /v1/captures error responses** --
   `src/index.js:87-94` applies CORS headers to ALL POST /v1/captures
   responses including errors. Currently only documented on the 202
   response. Add Access-Control-Allow-Origin and Vary to the 400, 401,
   415, 422, 429, 503 responses under POST /v1/captures.

**Should-fix (4 items):**

8. **Add failed/pending examples to listCaptures 200 response** -- Current
   examples only show complete status. Add examples showing the `failedAt`,
   `error`, `retryable` fields and a pending capture.

9. **Add `legal` to health endpoint required array** --
   `src/index.js:113-119` always returns the legal object. Spec only
   requires `status`. Add `legal` to required, and add
   `required: [terms, policy]` to the legal object.

10. **Reconcile example detail strings with code output** -- Several
    Problem response examples don't match actual code strings:
    - 429 example: spec says "Try again in 60 seconds", code says "Try
      again later"
    - 503 example: spec says "Service is not configured. Contact the
      operator.", code says "Service is at capacity. Retry in 10 seconds."
    - 415 example: spec has trailing period, code does not
    Pick the code's actual strings as canonical.

11. **Add note about X-RateLimit-Limit on error responses** -- The header
    appears on all non-503 responses from rate-limited endpoints, not just
    success responses. Add a description note to the X-RateLimit-Limit
    header component, or add the header to error responses on rate-limited
    endpoints.

**Nice-to-have (2 items):**

12. Add `example: 60` to the RetryAfter header schema.
13. Add `example: 5` to the 202-specific Retry-After reference.

## What NOT to do

- Do NOT change any behavioral aspects of the API -- this is documentation-only
- Do NOT bump the spec version (the orchestrator will handle versioning decisions)
- Do NOT restructure the spec layout or rename components
- Do NOT add endpoints that don't exist in code
- Do NOT document trailing-slash normalization or catch-all 404 -- those are
  server behavior, not API contract

## Files to modify

- `openapi.yaml` (the only file)

## How to verify

After making changes, run `npm run lint:api` to validate the spec.

## Deliverables

Updated `openapi.yaml` with all 13 discrepancies resolved. Each change
should be traceable to the numbered items above.

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
