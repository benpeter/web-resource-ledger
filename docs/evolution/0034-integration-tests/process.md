# Process: Integration Tests (#69)

## TL;DR

Nefario orchestrated two specialists (test-minion, iac-minion) to plan and build integration tests for WRL's capture pipeline. The plan was clean — build a local fixture server, write tests calling `performCapture()` with the real browser renderer, add a CI job. Execution hit one blocker: miniflare's browser binding doesn't implement `limits()`, causing all captures to fail instantly. Debugged via progressive probing of the browser API surface, found `acquire()` works, and designed a pre-acquisition workaround that exercises the full production code path. All 8 tests pass (7 core + 1 advisory). Total execution time from Phase 1 to PR: ~30 minutes.

## Specialists consulted

### test-minion (Phase 2, planning)
- **Asked**: Design the integration test architecture — separate vitest config, local test server, test scenarios catching #66/#67-class bugs, unit/integration boundary.
- **Key contribution**: Thorough test scenario design. Recommended AGAINST building a synthetic CMP fixture (autoconsent rules are vendor-coupled, permanent maintenance burden). Proposed the `global-setup.js` pattern with `provide()/inject()` for port passing. Identified Risk 1 (miniflare browser binding may not work) — which proved prophetic.
- **What was adopted**: Almost everything. File organization, test scenarios, vitest config structure, cookie-banner approach (verify injection runs, not CMP dismissal).

### iac-minion (Phase 2, planning)
- **Asked**: Design CI integration for `npm run test:integration`.
- **Key contribution**: Separate job (not step), `continue-on-error: true`, no secrets needed, same action SHAs. Recommended against making integration tests a merge gate initially — promote after 2-4 weeks of stability.
- **What was adopted**: CI job design adopted as-is. Deferred Chromium caching (Task 3) and deploy-staging.yml update to backlog per YAGNI.

## Where specialists agreed
- Separate vitest config, not modifying the existing test suite
- `continue-on-error: true` for the CI job (advisory, not blocking)
- No production code changes
- Try/catch pattern for the real-URL advisory test

## Where specialists disagreed
No conflicts. The task was well-scoped and the two specialists operated in non-overlapping domains (test architecture vs. CI pipeline).

## The limits() blocker: debugging narrative

### What happened
1. **First run**: All 7 integration tests failed instantly (5-21ms each). Captures had status `'failed'` with error `'Capture could not be completed'` — the catch-all from `categorizeError()`.
2. **Debug round 1**: Wrote a diagnostic test to inspect `env.BROWSER`. Found it's a `Fetcher {}` stub with no enumerable keys. Suspected the binding was non-functional.
3. **Debug round 2**: Called `@cloudflare/playwright` APIs directly:
   - `sessions()` → works, returns `[]`
   - `limits()` → throws `"Unable to fetch account limits: code: 405: message: Not implemented"`
   - `acquire()` → works, returns a real session ID
4. **Root cause**: `getOrCreateSession()` calls `sessions()` (returns empty), then falls through to `limits()` (throws). The error bubbles through `defaultRenderer()` → `performCapture()` catch-all → KV marked failed.
5. **Fix design**: Pre-acquire a session via `acquire()` before each test. `getOrCreateSession()` finds it via `sessions()`, connects to it, and never calls `limits()`. The rest of the production code runs unmodified.

### What the human chose NOT to intervene on
- The `InvalidAccessError: Invalid WebSocket close code: 1005` warnings from miniflare's browser binding. These are non-fatal (a close code of 1005 means "no status received" — the browser disconnection is handled by keep_alive, not a clean close). The warnings don't affect test outcomes and will likely be fixed in a future miniflare release.
- Test duration (~12s per test, ~87s total for core tests). This is inherent to real browser rendering (3s settle + 8s consent timeout per capture). Acceptable for integration tests that run in a separate CI job.

## Process meta-notes

- **Gates skipped**: All approval gates were skipped per user directive. Decisions deferred to the orchestrator.
- **Compaction skipped**: Context remained within bounds throughout.
- **Phase 3.5 skipped**: Architecture review auto-approved.
- **Total specialists**: 2 (test-minion, iac-minion)
- **Evolution log**: `docs/evolution/0032-integration-tests/`

## Where to read more

- Specialist contributions: scratch files (transient, not committed)
- Test architecture: `test/integration/capture-pipeline.test.js` header comments
- Browser binding workaround: `decisions.md` in this directory
- Issue context: GitHub issue #69
