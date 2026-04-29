# Architecture

## Overall Pattern

**Single Cloudflare Worker monolith** plus two auxiliary Workers for static
content. The product is the API Worker. Everything user-facing routes
through the same Worker process, which serves:

- The JSON HTTP API (`api.webresourceledger.com`)
- The verification subdomain (`verify.webresourceledger.com`, allow-listed
  paths only)
- The dashboard SPA shell at `GET /ui` (vanilla JS, server-rendered HTML
  string — no build step)
- The admin dashboard shell at `GET /admin`
- The MCP (Model Context Protocol) endpoint at `POST /mcp`
- OAuth/session flows under `/auth/*`
- Stripe and Coralogix inbound webhooks

Two additional Workers live alongside the main API:

- `landing/` — Worker fronting the marketing site
  (`webresourceledger.com`). Static assets via the `ASSETS` binding plus a
  thin `fetch()` handler that adds CSP/security headers and forwards hits to
  Pirsch analytics. Source: `landing/src/index.js`.
- `site/` — Eleventy-built docs site (`wrl-docs`). Static `_output/` served
  by Cloudflare Assets with a small Worker shim (`site/src/index.js`,
  `site/wrangler.toml`).

A separate npm-publishable package, `packages/verify/`, ships the
`@w-r-l/verify` CLI (`wrl-verify`) for offline cryptographic verification
of WACZ bundles. It is not part of the deployed Worker.

## Entry Points

- `wrangler.toml` → `main = "src/index.js"`
- `src/index.js` exports a single default object with three handlers:
  ```js
  export default {
    async scheduled(controller, env, ctx) { … },  // cron triggers
    async queue(batch, env, ctx) { … },           // queue consumer
    async fetch(request, env, ctx) { … },         // HTTP requests
  };
  ```
- Landing Worker entry: `landing/src/index.js`
- Docs Worker entry: `site/src/index.js`
- CLI entry: `packages/verify/bin/wrl-verify.js`

## Request Flow (HTTP)

```
                ┌──────────────────────────────────────────┐
                │  Cloudflare edge                         │
                │  (custom domains: api.* and verify.*)    │
                └───────────────────┬──────────────────────┘
                                    ▼
                          src/index.js  fetch()
                                    │
        ┌───────────────────────────┼─────────────────────────────┐
        ▼                           ▼                             ▼
  verify.* host          /mcp endpoint                  Everything else
  allowlist filter       handleMcp(...)                 (regex routing
  (returns 404 for       (src/mcp.js)                   table)
   non-verify paths)                                       │
                                                           ▼
                                           ┌─── Pre-route gates ───┐
                                           │ 1. CORS preflight     │
                                           │ 2. Admin rate limit   │
                                           │    + verifyAdminKey   │
                                           │ 3. AUTH_RATE_LIMITER  │
                                           │    for /auth/*,       │
                                           │    /v1/notifications/*│
                                           │ 4. Session gate +     │
                                           │    ToS + CSRF for     │
                                           │    /v1/account/*,     │
                                           │    /v1/billing/*      │
                                           │ 5. Capture-GET auth   │
                                           │    (optional bearer/  │
                                           │    session for tenant │
                                           │    isolation)         │
                                           └──────────┬────────────┘
                                                      ▼
                                       ┌─── routes table match ───┐
                                       │ [method, regex, handler] │
                                       │ in src/index.js          │
                                       └──────────┬───────────────┘
                                                  ▼
                                          handler(request, env,
                                                  ctx, match)
                                                  │
                                                  ▼
                                ┌──── per-handler tenant rate ────┐
                                │ checkCaptureRateLimit(...)      │
                                │ + KV counter + unsafe ratelimit │
                                │   binding (CAPTURE/VERIFY/etc.) │
                                └──────────┬──────────────────────┘
                                           ▼
                                      Business logic
                                  (db.js, capture.js, verify.js,
                                   diff.js, signing.js, …)
                                           │
                                           ▼
                              Response → security headers
                              (HSTS, XCTO, X-Frame-Options,
                               Referrer-Policy, X-RateLimit-*,
                               WRL-API-Version, Link to TERMS)
                              → returned to client
```

The router is a literal array of `[method, RegExp, handler]` tuples in
`src/index.js` (see ~line 65 onward). Order matters; specific patterns are
declared before less specific ones. After all gates pass, a single `for`
loop linearly matches the first hit. Misses return a static 404 problem
response (CWE-209-safe).

Pre-route gates short-circuit by setting `response`. Tenant-scoped
authentication is attached to `env._captureAuth` / `env._session` for
downstream handlers (a controlled use of the env object as a per-request
bag).

## Major Subsystems

| Subsystem            | Source                                          | Purpose                                                                    |
|----------------------|-------------------------------------------------|----------------------------------------------------------------------------|
| HTTP entry / routing | `src/index.js`                                  | Single fetch/queue/scheduled export, regex router, gates                   |
| Capture pipeline     | `src/capture.js` (+ `wacz.js`, `warc.js`)       | Headless Chromium render, dual screenshots, autoconsent, WACZ bundling     |
| Browser / consent    | `src/vendor/autoconsent*.js`                    | Vendored DuckDuckGo autoconsent for CMP dismissal                          |
| Signing & timestamps | `src/signing.js`, `src/rfc3161.js`              | Ed25519 capture signing, RFC 3161 TSA timestamps (DigiCert + Sectigo)      |
| Verification         | `src/verify.js`, `src/verify-page.js`           | `/v1/verify/{id}` JSON + HTML evidence pages                               |
| Diff                 | `src/diff.js`                                   | HTML, headers, screenshot diffing, change summaries                        |
| Data layer (D1)      | `src/db.js` (2 100 LOC)                         | All D1 prepared statements; centralized data access (no raw env.DB elsewhere) |
| KV layer             | `src/kv.js`                                     | Rate-limit counters, ephemeral keys (not metadata)                         |
| URL / SSRF guard     | `src/url-validation.js`                         | Scheme + DNS + IP allow-listing for inbound URLs                           |
| Threat checks        | `src/threat-check.js`                           | Google Web Risk API (degrades gracefully)                                  |
| Auth (API key)       | `src/auth.js`                                   | Bearer-token verification, scopes                                          |
| Auth (session)       | `src/session.js`, `src/oauth.js`                | GitHub OAuth → HMAC-signed `__Host-wrl_session` cookie                     |
| Account self-serve   | `src/account.js`                                | Per-user keys, settings, ToS, usage                                        |
| Notifications        | `src/notifications.js`, `src/email-verify.js`, `src/unsubscribe.js`, `src/email-dispatch.js`, `src/email/templates/*` | Email digest, lifecycle emails via Resend |
| Admin (key-auth)     | `src/admin.js`                                  | API-key admin endpoints (cache purge, tenant config)                       |
| Admin dashboard      | `src/admin-dashboard.js`, `src/admin/*`         | `/admin` UI shell + tenant overview JSON                                   |
| Dashboard UI         | `src/ui/*`, `src/design-system.{css,js}`        | `/ui` shell concatenated from JS string modules — single global scope      |
| Webhooks             | `src/webhooks.js`, `src/webhook-dispatch.js`, `src/webhook-signing.js` | Tenant-registered HMAC-signed event dispatch via queue          |
| Schedules / cron     | `src/schedules.js`, `src/scheduler.js`, `src/cron.js`, `src/rescan.js` | Tenant-scheduled captures + nightly URL re-scan + weekly digest |
| Billing              | `src/billing.js`, `src/stripe.js`, `src/stripe-webhook.js`, `src/pricing.js`, `src/meter-reporter.js`, `src/quotas.js` | Stripe checkout/portal, metered usage reporting, quotas |
| Certificate output   | `src/certificate.js`                            | Per-capture certificate (legal-grade evidence summary)                     |
| Logging              | `src/log.js`                                    | Coralogix structured logging (the single allowed warn/error sink)          |
| Operational hooks    | `src/coralogix-webhook.js`                      | Coralogix → GitHub repository_dispatch auto-investigate                    |
| Analytics            | `src/pirsch.js`                                 | Pirsch hit + event tracking                                                |
| MCP                  | `src/mcp.js`                                    | 11 MCP tools wired to existing business logic (no HTTP self-calls)         |
| Deprecations         | `src/deprecations.js`                           | Sunset/Deprecation header policy                                           |
| Cache                | `src/cache.js`                                  | Workers Cache API key construction (Vary-aware via `?_fmt=`)               |
| Responses            | `src/responses.js`                              | RFC 7807 problem responses, JSON helpers, queue ack helpers                |
| Rate-limit policy    | `src/rate-limits.js`                            | Per-tier limits and effective-limit resolution                             |
| IP hashing           | `src/ip-hash.js`                                | HMAC-derived `cip` for log correlation without raw IPs                     |

## Data Flow & Bindings

Cloudflare bindings declared in `wrangler.toml`:

| Binding                    | Type                  | Use                                                                 |
|----------------------------|-----------------------|---------------------------------------------------------------------|
| `DB`                       | D1                    | All metadata: captures, tenants, api_keys, signing_keys, usage, webhooks, schedules, etc. Owned exclusively by `src/db.js`. |
| `BUCKET`                   | R2                    | Capture artifacts: screenshots, rendered HTML, headers, WACZ bundles. Read by retrieval/verify handlers. |
| `KV`                       | KV                    | Rate-limit counters and short-lived state (see `src/kv.js`).        |
| `BROWSER`                  | Browser Rendering     | Headless Chromium (`@cloudflare/playwright`) used by `capture.js`.  |
| `CAPTURE_QUEUE` / `CAPTURE_DLQ`     | Queues       | Capture work fan-out and dead-letter.                                |
| `WEBHOOK_QUEUE` / `WEBHOOK_DLQ`     | Queues       | Outbound webhook delivery.                                           |
| `EMAIL_QUEUE` / `EMAIL_DLQ`         | Queues       | Outbound email via Resend.                                           |
| `CAPTURE_RATE_LIMITER`, `VERIFY_RATE_LIMITER`, `GLOBAL_CAPTURE_LIMITER`, `ADMIN_RATE_LIMITER`, `CAPTURE_IP_GUARD`, `AUTH_RATE_LIMITER` | unsafe ratelimit | Coarse per-IP / per-tenant ceilings layered under app-level KV counters. |

Typical capture data flow:

```
Client ──POST /v1/captures──► fetch() handler in src/index.js
   │                              │
   │                              ├─ verifyAuth (session or API key)
   │                              ├─ validateUrl (SSRF guard)
   │                              ├─ checkCaptureRateLimit (KV + unsafe limiter)
   │                              ├─ checkQuota (D1 usage_counters)
   │                              ├─ threat-check (optional)
   │                              ├─ createCapture(DB, …)        ── D1 row inserted (status=pending)
   │                              └─ env.CAPTURE_QUEUE.send(...)
   │
   └◄─ 202 Accepted with { captureId }
                                  │
                                  ▼
                          queue() handler
                          handleCaptureMessage()
                              │
                              ├─ idempotency check vs D1
                              ├─ performCapture(env.BROWSER, …)   ── Playwright session
                              │     ├─ before-screenshot
                              │     ├─ autoconsent
                              │     ├─ after-screenshot
                              │     ├─ rendered HTML + headers
                              │     ├─ buildWacz() + signWacz()   ── Ed25519 + RFC 3161
                              │     └─ R2.put(*) artifacts
                              ├─ completeCapture(DB, …)          ── D1 status=complete
                              ├─ incrementUsage(DB, …)
                              ├─ dispatchWebhooks(DB, …)         ── enqueue WEBHOOK_QUEUE
                              ├─ optional change-summary diff vs prior
                              └─ Pirsch event "First Capture" / etc.
```

Retrieval flow (`GET /v1/captures/{id}/artifacts/{name}` and `/v1/verify/{id}`):
fetch handler → optional auth (tenant isolation) → `db.getCapture(env.DB, id)` →
`env.BUCKET.get(key)` → response with cache headers. Workers Cache API
(`src/cache.js`) is opt-in via `ENABLE_EDGE_CACHE` and uses a synthetic
`?_fmt=json|html` query param to work around the lack of `Vary` semantics.

## Key Abstractions

- **Regex routing table** (`src/index.js`): no router framework; an array
  of tuples plus a linear scan after gates.
- **Repo-style data access** (`src/db.js`): every D1 read/write is a named
  exported function returning POJOs already shaped to API responses
  (`rowToCapture`, etc.). Comment in the file is explicit: *no raw
  `env.DB.prepare()` calls outside this module.*
- **Pluggable browser renderer**: `performCapture()` accepts an injectable
  `renderer` so unit tests bypass real Chromium.
- **Per-request env mutation**: handlers read `env._session` /
  `env._captureAuth` populated by gates upstream (controlled, request-local
  only).
- **String-based UI module system**: every `src/ui/*.js` file exports a JS
  string constant that `ui-shell.js` concatenates inside one `<script>`
  tag. **All UI functions share one global scope** — see `CLAUDE.md` for
  the prefix convention (`detail_*`, `submit_*`).
- **RFC 7807 problem responses** via `problemResponse()` in
  `src/responses.js` for all errors.
- **Coralogix-only logging**: `log(env, severity, subsystem, data)` is
  mandatory for warn/error; `console.*` is forbidden in production code
  (see `src/log.js` doc-comment and `CLAUDE.md`).

## Async / Queued Work

Three queues, each with a paired DLQ, all consumed by the same Worker
through the single `queue()` handler that dispatches by queue name:

| Queue              | Concurrency | Producer                  | Consumer logic                                          |
|--------------------|-------------|---------------------------|---------------------------------------------------------|
| `wrl-captures`     | 10 (prod) / 2 (staging) | `handleCreateCapture`, `handleBatchCapture`, `scheduler.js` | `handleCaptureMessage` → `performCapture` |
| `wrl-webhooks`     | 20          | `webhook-dispatch.dispatchWebhooks` | `handleWebhookMessage` (HMAC-sign, POST, retry/DLQ) |
| `wrl-emails`       | 5           | `email-dispatch.dispatchNotification` | `handleEmailMessage` (Resend API, retry/DLQ)        |

`max_batch_size = 1` everywhere so failures isolate per message. Each queue
has `max_retries = 3` with exponential backoff; the matching `*-dlq` is
configured with `max_retries = 0`.

## Cron / Background Jobs

Defined in `[triggers].crons` (and re-declared per environment because
crons are non-inheritable in Wrangler):

- `*/1 * * * *` — every minute. Drives `handleScheduledTick`
  (`src/scheduler.js`): query `getDueSchedules`, fan-out capture jobs to
  `CAPTURE_QUEUE`, advance schedules. On the top of every hour, also runs
  `reportPendingMeterEvents` to push metered usage to Stripe.
- `0 3 * * *` (`0 4 * * *` in staging) — `RESCAN_CRON`. Lazy-imports
  `src/rescan.js` and runs `handleRescanTick` (URL re-scan job).
- `0 9 * * 1` — Monday 9:00 UTC. `handleWeeklyDigest`
  (`src/notifications.js`).

No Durable Objects / DO alarms are used.

## Caching Layers

- **Cloudflare edge cache** in front of GET endpoints: opt-in via
  `ENABLE_EDGE_CACHE = "true"` and `src/cache.js`. `buildCacheKey()` folds
  `Accept` into a `?_fmt=` query parameter to safely cache the same URL
  with different content types.
- **Cache purge**: `POST /v1/admin/cache/purge` (`src/admin.js`) calls the
  Cloudflare API with `CLOUDFLARE_CACHE_PURGE_TOKEN` for the configured
  zone.
- **Browser session reuse**: capture sessions claimed via Playwright's
  `acquire/connect` pattern across queue invocations (see header doc in
  `src/capture.js`).

## Public Surface

### HTTP routes (excerpt — see `openapi.yaml` for the full contract; 26 paths)

- Captures: `POST /v1/captures`, `POST /v1/captures/batch`,
  `GET /v1/captures`, `GET /v1/captures/{id}`,
  `GET /v1/captures/{id}/status`,
  `GET /v1/captures/{id}/artifacts/{name}`,
  `GET /v1/captures/{id}/certificate`,
  `GET /v1/captures/{baseId}/diff/{targetId}`
- Verify (public, available on `verify.*` host):
  `GET /v1/verify/{id}`, `GET /.well-known/signing-key`,
  `GET /.well-known/signing-keys`
- Admin (key-auth): `GET/POST/DELETE /v1/admin/keys{,/:hash}`,
  `GET /v1/admin/usage`, `POST /v1/admin/cache/purge`,
  `GET/PUT /v1/admin/tenants/{id}/config`,
  `GET /v1/admin/tenants{,/:id}`, `GET /v1/admin/overview`
- Account (session-gated, CSRF-required for mutations):
  `GET /v1/account/first-key`, `POST /v1/account/first-key/ack`,
  `GET/POST/DELETE /v1/account/keys{,/:hash}`,
  `POST /v1/account/tos`, `GET /v1/account/usage`,
  `GET/PATCH /v1/account/settings`,
  `GET/PUT /v1/account/notifications`,
  `POST /v1/account/notifications/resend-verification`
- Auth: `GET /auth/login`, `GET /auth/callback`,
  `POST /auth/logout`, `GET /auth/session`
- Notifications (unauth, AUTH_RATE_LIMITER):
  `GET/POST /v1/notifications/unsubscribe`,
  `GET/POST /v1/notifications/verify-email`
- Schedules: `POST/GET /v1/schedules`,
  `GET/DELETE /v1/schedules/{id}`
- Webhooks: `POST/GET /v1/webhooks`,
  `DELETE /v1/webhooks/{id}`, `POST /v1/webhooks/{id}/ping`
- Billing: `POST /v1/billing/checkout`, `POST /v1/billing/portal`
- Inbound webhooks (signature-verified): `POST /v1/stripe/webhook`,
  `POST /v1/webhooks/coralogix`
- Misc: `GET /favicon.ico`, `GET /health`, `POST /mcp`,
  `GET /ui`, `GET /admin`

### Dashboard UI

Server-rendered HTML at `GET /ui` (`htmlDashboard()` in
`src/ui/ui-shell.js`). The shell concatenates these view modules into a
single `<script>` block: auth, login, welcome, ToS, settings, schedules,
billing, notifications, submit, detail, diff, poll. Vanilla JS only — no
framework, no build. Admin dashboard mirror at `GET /admin`
(`src/admin/admin-shell.js`).

### Landing & docs

- `landing/` — public marketing site at `webresourceledger.com`. Strict
  CSP (`script-src 'none'`); JSON-LD only.
- `site/` — Eleventy-built docs site (`wrl-docs`). Served from
  `_output/` via Cloudflare Assets binding.

### CLI

`packages/verify` — `wrl-verify` standalone offline verification tool
(Node ≥ 20). Independent of the Worker; published to npm as
`@w-r-l/verify`.
