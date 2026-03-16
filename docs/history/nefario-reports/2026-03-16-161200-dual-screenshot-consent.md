---
task: "Dual-screenshot cookie consent dismissal for captures"
date: 2026-03-16
slug: dual-screenshot-consent
source-issue: 58
mode: execution
task-count: 4
gate-count: 0
compaction-events: 0
---

## Summary

Integrated `@duckduckgo/autoconsent` into the WRL capture pipeline to produce dual screenshots per capture: one before (with cookie banner) and one after server-controlled consent dismissal. Both screenshots are stored in R2 and the WACZ bundle, covered by the Ed25519 signature chain via `captureSettings` in `datapackage.json`. The API is backward compatible -- `artifacts.screenshot` always points to the best available image.

## Original Prompt

Issue #58: Every WRL capture produces two screenshots -- one with the cookie banner visible (first-visit state) and one after server-controlled dismissal via DuckDuckGo's autoconsent library -- so that both the banner presence and the underlying page content are preserved as signed evidence artifacts in the WACZ bundle.

## Key Design Decisions

1. **Backward-compatible artifact naming**: Keep `artifacts.screenshot` as primary (best-available), add optional `screenshotBefore`. Zero breaking changes.
2. **No redundant captureSettings WARC record**: Settings live in `datapackage.json` only, automatically covered by signature.
3. **Cosmetic rules disabled**: `enableCosmeticRules: false` prevents misleading evidence.
4. **NAV_TIMEOUT_MS 25s -> 20s**: Gives consent phase 8s budget within 30s total.
5. **No compact rules**: Built-in CMP detectors sufficient. 932KB JSON deferred per YAGNI.

## Phases

### Phase 1: Meta-Plan
Identified 7 specialists: frontend-minion, data-minion, security-minion, api-design-minion, test-minion, ux-strategy-minion, software-docs-minion. Team auto-approved per user directive.

### Phase 2: Specialist Planning
All 7 specialists ran in parallel on opus. Key outputs: autoconsent integration pattern (frontend-minion), WACZ schema extension (data-minion), 12-constraint validation (security-minion), backward-compatible API design (api-design-minion).

### Phase 3: Synthesis
Resolved artifact naming conflict in favor of api-design-minion's additive approach. Produced 4-task execution plan in 3 batches. Zero approval gates.

### Phase 3.5: Architecture Review
6 reviewers: 1 APPROVE (ux-strategy), 5 ADVISE (security, test, accessibility, lucy, margo), 0 BLOCK. Key advisories folded into task prompts: eval msg.code length cap, captureSettings redundancy removal, summary text improvement, timeout message update.

### Phase 4: Execution
- **Batch 1**: Task 1 created consent.js, vendored autoconsent, modified capture pipeline
- **Batch 2**: Task 2 updated WARC/WACZ/KV/API layer; Task 4 extracted test fixtures (parallel)
- **Batch 3**: Task 3 updated verification page with dual screenshot display

### Post-Execution
10 test failures from stale artifact shapes fixed directly. All 474 tests pass. OpenAPI validates.

## Agent Contributions

| Agent | Phase | Recommendation | Risks |
|-------|-------|----------------|-------|
| frontend-minion | planning | autoconsent.playwright.js (168KB), exposeBinding + evaluate, 20s nav + 8s consent budget | exposeBinding may not work on CF; NAV_TIMEOUT reduction |
| data-minion | planning | Two WARC records for before/after, captureSettings in datapackage.json | Schema immutability under signing |
| security-minion | planning | All 12 constraints satisfied; exposeBinding message handler is new trust boundary | Page JS can call binding; eval msg.code needs length cap |
| api-design-minion | planning | Keep screenshot as primary, add screenshotBefore. Zero breaking changes | Semantic shift of screenshot field |
| test-minion | planning | Extract shared fixtures first; renderer injection is right mock boundary | Stub shape mismatch risk |
| ux-strategy-minion | planning | After-screenshot primary, before in disclosure, consent as check row | None critical |
| software-docs-minion | planning | 12 doc tasks across 6 files, OpenAPI bears most weight | None critical |
| security-minion | review | ADVISE: eval handler trust boundary, exposeBinding sequencing, cmpDetected XSS | |
| test-minion | review | ADVISE: stub shape mismatch between tasks | |
| ux-strategy-minion | review | APPROVE | |
| lucy | review | ADVISE: stale timeout message, inconsistent return shape, naming decision | |
| margo | review | ADVISE: drop screenshots booleans, skip captureSettings WARC record | |
| accessibility-minion | review | ADVISE: summary text, consent check detail rendering | |

## Verification

All checks passed. 474 tests pass across 22 test files. OpenAPI spec validates (1 pre-existing warning: CORS preflight missing 4xx).

## Session Resources

### Skills Invoked
- `/nefario` (this orchestration)

### Compaction
0 compaction events (checkpoints skipped per user directive).

## Working Files

All specialist contributions and review verdicts in companion directory:
[2026-03-16-161200-dual-screenshot-consent/](./2026-03-16-161200-dual-screenshot-consent/)
