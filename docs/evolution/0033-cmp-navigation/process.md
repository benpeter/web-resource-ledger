# Process: CMP navigation fix

TL;DR: Three specialists (security-minion, test-minion, debugger-minion)
planned the route handler fix, then staging validation revealed a second
blocker: autoconsent only ran in the main frame, missing iframe-based CMPs.
Scope expanded from capture.js to include consent.js multi-frame injection.
Final result: two files changed, Sourcepoint detected on Guardian/Spiegel
(was notDetected), opt-out still failing (follow-up). Total orchestration:
two review rounds (pre- and post-expansion), 3 planning specialists, 5
architecture reviewers, 3 code reviewers.

## Which specialists were consulted and why

**Phase 2 (Planning):**

- **security-minion** -- The change relaxes a security boundary (TOCTOU
  mitigation). Needed to assess whether allowing iframe navigations introduces
  new attack vectors. Verdict: safe, same-origin policy + subresource limits
  bound the risk.

- **test-minion** -- Zero existing test coverage on the route handler (all
  tests use stub renderers). Needed to determine whether extracting the logic
  or adding integration tests was appropriate. Verdict: no new automated tests;
  miniflare can't run real Playwright, and mock-based tests would test mocks.

- **debugger-minion** -- The proposed fix uses `route.request().frame() ===
  page.mainFrame()`, but the route handler is registered before `page` is
  created. Needed to determine if the Playwright API actually supports this
  pattern. This turned out to be the most valuable consultation.

## What each specialist argued

**security-minion** argued the fix is safe. Key points: (1) the blanket block
was over-broad -- TOCTOU only needs main-frame protection, (2) iframe navigations
can't exfiltrate data due to same-origin policy, (3) the code's own comments
(lines 63-65) already documented the intent to allow iframe navigations but the
code didn't match. Recommended handling `frame()` returning null as non-main-frame.

**test-minion** argued against adding automated tests. Key points: (1)
`defaultRenderer` requires a real browser binding unavailable in miniflare,
(2) extracting routing logic violates YAGNI and tests mocks not behavior,
(3) the project's "test the real boundaries" philosophy explicitly warns against
mocking the browser. Recommended manual verification + backlog item.

**debugger-minion** traced the @cloudflare/playwright source code and found
two bugs that would crash the naive implementation:
1. `page` is declared with `const` after route registration -- accessing it
   in the callback before assignment throws ReferenceError (Temporal Dead Zone)
2. `Request.frame()` throws (never returns null) for pre-creation requests
   and service worker requests

Also discovered that Playwright does NOT invoke route handlers for HTTP redirect
hops (301/302) -- they're auto-continued internally. This meant the BBC redirect
case was a non-issue.

## Where they disagreed

**frame() null vs throw behavior:** security-minion assumed `frame()` could
return null. debugger-minion proved via source tracing that it throws instead.
Resolution: use try/catch (handles the actual behavior) with fail-open
semantics (preserves security-minion's intent). No debate -- debugger-minion's
finding was accepted by all.

**Integration test:** security-minion wanted one; test-minion showed it was
impossible in the current test infrastructure. Resolution: follow test-minion,
add manual verification and backlog item. security-minion's concern addressed
by clear inline comments and code review rather than automated tests.

## How conflicts were resolved in synthesis

Both conflicts resolved by evidence rather than preference:
- frame() behavior: source code trace > documentation assumption
- Test feasibility: infrastructure analysis > best-practice aspiration

Nefario synthesis produced a single-task delegation plan (debugger-minion
implements the fix) with the try/catch pattern that satisfies both
security-minion's intent and debugger-minion's API findings.

## Phase 3.5: Architecture review

Five mandatory reviewers (security-minion, test-minion, ux-strategy-minion,
lucy, margo). No discretionary reviewers selected (single-file fix, no UI,
no new components).

Results: 4 APPROVE, 1 ADVISE (lucy).

lucy's ADVISE findings:
1. BBC redirect verification should be in manual test steps -- agreed, added
2. Backlog update required by CLAUDE.md -- agreed, included in wrap-up
3. Empty `catch {}` violates "fail loudly" -- addressed: catch names error
   parameter, fails open, documents why. Logging would require env access not
   available in the route handler closure.

## What the human changed at approval gates

All approval gates were skipped per human directive at orchestration start.
Decisions were deferred to gru (architecture review) and lucy (governance).
The human reviewed the issue description and trusted the agent team to
execute within the well-defined scope.

## What the human chose NOT to intervene on

- **No same-registrable-domain allowlisting:** The human let the agents
  reject the BBC allowlisting approach. The issue description mentioned BBC
  as a success criterion, but agents correctly identified that Playwright's
  redirect behavior already handles it.

- **No new automated tests:** The human accepted the test-minion's analysis
  that mocking Playwright internals would be counterproductive.

- **No logging in the catch block:** The human accepted that the route handler
  closure lacks `env` access, making structured logging impractical without
  restructuring.

## Phase 5: Code review

Three reviewers (code-review-minion, lucy, margo). Results: 1 APPROVE (lucy),
2 ADVISE (code-review-minion, margo).

Actionable findings addressed:
- Header comment at line 52 said "Cross-domain navigation blocked" without
  "main-frame" qualifier -- fixed
- Pre-creation window comment clarified: Playwright cannot fire navigation
  requests on a context with no pages
- frame() catch comment corrected to reference "detached frames during
  lifecycle transitions" rather than "pre-creation requests" (the `if (page)`
  guard handles pre-creation)

## Where to read more

- Specialist planning contributions: `docs/history/nefario-reports/2026-03-16-235320-cmp-navigation/`
- Synthesis/delegation plan: `phase3-synthesis.md` in the working files
- Architecture review verdicts: `phase3.5-*.md` in the working files
- Code review findings: `phase5-*.md` in the working files
