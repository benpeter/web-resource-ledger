---
task: "Homepage pricing update and screenshot quality"
date: 2026-03-24
source-issue: 186
status: complete
task-count: 1
gate-count: 0
agents: [frontend-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo, code-review-minion]
mode: execution
---

## Summary

Replaced the 3-card "Coming soon" pricing placeholder on the homepage with a 2-card layout showing real Stripe-configured graduated pricing. Usage-based card displays Web Captures (free 200/mo + 3 paid tiers) and eIDAS Timestamps (free 50/mo + paid tier) in semantic HTML tables. Enterprise card retained with contact CTA. Increased Playwright deviceScaleFactor from 2 to 4 for high-resolution screenshots. 1444 tests pass. Code review 3 ADVISE, 0 BLOCK (deviceScaleFactor memory concern accepted per issue spec).

Closes #182, closes #184.

## Original Prompt

Two quick improvements: real pricing on homepage and crisp screenshots.

Fix 1 — Homepage pricing (#182): Replace the "coming soon" placeholder in the homepage pricing section with actual pricing matching the configured Stripe products. Graduated tiers: Captures 1-200/month free, 201-10k at EUR 0.05, 10k-100k at EUR 0.035, 100k+ at EUR 0.015. eIDAS timestamps 1-50/month free, 51+ at EUR 0.10. Free tier allowance must be clearly communicated. Remove all "coming soon" text.

Fix 2 — Screenshot deviceScaleFactor (#184): Increase Playwright screenshot deviceScaleFactor from 2 to 4, accepting the tradeoff of larger file sizes.

## Key Design Decisions

### D1: 2-card hybrid over 3-card plan model
Two cards (usage-based + enterprise) with graduated tier tables. The actual pricing is graduated usage-based, not plan-based. Three cards would misrepresent it as competing plans. A single table would bury the free tier and enterprise option.

### D2: Show "Pay as you go" badge on mobile
Removed the mobile `display: none` override so the `::before` badge shows on all viewports. The label is a pricing model descriptor, not marketing decoration — it carries useful information when evaluating sign-up.

### D3: deviceScaleFactor 4 despite reviewer concerns
All three code reviewers flagged OOM risk on tall pages (prior security review recommended cap at 2). Accepted per issue spec's explicit "accept the tradeoff" directive. Bitmap rendering happens in Browser Rendering's sandbox, not Worker memory. MAX_PAGE_HEIGHT cap bounds worst case.

### D4: Reuse badge--pass for "Free" labels
Used existing green `badge badge--pass` for "Free" labels rather than creating a new `badge--free` variant. YAGNI — works visually, single use case doesn't justify a new class.

## Phases

### Phase 1-2: Planning
1 specialist consulted: frontend-minion (pricing card restructure approach, deviceScaleFactor ripple effect check). Lucy adjusted team from 2 to 1 specialist, removing ux-strategy-minion (prices defined by Stripe config — content substitution, not IA redesign).

### Phase 3: Synthesis
1 execution task, 0 approval gates. Both fixes in one pass across 3 files. Single batch, no dependencies.

### Phase 3.5: Architecture Review
5 mandatory reviewers, 0 discretionary. 3 APPROVE (security-minion, test-minion, ux-strategy-minion), 2 ADVISE (lucy: mobile badge visibility + evolution log; margo: mobile override interaction + conditional CSS cleanup). Both advisories incorporated into execution prompt.

### Phase 4: Execution
1 task, 1 batch, no gates. frontend-minion modified all 3 files in a single pass. Auto-committed.

### Phase 5: Code Review
3 reviewers (code-review-minion, lucy, margo). All ADVISE, 0 BLOCK. Primary finding: deviceScaleFactor 4 OOM risk on tall pages (all three flagged independently). Accepted per issue spec. Secondary NITs: badge--pass semantic reuse, arrow entity accessibility, CSS ::before accessibility, :first-of-type fragility.

### Phase 6: Tests
1444 tests passed, 0 failed, 2 skipped. No regressions.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Phase 8a assessment: 0 items. Pricing is self-documenting on the homepage. No API or architecture changes. Phase 8b: skipped (empty checklist).

## Execution

### Task 1: Update homepage pricing and screenshot scale factor
**Agent**: frontend-minion (sonnet)
**Status**: Complete
**Files**:
| File | Lines | Description |
|------|-------|-------------|
| landing/public/index.html | +55/-27 | 2-card pricing layout with semantic graduated tier tables |
| landing/public/css/landing.css | +40/-18 | 2-col grid, pricing table styles, removed dead rules |
| src/capture.js | +1/-1 | deviceScaleFactor: 2 → 4 |

## Verification

Code review: 3 ADVISE, 0 BLOCK (deviceScaleFactor memory concern accepted per issue spec; badge--pass reuse accepted as YAGNI-appropriate).
Tests: 1444 passed, 0 failed.
Documentation: not applicable (self-documenting content change).

## Agent Contributions

### Planning (Phase 2)
- **frontend-minion**: Recommended 2-card hybrid layout with graduated tier tables. Confirmed deviceScaleFactor change is safe (single reference, no downstream calculations). Identified mobile badge override as deliberate choice point.

### Review (Phase 3.5)
- **security-minion**: APPROVE. No attack surface — static HTML + hardcoded constant.
- **test-minion**: APPROVE. Verification steps proportionate. No unit test coverage needed for static content.
- **ux-strategy-minion**: APPROVE. 2-card layout eliminates false choice complexity; free tier prominence answers primary visitor question.
- **lucy**: ADVISE. Flagged mobile badge visibility (incorporated). Confirmed pricing numbers match Stripe config across all sources.
- **margo**: ADVISE. Flagged conditional CSS cleanup before removing rules (incorporated). Confirmed implementation is proportionate.

<details>
<summary>Session Resources</summary>

### Skills Invoked
- `/nefario` (this orchestration)

### Compaction
0 compaction events.

### Working Files
See companion directory: `docs/history/nefario-reports/2026-03-24-211620-homepage-pricing-screenshot-quality/`

Files: prompt.md, phase1-metaplan.md, phase1-metaplan-rerun.md, phase2-frontend-minion.md, phase3-synthesis.md, phase3.5-{security-minion,test-minion,ux-strategy-minion,lucy,margo}.md, phase4-frontend-minion-prompt.md, and corresponding prompt files.

</details>
