# Decisions: Integration Tests (#69)

## Architecture: Separate vitest config, same pool-workers framework

**Decision**: Use `@cloudflare/vitest-pool-workers` (same as unit tests) with a separate `vitest.integration.config.js` instead of a different test runner.

**Alternatives considered**:
- `wrangler dev` + external HTTP test runner: Would test the full API path but localhost URLs are blocked by URL validation. Would require either public fixture URLs or test-specific URL validation bypass.
- Standard Playwright (not @cloudflare/playwright): Would test a different code path — not the real `defaultRenderer()`.
- Deploy to staging and test there: Not controllable fixtures, slow feedback loop.

**Rationale**: Using the same test pool lets us call `performCapture()` directly (bypassing URL validation), which exercises the real `defaultRenderer()` with the miniflare-provided browser binding. The test server runs on localhost; since we bypass the API layer, private IP restriction isn't an issue.

## Browser session pre-acquisition workaround

**Decision**: Call `acquire(env.BROWSER, { keep_alive: 120000 })` in `beforeEach` before each test.

**Problem**: miniflare's browser binding implements `sessions()`, `acquire()`, and `connect()` but NOT `limits()`. The production code's `getOrCreateSession()` calls `limits()` as a fallback when no free session exists. In the test environment, this throws "Not implemented".

**Workaround**: Pre-acquiring a session puts it in the session pool. `getOrCreateSession()` then finds it via `sessions()` and connects directly, never needing `limits()`.

**Alternatives considered**:
- Modify production `getOrCreateSession()` to catch `limits()` errors: Rejected — issue scope explicitly excludes changes to capture pipeline.
- Mock `limits()` in test: Rejected — defeats the purpose of integration tests.

**Risk**: If miniflare implements `limits()` in the future, the workaround becomes unnecessary but harmless.

## No synthetic CMP fixture

**Decision**: The `cookie-banner.html` fixture has no CMP. It validates that autoconsent injection runs without errors, not that CMP dismissal works.

**Rationale**: Autoconsent rule sets are tightly coupled to specific vendor DOM structures and change with library updates. A synthetic CMP would be a permanent maintenance burden. Real CMP dismissal is validated by the advisory test (example.com or other real URLs).

## Advisory test uses try/catch pattern

**Decision**: The real-URL test wraps assertions in try/catch and logs a warning on network failure instead of using vitest's skip mechanism.

**Rationale**: Tests run in the Workers pool where network probing is awkward. The try/catch pattern is simpler and works regardless of the runtime environment. CI additionally uses `continue-on-error: true` at the job level.

## CI: Separate advisory job with continue-on-error

**Decision**: Add `test-integration` as a parallel job (not a step) with `continue-on-error: true`.

**Alternatives considered**:
- New step in existing `test` job: Rejected — different failure domains, different timeouts, would block the fast unit test signal.
- Required check: Rejected for initial rollout — real-URL tests depend on third-party availability. Can promote after 2-4 weeks of stable green runs.

## Integration tests excluded from unit test config

**Decision**: Added `exclude: ['test/integration/**', 'node_modules/**']` to the existing `vitest.config.js`.

**Rationale**: Without this, `npm test` picks up integration test files (which fail in the unit test environment due to missing globalSetup and no browser session pre-acquisition).
