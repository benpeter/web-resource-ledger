# Process: Sign-in Button Contrast Fix

## TL;DR

A 9-phase nefario orchestration for a 5-line CSS fix. Two specialists disagreed on approach (override vs exclusion), synthesis resolved in favor of the root-cause fix, 6 reviewers unanimously approved, and a single frontend-minion execution task delivered the change. Total: 1 file changed, ~11.8:1 contrast ratio restored across all 4 button states, all 7 landing pages fixed.

## What Happened

### Planning (Phases 1-3)

Nefario's meta-plan identified two specialists for a CSS specificity bug: **accessibility-minion** (WCAG compliance) and **frontend-minion** (CSS approach). This was the minimum viable team — the bug has exactly two dimensions (correct CSS technique and accessibility compliance).

The two specialists produced conflicting approaches:

**accessibility-minion** recommended an **override approach**: add ~15 lines of `.site-header nav .btn--primary` + pseudo-class variants to win the specificity battle. This is the "add more CSS" approach — correct but symptomatic.

**frontend-minion** recommended an **exclusion approach**: modify the 3 existing `.site-header nav a` selectors to add `:not(.btn)`. This stops the nav link styles from applying to buttons at all — a root-cause fix in fewer lines.

The synthesis chose the exclusion approach. The decisive argument: accessibility-minion's own risk assessment recommended refactoring to `:not(.btn)` as a future improvement — so the exclusion approach was the one both specialists ultimately agreed on, just with different timelines.

The synthesis also incorporated one element from accessibility-minion that the exclusion approach alone wouldn't cover: a `:visited` guard rule. The `:not(.btn)` exclusion prevents nav link styles from applying, but doesn't prevent browser-default visited-link coloring. Since the auth URL will be in browser history for returning users, the 3-line defensive rule was worth adding.

### Architecture Review (Phase 3.5)

6 reviewers (5 mandatory + accessibility-minion as discretionary) all returned APPROVE. No blocks, no advisories requiring plan changes. The accessibility-minion independently verified contrast ratios and confirmed the `:visited` edge case analysis. Margo confirmed the fix was proportional — no over-engineering.

### Execution (Phase 4)

One task, one agent (frontend-minion on sonnet), one file. The execution was straightforward: 3 selector modifications, 1 new rule, 1 comment. No approval gates were needed — the change is trivially reversible and has zero downstream dependents.

### Post-Execution (Phases 5-8)

Code review by 3 agents (code-review-minion, lucy, margo): 2 APPROVE, 1 ADVISE. Lucy's ADVISE flagged incomplete evolution log — expected since those files are written during wrap-up.

Tests: skipped per project discipline for CSS-only changes.
Documentation: Phase 8a found 0 items. Phase 8b skipped.

## Where Specialists Disagreed

The only disagreement was the fix approach:

| Position | Agent | Argument |
|----------|-------|----------|
| Override | accessibility-minion | Explicit is better; override rules document exactly what the button should look like in each state |
| Exclusion | frontend-minion | Fix the root cause; nav styles should never have applied to buttons; fewer lines; automatically handles all states |

The exclusion approach won because it addresses the root cause, is more maintainable (adding a new button variant doesn't require updating override rules), and was acknowledged by both specialists as the better long-term approach.

## Human Interventions

This was an autonomous orchestration (no human at the gates). Lucy served as the gate decision-maker per the autonomous mode protocol. All gates were approved without adjustment:
- Team approval: approved as-is (2 specialists)
- Reviewer approval: approved as-is (5 mandatory + 1 discretionary)
- Execution plan: approved as-is (1 task, 0 gates)

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-26-154414-sign-in-button-contrast-fix/phase2-*.md`
- Delegation plan: `docs/history/nefario-reports/2026-03-26-154414-sign-in-button-contrast-fix/phase3-synthesis.md`
- Review verdicts: `docs/history/nefario-reports/2026-03-26-154414-sign-in-button-contrast-fix/phase3.5-*.md`
