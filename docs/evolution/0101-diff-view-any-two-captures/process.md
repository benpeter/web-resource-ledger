# Process: Phase 0106 -- Diff View for Any Two Captures

## TL;DR

Five specialist agents planned the feature in ~3 minutes, four reviewers
approved with one ADVISE note, and execution produced 4 commits across
7 files. The core discovery: `changeSummary` was already stored in D1 but
never surfaced in the API, making the existing "Compare with previous"
link dead code. The fix was backend-trivial (2 conditional fields in
responses) but required a new UI component (capture picker with lazy
loading, pagination, and accessibility). All 1668 tests pass.

## Team

### Phase 2 Specialists (Planning)

- **frontend-minion**: Designed the capture picker UI component. Proposed
  the inline expandable pattern over modal/dropdown, identified the need
  for client-side exact URL filtering since the API uses prefix matching.

- **feature-dev:code-explorer**: Deep-dived the existing codebase. Found
  that `changeSummary` was computed and stored in D1 but never included in
  API responses. Mapped the data flow from `computeChangeSummary` through
  `db.js` `rowToCapture` to the missing projection in `handleGetCapture`.
  This finding shaped the entire backend approach.

- **accessibility-minion**: Provided ARIA guidance. Initially suggested
  full listbox pattern (`role="listbox"`, `role="option"`, arrow key
  navigation) but this was simplified during synthesis.

- **ux-strategy-minion**: Recommended the single-selection model (current
  capture = implicit target, user picks base). This resolved the "how do
  users pick two captures?" question elegantly.

- **api-spec-minion**: Flagged that `changeSummary` needed to be added to
  the OpenAPI spec since it was being returned but undocumented.

### Phase 3.5 Reviewers

- **lucy**: APPROVE. Confirmed plan matches issue intent.
- **margo**: ADVISE. Pushed back on the ARIA listbox pattern as
  over-engineering -- a plain list of links is semantically correct for
  navigation. This was adopted.
- **gru**: APPROVE. No technology concerns.
- **security-minion**: APPROVE. Confirmed no injection vectors since all
  DOM is built via createElement/textContent.

## Key Disagreements and Resolutions

### ARIA listbox vs plain links

accessibility-minion proposed `role="listbox"` with arrow key navigation.
margo argued this was over-engineering since each item is a navigation
link, not a selection widget. Synthesis sided with margo: plain
`<ul>/<li>/<a>` is semantically correct and requires no custom keyboard
handling. The toggle button still uses `aria-expanded`/`aria-controls`
for the disclosure pattern.

### Quick-compare link placement

frontend-minion wanted the quick-compare link inside the picker. Synthesis
placed it outside (above the toggle) so it's always visible without
expanding the full list. This serves the common case (compare with
previous scheduled capture) without requiring the picker.

## Code Review Findings

The code-reviewer agent found three issues:

1. **Edge case: only current capture after filtering** (fixed). When all
   captures in the response match the current ID, the picker showed "0
   captures available" but left the toggle visible. Added a post-filter
   check to hide the section.

2. **Missing .catch() on res.json()** (fixed). The JSON parse promise had
   no error handler, violating the "fail loudly" principle. Added a catch
   that shows "Could not load captures."

3. **Non-canonical schedule ID in test** (fixed). The test used
   `'sched_test123'` which doesn't match the `sch_[a-f0-9]{32}` pattern
   and also violated the FK constraint. Fixed by seeding a proper schedule
   record first.

## Human Interventions

This phase ran in fully autonomous mode with no human intervention.
Lucy agent handled all gate decisions.

## Where to Read More

- Specialist contributions: scratch directory (session-local, cleaned up)
- Evolution log: `docs/evolution/0106-diff-view-any-two-captures/`
- Backlog update: `docs/backlog.md` (line 163, scheduled capture
  change detection marked done)
