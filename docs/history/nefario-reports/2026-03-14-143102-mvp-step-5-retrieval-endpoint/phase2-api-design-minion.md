# Domain Plan Contribution: api-design-minion

## Domain: REST API Design -- GET /v1/captures/{id} retrieval endpoint

---

### Recommendations

#### URL Strategy Decision: Worker-Proxied Artifact Paths

**Recommendation: Option (c) -- worker-proxied `/v1/captures/{id}/artifacts/{name}` paths.**

Reject option (a) direct R2 public URLs and option (b) Cloudflare R2 public-access URLs. Use worker-proxied artifact endpoints exclusively.

**Rationale:**

**1. The issue requirement for Content-Type and Content-Length headers on artifact serving is not incidental -- it is a signal about what the architecture must look like.**

The issue explicitly states "Artifacts served from R2 with correct `Content-Type` and `Content-Length` headers." This is only a meaningful constraint if the worker is serving the bytes. If the design were direct R2 URLs or Cloudflare R2 public access URLs, the worker would have no surface to set those headers -- R2 serves them directly and the worker is not in the path. The phrasing implies the worker owns the response. Worker-proxied paths are the only design consistent with that requirement.

**2. The XSS backlog item forces the worker into the serving path anyway.**

The backlog has a `[should]` item: "Captured HTML XSS prevention -- serving captured HTML as text/html enables stored XSS; must serve as text/plain or with Content-Disposition: attachment at retrieval endpoint." This is non-optional for security. The worker must intercept the HTML artifact response and override the Content-Type to `text/plain` (or add `Content-Disposition: attachment`). Direct R2 URLs give no opportunity to do this -- the bucket would serve `rendered.html` with `text/html` and create stored XSS. Worker-proxied paths make this trivial: the worker inspects the artifact name and sets the correct Content-Type before streaming the bytes.

**3. The capture ID as access secret model breaks with public URLs.**

The issue documents: "This is the first endpoint with no authentication -- the capture ID acts as the access secret." This model works cleanly when the only way to reach artifacts is via the API path that encodes the capture ID. If artifact bytes are served directly from R2 public access, the R2 object key (`captures/{waczHash}.wacz`, `captures/{captureId}/screenshot.png`) becomes the access mechanism -- which is a weaker secret (predictable structure, enumerable with the hash) and bypasses the capture ID entirely. Worker-proxied paths keep the capture ID as the consistent access token across the entire lifecycle.

**4. Worker-proxied paths are consistent with the Helix/Edge Delivery philosophy.**

The project's engineering philosophy (Helix Manifesto, YAGNI, lean and mean) favors keeping behavior at the edge with the worker as the single control plane. Adding R2 public access introduces a second serving path outside worker control: a separate origin, separate security surface, separate cache behavior. Worker-proxied paths keep all serving behavior in one place.

**5. R2 public access URLs are an operational commitment, not a config toggle.**

Enabling public access on an R2 bucket is a permanent change to the bucket's access policy. It means any object with a known key is publicly accessible forever, without the worker as a gatekeeper. Disabling public access later (e.g., when per-tenant access control is added in post-MVP) is a breaking change for any callers who bookmarked the direct URL. Worker-proxied paths give the team full control over access policy evolution without breaking the API contract.

---

#### Artifact Endpoint Shape

The `GET /v1/captures/{id}` response should return artifact URLs as worker-proxied paths:

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "2026-03-14T10:00:00Z",
  "completedAt": "2026-03-14T10:00:45Z",
  "artifacts": {
    "screenshot": {
      "url": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/screenshot",
      "contentType": "image/png"
    },
    "html": {
      "url": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/html",
      "contentType": "text/plain"
    },
    "headers": {
      "url": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/headers",
      "contentType": "application/json"
    },
    "wacz": {
      "url": "https://wrl.example.com/v1/captures/cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/artifacts/wacz",
      "contentType": "application/wacz+zip",
      "size": 204800
    }
  }
}
```

Key design choices in this shape:

- **Artifact names in the URL path are logical, not R2 key names.** The path segment `artifacts/screenshot` maps to the R2 key `captures/{captureId}/screenshot.png` internally. This decouples the public API from the internal storage layout -- R2 key structure can change without breaking callers.
- **`contentType` field in the metadata response.** Callers who want to know the type before fetching can inspect it without issuing a HEAD request. The `html` artifact advertises `text/plain` in both the metadata and the actual serving response, making the XSS-safe behavior visible and explicit.
- **`wacz` includes `size`.** The WACZ is the primary archival artifact and may be large. Exposing `size` in bytes lets callers decide whether to download before committing to the transfer. The KV record already stores `wacz.size` from `buildWacz()`, so this is a zero-cost addition.
- **`headers` artifact is conditional.** The `artifacts` object in KV may not include `headers` if the header fetch failed. The response schema must reflect this with `headers` as optional.

---

#### Artifact Endpoint: Serving Route

Add a second route: `GET /v1/captures/{id}/artifacts/{name}`

This route:
1. Validates `{id}` matches the CaptureId pattern (`cap_[a-f0-9]{32}`)
2. Reads the KV record to verify the capture exists and is `complete`
3. Maps `{name}` to the R2 key from the KV artifacts record
4. Streams the R2 object body to the response with correct Content-Type and Content-Length

Content-Type mapping by artifact name:

| `{name}` | R2 key source | Content-Type served | Notes |
|---|---|---|---|
| `screenshot` | `artifacts.screenshot` | `image/png` | Direct from R2 metadata |
| `html` | `artifacts.html` | `text/plain` | Override -- never text/html (XSS) |
| `headers` | `artifacts.headers` | `application/json` | Standard JSON |
| `wacz` | `wacz.key` | `application/wacz+zip` | Already set in R2 httpMetadata |

The `html` override is the critical one. The worker must explicitly set `Content-Type: text/plain` regardless of what R2 stored for that key, and additionally add `Content-Disposition: attachment; filename="rendered.html"` as a second layer of defense against browsers attempting to render it inline.

---

#### Existing `captureUrl` Field in OpenAPI

The current `CaptureStatus` schema has a `captureUrl` field pointing to `/v1/captures/{captureId}`. This is the status endpoint's hint that a capture is complete. The new `GET /v1/captures/{id}` endpoint is what `captureUrl` resolves to. This is already correct in the existing spec -- no rename needed.

The `CaptureStatus.captureUrl` field and the new `GET /v1/captures/{id}` endpoint form a consistent navigation: status endpoint gives you the capture URL, capture URL gives you the metadata and artifact links.

---

#### Response Headers for Artifact Serving

The artifact serving route (`/v1/captures/{id}/artifacts/{name}`) must set:

- `Content-Type`: as per the mapping table above (worker-controlled, not R2 passthrough for `html`)
- `Content-Length`: from `r2Object.size` -- R2 provides this; set it explicitly in the response
- `Content-Disposition`: `attachment; filename="{name}.{ext}"` for all artifacts (defense-in-depth, prevents browser rendering)
- `Cache-Control`: `public, max-age=31536000, immutable` -- captures are immutable by definition; aggressive caching is appropriate and reduces KV reads on repeated access to the same artifact
- `Referrer-Policy: no-referrer` -- consistent with all other endpoints
- `X-Content-Type-Options: nosniff` -- consistent with all other endpoints

Rationale for immutable caching on artifacts: the capture ID is a content-addressed token (it is a secret, not a sequence number). Once a capture is `complete`, its artifacts will never change. Immutable caching means repeat downloads are served from edge cache with zero KV reads, which comfortably satisfies the <300ms target even under load.

---

#### 404 Handling

Two distinct 404 cases both return RFC 9457 404:

1. The capture ID does not exist in KV (truly unknown)
2. The capture ID exists but status is `pending` or `failed` -- artifacts are not available yet

For case 2, the retrieval endpoint should return 404 (not 409 or 200 with a status field) because the resource being requested -- a completed capture with artifacts -- does not exist yet. The caller already has a status endpoint for lifecycle polling; the retrieval endpoint is specifically the "complete capture" resource.

The detail message should differentiate:
- Unknown ID: `"Capture cap_... not found."`
- Known but not complete: `"Capture cap_... is not yet complete. Poll the status URL for progress."` with a `statusUrl` extension field pointing to the status endpoint.

This distinction is caller-friendly: it distinguishes a polling race condition (retry) from a data loss scenario (stop retrying).

---

#### The `captureUrl` Lifecycle Revisited

The current status endpoint already returns `captureUrl` pointing to `GET /v1/captures/{id}`. The `complete` status example in the existing OpenAPI shows this. This is correct. The retrieval endpoint closes the loop.

One thing to verify: the status endpoint's `captureUrl` field description says "URL to retrieve the capture artifact" (singular). With multiple artifacts, the copy should be updated to "URL to retrieve the capture and its artifact links" -- a minor editorial fix for the spec.

---

#### Schema Additions Required in OpenAPI

New schemas needed:

**`CaptureArtifact`** (component):
```yaml
type: object
required: [url, contentType]
properties:
  url:
    type: string
    format: uri
    description: Worker-proxied URL to fetch this artifact. No separate authentication required -- the capture ID in the path acts as the access token.
  contentType:
    type: string
    description: MIME type that will be served. Declared here so callers can inspect before downloading.
  size:
    type: integer
    description: Size in bytes. Present for wacz; may be absent for other artifacts.
```

**`CaptureArtifacts`** (component):
```yaml
type: object
required: [screenshot, html]
properties:
  screenshot:
    $ref: '#/components/schemas/CaptureArtifact'
  html:
    $ref: '#/components/schemas/CaptureArtifact'
  headers:
    $ref: '#/components/schemas/CaptureArtifact'
    description: Absent if HTTP header fetch failed during capture.
  wacz:
    $ref: '#/components/schemas/CaptureArtifact'
    description: Absent if WACZ bundling was skipped (no signing key configured) or failed.
```

**`CaptureRecord`** (new top-level response schema for `GET /v1/captures/{id}`):
```yaml
type: object
required: [id, status, url, createdAt]
properties:
  id:
    $ref: '#/components/schemas/CaptureId'
  status:
    type: string
    enum: [complete]
    description: Always "complete" -- the retrieval endpoint only returns complete captures.
  url:
    type: string
    format: uri
    description: The URL that was captured.
  createdAt:
    type: string
    format: date-time
  completedAt:
    type: string
    format: date-time
  artifacts:
    $ref: '#/components/schemas/CaptureArtifacts'
```

Note: `status` is `const: complete` on this endpoint because incomplete captures return 404. This makes the schema precise and allows SDK generators to produce a typed response that doesn't require a status field check.

---

#### `operationId` Conventions

Following the existing pattern (`createCapture`, `getCaptureStatus`):

- `GET /v1/captures/{captureId}` → `operationId: getCapture`
- `GET /v1/captures/{captureId}/artifacts/{name}` → `operationId: getCaptureArtifact`

---

### Proposed Tasks

**Task 1: Add `getCapture` route handler**
- Implement `GET /v1/captures/{captureId}` in the worker router
- KV lookup via existing `getCapture()` from `kv.js`
- Return RFC 9457 404 for missing ID (detail: "Capture ... not found.")
- Return RFC 9457 404 for non-complete status (detail: "Capture ... is not yet complete." plus `statusUrl` extension field)
- Build response body from KV record with worker-proxied artifact URLs
- Set `Cache-Control: private, no-store` on the metadata response (status may change; even though this endpoint only serves complete captures, the 404 path must not be cached)
- Deliverables: route handler, unit tests for the 3 cases (found complete, found pending/failed, not found)
- Dependencies: none beyond existing `kv.js`

**Task 2: Add `getCaptureArtifact` route handler**
- Implement `GET /v1/captures/{captureId}/artifacts/{name}` in the worker router
- Validate `{name}` against allowed values (`screenshot`, `html`, `headers`, `wacz`)
- Return 404 (RFC 9457) for unknown artifact names
- KV lookup to resolve artifact name to R2 key
- Fetch from R2 bucket binding and stream body to response
- Set `Content-Type` per the mapping table (critical: override to `text/plain` for `html`)
- Set `Content-Disposition: attachment; filename="{name}.{ext}"` for all artifacts
- Set `Content-Length` from `r2Object.size`
- Set `Cache-Control: public, max-age=31536000, immutable`
- Deliverables: route handler, unit tests for content-type overrides, integration smoke test path
- Dependencies: Task 1 (shares KV lookup pattern)

**Task 3: Update OpenAPI spec**
- Add `CaptureArtifact` and `CaptureArtifacts` component schemas
- Add `CaptureRecord` component schema
- Add `GET /v1/captures/{captureId}` path with `getCapture` operationId
- Add `GET /v1/captures/{captureId}/artifacts/{name}` path with `getCaptureArtifact` operationId
- Update `CaptureStatus.captureUrl` description (singular → plural artifacts)
- Document the worker-proxied URL strategy and the capture ID as access token in schema descriptions
- Deliverables: updated `openapi.yaml`
- Dependencies: Tasks 1 and 2 finalized

**Task 4: Resolve `captureUrl` field in `CaptureStatus`**
- The existing `CaptureStatus` schema has `captureUrl` (singular) that points to the new `GET /v1/captures/{id}` endpoint
- Verify that the status endpoint's `complete` example URL is consistent with the new endpoint path
- No code change expected; schema description update only
- Deliverables: confirmed consistency or a one-line fix in `openapi.yaml`
- Dependencies: Task 3

**Task 5: Integration smoke test**
- Implement the full lifecycle test described in the issue: `POST /v1/captures` → poll status until `complete` → `GET /v1/captures/{id}` → assert `artifacts.wacz.url` is reachable and returns 200 with `Content-Type: application/wacz+zip`
- Also assert: `artifacts.html.url` returns `Content-Type: text/plain` (XSS guard verification)
- Deliverables: smoke test script or test case in the test suite
- Dependencies: Tasks 1 and 2 deployed or running locally

---

### Risks and Concerns

**Risk 1: KV double-read on artifact serving (latency)**
The `getCaptureArtifact` handler needs to verify the capture exists and resolve the R2 key from the artifacts map. This requires a KV read. Combined with the KV read in `getCapture`, callers who load the metadata and then immediately fetch an artifact will trigger two KV reads. At <10ms each, this is well within budget, but it is worth noting. If `getCaptureArtifact` is called heavily without a prior `getCapture` call (e.g., bookmarked artifact URLs), each artifact fetch incurs its own KV read. The immutable caching headers on the artifact response (`Cache-Control: immutable`) mitigate this after the first fetch at the edge, but the first request always hits KV. This is acceptable for MVP.

**Risk 2: R2 streaming and `Content-Length` accuracy**
R2 provides `r2Object.size` which must be passed as `Content-Length`. If the worker streams the body rather than buffering it, the `Content-Length` must be set before the body stream begins. Cloudflare Workers support this pattern correctly, but the implementation must set `Content-Length` in the response headers constructor, not after streaming starts. A test that validates the header value against the actual bytes received will catch this.

**Risk 3: `artifacts.html` XSS -- this step must resolve the backlog item**
The backlog `[should]` item for HTML XSS prevention is directly triggered by this step. The artifact serving route is exactly the "retrieval endpoint" the backlog entry refers to. If this step ships without the `text/plain` override and `Content-Disposition: attachment`, the backlog item becomes a `[must]` security debt on a live endpoint. The implementation plan must treat this as a blocker, not a follow-up.

**Risk 4: `wacz` artifact URL differs from `screenshot`/`html` path structure**
Looking at `capture.js`: the WACZ is stored under `captures/{waczHash}.wacz` (keyed by hash), while the other artifacts are stored under `captures/{captureId}/screenshot.png` etc. (keyed by capture ID). The worker-proxied artifact URL for WACZ is `artifacts/wacz` resolved via the capture ID path, but the underlying R2 key lookup must use `wacz.key` from the KV record, not the predictable `captures/{captureId}/wacz.wacz` pattern. The implementation must read the R2 key from KV for the wacz artifact, not reconstruct it from the capture ID. This is correct behavior but is easy to get wrong.

**Risk 5: `headers` artifact conditionality**
The KV record may not have `artifacts.headers` if header fetch failed during capture. The `getCaptureArtifact` handler must return 404 for `GET .../artifacts/headers` on such captures. The 404 detail should distinguish "artifact not available for this capture" from "unknown capture" -- the former is a feature gap (header fetch failed), not a data error. Consider: `"The headers artifact is not available for this capture."` as the detail.

**Risk 6: Backward compatibility with existing `captureUrl` field**
The status endpoint's `complete` example already shows `captureUrl: https://wrl.example.com/v1/captures/cap_...`. This URL currently 404s because the endpoint doesn't exist yet. Any caller polling for status and following `captureUrl` will hit a 404 until this step ships. This is expected during development, but it means the status endpoint is currently returning a broken URL in its `complete` response. The issue notes this step "closes the lifecycle" -- so this is the intended state.

---

### Additional Agents Needed

**security-minion** -- This step directly activates the `[should]` XSS backlog item. The HTML artifact must be served as `text/plain` with `Content-Disposition: attachment`. Security-minion should validate the Content-Type override logic and the `Content-Disposition` header are correct and sufficient, and confirm whether `X-Content-Type-Options: nosniff` on the artifact response provides adequate additional coverage. They should also review the "capture ID as access secret" model for the artifact endpoint -- if that model is acceptable for the retrieval metadata endpoint (`GET /v1/captures/{id}`), it must also be acceptable for the artifact bytes themselves, which contain potentially sensitive page content.

If security-minion is already part of the planning team for this step, no addition is needed -- but the XSS concern must be explicitly in their review scope.

No other additional agents are needed. The artifact serving is straightforward Cloudflare Worker R2 streaming, which edge-minion can handle. The schema changes are mechanical once this plan defines the shapes.
