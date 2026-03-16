# Lucy Review: Staged Fallback Timeout Plan

## Verdict: ADVISE

The plan is well-aligned with issue #53 and follows CLAUDE.md engineering philosophy. Two items need attention; neither blocks execution.

---

## Traceability Matrix

| Original Prompt Item | Plan Coverage | Status |
|---|---|---|
| 1. `src/capture.js`: catch TimeoutError, check readyState, capture, skip WACZ, deadline | Task 1, section 1-2 | Covered |
| 2. `src/kv.js`: extend completeCapture | Task 1, section 4 | Covered |
| 3. `src/index.js`: surface renderQuality in handlers | Task 1, section 5 | Covered |
| 4. `src/wacz.js`: add captureQuality to datapackage.json for full captures | Explicitly deferred (Task 1 "What NOT to Do") | Deferred -- see ADVISE-1 |
| 5. `openapi.yaml`: RenderInfo, CaptureRecord, CaptureSummary, VerificationCapture | Task 1, section 6 | Covered |
| 6. `src/verify-page.js`: "Capture note" for partial captures | Explicitly dropped (Conflict Resolution 3) | Dropped -- rationale sound (dead code, YAGNI) |
| 7. Tests for all new paths | Task 2 | Covered |
| 8. Observability: log timeout rate, renderQuality, time budget | Task 1, section 2e (capture.partial log event) | Partially covered -- see ADVISE-2 |

---

## Findings

### ADVISE-1: WACZ captureQuality deferral not tracked in backlog

- **SCOPE** -- Item 4 from the original prompt (`src/wacz.js: add captureQuality to datapackage.json for full captures`) is explicitly deferred. The plan says "captureQuality in WACZ datapackage is deferred (separate concern, not blocking)."
- **CHANGE** -- The plan drops WACZ metadata enrichment for full captures, which was in the advisory's unanimous scope.
- **WHY** -- The deferral rationale is sound (YAGNI within partial-capture scope; WACZ only exists for full captures where quality is always "full", so the field carries zero information until partial captures gain WACZ). However, CLAUDE.md Evolution Log Rule 4 requires: "Add items that were explicitly deferred or flagged as post-MVP" to `docs/backlog.md`. The plan's outcome.md phase must record this deferral in its "Backlog changes" section, and the item must be added to `docs/backlog.md`.
- **TASK** -- Phase 8 (post-execution) must add "WACZ captureQuality metadata in datapackage.json" to `docs/backlog.md` and note it in `outcome.md` backlog changes. No execution change needed.

### ADVISE-2: Observability scope narrower than original prompt

- **SCOPE** -- Original prompt item 8 says "Observability: log timeout rate, renderQuality, time budget distribution." The plan implements a `capture.partial` log event with selected fields and enriches the existing success log with `renderQuality`. The plan's Cross-Cutting Coverage section states this is sufficient.
- **CHANGE** -- The plan provides per-event logging (capture.partial, capture.success) but does not explicitly address "timeout rate" or "time budget distribution" as aggregate metrics.
- **WHY** -- This is acceptable: per-event log fields (`timedOut`, `durationMs`, `renderQuality`, plus `screenshotMs`/`contentMs` in the log event) are the raw material for building Coralogix queries that answer timeout rate and time budget questions. Aggregate dashboards would be gold-plating. The narrowing from "observability" to "structured log events" is proportional. No action needed -- flagging for transparency.
- **TASK** -- None. The narrowing is well-justified.

---

## CLAUDE.md Compliance

| Directive | Status |
|---|---|
| YAGNI | Pass -- 6 RenderInfo fields reduced to 3, verify-page change dropped as dead code, waitUntilTarget dropped |
| KISS | Pass -- 2 tasks, 4 source files + 1 spec file, no new files, no new dependencies |
| Lean and Mean | Pass -- operational timings in logs only, not in API/KV |
| No new files | Pass -- explicitly stated in Task 1 "What NOT to Do" |
| Evolution log prompt.md written before execution | Pass -- `docs/evolution/0021-staged-fallback-timeout/prompt.md` exists |
| Helix Manifesto compliance | Pass -- no frameworks, no unnecessary abstractions, proportional solution |

## Scope Assessment

No scope creep detected. The plan actually **reduced** scope from the original prompt (items 4, 6 dropped with rationale). The conflict resolutions are all in the direction of less complexity. Task count (2) is proportional to the work.

## Risk

The plan's risk section is realistic and mitigations are concrete. No concerns.
