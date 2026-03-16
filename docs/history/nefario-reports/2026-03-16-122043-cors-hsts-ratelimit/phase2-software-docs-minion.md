# Domain Plan Contribution: software-docs-minion

## Planning Question

> The project has an OpenAPI spec (`openapi.yaml`). All three changes add or modify response headers that should be reflected in the spec. What is the minimal documentation update needed? Should CORS behavior be documented in the OpenAPI spec's servers section or per-operation?

## Analysis of Current Spec Patterns

The existing `openapi.yaml` (1200+ lines, OpenAPI 3.1.0) already has strong conventions that these changes should follow:

1. **Reusable header components**: `components/headers/` defines `ReferrerPolicy`, `XContentTypeOptions`, `XFrameOptions`, `StrictTransportSecurity`, `RetryAfter`, `TermsLink`. Every response references these via `$ref`.

2. **Per-response header declarations**: Every `200`, `400`, `401`, etc. response explicitly lists its security headers. The spec is exhaustive -- no response omits headers.

3. **Reusable response components**: `components/responses/` defines `Problem400`, `Problem404`, `Problem401`, `Problem415`, `Problem422`, `Problem429`, `Problem503`. These are referenced via `$ref` from path operations.

4. **Existing CORS headers**: `Access-Control-Allow-Origin: *` is already documented per-operation on responses that need it (getCapture 200, getCaptureArtifact 200, verifyCapture 200, getSigningKey 200, getSigningKeys 200). It is NOT in components/headers -- it is inline on each response.

5. **HSTS current value**: The `StrictTransportSecurity` header component uses `pattern: '^max-age=\d+'` -- this pattern already matches the `preload` addition. The `description` says "Enforces HTTPS connections."

6. **Rate limit headers**: The `Problem429` response includes `Retry-After` but no `X-RateLimit-Limit` header today.

---

## Recommendations

### R3: CORS for capture POST endpoint -- OpenAPI changes

**Do NOT document CORS in the `servers` section or as a global annotation.** OpenAPI has no standard mechanism for CORS in `servers`. The correct approach -- and the one this spec already follows -- is per-operation response headers.

The changes needed are:

1. **Add an `options` operation for `POST /v1/captures`** to document the preflight response. This is the most contentious point, so here is the reasoning:

   - **For documenting OPTIONS**: The preflight is a real HTTP operation that clients (browsers) send. Omitting it means the spec does not describe a response the server actually produces. API consumers integrating from browser-based apps need to know the endpoint supports CORS.
   - **Against documenting OPTIONS**: Preflight is a browser mechanism, not an application-level concern. Most OpenAPI specs omit it. It adds boilerplate. Tools like Swagger UI do not meaningfully use it.
   - **Recommendation: Skip the OPTIONS operation.** Instead, add a short prose note in the `POST /v1/captures` description stating that CORS preflight is supported. This matches industry convention -- very few production OpenAPI specs document OPTIONS explicitly, and the spec already documents `Access-Control-Allow-Origin` on the responses that matter. The preflight is an infrastructure concern, not an API contract.

2. **Add CORS response headers to the `202` response of `POST /v1/captures`**. The `POST` success response should include `Access-Control-Allow-Origin` inline, matching the pattern used on `getCapture`, `getCaptureArtifact`, and `verifyCapture`. Add it inline (not as a `$ref`) since the value may differ from `*` if the origin allowlist is configurable.

3. **If CORS errors produce a `403` response for disallowed origins**: Add a `403` response to the capture POST path with a brief `ProblemDetail` description. The spec currently has no `Problem403` component, so one may be needed. However, the simpler approach (and the one most CORS implementations use) is to omit CORS headers from the response when the origin is disallowed -- the browser enforces the block, no 403 needed. If the implementation does return 403, add it.

4. **Add a brief CORS note to the `POST /v1/captures` description**:
   ```yaml
   description: >
     Enqueues a headless-browser capture of the given URL. Returns immediately with a capture
     ID; poll the status URL to determine when the capture is complete.

     CORS: This endpoint supports cross-origin requests from allowed origins.
     Preflight (OPTIONS) is handled automatically.
   ```

### R4: HSTS preload submission -- OpenAPI changes

**Minimal change.** The existing `StrictTransportSecurity` component header needs two updates:

1. **Update the description** from "Enforces HTTPS connections." to "Enforces HTTPS connections with preload eligibility."

2. **Update the schema pattern** from `'^max-age=\d+'` to something that matches the full value including `includeSubDomains` and `preload`. However, the current pattern already loosely matches (it only checks the prefix). Two options:
   - **Option A (minimal)**: Leave the pattern as-is (it is a prefix match), update only the description, and add an `example` field showing the full value. This is the least-disruptive change.
   - **Option B (precise)**: Update the pattern to `'^max-age=\d+; includeSubDomains; preload$'` and add an example.
   - **Recommendation: Option A.** The pattern is not a validation tool for clients -- it documents the shape. Add an example value:
     ```yaml
     StrictTransportSecurity:
       description: Enforces HTTPS connections with HSTS preload eligibility.
       schema:
         type: string
         pattern: '^max-age=\d+'
         examples:
           - 'max-age=31536000; includeSubDomains; preload'
     ```

This is a one-location change because every response references `$ref: '#/components/headers/StrictTransportSecurity'`. The reusable component pattern pays off here -- zero per-operation changes needed.

### R5: X-RateLimit-Limit response header -- OpenAPI changes

1. **Add a new reusable header component** `XRateLimitLimit` under `components/headers/`:
   ```yaml
   XRateLimitLimit:
     description: Maximum number of requests allowed in the rate-limit window.
     schema:
       type: integer
       minimum: 1
       examples:
         - 10
   ```

2. **Add the header to the `Problem429` response component**. Since `Problem429` is reusable and referenced from all rate-limited operations, this single addition propagates to every 429 across the spec. No per-operation edits needed.

3. **Add the header to the `200` responses of rate-limited endpoints**. The issue says "all rate-limited endpoints return X-RateLimit-Limit". This means the header appears on success responses too, not just 429s. The rate-limited operations are:
   - `POST /v1/captures` (202 response)
   - `GET /v1/captures` (200 response)
   - `GET /v1/verify/{captureId}` (200 response)
   - `GET /.well-known/signing-key` (200 response)
   - `GET /.well-known/signing-keys` (200 response)

   Each of these 200-level responses needs `X-RateLimit-Limit: $ref: '#/components/headers/XRateLimitLimit'` added to their headers block.

   **Note**: The 202 for `POST /v1/captures` also needs it.

4. **Do NOT add `X-RateLimit-Remaining` or `X-RateLimit-Reset`**. Issue #35 specifies only `X-RateLimit-Limit` with a static ceiling. YAGNI. If those are needed later, they get their own issue.

---

## Proposed Tasks

### Task 1: Update `StrictTransportSecurity` component header (R4)
- File: `openapi.yaml`, `components/headers/StrictTransportSecurity`
- Update description to mention preload eligibility
- Add example value showing full header string
- Effort: Trivial (3 lines changed)

### Task 2: Add `XRateLimitLimit` component header (R5)
- File: `openapi.yaml`, `components/headers/`
- Define new reusable header with description, schema, example
- Effort: Trivial (5 lines added)

### Task 3: Add `X-RateLimit-Limit` to `Problem429` response (R5)
- File: `openapi.yaml`, `components/responses/Problem429`
- Add `$ref` to the new header component
- Effort: Trivial (2 lines added)

### Task 4: Add `X-RateLimit-Limit` to success responses of rate-limited endpoints (R5)
- File: `openapi.yaml`, five operation response blocks
- Add `$ref` to each 200/202 response headers block
- Effort: Low (10 lines added across 5 locations)

### Task 5: Add CORS headers and description note to `POST /v1/captures` (R3)
- File: `openapi.yaml`, `POST /v1/captures`
- Add `Access-Control-Allow-Origin` to the 202 response headers
- Add CORS note to the operation description
- Effort: Low (5 lines)

### Task 6: Bump spec version
- File: `openapi.yaml`, `info.version`
- Bump from `0.2.0` to `0.3.0` (three new features = minor version bump)
- Effort: Trivial (1 line)

**Total OpenAPI changes: approximately 25-30 lines across one file.** All changes leverage the existing reusable component pattern. No structural refactoring needed.

---

## Risks and Concerns

1. **CORS allowlist in spec vs. runtime**: The issue says "configurable origin allowlist." If the allowed origins are environment-specific (production vs. staging), the OpenAPI spec cannot enumerate them. The spec should document that CORS is supported and the header is present, but should NOT hardcode origin values. Use a description note instead of an enum. This is the correct approach -- OpenAPI documents the contract shape, not deployment-specific configuration.

2. **Rate limit values across environments**: `wrangler.toml` shows different rate limiter namespace IDs for production and staging, but the same limits (10/60 for capture, 60/60 for verify, 200/60 for global). The `X-RateLimit-Limit` example value in the spec should match the configured ceiling for the relevant limiter. Since the capture endpoint uses the per-IP limiter (limit=10), the example should show `10`. Since verify uses a different limiter (limit=60), the header value will differ per endpoint. The spec example should show a representative value; the description should clarify the value is endpoint-specific.

3. **HSTS preload requirements**: The HSTS preload directive has prerequisites beyond the header: the domain must be accessible over HTTPS, must redirect HTTP to HTTPS, and the header must be served on the bare domain. These are deployment/infrastructure concerns, not API spec concerns. The spec change is correct; the submission to hstspreload.org is an ops task outside the spec.

4. **Spec validation**: After all changes, run the spec through an OpenAPI validator (e.g., `npx @redocly/cli lint openapi.yaml`) to catch structural errors. The existing spec is well-formed; mechanical additions should not break it, but validation is cheap insurance.

---

## Additional Agents Needed

None for the documentation changes specifically. The documentation updates are mechanical and follow established patterns. The implementation agents (whoever writes the CORS, HSTS, and rate-limit code) should make the OpenAPI changes in the same PR as the code changes -- documentation and code ship together.

One coordination note: if the implementation changes the `Strict-Transport-Security` header value in `src/index.js` (line 55), the OpenAPI spec update should happen in the same commit or PR to keep them in sync.
