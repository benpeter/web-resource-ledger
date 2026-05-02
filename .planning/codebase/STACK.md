# Tech Stack

## Runtime & Platform

The primary application is a **Cloudflare Workers** service (single Worker exporting both `fetch()` and `queue()` handlers) that runs on the V8 isolate runtime with `nodejs_compat` enabled.

- Deployed to Cloudflare with `compatibility_date = "2026-03-13"` and `compatibility_flags = ["nodejs_compat"]` (`wrangler.toml`).
- Custom domains: `api.webresourceledger.com`, `verify.webresourceledger.com` (production), `staging.webresourceledger.com`, `verify-staging.webresourceledger.com` (staging).
- Single Worker entrypoint: `src/index.js` (~2500 lines, route table for `fetch()`, plus `queue()`, `scheduled()` handlers).
- CPU limit raised to 60s (`[limits] cpu_ms = 60000`) to accommodate WACZ bundling.
- A second smaller Worker — the marketing landing page — lives in `landing/` (`landing/wrangler.toml`, name `wrl-landing`).
- Documentation site (`site/`) is built statically with **Eleventy** (not a Worker; built via `npm run build:docs`).
- A standalone Node CLI / library lives in `packages/verify/` (published as `@w-r-l/verify`, runs on Node ≥ 20 via `node --test`).
- E2E tests run against deployed staging via Playwright from a developer/CI machine (`test/e2e/playwright.config.js`).

## Languages

| Language | Files | Where |
| --- | --- | --- |
| JavaScript (ESM) | 81 in `src/`, 82 in `test/` | All application & test code |
| TypeScript | 1 (`vitest.sync.config.ts`) | Single config file only |
| SQL | 17 files in `migrations/` | D1 schema migrations (`0001_initial_schema.sql` … `0017_invoice_cache.sql`) |
| CSS | 1 (`src/design-system.css`) | Shared design tokens |
| SVG | 3 in `src/assets/` | Favicon and logos |
| HTML | 6 in `test/` | Test fixtures |
| YAML | `openapi.yaml` (~222 KB), `.github/workflows/*.yml`, `redocly.yaml`, `.redocly.lint-ignore.yaml`, `.gitguardian.yml` | API spec, CI, lint |

The codebase is **vanilla ESM JavaScript** end-to-end. No TypeScript build step. JSDoc is used for type annotations in some places. Per `CLAUDE.md`, the project deliberately avoids frameworks (no React/Vue/Tailwind/jQuery).

## Core Frameworks & Libraries

From `package.json` (root):

| Library | Version | Purpose |
| --- | --- | --- |
| `wrangler` | `4.73.0` (devDep) | Cloudflare Workers CLI: `dev`, `deploy`, secret management |
| `@cloudflare/playwright` | `^1.1.2` | Headless Chromium for capture pipeline (Cloudflare Browser Rendering binding); used in `src/capture.js` via `connect`, `acquire`, `sessions`, `limits` |
| `@cloudflare/vitest-pool-workers` | `0.12.21` (devDep) | Runs Vitest tests inside Miniflare with Workers runtime semantics |
| `vitest` | `3.2.4` (devDep) | Unit + integration test runner |
| `@playwright/test` | `^1.58.2` (devDep) | E2E tests against staging (`test/e2e/`) |
| `@duckduckgo/autoconsent` | `^14.75.0` (origin/main; local working tree was `^14.66.0` at mapping time) | Cookie banner dismissal during capture; bundled in `src/vendor/autoconsent-script.js` and `src/vendor/autoconsent.playwright.js` (vendored via `scripts/vendor-autoconsent.js`); auto-bumped by the autoconsent CI pipeline (Phase 0088, PR #229). **Note:** the codebase mapper read this from the local working tree rather than `origin/main` and was 1 commit behind (PR #276 / d042b44). Treat any version-sensitive claim in this doc as a snapshot of local working tree, not necessarily current `origin/main`. |
| `@modelcontextprotocol/sdk` | `^1.27.1` | Exposes the API as an MCP server (`src/mcp.js` — `McpServer`, `WebStandardStreamableHTTPServerTransport`) |
| `croner` | `^10.0.1` | Cron expression validation and next-run calculation for tenant schedules (`src/cron.js`) |
| `diff-match-patch-es` | `1.0.1` | Character-level HTML diffing (`src/diff.js`) |
| `pdf-lib` | `1.17.1` | Generates signed PDF certificates of authenticity (`src/certificate.js`) |
| `fflate` | `^0.8.2` (devDep — used by `src/wacz.js`) | ZIP creation for WACZ bundles (`zipSync`) |
| `zod` | `^4.3.6` | Schema validation in MCP tool definitions (`src/mcp.js`) |
| `@redocly/cli` | `^1.34.0` (devDep) | Lints `openapi.yaml` (`npm run lint:api`) |
| `yaml` | `^2.8.2` (devDep) | YAML parsing in scripts |

Built-in Node modules used (via `nodejs_compat`): `node:crypto` (Ed25519 keypairs in test configs and `src/signing.js`), `node:url`, `node:path`.

There is **no HTTP framework** (no Hono, no itno, no Express). Routing is a hand-written tuple table in `src/index.js` matching `[method, regex, handler]`.

## Build & Tooling

- **Bundler:** `wrangler` (esbuild under the hood) — no separate Vite/Rollup/Webpack config. The Worker is bundled at deploy time from `src/index.js`.
- **Test runner:** Vitest via `@cloudflare/vitest-pool-workers`, which runs tests inside Miniflare with real D1, KV, R2, and Browser Rendering bindings.
- **E2E runner:** `@playwright/test` against staging URLs.
- **API linting:** `@redocly/cli` against `openapi.yaml` (config: `redocly.yaml` extends `recommended`; ignores in `.redocly.lint-ignore.yaml`).
- **Docs builder:** Eleventy (`@11ty/eleventy ^3.0.0`) in `site/`.
- **Package manager:** **npm** — `package-lock.json` is the lockfile (250 KB). No pnpm/yarn lockfiles present.
- **CI:** GitHub Actions in `.github/workflows/` — `ci.yml`, `deploy-production.yml`, `deploy-staging.yml`, `deploy-docs.yml`, `deploy-landing.yml`, `e2e-tests.yml`, `publish-verify.yml`, `autoconsent-update.yml`, `investigate-alert.yml`, `vibe-coded-badge.yml`.
- **Helper scripts** (`scripts/`): `smoke-test.sh`, `test-battery.js`, `generate-signing-key.js`, `vendor-autoconsent.js`, `purge-cache.sh`, `provision-alerts.sh`, `migrate-kv-to-d1.js`, `changelog-verify.sh`, `check-version-sync.sh`, `generate-favicon.sh`, `create-investigation-labels.sh`, `autonomous/` (sub-tooling).

## Configuration Files

- `wrangler.toml` — Production Worker config: D1 (`wrl-metadata`), R2 (`wrl-captures`), KV, Browser binding, six rate-limiter `unsafe.bindings`, six queues (3 producers + 3 consumers + 3 DLQs for captures, webhooks, emails), cron triggers (`*/1 * * * *`, `0 3 * * *`, `0 9 * * 1`), custom domain routes, public `[vars]` (Coralogix endpoint, Stripe publishable key, GitHub client ID, TSA URLs), and a fully separate `[env.staging]` block.
- `wrangler.test.toml` — Auto-generated copy of `wrangler.toml` with `[[queues.consumers]]` and `[triggers]` stripped so Miniflare doesn't auto-consume queue messages or fire crons during unit tests.
- `landing/wrangler.toml` — Static-asset Worker for the marketing site at `webresourceledger.com`.
- `site/wrangler.toml` — Worker config for the doc site (built by Eleventy).
- `package.json` — Root manifest; declares `"type": "module"`, `engines.node >= 20.0.0`, and all npm scripts (`dev`, `deploy`, `test`, `test:integration`, `test:e2e`, `test:battery`, `test:sync`, `lint:api`, `smoke`, `build:docs`, `vendor:autoconsent`).
- `package-lock.json` — npm lockfile.
- `.nvmrc` — pins Node `22` for local dev (CI / Workers runtime decoupled).
- `vitest.config.js` — Default test config. Uses `@cloudflare/vitest-pool-workers`, points at `wrangler.test.toml`, generates ephemeral Ed25519 signing keys at load time, applies migrations in setup, injects test secrets (`CAPTURE_API_KEY`, `ADMIN_KEY`, `SIGNING_KEY`, `STRIPE_*`, `GITHUB_*`, `SESSION_SECRET`, `IP_HASH_SEED`, etc.), and disables R2 isolated storage to avoid SQLite WAL leak between tests.
- `vitest.integration.config.js` — Integration tests under `test/integration/**`. Uses real `wrangler.toml`, 60 s test timeout, no fetchMock (real network).
- `vitest.sync.config.ts` — Tiny Node-only config that runs only `test/mcp-sync.test.js` outside the Workers pool.
- `test/e2e/playwright.config.js` — Playwright E2E config; defaults `E2E_BASE_URL` to `https://staging.webresourceledger.com`, single Chromium project, html reporter.
- `redocly.yaml` / `.redocly.lint-ignore.yaml` — OpenAPI lint configuration for `openapi.yaml`.
- `.gitguardian.yml` — Secret scanning ignore rules.
- `.github/workflows/*.yml` — CI/CD pipelines (deploy, tests, alert investigation, badge generation).
- `glama.json`, `server.json` — MCP server registry metadata.

## Dev Dependencies of Note

- **`@cloudflare/vitest-pool-workers`** — runs tests against the actual Workers runtime (Miniflare) with D1/R2/KV/Browser bindings. Avoids the trap of mocking Workers behaviour in plain Node.
- **`wrangler 4.73`** — pinned exact-major; both `dev` and `deploy` go through it.
- **`@redocly/cli`** — keeps the very large `openapi.yaml` (~222 KB) honest.
- **`fflate`** — small, fast, dependency-free zip lib chosen for WACZ bundling in a Worker context where heavy deps would inflate cold-start size.
- **`yaml`** — used by build / sync scripts (e.g., MCP `server.json` sync test).
- **No linter/formatter** is configured in the repo — no ESLint, Prettier, or Biome config files at the root. Code style is enforced by review and the project conventions documented in `CLAUDE.md`.
- **No TypeScript checker** — there is no `tsconfig.json`. Type info, where present, is JSDoc-only and not validated as part of CI.

## Notable Version Constraints

- `engines.node >= 20.0.0` (`package.json`).
- `.nvmrc` pins **Node 22** for local development (newer than the engines floor; CI/Workers runtime is independent).
- Cloudflare Workers `compatibility_date = "2026-03-13"`, `compatibility_flags = ["nodejs_compat"]` — required for `node:crypto` use in `src/signing.js` and the Vitest configs.
- `packages/verify/` is published separately and targets Node `>= 20` with zero runtime dependencies (uses `node --test`).
