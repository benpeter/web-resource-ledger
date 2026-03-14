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
    as the access secret -- no authentication header is required. Store it;
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
      description: Always "complete" -- this endpoint only returns completed captures.
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
        key was configured. Absent otherwise -- not an error condition.
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
      No authentication is required -- the capture ID acts as the access
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

Add to `paths`:
```yaml
/v1/captures/{captureId}/artifacts/{name}:
  get:
    operationId: getCaptureArtifact
    summary: Download a capture artifact
    description: >
      Streams a single capture artifact from R2 storage via the API Worker.
      The capture ID acts as the access secret -- no authentication required.

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
            description: Immutable -- captures are content-addressed and never change.
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

When you finish your task, mark it completed with TaskUpdate and
send a message to the team lead with:
- File paths with change scope and line counts (e.g., "src/auth.ts (new OAuth flow, +142 lines)")
- 1-2 sentence summary of what was produced
