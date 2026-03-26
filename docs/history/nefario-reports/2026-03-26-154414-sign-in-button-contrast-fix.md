---
source-issue: 225
source-issue-title: "Landing page header: Sign-in button text unreadable (CSS specificity bug)"
slug: sign-in-button-contrast-fix
phase: "0094"
date: "2026-03-26"
branch: nefario/sign-in-button-contrast-fix
task-count: 1
gate-count: 0
mode: execution
---

# Nefario Execution Report: Sign-in Button Contrast Fix

## Original Prompt

Fix the "Sign in" button in the landing page header which has unreadable text. The text renders as dark gray on a dark navy background — roughly 2.5:1 contrast ratio, well below WCAG AA 4.5:1. The `.site-header nav a` rule overrides `.btn--primary` color due to CSS specificity. Affects all 7 landing pages.

## Summary

Fixed a CSS specificity bug where `.site-header nav a` (specificity 0,1,2) overrode `.btn--primary` (0,1,0), rendering the Sign-in button text as dark gray (#6e6a66) on dark navy (#2a3444). Applied `:not(.btn)` exclusion to three nav link selectors and added a `:visited` guard — a total of +5 lines in one CSS file.

## Outcome

- **Branch**: `nefario/sign-in-button-contrast-fix`
- **Commits**: 1
- **Files changed**: 1 (`landing/public/css/landing.css`, +5 lines net)
- All 7 landing pages fixed (shared CSS)

| State | Before | After | WCAG AA |
|-------|--------|-------|---------|
| Default | ~2.5:1 | ~11.8:1 | PASS |
| Hover | Broken (nav hover overrode btn) | ~14.0:1 | PASS |
| Focus-visible | ~2.5:1 | ~11.8:1 | PASS |
| Visited | Browser default risk | ~11.8:1 | PASS |

## Key Design Decisions

### Exclusion approach over override approach
- **Chosen**: `:not(.btn)` on `.site-header nav a` selectors
- **Over**: Adding ~15 lines of `.site-header nav .btn--primary` override rules (accessibility-minion)
- **Why**: Fixes root cause — nav link styles should never apply to buttons. Fewer lines, handles all pseudo-class states automatically, no coupling to button variant class names.

### Include :visited guard
- **Chosen**: `.site-header nav .btn--primary:visited { color: var(--color-primary-text); }`
- **Over**: No :visited rule
- **Why**: Browser-default visited purple against dark button background computes to ~1.14:1 — effectively invisible. The auth URL will be in browser history for returning users.

## Phases

### Phase 1: Meta-Plan
Identified 2 specialists: accessibility-minion (WCAG compliance verification) and frontend-minion (CSS approach evaluation). Team approved by Lucy.

### Phase 2: Specialist Planning
- **accessibility-minion**: Discovered 3 broken states (not just 1). Recommended override approach with ~15 lines + :visited rule.
- **frontend-minion**: Recommended `:not(.btn)` exclusion — 3 selector modifications, fixes root cause.

### Phase 3: Synthesis
Resolved approach conflict: chose exclusion (frontend-minion) over override (accessibility-minion). Incorporated :visited guard from accessibility-minion's analysis.

### Phase 3.5: Architecture Review
6 reviewers (security, test, ux-strategy, lucy, margo, accessibility): all APPROVE. No blocks, no advisories requiring plan changes.

### Phase 4: Execution
Single task executed by frontend-minion. 3 selectors modified, 1 :visited rule added, 1 comment added. No approval gates.

### Phase 5: Code Review
3 reviewers: code-review-minion (APPROVE), margo (APPROVE), lucy (ADVISE — evolution log incomplete, addressed in wrap-up).

### Phase 6: Tests
Skipped. CSS-only change — per project testing discipline.

### Phase 7: Deployment
Skipped. Not requested.

### Phase 8: Documentation
Phase 8a: 0 documentation items identified. Phase 8b: skipped (empty checklist).

## Agent Contributions

### Planning Agents

| Agent | Role | Key Contribution |
|-------|------|-----------------|
| accessibility-minion | WCAG compliance | Discovered 3 broken states; identified :visited edge case |
| frontend-minion | CSS approach | Recommended :not(.btn) exclusion — cleaner root-cause fix |

### Review Agents

| Agent | Phase | Verdict |
|-------|-------|---------|
| security-minion | 3.5 | APPROVE |
| test-minion | 3.5 | APPROVE |
| ux-strategy-minion | 3.5 | APPROVE |
| lucy | 3.5, 5 | APPROVE, ADVISE |
| margo | 3.5, 5 | APPROVE |
| accessibility-minion | 3.5 | APPROVE |
| code-review-minion | 5 | APPROVE |

## Verification

Verification: code review passed (3 reviewers, 1 ADVISE on evolution log — addressed). Tests: not applicable — CSS-only change.

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration

</details>

<details>
<summary>Working Files</summary>

[Companion directory](./2026-03-26-154414-sign-in-button-contrast-fix/)

Files:
- `prompt.md` — original task description
- `phase1-metaplan-prompt.md`, `phase1-metaplan.md` — meta-plan
- `phase2-accessibility-minion-prompt.md`, `phase2-accessibility-minion.md` — accessibility planning
- `phase2-frontend-minion-prompt.md`, `phase2-frontend-minion.md` — frontend planning
- `phase3-synthesis-prompt.md`, `phase3-synthesis.md` — delegation plan
- `phase3.5-*-prompt.md`, `phase3.5-*.md` — architecture review verdicts
- `phase4-frontend-minion-prompt.md` — execution prompt
- `phase8-checklist.md` — documentation assessment

</details>

Resolves #225
