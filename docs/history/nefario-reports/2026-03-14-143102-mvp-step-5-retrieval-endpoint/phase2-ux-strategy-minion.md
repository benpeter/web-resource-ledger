## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. Minimum viable response shape

The caller has one job at this point in the lifecycle: "did my capture succeed, and where do I get the WACZ?" The response shape should answer that question directly, with no indirection.

Required fields for the `CaptureDetail` schema:

```
id          -- echo the capture ID so the caller can correlate without tracking URL state
status      -- "complete" (only reachable state for a 200 from this endpoint; pending/failed are status-endpoint concerns)
url         -- the URL that was captured (lets the caller verify they got what they asked for)
createdAt   -- ISO 8601; anchors the record in time
completedAt -- ISO 8601; lets the caller reason about freshness
waczUrl     -- direct URL to the WACZ bundle (primary artifact, not buried in an array)
artifacts   -- object with named artifact URLs: { screenshot, html, headers }
```

Do not include: `ip` (internal operational field, not the caller's concern), `bundleHash` or `size` directly on the root (belongs in a nested `wacz` object if at all -- but see below), `retryable` (irrelevant for a completed capture).

The `artifacts` object should use named keys, not an array. Named keys make consumption O(1): `response.artifacts.screenshot` beats iterating an array to find `type === 'screenshot'`. This also makes the schema self-documenting -- callers know exactly which artifact types exist without reading documentation.

**WACZ object vs flat waczUrl**: The KV record already has `wacz: { key, bundleHash, size }`. For the API response, surface the URL that callers need (`waczUrl` at root or `wacz.url` nested) alongside `wacz.size` and `wacz.bundleHash` if verification is a plausible use case. Given the technical notes indicate this is a preservation/evidence tool (WACZ bundles, signed), `bundleHash` belongs in the response -- callers doing archival work will want to verify the bundle. Expose it. Keep it nested under `wacz` to signal it belongs together: `wacz: { url, size, bundleHash }`.

Proposed minimal response example:

```json
{
  "id": "cap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "status": "complete",
  "url": "https://example.com",
  "createdAt": "2026-03-14T10:00:00.000Z",
  "completedAt": "2026-03-14T10:00:45.000Z",
  "wacz": {
    "url": "https://...",
    "size": 182400,
    "bundleHash": "sha256:abc123..."
  },
  "artifacts": {
    "screenshot": "https://...",
    "html": "https://...",
    "headers": "https://..."
  }
}
```

#### 2. The `note` field question

**Do not include a `note` field in the `GET /v1/captures/{id}` response.**

The `note` in the 202 response serves a specific purpose: it fires once, at the moment the caller receives their capture ID, when they are most likely to store it. It is a first-contact affordance -- the equivalent of "write down your confirmation number." That moment has already passed by the time a caller hits `GET /v1/captures/{id}`. They already have the ID (they used it to make this request). Repeating the warning on every retrieval response adds noise, degrades the signal-to-noise ratio of the response, and doesn't add information the caller can act on at this point in the flow.

The ID-as-secret pattern is self-evident from the schema description on `CaptureId` (already in openapi.yaml: "Also serves as the access secret — store it.") and from the status endpoint description ("No authentication is required — the capture ID acts as the access secret."). The `GET /v1/captures/{id}` endpoint description should carry the same language. That is where developer readers look when they land on the endpoint -- not in every response body.

**The `note` field in `CaptureAccepted` should remain exactly where it is.** It earns its place there. It has no place in the retrieval response.

#### 3. ID-as-secret: explicit but not repetitive

The access-control model (capture ID is the only credential for unauthenticated retrieval) needs to be documented exactly once per location where a developer will encounter it:

- `CaptureId` schema description: already done ("Also serves as the access secret")
- `GET /v1/captures/{id}` endpoint description: add one sentence ("No authentication is required -- the capture ID acts as the access secret.")
- OpenAPI path-level `security: []` to explicitly declare this endpoint as intentionally unauthenticated (this is both documentation and a machine-readable signal)

Inline response-body notes beyond these three touch points are redundant noise. The `note` field in the 202 body is the one behavioral prompt; everything else is schema documentation.

#### 4. Status field in the retrieval response

The `GET /v1/captures/{id}` response will always represent a completed capture (the endpoint only returns data when a complete record exists). Including `status: "complete"` is worth keeping -- it makes the response self-describing and allows clients to write a single deserialization type for both the status-poll response and the retrieval response if they choose. Consistency reduces cognitive load on API consumers.

However: do not include `pending` or `failed` states on this endpoint. Those are the status endpoint's job. If someone polls `GET /v1/captures/{id}` for a pending capture, they should get 404 (the capture exists but is not retrievable yet) -- or more precisely, a 404 is correct because this endpoint represents the complete artifact, not the in-progress job. The status endpoint is the right place to track lifecycle states. This enforces clean mental model separation: status endpoint = lifecycle, retrieval endpoint = artifact.

Wait -- this is a meaningful design decision that needs to be surfaced for the engineering lead. There are two patterns:

**Option A (recommended)**: `GET /v1/captures/{id}` returns 404 for pending/failed captures. Simple, clean, avoids encoding lifecycle logic in two endpoints. The status endpoint already handles lifecycle.

**Option B**: `GET /v1/captures/{id}` returns a lifecycle-aware response for all states (pending, complete, failed). Reduces roundtrips for callers who skip polling. But this duplicates status-endpoint logic, creates two sources of truth, and complicates the mental model.

Option A is the simpler, lower-cognitive-load design. One endpoint owns lifecycle. One endpoint owns artifact retrieval. Callers who follow the documented flow (POST -> poll status -> GET capture) are never surprised.

#### 5. Artifact URL strategy

The technical notes flag a decision: direct R2 public URLs vs. pre-signed URLs. From a UX perspective for API consumers:

- **Direct public URLs** are simpler to consume, easier to test, shareable out-of-band, and require no URL expiration handling.
- **Pre-signed URLs** add expiration complexity: callers must re-fetch the retrieval response before the URL expires, which requires designing retry/refresh logic. This is friction every API consumer pays forever.

Given the ID-as-secret model already provides access control (only someone with the capture ID can reach this endpoint), direct public URLs are the appropriate choice -- the R2 URL obscurity is a second layer, but the primary access gate is the capture ID. Pre-signed URLs solve a problem (unauthorized access to artifacts) that is already solved.

**Document this choice explicitly in the endpoint description**, not just in the evolution log. API consumers need to know that URLs don't expire, so they can safely cache them. The absence of expiration is a feature that reduces integration complexity.

#### 6. Response field ordering (cognitive load)

Field order in JSON technically doesn't matter, but in practice developers read API responses top to bottom. Lead with identity (`id`), then state (`status`), then the primary value (`wacz`), then supporting context (`artifacts`), then metadata (`url`, `createdAt`, `completedAt`). This mirrors the "inverted pyramid" -- most important information first.

The OpenAPI schema property order should follow the same logic. Properties listed first in a schema are what developers see first when they read documentation.

---

### Proposed Tasks

**Task 1: Define `CaptureDetail` schema in openapi.yaml**

What: Add a new `CaptureDetail` schema to `components/schemas` with properties as described above: `id`, `status` (const: "complete"), `url`, `createdAt`, `completedAt`, `wacz` (object with `url`, `size`, `bundleHash`), `artifacts` (object with `screenshot`, `html`, `headers` as string/uri). All fields required except `wacz` (it may be absent for captures predating WACZ bundling, or if bundling failed -- confirm with engineering lead).

Deliverable: Updated `openapi.yaml` with `CaptureDetail` schema.

Dependencies: Decision on whether `wacz` is always present or optional for completed captures.

**Task 2: Add `GET /v1/captures/{captureId}` path to openapi.yaml**

What: Document the new endpoint with: 200 response referencing `CaptureDetail`, RFC 9457 404 for unknown/pending/failed IDs, endpoint description explicitly stating the ID-as-secret access model and that artifact URLs do not expire. Mark `security: []` explicitly on this path.

Deliverable: Complete OpenAPI path entry including examples for success and 404 cases.

Dependencies: Task 1.

**Task 3: Implement `handleGetCapture` in src/index.js**

What: Add route `['GET', /^\/v1\/captures\/(cap_[a-f0-9]{32})$/, handleGetCapture]` (note: no `/status` suffix -- separate path from the status endpoint). Handler reads KV record; returns 404 if missing, 404 if status is not `complete`, 200 with `CaptureDetail`-shaped response if complete. Build artifact URLs from R2 public URL base (direct, not pre-signed). No computation on the hot path.

Deliverable: Handler function and route entry.

Dependencies: Decision on R2 URL construction strategy (does index.js receive a base URL from env, or are URLs already stored in the KV record's `artifacts` object?).

**Task 4: Verify artifact URL storage format in KV**

What: Confirm whether `record.artifacts` in KV already stores full URLs (ready to serve) or R2 keys that require URL construction at read time. If keys, URL construction must be simple string concatenation (no R2 SDK calls on the read path -- those would violate the <300ms requirement). If full URLs are stored, this is a no-op.

Deliverable: Confirmed understanding documented in a code comment in the handler.

Dependencies: Reading existing `capture.js` / R2 writing code from Step 4.

**Task 5: Integration smoke test**

What: Implement the full lifecycle test described in the issue: POST capture -> poll status until complete -> GET capture -> assert `id`, `status`, `url`, `wacz.url`, `artifacts.screenshot`, `artifacts.html`, `artifacts.headers` are present and that artifact URLs return HTTP 200.

Deliverable: Test file (likely `test/integration/lifecycle.test.js` or equivalent).

Dependencies: Tasks 3 and 4.

---

### Risks and Concerns

**Risk 1: Pending captures returning 404 creates caller confusion**

If a caller skips status polling and goes straight to `GET /v1/captures/{id}` before the capture completes, they get a 404. This is correct per the design, but a caller who doesn't read the documentation carefully will interpret 404 as "capture doesn't exist." The 404 `detail` message should distinguish between "capture unknown" and "capture not yet complete." Use "Capture not found" for missing records, "Capture is not yet complete; poll the status URL first" (or similar) for pending records -- OR, simpler, don't distinguish in the 404 body and let the status endpoint be the authoritative source.

Actually: from a security perspective, distinguishing these two cases reveals information about whether a capture ID is valid. For a public, unauthenticated endpoint where the ID is the secret, leaking "this ID exists but isn't ready" vs "this ID doesn't exist" is an enumeration risk. Use a single 404 message for both cases. The status endpoint is authenticated context for lifecycle tracking; the retrieval endpoint should be silent about captures that aren't retrievable.

**Risk 2: wacz field optionality is unclear**

The KV record shape shows `wacz` as optional (`wacz = null` default in `completeCapture`). If a complete capture can lack a WACZ (e.g., WACZ bundling failed but the capture itself succeeded), the response schema must mark `wacz` as optional -- and callers need to know this is possible. The planning conversation should clarify whether a "complete" capture without a WACZ is a valid state or a bug. If it's never valid, `wacz` should be required in the schema and the code should reject `completeCapture()` calls without it.

**Risk 3: Artifact URL construction on the hot path**

If `record.artifacts` stores R2 keys rather than full URLs, the handler must construct URLs at read time. This is string concatenation and should be <1ms. But the env variable holding the R2 base URL must always be present -- a missing base URL would break all retrieval responses silently (producing malformed URLs). Add a startup-time check or fallback handling.

**Risk 4: Response shape divergence between status endpoint and retrieval endpoint**

The status endpoint returns `captureUrl` pointing to `GET /v1/captures/{id}`. The retrieval endpoint returns artifact URLs. If a caller caches the status response and later the retrieval response, they are working with two different shapes for what looks like the same resource. This is fine as long as the documentation is clear that the status endpoint and the retrieval endpoint serve distinct jobs. Keep them documented separately; do not try to unify them into one schema.

**Risk 5: No-list-endpoint model is invisible at retrieval time**

The design choice (no list endpoint; ID is the only access path) is visible at POST time via the `note` field. But a developer who inherits integration code written by someone else will first encounter this API at the retrieval endpoint, not at POST. They will be confused by the absence of any listing or discovery mechanism. The retrieval endpoint description should include a brief pointer: "To submit a new capture, see POST /v1/captures. No listing endpoint is available." This is one sentence of documentation that prevents a common "where do I find my captures?" support question.

---

### Additional Agents Needed

None. The current team is sufficient for this step. The engineering specialist owns implementation, schema, and test execution. The security-focused review of the ID-as-secret model and enumeration risk (Risk 1 above) should be flagged explicitly to the engineering lead for a deliberate decision, but does not require a separate specialist -- it is a straightforward policy choice.
