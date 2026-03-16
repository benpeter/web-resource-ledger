# Process: 0029-load-settle-strategy

## TL;DR

Two planning specialists, five architecture reviewers, and one execution agent
turned a well-scoped issue (#67) into a 4-file, +38/-26 line change in about
25 minutes of agent time. The interesting moment: both specialists independently
flagged that the issue's suggested NAV_TIMEOUT_MS value (25s) would break the
30s budget ceiling -- the synthesis resolved this by keeping 20s with documented
justification. Security review caught a real gap (post-settle size limit bypass)
that wasn't in anyone's plan.

## Which specialists were consulted and why

**Phase 1 (Meta-plan)**: Nefario identified this as a narrow timing change in a
single source file (`src/capture.js`) with mechanical test and spec updates.
Selected only two specialists:

- **debugger-minion**: Core question was a runtime performance problem -- choosing
  the right settle mechanism for ad-heavy pages. Three options existed
  (`waitForTimeout`, `waitForLoadState('networkidle')` with short timeout, custom
  idle detection) with real tradeoffs.
- **test-minion**: The `networkidle` string appeared in 5 test locations across
  2 files. Needed systematic identification of all assertion updates and a
  judgment call on whether the settle delay warranted its own test coverage.

No other specialists were selected for planning. The exclusion rationale was
explicit: security, observability, docs, and UX agents would participate in
Phase 3.5 review, but adding them to planning would not materially improve the
plan for this narrowly-scoped change.

## What each specialist argued

**debugger-minion** recommended `page.waitForTimeout(3000)` (Option A, plain
timer) over the alternatives. The key argument: Option B
(`waitForLoadState('networkidle')` with a 3s timeout) would throw a
`TimeoutError` on ad-heavy sites when the 3s settle expired, and this error
could leak into the staged fallback's catch block at line 405. The staged
fallback catches `TimeoutError` by name and attempts partial capture -- a
settle-phase timeout would trigger partial capture logic for a page that
actually loaded successfully. This was the strongest technical argument in
the planning phase.

debugger-minion also flagged the budget overrun: NAV_TIMEOUT_MS at 25s creates
a worst case of 25 + 3 + 8 + 2 = 38s, exceeding the 30s hard limit.

**test-minion** completed the fixture audit: 3 renderers in `fixtures.js`,
1 inline renderer and 1 assertion in `capture.test.js`, plus 4 error message
assertions that would stay unchanged since NAV_TIMEOUT_MS stays at 20s. The
key judgment: no new renderer variant for the settle delay. The settle is an
implementation detail that doesn't surface in the renderer's output contract
(`{ screenshot, html, partial, render, consent, screenshotBefore }`) -- the
only observable change is `render.waitUntilReached` switching from
`'networkidle'` to `'load'`, which is a value update, not a shape change.

test-minion raised the same budget concern independently.

## Where they disagreed

No substantive disagreements. Both specialists converged on the same
recommendations. The only difference was in emphasis: debugger-minion focused
on the settle mechanism tradeoffs (why Option A beats B and C), while
test-minion focused on the mechanical update surface and whether to add settle
delay test coverage (answer: no, it's a passive timer with no branching logic).

## How conflicts were resolved in synthesis

**NAV_TIMEOUT_MS (25s vs 20s)**: The issue said "restored to 25s (or justified
if kept at 20s)." Both specialists flagged overrun risk. Nefario's synthesis
resolved this by keeping 20s with explicit justification: the `load` event is
a much narrower target than `networkidle`. For healthy sites, `load` fires in
1-5s. A 20s timeout is generous. Raising to 25s saves zero real-world captures
(any site needing >20s for `load` is broken) but creates a genuine overrun
window (pages where `load` fires at 22-24s succeed but settle + consent push
past 30s).

This is a case where the issue author's default expectation was wrong but
they explicitly provided an escape hatch ("or justified if kept at 20s"). The
justification is documented in `decisions.md` D1 and in a code comment.

## What the architecture reviewers found

Five mandatory reviewers (security-minion, test-minion, ux-strategy-minion,
lucy, margo) ran in Phase 3.5:

- **security-minion (ADVISE)**: Caught a real gap. The `limitExceeded` flag is
  set by an async response listener. The plan checks it before the settle delay
  but not after. During the 3s settle window, a malicious page could stream
  large chunked responses to push `totalBytes` past `MAX_PAGE_BYTES` without
  triggering the guard. Fix: add a second `if (limitExceeded) throw` after the
  settle delay. This was incorporated into the execution task.

- **test-minion (APPROVE)**: Confirmed all fixture and assertion updates were
  accounted for.

- **ux-strategy-minion (APPROVE)**: Noted the `waitUntilReached` value change
  from `networkidle` to `load` actually reduces conceptual leakage -- `load`
  is a standard browser lifecycle concept that API consumers understand, while
  `networkidle` is a Playwright abstraction.

- **lucy (APPROVE with 2 advisories)**: Verified CLAUDE.md compliance and
  alignment with Helix Manifesto. Both advisories were procedural: ensure
  backlog update and NAV_TIMEOUT_MS justification are captured in the evolution
  log.

- **margo (APPROVE)**: Confirmed proportionate complexity. Called out the
  `waitForTimeout` choice as "the simplest possible implementation."

## What the human changed at approval gates

All gates were auto-approved per the human's directive ("skip all approval
gates -- defer decisions to gru and lucy"). The human's only intervention
during the orchestration was checking that merging PR #68 to main didn't
create conflicts in the worktree (it didn't).

## What the human chose NOT to intervene on

- **NAV_TIMEOUT_MS at 20s**: The human did not override the synthesis decision
  to keep 20s despite the issue suggesting 25s. Both specialists' budget
  analysis was convincing.
- **The security advisory**: The post-settle `limitExceeded` re-check was
  incorporated without human review. It was a two-line addition with clear
  rationale and no controversy.
- **Code review NITs**: 4 NITs from code-review-minion. One (comment arithmetic
  error) was fixed. Three (variable naming, DRY opportunity, Playwright
  `networkidle` definition precision) were left for future cleanup.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/` companion directory
  (phase2-debugger-minion.md, phase2-test-minion.md)
- Architecture review verdicts: companion directory (phase3.5-*.md)
- Full synthesis/delegation plan: companion directory (phase3-synthesis.md)
- Execution report: `docs/history/nefario-reports/` (timestamped .md file)
