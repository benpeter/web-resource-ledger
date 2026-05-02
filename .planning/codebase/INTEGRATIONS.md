# External Integrations

All bindings and external services are declared in `wrangler.toml` (production) with mirrored definitions under `[env.staging.*]` for the staging environment. Test secrets are injected via `vitest.config.js` and `vitest.integration.config.js`.

## Cloudflare Platform Bindings

Declared in `wrangler.toml`:

| Binding | Type | Resource | Purpose | Used in |
| --- | --- | --- | --- | --- |
| `DB` | D1 | `wrl-metadata` (`e07352f4-…`); staging: `wrl-metadata-staging` | Tenant config, captures index, API keys, OAuth users/sessions, webhooks, schedules, billing, notifications, threat-check results. Migrations in `migrations/` (0001 → 0017). | `src/db.js`, `src/admin*.js`, `src/oauth.js`, `src/account.js`, `src/billing.js`, `src/schedules.js`, `src/notifications.js`, etc. |
| `BUCKET` | R2 | `wrl-captures` (preview: `wrl-captures-preview`); staging: `wrl-captures-staging` | Stores capture artifacts: WACZ bundles, screenshots (before/after consent), HTML, headers JSON, signing key history. | `src/capture.js`, `src/wacz.js`, `src/verify.js`, `src/index.js` (artifact retrieval) |
| `KV` | KV namespace | id `b5cd6168…`; preview `d7d4739a…`; staging `ed564f8e…` | Rate-limit counters, capture status (pending/done), OAuth state + PKCE verifier, first-API-key one-time storage, Coralogix alert dedup, dispatch circuit breaker. | `src/kv.js`, `src/rate-limits.js`, `src/oauth.js`, `src/coralogix-webhook.js` |
| `BROWSER` | Browser Rendering | — | Headless Chromium for screenshot/HTML capture pipeline. | `src/capture.js` (via `@cloudflare/playwright`) |
| `CAPTURE_QUEUE` (producer) / `wrl-captures` (consumer) | Queue | — | Main capture job queue. `max_batch_size=1`, `max_retries=3`, `max_concurrency=10` (prod) / `2` (staging). | Producer: `src/index.js`, `src/scheduler.js`. Consumer: `src/capture.js` (entry via `src/index.js#queue()`) |
| `CAPTURE_DLQ` / `wrl-captures-dlq` | Queue | — | Dead letter for exhausted capture jobs. | `src/index.js` queue dispatcher |
| `WEBHOOK_QUEUE` / `wrl-webhooks` (+ DLQ) | Queue | — | Outbound webhook fan-out (one msg per capture×webhook). `max_concurrency=20`. | `src/webhook-dispatch.js` |
| `WEBHOOK_DLQ` / `wrl-webhooks-dlq` | Queue | — | DLQ for webhook delivery. | `src/webhook-dispatch.js` (`handleWebhookDlqMessage`) |
| `EMAIL_QUEUE` / `wrl-emails` (+ DLQ) | Queue | — | Outbound transactional email fan-out. `max_concurrency=5`. | `src/email-dispatch.js` |
| `EMAIL_DLQ` / `wrl-emails-dlq` | Queue | — | DLQ for email delivery. | `src/email-dispatch.js` |
| `CAPTURE_RATE_LIMITER` | Rate Limit (`unsafe.bindings`) | nsId 1001 (prod) / 2001 (staging) | Per-tenant ceiling 100/60s for capture endpoints. App enforces tighter per-tenant limits via KV. | `src/rate-limits.js`, `src/index.js` |
| `VERIFY_RATE_LIMITER` | Rate Limit | 1002 / 2002 | 60/60s ceiling for `/v1/verify`. | `src/rate-limits.js` |
| `GLOBAL_CAPTURE_LIMITER` | Rate Limit | 1003 / 2003 | 200/60s global capture ceiling across all tenants. | `src/rate-limits.js` |
| `ADMIN_RATE_LIMITER` | Rate Limit | 1004 / 2004 | 30/60s for admin endpoints. | `src/admin.js`, `src/admin-dashboard.js` |
| `CAPTURE_IP_GUARD` | Rate Limit | 1005 / 2005 | 50/60s per-IP guard against abuse. | `src/index.js` (capture creation path) |
| `AUTH_RATE_LIMITER` | Rate Limit | 1006 / 2006 | 10/60s for auth endpoints (OAuth, session). | `src/oauth.js` |

**Cron triggers** (`wrangler.toml [triggers].crons`):
- `*/1 * * * *` — every minute, drives schedule evaluation. Handler: `handleScheduledTick` in `src/scheduler.js` (enqueues due capture jobs onto `CAPTURE_QUEUE`).
- `0 3 * * *` (prod) / `0 4 * * *` (staging) — nightly URL re-scan job (`RESCAN_CRON`); see `src/rescan.js` and `src/threat-check.js`.
- `0 9 * * 1` — weekly digest emails (`handleWeeklyDigest` in `src/notifications.js`).
- Pending Stripe meter events are reported in the same cron tick via `src/meter-reporter.js#reportPendingMeterEvents`.

Cron handler dispatch lives in `src/index.js` `scheduled()` export.

## External Services

### Stripe (billing)
- Purpose: Subscription / metered billing, checkout sessions, customer portal, usage reporting.
- Config: `wrangler.toml` `[vars]` — `STRIPE_PUBLISHABLE_KEY` (live key in prod, test key in staging), `STRIPE_CAPTURE_PRICE_ID`. Secrets via `wrangler secret put`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Stripe API version pinned to `2025-04-30.basil` in `src/stripe.js`.
- Outbound: `https://api.stripe.com` — direct `fetch()`-based client (no Stripe SDK) in `src/stripe.js` with bracket-notation form-encoded params.
- Used in: `src/stripe.js` (low-level client), `src/billing.js` (`/billing/checkout`, `/billing/portal`), `src/meter-reporter.js` (usage reporting), `src/stripe-webhook.js`.
- Inbound webhook: `POST /billing/webhook` → `handleStripeWebhook` (`src/billing.js`) — verifies `STRIPE_WEBHOOK_SECRET` signature.

### GitHub OAuth (user auth)
- Purpose: Self-serve sign-in for the dashboard (`/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/session`).
- Config: `wrangler.toml` `[vars].GITHUB_CLIENT_ID` (prod: `Ov23liIG5Of9wSbgcFqW`, staging: `Ov23li0lii7I7Y43lbUs`). Secrets: `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (HMAC for cookie signing).
- Outbound: `https://github.com/login/oauth/authorize`, `https://github.com/login/oauth/access_token`, `https://api.github.com/user`, `https://api.github.com/user/emails`.
- Used in: `src/oauth.js` (full OAuth + PKCE flow), `src/session.js` (HMAC-signed `__Host-wrl_session` cookies).
- Security notes (per file headers): GitHub access tokens are never stored or logged; OAuth state is single-use in KV with 600 s TTL; session IDs are SHA-256 hashed before D1 storage.

### GitHub repository_dispatch (alert investigation)
- Purpose: Coralogix alerts trigger a `repository_dispatch` event that runs an "investigate-alert" GitHub Actions workflow.
- Config: secret `GITHUB_DISPATCH_TOKEN` (fine-grained PAT with `actions:write`, 90-day expiry).
- Outbound: `POST https://api.github.com/repos/benpeter/web-resource-ledger/dispatches`.
- Used in: `src/coralogix-webhook.js`. Inbound endpoint: `POST /v1/webhooks/coralogix` (auth: bearer `CORALOGIX_WEBHOOK_SECRET`).

### Resend (transactional email)
- Purpose: Verification emails, billing notifications, capture-failure alerts, weekly digests.
- Config: secret `RESEND_API_KEY` (set via `wrangler secret put`).
- Outbound: `POST https://api.resend.com/emails`.
- Used in: `src/email-dispatch.js` (queue consumer; direct `fetch()` — Resend npm SDK is explicitly NOT used per the file header). Templates live in `src/email/templates/` rendered through `src/email/email-layout.js` and `src/email/email-tokens.js`.
- Trigger surface: `src/notifications.js`, `src/billing.js`, `src/email-verify.js`, `src/unsubscribe.js`.

### RFC 3161 Time-Stamp Authorities (TSA)
- Purpose: Trusted timestamping of WACZ bundle hashes for tamper-evident archival.
- Config (`wrangler.toml [vars]`):
  - `TSA_URL = "http://timestamp.digicert.com"` — default DigiCert TSA.
  - `QUALIFIED_TSA_URL = "https://timestamp.sectigo.com/qualified"` — Sectigo qualified (eIDAS) TSA, used when `tenants.eidas_qualified` is enabled.
  - Optional secret `QUALIFIED_TSA_AUTH` — pre-encoded base64 user:pass for HTTP Basic auth (omit if TSA needs none).
- Outbound: ASN.1/DER `application/timestamp-query` POST to the TSA URL; 3 s timeout, 64 KB response cap.
- Used in: `src/rfc3161.js` (`requestTimestamp`), invoked from `src/wacz.js`.

### Google Web Risk
- Purpose: URL safety screening before capture and on nightly re-scan to flag malware / phishing / unwanted-software.
- Config: secret `GOOGLE_WEB_RISK_API_KEY` (degrades open if absent — `reason: 'no_api_key'`).
- Outbound: `https://webrisk.googleapis.com/v1/uris:search` (API key sent as `X-Goog-Api-Key` header, never as query string). 2 s timeout.
- Used in: `src/threat-check.js` (`checkUrl`, `checkUrls`), called from `src/index.js` (capture creation) and `src/rescan.js`.

### Pirsch Analytics
- Purpose: Privacy-respecting product analytics — page hits and custom events.
- Config: secret `PIRSCH_ACCESS_KEY`. Test config injects `'test-pirsch-key-for-vitest'` (`vitest.config.js`).
- Outbound: `POST https://api.pirsch.io/api/v1/hit`, `POST https://api.pirsch.io/api/v1/event` — Bearer auth, fire-and-forget through `ctx.waitUntil`.
- Used in: `src/pirsch.js` (`trackEventRaw`, used from `src/index.js`, `src/billing.js`).

### Cloudflare API (cache purge)
- Purpose: Admin-triggered cache purges (e.g., after capture re-render).
- Config: `wrangler.toml [vars].CLOUDFLARE_ZONE_ID = "9b1b321a3921da4741063f25d6935a74"`. Secret: `CLOUDFLARE_CACHE_PURGE_TOKEN` (API token with Cache Purge permission).
- Outbound: `POST https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/purge_cache`.
- Used in: `src/admin.js#handleAdminCachePurge`. Helper: `scripts/purge-cache.sh`.

### Cookie consent (vendored, not a network dependency)
- Library: `@duckduckgo/autoconsent` `^14.66.0`.
- Vendored bundle: `src/vendor/autoconsent-script.js`, `src/vendor/autoconsent.playwright.js` — refreshed via `npm run vendor:autoconsent` (`scripts/vendor-autoconsent.js`) with auto-update workflow `.github/workflows/autoconsent-update.yml`.
- Used in: `src/consent.js` and injected into pages by `src/capture.js`. The injected script is server-controlled, never caller-supplied. 2 s hard timeout per capture.

## Auth & Identity

| Mechanism | Where | Notes |
| --- | --- | --- |
| API keys (Bearer) | `src/auth.js` (`verifyApiKey`, `verifyAdminKey`, `hashApiKey`) | Issued via `/v1/account/keys` (`src/account.js`) and admin endpoints (`src/admin.js`). Stored as SHA-256 hashes in D1. Used by `Authorization: Bearer …`. Test value: `CAPTURE_API_KEY=test-api-key-for-vitest`. |
| GitHub OAuth + PKCE | `src/oauth.js`, `src/session.js` | See **GitHub OAuth** above. State + PKCE verifier kept in KV (10 min TTL). |
| Session cookies | `src/session.js` (HMAC-signed `__Host-wrl_session`) | Used by the dashboard UI; signed with `SESSION_SECRET` (32+ random bytes hex). `verifyAuth` in `src/index.js` tries cookie first, then API key. |
| Admin key | `src/auth.js#verifyAdminKey` | Static admin secret `ADMIN_KEY` for `/v1/admin/*` endpoints. Test value injected via `vitest.config.js`. |
| Coralogix webhook auth | `src/coralogix-webhook.js` | Bearer token `CORALOGIX_WEBHOOK_SECRET`, timing-safe compare. |
| Stripe webhook signature | `src/billing.js` / `src/stripe.js` | `STRIPE_WEBHOOK_SECRET` HMAC verification on `/billing/webhook`. |
| Webhook outbound HMAC | `src/webhook-signing.js` | Per-tenant webhook secret signs outbound payload; secret never logged. |
| IP hashing | `src/ip-hash.js` (`computeCip`) | HMAC of client IP using `IP_HASH_SEED` secret. Raw IPs are never logged (per `src/log.js` invariants). |

## Webhooks

**Inbound** (handlers in `src/index.js` route table):
- `POST /billing/webhook` → `handleStripeWebhook` (`src/billing.js`) — Stripe events.
- `POST /v1/webhooks/coralogix` → `handleCoralogixWebhook` (`src/coralogix-webhook.js`) — Coralogix alerts → GitHub repository_dispatch.

**Outbound:**
- Per-tenant subscription webhooks managed via `/v1/webhooks` endpoints (`src/webhooks.js` — `handleCreateWebhook`, `handleListWebhooks`, `handleDeleteWebhook`, `handlePingWebhook`).
- Delivery via `WEBHOOK_QUEUE` consumer (`src/webhook-dispatch.js`): one queue message per (capture, webhook) pair, HMAC-signed payload (signed JSON serialized once), SSRF re-validation at delivery, retries at 60 s / 5 min / 15 min, then DLQ.

## Observability

- **Coralogix** — primary log sink. Per `CLAUDE.md`: all logging must use `log(env, severity, subsystem, data)` from `src/log.js`. `console.*` is forbidden in production code.
  - Endpoint: `wrangler.toml [vars].CORALOGIX_ENDPOINT = "https://ingress.eu2.coralogix.com/logs/v1/singles"`.
  - Application name: `APPLICATION_NAME = "wrl"` / `"wrl-staging"` / `"wrl-landing"`.
  - Secret: `CORALOGIX_SEND_KEY` (`wrangler secret put`).
  - Implementation: `src/log.js` — fire-and-forget `fetch()`; no-ops if endpoint or key absent (local dev / preview / tests). Strict invariant: `data` payload must contain only static / pre-validated values; never raw user input or secrets. The landing Worker (`landing/`) ships its own copy.
  - Alerts feed back via `POST /v1/webhooks/coralogix` (see `src/coralogix-webhook.js` and `scripts/provision-alerts.sh`).
- **GitHub Actions investigation runs** — Coralogix alerts trigger `repository_dispatch` events handled by `.github/workflows/investigate-alert.yml`.
- No Sentry / Logflare / Datadog integrations.
- Local dev / `wrangler tail` is the fallback when Coralogix is not configured.

## Browser Automation

- **Cloudflare Browser Rendering binding** (`BROWSER`) accessed via the **`@cloudflare/playwright`** library.
  - Imports in `src/capture.js`: `connect`, `acquire`, `sessions`, `limits`.
  - Uses Playwright's session reuse model: `sessions()` lists active browser processes; free sessions are claimed via `connect()`. If pool is exhausted, capture fails immediately to preserve the 15-minute queue consumer wall clock.
  - Each capture creates a fresh `BrowserContext` (cookies, localStorage, IndexedDB, service workers all scoped) and closes it in try/finally. `serviceWorkers: 'block'`.
  - Test runner: Miniflare wires the Browser binding via `miniflare.browserRendering: { binding: 'BROWSER' }` in `vitest.config.js` and `vitest.integration.config.js`.
- **Playwright (E2E)** — `@playwright/test` ^1.58.2 — runs against deployed staging from `test/e2e/` (config: `test/e2e/playwright.config.js`).

## Third-Party Vendor Code (`src/vendor/`)

- `src/vendor/autoconsent-script.js` — bundled `@duckduckgo/autoconsent` runtime injected into pages during capture to dismiss cookie/CMP banners.
- `src/vendor/autoconsent.playwright.js` — Playwright integration helpers from the same library.
- Refresh script: `scripts/vendor-autoconsent.js` (npm script `vendor:autoconsent`); automated via `.github/workflows/autoconsent-update.yml`.
- Per `CLAUDE.md`, vendor files are exempt from the "log via Coralogix not console" rule.

## Secrets Inventory (per `wrangler.toml` comments)

Set via `wrangler secret put <NAME>` (and `--env staging` for staging):

| Secret | Used by |
| --- | --- |
| `CORALOGIX_SEND_KEY` | `src/log.js` |
| `IP_HASH_SEED` | `src/ip-hash.js` |
| `GITHUB_CLIENT_SECRET` | `src/oauth.js` |
| `SESSION_SECRET` | `src/session.js` |
| `STRIPE_SECRET_KEY` | `src/stripe.js` |
| `STRIPE_WEBHOOK_SECRET` | `src/billing.js` |
| `RESEND_API_KEY` | `src/email-dispatch.js` |
| `GOOGLE_WEB_RISK_API_KEY` | `src/threat-check.js` |
| `CLOUDFLARE_CACHE_PURGE_TOKEN` | `src/admin.js` |
| `CORALOGIX_WEBHOOK_SECRET` | `src/coralogix-webhook.js` |
| `GITHUB_DISPATCH_TOKEN` | `src/coralogix-webhook.js` |
| `QUALIFIED_TSA_AUTH` (optional) | `src/rfc3161.js` |
| `SIGNING_KEY` | `src/signing.js` (Ed25519 PKCS8 base64; tests generate ephemeral keys) |
| `TEST_ARCHIVED_KEY` | `src/signing.js` (key rotation tests) |
| `CAPTURE_API_KEY`, `ADMIN_KEY` | `src/auth.js` |
| `PIRSCH_ACCESS_KEY` | `src/pirsch.js` |
