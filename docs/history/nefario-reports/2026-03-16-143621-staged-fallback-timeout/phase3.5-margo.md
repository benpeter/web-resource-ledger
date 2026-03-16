# Margo Review -- Staged Fallback for Capture Timeout

## Verdict: ADVISE

The plan is well-scoped and proportional to the problem. The synthesis correctly applied YAGNI to trim RenderInfo from 6 fields to 3, dropped the dead-code verify-page note, and kept the change within existing files. The conflict resolutions are sound. Two non-blocking observations:

### Findings

**[simplicity]: `renderQuality` on VerificationCapture is unreachable**
- SCOPE: `openapi.yaml` VerificationCapture schema, `src/index.js` handleVerifyCapture
- CHANGE: The plan adds `renderQuality` to the VerificationCapture response shape. But handleVerifyCapture already gates on `!record.wacz` (returns 404). Partial captures have no WACZ, so they always 404 before the verify response is built. `renderQuality` on VerificationCapture can only ever be `'full'` -- it carries zero information for consumers.
- WHY: Adding a field that can only have one value is a YAGNI signal. It adds schema surface area (consumers may write code to handle `'partial'` in verify responses that can never arrive), increases spec maintenance, and slightly misleads about the feature's reach. The plan itself correctly identifies that partial captures 404 at verify, then contradicts itself by enriching the verify response shape anyway.
- TASK: Drop `renderQuality` from VerificationCapture in the OpenAPI spec and from the verify response body in `handleVerifyCapture`. If partial captures later gain WACZ (R16 Queues), add it then. This is a minor trim -- non-blocking either way.

**[simplicity]: `render` metadata conditionally included vs always present creates two response shapes**
- SCOPE: `src/index.js` handleGetCapture, `openapi.yaml` CaptureRecord
- CHANGE: The plan makes `render` optional on CaptureRecord ("present on captures created after this feature; absent on earlier captures"). This means consumers must handle two shapes: with and without `render`. For `renderQuality`, the plan handles backward compat cleanly with `?? 'full'`. For `render`, the absence-means-old-record semantic is fine, but consider whether the same defaulting pattern could apply: if `render` is absent, fill it with `{ waitUntilReached: 'networkidle', timedOut: false, durationMs: null }`. This would give consumers a single response shape.
- WHY: Two response shapes increase consumer-side branching. However, synthesizing a fake `render` for old records requires inventing data (`durationMs` is unknown), which is arguably worse than honest absence. This is a judgment call.
- TASK: No change required. The current approach (optional `render`, always-present `renderQuality`) is reasonable. Just flagging the trade-off for the record. If the team prefers a single shape, the defaulting could be added later when old records have aged out.

### What the plan gets right

- **Scope discipline**: 4 existing files + 1 spec file. No new files, no new dependencies, no new services.
- **YAGNI applied correctly**: `waitUntilTarget` dropped (always networkidle), `screenshotMs`/`contentMs` in logs only, verify-page note skipped (dead code), no `retryable` on partial captures.
- **Complexity budget**: zero new dependencies, zero new services, zero new abstraction layers. The only complexity cost is the try/catch branch in defaultRenderer (essential complexity -- this IS the feature).
- **Operational simplicity**: log events differentiate partial from full without new observability infrastructure. Existing Coralogix pipeline absorbs the new events.
- **Backward compatibility**: `?? 'full'` defaulting avoids migration. Clean.
- **Infrastructure proportionality**: no infra changes for what is fundamentally a code-path addition within the existing capture pipeline.

### Complexity Tally

| Addition | Cost |
|---|---|
| New code path in defaultRenderer (partial capture) | Essential -- this is the feature |
| RenderInfo schema (3 fields) | Justified -- consumers need render context |
| renderQuality field on CaptureRecord/CaptureSummary | Justified -- distinguishes partial from full |
| renderQuality on VerificationCapture | Accidental -- always 'full', zero information (minor) |
| One new categorizeError case | Justified -- maps deadline errors |

**Total accidental complexity**: one unnecessary schema field on VerificationCapture. Non-blocking.
