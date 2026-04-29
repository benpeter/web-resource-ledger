# Repository Structure

## Top-Level Layout

```
/
├── src/                — Main API Worker source (entry: src/index.js)
├── test/               — Vitest unit, integration, and Playwright e2e tests
├── migrations/         — D1 SQL migrations (sequential, numbered)
├── docs/               — Project docs: evolution log, history, operations, etc.
├── landing/            — Marketing site Worker (webresourceledger.com)
├── site/               — Eleventy docs site Worker (wrl-docs)
├── packages/           — Publishable npm packages (offline verify CLI)
├── scripts/            — Operational and dev scripts (smoke, migrations, etc.)
├── nimbalyst-local/    — Local-only architecture diagrams + plans (gitignored-style)
├── node_modules/       — Dependencies (ignore)
├── .wrangler/          — Wrangler local state (ignore)
├── .github/            — CI workflows + issue templates
├── .planning/          — Planning artefacts for orchestrator runs
├── .pi/                — pi agent state
├── .claude/            — Claude/agent config
├── wrangler.toml             — Production + staging Worker config (main API)
├── wrangler.test.toml        — Test environment Worker config
├── vitest.config.js          — Unit test runner config (workerd)
├── vitest.integration.config.js — Integration tests against real bindings
├── vitest.sync.config.ts     — Sync workflow tests
├── package.json              — Root deps + scripts (no top-level "main")
├── package-lock.json
├── openapi.yaml              — Full HTTP API contract (26 paths, ~220 KB)
├── redocly.yaml              — Redoc lint config
├── .redocly.lint-ignore.yaml
├── server.json               — MCP server manifest
├── glama.json                — Glama MCP registry metadata
├── README.md
├── CHANGELOG.md
├── OPERATIONS.md             — Runbook (cron, queues, on-call, alerts)
├── PRODUCT.md                — Product brief
├── CLAUDE.md                 — Project rules for Claude/pi agents
├── CLAUDE.local.md           — Symlinked to wrl-config repo (local-only)
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CONTENT-POLICY.md
├── DEPRECATION-POLICY.md
├── LICENSE
├── SECURITY.md
├── TERMS.md
├── .gitignore
├── .gitguardian.yml          — Pre-commit secret scanning config
└── .nvmrc
```

## src/ Layout

```
src/
├── index.js             — Worker entry: regex router, fetch/queue/scheduled handlers (~2 500 LOC)
├── db.js                — Centralized D1 data access layer (~2 100 LOC; the only place env.DB is touched)
├── kv.js                — KV-based rate-limit counters and ephemeral keys
├── cache.js             — Workers Cache API key helpers (Vary-aware)
├── responses.js         — RFC 7807 problem responses, JSON helpers, queue ack helpers
├── log.js               — Coralogix structured logger (mandatory for warn/error)
├── auth.js              — API key bearer-token verification + scopes
├── session.js           — HMAC-signed __Host-wrl_session cookie verify
├── oauth.js             — GitHub OAuth login/callback/logout flows
├── account.js           — /v1/account/* self-serve handlers
├── admin.js             — Key-auth admin endpoints (cache purge, tenant config, keys)
├── admin-dashboard.js   — /v1/admin/tenants and /v1/admin/overview JSON
├── billing.js           — Stripe checkout/portal handlers
├── stripe.js            — Stripe API client
├── stripe-webhook.js    — Stripe inbound webhook (signature-verified)
├── pricing.js           — Pricing/plan catalogue
├── meter-reporter.js    — Hourly metered usage push to Stripe
├── quotas.js            — Plan quota checks + enforcement
├── rate-limits.js       — Per-tier rate-limit policy
├── ip-hash.js           — HMAC-derived `cip` (no raw IPs in logs)
├── url-validation.js    — SSRF guard: scheme + DNS + IP allow-listing
├── threat-check.js      — Google Web Risk API (graceful degrade)
├── capture.js           — Browser-rendering capture pipeline orchestrator
├── wacz.js              — WACZ bundle builder
├── warc.js              — WARC record assembly used inside WACZ
├── signing.js           — Ed25519 signing + signing-key resolution
├── rfc3161.js           — TSA timestamp request/response (DigiCert + Sectigo)
├── canonical-json.js    — Canonical JSON for signing
├── certificate.js       — Per-capture evidence certificate
├── verify.js            — /v1/verify/{id} JSON verification
├── verify-page.js       — /v1/verify/{id} HTML evidence page
├── diff.js              — HTML, headers, screenshot diffs + change summary
├── webhooks.js          — Tenant webhook CRUD handlers
├── webhook-dispatch.js  — Queue producer + consumer for outbound webhooks
├── webhook-signing.js   — HMAC signing of outbound webhook payloads
├── notifications.js     — Email preferences, weekly digest, lifecycle triggers
├── email-dispatch.js    — Email queue producer + consumer (Resend)
├── email-verify.js      — /v1/notifications/verify-email handlers
├── unsubscribe.js       — /v1/notifications/unsubscribe handlers
├── consent.js           — Consent / autoconsent helpers
├── schedules.js         — /v1/schedules CRUD handlers
├── scheduler.js         — Cron tick: fan-out due schedules to capture queue
├── cron.js              — Cron-expression next-run helper
├── rescan.js            — Nightly URL re-scan tick (lazy-imported from index.js)
├── mcp.js               — MCP server adapter (POST /mcp), 11 tools
├── coralogix-webhook.js — Coralogix alert → GitHub repository_dispatch
├── pirsch.js            — Pirsch hit + event analytics
├── deprecations.js      — Sunset/Deprecation header policy
├── favicon.js           — Static favicon SVG bytes
├── design-system.css    — Shared CSS source
├── design-system.js     — CSS exported as JS string for /ui injection
├── ui/                  — Dashboard SPA (vanilla JS string modules)
│   ├── ui-shell.js      — Concatenates all views into a single <script>
│   ├── ui-css.js
│   ├── ui-auth.js
│   ├── ui-login.js
│   ├── ui-welcome.js
│   ├── ui-tos.js
│   ├── ui-settings.js
│   ├── ui-schedules.js
│   ├── ui-billing.js
│   ├── ui-notifications.js
│   ├── ui-submit.js     — Submit/list view
│   ├── ui-detail.js     — Capture detail view
│   ├── ui-diff.js       — Diff/compare view
│   └── ui-poll.js       — Poll-for-status helper
├── admin/               — Admin dashboard UI (mirror of src/ui/)
│   ├── admin-shell.js
│   ├── admin-css.js
│   ├── admin-auth.js
│   ├── admin-tenants.js
│   └── admin-detail.js
├── email/               — Email layout + templates
│   ├── email-layout.js
│   ├── email-tokens.js
│   └── templates/
│       ├── approaching-limit.js
│       ├── capture-failure.js
│       ├── email-verification.js
│       ├── invoice-generated.js
│       ├── limit-reached.js
│       ├── payment-failure.js
│       └── weekly-digest.js
├── assets/              — Inlined static assets (SVG)
│   ├── favicon.svg
│   ├── logo-doc-check.svg
│   └── logo-w-check.svg
└── vendor/              — Vendored third-party JS (do not edit; regenerated by scripts)
    ├── autoconsent-script.js
    └── autoconsent.playwright.js
```

## test/ Layout

```
test/
├── *.test.js            — Vitest unit/contract tests (~50 files, one per src module)
├── apply-migrations.js  — Helper: apply migrations into miniflare D1 for tests
├── fixtures.js          — Shared test fixtures
├── integration/         — Integration tests against real Cloudflare bindings
│   ├── advisory.test.js
│   ├── capture-pipeline.test.js
│   ├── fixtures/
│   └── global-setup.js
└── e2e/                 — Playwright end-to-end tests (run against staging)
    ├── playwright.config.js
    ├── global-setup.js
    ├── global-teardown.js
    ├── helpers/
    ├── batch-capture.spec.js
    ├── capture-verify.spec.js
    ├── key-rotation.spec.js
    ├── quota-enforcement.spec.js
    ├── verify-page.spec.js
    ├── webhook-lifecycle.spec.js
    └── README.md
```

## migrations/ Layout

Numbered, monotonically increasing SQL files applied by Wrangler against
the D1 binding `DB` (path declared in `wrangler.toml`).

```
migrations/
├── 0001_initial_schema.sql
├── 0002_usage_counters.sql
├── 0003_webhooks.sql
├── 0004_github_oauth.sql
├── 0005_tenant_tiers.sql
├── 0006_billing.sql
├── 0007_schedules.sql
├── 0008_metering.sql
├── 0009_threat_check.sql
├── 0010_share_tokens.sql
├── 0011_eidas.sql
├── 0012_billing_index.sql
├── 0013_drop_share_tokens.sql
├── 0014_notification_preferences.sql
├── 0015_change_summary.sql
├── 0016_email_verification.sql
└── 0017_invoice_cache.sql
```

## docs/ Layout

```
docs/
├── INTERNALS.md                — Internal-architecture deep dive
├── MVP.md                      — MVP scope notes
├── audit-log-schema.md         — Audit log field contract
├── backlog.md                  — Mandatory backlog (see CLAUDE.md)
├── mcp.md                      — MCP tool documentation
├── style-guide.md
├── evolution/                  — Phase log: 0001…0107 + README.md (mandatory per CLAUDE.md)
│   └── NNNN-short-name/
│       ├── prompt.md
│       ├── decisions.md
│       ├── outcome.md
│       └── process.md          — Required after nefario PRs
├── history/
│   └── nefario-reports/        — Specialist agent transcripts
├── operations/                 — Operational runbooks supplementing OPERATIONS.md
├── product-management/         — Product specs / briefs
└── superpowers/                — Internal capability notes
```

## landing/ Layout

```
landing/
├── wrangler.toml         — Worker config for marketing site
├── public/               — Static assets served by ASSETS binding
│   ├── index.html
│   ├── 404.html
│   ├── content-policy.html
│   ├── privacy.html
│   ├── refund-policy.html
│   ├── security.html
│   ├── terms.html
│   ├── llms.txt
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── assets/
│   └── css/
└── src/
    └── index.js          — fetch handler: CSP/security headers + Pirsch hit logging
```

## site/ Layout

Eleventy-built documentation site.

```
site/
├── wrangler.toml
├── package.json          — Eleventy build deps
├── eleventy.config.js
├── _data/, _includes/, _headers
├── src/                  — Worker shim
├── content/              — Authored markdown
├── css/, js/, assets/
├── _output/              — Build output (served via ASSETS)
└── _site/                — Eleventy default output (intermediate)
```

## packages/ Layout

```
packages/
└── verify/               — Publishable: @w-r-l/verify (CLI: wrl-verify)
    ├── bin/wrl-verify.js
    ├── lib/
    │   ├── canonical-json.js
    │   ├── cli.js
    │   ├── cms-verify.js
    │   ├── format-legal.js
    │   ├── format.js
    │   ├── key-resolver.js
    │   ├── rfc3161.js
    │   ├── sha256.js
    │   ├── signing.js
    │   └── verify.js
    ├── certs/            — Bundled TSA chain certs
    ├── test/
    ├── package.json
    ├── README.md
    ├── CHANGELOG.md
    └── LICENSE
```

## scripts/ Layout

```
scripts/
├── autonomous/           — Long-running orchestration scripts
├── changelog-verify.sh
├── check-version-sync.sh
├── create-investigation-labels.sh
├── generate-favicon.sh
├── generate-signing-key.js
├── migrate-kv-to-d1.js
├── provision-alerts.sh
├── purge-cache.sh
├── smoke-test.sh
├── test-battery.js
└── vendor-autoconsent.js — Regenerates src/vendor/autoconsent*.js
```

## nimbalyst-local/

Working directory for local-only architecture diagrams and plans
(referenced from agent runs). Contains Mermaid + SVG diagrams of the
capture pipeline phases, plus per-task plans.

```
nimbalyst-local/
├── automations/
├── plans/
├── capture-logs-detail.md
├── capture-pipeline.md
├── phase1-api-handler.{mmd,svg}
├── phase2-queue-consumer.{mmd,svg}
└── phase3-async.{mmd,svg}
```

## Where Things Live

| Concern                              | Location                                                 |
|--------------------------------------|----------------------------------------------------------|
| Worker entry (HTTP/queue/cron)       | `src/index.js`                                           |
| HTTP routing table                   | `src/index.js` (`const routes = [...]`, ~line 65)        |
| Route handlers (capture/verify/etc.) | `src/index.js` for top-level + dedicated modules         |
| Account self-serve handlers          | `src/account.js`                                         |
| Admin handlers (key-auth)            | `src/admin.js`, `src/admin-dashboard.js`                 |
| OAuth + sessions                     | `src/oauth.js`, `src/session.js`                         |
| Schedule handlers                    | `src/schedules.js`                                       |
| Webhook handlers                     | `src/webhooks.js`, `src/webhook-dispatch.js`             |
| Capture pipeline                     | `src/capture.js` + `wacz.js` + `warc.js`                 |
| Browser autoconsent                  | `src/vendor/autoconsent*.js` (regenerate via `scripts/vendor-autoconsent.js`) |
| Signing / timestamps                 | `src/signing.js`, `src/rfc3161.js`, `src/canonical-json.js` |
| Verification (server)                | `src/verify.js`, `src/verify-page.js`                    |
| Verification (offline CLI)           | `packages/verify/`                                       |
| Diff engine                          | `src/diff.js`                                            |
| Data access (D1)                     | `src/db.js` only — no other module touches `env.DB`      |
| Database migrations                  | `migrations/NNNN_*.sql`                                  |
| KV usage                             | `src/kv.js`                                              |
| R2 usage                             | `src/capture.js` (writes), `src/index.js` retrieval handlers (reads) |
| Logging                              | `src/log.js` — `console.*` is forbidden in production code |
| Coralogix → GitHub auto-investigate  | `src/coralogix-webhook.js`                               |
| Analytics                            | `src/pirsch.js`                                          |
| Email templates                      | `src/email/templates/*.js` (+ `email-layout.js`, `email-tokens.js`) |
| Notifications + digest               | `src/notifications.js`, `src/email-dispatch.js`          |
| MCP server                           | `src/mcp.js`                                             |
| Dashboard UI views                   | `src/ui/ui-*.js` (one global JS scope — see `CLAUDE.md`) |
| Admin dashboard UI                   | `src/admin/admin-*.js`                                   |
| Static assets (SVG, favicon)         | `src/assets/`, `src/favicon.js`                          |
| OpenAPI contract                     | `openapi.yaml` (root)                                    |
| MCP registry metadata                | `server.json`, `glama.json`                              |
| Tests (unit/contract)                | `test/*.test.js`                                         |
| Tests (integration)                  | `test/integration/`                                      |
| Tests (e2e Playwright)               | `test/e2e/`                                              |
| Test config                          | `vitest.config.js`, `vitest.integration.config.js`, `vitest.sync.config.ts`, `wrangler.test.toml` |
| Cloudflare bindings (prod + staging) | `wrangler.toml`                                          |
| Operational runbook                  | `OPERATIONS.md`, `docs/operations/`                      |
| Phase / decision log                 | `docs/evolution/NNNN-*/`                                 |
| Backlog                              | `docs/backlog.md` (mandatory updates per phase)          |
| Marketing site                       | `landing/`                                               |
| Docs site (Eleventy)                 | `site/`                                                  |
| Operational scripts                  | `scripts/`                                               |

## Naming Conventions

- **Files**: `kebab-case.js` for all source files (`webhook-dispatch.js`,
  `email-verify.js`, `ui-shell.js`). UI module file names use a
  `ui-<view>.js` prefix; admin equivalents use `admin-<view>.js`. Email
  templates live in `src/email/templates/<event>.js`.
- **Migrations**: `NNNN_snake_case.sql`, zero-padded four-digit prefix,
  monotonically increasing.
- **Evolution log entries**: `docs/evolution/NNNN-short-name/` with
  hyphenated slug (`0107-stripe-authoritative-billing`). Per `CLAUDE.md`,
  every phase requires `prompt.md`, `decisions.md`, `outcome.md` (and
  `process.md` after nefario PRs).
- **Tests**: `<module>.test.js` mirroring the source module name.
  Playwright specs use `<feature>.spec.js`.
- **JS identifiers**: `camelCase` for variables and functions,
  `PascalCase` for classes (rare), `SCREAMING_SNAKE_CASE` for top-level
  constants and exported JS-string blobs (`DESIGN_SYSTEM_CSS`,
  `DETAIL_VIEW_JS`, `FAVICON_SVG`, `RATE_LIMITS`, `TENANT_ID_RE`).
- **IDs**: prefixed lowercase hex — capture `cap_<32 hex>`, webhook
  `whk_<32 hex>`, schedule `sch_<32 hex>`. Tenant IDs match
  `^[a-z0-9_-]{1,64}$` (`TENANT_ID_RE`).
- **UI scope discipline**: because all `src/ui/*.js` modules end up in one
  global scope, function and module-level variable names must be
  view-prefixed (`detail_loadCaptures`, `submit_loadCaptures`,
  `_listEl` → `submit_listEl`). See `CLAUDE.md` "Dashboard UI Architecture".
- **Top-level docs**: `UPPER-CASE.md` for canonical project docs
  (`README.md`, `CHANGELOG.md`, `OPERATIONS.md`, `PRODUCT.md`, `TERMS.md`,
  etc.); lowercase under `docs/`.

## Notable Single Files at Root

| File                              | Purpose                                                           |
|-----------------------------------|-------------------------------------------------------------------|
| `wrangler.toml`                   | Production + staging Worker config: bindings, queues, crons, routes |
| `wrangler.test.toml`              | Workerd config for vitest                                         |
| `vitest.config.js`                | Unit/contract test runner config                                  |
| `vitest.integration.config.js`    | Integration test config (real bindings)                           |
| `vitest.sync.config.ts`           | Sync workflow tests                                               |
| `openapi.yaml`                    | Authoritative HTTP API contract (~220 KB, 26 paths)               |
| `redocly.yaml` + `.redocly.lint-ignore.yaml` | OpenAPI lint config                                    |
| `server.json` / `glama.json`      | MCP server registry metadata                                      |
| `OPERATIONS.md`                   | On-call runbook: queues, crons, alerts, secrets                   |
| `CHANGELOG.md`                    | User-facing release history                                       |
| `PRODUCT.md`                      | Product brief                                                     |
| `CLAUDE.md` / `CLAUDE.local.md`   | Project rules for Claude/pi agents (precedence over skills)       |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CONTENT-POLICY.md`, `DEPRECATION-POLICY.md`, `SECURITY.md`, `TERMS.md`, `LICENSE` | Governance & legal |
| `.gitguardian.yml`                | Pre-commit secret scanning rules                                  |
| `.nvmrc`                          | Pinned Node version                                               |
