# Execution Plan: Integration Tests with Real Browser Captures

## Task Summary
Build `npm run test:integration` exercising the real capture pipeline (headless browser, network, TSA) to catch #66/#67-class bugs before merge.

## Execution Tasks

### Task 1: Test Infrastructure, Fixtures, and Integration Tests
**Agent:** test-minion (sonnet, bypassPermissions)
**Deliverables:**
- `vitest.integration.config.js` — separate config with `defineWorkersConfig`, `browserRendering` binding, real TSA_URL, 60s test timeout, globalSetup
- `test/integration/global-setup.js` — Node.js HTTP server lifecycle (port 0, OS-assigned)
- `test/integration/fixtures/fast.html` — simple static page
- `test/integration/fixtures/never-settle.html` — continuous fetch polling (prevents networkidle)
- `test/integration/fixtures/cookie-banner.html` — clean page for consent injection test
- `test/integration/capture-pipeline.test.js` — core integration tests:
  - Fast page: full capture, WACZ signed, timestamp present (#66-class), renderQuality='full'
  - Never-settle page: full capture not partial, timedOut=false (#67-class)
  - Cookie-banner page: consent injection runs without error
  - Timing budget: durationMs < 30000, stage timing fields present
- `test/integration/advisory.test.js` — real-URL capture of example.com (allowed-to-fail)
- `package.json` — add `"test:integration": "vitest run --config vitest.integration.config.js"` script
**Dependencies:** None

### Task 2: CI Pipeline Integration
**Agent:** iac-minion (sonnet, bypassPermissions)
**Deliverables:**
- `.github/workflows/ci.yml` — add `test-integration` job: parallel with existing `test` job, `continue-on-error: true`, 15-minute timeout, same docs-only skip logic, same action SHAs
**Dependencies:** None (can reference script name without Task 1 being complete)

## Execution Order
Tasks 1 and 2 run in parallel (no dependencies between them).

## No Approval Gates
Per user directive: all gates auto-approved.

## Risks
1. **Miniflare browser binding availability** (HIGH) — never exercised in existing tests. Mitigated by implementing and running immediately.
2. **Chromium download in CI** (MEDIUM) — miniflare handles download; `continue-on-error: true` protects merges.
3. **TSA rate limiting** (LOW) — DigiCert public TSA; low test volume.

## Conflict Resolutions
- test-minion and iac-minion agree on separate job (not step), `continue-on-error: true`, docs-only skip.
- iac-minion suggested Task 3 (Chromium caching) as fast-follow — deferred to backlog per YAGNI.
- iac-minion suggested deploy-staging.yml update — deferred; issue scope is CI only.
- test-minion recommended against synthetic CMP fixture — accepted; cookie-banner.html verifies consent injection without errors, real CMP tested by advisory test.
