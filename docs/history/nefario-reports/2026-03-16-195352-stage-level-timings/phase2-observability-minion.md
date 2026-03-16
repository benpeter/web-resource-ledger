# Observability Minion -- Planning Contribution: Stage-Level Timings Log Schema

## Planning Question

What should the structured log event look like for per-stage capture timings?
How should per-stage durations be added to existing `capture.success` and
`capture.partial` events -- flat fields vs. nested object? Should partial
captures carry the full breakdown? What field naming convention aligns with
Coralogix query patterns?

## Recommendation: Flat Top-Level Fields with `Ms` Suffix Convention

### Use flat fields, not a nested `stages` object

**Recommendation**: Add per-stage durations as flat top-level fields on the
existing `capture.success` and `capture.partial` log events, alongside the
current `durationMs`.

**Rationale -- Coralogix query ergonomics**: Coralogix ingests structured JSON
via the Singles API (as `src/log.js` does). The `text` field in the Coralogix
payload is a JSON string that gets parsed into queryable fields. Flat fields
are directly queryable with simple Lucene/DataPrime syntax:

```
// Flat: simple, no nesting syntax needed
sessionAcquireMs:>500 AND event:"capture.success"

// Nested: requires dot notation, varies by Coralogix query context
stages.sessionAcquireMs:>500 AND event:"capture.success"
```

While Coralogix supports nested JSON via dot-notation in DataPrime queries, flat
fields have three practical advantages:

1. **Aggregation simplicity**: `avg(sessionAcquireMs)` works directly in
   DataPrime. Nested fields require `avg(stages.sessionAcquireMs)` -- functional
   but adds syntactic noise, and some Coralogix visualization widgets handle flat
   fields more reliably than nested paths.

2. **Consistency with existing pattern**: The current log events already use flat
   fields: `durationMs`, `consentDurationMs`, `consentStatus`, `consentCmp`.
   Adding `sessionAcquireMs`, `navigationMs`, etc. as flat peers follows the
   established convention. Introducing a `stages` nesting layer would create
   an inconsistency where `durationMs` and `consentDurationMs` are top-level
   but new stage durations are nested.

3. **Cardinality is not a concern here**: These are numeric duration fields with
   no label-cardinality risk. Flat fields on a single log event do not create
   the kind of cardinality explosion that nesting is sometimes used to contain.

**One exception to consider**: If the number of stages were likely to grow
beyond ~10, a nested object would provide better organization. But the capture
pipeline has a fixed, well-defined set of stages (7 stages). This is unlikely
to change without a fundamental redesign of the pipeline. Flat fields are
appropriate for this cardinality.

### Field naming convention

Use `camelCase` with `Ms` suffix, matching the existing `durationMs` and
`consentDurationMs` patterns already in the codebase:

| Field | What it measures | Stage boundaries |
|-------|-----------------|------------------|
| `sessionAcquireMs` | `getOrCreateSession()` duration | renderStart to browser connected |
| `contextSetupMs` | `browser.newContext()` + orphan cleanup + route setup | session acquired to page ready |
| `navigationMs` | `page.goto()` duration | page created to load event (or timeout) |
| `settleMs` | Post-load settle delay | load event to settle complete |
| `consentMs` | `dismissCookieConsent()` duration | settle complete to consent done |
| `screenshotMs` | All screenshot operations | consent done to screenshots captured |
| `contentMs` | `page.content()` extraction | screenshots to HTML captured |

This naming is:
- Self-documenting (an operator seeing `navigationMs: 18500` instantly knows
  the page was slow to load)
- Grep-friendly (`grep -r "Ms:" logs` finds all timing fields)
- Consistent with existing `durationMs`, `consentDurationMs` convention
- Sortable in Coralogix column views (all timing fields end in `Ms`)

### Keep `durationMs` as the total

`durationMs` must remain as the overall capture duration for backward
compatibility. It is already used in existing Coralogix queries and any
monitoring set up against the current event schema. The per-stage fields are
additive information, not a replacement.

Note: `durationMs` on the log event measures `performCapture()` wall time
(includes R2 writes, WACZ bundling, KV update), while the sum of stage fields
measures `defaultRenderer()` wall time. They will not sum to exactly `durationMs`.
This is correct -- the gap represents post-render work (R2, WACZ, KV). Do not
try to make them sum. If needed, a `renderDurationMs` field (the existing
`render.durationMs` from the return object) can be added to represent the
exact renderer total, but I recommend against adding it to the log event
because `render.durationMs` is already stored in KV and accessible via the
API. The log event should carry operationally useful fields, not duplicate
what is already persisted.

### Retire `consentDurationMs` from log events

The current `capture.success` event has `consentDurationMs` as a flat field.
With the addition of `consentMs` (measuring the same thing -- the
`dismissCookieConsent()` call), `consentDurationMs` becomes redundant.

**Recommendation**: Replace `consentDurationMs` with `consentMs` in the log
event for naming consistency. This is a minor breaking change for any existing
Coralogix queries using `consentDurationMs`, but:
- The project is pre-production / early-stage
- The field is being renamed, not removed -- a simple find-and-replace in
  any saved queries
- Naming consistency now avoids permanent naming inconsistency later

If this is too disruptive, keep both fields for one release cycle and add a
note to remove `consentDurationMs` in the next phase.

### Handle partial captures with `null` for skipped stages

For `capture.partial` events, stages that were not executed should be `null`,
not `0` and not omitted:

```json
{
  "event": "capture.partial",
  "captureId": "cap_abc123",
  "durationMs": 22100,
  "sessionAcquireMs": 340,
  "contextSetupMs": 85,
  "navigationMs": 20000,
  "settleMs": null,
  "consentMs": null,
  "screenshotMs": 1200,
  "contentMs": 450
}
```

**Why `null` not `0`**:
- `0` means "this stage ran and completed instantly." `null` means "this stage
  was skipped." These are semantically different. An operator querying
  `consentMs:0` should find captures where consent ran but was instant, not
  captures where consent was skipped entirely.
- Coralogix handles `null` cleanly -- `consentMs:*` matches only events where
  the field exists and is non-null, making it easy to filter to "captures where
  consent actually ran."

**Why not omit the field entirely**:
- Consistent field presence makes schema discovery easier. When an operator
  inspects any `capture.success` or `capture.partial` event, they see all 7
  stage fields. They don't have to wonder whether a missing field means
  "skipped" or "bug in logging code."
- Coralogix DataPrime `NOT consentMs:*` queries work, but explicit `null` is
  more intentional and visible in raw log inspection.

**Partial capture specifics**: Looking at the code, a partial capture (navigation
timeout with DOM available) skips settle, consent, and takes a single
screenshot. The partial path should populate:
- `sessionAcquireMs`: measured (session was acquired)
- `contextSetupMs`: measured (context was created)
- `navigationMs`: measured (navigation ran until timeout)
- `settleMs`: `null` (skipped -- navigation timed out)
- `consentMs`: `null` (skipped -- partial captures skip consent entirely)
- `screenshotMs`: measured (partial screenshot was taken)
- `contentMs`: measured (partial content was extracted)

### Full event shapes

**capture.success** (adding new fields, keeping existing ones):

```json
{
  "event": "capture.success",
  "captureId": "cap_abc123",
  "tenantId": "default",
  "durationMs": 8450,
  "sessionAcquireMs": 120,
  "contextSetupMs": 65,
  "navigationMs": 2300,
  "settleMs": 3000,
  "consentMs": 1850,
  "screenshotMs": 680,
  "contentMs": 45,
  "waczStatus": "ok",
  "bundleSize": 524288,
  "renderQuality": "full",
  "cip": "a1b2c3...",
  "timestampStatus": "ok",
  "consentStatus": "dismissed",
  "consentCmp": "cookiebot"
}
```

Note: `consentDurationMs` is replaced by `consentMs`. `consentStatus` and
`consentCmp` remain as-is -- they carry semantic information (what happened)
while `consentMs` carries duration information (how long it took).

**capture.partial**:

```json
{
  "event": "capture.partial",
  "captureId": "cap_abc123",
  "tenantId": "default",
  "durationMs": 22500,
  "sessionAcquireMs": 340,
  "contextSetupMs": 85,
  "navigationMs": 20000,
  "settleMs": null,
  "consentMs": null,
  "screenshotMs": 1200,
  "contentMs": 450,
  "renderQuality": "partial",
  "cip": "a1b2c3...",
  "waczStatus": "skipped",
  "render": {
    "waitUntilReached": "domcontentloaded",
    "timedOut": true,
    "durationMs": 21800
  }
}
```

## Risks and Dependencies

### Risk 1: Log event size growth (LOW)

Adding 7 numeric fields (~100 bytes) to each log event is negligible. The
Coralogix Singles API accepts payloads up to 2MB. Current events are ~200-400
bytes. No action needed.

### Risk 2: Timer accuracy on Cloudflare Workers (LOW)

`Date.now()` on Cloudflare Workers returns wall-clock milliseconds. Workers do
not have access to `performance.now()` for high-resolution timing. For the
stages being measured (tens of ms to tens of seconds), millisecond resolution
is adequate. Sub-millisecond stages (like `contentMs` for small pages) may
show as `0` or `1` -- this is acceptable and truthful.

There is a known Workers behavior where `Date.now()` can return the same value
within a synchronous execution block (time is "frozen" until the next I/O
boundary). All stages in `defaultRenderer()` involve async I/O (network calls,
browser protocol messages), so each `Date.now()` call will be at a fresh I/O
boundary. This is not a concern for this use case.

### Risk 3: Backward-compatible log schema (LOW)

Adding new fields to an existing log event is backward-compatible. Existing
Coralogix queries, alerts, and dashboards that reference `capture.success`
will continue to work -- they simply won't query the new fields until updated.

The one exception is `consentDurationMs` -> `consentMs` rename, which is a
minor breaking change. See recommendation above for mitigation options.

### Risk 4: Timer placement vs. try/finally cleanup (MEDIUM)

The `defaultRenderer()` function has a `try/finally` block that calls
`context.close()` and `browser.close()`. The stage timers must be placed
inside the try block, before the finally. The function's return value is
constructed inside the try block, so this is natural. However, if any stage
timer placement introduces a code path where an error bypasses the finally
block, that would be a security issue (context not closed).

**Mitigation**: The timers are pure `Date.now()` arithmetic with no error
surface. They cannot throw. The existing try/finally structure is unchanged.
Code review should verify this.

### Dependency: API design decision

The log event field names should match the `render` metadata field names in the
API response. If the api-design-minion recommends a nested `stages` object in
the API response, the log event could diverge (flat in logs, nested in API) or
match (nested in both). I recommend the log event and API response use the same
structure for operator sanity -- when someone sees `sessionAcquireMs` in a log,
they should be able to find the same field name in the API response.

**If api-design-minion recommends nesting**: Accept it for the API but keep logs
flat. Document the mapping. The API serves consumers who want structured data;
the log serves operators who want fast queries. Different audiences, different
ergonomics.

**If api-design-minion recommends flat**: Ideal -- both log and API use the same
flat field names.

## Coralogix Query Examples

To validate the schema design, here are queries operators would run against
these fields:

**Find slow session acquisitions** (session pool contention indicator):
```
event:"capture.success" AND sessionAcquireMs:>1000
```

**Average navigation time over last hour**:
```
source logs
| filter event == 'capture.success'
| avg navigationMs as avg_nav
```

**P95 navigation time by hour** (DataPrime):
```
source logs
| filter event == 'capture.success' || event == 'capture.partial'
| timestampround timestamp, 1h as hour
| percentile navigationMs, 95 by hour
```

**Identify which stage is dominating capture duration**:
```
source logs
| filter event == 'capture.success'
| avg sessionAcquireMs, avg contextSetupMs, avg navigationMs, avg settleMs, avg consentMs, avg screenshotMs, avg contentMs
```

**Consent duration when CMP was detected**:
```
source logs
| filter event == 'capture.success' AND consentStatus == 'dismissed'
| avg consentMs as avg_consent
| percentile consentMs, 95 as p95_consent
```

All of these work cleanly with flat fields. Nested fields would require
`stages.navigationMs` etc., which works but adds friction.

## Summary of Recommendations

| Decision | Recommendation | Confidence |
|----------|---------------|------------|
| Flat vs. nested | Flat top-level fields | High |
| Naming convention | `camelCase` + `Ms` suffix | High |
| Keep `durationMs` | Yes, as total capture time | High |
| Skipped stages | `null` (not `0`, not omitted) | High |
| Partial captures get full breakdown | Yes, with `null` for skipped stages | High |
| Retire `consentDurationMs` | Replace with `consentMs` | Medium (could keep both temporarily) |
| Log/API field name alignment | Match names, tolerate structural divergence | Medium |
