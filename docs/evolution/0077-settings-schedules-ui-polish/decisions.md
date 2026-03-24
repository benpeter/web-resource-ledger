# Decisions — 0077 Settings & Schedules UI Polish

## Team Composition

**Decision**: Single specialist (frontend-minion) instead of the initial 3-agent proposal.

Lucy reviewed the initial team (frontend-minion, ux-strategy-minion, software-docs-minion) and recommended dropping ux-strategy-minion and software-docs-minion. Rationale: pure CSS alignment work doesn't need UX strategy review ("should these panels look the same?" is already answered by the issue), and CSS changes have zero documentation surface.

## Task Consolidation

**Decision**: Consolidate 7 proposed tasks into 2 execution tasks.

Frontend-minion's planning contribution proposed 7 separate tasks. Nefario synthesis consolidated them into 2:
- Task 1: All CSS additions in `ui-css.js` (combined tasks 1-5 from planning)
- Task 2: Billing DOM cleanup in `ui-billing.js` (task 6 from planning)

Rationale: All CSS changes target the same file with no conflicting concerns. Splitting into 7 tasks creates unnecessary overhead with zero parallelism benefit.

## formatPeriod Exclusion

**Decision**: Exclude the `formatPeriod()` duplication investigation (planning task 7).

Synthesis verified that `ui-settings.js` (which defines `formatPeriod`) is concatenated before `ui-billing.js` in `ui-shell.js` (line 54 vs line 57). The function is always available when billing calls it. No runtime bug exists.

## Billing Inner Div Removal

**Decision**: Remove the inner wrapper `<div>` entirely, not just the inline padding.

Over: Only removing `inner.style.padding` while keeping the wrapper div. Once the card has CSS padding, the inner div serves no purpose -- no class, no other styles, no semantic role. Removing it simplifies the DOM.

## Dead CSS Cleanup

**Decision**: Remove both `.settings-section-title` and `.settings-scope-label`.

Both were dead CSS -- `.settings-section-title` was never used (JS uses `.settings-section-heading`), and `.settings-scope-label` was used as an `id` not a `className`. Replaced/removed alongside adding the correct rules.
