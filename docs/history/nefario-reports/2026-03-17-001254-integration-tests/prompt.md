#69 -- Integration tests with real browser captures (test:integration)

## Outcome

A `test:integration` script that exercises the real capture pipeline — headless browser, network, third-party services — so that bugs like #66 (TSA misconfiguration) and #67 (networkidle timeout budget) are caught before merge instead of discovered manually in production.

## Success criteria

- `npm run test:integration` exists and runs separately from `npm test`
- Local test server with controlled scenarios:
  - Page with resources that never settle (simulates ad-heavy sites — catches #67-class bugs)
  - Page with cookie banner (validates consent dismissal end-to-end)
  - Simple fast page (baseline sanity)
- At least one real-URL capture (e.g., a stable static site) as an advisory/allowed-to-fail test
- Tests use the real `defaultRenderer()` path — no mocked renderers
- Timeout budget is validated: navigation + consent + post-processing fits within 30s `ctx.waitUntil`
- When `TSA_URL` is configured, assert that the output includes a valid timestamp (catches #66-class bugs)
- CI runs `test:integration` (can be a separate job, allowed to be slower)

## Scope

In: Local test server, integration test harness, CI integration, real defaultRenderer() tests
Out: Load testing, performance benchmarking, flaky-test infrastructure, changes to the capture pipeline itself

## Context

Post-mortem of #66 and #67 revealed that all capture tests use mocked renderers (stubRenderer, partialRenderer) that return instantly. The real page.goto() -> Playwright path is never exercised. Both bugs were invisible to the test suite because:
- #66: fetchMock.disableNetConnect() prevents real TSA calls; silent catch in wacz.js swallows the failure; no assertion checks timestamp presence
- #67: Mocked renderers return instantly so timeout budget pressure is never tested; waitUntil: networkidle behavior on heavy pages is never observed

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. Write process.md in the evolution log directory. Other worktrees may be running in parallel -- pick the next available evolution sequence number (check docs/evolution/ for existing entries) and use the slug: integration-tests.
