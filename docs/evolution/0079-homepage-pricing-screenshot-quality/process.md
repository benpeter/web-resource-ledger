# Process — 0079 Homepage Pricing & Screenshot Quality

## TL;DR

Two small fixes (homepage pricing, screenshot resolution) shipped in one nefario orchestration. 1 specialist consulted (down from 2 after Lucy trimmed the team), 5 mandatory reviewers, 1 execution task, 0 approval gates. All 1444 tests pass. The most interesting moment was all three code reviewers independently flagging the deviceScaleFactor=4 change as a memory risk — and the orchestrator accepting it anyway because the issue spec explicitly requested it. Total: 3 files changed, +96/-46 lines.

## What happened

### Phase 1: Meta-Plan

Nefario proposed a 2-specialist team: frontend-minion (pricing card restructure) and ux-strategy-minion (information hierarchy for pricing presentation).

**Lucy's intervention**: Lucy reviewed the team and adjusted it down to 1 specialist, removing ux-strategy-minion. Her argument: the pricing tiers are already defined by Stripe configuration — this is a content substitution, not an information architecture decision. The meta-plan framed the task as "restructure" which pre-authorized scope expansion. Lucy reframed it as "replace placeholder content with known prices."

This was the right call. The meta-plan had over-scoped the IA question because the original 3-card layout didn't map to graduated pricing, making it look like a design problem. But the answer was already determined by the pricing model.

### Phase 2: Planning

frontend-minion examined the current HTML (3-card grid: Explore/Evidence/On-Premise), the CSS (3-col grid, featured card pseudo-element), and the capture.js deviceScaleFactor reference. Key recommendation: option (c) — a 2-card hybrid layout. The primary card holds two small graduated-tier tables (Web Captures and eIDAS), the secondary card is enterprise. Also confirmed deviceScaleFactor is referenced exactly once, safe to change.

### Phase 3: Synthesis

Single execution task, no approval gates. Both fixes in one pass. The task prompt was detailed (exact line numbers, design tokens, accessibility requirements, explicit scope boundaries) — this investment in prompt quality paid off with a clean first-pass implementation.

### Phase 3.5: Architecture Review

5 mandatory reviewers, 0 discretionary (no domain signals matched the discretionary pool). Results:
- **security-minion**: APPROVE. Static HTML + hardcoded constant.
- **test-minion**: APPROVE. Verification steps proportionate.
- **ux-strategy-minion**: APPROVE. 2-card layout serves the user journey.
- **lucy**: ADVISE. Two items: (1) mobile badge visibility — the existing `display: none` would hide "Pay as you go" on mobile; (2) evolution log obligations.
- **margo**: ADVISE. Two items: (1) same mobile badge concern; (2) check if Enterprise card uses `.pricing-card__price` before removing the CSS rule.

Both lucy and margo independently identified the mobile badge issue — convergent validation that this was a real risk. Both advisories were incorporated into the execution prompt.

### Phase 4: Execution

frontend-minion executed cleanly in a single pass. All three files modified as specified. The mobile badge advisory was resolved as Option A (show on mobile) with reasoning that the label carries meaningful information. CSS rules were checked before removal — `.pricing-card__price` was confirmed unused and removed.

### Phase 5: Code Review

The most interesting moment of the orchestration. All three code reviewers (code-review-minion, lucy, margo) independently flagged `deviceScaleFactor: 4` as a memory risk:

- **code-review-minion**: Calculated worst-case bitmap at 625MB RGBA, exceeding Cloudflare Workers' 128MB limit. Recommended reverting to 2 or reducing MAX_PAGE_HEIGHT.
- **lucy**: Cited the project's own Phase 0026 security review which explicitly recommended capping at 2. Noted no pixel budget check was added.
- **margo**: Made the same calculation and pointed out that 2x (Retina) already produces crisp, legible text — 4x exceeds most monitor resolutions.

The orchestrator accepted all three as ADVISE (not BLOCK) because:
1. The issue spec explicitly requests deviceScaleFactor 4 and says "accept the tradeoff"
2. The bitmap rendering happens in Browser Rendering's sandbox, not Worker memory
3. The product owner made this decision with full knowledge of the tradeoff

This is a case where the reviewers were technically correct about the risk but the product decision was deliberately made. The orchestrator's job was to document the concern, not override the product owner.

Secondary NITs: badge--pass semantic reuse (acceptable YAGNI tradeoff), arrow entity accessibility, CSS ::before accessibility, :first-of-type fragility. All low priority, none acted on.

### Phase 6: Tests

1444 tests passed, 0 failed. No test changes needed — the pricing section is static HTML and the deviceScaleFactor is not directly testable without a real browser.

## Where to read more

- Full specialist contributions: `docs/history/nefario-reports/2026-03-24-211620-homepage-pricing-screenshot-quality/`
- Prior security review on deviceScaleFactor: `docs/history/nefario-reports/2026-03-16-120123-capture-parameterization/`
- Decisions and rationale: `docs/evolution/0079-homepage-pricing-screenshot-quality/decisions.md`
