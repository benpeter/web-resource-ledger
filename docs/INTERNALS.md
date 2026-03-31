# WRL Worker Internals Reference

**Last verified:** 2026-03-26

**Source files:** `wrangler.toml`, `src/index.js`, `migrations/0001–0016`, `src/db.js`, `src/kv.js`, `src/oauth.js`, `src/stripe-webhook.js`, `src/capture.js`, `src/rate-limits.js`

For request/response schemas, see `openapi.yaml`. For operational procedures, see `OPERATIONS.md`. For audit log events, see `docs/audit-log-schema.md`.

---

## System Overview

WRL is a single Cloudflare Worker (`src/index.js`) that captures web pages via a headless browser and provides a tamper-evident ledger of those captures. It exposes a REST API, a browser-based dashboard, and an MCP endpoint. Bindings: 1 D1 database (12 active tables), 1 R2 bucket, 1 KV namespace, 6 rate limiters, 1 browser binding, 6 queue producers, 6 queue consumers (3 main + 3 DLQ queues). Three cron triggers drive scheduled captures, nightly URL rescans, and weekly email digests. Staging is a fully isolated duplicate with separate resources.

---

## Bindings

| Binding Name | Type | Resource | Purpose |
|---|---|---|---|
| `DB` | D1 | `wrl-metadata` | All structured metadata (tenants, captures, keys, sessions, etc.) |
| `BUCKET` | R2 | `wrl-captures` | Capture artifacts (screenshots, HTML, headers, WACZ files) |
| `KV` | KV | `b5cd6168...` | Rate limit counters, OAuth state, first-key one-time display, Stripe event dedup |
| `CAPTURE_RATE_LIMITER` | Rate Limiter | ns `1001` | Per-tenant capture ceiling: 100 req/60s (hard backstop) |
| `VERIFY_RATE_LIMITER` | Rate Limiter | ns `1002` | Per-IP verify ceiling: 60 req/60s |
| `GLOBAL_CAPTURE_LIMITER` | Rate Limiter | ns `1003` | Global capture ceiling: 200 req/60s |
| `ADMIN_RATE_LIMITER` | Rate Limiter | ns `1004` | Per-IP admin ceiling: 5 req/60s |
| `CAPTURE_IP_GUARD` | Rate Limiter | ns `1005` | Per-IP secondary abuse guard: 50 req/60s |
| `AUTH_RATE_LIMITER` | Rate Limiter | ns `1006` | Per-IP auth/account ceiling: 10 req/60s |
| `BROWSER` | Browser | — | Puppeteer headless browser for page rendering |
| `CAPTURE_QUEUE` | Queue Producer | `wrl-captures` | Enqueue capture jobs |
| `CAPTURE_DLQ` | Queue Producer | `wrl-captures-dlq` | Enqueue to capture dead-letter queue |
| `WEBHOOK_QUEUE` | Queue Producer | `wrl-webhooks` | Enqueue outbound webhook deliveries |
| `WEBHOOK_DLQ` | Queue Producer | `wrl-webhooks-dlq` | Enqueue to webhook dead-letter queue |
| `EMAIL_QUEUE` | Queue Producer | `wrl-emails` | Enqueue outbound email notifications |
| `EMAIL_DLQ` | Queue Producer | `wrl-emails-dlq` | Enqueue to email dead-letter queue |

---

## Secrets and Variables

### Secrets (set via `wrangler secret put`)

| Name | Purpose |
|---|---|
| `CAPTURE_API_KEY` | Legacy API key for initial/admin capture auth |
| `SIGNING_KEY` | Ed25519 PKCS8 private key for WACZ signing |
| `ADMIN_KEY` | Admin endpoint authentication key |
| `CORALOGIX_SEND_KEY` | Coralogix log ingestion key |
| `IP_HASH_SEED` | HMAC seed for IP pseudonymization |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `SESSION_SECRET` | Hex-encoded 32+ bytes for session cookie HMAC signing |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `RESEND_API_KEY` | Resend API key for transactional email delivery |
| `GOOGLE_WEB_RISK_API_KEY` | Google Web Risk API key (optional; degrades gracefully if absent) |
| `CLOUDFLARE_CACHE_PURGE_TOKEN` | CF API token with Cache Purge permission for the zone |
| `QUALIFIED_TSA_AUTH` | Base64-encoded `user:pass` for eIDAS-qualified TSA HTTP Basic auth |

### Variables (from `wrangler.toml [vars]`)

| Name | Value | Purpose |
|---|---|---|
| `ENABLE_EDGE_CACHE` | `"true"` | Enable Cloudflare edge caching for capture responses |
| `CLOUDFLARE_ZONE_ID` | `9b1b321a...` | Zone ID for cache purge API calls |
| `CORALOGIX_ENDPOINT` | `https://ingress.eu2.coralogix.com/logs/v1/singles` | Log ingestion endpoint |
| `APPLICATION_NAME` | `"wrl"` | Application label in Coralogix log payloads |
| `TSA_URL` | `https://timestamp.digicert.com` | Standard timestamp authority |
| `QUALIFIED_TSA_URL` | `https://timestamp.sectigo.com/qualified` | eIDAS-qualified TSA for qualified timestamps |
| `GITHUB_CLIENT_ID` | `Ov23liIG5Of9wSbgcFqW` | GitHub OAuth App client ID (public) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_51T...` | Stripe publishable key (public) |
| `STRIPE_CAPTURE_PRICE_ID` | `price_1TE4aAR...` | Stripe price ID for capture volume |
| `RESCAN_CRON` | `"0 3 * * *"` | Cron expression for nightly URL re-scan (must match `[triggers].crons`) |
| `CORS_ORIGINS` | _(unset)_ | Comma-separated allowed origins for CORS preflight; empty = CORS disabled |

---

## D1 Schema

### Core Tables

#### `tenants`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK, `GLOB '[a-z0-9_-]*'`, length 1–64 | Matches `TENANT_ID_RE`. Self-serve format: `gh-{github_numeric_id}` |
| `config` | TEXT | nullable | JSON: `{ rateLimit: { capture: { limit, period } } }`. Per-tenant rate limit overrides |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `updated_at` | TEXT | nullable | ISO 8601 |
| `updated_by` | TEXT | nullable | Who last updated |
| `tier` | TEXT | NOT NULL, default `'free'` | App-layer valid values: `VALID_TIERS = ['free', 'pro']` |
| `stripe_customer_id` | TEXT | nullable | Stripe `cus_xxx`. NULL until billing initiated |
| `billing_status` | TEXT | NOT NULL, default `'active'` | App-layer valid values: `VALID_BILLING_STATUSES = ['active', 'grace_period', 'blocked']` |
| `grace_period_end` | TEXT | nullable | ISO 8601. Non-null only when `billing_status = 'grace_period'` |
| `payment_method_added_at` | TEXT | nullable | ISO 8601. Set once when `checkout.session.completed` fires; never unset |
| `eidas_qualified` | INTEGER | NOT NULL, default `0` | App-layer 0/1. Per-tenant opt-in for eIDAS qualified timestamps |
| `stripe_invoice_amount_cents` | INTEGER | nullable | Cached Stripe upcoming invoice `amount_due` in cents. Updated hourly by meter reporter |
| `stripe_invoice_currency` | TEXT | nullable | Cached Stripe invoice currency (e.g. `eur`). Updated with `stripe_invoice_amount_cents` |
| `stripe_invoice_cached_at` | TEXT | nullable | ISO 8601. When the invoice cache was last refreshed |

#### `captures`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK, `GLOB 'cap_[a-f0-9]*'`, length 36 | Format: `cap_` + 32 lowercase hex |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)` | |
| `status` | TEXT | NOT NULL, CHECK IN `('pending','complete','failed')` | API maps `quarantined=1` → `status:'quarantined'` in responses; DB remains `'complete'` |
| `url` | TEXT | NOT NULL | Target URL |
| `ip` | TEXT | nullable | Requester IP (pseudonymized) |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `completed_at` | TEXT | nullable | ISO 8601 |
| `failed_at` | TEXT | nullable | ISO 8601 |
| `error` | TEXT | nullable | Error message string |
| `retryable` | INTEGER | nullable, CHECK IN `(0,1)` | Whether failure is retryable |
| `render_quality` | TEXT | nullable, CHECK IN `('full','partial')` | |
| `artifacts` | TEXT | nullable | JSON: `{ screenshot, screenshotBefore?, html, headers? }` — R2 key paths |
| `wacz` | TEXT | nullable | JSON: `{ key, bundleHash, publicKeyBase64, keyId, timestampStatus, qualifiedTimestampStatus }` |
| `render` | TEXT | nullable | JSON: browser render metadata |
| `capture_settings` | TEXT | nullable | JSON: `{ version, consent: { library, libraryVersion, action, result, cmpDetected? } }` |
| `schedule_id` | TEXT | nullable, FK → `schedules(id)` | Added in 0007. NULL for on-demand captures |
| `quarantined` | INTEGER | NOT NULL, default `0` | App-layer 0/1. Artifact access gate; `1` blocks artifact retrieval |
| `quarantine_reason` | TEXT | nullable | Threat type string, e.g. `'MALWARE'` |
| `quarantined_at` | TEXT | nullable | ISO 8601 |
| `last_threat_check_at` | TEXT | nullable | ISO 8601. Used by re-scan cron |
| `threat_check` | TEXT | nullable | Pre-capture URL check result: `'pass'`, `'unavailable'`, or NULL (pre-0009 rows) |
| `change_summary` | TEXT | nullable | JSON: change detection vs. previous scheduled capture. NULL for non-scheduled or first-in-schedule |

#### `api_keys`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `key_hash` | TEXT | PK, length 64 | SHA-256 hex of raw key. Raw key never stored |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)` | |
| `scopes` | TEXT | NOT NULL | JSON array, e.g. `["capture","read"]` |
| `name` | TEXT | NOT NULL | Human-readable label |
| `created_at` | TEXT | NOT NULL | ISO 8601 |
| `created_by` | TEXT | NOT NULL | Who created the key |
| `revoked` | INTEGER | NOT NULL, default `0`, CHECK IN `(0,1)` | |
| `revoked_at` | TEXT | nullable | ISO 8601 |

#### `signing_keys`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK, length 8 | First 8 hex chars of SHA-256(raw public key bytes) |
| `algorithm` | TEXT | NOT NULL, default `'Ed25519'` | |
| `public_key` | TEXT | NOT NULL | Base64-encoded Ed25519 public key |
| `archived_at` | TEXT | NOT NULL | ISO 8601 |

### Billing Tables

#### `usage_counters`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)`, PK part | |
| `period` | TEXT | NOT NULL, PK part, GLOB `'[0-9]{4}-[0-9]{2}'`, length 7 | Format: `YYYY-MM` |
| `capture_count` | INTEGER | NOT NULL, default `0`, ≥ 0 | Total captures this period |
| `storage_bytes` | INTEGER | NOT NULL, default `0`, ≥ 0 | Total R2 storage this period |
| `api_call_count` | INTEGER | NOT NULL, default `0`, ≥ 0 | |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `updated_at` | TEXT | nullable | ISO 8601 |
| `reported_capture_count` | INTEGER | NOT NULL, default `0` | Stripe meter watermark — value at last successful report |
| `last_reported_at` | TEXT | nullable | ISO 8601 of last successful Stripe meter report |
| `eidas_capture_count` | INTEGER | NOT NULL, default `0` | Captures that received a qualified eIDAS timestamp |
| `reported_eidas_count` | INTEGER | NOT NULL, default `0` | Stripe meter watermark for eIDAS captures |

### Auth Tables

#### `github_users`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `github_id` | INTEGER | PK | GitHub's stable numeric user ID |
| `github_login` | TEXT | NOT NULL | Mutable display name, refreshed on each OAuth callback |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)`, UNIQUE | One GitHub account per tenant |
| `tos_accepted_at` | TEXT | nullable | ISO 8601. NULL until ToS accepted |
| `tos_version` | TEXT | nullable | Retained so future ToS revisions can trigger re-consent |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `updated_at` | TEXT | nullable | ISO 8601 |

#### `sessions`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id_hash` | TEXT | PK, length 64 | SHA-256 hex of raw session cookie value. Raw cookie never stored |
| `github_id` | INTEGER | NOT NULL, FK → `github_users(github_id)` | |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)` | Denormalized from `github_users` to avoid JOIN on hot path |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `expires_at` | TEXT | NOT NULL | ISO 8601. Expired rows cleaned up by cron |

### Scheduling Tables

#### `schedules`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK, `GLOB 'sch_[a-f0-9]*'`, length 36 | Format: `sch_` + 32 lowercase hex |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)` | |
| `url` | TEXT | NOT NULL, length ≤ 2048 | Target URL |
| `name` | TEXT | NOT NULL, length 1–128 | |
| `cron` | TEXT | NOT NULL, length ≤ 128 | Cron expression for recurrence |
| `next_run_at` | TEXT | NOT NULL | ISO 8601. Updated after each run |
| `paused` | INTEGER | NOT NULL, default `0`, CHECK IN `(0,1)` | |
| `last_run_at` | TEXT | nullable | ISO 8601 |
| `last_capture_id` | TEXT | nullable | Most recent capture from this schedule |
| `last_capture_status` | TEXT | nullable | Status of most recent capture |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `updated_at` | TEXT | nullable | ISO 8601 |

### Webhook Tables

#### `webhooks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PK, `GLOB 'whk_[a-f0-9]*'`, length 36 | Format: `whk_` + 32 lowercase hex |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)` | |
| `url` | TEXT | NOT NULL, length ≤ 2048 | Delivery endpoint |
| `name` | TEXT | NOT NULL | Human label |
| `secret` | TEXT | NOT NULL | HMAC signing secret for delivery payloads |
| `events` | TEXT | NOT NULL | JSON array, e.g. `["capture.complete","capture.failed"]` |
| `active` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `updated_at` | TEXT | nullable | ISO 8601 |

### Notification Tables

#### `notification_preferences`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `tenant_id` | TEXT | PK, FK → `tenants(id)` | Row created lazily on first PUT |
| `email` | TEXT | nullable, length 3–320 | Notification address |
| `email_verified` | INTEGER | NOT NULL, default `0`, CHECK IN `(0,1)` | |
| `email_source` | TEXT | NOT NULL, default `'github'`, CHECK IN `('github','manual')` | Origin of email address |
| `notify_capture_failure` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `notify_approaching_limit` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `notify_limit_reached` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `notify_invoice_generated` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `notify_payment_failure` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `notify_weekly_digest` | INTEGER | NOT NULL, default `1`, CHECK IN `(0,1)` | |
| `created_at` | TEXT | NOT NULL, default now | ISO 8601 |
| `updated_at` | TEXT | nullable | ISO 8601 |
| `pending_email` | TEXT | nullable | New address awaiting verification. NULL when no verification in flight |
| `verification_sent_at` | TEXT | nullable | ISO 8601. Used to enforce 60-second resend cooldown |

#### `notification_sent`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `tenant_id` | TEXT | NOT NULL, FK → `tenants(id)`, PK part | |
| `period` | TEXT | NOT NULL, PK part, GLOB `'[0-9]{4}-[0-9]{2}'`, length 7 | Format: `YYYY-MM` |
| `event_type` | TEXT | NOT NULL, PK part | e.g. `'approaching_limit'`, `'limit_reached'` |
| `sent_at` | TEXT | NOT NULL, default now | ISO 8601. Dedup: at most one send per (tenant, period, event_type) |

### Threat Intelligence Tables

#### `threat_checks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `capture_id` | TEXT | NOT NULL, FK → `captures(id)` | |
| `checked_at` | TEXT | NOT NULL | ISO 8601 |
| `verdict` | TEXT | NOT NULL, CHECK IN `('safe','threat')` | |
| `threat_types` | TEXT | nullable | Raw threat type string(s) from provider. NULL on safe |
| `source` | TEXT | NOT NULL, default `'web_risk'` | Provider identifier |

### ID Format Conventions

| Entity | Format | Example |
|---|---|---|
| Tenant (self-serve) | `gh-{github_numeric_id}` | `gh-12345678` |
| Tenant (admin-provisioned) | `[a-z0-9_-]{1,64}` | `acme-corp` |
| Capture | `cap_` + 32 hex | `cap_a1b2c3d4...` |
| Webhook | `whk_` + 32 hex | `whk_e5f6a7b8...` |
| Schedule | `sch_` + 32 hex | `sch_c9d0e1f2...` |
| API key hash | 64 hex (SHA-256) | `a1b2c3...` (64 chars) |
| Session hash | 64 hex (SHA-256) | `d4e5f6...` (64 chars) |
| Signing key ID | 8 hex | `a1b2c3d4` |

---

## API Routes

Special-case routes handled before the regex router: `POST /mcp`, `OPTIONS /mcp`, `OPTIONS /v1/captures`.

For request/response schemas, see `openapi.yaml`.

| Method | Path | Auth | Rate Limit | Surface |
|---|---|---|---|---|
| GET | `/favicon.ico` | none | — | infra |
| GET | `/health` | none | — | infra |
| GET | `/ui` | none | — | ui |
| POST | `/mcp` | api-key | — | infra |
| POST | `/v1/captures/batch` | dual | capture | public-api |
| POST | `/v1/captures` | dual | capture | public-api |
| GET | `/v1/captures` | dual | — | public-api |
| GET | `/v1/captures/{captureId}/status` | none (optional dual) | — | public-api |
| GET | `/v1/captures/{captureId}` | none (optional dual) | — | public-api |
| GET | `/v1/captures/{captureId}/artifacts/{type}` | none (optional dual) | — | public-api |
| GET | `/v1/captures/{captureId}/certificate` | none (optional dual) | — | public-api |
| GET | `/v1/captures/{captureId}/diff/{baseId}` | none (optional dual) | — | public-api |
| GET | `/v1/verify/{captureId}` | none | verify | public-api |
| GET | `/.well-known/signing-key` | none | verify | public-api |
| GET | `/.well-known/signing-keys` | none | verify | public-api |
| POST | `/v1/admin/keys` | admin-key | admin | admin |
| GET | `/v1/admin/keys` | admin-key | admin | admin |
| DELETE | `/v1/admin/keys/{keyHash}` | admin-key | admin | admin |
| GET | `/v1/admin/usage` | admin-key | admin | admin |
| POST | `/v1/admin/cache/purge` | admin-key | admin | admin |
| GET | `/v1/admin/tenants/{tenantId}/config` | admin-key | admin | admin |
| PUT | `/v1/admin/tenants/{tenantId}/config` | admin-key | admin | admin |
| POST | `/v1/webhooks` | dual | — | public-api |
| GET | `/v1/webhooks` | dual | — | public-api |
| DELETE | `/v1/webhooks/{webhookId}` | dual | — | public-api |
| POST | `/v1/webhooks/{webhookId}/ping` | dual | — | public-api |
| POST | `/v1/schedules` | dual | capture | public-api |
| GET | `/v1/schedules` | dual | — | public-api |
| GET | `/v1/schedules/{scheduleId}` | dual | — | public-api |
| DELETE | `/v1/schedules/{scheduleId}` | dual | — | public-api |
| GET | `/auth/login` | none | auth | auth |
| GET | `/auth/callback` | none | auth | auth |
| POST | `/auth/logout` | none | auth | auth |
| GET | `/auth/session` | none | auth | auth |
| GET | `/v1/account/first-key` | session | auth | account |
| POST | `/v1/account/first-key/ack` | session | auth | account |
| GET | `/v1/account/keys` | session | auth | account |
| POST | `/v1/account/keys` | session | auth | account |
| DELETE | `/v1/account/keys/{keyHash}` | session | auth | account |
| POST | `/v1/account/tos` | session | auth | account |
| GET | `/v1/account/usage` | session | auth | account |
| GET | `/v1/account/settings` | session | auth | account |
| PATCH | `/v1/account/settings` | session | auth | account |
| GET | `/v1/account/notifications` | session | auth | notification |
| PUT | `/v1/account/notifications` | session | auth | notification |
| POST | `/v1/account/notifications/resend-verification` | session | auth | notification |
| GET | `/v1/notifications/unsubscribe` | none | auth | notification |
| POST | `/v1/notifications/unsubscribe` | none | auth | notification |
| GET | `/v1/notifications/verify-email` | none | auth | notification |
| POST | `/v1/notifications/verify-email` | none | auth | notification |
| POST | `/v1/billing/checkout` | session | auth | billing |
| POST | `/v1/billing/portal` | session | auth | billing |
| POST | `/v1/stripe/webhook` | signature | — | billing |

**Auth values:** `api-key` = `Authorization: Bearer {key}`; `admin-key` = admin key from `ADMIN_KEY` secret; `session` = `__Host-wrl_session` cookie (HMAC-signed); `dual` = session cookie first, then API key fallback; `signature` = Stripe webhook signature verification; `none` = unauthenticated; `none (optional dual)` = public access unless credentials presented (bad credentials → 401).

---

## KV Key Patterns

| Pattern | Value | TTL | Purpose | Module |
|---|---|---|---|---|
| `rl:{tenantId}:{group}:{windowId}` | Integer string | `period * 2` seconds | Per-tenant sliding window rate limit counter | `src/kv.js` |
| `oauth_state:{state}` | JSON `{ codeVerifier, createdAt }` | 600s | OAuth PKCE state and code verifier, single-use | `src/oauth.js` |
| `first_key:{tenantId}` | Raw API key string | 3600s | One-time first API key display for new self-serve tenants | `src/oauth.js` |
| `stripe_evt:{eventId}` | `'1'` | 604800s (7 days) | Stripe webhook event idempotency dedup | `src/stripe-webhook.js` |

---

## R2 Object Key Patterns

| Key Pattern | Content Type | Purpose |
|---|---|---|
| `captures/{captureId}/screenshot.png` | `image/png` | Post-interaction screenshot |
| `captures/{captureId}/screenshot-before.png` | `image/png` | Pre-interaction screenshot (when cookie consent dialog dismissed) |
| `captures/{captureId}/rendered.html` | `text/plain` | Rendered HTML source (`Content-Disposition: attachment`) |
| `captures/{captureId}/headers.json` | `application/json` | HTTP response headers from capture |
| `captures/{waczHash}.wacz` | `application/wacz+zip` | WACZ bundle (keyed by content hash, not capture ID) |

---

## Queues

| Queue Name | Binding | Max Batch | Max Retries | DLQ | Handler |
|---|---|---|---|---|---|
| `wrl-captures` | `CAPTURE_QUEUE` | 1 | 3 | `wrl-captures-dlq` | `handleCaptureMessage` |
| `wrl-captures-dlq` | `CAPTURE_DLQ` | 1 | 0 | — | `handleDlqMessage` |
| `wrl-webhooks` | `WEBHOOK_QUEUE` | 1 | 3 | `wrl-webhooks-dlq` | `handleWebhookMessage` |
| `wrl-webhooks-dlq` | `WEBHOOK_DLQ` | 1 | 0 | — | `handleWebhookDlqMessage` |
| `wrl-emails` | `EMAIL_QUEUE` | 1 | 3 | `wrl-emails-dlq` | `handleEmailMessage` |
| `wrl-emails-dlq` | `EMAIL_DLQ` | 1 | 0 | — | `handleEmailDlqMessage` |

`max_concurrency`: captures = 10, webhooks = 20, emails = 5. `max_batch_size = 1` on all queues to isolate failures per message.

---

## Cron Triggers

| Expression | Handler | Purpose |
|---|---|---|
| `*/1 * * * *` | `handleScheduledTick` + hourly `reportPendingMeterEvents` | Evaluate due tenant schedules; enqueue capture jobs. On the hour: flush pending Stripe meter events |
| `0 3 * * *` | `handleRescanTick` | Nightly re-scan of complete non-quarantined captures for threat changes |
| `0 9 * * 1` | `handleWeeklyDigest` | Weekly email digest (Monday 09:00 UTC) |

---

## Rate Limiters

| Binding | Limit | Purpose |
|---|---|---|
| `CAPTURE_RATE_LIMITER` | 100 req/60s | Per-tenant hard ceiling for capture endpoints. Application KV counters enforce lower per-tenant defaults (10 req/60s). Tenant `config.rateLimit.capture` may override the KV default up to 100. |
| `VERIFY_RATE_LIMITER` | 60 req/60s | Per-IP ceiling for verify and signing-key endpoints |
| `GLOBAL_CAPTURE_LIMITER` | 200 req/60s | Global capture ceiling across all tenants |
| `ADMIN_RATE_LIMITER` | 5 req/60s | Per-IP ceiling for admin and account/billing endpoints |
| `CAPTURE_IP_GUARD` | 50 req/60s | Secondary per-IP abuse guard on capture endpoints (layer 3 of 3-layer check) |
| `AUTH_RATE_LIMITER` | 10 req/60s | Per-IP ceiling for OAuth, unsubscribe, and verify-email endpoints |

**Application-layer defaults** (KV counters, overridable per tenant via `tenants.config`):

| Group | Default | Overridable |
|---|---|---|
| `capture` | 10 req/60s | Yes (ceiling: `BINDING_CEILING = 100`) |
| `verify` | 60 req/60s | No |
| `admin` | 5 req/60s | No |
| `auth` | 20 req/60s | No |
| `account` | 30 req/60s | No |

---

## Staging Differences

| Item | Production | Staging |
|---|---|---|
| Worker name | `wrl` | `wrl` (env: `staging`) |
| D1 database | `wrl-metadata` | `wrl-metadata-staging` |
| R2 bucket | `wrl-captures` | `wrl-captures-staging` |
| KV namespace | `b5cd6168...` | `ed564f8e...` |
| Queue names | `wrl-captures`, `wrl-webhooks`, `wrl-emails` (+ DLQs) | `wrl-captures-staging`, `wrl-webhooks-staging`, `wrl-emails-staging` (+ DLQs) |
| Rate limiter namespace IDs | `1001`–`1006` | `2001`–`2006` |
| Domains | `api.webresourceledger.com`, `verify.webresourceledger.com` | `staging.webresourceledger.com`, `verify-staging.webresourceledger.com` |
| `APPLICATION_NAME` | `"wrl"` | `"wrl-staging"` |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_51T...` (live) | `pk_test_51T...` (test) |
| `STRIPE_CAPTURE_PRICE_ID` | `price_1TE4aAR...` | `price_1TE3yVJ...` |
| `GITHUB_CLIENT_ID` | `Ov23liIG5Of9wSbgcFqW` | `Ov23li0lii7I7Y43lbUs` |
| `RESCAN_CRON` | `"0 3 * * *"` | `"0 4 * * *"` |
| Captures queue `max_concurrency` | 10 | 2 (constrained by browser session pool) |
| Emails queue `max_concurrency` | 5 | 2 |
