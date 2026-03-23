## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. Pre-capture rejection: HTTP 422 with RFC 9457 Problem Details

**Recommendation: Yes, use HTTP 422 with the existing `problemResponse` helper and an `extra` field for `threatType`.**

The existing pattern is well-established. The `validateUrl` function already returns `{ ok: false, status: 422, detail: '...' }` for SSRF-blocked URLs, and `problemResponse(result.status, result.detail)` renders it. Safe Browsing rejection is semantically identical: the URL was syntactically valid and resolvable, but the server refuses to process it due to content policy. HTTP 422 (Unprocessable Content) is the right code.

The `problemResponse` helper already supports an `extra` parameter (spread into the body), so the implementation is:

```js
problemResponse(422, 'URL is flagged as malicious by Google Safe Browsing', {}, {
  threatType: 'MALWARE'  // or 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'THREAT_TYPE_UNSPECIFIED'
});
```

This produces:
```json
{
  "type": "about:blank",
  "status": 422,
  "title": "Unprocessable Content",
  "detail": "URL is flagged as malicious by Google Safe Browsing",
  "threatType": "MALWARE"
}
```

**Key design decisions:**
- Keep `type: "about:blank"` -- the project convention is that clients switch on `status`, not `type`. The `threatType` extension field provides the machine-readable discriminator for Safe Browsing-specific handling.
- Use Google's own threat type enum values (`MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`, `POTENTIALLY_HARMFUL_APPLICATION`, `THREAT_TYPE_UNSPECIFIED`) rather than inventing a mapping. This is what the API returns; don't lossy-translate it.
- The `detail` message should NOT include the URL (existing security convention: never reflect user input in error messages, per `url-validation.js` line 334).
- For batch captures (`POST /v1/captures/batch`), the `batchItemError` function already handles per-item errors. A Safe Browsing rejection becomes a batch item with `status: 422` and the same problem detail shape, consistent with how SSRF rejections work today.

**OpenAPI schema change:** Add a `threatType` example to the existing 422 response on `createCapture` and `batchCapture`. The `ProblemDetail` schema already allows additional properties (no `additionalProperties: false`), so no schema change needed -- just add examples.

#### 2. Quarantined artifact access: HTTP 403, NOT 451

**Recommendation: Use HTTP 403 Forbidden, not 451.**

HTTP 451 is the wrong code. [RFC 7725](https://www.rfc-editor.org/rfc/rfc7725.html) defines it as "the server operator has received a **legal demand** to deny access." Safe Browsing is a reputation/safety check, not a legal demand. Using 451 would:
- Misrepresent the nature of the restriction (no court order or legal authority is involved)
- Potentially confuse clients that handle 451 specifically for legal/censorship workflows
- Set a precedent that any automated content filtering counts as "legal reasons"

**HTTP 403 is correct.** The server understood the request but refuses to fulfill it. The `extra` field provides the reason:

```json
{
  "type": "about:blank",
  "status": 403,
  "title": "Forbidden",
  "detail": "This capture has been quarantined due to a Safe Browsing threat detection",
  "quarantineReason": "MALWARE",
  "quarantinedAt": "2026-03-23T10:00:00.000Z"
}
```

**Why not 404?** The current pattern returns 404 for non-complete captures (`if (!record || record.status !== 'complete')`). This is a deliberate design choice -- capture IDs are access secrets, so non-existence and non-readiness look the same. However, quarantine is different: the capture *was* complete and the caller may have previously accessed it. Returning 404 would confuse clients who cached the capture ID. 403 signals "you found the right thing, but access is restricted" which is the accurate semantic.

**Apply to both endpoints:**
- `GET /v1/captures/{captureId}` (metadata) -- see recommendation 3 below
- `GET /v1/captures/{captureId}/artifacts/{name}` -- always 403 for quarantined captures

Add `403` to the `titles` map in `responses.js` (it is already there).

#### 3. Metadata endpoint behavior for quarantined captures

**Recommendation: Return full metadata with `status: "quarantined"` and quarantine-specific fields. Do NOT restrict the metadata endpoint.**

The metadata endpoint (`GET /v1/captures/{captureId}`) should return 200 with the full capture record, but:
- Set `status: "quarantined"` instead of `"complete"`
- Add `quarantineReason` (the threat type string)
- Add `quarantinedAt` (ISO 8601 timestamp)
- **Remove artifact URLs** from the response body (since requesting them would return 403 anyway)
- Keep `wacz`, `render`, `captureSettings`, `completedAt`, `renderQuality` etc. -- metadata is not dangerous; artifacts are

This serves three purposes:
1. Tenants can understand what happened to their capture without filing a support ticket
2. The quarantine metadata is auditable -- compliance/legal teams can query for quarantined captures
3. The pattern matches the issue spec: "metadata remains accessible, artifact download returns [error] with explanation"

**Schema approach:** The `CaptureRecord` schema currently has `status: { const: 'complete' }`. This needs to become an enum `[complete, quarantined]`, or better: create a new `QuarantinedCaptureRecord` schema and use `oneOf` with a discriminator on `status`. Since the project uses `about:blank` for problem types and avoids complex discriminator patterns, I recommend the simpler approach: change `const: complete` to `enum: [complete, quarantined]` and add the optional quarantine fields.

#### 4. List endpoint: Include quarantined captures by default, add status filter value

**Recommendation: Include `quarantined` in list results by default. Add `"quarantined"` to the `status` filter enum.**

Current behavior: `handleListCaptures` allows filtering by `status` with values `['pending', 'complete', 'failed']`. The list returns all statuses when `status` is omitted.

For quarantined captures:
- **Show in list results by default** -- hiding quarantined captures would surprise tenants ("where did my capture go?"). Quarantine is a state the tenant needs to be aware of, not a secret.
- **Add `"quarantined"` to the status filter enum** -- tenants should be able to query specifically for quarantined captures (`?status=quarantined`) for audit/compliance purposes.
- The `CaptureSummary` schema for quarantined captures should include `quarantineReason` and `quarantinedAt` fields (analogous to how `failed` captures include `failedAt`, `error`, `retryable`).

**Validation change in `handleListCaptures`:**
```js
// Before
if (statusParam !== undefined && !['pending', 'complete', 'failed'].includes(statusParam)) {
  return problemResponse(400, "Query parameter 'status' must be 'pending', 'complete', or 'failed'.");
}

// After
if (statusParam !== undefined && !['pending', 'complete', 'failed', 'quarantined'].includes(statusParam)) {
  return problemResponse(400, "Query parameter 'status' must be 'pending', 'complete', 'failed', or 'quarantined'.");
}
```

#### 5. Status endpoint behavior

The `GET /v1/captures/{captureId}/status` endpoint currently returns `pending`, `complete`, or `failed`. Add `quarantined`:

```json
{
  "id": "cap_...",
  "status": "quarantined",
  "quarantineReason": "MALWARE",
  "quarantinedAt": "2026-03-23T10:00:00.000Z"
}
```

This is important because a capture can transition from `complete` to `quarantined` during a background re-scan. A client polling status (or revisiting a previously-complete capture) needs to see the new state.

#### 6. Webhook event type

Add `capture.quarantined` as a new webhook event type in `VALID_EVENTS`:

```js
const VALID_EVENTS = ['capture.complete', 'capture.failed', 'capture.quarantined'];
```

Webhook payload:
```json
{
  "event": "capture.quarantined",
  "data": {
    "captureId": "cap_...",
    "status": "quarantined",
    "url": "https://example.com",
    "quarantineReason": "MALWARE",
    "quarantinedAt": "2026-03-23T10:00:00.000Z",
    "completedAt": "2026-03-22T15:00:00.000Z"
  }
}
```

This is critical for the background re-scan case: a tenant may have already received `capture.complete`, integrated the capture into their workflow, and now needs to know it has been quarantined. The webhook lets them react without polling.

#### 7. `safeBrowsing` metadata field for graceful degradation

The issue spec says: "Safe Browsing API failures degrade gracefully: capture proceeds with `safeBrowsing: "unavailable"` in metadata."

Add `safeBrowsing` as an optional field in `CaptureRecord` and `CaptureSummary`:

```json
{
  "safeBrowsing": "pass"          // URL was checked, no threats found
  "safeBrowsing": "unavailable"   // API was down, capture proceeded without check
  "safeBrowsing": "fail"          // URL was flagged (capture would be quarantined)
}
```

Only `"pass"` and `"unavailable"` appear on non-quarantined captures. `"fail"` only appears on quarantined captures (redundant with `status: "quarantined"` but explicit). This field should be in `captureSettings` or as a top-level field. Given that `captureSettings` already exists and captures contextual metadata, adding it there is most consistent:

```json
"captureSettings": {
  "version": 2,
  "safeBrowsing": "pass",
  "consent": { ... }
}
```

However, for list results (`CaptureSummary`), `captureSettings` is not included. Since tenants need to know at the list level whether a capture was scanned, promote `safeBrowsing` to a top-level field on both `CaptureRecord` and `CaptureSummary`.

#### 8. Backward compatibility

All proposed changes are additive:
- New status value `"quarantined"` -- clients that only handle `pending/complete/failed` will encounter an unrecognized status, which is the correct signal to update their integration. The API does not break; it returns data in the existing shape with a new enum value.
- New fields (`quarantineReason`, `quarantinedAt`, `safeBrowsing`) -- optional, so existing clients that don't read them are unaffected.
- New 403 response on artifact endpoints -- previously these were always 200 for valid captures. Clients must handle non-200 already (404 is documented). 403 is a new case but follows standard HTTP semantics.
- New webhook event type -- existing webhook subscriptions only receive events they subscribed to. `capture.quarantined` is opt-in.

No version bump needed. This is a minor version increment (0.7.0 -> 0.8.0) in the OpenAPI spec.

### Proposed Tasks

1. **Add `quarantined` status to DB layer** -- Add `quarantineCapture(db, captureId, threatType)` function to `db.js`, analogous to `failCapture`. Update `rowToCapture` to include `quarantineReason` and `quarantinedAt` from the DB row.

2. **Update `handleGetCapture` for quarantined status** -- Currently returns 404 for non-complete captures. Change to: return 200 with quarantine metadata if `status === 'quarantined'`, stripping artifact URLs. Keep 404 for `pending`, `failed`, and non-existent.

3. **Update `handleGetCaptureArtifact` for quarantined status** -- Currently returns 404 for non-complete captures. Change to: return 403 with problem detail (including `quarantineReason` and `quarantinedAt`) when `status === 'quarantined'`.

4. **Update `handleListCaptures` status filter** -- Add `'quarantined'` to the allowed values. Update `CaptureSummary` projection in `handleListCaptures` to include `quarantineReason` and `quarantinedAt` fields when status is quarantined.

5. **Update `handleCaptureStatus`** -- Add `quarantined` case alongside existing `pending/complete/failed` handling.

6. **Add pre-capture Safe Browsing check** -- In `handleCreateCapture` (and `handleBatchCapture`), after URL validation passes, check against Safe Browsing. On threat match, return 422 with `threatType` via `problemResponse`.

7. **Add `capture.quarantined` webhook event** -- Add to `VALID_EVENTS`, implement `buildWebhookPayload` case, dispatch from the re-scan cron handler.

8. **Update OpenAPI spec** -- Add `quarantined` to status enums in `CaptureStatus` and `CaptureSummary`. Add `threatType` example to 422 responses. Add 403 response to artifact endpoint. Add `safeBrowsing` field. Add `capture.quarantined` to webhook event enum. Bump to 0.8.0.

9. **Add `safeBrowsing` field to capture records** -- Store the pre-capture check result (`pass` or `unavailable`) in the capture record. Surface in both `CaptureRecord` and `CaptureSummary`.

### Risks and Concerns

1. **Status transition ambiguity: `complete` -> `quarantined` is a new pattern.** Currently, capture statuses are terminal: `complete` and `failed` are never changed after being set (the idempotency guard in the queue consumer confirms this). Quarantine introduces a post-terminal state transition. This needs careful DB-level handling: the `quarantineCapture` function should use a WHERE clause that only transitions from `complete` (you can't quarantine a failed or pending capture).

2. **Capture ID as access secret + 403 leaks existence.** The current design returns 404 for all non-200 cases on the unauthenticated capture endpoints to prevent enumeration. Returning 403 for quarantined captures reveals that the capture ID exists. This is a minor information leak, but the alternatives are worse: returning 404 would hide the quarantine from legitimate users. **Mitigation:** the capture ID space is 128-bit hex (32 chars after prefix), making enumeration infeasible. Accept this tradeoff.

3. **Google Safe Browsing API latency budget.** The issue spec says <200ms added latency. The Lookup API v4 is a synchronous HTTP call. If Google's API is slow or unreliable, the pre-capture path degrades. The graceful degradation (`safeBrowsing: "unavailable"`) handles this, but the caller still experiences the latency of a failed/timed-out request. Set a hard timeout (e.g., 500ms) on the Safe Browsing HTTP call so the capture path doesn't stall.

4. **Batch capture amplification.** A batch of 100 URLs means 100 Safe Browsing lookups (or ideally 1 batched lookup). The Google Safe Browsing Lookup API supports batch requests -- this must be used for `POST /v1/captures/batch` to stay within quota and latency constraints.

5. **Webhook delivery for background re-scan quarantines.** When a cron job quarantines a previously-complete capture, it needs to dispatch a `capture.quarantined` webhook. The cron handler runs in a different execution context than the capture pipeline. Ensure the webhook dispatch path works from the cron handler (it currently only fires from the queue consumer).

6. **No unquarantine path.** The issue spec explicitly excludes an appeal/unquarantine workflow. This means a false positive from Safe Browsing permanently quarantines a capture. Consider whether an admin endpoint (`POST /v1/admin/captures/{id}/unquarantine`) should be stubbed or at minimum the DB schema should support the reverse transition, even if the API endpoint is not built yet.

### Additional Agents Needed

- **security-minion**: Review the threat model for the 404-to-403 change on quarantined captures (capture ID enumeration risk), and validate the Safe Browsing integration pattern (API key storage, request signing, response verification).
- **api-spec-minion**: Author the OpenAPI spec changes once the design is approved -- new schemas, status enum updates, 403 responses, webhook event types, examples.
