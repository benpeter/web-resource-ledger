# Phase 0023: Decisions

## RenderInfo fields: 6 vs 3

**Context**: iac-minion proposed 6 fields (waitUntilReached, waitUntilTarget,
timedOut, durationMs, screenshotMs, contentMs). api-spec-minion proposed 3
(waitUntilReached, timedOut, durationMs).

**Decision**: 3 fields in the API schema. `waitUntilTarget` is always
`networkidle` (zero information). `screenshotMs` and `contentMs` are operational
telemetry that belongs in Coralogix logs, not in the KV record or API response.

**Rationale**: YAGNI per Helix Manifesto. Consumers need to know *what happened*
(waitUntilReached, timedOut, durationMs). Operators need *how long each step
took* (screenshotMs, contentMs) -- different audiences, different data stores.

## renderQuality on full captures: explicit vs implicit

**Decision**: Explicit at the API layer (`record.renderQuality ?? 'full'`),
implicit in KV (no backfill of existing records). New captures write
`renderQuality: 'full'` explicitly. Pre-existing records lack the field and
the API handlers default it.

**Rationale**: Consumers get a guaranteed field. KV stays lean (no migration).

## Verify page "Capture note" for partial captures

**Decision**: Skip entirely. Partial captures have no WACZ, so `/v1/verify/:id`
returns 404. Any verify-page note for partials is dead code.

**Rationale**: YAGNI. When R16 (Queues) lands and partial captures gain WACZ,
the note can be added at that point.

## categorizeError for partial-path sub-errors

**Decision**: Add a single new case for `'Deadline exceeded'`. The renderer
wraps ALL partial-path failures in `'Deadline exceeded before partial capture
could complete'` before they escape to categorizeError.

**Rationale**: Single controlled error message prevents internal Playwright CDP
metadata from leaking to the API response.

## Renderer deadline computation

**Decision**: Computed inside `defaultRenderer` using `Date.now()` at renderer
entry, deadline set to `Date.now() + 2000` after the 25s timeout fires.

**Rationale**: Avoids changing the renderer signature, keeps the API clean for
testing. The ~500ms difference between performCapture start and renderer start
is well within the 2s margin.

## renderQuality on VerificationCapture

**Context**: margo flagged that partial captures always 404 at verify (no WACZ),
so `renderQuality` in the verify response can only ever be `'full'`.

**Decision**: Keep it. Low schema cost, future-proofs for R16 when partial
captures may gain WACZ.

## WACZ captureQuality in datapackage.json

**Decision**: Deferred. Not part of this phase. The advisory recommended signing
`captureQuality` into datapackage.json for full captures, but this is a separate
concern from the partial capture fallback. Tracked in backlog.
