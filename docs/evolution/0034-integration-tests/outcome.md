# Outcome: Integration Tests (#69)

## What was built

A `test:integration` script that exercises the real capture pipeline — headless browser, network, TSA — so that #66-class and #67-class bugs are caught before merge.

### Deliverables

| File | Lines | Purpose |
|------|-------|---------|
| `vitest.integration.config.js` | 37 | Separate vitest config: 60s timeout, globalSetup, browserRendering binding |
| `test/integration/global-setup.js` | 72 | Node.js HTTP server serving fixtures on port 0 (127.0.0.1) |
| `test/integration/capture-pipeline.test.js` | 175 | 7 core integration tests (baseline, TSA, never-settle, consent, timing) |
| `test/integration/advisory.test.js` | 51 | Real-URL test against example.com (allowed-to-fail) |
| `test/integration/fixtures/fast.html` | 4 | Simple static page — baseline sanity |
| `test/integration/fixtures/never-settle.html` | 13 | Continuous fetch polling — catches #67-class bugs |
| `test/integration/fixtures/cookie-banner.html` | 7 | Clean page — validates consent injection runs without errors |
| `vitest.config.js` (modified) | +1 | `exclude: ['test/integration/**']` to prevent unit test pickup |
| `package.json` (modified) | +1 | `"test:integration"` script |
| `.github/workflows/ci.yml` (modified) | +28 | Parallel `test-integration` job, `continue-on-error: true` |

### Success criteria status

| Criterion | Status |
|-----------|--------|
| `npm run test:integration` exists and runs separately from `npm test` | Done |
| Page with resources that never settle | Done (`never-settle.html`) |
| Page with cookie banner | Done (`cookie-banner.html`, validates injection without error) |
| Simple fast page (baseline sanity) | Done (`fast.html`) |
| Real-URL capture (advisory/allowed-to-fail) | Done (`advisory.test.js`, example.com) |
| Tests use real `defaultRenderer()` path | Done (no renderer parameter passed) |
| Timeout budget validated | Done (durationMs < 30000, stage timings present) |
| TSA timestamp validation | Done (timestampStatus === 'present') |
| CI runs `test:integration` | Done (separate job, continue-on-error) |

### Test results (local)

- **Core tests**: 7/7 passed (~87s total, ~12s per test)
- **Advisory test**: 1/1 passed (~12s, example.com captured with WACZ + timestamp)
- **Unit tests**: 503/503 passed (~6s, no regression)

### Key technical discovery

miniflare's browser binding implements `sessions()`, `acquire()`, `connect()` but NOT `limits()`. Production code calls `limits()` when no free session exists. Workaround: pre-acquire a session in `beforeEach` so `getOrCreateSession()` finds it via `sessions()` and never calls `limits()`.

## Backlog changes

- **Added**: CI Chromium binary caching (fast-follow once cache path is known from first CI run) — Tier 2
- **Added**: Promote integration tests to required check after 2-4 weeks of stable green runs — Tier 2
- **Not changed**: All existing backlog items remain as-is
