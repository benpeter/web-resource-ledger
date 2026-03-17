---
task: "Fix autoconsent injection timing for late-loading CMP iframes"
date: 2026-03-17
source-issue: 81
mode: execution
task-count: 1
gate-count: 0
agents: [frontend-minion, debugger-minion, edge-minion, test-minion, security-minion, ux-strategy-minion, lucy, margo]
---

## Summary

Added `page.on('framenavigated')` listener to consent.js so autoconsent is injected into CMP iframes that load after the initial `page.frames()` snapshot. This fixes OneTrust detection on sites like CNN and Reuters where the CMP iframe is injected by JavaScript after the page load event. Confirmed via 14-site staging validation: 2 new OneTrust successes (CNN, Reuters), 3 Sourcepoint detections maintained (opt-out fails due to known selector mismatch -- backlog item), no regressions.

## Original Prompt

Refinement on PR #82: fix autoconsent injection timing for late-loading CMP iframes. Root cause: `page.frames()` called once at injection time, missing lazy-loaded iframes.

## Key Design Decisions

1. **framenavigated over frameattached**: frontend-minion traced @cloudflare/playwright source and confirmed execution context is only ready at navigation commit, not attachment.
2. **Set dedup + MAX_INJECTED_FRAMES=50 cap**: security-minion recommended bounding frame injection count to prevent throughput degradation from hostile pages.
3. **Sourcepoint opt-out deferred**: debugger-minion diagnosed as selector mismatch (autoconsent 14.59.0 vs current Sourcepoint SDK). Requires vendored script update -- backlog item.

## Phases

### Phase 1-3: Planning and Synthesis

4 specialists: frontend-minion (frame event design), debugger-minion (Sourcepoint diagnosis), edge-minion (Workers compatibility), test-minion (validation strategy). Single-task plan: add framenavigated listener to both consent.js code paths.

### Phase 3.5: Architecture Review

7 reviewers (5 mandatory + frontend-minion + edge-minion). 5 APPROVE, 2 ADVISE. Key advisories: frame cap (security), named function for page.off (frontend), YAGNI on active flag (margo).

### Phase 4: Execution

Single task: added framenavigated listener with Set dedup, MAX_INJECTED_FRAMES cap, about:blank/javascript: URL filtering, try/finally cleanup. ~25 lines additive.

### Phase 5-8

Tests: 503 pass. Code review: incorporated during implementation (advisories from Phase 3.5). Documentation: evolution log and backlog updated.

## Staging Validation (14 sites)

| Site | Consent | CMP | Notes |
|------|---------|-----|-------|
| cnn.com | **success** | **Onetrust** | 204ms |
| reuters.com | **success** | **Onetrust** | 500ms |
| theguardian.com | failed | Sourcepoint-frame | Selector mismatch |
| spiegel.de | failed | Sourcepoint-frame | Selector mismatch |
| zeit.de | failed | Sourcepoint-frame | Selector mismatch |
| nytimes.com | notDetected | none | Different OneTrust variant |
| bbc.co.uk | notDetected | none | No CMP |
| yahoo.com | notDetected | none | No CMP or geo-gated |
| microsoft.com | notDetected | none | No CMP or geo-gated |
| lemonde.fr | notDetected | none | Geo-gated |
| stackoverflow.com | notDetected | none | No CMP |
| github.com | notDetected | none | No CMP |
| sap.com | capture failed | n/a | Subresource limit |
| amazon.de | capture failed | n/a | Subresource limit |

## Verification

Verification: all tests pass (503/503). Staging validated against 14 sites.

## Backlog Changes

- **Done:** `[should] Inject autoconsent into late-loading CMP iframes`
- **Added:** `[should] Update vendored autoconsent to fix Sourcepoint opt-out` (selector mismatch)

## Working Files

All working files in [2026-03-17-005722-late-loading-cmp-iframes/](./2026-03-17-005722-late-loading-cmp-iframes/).
