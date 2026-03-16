---
task: "Integration tests with real browser captures (#69)"
date: 2026-03-17
source-issue: 69
slug: integration-tests
mode: execution
task-count: 2
gate-count: 0
agents: test-minion, iac-minion
evolution: 0032-integration-tests
---

## Summary

Built `npm run test:integration` exercising the full capture pipeline through real headless Chromium. 7 core tests + 1 advisory test validate baseline capture, WACZ timestamping (#66-class), load strategy (#67-class), consent injection, and timing budget. CI runs integration tests as a parallel advisory job.

## Original Prompt

GitHub Issue #69: Integration tests with real browser captures (test:integration). Build a test:integration script that exercises the real capture pipeline — headless browser, network, third-party services — so that bugs like #66 (TSA misconfiguration) and #67 (networkidle timeout budget) are caught before merge instead of discovered manually in production.

## Key Design Decisions

1. **Same test framework, separate config**: Uses `@cloudflare/vitest-pool-workers` with `vitest.integration.config.js` rather than a different test runner. Exercises the real `defaultRenderer()` with miniflare's browser binding.

2. **Browser session pre-acquisition**: miniflare's browser binding doesn't implement `limits()`. Tests pre-acquire sessions via `acquire()` so `getOrCreateSession()` finds free sessions via `sessions()` and never calls `limits()`. Full production code path is exercised unmodified.

3. **No synthetic CMP fixture**: Cookie-banner test validates autoconsent injection runs without errors, not CMP dismissal. Real CMP testing delegated to advisory real-URL test. Avoids permanent maintenance burden of tracking autoconsent rule changes.

4. **Advisory CI job**: `continue-on-error: true` at job level. Integration tests don't block merges initially — promote to required check after 2-4 weeks of stability.

## Phases

### Phase 1-3: Planning and Synthesis
Two specialists consulted: test-minion (test architecture, vitest config, fixture design) and iac-minion (CI pipeline integration). No conflicts — specialists operated in non-overlapping domains.

### Phase 3.5: Architecture Review
Auto-approved (gates skipped per user directive).

### Phase 4: Execution
Two parallel tasks:
- Task 1 (test-minion): Test infrastructure, fixtures, integration tests, package.json script
- Task 2 (iac-minion): CI workflow update

**Blocker encountered**: All integration tests failed immediately — captures had status 'failed'. Root cause: `getOrCreateSession()` calls `limits()` which throws "Not implemented" in miniflare. Debugged via progressive API probing: `sessions()` works, `acquire()` works, `limits()` doesn't. Fix: pre-acquire session in `beforeEach`.

### Phases 5-8
Skipped (gates skipped per user directive). Code reviewed inline during development.

## Agent Contributions

### Planning Phase
- **test-minion**: Test architecture (separate config, globalSetup, fixture server), test scenario design (fast/never-settle/cookie-banner/advisory), risk identification (miniflare browser binding — proved prophetic)
- **iac-minion**: CI job design (separate job, continue-on-error, same action SHAs, no secrets), timeout/caching strategy

## Verification

Verification: all tests pass. 503 unit tests (no regression), 7 integration tests, 1 advisory test.

## Test Plan

- [x] `npm test` — 503 unit tests pass (no regression from `vitest.config.js` exclude change)
- [x] `npm run test:integration` — 7 core tests pass (~87s total)
- [x] Advisory test — example.com captured with WACZ + timestamp (~12s)
- [ ] CI run — verify `test-integration` job runs in parallel on PR

## Working Files

Scratch files (transient, not committed):
- phase1-metaplan.md, phase2-test-minion.md, phase2-iac-minion.md, phase3-synthesis.md, prompt.md

## Session Resources

### Skills Invoked
- /nefario (this orchestration)

### Compaction
0 compaction events (context stayed within bounds).
