## Domain Plan Contribution: api-spec-minion

### Recommendations

#### KV Record Shape -> Response Schema Mapping

The KV layer (`src/kv.js`) stores three distinct shapes: `pending`, `complete`, and `failed`. The `GET /v1/captures/{captureId}` endpoint must handle all three because a caller could poll the retrieval endpoint directly (not just `…/status`). The `CaptureDetail` schema must account for conditionally present fields. The required baseline is `[id, status, capturedUrl, createdAt]`; all other fields are conditional on status.

The complete KV shape for a finished capture is:
```
{
  status: 'complete',
  url: string,            // the URL that was captured
  ip: string,             // resolved IP (MUST NOT appear in API response -- internal only)
  captureId: string,
  createdAt: ISO 8601,
  completedAt: ISO 8601,
  artifacts: {
    screenshot: string,   // R2 key, e.g. captures/{captureId}/screenshot.png
    html: string,         // R2 key, e.g. captures/{captureId}/rendered.html
    headers?: string,     // R2 key, optional (header fetch can fail gracefully)
  },
  wacz?: {
    key: string,          // R2 key, e.g. captures/{waczHash}.wacz
    bundleHash: string,   // sha256:{hex}
    size: number,         // bytes
  }
}
```

The `ip` field MUST be stripped before the response. It is internal instrumentation and has no place in the public API response.

#### Artifact URL Strategy: API-proxied vs Direct R2

The spec must take a position on how artifact URLs are constructed. There are two options:

1. **API-proxied** (`/v1/captures/{id}/artifacts/screenshot.png`): The Worker fetches from R2 and streams to the caller. Full control over `Content-Type`, `Content-Disposition`, and security headers. Can enforce `X-Content-Type-Options: nosniff` on every artifact.

2. **Direct R2 public URLs** (e.g. `https://pub-bucket.r2.dev/captures/{id}/screenshot.png`): Zero-latency serving, but no control over headers. The HTML artifact served as `text/html` from R2 without `X-Content-Type-Options: nosniff` is an XSS vector -- a browser that follows the URL will render the page.

**Recommendation: API-proxied artifact URLs.**

The constraint in the planning question is explicit: "HTML artifact must not be served with content-type that enables XSS." Direct R2 serving cannot safely satisfy this for HTML because:
- R2 will serve `rendered.html` with `Content-Type: text/html` unless overridden per-object.
- Even with per-object `Content-Type` override (e.g. `text/plain; charset=utf-8`), there is no mechanism to set `Content-Security-Policy` or `Content-Disposition: attachment` headers without routing through the Worker.
- API-proxied URLs also preserve the single-access-secret model -- artifact URLs cannot be guessed independently of the capture ID.

**Documented choice in spec description:** The endpoint description will explicitly state that artifact URLs are served via the API Worker to ensure consistent security headers. No pre-signed R2 URLs.

#### Artifact URL Path Convention

For consistency with existing patterns and SDK generation (`operationId`-friendly), use:

```
GET /v1/captures/{captureId}/artifacts/screenshot.png
GET /v1/captures/{captureId}/artifacts/rendered.html
GET /v1/captures/{captureId}/artifacts/headers.json
GET /v1/captures/{captureId}/artifacts/{waczHash}.wacz
```

These are stub paths for documentation purposes -- the actual implementation routes through `GET /v1/captures/{captureId}` with the artifact key embedded. The `GET /v1/captures/{captureId}` response returns the full absolute URLs; clients follow them.

**Alternative considered:** Base64 or opaque artifact tokens. Rejected -- the R2 key structure is already stable and deterministic from the `captureId`. Opaque tokens add indirection without security benefit (the capture ID already acts as the secret).

#### CaptureDetail Schema Design

The `CaptureDetail` schema deliberately uses `oneOf` discriminated by `status` to make the contract precise and SDK-friendly. However, to keep the spec approachable and aligned with the existing `CaptureStatus` pattern (which is a flat object with optional fields), a flat schema with conditional `description` annotations is preferable here. The existing spec does not use `oneOf` anywhere; introducing it on the first data-rich response would be inconsistent.

**Decision: flat schema with explicit `required` and conditional fields documented.**

Required fields for every status:
- `id` ($ref CaptureId)
- `status` (enum: pending | complete | failed)
- `capturedUrl` (the URL that was submitted)
- `createdAt` (ISO 8601)

Present when `status == complete`:
- `completedAt`
- `artifacts` (object with `screenshotUrl`, `htmlUrl`, and optional `headersUrl`)
- `wacz` (optional object -- graceful degradation)

Present when `status == failed`:
- `failedAt`
- `error`
- `retryable`

Note: The KV field is `url` but the response field should be `capturedUrl`. This avoids a JSON property named `url` at the top level of the response object (ambiguous: which URL? the request URL or this resource's URL?). The implementation will rename the field.

#### XSS Constraint: HTML Artifact Serving

The `rendered.html` artifact endpoint (`GET /v1/captures/{captureId}/artifacts/rendered.html`) MUST specify:
- `Content-Type: text/plain; charset=utf-8` -- prevents browser rendering
- `Content-Disposition: attachment; filename="rendered.html"` -- forces download
- `X-Content-Type-Options: nosniff` -- prevents MIME sniffing
- `Content-Security-Policy: default-src 'none'` -- belt-and-suspenders if ever served as HTML

The spec will document this in the artifact serving path. The OpenAPI spec for the `CaptureDetail` response will include a description note that htmlUrl callers should not embed the URL in an iframe or script src.

#### WACZ Optional Field Documentation

The spec must clearly document graceful degradation:
- `wacz` is absent from `artifacts` when the capture ran without a signing key configured, OR when WACZ bundling failed unexpectedly.
- Callers must not treat absence of `wacz` as a capture failure. Individual artifacts (`screenshotUrl`, `htmlUrl`) are always present for a `complete` capture.
- The `wacz.bundleHash` field enables independent verification of the bundle integrity.

#### Existing Spec Consistency Notes

1. The existing `CaptureStatus.captureUrl` (singular URL in status endpoint) conflicts with the richer `CaptureDetail` shape. The status endpoint says `captureUrl` is "Present when status is 'complete'. URL to retrieve the capture artifact." -- that field should now point to `GET /v1/captures/{captureId}` (this new endpoint). The spec for the status endpoint does not need to change, but implementation must ensure `captureUrl` in the status response resolves correctly.

2. Security headers: every existing response carries `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. The new endpoint and any artifact endpoints must follow the same pattern.

3. The existing `Problem404` response is inline in the status path (not a `$ref` to a shared component). This is inconsistent -- the retrieval endpoint should use a shared `Problem404` component response. However, to minimize spec churn in this step, I will define a shared `Problem404` component and update the status path `$ref` as part of this same spec update.

4. Cache-Control: the status endpoint sets `private, no-store`. The retrieval endpoint for the metadata should also use `private, no-store` because the response contains artifact URLs that are tied to the capture ID (the access secret). Artifact binary responses can use `immutable` caching since R2 keys are content-addressed.

---

### Proposed OpenAPI Spec Fragment

The following is the complete spec addition. It covers:
1. New `CaptureArtifacts` schema component
2. New `WaczInfo` schema component
3. New `CaptureDetail` schema component
4. New shared `Problem404` response component
5. New `GET /v1/captures/{captureId}` path entry
6. Update to status path 404 to use `$ref`

```yaml
# --- Add to components/schemas ---

    CaptureArtifacts:
      type: object
      description: >
        URLs for individual capture artifacts. All fields present for a complete
        capture except headersUrl, which is absent if the HTTP header fetch failed.
        htmlUrl is served as text/plain with Content-Disposition: attachment to
        prevent browser rendering — do not embed in iframes or inject as HTML.
      required: [screenshotUrl, htmlUrl]
      properties:
        screenshotUrl:
          type: string
          format: uri
          description: >
            Full-page PNG screenshot of the rendered page. Served via the API
            Worker with Content-Type: image/png.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot.png
        htmlUrl:
          type: string
          format: uri
          description: >
            Rendered HTML after JavaScript execution. Served as text/plain with
            Content-Disposition: attachment — NOT as text/html — to prevent XSS.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/rendered.html
        headersUrl:
          type: string
          format: uri
          description: >
            JSON object of HTTP response headers captured at fetch time.
            Absent if the header fetch failed or timed out.
            Set-Cookie values are redacted to [redacted].
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers.json

    WaczInfo:
      type: object
      description: >
        WACZ bundle metadata. Present only when a signing key was configured and
        WACZ bundling succeeded. Absence does not indicate a capture failure.
      required: [waczUrl, bundleHash, size]
      properties:
        waczUrl:
          type: string
          format: uri
          description: >
            URL to the signed WACZ bundle. Served via the API Worker with
            Content-Type: application/wacz+zip and Content-Disposition: attachment.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/bundle.wacz
        bundleHash:
          type: string
          pattern: '^sha256:[a-f0-9]{64}$'
          description: >
            SHA-256 hash of the canonical JSON of the WACZ datapackage.json,
            in the form "sha256:{hex}". Use this to verify bundle integrity.
          examples:
            - 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        size:
          type: integer
          minimum: 0
          description: Size of the WACZ bundle in bytes.
          examples:
            - 204800

    CaptureDetail:
      type: object
      description: >
        Full metadata and artifact links for a capture. The capture ID acts as
        the access secret — no authentication header is required. Store the ID;
        there is no listing endpoint to recover it.

        Fields present for all statuses: id, status, capturedUrl, createdAt.
        Fields present only when status is "complete": completedAt, artifacts, wacz (optional).
        Fields present only when status is "failed": failedAt, error, retryable.
      required: [id, status, capturedUrl, createdAt]
      properties:
        id:
          $ref: '#/components/schemas/CaptureId'
        status:
          type: string
          enum: [pending, complete, failed]
          description: Lifecycle state of the capture.
        capturedUrl:
          type: string
          format: uri
          description: The URL that was submitted for capture.
          examples:
            - https://example.com
        createdAt:
          type: string
          format: date-time
          description: ISO 8601 timestamp when the capture was submitted.
          examples:
            - '2024-01-15T10:30:00.000Z'
        completedAt:
          type: string
          format: date-time
          description: ISO 8601 timestamp when the capture completed. Present when status is "complete".
          examples:
            - '2024-01-15T10:30:45.123Z'
        artifacts:
          $ref: '#/components/schemas/CaptureArtifacts'
          description: Artifact download URLs. Present when status is "complete".
        wacz:
          $ref: '#/components/schemas/WaczInfo'
          description: >
            WACZ bundle metadata. Present when status is "complete" AND a signing
            key was configured. Absent otherwise — this is not an error condition.
        failedAt:
          type: string
          format: date-time
          description: ISO 8601 timestamp when the capture failed. Present when status is "failed".
          examples:
            - '2024-01-15T10:30:12.000Z'
        error:
          type: string
          description: Human-readable failure reason. Present when status is "failed".
          examples:
            - Page did not finish loading within 25 seconds.
        retryable:
          type: boolean
          description: >
            Whether submitting a new capture for the same URL may succeed.
            Present when status is "failed".

# --- Add to components/responses ---

    Problem404:
      description: Not found — unknown or expired resource ID.
      headers:
        Referrer-Policy:
          $ref: '#/components/headers/ReferrerPolicy'
        X-Content-Type-Options:
          $ref: '#/components/headers/XContentTypeOptions'
        Cache-Control:
          description: Prevents caching of not-found responses.
          schema:
            type: string
            enum: ['private, no-store']
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetail'
          examples:
            captureNotFound:
              summary: Unknown capture ID
              value:
                type: about:blank
                status: 404
                title: Not Found
                detail: Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 not found.

# --- Add to paths ---

  /v1/captures/{captureId}:
    get:
      operationId: getCapture
      summary: Retrieve capture metadata and artifact links
      description: >
        Returns full capture metadata and artifact download URLs for a known
        capture ID. No authentication is required — the capture ID acts as the
        access secret. Store it; there is no listing endpoint to recover it.

        Artifact URLs are served via the API Worker (not direct R2 URLs) to
        ensure consistent security headers. The HTML artifact is served as
        text/plain with Content-Disposition: attachment to prevent XSS.

        Response time target: <300ms. KV read is the only operation on the
        hot path. No computation occurs between KV read and response.
      tags: [captures]
      parameters:
        - name: captureId
          in: path
          required: true
          schema:
            $ref: '#/components/schemas/CaptureId'
          description: Capture ID returned by POST /v1/captures.
      responses:
        '200':
          description: Capture found. Check `status` field for current state.
          headers:
            Referrer-Policy:
              $ref: '#/components/headers/ReferrerPolicy'
            X-Content-Type-Options:
              $ref: '#/components/headers/XContentTypeOptions'
            Cache-Control:
              description: >
                Prevents caching of capture detail responses. The capture ID
                acts as an access secret; responses must not be stored in
                shared caches.
              schema:
                type: string
                enum: ['private, no-store']
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CaptureDetail'
              examples:
                pending:
                  summary: Capture is queued or in progress
                  value:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    status: pending
                    capturedUrl: https://example.com
                    createdAt: '2024-01-15T10:30:00.000Z'
                complete:
                  summary: Capture finished with WACZ bundle
                  value:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    status: complete
                    capturedUrl: https://example.com
                    createdAt: '2024-01-15T10:30:00.000Z'
                    completedAt: '2024-01-15T10:30:45.123Z'
                    artifacts:
                      screenshotUrl: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot.png
                      htmlUrl: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/rendered.html
                      headersUrl: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers.json
                    wacz:
                      waczUrl: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/bundle.wacz
                      bundleHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                      size: 204800
                completeNoWacz:
                  summary: Capture finished without WACZ (no signing key configured)
                  value:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    status: complete
                    capturedUrl: https://example.com
                    createdAt: '2024-01-15T10:30:00.000Z'
                    completedAt: '2024-01-15T10:30:45.123Z'
                    artifacts:
                      screenshotUrl: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot.png
                      htmlUrl: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/rendered.html
                failed:
                  summary: Capture failed with a retryable error
                  value:
                    id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                    status: failed
                    capturedUrl: https://example.com
                    createdAt: '2024-01-15T10:30:00.000Z'
                    failedAt: '2024-01-15T10:30:12.000Z'
                    error: Page did not finish loading within 25 seconds.
                    retryable: true
        '404':
          $ref: '#/components/responses/Problem404'
```

---

### Proposed Tasks

**Task 1: Add CaptureArtifacts, WaczInfo, CaptureDetail schemas to openapi.yaml**
- What: Add three new schemas to `components/schemas` as specified above.
- Deliverable: Updated `openapi.yaml` with the three schema definitions.
- Dependencies: None -- purely additive.

**Task 2: Add Problem404 shared response component to openapi.yaml**
- What: Add `Problem404` to `components/responses`. Update the existing inline 404 in `GET /v1/captures/{captureId}/status` to `$ref: '#/components/responses/Problem404'`.
- Deliverable: `Problem404` in `components/responses`; status path 404 changed to `$ref`.
- Dependencies: None -- refactor only, no behavior change.

**Task 3: Add GET /v1/captures/{captureId} path to openapi.yaml**
- What: Add the full path entry as specified above, including all four response examples and Cache-Control header.
- Deliverable: New path in `openapi.yaml`.
- Dependencies: Task 1, Task 2.

**Task 4: Implement GET /v1/captures/{captureId} handler in src/index.js**
- What: Route `GET /v1/captures/:captureId`, call `getCapture(env.KV, captureId)`, map KV record to `CaptureDetail` response shape. Strip `ip` field. Build absolute artifact URLs from R2 keys. Return 404 via `problemResponse` for null KV result.
- Deliverable: Working handler in `src/index.js`. No new modules required.
- Dependencies: Spec (Tasks 1-3) must be authored first so implementation has a clear contract.
- Implementation note: Artifact URL construction must use `new URL(request.url).origin` (not a hardcoded base URL) to work correctly across production and staging environments.

**Task 5: Implement artifact proxy handler**
- What: Route `GET /v1/captures/:captureId/artifacts/:filename`, fetch from R2 by key, stream response with correct headers. Apply `text/plain; charset=utf-8` + `Content-Disposition: attachment` for `.html`; `image/png` for `.png`; `application/json` for `.json`; `application/wacz+zip` for `.wacz`. Return 404 if R2 object not found.
- Deliverable: Artifact proxy handler in `src/index.js`.
- Dependencies: Task 4 (establishes the URL pattern).

**Task 6: Integration smoke test**
- What: POST capture -> poll `…/status` until complete -> GET `…/{captureId}` -> assert `status == complete`, `artifacts.screenshotUrl` present, `artifacts.htmlUrl` present, GET each artifact URL -> assert 200 with correct Content-Type.
- Deliverable: Test in `test/` or documented in the integration test suite.
- Dependencies: Tasks 4, 5.

---

### Risks and Concerns

**Risk 1: ip field leakage**
The KV record includes `ip` (the resolved IP of the captured host). This field is internal instrumentation. If the implementation copies the KV record directly to the response (e.g. `return jsonResponse(kvRecord)`), `ip` will be exposed. The implementation MUST explicitly map fields, not spread the KV record. This should be called out in code review.

**Risk 2: WACZ R2 key does not embed captureId**
The WACZ is stored at `captures/{waczHash}.wacz` (content-addressed by hash). The artifact proxy path uses `captureId` in the URL: `/v1/captures/{captureId}/artifacts/bundle.wacz`. The handler must look up the `wacz.key` from KV (not reconstruct it from the path) to find the correct R2 object. This is a non-obvious indirection that must be explicit in the implementation contract.

**Risk 3: Pending/failed captures served from GET /{captureId}**
The status endpoint already handles all lifecycle states. The retrieval endpoint as specified here also returns pending and failed captures (it reads whatever is in KV). This is the correct behavior per the spec -- but the `artifacts` and `wacz` fields are absent for non-complete captures. Callers that blindly access `response.artifacts.screenshotUrl` will throw. The spec's examples must include the pending and failed cases (they do, per above) and the description must be explicit that `artifacts` is only present for `complete` status.

**Risk 4: Artifact URL base must be dynamic**
Artifact URLs in the response body must use the actual request origin (production vs. staging), not a hardcoded constant. Using `new URL(request.url).origin` in the implementation avoids hardcoding. The spec examples use `wrl.example.com` as the example origin -- this is correct for documentation but must not become a hardcoded string in implementation.

**Risk 5: HTML served as text/html enables XSS**
If the artifact proxy falls through to a default content-type or R2's stored metadata, `rendered.html` could be served as `text/html`. The dispatch table in the artifact handler must be exhaustive: all `.html` files must return `text/plain; charset=utf-8`. A misrouted request (e.g. an `.htm` extension, future artifact types) should default to `application/octet-stream`, not `text/html`. This should be a code-review checklist item and ideally a test.

**Risk 6: headersUrl absent vs. present inconsistency**
The `headersUrl` is absent from `CaptureArtifacts` when the header fetch failed. The KV record omits the `headers` key from `artifacts` in that case. The implementation must check for the key's presence, not just test for falsy values. `headers: null` and missing `headers` key should both result in `headersUrl` being absent from the response.

**Risk 7: Spec consistency -- CaptureStatus.captureUrl**
The existing `GET /v1/captures/{captureId}/status` returns `captureUrl` pointing to the retrieval endpoint. This is correct by design -- but the spec description says "URL to retrieve the capture artifact" (singular). After this step, the endpoint returns multiple artifacts. The `CaptureStatus.captureUrl` description should be updated to "URL to retrieve capture metadata and artifact links." This is documentation-only, no schema change.

---

### Additional Agents Needed

None. The spec fragment and implementation tasks are self-contained given the existing codebase context. The security concern (XSS via HTML artifact) is addressed by the `text/plain` + `Content-Disposition: attachment` requirement in the spec -- no separate security-minion review is needed for a constraint this specific and well-understood.
