## Delegation Plan

**Team name**: mvp-step-5-retrieval-endpoint
**Description**: Complete the capture lifecycle by implementing GET /v1/captures/{id} (metadata + artifact links) and GET /v1/captures/{id}/artifacts/{name} (worker-proxied artifact serving), closing the POST → poll → retrieve loop.

---

### Conflict Resolutions

**Worker-proxied vs direct R2 URLs**
ux-strategy-minion recommended direct R2 public URLs for simplicity. api-design-minion, api-spec-minion, and security-minion all argued for worker-proxied URLs on three converging grounds: (1) Content-Type/Content-Length header control is only possible when the worker is in the serving path, which the issue requirement implies; (2) the HTML artifact stored-XSS backlog item is non-deferrable and can only be addressed via worker interception; (3) the capture-ID-as-access-secret model breaks if R2 keys become the access mechanism. Technical consensus wins. All artifact URLs will be worker-proxied at `/v1/captures/{id}/artifacts/{name}`.

**Status field on retrieval endpoint (only complete vs all states)**
ux-strategy-minion argued the retrieval endpoint should return 404 for pending/failed captures to enforce clean mental model separation. api-spec-minion proposed returning all lifecycle states from GET /{id} (reducing round-trips). Resolution: ux-strategy wins -- the retrieval endpoint returns 200 only for complete captures; pending/failed captures return 404. The status endpoint already owns lifecycle tracking. The 404 detail distinguishes "unknown ID" from "capture not yet complete" (caller-friendly disambiguation per api-design-minion), without exposing ID existence (single static 404 message per security-minion/ux-strategy-minion agreement).

Decision: use a single static 404 message for all non-200 cases from the retrieval endpoint. The security risk of differentiating "unknown" vs "not yet complete" (enumeration via timing/body) outweighs the minor UX improvement.

**Schema shape: flat URL strings vs nested artifact objects**
api-design-minion proposed nested `{ url, contentType, size }` objects per artifact. ux-strategy-minion and api-spec-minion both proposed flatter shapes (named URL strings at top level of `artifacts`). Resolution: use named URL strings at the top level of `artifacts` for the simple artifacts (screenshot, html, headers), consistent with ux-strategy and api-spec-minion. WACZ gets a nested object (`wacz: { url, size, bundleHash }`) because it has verification-relevant metadata (bundleHash) that belongs together. This is the ux-strategy-minion shape.

**CaptureDetail includes all lifecycle states vs only "complete"**
api-spec-minion proposed a flat schema with `status: enum [pending, complete, failed]` and all optional fields, because callers could hit the retrieval endpoint directly. ux-strategy-minion recommended `status: const "complete"`. Resolution: since the endpoint only returns 200 for complete captures (agreed above), the schema should reflect reality: `status: const "complete"`. api-spec-minion's rationale for including failed/pending was predicated on a design choice that was rejected. The status endpoint retains full lifecycle schema; the retrieval endpoint schema is precise.

**`capturedUrl` vs `url` field name**
api-spec-minion proposed renaming the KV `url` field to `capturedUrl` in the response, to avoid ambiguity at the top level. api-design-minion used `url`. Resolution: use `url` -- the KV field name, consistent with the existing status endpoint response shape. The field is unambiguous in the context of a response that already has `id` and `status`.

---

### Task 1: Update `capture.js` -- set R2 httpMetadata for `rendered.html`

- **Agent**: frontend-minion (implementation task; edge-capable JS)
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Context

    You are working on `web-resource-ledger`, a Cloudflare Worker that captures
    web pages (screenshot, rendered HTML, HTTP headers, WACZ bundle) and stores
    artifacts in R2. The KV layer tracks capture lifecycle.

    This is MVP step 5 (retrieval endpoint). A sibling task will implement
    `GET /v1/captures/{id}` and `GET /v1/captures/{id}/artifacts/{name}`, which
    proxies R2 artifacts through the Worker. The HTML artifact (`rendered.html`)
    must never be served as `text/html` -- it contains attacker-controlled content
    from a headless browser render and is a stored-XSS vector if served with
    `Content-Type: text/html`.

    The WACZ artifact already has correct `httpMetadata` set at write time
    (see `capture.js` lines 94-98). The pattern must be extended to
    `rendered.html`.

    ## What to do

    In `src/capture.js`, update the `env.BUCKET.put` call for `rendered.html`
    (currently line 73) to add `httpMetadata`:

    ```js
    env.BUCKET.put(`${prefix}/rendered.html`, html, {
      httpMetadata: {
        contentType: 'text/plain',
        contentDisposition: 'attachment; filename="rendered.html"',
      },
    })
    ```

    This is belt-and-suspenders coverage: the artifact-serving route (Task 2)
    already overrides Content-Type at serve time. Setting it at write time
    ensures the object is safe even if it is ever accessed via R2 public URLs
    (future operational scenario).

    ## What NOT to do

    - Do not modify screenshot.png or headers.json -- they have no XSS surface
    - Do not change any other part of capture.js
    - Do not modify tests in this task (test changes are in Task 4)

    ## Deliverables

    - Modified `src/capture.js` with httpMetadata on the `rendered.html` put call
    - No other file changes

    ## Success criteria

    - `src/capture.js` has the httpMetadata block on the rendered.html BUCKET.put call
    - The existing test suite (`test/capture.test.js`) still passes

- **Deliverables**: Modified `src/capture.js`
- **Success criteria**: httpMetadata with `contentType: 'text/plain'` and `contentDisposition` set on rendered.html R2 put; existing capture tests pass

---

### Task 2: Implement `handleGetCapture` and `handleGetCaptureArtifact` in `src/index.js`

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none (can run in parallel with Task 1 and Task 3)
- **Approval gate**: yes
- **Gate reason**: This is the first endpoint with no authentication. The response shape, field inclusion/exclusion, artifact URL construction, and 404 handling establish the retrieval contract that downstream steps depend on.
- **Prompt**: |

    ## Context

    You are working on `web-resource-ledger`, a Cloudflare Worker. The existing
    `src/index.js` has three routes (health, create capture, capture status).
    You are adding two new routes to close the capture lifecycle:

    - `GET /v1/captures/{captureId}` -- returns capture metadata and artifact links
    - `GET /v1/captures/{captureId}/artifacts/{name}` -- proxies artifact bytes from R2

    The KV record shape (from `src/kv.js`) is:
    ```
    complete: {
      status: 'complete',
      url: string,
      ip: string,          // MUST NOT appear in response (strip this)
      captureId: string,
      createdAt: ISO 8601,
      completedAt: ISO 8601,
      artifacts: {
        screenshot: string,  // R2 key, e.g. captures/{id}/screenshot.png
        html: string,        // R2 key, e.g. captures/{id}/rendered.html
        headers?: string,    // R2 key, optional
      },
      wacz?: {
        key: string,         // R2 key (do NOT expose in response)
        bundleHash: string,
        size: number,
      }
    }
    ```

    The existing `getCapture(kv, captureId)` function in `src/kv.js` is already
    imported. `problemResponse` and `jsonResponse` are imported from
    `src/responses.js`. Follow all patterns established in the existing code.

    ## Route 1: GET /v1/captures/{captureId}

    Add to the routes array (before the catch-all, after the status route):
    ```js
    ['GET', /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture],
    ```

    Note: this pattern must be ordered BEFORE the artifacts route to avoid
    shadowing. Check that the status route `/status` suffix prevents collision.
    The routes array already has the status route with the `/status` suffix, so
    there is no collision.

    Handler logic for `handleGetCapture(request, env, ctx, match)`:
    1. Extract `captureId` from `match[1]`
    2. Call `getCapture(env.KV, captureId)` -- the existing function
    3. If null OR `record.status !== 'complete'`: return
       `problemResponse(404, 'Capture not found')` with `Cache-Control: no-store`
       - SECURITY: single static message for all non-200 cases (no enumeration of
         whether the ID exists)
    4. Build the response body. Field mapping:
       - `id`: from `record.captureId`
       - `status`: `"complete"` (const)
       - `url`: from `record.url`
       - `createdAt`: from `record.createdAt`
       - `completedAt`: from `record.completedAt`
       - `artifacts`: object with named URL fields (NOT R2 keys):
         - `screenshot`: absolute worker-proxied URL
         - `html`: absolute worker-proxied URL
         - `headers`: absolute worker-proxied URL (only if `record.artifacts.headers` is present)
       - `wacz` (if `record.wacz` is present):
         - `url`: absolute worker-proxied URL
         - `size`: from `record.wacz.size`
         - `bundleHash`: from `record.wacz.bundleHash`
       - DO NOT include: `ip`, raw R2 keys (`record.artifacts.screenshot` value),
         `record.wacz.key`, or any other internal fields
    5. Construct artifact URLs using:
       ```js
       const base = new URL(request.url).origin;
       const artifactBase = `${base}/v1/captures/${captureId}/artifacts`;
       ```
       Then: `screenshot: `${artifactBase}/screenshot``, etc.
       For WACZ: `url: `${artifactBase}/wacz``
    6. Set response headers: `Cache-Control: private, no-store`,
       `Access-Control-Allow-Origin: *`
       (CORS wildcard is safe -- the capture ID is the only credential)
    7. Return `jsonResponse(body, 200, headers)`

    Add a SECURITY comment block above the function (consistent with the pattern
    used above `handleCaptureStatus`):
    ```js
    // SECURITY: No authentication required -- capture ID acts as the access secret.
    // Response MUST NOT include: ip, raw R2 keys (artifacts.* values, wacz.key).
    // Static 404 message for all non-200 cases -- no enumeration of ID existence.
    // Cache-Control: private, no-store prevents caching of access-secret responses.
    ```

    ## Route 2: GET /v1/captures/{captureId}/artifacts/{name}

    Add to routes array (AFTER the getCapture route, more specific paths first):
    ```js
    ['GET', /^\/v1\/captures\/(cap_[a-f0-9]{32})\/artifacts\/(screenshot|html|headers|wacz)$/, handleGetCaptureArtifact],
    ```

    The regex restricts `{name}` to exactly the four valid artifact names. Any
    other name hits the catch-all 404 without reaching the handler.

    Handler logic for `handleGetCaptureArtifact(request, env, ctx, match)`:
    1. Extract `captureId` from `match[1]`, `artifactName` from `match[2]`
    2. Call `getCapture(env.KV, captureId)`
    3. If null: return `problemResponse(404, 'Capture not found')` with
       `Cache-Control: no-store`
    4. Resolve the R2 key from the KV record:
       ```js
       const r2Key = artifactName === 'wacz'
         ? record.wacz?.key
         : record.artifacts?.[artifactName === 'html' ? 'html' : artifactName];
       ```
       Wait -- the KV artifacts object keys are: `screenshot`, `html`, `headers`.
       The artifact name param is: `screenshot`, `html`, `headers`, `wacz`.
       Mapping is direct for screenshot/html/headers. For wacz: use `record.wacz.key`.
    5. If the resolved R2 key is undefined/null: return
       `problemResponse(404, 'Capture not found')` with `Cache-Control: no-store`
       (covers: wacz not present, headers not present)
    6. Fetch from R2: `const obj = await env.BUCKET.get(r2Key)`
    7. If obj is null: return `problemResponse(404, 'Capture not found')` with
       `Cache-Control: no-store`
    8. Determine Content-Type. This dispatch table is exhaustive -- the regex
       already constrains to four names, but be explicit:
       ```js
       const contentTypes = {
         screenshot: 'image/png',
         html:       'text/plain',       // CRITICAL: never text/html (XSS)
         headers:    'application/json',
         wacz:       'application/wacz+zip',
       };
       const ct = contentTypes[artifactName] ?? 'application/octet-stream';
       ```
    9. Determine filename for Content-Disposition:
       ```js
       const filenames = {
         screenshot: 'screenshot.png',
         html:       'rendered.html',
         headers:    'headers.json',
         wacz:       'bundle.wacz',
       };
       ```
    10. Return a Response streaming the R2 object body with headers:
        - `Content-Type`: from dispatch table above
        - `Content-Disposition`: `attachment; filename="${filenames[artifactName]}"`
        - `Content-Length`: `String(obj.size)`
        - `Cache-Control`: `public, max-age=31536000, immutable`
          (captures are content-addressed and immutable; enables edge caching)
        - `Access-Control-Allow-Origin: *`

    The response body is `obj.body` (the R2 object's ReadableStream). Do not
    buffer it.

    ## What NOT to do

    - Do not modify any existing handler (handleHealth, handleCreateCapture, handleCaptureStatus)
    - Do not use spread operators on raw KV records (field mapping must be explicit)
    - Do not reflect user input (captureId, artifactName) into error response bodies
    - Do not add the `ip` field to any response
    - Do not hardcode a base URL -- always derive from `request.url`
    - Do not set Content-Type: text/html for the html artifact under any circumstances

    ## Deliverables

    - `src/index.js` with two new handler functions and two new route entries
    - Routes array must have the artifact route BEFORE the getCapture route
      (longer path must match first to avoid capture route shadowing)

    Wait -- re-check ordering. The routes array matches in order. The status
    route is `/status$` suffix. The artifact route is `/artifacts/(name)$`. The
    capture route is `/(cap_id)$`. The artifact path `/v1/captures/{id}/artifacts/screenshot`
    WOULD match the capture route `(cap_[a-f0-9]{32})$` only if the regex matched
    the entire pathname. Let's verify: the capture route pattern is
    `/^\/v1\/captures\/(cap_[a-f0-9]{32})$/`. The artifact path is
    `/v1/captures/cap_abc.../artifacts/screenshot` -- this does NOT match the
    capture route (the `$` anchor prevents it). Ordering between the two new
    routes therefore does not matter for correctness, but put the artifact route
    first (more specific pattern) as a code convention.

    ## Success criteria

    - `GET /v1/captures/{id}` returns 200 with correct JSON shape for a KV-seeded complete record
    - `GET /v1/captures/{id}` returns RFC 9457 404 for unknown IDs
    - `GET /v1/captures/{id}` returns RFC 9457 404 for pending/failed captures (same static message)
    - `GET /v1/captures/{id}/artifacts/html` sets `Content-Type: text/plain` (not text/html)
    - `GET /v1/captures/{id}/artifacts/screenshot` sets `Content-Type: image/png`
    - `GET /v1/captures/{id}/artifacts/wacz` sets `Content-Type: application/wacz+zip`
    - `ip`, raw R2 keys, and `wacz.key` are absent from all responses
    - `Cache-Control: private, no-store` on metadata response
    - `Cache-Control: public, max-age=31536000, immutable` on artifact responses
    - `Access-Control-Allow-Origin: *` on both routes

- **Deliverables**: Two new handler functions and route entries in `src/index.js`
- **Success criteria**: As listed in prompt; no test file modifications in this task

---

### Task 3: Update `openapi.yaml` -- new schemas, Problem404 component, and GET /v1/captures/{id} path

- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none (can run in parallel with Tasks 1 and 2; spec authoring is independent of implementation)
- **Approval gate**: yes
- **Gate reason**: The spec is the API contract. The schema shape and response examples lock in the public interface. Downstream callers and SDK generation depend on this.
- **Prompt**: |

    ## Context

    You are working on `web-resource-ledger`, a Cloudflare Worker API. The
    existing `openapi.yaml` is at the project root. You are adding:
    1. Three new schemas: `CaptureArtifacts`, `WaczInfo`, `CaptureRecord`
    2. One new shared response component: `Problem404`
    3. One new path: `GET /v1/captures/{captureId}`
    4. One new path: `GET /v1/captures/{captureId}/artifacts/{name}`
    5. Editorial fix: update `CaptureStatus.captureUrl` description
    6. Refactor: update the inline 404 in `GET /v1/captures/{captureId}/status` to use `$ref: '#/components/responses/Problem404'`

    Read the full existing `openapi.yaml` before making changes to preserve
    formatting, style, and indentation conventions.

    ## Schema additions (add to `components/schemas`)

    ### CaptureArtifacts
    ```yaml
    CaptureArtifacts:
      type: object
      description: >
        Named artifact URLs for a complete capture. All fields present for a
        complete capture except headers, which is absent if the HTTP header
        fetch failed or timed out. The html artifact is served as text/plain
        with Content-Disposition: attachment to prevent XSS -- do not embed
        in iframes or inject as HTML.
      required: [screenshot, html]
      properties:
        screenshot:
          type: string
          format: uri
          description: >
            Full-page PNG screenshot. Served via the API Worker with
            Content-Type: image/png and Content-Disposition: attachment.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
        html:
          type: string
          format: uri
          description: >
            Rendered HTML after JavaScript execution. Served as text/plain
            with Content-Disposition: attachment -- NOT as text/html -- to
            prevent stored XSS.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html
        headers:
          type: string
          format: uri
          description: >
            JSON object of HTTP response headers captured at fetch time.
            Set-Cookie values are redacted to [redacted]. Absent if the header
            fetch failed or timed out.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers
    ```

    ### WaczInfo
    ```yaml
    WaczInfo:
      type: object
      description: >
        WACZ bundle metadata. Present only when a signing key was configured and
        WACZ bundling succeeded. Absence does not indicate a capture failure --
        screenshot and html are always present for a complete capture.
      required: [url, bundleHash, size]
      properties:
        url:
          type: string
          format: uri
          description: >
            URL to the signed WACZ bundle. Served via the API Worker with
            Content-Type: application/wacz+zip and Content-Disposition: attachment.
          examples:
            - https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz
        bundleHash:
          type: string
          pattern: '^sha256:[a-f0-9]{64}$'
          description: >
            SHA-256 hash of the canonical JSON of the WACZ datapackage.json,
            in the form "sha256:{hex}". Use to verify bundle integrity.
          examples:
            - 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
        size:
          type: integer
          minimum: 0
          description: Size of the WACZ bundle in bytes.
          examples:
            - 204800
    ```

    ### CaptureRecord
    ```yaml
    CaptureRecord:
      type: object
      description: >
        Metadata and artifact links for a completed capture. The capture ID acts
        as the access secret — no authentication header is required. Store it;
        there is no listing endpoint to recover it.

        Artifact URLs are served via the API Worker to ensure correct security
        headers (XSS prevention for HTML artifact). URLs do not expire.

        To submit a new capture, see POST /v1/captures. For lifecycle tracking
        before completion, use GET /v1/captures/{captureId}/status.
      required: [id, status, url, createdAt, completedAt, artifacts]
      properties:
        id:
          $ref: '#/components/schemas/CaptureId'
        status:
          type: string
          const: complete
          description: Always "complete" — this endpoint only returns completed captures.
        url:
          type: string
          format: uri
          description: The URL that was captured.
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
          description: ISO 8601 timestamp when the capture completed.
          examples:
            - '2024-01-15T10:30:45.123Z'
        artifacts:
          $ref: '#/components/schemas/CaptureArtifacts'
        wacz:
          $ref: '#/components/schemas/WaczInfo'
          description: >
            WACZ bundle metadata. Present when status is "complete" AND a signing
            key was configured. Absent otherwise — not an error condition.
    ```

    ## Shared response component (add to `components/responses`)

    ```yaml
    Problem404:
      description: Not found.
      headers:
        Referrer-Policy:
          $ref: '#/components/headers/ReferrerPolicy'
        X-Content-Type-Options:
          $ref: '#/components/headers/XContentTypeOptions'
        Cache-Control:
          description: Prevents caching of not-found responses.
          schema:
            type: string
            enum: ['no-store']
      content:
        application/problem+json:
          schema:
            $ref: '#/components/schemas/ProblemDetail'
          examples:
            notFound:
              summary: Unknown resource ID
              value:
                type: about:blank
                status: 404
                title: Not Found
                detail: Capture not found.
    ```

    ## Path: GET /v1/captures/{captureId}

    Add to `paths`:
    ```yaml
    /v1/captures/{captureId}:
      get:
        operationId: getCapture
        summary: Retrieve capture metadata and artifact links
        description: >
          Returns metadata and artifact download URLs for a completed capture.
          No authentication is required — the capture ID acts as the access
          secret. Store it; there is no listing endpoint to recover it.

          Returns 404 for unknown IDs and for captures that are not yet complete
          (pending or failed). Use GET /v1/captures/{captureId}/status to track
          lifecycle before the capture is complete.

          Artifact URLs are served via the API Worker (not direct R2 URLs) to
          ensure consistent security headers. The HTML artifact is served as
          text/plain with Content-Disposition: attachment to prevent XSS.
          Artifact URLs do not expire.

          Response time target: <300ms. KV read is the only operation on the
          hot path.
        security: []
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
            description: Capture is complete. Artifact URLs are ready to use.
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
              Access-Control-Allow-Origin:
                description: >
                  Wildcard CORS. Safe because possession of the capture ID is
                  the only credential required.
                schema:
                  type: string
                  enum: ['*']
            content:
              application/json:
                schema:
                  $ref: '#/components/schemas/CaptureRecord'
                examples:
                  complete:
                    summary: Complete capture with WACZ bundle
                    value:
                      id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                      status: complete
                      url: https://example.com
                      createdAt: '2024-01-15T10:30:00.000Z'
                      completedAt: '2024-01-15T10:30:45.123Z'
                      artifacts:
                        screenshot: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
                        html: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html
                        headers: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers
                      wacz:
                        url: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz
                        bundleHash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                        size: 204800
                  completeNoWacz:
                    summary: Complete capture without WACZ (no signing key configured)
                    value:
                      id: cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
                      status: complete
                      url: https://example.com
                      createdAt: '2024-01-15T10:30:00.000Z'
                      completedAt: '2024-01-15T10:30:45.123Z'
                      artifacts:
                        screenshot: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot
                        html: https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html
          '404':
            $ref: '#/components/responses/Problem404'
    ```

    ## Path: GET /v1/captures/{captureId}/artifacts/{name}

    Add to `paths` (can be a separate path entry or under the same {captureId} path object if structure permits):
    ```yaml
    /v1/captures/{captureId}/artifacts/{name}:
      get:
        operationId: getCaptureArtifact
        summary: Download a capture artifact
        description: >
          Streams a single capture artifact from R2 storage via the API Worker.
          The capture ID acts as the access secret — no authentication required.

          The html artifact is served as text/plain with Content-Disposition:
          attachment to prevent stored XSS. All artifacts include Content-Length
          and are immutably cacheable.
        security: []
        tags: [captures]
        parameters:
          - name: captureId
            in: path
            required: true
            schema:
              $ref: '#/components/schemas/CaptureId'
          - name: name
            in: path
            required: true
            schema:
              type: string
              enum: [screenshot, html, headers, wacz]
            description: >
              Artifact identifier. screenshot=PNG, html=plain text (XSS-safe),
              headers=JSON, wacz=WACZ bundle.
        responses:
          '200':
            description: Artifact bytes.
            headers:
              Content-Disposition:
                description: Forces download; prevents inline rendering.
                schema:
                  type: string
              Cache-Control:
                description: Immutable — captures are content-addressed and never change.
                schema:
                  type: string
                  enum: ['public, max-age=31536000, immutable']
              Access-Control-Allow-Origin:
                schema:
                  type: string
                  enum: ['*']
            content:
              image/png:
                schema:
                  type: string
                  format: binary
              text/plain:
                schema:
                  type: string
              application/json:
                schema:
                  type: object
              application/wacz+zip:
                schema:
                  type: string
                  format: binary
          '404':
            $ref: '#/components/responses/Problem404'
    ```

    ## Existing spec changes

    1. **CaptureStatus.captureUrl description**: Update from
       "URL to retrieve the capture artifact" to
       "URL to retrieve capture metadata and artifact links."

    2. **Status endpoint 404**: The inline 404 response in
       `GET /v1/captures/{captureId}/status` (currently not using a $ref) should
       be updated to `$ref: '#/components/responses/Problem404'`.
       Note: the existing inline 404 example has
       `detail: Capture cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 not found.`
       The shared Problem404 component uses `detail: Capture not found.` (static,
       no ID reflection). Update the status endpoint 404 to match.

    ## What NOT to do

    - Do not change the CaptureAccepted or CaptureStatus schemas
    - Do not modify any existing path except the editorial changes listed above
    - Do not introduce `oneOf` or `anyOf` -- the spec uses flat schemas with
      optional fields throughout; stay consistent
    - Do not hardcode the server URL in examples (use `wrl.example.com` consistently)

    ## Deliverables

    - Updated `openapi.yaml` with all additions and editorial changes above

    ## Success criteria

    - YAML is valid and parses without error
    - All `$ref` values resolve within the document
    - `CaptureRecord.artifacts` is required; `CaptureRecord.wacz` is optional
    - The inline 404 in the status endpoint is replaced with `$ref: '#/components/responses/Problem404'`
    - `CaptureStatus.captureUrl` description updated

- **Deliverables**: Updated `openapi.yaml`
- **Success criteria**: Valid YAML, all $refs resolve, new schemas and paths match the response shape from Task 2

---

### Task 4: Write `test/capture-retrieval.test.js` and extend `test/capture-integration.test.js`

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2 (GET endpoint must exist before tests can run)
- **Approval gate**: no
- **Prompt**: |

    ## Context

    You are working on `web-resource-ledger`, a Cloudflare Worker tested with
    Vitest using `@cloudflare/vitest-pool-workers`. The existing test suite is in
    `test/`. The vitest config sets `isolatedStorage: false` (due to R2 SQLite WAL
    issues), so all tests share KV state -- explicit `beforeEach` cleanup is
    mandatory.

    Task 2 (sibling task) has implemented two new routes:
    - `GET /v1/captures/{captureId}` -- returns metadata + artifact links
    - `GET /v1/captures/{captureId}/artifacts/{name}` -- proxies R2 artifact bytes

    The handler for `GET /v1/captures/{id}` returns:
    - 200 with JSON body for complete captures
    - RFC 9457 404 (`application/problem+json`) for unknown IDs
    - RFC 9457 404 for pending/failed captures (same static message: "Capture not found")

    The response body for a complete capture:
    ```json
    {
      "id": "cap_...",
      "status": "complete",
      "url": "https://example.com",
      "createdAt": "...",
      "completedAt": "...",
      "artifacts": {
        "screenshot": "https://worker.test/v1/captures/{id}/artifacts/screenshot",
        "html":       "https://worker.test/v1/captures/{id}/artifacts/html",
        "headers":    "https://worker.test/v1/captures/{id}/artifacts/headers"
      },
      "wacz": {
        "url":         "https://worker.test/v1/captures/{id}/artifacts/wacz",
        "size":        42000,
        "bundleHash":  "sha256:abc123..."
      }
    }
    ```

    KV seeding pattern (from `test/kv.test.js`):
    ```js
    import { env } from 'cloudflare:test';
    import { createCapture, completeCapture } from '../src/kv.js';
    ```

    ## File 1: `test/capture-retrieval.test.js` (new file)

    Create this file from scratch. It must contain 8 tests covering
    `GET /v1/captures/{id}`. Use a fixed seed ID: `'cap_' + 'a'.repeat(32)`.

    ```js
    import { env, SELF } from 'cloudflare:test';
    import { describe, it, expect, beforeEach } from 'vitest';
    import { createCapture, completeCapture } from '../src/kv.js';

    // Response time target: <300ms (KV read only, no computation on hot path).
    // Tested via load test, not here -- timing assertions are environment-dependent.

    const SEED_ID = 'cap_' + 'a'.repeat(32);
    const SEED_URL = 'https://example.com';
    const SEED_ARTIFACTS = {
      screenshot: `captures/${SEED_ID}/screenshot.png`,
      html:       `captures/${SEED_ID}/rendered.html`,
      headers:    `captures/${SEED_ID}/headers.json`,
    };
    const SEED_WACZ = {
      key:        `captures/${SEED_ID}/bundle.wacz`,
      bundleHash: 'sha256:' + 'a'.repeat(64),
      size:       42000,
    };

    beforeEach(async () => {
      await env.KV.delete(`capture:${SEED_ID}`);
      await createCapture(env.KV, SEED_ID, SEED_URL, '93.184.216.34');
      await completeCapture(env.KV, SEED_ID, SEED_ARTIFACTS, SEED_WACZ);
    });
    ```

    Tests to write (all 8 must be in a single `describe` block):

    1. **200 with correct shape** -- fetch SEED_ID, assert status 200,
       `Content-Type: application/json`, body has `id`, `status: 'complete'`,
       `url`, `completedAt`, `artifacts.screenshot`, `artifacts.html`, `wacz.url`,
       `wacz.size`, `wacz.bundleHash`

    2. **Artifact URLs are absolute HTTP(S)** -- assert
       `body.artifacts.screenshot` matches `/^https?:\/\//`,
       `body.artifacts.html` matches `/^https?:\/\//`,
       `body.wacz.url` matches `/^https?:\/\//`

    3. **No auth required** -- fetch without Authorization header, assert 200

    4. **Security headers present** -- assert `Referrer-Policy: no-referrer` and
       `X-Content-Type-Options: nosniff` on the 200 response

    5. **Cache-Control: private, no-store** on 200 response

    6. **RFC 9457 404 for valid-format unknown ID** -- fetch
       `cap_bbbb...` (32 b's), assert status 404,
       `Content-Type: application/problem+json`,
       body matches `{ type: 'about:blank', status: 404 }`,
       body has `title` and `detail` fields,
       SECURITY: `body.detail` does not contain the capture ID

    7. **RFC 9457 404 for malformed ID** -- fetch
       `https://worker.test/v1/captures/badid`, assert status 404

    8. **Security: `ip` field absent from response** -- assert that
       `body.ip` is undefined (the internal IP field must never appear in responses)

    Include a comment above test 8: `// SECURITY: ip field from KV record must be stripped`

    ## File 2: `test/capture-integration.test.js` (extend existing)

    Append a new `describe('lifecycle smoke test', ...)` block at the END of the
    existing file. Use Strategy A (direct KV advancement, no timing dependency on
    ctx.waitUntil).

    Import `completeCapture` at the top of the file (add to existing imports):
    ```js
    import { completeCapture } from '../src/kv.js';
    ```
    And add `env` to the cloudflare:test import if not already present.

    The smoke test describe block:
    ```js
    describe('lifecycle smoke test', () => {
      // Strategy A: POST creates the capture, we advance KV directly to 'complete',
      // then verify the retrieval endpoint. This avoids depending on ctx.waitUntil()
      // timing (the background capture task may or may not finish before assertions).
      // Strategy B (waitUntilComplete from cloudflare:test) was considered but is
      // fragile across pool-workers versions and ties the test to capture pipeline
      // correctness rather than retrieval endpoint correctness.

      beforeEach(activateFetchMock);
      afterEach(() => fetchMock.deactivate());

      it('POST -> KV advance -> GET returns complete metadata', async () => {
        // 1. POST -- creates capture, returns 202
        const createRes = await postCapture({ url: VALID_URL });
        expect(createRes.status).toBe(202);
        const { id, statusUrl } = await createRes.json();

        // 2. Confirm pending/accepted state via status endpoint
        const statusRes = await SELF.fetch(statusUrl);
        expect(statusRes.status).toBe(200);
        const statusBody = await statusRes.json();
        expect(statusBody.id).toBe(id);
        expect(['pending', 'complete']).toContain(statusBody.status);

        // 3. Advance to complete via KV directly (no timing dependency)
        await completeCapture(env.KV, id, {
          screenshot: `captures/${id}/screenshot.png`,
          html:       `captures/${id}/rendered.html`,
          headers:    `captures/${id}/headers.json`,
        }, {
          key:        `captures/${id}/bundle.wacz`,
          bundleHash: 'sha256:' + 'b'.repeat(64),
          size:       1024,
        });

        // 4. Status endpoint reflects complete with captureUrl
        const completedStatusRes = await SELF.fetch(statusUrl);
        const completedStatusBody = await completedStatusRes.json();
        expect(completedStatusBody.status).toBe('complete');
        expect(completedStatusBody.captureUrl).toContain(id);

        // 5. GET /v1/captures/{id} returns metadata with artifact links
        const captureRes = await SELF.fetch(`https://worker.test/v1/captures/${id}`);
        expect(captureRes.status).toBe(200);
        const captureBody = await captureRes.json();
        expect(captureBody.id).toBe(id);
        expect(captureBody.status).toBe('complete');
        expect(captureBody.artifacts).toBeDefined();
        expect(captureBody.artifacts.screenshot).toMatch(/^https?:\/\//);
        expect(captureBody.artifacts.html).toMatch(/^https?:\/\//);
        expect(captureBody.wacz).toBeDefined();
        expect(captureBody.wacz.url).toMatch(/^https?:\/\//);
      });
    });
    ```

    ## What NOT to do

    - Do not use sleep or polling loops in any test
    - Do not use `waitUntilComplete()` from `cloudflare:test` (Strategy B)
    - Do not assert the full absolute URL of artifact URLs (use regex to stay
      environment-agnostic)
    - Do not add timing assertions
    - Do not modify any existing test

    ## Deliverables

    - New file `test/capture-retrieval.test.js` with 8 tests
    - Extended `test/capture-integration.test.js` with lifecycle smoke test describe block

    ## Success criteria

    - All 8 tests in `capture-retrieval.test.js` pass
    - Lifecycle smoke test in `capture-integration.test.js` passes
    - No existing tests broken
    - `beforeEach` cleanup is in place for the fixed seed ID

- **Deliverables**: `test/capture-retrieval.test.js` (new, 8 tests) and extended `test/capture-integration.test.js`
- **Success criteria**: All new tests pass; no existing tests broken

---

### Cross-Cutting Coverage

- **Testing**: Covered by Task 4 -- unit tests for GET endpoint (8 tests) plus lifecycle smoke test in integration file
- **Security**: Addressed directly in Tasks 1 and 2 -- XSS prevention via text/plain override and httpMetadata at write time; ip field stripping; static 404 messages; Cache-Control: private, no-store; CORS: * documented and intentional; capture ID entropy confirmed sufficient (122 bits). Security-minion input was incorporated into Task 2 implementation prompt.
- **Usability -- Strategy**: ux-strategy-minion input incorporated throughout -- named artifact keys, WACZ nested object with verification fields, no `note` field in retrieval response, single static 404 message, status: const "complete", field ordering. All ux-strategy recommendations adopted except direct R2 URLs (overridden by technical consensus).
- **Usability -- Design**: Not applicable -- no UI produced; API-only output.
- **Documentation**: Task 3 covers spec. Evolution log and process.md are handled by the calling session per CLAUDE.md. No separate doc task needed -- the spec is the documentation for this API.
- **Observability**: Not applicable at this step -- the existing Worker does not have observability infrastructure; no new services or background processes are introduced. The <300ms target is noted in tests and spec as a comment/description rather than instrumented.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - api-design-minion: the artifact route regex ordering and the `const: complete` schema decision have non-obvious API design implications that benefit from expert review before code ships (Tasks 2 and 3)
- **Not selected**: ux-design-minion (no UI), accessibility-minion (no UI), sitespeed-minion (artifact serving has immutable caching -- no Core Web Vitals surface), observability-minion (no new runtime services), user-docs-minion (no end-user docs; spec is developer-facing), api-spec-minion (authoring the spec as Task 3 executor, not a reviewer role here), edge-minion (Cloudflare Worker patterns are established; nothing new at the edge layer)

---

### Risks and Mitigations

1. **XSS if rendered.html served as text/html** (HIGH): Mitigated by Task 1 (httpMetadata at write time) and Task 2 (dispatch table override at serve time). Both are in scope for this PR. The combination is defense-in-depth.

2. **ip field leakage via naive KV spread** (MEDIUM): Mitigated by explicit field mapping in Task 2 prompt. Code review (Phase 5) will verify no spread operators on raw KV records.

3. **WACZ R2 key indirection** (MEDIUM): The WACZ key is stored under `wacz.key`, not derivable from captureId. Task 2 prompt explicitly calls out the lookup path (`record.wacz?.key`). Test 8 (wacz.url present in response) will catch if the lookup fails silently.

4. **headers artifact conditionality** (LOW): KV artifacts object may omit `headers` key if header fetch failed. Task 2 handles this via the `record.artifacts?.[name]` lookup -- undefined key returns 404. Test 1 seeds with headers present; a second test scenario without headers would be belt-and-suspenders but is not added here to avoid over-testing at MVP.

5. **isolatedStorage: false KV state leakage** (LOW): Task 4 prompt mandates `beforeEach` cleanup for all tests using fixed seed IDs. Lifecycle smoke test uses a freshly-generated ID from POST, so no cleanup needed there.

6. **URL base hardcoding** (LOW): Task 2 prompt explicitly mandates `new URL(request.url).origin` -- no hardcoded base URLs.

7. **Cache-Control on 404 responses** (LOW): Task 2 specifies `Cache-Control: no-store` on all `problemResponse` calls in the new handlers. The existing `problemResponse()` helper does not set this automatically -- the handler must pass it in the headers argument.

---

### Execution Order

```
Batch 1 (parallel):
  Task 1 -- capture.js httpMetadata for rendered.html
  Task 2 -- index.js handler implementation
  Task 3 -- openapi.yaml spec additions

APPROVAL GATE: Task 2 (handler implementation)
APPROVAL GATE: Task 3 (spec additions)

Batch 2 (sequential, after Task 2 approved):
  Task 4 -- tests (depends on Task 2 handler being present)
```

Gate ordering (per anti-fatigue rules, lower confidence first):

**APPROVAL GATE: Task 2 -- GET /v1/captures/{id} handler implementation**
Agent: frontend-minion | Blocked tasks: Task 4

DECISION: Implements the first unauthenticated endpoint, establishing the response shape, field exclusion list (ip, R2 keys), artifact URL construction, and 404 behavior.

DELIVERABLE:
  src/index.js (two new handlers + two route entries)
  Summary: handleGetCapture returns capture metadata with worker-proxied artifact URLs; handleGetCaptureArtifact proxies R2 bytes with correct Content-Type overrides and caching headers.

RATIONALE:
- Worker-proxied URLs chosen over direct R2 URLs -- enables Content-Type control (critical for html XSS prevention) and keeps capture ID as the single access credential
- Single static 404 for all non-200 cases -- prevents enumeration of whether a capture ID exists
- Cache-Control: private, no-store on metadata; immutable on artifacts -- correct for access-secret model and latency target respectively
- Rejected: `const: complete` enforcement at runtime (API returns 404 for non-complete captures, so the check is already there; the const is schema-side)
- Rejected: pre-signed R2 URLs -- TTL complexity with no security benefit given ID-as-secret model

IMPACT: Approving locks in the response shape that tests (Task 4) and spec (Task 3) depend on. Rejecting requires revising the field mapping or 404 behavior before tests can proceed.
Confidence: MEDIUM

---

**APPROVAL GATE: Task 3 -- openapi.yaml spec additions**
Agent: api-spec-minion | Blocked tasks: none (spec is documentation; does not block code)

DECISION: Formalizes the CaptureRecord schema, CaptureArtifacts/WaczInfo components, Problem404 shared response, and both new endpoint paths.

DELIVERABLE:
  openapi.yaml (three new schemas, one new response component, two new paths, two editorial fixes)
  Summary: CaptureRecord with `status: const "complete"` and optional `wacz` object; worker-proxied artifact URL examples; GET /v1/captures/{captureId} and GET /v1/captures/{captureId}/artifacts/{name} paths.

RATIONALE:
- Flat artifact URL strings (not nested objects) -- simpler consumption, named keys for O(1) access
- WaczInfo as separate nested object -- verification metadata (bundleHash, size) belongs together
- `status: const "complete"` -- precise schema; SDK generators produce typed responses without status-field checks
- Problem404 shared component replaces inline 404 in status endpoint -- consistent spec
- Rejected: oneOf discriminated union for CaptureDetail -- inconsistent with existing flat schema style; more complex with no SDK benefit for this response
- Rejected: direct R2 URL examples in spec -- would document an architecture choice that was rejected

IMPACT: Approving publishes the API contract. The spec is the source of truth for SDK generation and documentation. Rejecting requires revising schema shapes before the spec is merged.
Confidence: HIGH

---

### Verification Steps

After all tasks complete:

1. `npm test` (or `vitest run`) -- all 8 capture-retrieval tests pass, lifecycle smoke test passes, no existing tests broken
2. Manual check: `GET /v1/captures/{known-complete-id}` returns 200 with correct JSON shape (no `ip` field, artifact URLs are absolute and worker-proxied)
3. Manual check: `GET /v1/captures/{known-complete-id}/artifacts/html` returns `Content-Type: text/plain` (not `text/html`)
4. YAML lint: `openapi.yaml` is valid (e.g. `npx @redocly/cli lint openapi.yaml` or equivalent)
5. Confirm `captureUrl` in status endpoint response resolves to the new GET endpoint (existing `handleCaptureStatus` already builds this URL -- no change needed; verify it matches the new route pattern)
