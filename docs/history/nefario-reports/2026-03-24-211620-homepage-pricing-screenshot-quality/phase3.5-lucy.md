# Lucy Review: homepage-pricing-screenshot-quality

## Verdict: ADVISE

### Requirements Traceability

| User Requirement | Plan Element | Status |
|---|---|---|
| Replace "coming soon" with real pricing matching Stripe config | Task 1 Fix 1: 2-card layout with graduated tier tables | COVERED |
| Pricing numbers match Stripe (captures: 200 free, then 0.05/0.035/0.015; eIDAS: 50 free, then 0.10) | Task prompt tables match CLAUDE.local.md Stripe config exactly | COVERED |
| Free tier clearly communicated | Free rows get visual prominence (bold / badge--pass) | COVERED |
| Remove all "coming soon" text | Task prompt removes both badge--info spans and pricing-note paragraph | COVERED |
| deviceScaleFactor from current to 4 | Task 1 Fix 2: single-line change in src/capture.js line 454 | COVERED |
| Accept file size tradeoff | Risk #2/#3 acknowledge tradeoff, no mitigation attempted | COVERED |
| Text in captured screenshots is clearly legible | Implied by 4x scale factor; no explicit verification step | GAP (minor) |
| No visual regressions on homepage (mobile + desktop) | Verification steps 1, 4 cover this | COVERED |
| Scope exclusions (Stripe code, billing, pricing logic, compression) | "What NOT to do" section explicitly lists all four | COVERED |

### Findings

**1. SCOPE: 2-card layout is a design decision beyond the request, but justified**

- CHANGE: The plan replaces the 3-card pricing grid (Explore/Evidence/Enterprise) with a 2-card layout (Usage-Based/Enterprise). The user did not specify card count or layout restructuring.
- WHY: The user asked to "replace the coming soon placeholder with actual pricing." The plan's decision to restructure from 3 cards to 2 is a design choice, not a user requirement. However, the rationale is sound -- the actual pricing model is graduated usage-based, not plan-based, so 3 cards (implying 3 plans) would misrepresent the product. The Decisions section documents this with alternatives considered. This is proportional design judgment, not scope creep.
- No action needed; documenting for traceability.

**2. COMPLIANCE: Evolution log obligations are not in the plan's task list**

- CHANGE: The plan has a single task assigned to frontend-minion. The CLAUDE.md Evolution Log Rules require: (1) `decisions.md` written during the phase, (2) `outcome.md` after the phase, (3) backlog review + update, (4) index update in `docs/evolution/README.md`, (5) `process.md` after PR creation.
- WHY: The evolution directory `0079-homepage-pricing-screenshot-quality` exists with `prompt.md` populated (Rule 1 satisfied). But the plan does not mention writing `decisions.md`, `outcome.md`, updating the backlog, updating the evolution index, or writing `process.md`. These are CLAUDE.md-mandated post-phase obligations. The plan's Cross-Cutting Coverage section says "Documentation: Not needed" but that refers to API/architectural docs, not evolution logs. The Precedence section of CLAUDE.md is explicit: "Skills do not override, shadow, or deprioritize project instructions."
- TASK: The calling session (nefario or the orchestrator) must ensure evolution log deliverables are produced after execution. This is not a frontend-minion responsibility but it must not be omitted.

**3. CONVENTION: Mobile override for featured card badge needs attention**

- CHANGE: The plan changes `.pricing-card--featured::before` content from "Recommended" to "Pay as you go" (line 475). The existing mobile override at line 724 sets `display: none` on this pseudo-element, hiding the badge on mobile.
- WHY: On mobile, the "Pay as you go" badge will be hidden entirely. The user's request says "Free tier allowance must be clearly communicated." If the "Pay as you go" label is important context for the usage-based pricing card, hiding it on mobile may degrade the pricing story. This is a minor concern since the card heading can carry the label, but the task prompt should note this existing mobile behavior so the frontend-minion can make an informed choice (keep `display: none`, or show the badge on mobile too).
- TASK: Add a note to the task prompt about the mobile `display: none` override at line 724 so the implementer explicitly decides whether to keep or remove it for the new label.

### What Looks Good

- Pricing numbers are verified against three independent sources (user request, CLAUDE.local.md Stripe config, plan task prompt) -- all match exactly.
- Scope containment is tight: 3 files, exhaustive "What NOT to do" list, no JS additions, no framework usage (matches CLAUDE.md vanilla-first preference).
- The plan correctly identifies that no new tests are needed (HTML/CSS content + one constant), consistent with the project's "test the real boundaries" philosophy -- there are no new external boundaries here.
- Single-task, single-batch execution is proportional to the problem. No over-engineering.
- The plan references existing design tokens rather than inventing new CSS values -- consistent with the project's design system.
