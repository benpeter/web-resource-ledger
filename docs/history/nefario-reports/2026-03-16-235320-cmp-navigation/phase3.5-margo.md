# Margo -- Complexity & YAGNI Review

## Verdict: APPROVE

This plan is disciplined. One file changes, approximately 10 lines of net-new logic, no new dependencies, no new abstractions, no new services. The complexity is proportional to the problem.

## What I checked

**Scope alignment.** The request asks for one thing: stop blocking CMP consent iframes. The plan delivers exactly that -- a main-frame guard on the existing navigation block. No adjacent features, no "while we're at it" additions. The explicit "do NOT" list in the task prompt (no allowlisting, no function extraction, no new tests, no consent.js changes) is the right call.

**YAGNI compliance.** Clean. No speculative features. No "we might need this later" infrastructure. The plan correctly defers the E2E staging test to a backlog item rather than building test infrastructure now.

**Abstraction count.** Zero new abstractions. The fix is inline in the existing route handler. No extracted functions, no new modules, no configuration objects. This is correct -- the logic is 6 lines and belongs where it is.

**Dependency count.** Zero new dependencies. Uses only existing Playwright APIs (`frame()`, `mainFrame()`).

**Complexity of the change itself.** The `isMainFrame` check adds one boolean, one null-check, one try/catch, and one equality comparison. Cyclomatic complexity of the route handler increases by roughly 3 paths (page null, frame() throws, isMainFrame true/false). The handler was already at moderate complexity; this does not push it into concerning territory. The defensive coding (null-check + try/catch) is justified by the documented TDZ bug and the frame() throw behavior -- these are real edge cases, not speculative ones.

**TDZ fix.** Moving `page` to `let page = null` before the route registration is a genuine bug fix, not gold plating. The plan correctly identified that the current `const page` at line 392 creates a temporal dead zone in the route callback closure.

**Comment updates.** Both comment changes (SECURITY line and accepted-gaps block) reflect actual code behavior changes. They are not aspirational documentation -- they describe what the code now does. Appropriate.

## No concerns raised

The plan is minimal, correctly scoped, and the implementation is the simplest approach that preserves the TOCTOU security guarantee while allowing iframe navigations. Nothing to flag.
