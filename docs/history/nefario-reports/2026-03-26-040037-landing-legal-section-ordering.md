---
task: "Review landing page legal claims placement and section ordering"
source-issue: 207
date: 2026-03-26
status: complete
agents: [ux-strategy-minion, ux-design-minion, product-marketing-minion, security-minion, test-minion, accessibility-minion, lucy, margo]
task-count: 2
gate-count: 0
mode: execution
---

## Summary

Reordered the WRL landing page sections: Use Cases now appears before How It Works, leading with outcomes before mechanism. Rejected adding a trust bar with legal standard references — the section reorder already moves legal proof points (FRE 901/902, eIDAS) closer to the top of the page without narrowing perceived audience. Lighthouse verification passed: performance 100, accessibility 96.

## Original Prompt

The landing page presents legal/compliance claims and the "how this works" section in the most effective order, ensuring legal claims are prominent enough to build trust without overwhelming the initial impression.

Success criteria:
- Decision documented on whether legal claims belong in hero banner or below
- Decision documented on whether "how this works" should move below other sections
- Changes implemented if warranted
- Landing page still passes Lighthouse performance and accessibility checks

## Key Design Decisions

1. **No trust bar** — Legal citations (FRE 901/902, eIDAS) are meaningful to only 2 of 6 priority segments. Adding them to the hero or a trust strip risks repositioning WRL as a "legal compliance tool" rather than "web evidence infrastructure." The section reorder addresses the timing concern without a dedicated element.

2. **Use Cases above How It Works** — Unanimous specialist agreement. Outcomes ("why should I care?") before mechanism ("how does it work?") follows JTBD principles and serves all audience segments better.

3. **Legal Evidence card content preserved** — The detailed FRE/eIDAS bullet list stays as-is. It serves its target audience (legal professionals) effectively. Removing specificity to reduce visual density would weaken the card for its intended readers.

## Execution

### Task 1: Reorder sections and update nav
- **Agent**: frontend-minion (sonnet)
- **Outcome**: Section order changed to Hero → Use Cases (white) → How It Works (muted) → Pricing (white). Nav links reordered to match.
- **Files**: `landing/public/index.html` (modified)

### Task 2: Lighthouse verification
- **Outcome**: Performance 100, Accessibility 96. Both above thresholds (90, 95).

## Verification

Verification: Lighthouse passed (performance 100, accessibility 96). Code review: not applicable — single HTML section reorder, 6 reviewers pre-approved plan. Tests: not applicable — no code logic changes.

## Agent Contributions

### Planning (Phase 2)

| Agent | Recommendation | Key Insight |
|-------|---------------|-------------|
| ux-strategy-minion | Trust bar + section reorder | Progressive disclosure: signal legal vocabulary early, detail later |
| ux-design-minion | Trust strip with shield icons | Compact horizontal badges for compliance references |
| product-marketing-minion | Section reorder only, no trust bar | Legal jargon narrows perceived audience for 4 of 6 segments |

### Review (Phase 3.5)

All 6 reviewers APPROVED: security-minion, test-minion, ux-strategy-minion, lucy, margo, accessibility-minion.

## Decisions

### Trust bar rejected
- **Chosen**: No trust bar. Legal references stay in Use Cases card only.
- **Over**: Trust strip below hero with compact standard badges (ux-strategy-minion, ux-design-minion)
- **Why**: Legal citations meaningful to only 2/6 segments. Section reorder moves legal content closer to top without narrowing audience.

### Legal Evidence card preserved
- **Chosen**: Keep detailed FRE/eIDAS bullet list.
- **Over**: Simplify to narrative only (ux-design-minion)
- **Why**: Specific rule references are the card's core value for legal professionals.

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-26-040037-landing-legal-section-ordering/`

Files: prompt.md, phase1-metaplan.md, phase2-ux-strategy-minion.md, phase2-ux-design-minion.md, phase2-product-marketing-minion.md, phase3-synthesis.md, phase3.5-*.md (6 reviewer verdicts), plus all -prompt.md files.

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration workflow

</details>

Resolves #207
