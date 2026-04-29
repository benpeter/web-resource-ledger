# Testing

This document describes the test stack for `web-resource-ledger`. The
project follows the rule from `CLAUDE.md`: **test the real boundaries.**
Mocking out the headless browser is "like testing an HTTP server without
sending requests" — unit tests with stubs are fine for orchestration
logic, but integration tests must hit the real renderer, network, and
third-party services.

---

## 1. Test framework — Vitest + Cloudflare Workers pool

From `package.json`:

```json
"devDependencies": {
  "@cloudflare/vitest-pool-workers": "0.12.21",
  "@playwright/test": "^1.58.2",
  "vitest": "3.2.4",
  "wrangler": "4.73.0"
}
```

- **Vitest** is the test runner.
- **`@cloudflare/vitest-pool-workers`** runs each test inside a real
  miniflare/workerd Worker, with bindings (`env.DB`, `env.BUCKET`,
  `env.KV`, `env.BROWSER`, …) wired up exactly as production.
- **Playwright** is used only for browser-driven E2E suites (`test/e2e/`)
  that exercise the deployed staging environment.

There is **no Jest, Mocha, AVA**, or homegrown harness — only Vitest.

---

## 2. Three Vitest configs

The repo carries three Vitest configs because the suites have
incompatible runtime requirements.

### `vitest.config.js` — default unit / fast suite

`npm test` → `vitest run` (no `--config` flag) picks this up.

```js
// vitest.config.js
export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/apply-migrations.js'],
    exclude: [
      'test/integration/**',
      'test/e2e/**',
      'test/mcp-sync.test.js',
      'packages/**', 'node_modules/**', 'site/**',
    ],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.test.toml' },
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: {
            TEST_MIGRATIONS,
            CAPTURE_API_KEY: 'test-api-key-for-vitest',
            ADMIN_KEY: 'test-admin-key-for-vitest',
            SIGNING_KEY: testSigningKey,           // generated at load time
            TEST_ARCHIVED_KEY: testArchivedKey,    // generated at load time
            CORS_ORIGINS: 'https://allowed.example.com,...',
            // ... 12 more test-only secrets
          },
          isolatedStorage: false,
        },
      },
    },
  },
});
```

Key points:

- **Excludes** `test/integration/**` (the slow real-network suite),
  `test/e2e/**` (Playwright), and `test/mcp-sync.test.js` (the only
  test that doesn't run inside a Worker).
- **Test signing keys are generated at load time** with
  `generateKeyPairSync('ed25519')`. No key material is ever committed.
- Uses `wrangler.test.toml` (see §6).
- `isolatedStorage: false` — R2's SQLite WAL files can stay open between
  tests and crash the runtime; the suite compensates with explicit
  `beforeEach` cleanup.

### `vitest.integration.config.js` — real-network integration suite

`npm run test:integration` → `vitest run --config vitest.integration.config.js`.

```js
// vitest.integration.config.js
export default defineWorkersConfig({
  test: {
    include: ['test/integration/**/*.test.js'],
    setupFiles: ['./test/apply-migrations.js'],
    testTimeout: 60000,
    hookTimeout: 30000,
    globalSetup: ['./test/integration/global-setup.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' }, // production config
        miniflare: {
          browserRendering: { binding: 'BROWSER' },
          bindings: { /* TSA_URL: 'http://timestamp.digicert.com', ... */ },
          isolatedStorage: false,
        },
      },
    },
    // Integration tests need real network -- do NOT activate fetchMock
  },
});
```

Distinguishing features:

- **`globalSetup` starts a local fixture HTTP server** (see
  `test/integration/global-setup.js`) on a random port, publishes the
  port via `provide()`, and tests inject it with `inject('testServerPort')`.
  Browsers point at `127.0.0.1:<port>` so we exercise the real renderer
  without leaving the runner.
- **No `fetchMock`.** Integration tests hit the real local server and
  the real RFC-3161 TSA at `timestamp.digicert.com`.
- Higher timeouts (60s test / 30s hook) for browser warm-up.
- Uses production `wrangler.toml`, not the test variant.

### `vitest.sync.config.ts` — schema-sync test

`npm run test:sync` → `vitest run --config vitest.sync.config.ts`.

```ts
// vitest.sync.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['test/mcp-sync.test.js'] },
});
```

This is plain vanilla Vitest (no Workers pool). It runs in Node,
because `test/mcp-sync.test.js` only reads `openapi.yaml` and asserts
that every MCP tool maps to an `operationId`. No bindings, no runtime
dependencies — wrapping it in workerd would just slow CI down.

---

## 3. Test file location convention

Tests live under **`test/`** at the repo root, mirroring `src/` filenames:

| Source | Test |
|---|---|
| `src/auth.js` | `test/auth.test.js` |
| `src/capture.js` | `test/capture.test.js` |
| `src/log.js` | `test/log.test.js` |
| `src/db.js` | `test/db.test.js` |
| `src/cdxj.js` | `test/cdxj.test.js` (implied by header in source) |

Subdirectories scope special suites:

- `test/integration/` — slow, real-network tests
  (`capture-pipeline.test.js`, `advisory.test.js`).
- `test/e2e/` — Playwright specs (`*.spec.js`) targeting staging.
- `test/integration/fixtures/` — HTML pages served by `global-setup.js`
  (`fast.html`, `cookie-banner.html`, `lazy-images.html`, …).

There is **no co-location** of `*.test.js` files inside `src/`.

Total today: ~68 `*.test.{js,ts}` files plus ~6 Playwright specs.

---

## 4. Test naming convention

Test names follow a `subject -- behavior` pattern in `describe` blocks,
and natural-language `it` strings starting with a verb:

```js
describe('verifyApiKey -- DB-based key lookup', () => {
  it('returns { ok: true } for a valid DB key', async () => { ... });
  it('success return includes keyHashPrefix as 8-char hex string', async () => { ... });
  it('returns correct tenantId from DB record', async () => { ... });
});
```

```js
describe('performCapture -- successful capture', () => {
  it('transitions KV status to complete', async () => { ... });
  it('writes R2 artifacts: screenshot.png and rendered.html', async () => { ... });
});
```

Conventions:

- `describe` = `<function-or-feature> -- <scenario>`. The double-dash
  separator is the project style.
- `it` = a sentence about externally observable behavior. Start with a
  verb (`returns`, `transitions`, `writes`, `rejects`).
- Tests are grouped under banner comments mirroring `src/`'s style:
  ```js
  // ---------------------------------------------------------------------------
  // Block 1: verifyApiKey -- KV-based key lookup
  // ---------------------------------------------------------------------------
  ```

---

## 5. Mocking strategy

### Unit suite (`vitest.config.js`)

- **`fetchMock` from `cloudflare:test`** intercepts outbound HTTP
  inside the Worker isolate. Standard lifecycle:
  ```js
  // test/log.test.js, test/capture.test.js
  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });
  afterEach(() => {
    fetchMock.deactivate();
  });
  ```
  Combined with `fetchMock.get(origin).intercept(...).reply(...)`, this
  mocks Coralogix, GitHub OAuth, the TSA, and Stripe.

- **Renderer stubs** — `test/fixtures.js` exports an array of stub
  functions matching the renderer contract (`stubRenderer`,
  `consentNotDetectedRenderer`, `dualScreenshotRenderer`,
  `consentFailedRenderer`, `partialRenderer`). Tests pass a stub as the
  optional last argument to `performCapture(env, url, ip, id, tenant, _, renderer)`,
  bypassing the real headless browser.

- **DB seeding helpers** — also in `test/fixtures.js`:
  `seedApiKey`, `seedGithubUser`, `createTestSession`,
  `seedSchedule`, `seedWebhook`, `seedCapture`, `seedUsageCounter`,
  `seedTenantWithTier`, `cleanDb`.

- **`vi.mock()`** is rarely used. Most isolation is achieved through
  injecting stubs (renderer, fetch) rather than module-level mocks.

### Integration suite (`vitest.integration.config.js`)

- **No `fetchMock`.** The config comment is explicit: *"Integration
  tests need real network -- do NOT activate fetchMock."*
- **Real renderer.** `performCapture` is called without a renderer
  argument so it uses the production `defaultRenderer`, hitting the
  miniflare browser binding.
- **Real fixture server** (started by `global-setup.js`) instead of
  `https://example.com`.

### E2E suite (`test/e2e/`)

- **Real Playwright browser** against a deployed environment, default
  `https://staging.webresourceledger.com` (overridable via `E2E_BASE_URL`).
- Configured in `test/e2e/playwright.config.js` with
  `retries: process.env.CI ? 1 : 0`, `workers: 1`, screenshot/trace on
  failure.

---

## 6. The 'real boundaries' rule

`CLAUDE.md` mandates:

> **Test the real boundaries** — this product captures web pages with
> headless browsers. Mocking out the browser is like testing an HTTP
> server without sending requests. Unit tests with mocked renderers are
> fine for orchestration logic, but integration tests must exercise the
> real external boundaries (browser, network, third-party services).

Concrete realizations in this repo:

| Boundary | Where it gets exercised for real |
|---|---|
| Headless browser | `test/integration/capture-pipeline.test.js` calls `performCapture` with no renderer override, against a 127.0.0.1 fixture server. |
| RFC-3161 TSA | `vitest.integration.config.js` binds `TSA_URL: 'http://timestamp.digicert.com'`; `test/integration/advisory.test.js` exercises it. |
| WACZ bundling | The integration capture pipeline produces a real WACZ in R2 and the test reads it back. |
| Cloudflare D1, R2, KV | Every Workers-pool test runs against a real (in-process) miniflare instance of each binding. |
| GitHub OAuth, Stripe, Coralogix | **Stubbed** in unit tests via `fetchMock` — these are HTTP services with documented contracts where stubs are appropriate. The browser is the boundary that *must* be real. |

When adding a feature that depends on an external service, the
checklist is: at least one assertion in `test/integration/` proves the
real path works end-to-end.

---

## 7. `wrangler.test.toml`

This file mirrors `wrangler.toml` with two deliberate omissions:

```toml
# wrangler.test.toml
# Auto-generated from wrangler.toml -- omits [[queues.consumers]] sections
# to prevent miniflare auto-consuming messages during tests.
# Also omits [triggers] sections (cron triggers do not apply in tests).
```

Why:

- **No `[[queues.consumers]]`.** With consumers wired up, miniflare
  auto-invokes the queue handler, which calls `performCapture()` with
  the real `BROWSER` binding mid-test, corrupting isolated storage and
  breaking unrelated assertions. Tests that need the consumer's logic
  invoke its handler directly.
- **No `[triggers.crons]`.** Scheduled handlers are tested by calling
  `handleScheduledTick(env, ctx)` directly; we don't want miniflare's
  cron scheduler firing during a test run.
- D1 / R2 / KV bindings keep the same names (`DB`, `BUCKET`, `KV`) but
  point at local IDs (`local-test-db`, etc.) so production data is
  never touched.

Only the unit suite uses this file. The integration suite uses the
production `wrangler.toml` directly.

---

## 8. How to run tests

From `package.json#scripts`:

```json
{
  "test":             "vitest run",
  "test:watch":       "vitest",
  "test:integration": "vitest run --config vitest.integration.config.js",
  "test:sync":        "vitest run --config vitest.sync.config.ts",
  "test:e2e":         "npx playwright test --config=test/e2e/playwright.config.js",
  "test:battery":     "node scripts/test-battery.js",
  "smoke":            "./scripts/smoke-test.sh",
  "lint:api":         "redocly lint openapi.yaml"
}
```

| Command | Suite | Speed |
|---|---|---|
| `npm test` | Unit (workerd, mocked browser) | Fast |
| `npm run test:watch` | Unit, watch mode | — |
| `npm run test:integration` | Real browser + real TSA | Slow (60s timeouts) |
| `npm run test:sync` | OpenAPI ↔ MCP tool sync | Instant |
| `npm run test:e2e` | Playwright vs staging | Slow, network-dependent |
| `npm run test:battery` | One-off batch script | — |
| `npm run smoke` | Curl-based deployment smoke | — |

---

## 9. Coverage tooling

There is **no coverage tool configured.** No `c8`, `istanbul`, or
`@vitest/coverage-v8` in `package.json`; no `coverage` block in any
Vitest config. Coverage is not collected in CI.

If a phase wants coverage data, it would need to add `@vitest/coverage-v8`
as a dev dep and configure `test.coverage` in `vitest.config.js`. This
is a deliberate YAGNI position so far.

---

## 10. Sample test structure

A representative unit test file. The structure repeats across the suite:
banner-commented sections, fixture imports, lifecycle hooks, focused
`describe` blocks.

```js
// test/capture.test.js
import { env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture, captureHeaders, categorizeError } from '../src/capture.js';
import { createCapture, getCapture } from '../src/db.js';
import { PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID = 'cap_ca91001234567890abcdef1234560001';
const TEST_ORIGIN = 'https://example.com';

// ---------------------------------------------------------------------------
// KV / R2 cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(TEST_ID).run();
  const prefix = `captures/${TEST_ID}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
    env.BUCKET.delete(`${prefix}/screenshot-before.png`),
    env.BUCKET.delete(`${prefix}/rendered.html`),
    env.BUCKET.delete(`${prefix}/headers.json`),
  ]);
});

// ---------------------------------------------------------------------------
// fetchMock lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

// ---------------------------------------------------------------------------
// Helper: mock a successful header fetch
// ---------------------------------------------------------------------------

function mockHeaderFetch(opts = {}) {
  fetchMock
    .get(TEST_ORIGIN)
    .intercept({ path: '/', method: 'GET' })
    .reply(opts.status ?? 200, opts.body ?? 'ok', {
      headers: opts.headers ?? { 'content-type': 'text/html' },
    });
}

// ---------------------------------------------------------------------------
// performCapture -- orchestration tests
// ---------------------------------------------------------------------------

describe('performCapture -- successful capture', () => {
  it('transitions KV status to complete', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('writes R2 artifacts: screenshot.png and rendered.html', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
    // assertions on env.BUCKET ...
  });
});
```

A representative integration test. Note the **absence** of `fetchMock`,
the use of `inject('testServerPort')`, and the explicit browser warm-up
(`ensureBrowserSession`) needed because miniflare's browser binding
doesn't implement `limits()`:

```js
// test/integration/capture-pipeline.test.js
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, inject } from 'vitest';
import { acquire, connect } from '@cloudflare/playwright';
import { performCapture } from '../../src/capture.js';
import { createCapture, getCapture } from '../../src/db.js';

async function ensureBrowserSession() {
  const session = await acquire(env.BROWSER, { keep_alive: 120000 });
  const browser = await connect(env.BROWSER, session.sessionId);
  await browser.close();
}

describe('integration: fast page -- baseline sanity', () => {
  const captureId = 'cap_0000000000000000000000000000e5a1';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures a fast page with full quality', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId,
      `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', 'default');
    await performCapture(env,
      `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    // ... real WACZ, real screenshot, real headers ...
  });
});
```

Both excerpts share the **fixtures + lifecycle + describe-blocks**
shape; the difference is only what gets stubbed.

---

## 11. CI integration — `.github/workflows/`

Workflows live in `.github/workflows/`:

```
autoconsent-update.yml
ci.yml
deploy-docs.yml
deploy-landing.yml
deploy-production.yml
deploy-staging.yml
e2e-tests.yml
investigate-alert.yml
publish-verify.yml
vibe-coded-badge.yml
```

The two test-relevant ones:

### `ci.yml` — runs on every PR and push to `main`

Two jobs:

1. **`test`** (10-minute timeout)
   - `./scripts/check-version-sync.sh` — version markers must match.
   - Changelog warning if `src/` or `openapi.yaml` changed without
     updating `CHANGELOG.md`.
   - `npm test` — the unit suite (`vitest.config.js`).
   - `npm run test:sync` — the OpenAPI/MCP sync test.
   - `npm run lint:api` — `redocly lint openapi.yaml`.
   - All of the above are skipped for docs-only PRs (paths matching
     `\.md$|^docs/|^site/`).

2. **`test-integration`** (15-minute timeout, `continue-on-error: true`)
   - Runs `npm run test:integration` on the same PR/push, but is
     **non-blocking**. The job comment is honest about why:
     *"Integration tests require real browser rendering; flaky without
     live CF infrastructure."* Failures surface as warnings, not
     gating errors.

### `e2e-tests.yml` — scheduled + post-deploy

- Runs `npm run test:e2e` against staging on:
  - Cron `0 8 * * 1,4` (Mon + Thu, 08:00 UTC).
  - Successful completion of the **Deploy to Staging** workflow on `main`.
  - Manual `workflow_dispatch`.
- Uses the `staging` GitHub environment for any required secrets.

The other workflows are deploy / housekeeping (docs, landing,
production deploy, vendoring autoconsent, alert investigation, badge
publishing) and don't run tests.

---

## 12. Quick reference

- **Unit tests:** `npm test` — fast, mocked renderer, mocked fetch.
- **Integration tests:** `npm run test:integration` — real browser, real
  TSA, local fixture server.
- **OpenAPI/MCP sync:** `npm run test:sync`.
- **E2E:** `npm run test:e2e` (defaults to staging).
- **Add a new test:** `test/<source-name>.test.js`, mirror the banner
  + `describe('<fn> -- <scenario>')` + `it('<verb> ...')` style.
- **Add an integration test:** drop it under `test/integration/`,
  remember `globalSetup` already runs the fixture server, do **not**
  reach for `fetchMock`.
- **Need a new binding in tests:** add it to `vitest.config.js` (and
  to `wrangler.test.toml` if it's a service binding).
- **Real boundary not yet covered:** before merging, add at least one
  assertion in `test/integration/` that proves the path end-to-end.
