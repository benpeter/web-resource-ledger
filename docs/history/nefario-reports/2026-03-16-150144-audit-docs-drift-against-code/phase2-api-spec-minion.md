## Domain Plan Contribution: api-spec-minion

### Line-by-Line Discrepancy Audit

After comparing every route handler in `src/index.js` against `openapi.yaml`, here is the complete list of discrepancies. Each item references spec line numbers and code locations.

---

#### CATEGORY A: Missing Routes / Operations

**A1. CORS OPTIONS preflight for POST /v1/captures -- NOT in spec**
- Code: `src/index.js:55-67` -- explicit `OPTIONS` handler returning 204 with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, `Access-Control-Max-Age`, `Vary`, and `Cache-Control: no-store`.
- Spec: No `options` operation defined under `paths['/v1/captures']` (spec lines 641-811). The `post` operation description (line 743-745) mentions CORS preflight is "handled automatically" but the spec does not document the OPTIONS method, its 204 response, or its headers.
- Impact: Clients and mock servers cannot discover the preflight behavior. SDK generators will not generate preflight-related types.
- Fix: Add an `options` operation to `/v1/captures` in the spec documenting the 204 response and its headers.

**A2. Missing `503` response on `GET /v1/captures` (listCaptures)**
- Code: `src/index.js:225-231` -- returns 503 when `GLOBAL_CAPTURE_LIMITER` rejects with `Retry-After: 10`.
- Spec: Line 730-735 lists only 400, 401, 429 for GET /v1/captures. No 503 response.
- Fix: Add `'503': $ref: '#/components/responses/Problem503'` to the listCaptures responses.

**A3. Missing `500` response on `GET /v1/captures` (listCaptures)**
- Code: `src/index.js:261-265` -- returns 500 `'Could not list captures'` on KV error.
- Spec: No 500 response listed for GET /v1/captures (line 685-735).
- Fix: Add a 500 Problem response to the listCaptures responses.

**A4. Missing `429` response on `GET /v1/captures/{captureId}/status`**
- Code: The status endpoint itself does not rate-limit, BUT `X-RateLimit-Limit` is not emitted either (no rate limit group match for `/v1/captures/{id}/status`). This is actually correct -- no 429 is possible. No fix needed.

**A5. Missing `422` response on `GET /v1/verify/{captureId}`**
- Code: `src/index.js:473-475` -- returns 422 `'WACZ bundle exceeds maximum verifiable size'`.
- Spec: Line 1141-1146 lists only 404, 429, 503 for verifyCapture. No 422.
- Fix: Add `'422': $ref: '#/components/responses/Problem422'` to verifyCapture responses (reuse existing Problem422 component, or add a new one with appropriate description for this context).

---

#### CATEGORY B: Response Schema Discrepancies

**B1. `GET /v1/captures` list response -- missing `failedAt`, `error`, `retryable` fields in examples**
- Code: `src/index.js:272-287` -- CaptureSummary projection includes `failedAt`, `error`, `retryable` when `status === 'failed'`.
- Spec: The `CaptureSummary` schema (lines 258-301) correctly declares `failedAt` (line 292), `error` (line 296), and `retryable` (line 300) as optional properties. **Schema is correct.**
- Spec examples: Lines 708-729 only show `complete` status examples. No example for `failed` or `pending` captures in the list response.
- Impact: Mock servers (Prism) will only generate complete-status examples. Developers won't see the failed-capture shape without reading the schema.
- Fix: Add `failed` and `pending` examples to the listCaptures 200 response examples.

**B2. `GET /.well-known/signing-key` response -- `keyId` field**
- Code: `src/index.js:528` -- returns `{ algorithm, publicKey, keyId }`.
- Spec: Lines 1187-1206 -- schema includes `keyId` as required with pattern `^[0-9a-f]{8}$`. **Schema is correct and in sync.**
- No fix needed.

**B3. `GET /.well-known/signing-keys` response -- missing `429` response on the keys (plural) endpoint**
- Spec: Line 1283-1284 lists only 429. No 503 response for getSigningKeys.
- Code: `src/index.js:534-551` -- no 503 path exists (the handler does not check for signing key config, it just lists archived keys from KV). Correct as-is.
- No fix needed.

---

#### CATEGORY C: Header Discrepancies

**C1. `Link` header present on ALL responses but documented only on `GET /health`**
- Code: `src/index.js:107` -- `response.headers.set('Link', ...)` is applied to EVERY response unconditionally (lines 96-108, after the route matching block).
- Spec: The `Link` header (`TermsLink` component, line 66-70) is only referenced in the health endpoint 200 response (line 613-614). No other endpoint's response headers include it.
- Impact: Every other endpoint's response will have an undocumented `Link` header. Contract tests will flag this as unexpected. Mock servers won't emit it.
- Fix: Add `Link: $ref: '#/components/headers/TermsLink'` to every response definition across all endpoints. Given the repetition, consider creating a shared response-headers fragment or adding it to each reusable Problem response component as well.

**C2. `X-RateLimit-Limit` header scope -- emitted on more endpoints than spec documents**
- Code: `src/index.js:96-100` -- `getRateLimitGroup()` (lines 40-44) returns `'capture'` for pathname `/v1/captures` (both GET and POST) and `'verify'` for `/v1/verify/*` and `/.well-known/signing-key*`. The header is emitted on ALL non-503 responses to these endpoints.
- Spec documents `X-RateLimit-Limit` on:
  - POST /v1/captures 202 response (line 779-780) -- correct
  - GET /v1/captures 200 response (line 702-703) -- correct
  - POST /v1/captures 429 (via Problem429, line 563-564) -- correct
  - GET /v1/verify/{captureId} 200 response (line 1079-1080) -- correct
  - GET /.well-known/signing-key 200 (line 1180-1181) -- correct
  - GET /.well-known/signing-keys 200 (line 1252-1253) -- correct
- Missing from spec: The header is also emitted on error responses (400, 401, 415, 422) from POST /v1/captures and GET /v1/captures, and on 404 from verify and signing-key endpoints. The reusable Problem400, Problem401, Problem415, Problem422 response components do NOT include `X-RateLimit-Limit`.
- Nuance: The `getRateLimitGroup` check at line 42 matches `/.well-known/signing-key` as a prefix, so it matches BOTH `/.well-known/signing-key` AND `/.well-known/signing-keys`. This is **intentional behavior in the code** and the spec already documents it on both endpoints' 200 responses. However, error responses (429, 503) on these endpoints also get the header, and those shared Problem responses don't include it.
- Fix: This is a minor inconsistency. The simplest approach is to note in the spec description that `X-RateLimit-Limit` may appear on any response from rate-limited endpoints, not just success responses.

**C3. `Cache-Control` header on `POST /v1/captures` success response (202) -- missing from spec**
- Code: `src/index.js:198-202` -- the 202 response from `handleCreateCapture` does NOT set any `Cache-Control` header. The response includes `Retry-After: 5` but no cache directive.
- Spec: Lines 766-811 -- the 202 response does not list a `Cache-Control` header. **This is correct -- no discrepancy.**

**C4. `Cache-Control` header on CORS preflight (OPTIONS) response -- `no-store`**
- Code: `src/index.js:59` -- `'Cache-Control': 'no-store'` on the OPTIONS 204 response.
- Spec: No OPTIONS operation documented (see A1). This header would need to be documented when the OPTIONS operation is added.

**C5. `Retry-After` header on `POST /v1/captures` 503 response**
- Code: `src/index.js:154` -- returns `Retry-After: 10` on 503 capacity limit.
- Spec: The Problem503 component (lines 574-592) does NOT include a `Retry-After` header.
- Fix: Add `Retry-After` header to Problem503, or create a separate 503 response for the capture endpoint that includes it.

**C6. `Retry-After` header value on 429 responses**
- Code: All 429 responses use `Retry-After: 60` (lines 145, 221, 421, 518, 540).
- Spec: Problem429 (line 561-562) references the `RetryAfter` component header (line 55-58), defined as `type: integer` with no fixed value. The example text (line 572) says "60 seconds" in the detail message. **Consistent but the header schema could include an `example: 60`.**
- Minor fix: Add `example: 60` to the RetryAfter header schema (line 58).

**C7. `Retry-After` header on 202 response -- spec value vs code value**
- Code: `src/index.js:202` -- `'Retry-After': '5'`.
- Spec: Line 777-778 references the `RetryAfter` component header (type integer). No specific value documented for this endpoint's 202.
- Minor: Consider adding `example: 5` on the 202-specific Retry-After header to differentiate from the 429 Retry-After of 60.

**C8. CORS headers on `POST /v1/captures` error responses**
- Code: `src/index.js:87-94` -- CORS headers (`Access-Control-Allow-Origin`, `Vary`) are applied to ALL `POST /v1/captures` responses, including errors (400, 401, 415, 422, 429, 503).
- Spec: CORS headers are only documented on the 202 success response (lines 781-789). The shared Problem400, Problem401, etc. responses do not include CORS headers.
- Impact: A browser making a CORS request that gets a 401 will receive CORS headers in practice but the spec doesn't document them for error responses.
- Fix: Either add CORS headers to each error response for POST /v1/captures (verbose), or add a note in the POST description that CORS headers apply to all responses.

**C9. `Link` header missing from all reusable Problem response components**
- Code: `src/index.js:107` -- `Link` header is set on every response including errors.
- Spec: Problem400 (lines 427-451), Problem404 (453-480), Problem401 (482-505), Problem415 (507-525), Problem422 (527-548), Problem429 (550-572), Problem503 (574-592) -- none include a `Link` header.
- Fix: Add `Link: $ref: '#/components/headers/TermsLink'` to every reusable Problem response.

---

#### CATEGORY D: Schema / Structural Discrepancies

**D1. Health endpoint schema missing `required: [legal]`**
- Code: `src/index.js:113-119` -- always returns `{ status: 'ok', legal: { terms: ..., policy: ... } }`. The `legal` object is always present.
- Spec: Lines 618-632 -- `legal` is not in the `required` array (only `status` is required). The `legal.terms` and `legal.policy` properties also lack `required`.
- Fix: Add `legal` to the required array. Add `required: [terms, policy]` to the legal object.

**D2. `GET /v1/captures/{captureId}` 200 response -- `Access-Control-Allow-Origin` value**
- Code: `src/index.js:351` -- hardcoded `'Access-Control-Allow-Origin': '*'`.
- Spec: Line 910-914 -- `enum: ['*']`. **Correct.**

**D3. List captures `Link` header (`TermsLink`) missing from 200 response**
- (Covered by C1 above -- Link header missing globally.)

**D4. `GET /v1/captures/{captureId}/status` -- missing `Link` header in spec**
- (Covered by C1 above.)

**D5. `GET /v1/captures/{captureId}/artifacts/{name}` -- missing `Link` header in spec**
- (Covered by C1 above.)
- Also note: artifact responses (lines 979-1001) do include `Content-Disposition` and `Cache-Control` and `Access-Control-Allow-Origin` headers correctly.

**D6. Problem response example texts don't match actual code strings**
- Code `src/index.js:129`: `'Content-Type must be application/json'`
- Spec line 525: `'Content-Type must be application/json.'` (with period) -- minor mismatch in punctuation. Check all examples.
- Code `src/index.js:145`: `'Rate limit exceeded. Try again later.'`
- Spec line 572: `'Rate limit exceeded. Try again in 60 seconds.'` -- different wording.
- Code `src/index.js:154`: `'Service is at capacity. Retry in 10 seconds.'`
- Spec line 592: `'Service is not configured. Contact the operator.'` -- the 503 example shows a different scenario (misconfiguration vs capacity).
- Code `src/index.js:83`: `'The requested resource does not exist.'`
- This 404 is for unmatched routes. Spec Problem404 example (line 480): `'Capture not found.'` -- different message for different 404 scenarios. This is fine since the spec shows a representative example.
- These are minor cosmetic issues. The spec examples are illustrative, not contractual, but for Prism mock accuracy they should match real output.
- Fix: Update spec example `detail` strings to match actual code output, or at minimum ensure one example per error type matches a real code path.

---

#### CATEGORY E: Missing Spec Coverage for Code Behavior

**E1. 404 response for unmatched routes**
- Code: `src/index.js:80-84` -- returns `problemResponse(404, 'The requested resource does not exist.')` for any unmatched method/path combination.
- Spec: No catch-all 404 is documented. This is standard behavior and does not need explicit spec coverage, but it means clients may receive 404s with a different `detail` text than the capture-specific `Problem404` example.

**E2. Trailing slash normalization**
- Code: `src/index.js:50` -- strips trailing slashes from all paths.
- Spec: Not documented. Clients hitting `/health/` will get the same response as `/health`. This is a server behavior detail, not typically specced.

**E3. `GET /v1/captures/{captureId}/status` returns pending with `Retry-After: 5`**
- Code: `src/index.js:565-569` -- pending status response includes `Retry-After: 5`.
- Spec: Lines 846-849 document this correctly. **No discrepancy.**

**E4. Health endpoint `legal.policy` field -- CONTENT-POLICY.md URL**
- Code: `src/index.js:117` -- `policy: 'https://github.com/benpeter/web-resource-ledger/blob/main/CONTENT-POLICY.md'`
- Spec: Line 639 example shows the same URL. **Correct.**

---

### Summary of Discrepancies by Severity

**Must-Fix (spec is wrong or incomplete for contract testing / SDK generation):**
1. **A1** -- Missing OPTIONS preflight operation for /v1/captures
2. **A2** -- Missing 503 response on GET /v1/captures
3. **A3** -- Missing 500 response on GET /v1/captures
4. **A5** -- Missing 422 response on GET /v1/verify/{captureId}
5. **C1/C9** -- `Link` header (`TermsLink`) missing from all responses except GET /health 200
6. **C5** -- `Retry-After` header missing from Problem503 component
7. **C8** -- CORS headers missing from POST /v1/captures error responses

**Should-Fix (improves accuracy for mock servers and developer experience):**
8. **B1** -- List captures examples missing `failed` and `pending` status variants
9. **D1** -- Health endpoint `legal` object should be required
10. **D6** -- Problem response example `detail` strings don't match code output
11. **C2** -- `X-RateLimit-Limit` appears on error responses from rate-limited endpoints but only documented on success responses

**Nice-to-Have (polish):**
12. **C6** -- Add `example: 60` to RetryAfter header schema
13. **C7** -- Add `example: 5` to the 202-specific Retry-After reference

---

### Recommendations

1. **Fix all Must-Fix items before any documentation is published.** These directly affect contract testing (Schemathesis/Prism), SDK generation, and mock server fidelity. A consumer relying on the spec will be surprised by undocumented headers and missing error responses.

2. **Add the OPTIONS operation for CORS preflight.** This is a real route the server handles. Omitting it means contract tests fail and mock servers can't simulate CORS flows. Document the 204 response with all CORS headers.

3. **Propagate the `Link` header systematically.** Since it's applied globally in code (line 107), the cleanest spec fix is to add it to every response definition. Consider defining a YAML anchor or using `$ref` composition to avoid repeating it ~30 times. Alternatively, document it once in the spec's top-level description as a universal header.

4. **Add missing error response codes (500, 503) to GET /v1/captures.** The list endpoint can fail in ways the spec doesn't acknowledge. This is a real gap for client error handling.

5. **Add the 422 response to GET /v1/verify/{captureId}.** The WACZ size guard is a real validation that returns 422.

6. **Enrich examples.** Add `failed` and `pending` capture examples to the list endpoint. This is critical for Prism mock server usefulness.

7. **Reconcile Problem response example detail strings.** The 429 example says "Try again in 60 seconds" but code says "Try again later." Pick one and align them.

### Proposed Tasks

| # | Task | Deliverable | Depends On | Estimate |
|---|------|-------------|------------|----------|
| T1 | Add OPTIONS /v1/captures operation | Updated openapi.yaml with `options` operation, 204 response, CORS headers | None | Small |
| T2 | Add missing error responses (500, 503 to listCaptures; 422 to verifyCapture) | Updated openapi.yaml paths section | None | Small |
| T3 | Add `Link` (TermsLink) header to all response definitions | Updated openapi.yaml -- all responses include Link header | None | Medium (touches ~25 response definitions) |
| T4 | Add `Retry-After` to Problem503 component | Updated openapi.yaml components/responses/Problem503 | None | Trivial |
| T5 | Add CORS headers to POST /v1/captures error responses | Updated openapi.yaml -- 400, 401, 415, 422, 429, 503 under POST /v1/captures include Access-Control-Allow-Origin and Vary | None | Small |
| T6 | Add `failed` and `pending` examples to listCaptures 200 response | Updated openapi.yaml examples section | None | Small |
| T7 | Fix health endpoint schema to require `legal` with `terms` and `policy` | Updated openapi.yaml schema | None | Trivial |
| T8 | Reconcile example `detail` strings with actual code output | Updated openapi.yaml examples | None | Small |
| T9 | Add `X-RateLimit-Limit` to error responses on rate-limited endpoints (or add spec note) | Updated openapi.yaml or description note | None | Small |
| T10 | Validate updated spec with Spectral + Prism mock | Clean lint, Prism mock serves correct responses | T1-T9 | Small |

### Risks and Concerns

1. **T3 is repetitive and error-prone.** Adding the `Link` header to ~25 response definitions manually is tedious. Consider whether a Redocly decorator could inject it at bundle time, or whether a structural refactor (shared response-headers object) would reduce maintenance burden. However, the Helix manifesto says "simple beats elegant" -- explicit `$ref` in each response is more readable than decorator magic.

2. **CORS header documentation on error responses (T5) creates a precedent.** Currently only the 202 success documents CORS. If we add it to all POST /v1/captures errors, should we also document it on GET endpoints that return `Access-Control-Allow-Origin: *`? The answer is yes for spec completeness, but the spec already does this for GET endpoints (getCapture, artifacts, verify, signing-key all document it on their 200). The gap is specifically POST error responses.

3. **Example string drift will recur.** Unless there's a mechanism to validate spec examples against code output (e.g., Schemathesis or a custom Spectral rule checking example values), the `detail` strings will drift again after future code changes. Recommend adding a Prism contract test to CI that exercises the spec examples.

4. **Spec version should be bumped.** The current spec says `version: 0.3.0` (line 4). These fixes represent a documentation correction, not an API change. Consider bumping to `0.3.1` to signal the spec was updated without API behavioral changes.

### Additional Agents Needed

None. All identified work is spec authoring and validation -- squarely within api-spec-minion's scope. The software-docs-minion may need to update any prose documentation that references the OpenAPI spec (e.g., README API reference sections), but that is already part of their planning scope.
