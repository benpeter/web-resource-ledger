# Process: Phase 0025 -- Dual-Screenshot Cookie Consent

## TL;DR

Seven specialists planned in parallel, nefario synthesized into 4 execution tasks,
6 architecture reviewers returned 1 APPROVE + 5 ADVISE (0 BLOCK). Execution
completed in 3 sequential batches. All 474 tests pass. Key conflict: artifact
naming (data-minion vs api-design-minion) resolved in favor of backward
compatibility. margo caught two redundancies that simplified the final design.

## Planning Phase (Phases 1-2)

### Meta-Plan

Nefario identified 7 specialists: frontend-minion (autoconsent integration),
data-minion (WACZ/WARC schema), security-minion (12-constraint validation),
api-design-minion (API evolution), test-minion (test strategy), ux-strategy-minion
(verification page UX), software-docs-minion (documentation plan).

All 7 ran in parallel on opus. No second-round specialists were requested.

### Specialist Contributions

**frontend-minion** provided the most concrete technical guidance: identified
`dist/autoconsent.playwright.js` (168KB) as the correct bundle path, recommended
`page.exposeBinding()` + `page.evaluate()` post-navigation integration, and
proposed reducing NAV_TIMEOUT_MS from 25s to 20s to give the consent phase its
8s budget. This agent had prior context from Phase 0017 where it evaluated
four consent approaches.

**data-minion** designed the WACZ/WARC extension: two separate WARC resource
records for before/after screenshots, `captureSettings` as a top-level field
in `datapackage.json`, and a captureSettings WARC metadata record. It also
proposed the URI scheme `urn:wrl:screenshot:before:{url}` / `after:{url}`.

**security-minion** validated all 12 Phase 0017 constraints and identified the
key new trust boundary: `page.exposeBinding()` creates a callable that any
JavaScript on the page can invoke, not just the autoconsent library. Recommended
message type allowlisting and `msg.code` length cap (2048 bytes).

**api-design-minion** proposed the backward-compatible approach: keep
`artifacts.screenshot` as the primary (best-available), add optional
`screenshotBefore`. This directly conflicted with data-minion's approach
of replacing `screenshot` with `screenshotBefore`/`screenshotAfter`.

**test-minion** flagged that `stubRenderer` was duplicated in 4 test files and
recommended extracting shared fixtures first. Also warned about stub shape
mismatches between the planned fixture stubs and the actual `dismissCookieConsent()`
return type.

**ux-strategy-minion** designed the verification page UX: after-screenshot as
primary (full width), before-screenshot in a `<details>` disclosure, consent
status as a check row using the existing pass/skip pattern. No "degraded"
language for failed consent.

**software-docs-minion** identified 12 documentation tasks across 6 files,
correctly noting that OpenAPI bears the most documentation weight.

## Synthesis (Phase 3)

### Conflict Resolution

The central conflict was **artifact naming**: data-minion wanted to replace
`screenshot` with `screenshotBefore`/`screenshotAfter` (clean break), while
api-design-minion wanted to keep `screenshot` as-is and add `screenshotBefore`
(additive). Nefario resolved in favor of api-design-minion -- zero breaking
changes, existing consumers unaffected.

Other resolutions:
- **Cosmetic rules**: disabled per security-minion (misleading evidence)
- **Compact rules**: deferred per YAGNI (built-in detectors cover major CMPs)
- **captureSettings schema**: merged api-design-minion's simpler structure
  with data-minion's `version` field

### Task Decomposition

4 tasks in 3 batches:
1. Autoconsent integration + renderer changes (creates the new pipeline)
2. WARC/WACZ/KV/API layer + test fixtures (parallel; adapts data layer and tests)
3. Verification page (depends on API response shape from Task 2)

## Architecture Review (Phase 3.5)

6 reviewers (5 mandatory + accessibility-minion discretionary). All returned
within ~3 minutes. Results:

- **ux-strategy-minion**: APPROVE. Confirmed journey coherence and zero cognitive load delta.
- **test-minion**: ADVISE. Flagged stub shape mismatch between Task 1's return type
  and Task 4's planned fixture stubs (`status: 'timeout'` with different field sets).
- **accessibility-minion**: ADVISE. Recommended more descriptive `<summary>` text
  ("Show screenshot before consent dismissal") and flagged a subtle bug where the
  consent check detail wouldn't be populated because `populate()` only iterated
  the original checks array.
- **margo**: ADVISE. Caught two redundancies: (1) `captureSettings.screenshots`
  booleans derivable from existing fields, (2) separate WARC record for captureSettings
  duplicates what's already in `datapackage.json`. Also flagged undescribed
  `exposeBinding` fallback.
- **lucy**: ADVISE. Noted stale "25 seconds" error message in `categorizeError()`,
  inconsistent return shape from `dismissCookieConsent()`, and that the artifact
  naming deviation from the issue should be documented.
- **security-minion**: ADVISE. Identified `eval` message handler as a trust boundary
  (page JS can call the binding), recommended `msg.code` length cap. Flagged
  `cmpDetected` as XSS surface requiring textContent in verify-page.

All ADVISE notes were folded into the execution task prompts before spawning.

## Execution (Phase 4)

### Batch 1: Task 1 (autoconsent integration)

frontend-minion (sonnet) executed cleanly. Created `src/consent.js` with
the full message protocol handler, `page.exposeBinding()` with polling fallback,
strict message type allowlist, and 8s hard timeout. Modified `defaultRenderer()`
for the dual-screenshot pipeline. Introduced 36 expected test failures from
the interface changes.

### Batch 2: Tasks 2 + 4 (parallel)

frontend-minion (Task 2) updated the entire data layer: warc.js, wacz.js,
kv.js, index.js, openapi.yaml. The agent correctly dropped the redundant
`screenshots` sub-object and captureSettings WARC record per margo's review.

test-minion (Task 4) extracted shared fixtures from 4 test files into
`test/fixtures.js` and created consent-aware renderer stubs. Reduced failures
from 36 to 10.

### Batch 3: Task 3 (verification page)

frontend-minion updated verify-page.js with all accessibility review
recommendations: descriptive summary text, textContent for all captureSettings
values, consent check in checks list, dual screenshot display with disclosure.

### Post-Execution Fixes

10 remaining test failures were caused by tests still passing the old
`{ screenshot: PNG_BYTES }` artifact shape to `buildWacz()` / `buildWarc()`.
Fixed by updating to `{ screenshotBefore: PNG_BYTES, screenshotAfter: null }`.
Also updated "25 seconds" assertions to "20 seconds". All 474 tests pass.

## Human Interventions

No human interventions during this orchestration. All approval gates were
auto-approved per user directive ("skip all approval gates -- defer decisions
to gru and lucy"). Compaction checkpoints were also skipped.

The user's directive to auto-approve gates was appropriate for this issue:
the scope was well-defined by the Phase 0017 advisory, the success criteria
were concrete, and there were no ambiguous architectural decisions requiring
human judgment.

## What Was NOT Changed

- No changes to `src/signing.js`, `src/cdxj.js`, `src/canonical-json.js` --
  the signature chain works without modification
- No migration of existing R2 objects or KV records
- No compact rules JSON (932KB) -- deferred per YAGNI
- No changes to the `POST /v1/captures` request body -- dual screenshots
  happen automatically with no caller parameters

## Where to Read More

- Advisory report: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization.md`
- 12 security constraints: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization/phase2-security-minion.md`
- Nefario report: `docs/history/nefario-reports/` (companion directory has all
  specialist contributions and review verdicts)
