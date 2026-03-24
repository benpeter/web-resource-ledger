# Margo Review -- simplify-capture-access-model

## Verdict: APPROVE

This plan is code removal dressed as four tasks, which is exactly proportional
to the problem. The original issue asks for seven changes; the plan delivers
six of them (correctly deferring item 7 -- E2E test fix -- as a separate
concern) across four tasks. That is a reasonable decomposition: one task per
natural boundary (worker core, tests, CLI package, docs).

## What I checked

**Scope alignment.** The prompt asks to remove share tokens, make individual
capture endpoints public, gate the list endpoint, update docs. The plan does
exactly that and nothing more. The "What NOT to do" sections in each task are
unusually disciplined -- they explicitly fence out rate limiting, X-Robots-Tag,
error field audits, ID generation changes, verify page enhancement, and version
bumps. Good. The deferred items are tracked separately, not bundled.

**Task count.** 4 tasks for a change that touches 3 boundaries (worker, CLI
package, docs/spec) plus a test task. No inflation -- each task maps to a
distinct deliverable set with no overlap.

**Accidental complexity.** None introduced. The plan removes an entire module
(`share-tokens.js`), deletes a route, drops a DB table, and strips auth from
three endpoint families. The only new code is a rewritten error message in the
CLI and updated doc text. The handler pattern (check if `env._captureAuth`
exists, skip tenant isolation if absent) is the simplest possible approach --
the plan correctly rejected a "synthetic public auth object" alternative.

**Dependency changes.** Zero. No new dependencies added.

**Abstraction layers.** Zero added. One removed (share token indirection).

**Technology expansion.** None. All changes are within the existing stack
(Workers, D1, Vitest, npm).

**YAGNI compliance.** Strong. The plan explicitly defers four security-minion
recommendations that could have been bundled in. Each deferral cites "separate
concern with its own trade-offs."

## One observation (non-blocking)

The plan puts security-minion as the agent for Task 1 (the core code change).
That is a fine choice given it is primarily an auth-model change. Just noting
that Task 1 is mostly mechanical deletion -- any competent minion could do it.
Not worth changing the plan over.

## Complexity budget

| Item | Column | Cost |
|------|--------|------|
| No new services | -- | 0 |
| No new dependencies | -- | 0 |
| No new abstraction layers | -- | 0 |
| No new technology | -- | 0 |
| **Net complexity change** | -- | **Negative** (removing a feature, a module, a DB table, and ~420 lines of code+tests) |

This is the rare plan that pays down the complexity budget rather than spending it.
