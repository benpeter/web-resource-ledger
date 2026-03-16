# Meta-Plan: Integration Tests with Real Browser Captures

## Task Summary
Build `npm run test:integration` that exercises the real capture pipeline (headless browser, network, third-party services) to catch bugs like #66 (TSA misconfiguration) and #67 (networkidle timeout budget) before merge.

## Analysis

### Current State
- All 24 test files use `@cloudflare/vitest-pool-workers` with mocked renderers (`stubRenderer`, `partialRenderer`)
- `defaultRenderer()` uses `@cloudflare/playwright` (Cloudflare Browser Rendering binding)
- `fetchMock.disableNetConnect()` prevents real network calls in all tests
- The `browserRendering: { binding: 'BROWSER' }` in vitest.config.js provides a real browser binding via miniflare
- URL validation (`validateUrl`) blocks private IPs — but `performCapture()` takes pre-validated URLs

### Architecture Decision
Integration tests should:
1. Use a separate vitest config (`vitest.integration.config.js`) that doesn't activate fetchMock
2. Start a local HTTP test server via vitest `globalSetup` serving controlled HTML scenarios
3. Call `performCapture()` directly with the default renderer (no mock injection)
4. The miniflare browser binding navigates to the local test server via real Chromium
5. Not mock any external boundaries — real browser, real network, real TSA when configured

### Key Technical Constraints
- `@cloudflare/playwright` requires the BROWSER binding from miniflare
- Local test server must be accessible from the browser process (localhost should work with miniflare's local Chromium)
- Tests will be slower (real browser navigation) — separate CI job is appropriate
- TSA test requires `TSA_URL` to be set (DigiCert HTTP endpoint)

## Specialists to Consult

### Selected (2 agents)
1. **test-minion**: Integration test architecture, vitest configuration patterns, test server design, fixture strategy
   - Planning question: "Given a Cloudflare Workers project using `@cloudflare/vitest-pool-workers` with `@cloudflare/playwright`, design the integration test architecture: separate vitest config, local test server setup (globalSetup), test scenarios that catch #66-class (TSA misconfiguration) and #67-class (timeout budget) bugs, and the boundary between unit tests and integration tests."

2. **iac-minion**: CI pipeline integration — adding test:integration as a separate GitHub Actions job
   - Planning question: "Design the CI integration for `npm run test:integration` in the existing GitHub Actions workflow. The job needs browser rendering support (Chromium), should run separately from unit tests, and may be slower. Consider caching, timeout, and failure handling."

### Not Selected (rationale)
- security-minion: Tests don't change the security boundary; URL validation already tested in unit tests
- debugger-minion: Root causes of #66/#67 are well-documented in the issue
- frontend-minion: No frontend work
- All others: Not relevant to test infrastructure task

## Cross-Cutting Checklist
- [ ] No changes to production code (src/) — tests only
- [ ] Separate vitest config, not modifying existing test suite
- [ ] CI job should not block merges if flaky (allowed-to-fail for real-URL tests)
- [ ] Evolution log entry in docs/evolution/0032-integration-tests/
