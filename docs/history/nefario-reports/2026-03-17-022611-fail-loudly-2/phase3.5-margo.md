# Margo Review: fail-loudly-2

## Verdict: APPROVE

This plan is proportional to the problem. The request was "eliminate silent catch blocks and clarify degradation semantics." The plan does exactly that -- no more, no less.

### What I checked

**Scope alignment**: The original request identifies 8 source files with silent catches. The plan touches those 8 files plus 2 test files. No technology additions, no new dependencies, no new abstractions, no new services. Task count: 1. This is tight scope.

**YAGNI compliance**: The plan explicitly excludes retry logic, circuit breakers, queuing, and structured Coralogix events where console.warn suffices. The "What NOT to do" section is unusually disciplined -- it lists 10 categories of changes that were considered and rejected. The observability-minion's push for structured log events in signing.js and ip-hash.js was correctly rejected as premature (signing.js fires once at startup-equivalent time; ip-hash.js is in the hot path where log() would add latency for a non-fatal error).

**Complexity budget**: Zero new dependencies, zero new abstractions, zero new services. The changes add ~30 lines of console.warn/log calls and ~15 lines of test code. The complexity cost is effectively zero -- these are leaf-level changes to existing catch blocks.

**Conflict resolutions are well-reasoned**: All four documented conflicts (console.warn vs console.error, structured events vs console.warn, error preservation, consent.js frame catches) resolved toward the simpler option with clear rationale. The log.js recursion concern (using console.warn to avoid infinite recursion in the logging function itself) is exactly the kind of constraint-aware thinking that prevents accidental complexity.

**The timestampStatus rename** from `'absent'` to `'skipped'` is justified by the original incident -- the whole point is that operators could not distinguish "intentionally unconfigured" from "broken." Three-way semantics (`present`/`skipped`/`error`) directly serves the requirement. The plan correctly notes that old KV records are unaffected because nothing reads `timestampStatus` from KV at runtime.

### One minor observation (non-blocking)

The `_error` object in consent.js (line 105-113 of the plan) includes `err?.constructor?.name` which is slightly defensive given that the catch clause already binds `err`. But this mirrors an existing pattern at capture.js:609-613, so consistency wins over micro-optimization. No action needed.

No findings requiring changes.
