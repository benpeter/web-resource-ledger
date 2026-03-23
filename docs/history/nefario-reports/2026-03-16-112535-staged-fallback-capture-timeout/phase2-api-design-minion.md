# API Design Analysis: Degraded Capture Concept

**Agent**: api-design-minion
**Phase**: Planning consultation (advisory)
**Input**: openapi.yaml (v0.2.0), src/index.js, src/kv.js, src/capture.js

---

## 1. Status Value vs. Metadata Field

### The Core Question

Should a capture that succeeded with incomplete rendering be a new status
(`partial`, `degraded`) or remain `status: 'complete'` with additional metadata?

### Analysis of Three Options

#### Option A: New status value (e.g., `status: 'partial'`)

**How it works**: Add `'partial'` to the `status` enum alongside `pending`,
`complete`, `failed`.

**Advantages**:
- Explicit and impossible to miss
- Status filter on list endpoint (`?status=partial`) works naturally
- The lifecycle is unambiguous: pending -> partial|complete|failed

**Problems -- this is the wrong choice**:

1. **Breaks existing consumers.** The `status` enum is `[pending, complete, failed]`
   in three schema locations: `CaptureStatus.status`, `CaptureSummary.status`, and
   the `status` query parameter on `listCaptures`. Every consumer that switches on
   status or validates against the enum will break. The status endpoint docs say
   "poll until status is complete or failed" -- a new terminal state violates this
   contract.

2. **Breaks the capture retrieval gate.** `handleGetCapture()` and
   `handleGetCaptureArtifact()` both check `record.status !== 'complete'` and
   return 404 otherwise. A `partial` capture would be invisible through the primary
   retrieval endpoints unless both handlers are updated to also accept `partial`.
   This is a ripple effect -- every status check in the codebase becomes a bug site.

3. **Semantic overload.** Status tracks lifecycle position (is the work done?),
   not quality (how good was it?). Mixing these dimensions into one field creates
   ambiguity: is `partial` a terminal state? Can it transition to `complete` on
   retry? What does `retryable` mean on a `partial` -- retry to get `complete`,
   or retry because it might fail entirely?

4. **List endpoint complications.** The `?status=` filter validates against the
   enum. Adding `partial` means existing consumers filtering `?status=complete`
   would silently exclude degraded captures they likely want. There is no
   `?status=complete,partial` multi-value support.

**Verdict**: Reject. The cost is too high for what is fundamentally a quality
annotation on a completed capture.

#### Option B: New field on complete records (`renderQuality`)

**How it works**: `status` remains `'complete'`. Add a `renderQuality` field to
the CaptureRecord and CaptureSummary schemas that is present on every completed
capture.

```json
{
  "id": "cap_...",
  "status": "complete",
  "renderQuality": "full",
  "url": "https://example.com",
  "completedAt": "2024-01-15T10:30:45.123Z",
  "artifacts": { ... }
}
```

**Advantages**:
- Backward compatible: `status: 'complete'` still means "done, artifacts
  available." Existing consumers that don't read `renderQuality` continue to
  work -- they get captures they would otherwise have gotten as `failed`.
- Clean separation of concerns: lifecycle (status) vs. fidelity (renderQuality).
- The field is always present on complete records (not just degraded ones), so
  consumers can always check it -- no "field exists only sometimes" ambiguity.
- Filterable: list endpoint can add `?renderQuality=full` or
  `?renderQuality=partial` as a future enhancement.
- SDK-friendly: maps to a typed enum, not a nullable optional.

**This is the right choice.** Details below in the recommendation.

#### Option C: Metadata only in WACZ / not in API surface

**How it works**: Embed render quality metadata in the WACZ datapackage.json
or as WARC metadata. Don't surface it in the JSON API.

**Problems**:
- Consumers must download and parse WACZ to discover quality -- unacceptable UX.
- Not all captures have WACZ (signing key may be absent).
- The information is needed at the list/summary level for filtering and triage,
  not just at the artifact level.

**Verdict**: Reject as a standalone approach. Render quality metadata SHOULD be
included in the WACZ (the security-minion should weigh in on this for evidence
integrity), but it must also be in the API surface.

### Recommendation: Option B with `renderQuality`

Add `renderQuality` as a required field on `CaptureRecord` and an optional field
on `CaptureSummary` (present only when status is `complete`).

**Field name**: `renderQuality` (not `quality`, `fidelity`, or `renderLevel`).
- `renderQuality` is specific: it describes the rendering process, not the
  content.
- It parallels the existing domain language -- the codebase already calls this
  "rendering" (`defaultRenderer`, `renderResult`).

**Values**: `'full' | 'partial'`
- `full`: `networkidle` was reached within the timeout. This is what every
  existing capture has.
- `partial`: the page passed at least `DOMContentLoaded` or `load` but did not
  reach `networkidle` before the timeout fired.
- Two values, not three. Don't distinguish between "timed out after
  DOMContentLoaded" and "timed out after load" in the quality enum -- that level
  of detail belongs in the `render` metadata object (see section 2). Consumers
  need a simple good/degraded signal, not a rendering event taxonomy.

**Why not a boolean `degraded: true`?** Because:
- Booleans don't extend. If a third quality tier appears later (e.g., `minimal`
  for captures where only DOMContentLoaded fired), you need a new field.
- String enums are self-documenting in the spec and SDK-generated types.
- `renderQuality: 'full'` is more informative than the absence of a `degraded`
  field.

**Backward compatibility**:
- Adding `renderQuality` to CaptureRecord is an additive change (new field).
  Existing consumers ignore unknown fields. This is safe.
- All existing captures are retroactively `renderQuality: 'full'` -- the field
  was not persisted, so the handler should default to `'full'` when
  `renderQuality` is absent from the KV record.
- The status endpoint (`getCaptureStatus`) should NOT include `renderQuality`.
  Its job is lifecycle polling, not quality reporting. Keep it simple.

---

## 2. Metadata to Surface About Degraded Captures

A degraded capture needs enough metadata for consumers to understand what they
got and assess whether it meets their needs. But per KISS, surface only what is
actionable.

### Recommended: `render` object on CaptureRecord

Add a `render` object that is present on all complete captures (not just degraded
ones). This avoids the "field only exists sometimes" pattern.

```json
{
  "id": "cap_...",
  "status": "complete",
  "renderQuality": "partial",
  "render": {
    "waitUntilReached": "load",
    "waitUntilTarget": "networkidle",
    "timedOut": true,
    "durationMs": 25000
  },
  "artifacts": { ... }
}
```

**Fields**:

| Field | Type | Description |
|---|---|---|
| `waitUntilReached` | `string` enum: `domcontentloaded`, `load`, `networkidle` | The highest rendering milestone reached before capture |
| `waitUntilTarget` | `string` enum: `networkidle` | The target milestone (what was requested). Always `networkidle` today, but including it makes the contract explicit and forward-compatible if we ever offer configurable wait strategies |
| `timedOut` | `boolean` | Whether the navigation timeout fired before `waitUntilTarget` was reached |
| `durationMs` | `integer` | Wall-clock time spent on navigation + rendering, in milliseconds |

**What I considered and excluded**:

- `timeoutMs` (the timeout limit): This is a server implementation detail, not
  a property of the capture. Consumers don't need to know the limit was 25s --
  they need to know the capture timed out and what milestone it reached.
- `networkRequestsPending`: Too volatile and implementation-specific. The
  `waitUntilReached` milestone is the stable signal.
- `domInteractive`, `firstContentfulPaint`, etc.: Performance metrics are a
  different concern. If WRL ever adds performance reporting, it belongs in a
  separate `performance` object, not in `render`.

### CaptureSummary: Keep It Lean

The `CaptureSummary` (list endpoint) should include `renderQuality` but NOT the
full `render` object. The summary is for scanning and filtering; consumers who
need render details fetch the full record.

```json
{
  "id": "cap_...",
  "status": "complete",
  "renderQuality": "partial",
  "url": "https://tagesschau.de",
  "createdAt": "...",
  "completedAt": "..."
}
```

This keeps the list response lean and avoids inflating payload size when listing
hundreds of captures. The `renderQuality` field is sufficient for filtering and
visual scanning.

---

## 3. Retryability of Degraded Captures

### The Tension

A degraded capture succeeded -- artifacts exist, status is `complete`. But the
rendering is incomplete. Should the API signal "you might get a better result if
you try again"?

### Recommendation: Yes, via `retryable` on the CaptureRecord

Currently `retryable` only exists on failed captures. Extend it to complete
captures with `renderQuality: 'partial'`:

```json
{
  "status": "complete",
  "renderQuality": "partial",
  "retryable": true,
  "render": { "waitUntilReached": "load", "timedOut": true, ... }
}
```

**Why this works**:
- The field already has clear semantics: "submitting a new capture for the same
  URL may produce a better result." This is exactly the degraded-capture situation.
- It does not change the semantics for existing `complete` captures -- they
  simply don't have `retryable` (or it defaults to `false`, which is the same
  thing).
- It gives SDK consumers a single check: `if (capture.retryable) { ... }` works
  for both failed and degraded captures without special-casing.

**What retryable does NOT mean**: It does not mean "this capture is invalid" or
"you should discard this." The degraded capture is still usable evidence -- the
consumer decides whether to act on it or retry. The API provides the signal, not
the decision.

**The status endpoint (`getCaptureStatus`) should NOT include retryable for
complete captures.** The status endpoint's job is "are we done yet?" Once
`status: 'complete'` with `captureUrl`, the consumer navigates to the full
record. Keep the status endpoint minimal.

### Alternative Considered: Separate `retryReason` field

A more descriptive approach: `retryReason: 'networkidle_timeout'`. Rejected
because:
- `retryable` already exists and has clear semantics.
- The reason is available in `render.timedOut` + `render.waitUntilReached`.
- Adding another field increases API surface for marginal value.

---

## 4. CaptureSummary in the List Endpoint

### Recommendation: Add `renderQuality` to CaptureSummary

Yes, the list endpoint should surface the quality indicator. The CaptureSummary
schema gains one optional field:

```yaml
renderQuality:
  type: string
  enum: [full, partial]
  description: >
    Present when status is "complete". Indicates whether the page
    reached full rendering (networkidle) or was captured after a
    partial render (DOMContentLoaded or load event only).
```

**Why**:
- Consumers scanning a list of captures need to identify degraded captures
  without fetching each individual record.
- Monitoring dashboards need to display quality distribution at the list level.
- The field is a single string -- negligible payload impact.

**Status filter**: Do NOT add `?renderQuality=partial` as a query parameter in
this iteration. The current status filter already has the limitation of
in-memory filtering with over-fetch (see `listCaptures` in kv.js). Adding
another filter dimension compounds this. Wait until there is demonstrated demand.
If it becomes needed, it is an additive, non-breaking change.

**Backward compatibility**: Adding an optional field to responses is always safe.
Consumers that don't know about `renderQuality` ignore it.

---

## 5. Interaction with WACZ Verification

### The Question

A degraded capture is cryptographically signed and verifiable. The WACZ bundle
hash covers whatever artifacts were captured -- they are authentic, just
incomplete. Is a verified degraded capture "verified" in the user's mental model?

### Analysis

The verification endpoint answers exactly one question: "Are these artifacts
cryptographically intact and signed by this service?" The answer for a degraded
capture is the same as for a full capture -- yes, the bits are authentic.

But the human reading the verification page may assume "verified" means "this is
a complete, accurate representation of the web page." For a degraded capture,
that assumption is wrong.

### Recommendation: Surface `renderQuality` in the Verification Result

Add `renderQuality` to the `VerificationCapture` object (which is already
present in the verification response):

```json
{
  "verified": true,
  "capture": {
    "id": "cap_...",
    "createdAt": "...",
    "completedAt": "...",
    "renderQuality": "partial"
  },
  "signing": { ... },
  "checks": [ ... ]
}
```

**Why here, not elsewhere**:
- The verification endpoint is the primary "trust surface." This is where
  consumers evaluate evidence quality.
- `verified: true` with `renderQuality: 'partial'` is unambiguous: "These bits
  are authentic, but the rendering did not reach full completion."
- It does NOT change the `verified` boolean semantics. Verification is about
  cryptographic integrity, not rendering completeness.

**The HTML verification page** (browser content negotiation path) should
visually distinguish degraded captures. A banner or note like "This capture was
taken before the page finished loading all resources" would prevent
misinterpretation. But that is a UI concern, not an API contract concern.

**Do NOT add a new verification check for render quality.** The `checks` array
(`artifactHashes`, `bundleHash`, `signature`) are all cryptographic checks. Render
quality is not a cryptographic property -- mixing it in would dilute the
semantics. Keep it in `capture` metadata.

---

## 6. Schema Changes Summary

### New Schema: `RenderInfo`

```yaml
RenderInfo:
  type: object
  description: >
    Rendering metadata for a completed capture. Describes what rendering
    milestone was reached and whether the navigation timed out.
  required: [waitUntilReached, waitUntilTarget, timedOut, durationMs]
  properties:
    waitUntilReached:
      type: string
      enum: [domcontentloaded, load, networkidle]
      description: >
        The highest rendering milestone the page reached before the
        capture was taken. "networkidle" means no pending network
        requests for 500ms; "load" means the load event fired;
        "domcontentloaded" means the DOM was parsed but subresources
        may still be loading.
    waitUntilTarget:
      type: string
      enum: [networkidle]
      description: >
        The rendering milestone that was requested. Currently always
        "networkidle". Included for forward compatibility if
        configurable wait strategies are added.
    timedOut:
      type: boolean
      description: >
        True when the navigation timeout fired before waitUntilTarget
        was reached. False when the target was reached normally.
    durationMs:
      type: integer
      minimum: 0
      description: >
        Wall-clock milliseconds spent on page navigation and rendering.
```

### Modified Schema: `CaptureRecord`

Add two fields:
- `renderQuality` (required, string enum `[full, partial]`)
- `render` ($ref to RenderInfo)
- `retryable` (optional boolean, present when `renderQuality` is `partial`)

### Modified Schema: `CaptureSummary`

Add one field:
- `renderQuality` (optional, present when status is `complete`)

### Modified Schema: `VerificationCapture`

Add one field:
- `renderQuality` (optional, present when available from KV record)

### KV Record Changes

The KV record gains two fields on completion:
- `renderQuality: 'full' | 'partial'`
- `render: { waitUntilReached, waitUntilTarget, timedOut, durationMs }`

The `completeCapture()` function signature needs an additional parameter for
render metadata. Default to `renderQuality: 'full'` for backward compatibility
with records that predate this change.

---

## 7. Handler Impact Assessment

### `handleGetCapture` (index.js:249)

Must include `renderQuality` and `render` in the response body. The
`record.status !== 'complete'` gate is unchanged -- degraded captures are
`complete`.

```js
// Addition to response body construction:
body.renderQuality = record.renderQuality || 'full';
if (record.render) body.render = record.render;
if (record.renderQuality === 'partial') body.retryable = true;
```

### `handleGetCaptureArtifact` (index.js:293)

No change. The `status !== 'complete'` gate works correctly -- degraded captures
pass through. Artifacts are served identically regardless of render quality.

### `handleCaptureStatus` (index.js:454)

No change recommended. The status endpoint reports lifecycle, not quality.
`status: 'complete'` with `captureUrl` is the correct response. Consumers
navigate to the capture record for quality details.

### `handleListCaptures` (index.js:145)

The CaptureSummary projection (line 211-226) adds `renderQuality`:

```js
if (r.status === 'complete') {
  summary.completedAt = r.completedAt;
  summary.renderQuality = r.renderQuality || 'full';
}
```

### `handleVerifyCapture` (index.js:348)

The `capture` object in the verification response adds `renderQuality`:

```js
capture: {
  id: record.captureId,
  createdAt: record.createdAt,
  completedAt: record.completedAt,
  renderQuality: record.renderQuality || 'full',
}
```

---

## 8. Version Strategy

### This does NOT require a version bump to v2

All changes are additive:
- New optional fields on existing response schemas
- New required fields that default sensibly for old records
- No fields removed, renamed, or retyped
- No status enum values removed
- No URL structure changes

This is a minor version bump: `0.2.0` -> `0.3.0`. The OpenAPI spec version
tracks API contract changes, and adding a quality dimension qualifies.

The `status` query parameter enum on `listCaptures` gains no new values in this
iteration. If `?renderQuality=` is added later, it is also additive.

---

## 9. Risks and Mitigations

### Risk: Consumers treat `complete` as "fully rendered"

**Today**: Every `complete` capture is fully rendered. Consumers may have
implicit assumptions.

**Mitigation**: `renderQuality` is always present on complete records. Consumers
that check it are informed. Consumers that don't check it still get usable
captures -- captures that would otherwise have been `failed`. They are strictly
better off.

### Risk: `renderQuality` enum expansion

**If we add more values later** (e.g., `minimal` for DOMContentLoaded-only),
consumers switching on the enum may break on unknown values.

**Mitigation**: Document that consumers should treat unknown `renderQuality`
values as equivalent to `partial` (defensive parsing). This is standard practice
for string enums in evolving APIs (Stripe does this).

### Risk: Retryable on complete captures confuses SDK consumers

**Mitigation**: `retryable` already has a boolean type. SDK consumers that handle
`retryable` on failed captures will naturally handle it on complete captures.
Document that `retryable: true` on a complete capture means "a retry may produce
a higher-quality capture" not "this capture is unusable."

---

## 10. Open Questions for Other Specialists

### For security-minion:
- Should `renderQuality` and `render` metadata be embedded in the WACZ
  datapackage.json so the quality signal is part of the signed evidence chain?
  My recommendation is yes -- but this is a signing integrity question, not an
  API design question.

### For iac-minion:
- After a Playwright `TimeoutError`, is the page still usable for
  `page.screenshot()` and `page.content()`? If not, the fallback cannot capture
  artifacts at all and this entire design is moot. The API design assumes
  artifacts are available.

### For ux-strategy-minion:
- Should the verification HTML page render degraded captures differently? My
  recommendation is a visible banner, but the content and placement are UX
  decisions.
