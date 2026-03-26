# Domain Plan Contribution: data-minion

## Recommendations

### Schema documentation approach: Option (b) with a twist

**Recommendation: hand-written current-state table summary, derived from migrations but maintained as a standalone section.** Neither (a) nor (c) is the right fit:

- **(a) Generated from migrations** -- fragile. The 16 migrations use ALTER TABLE ADD COLUMN extensively (0005 through 0016). Parsing ALTER TABLE statements from raw SQL to reconstruct current state requires a purpose-built script that must handle CHECK constraints, DEFAULT values, partial indexes, and D1-specific quirks (no CHECK on ALTER TABLE ADD COLUMN). The maintenance burden of the script exceeds the maintenance burden of the document.

- **(c) PRAGMA table_info from local D1** -- accurate but incomplete. PRAGMA table_info returns column names and types but loses CHECK constraints, index definitions, JSON column semantics, and the business logic annotations that make the schema useful to an LLM. It also requires a running D1 instance or wrangler dev, adding a tooling dependency to doc generation.

- **(b) Hand-written summary** -- the right call, with structure. The schema has 10 active tables (share_tokens was dropped in 0013). A hand-written summary can include what PRAGMA cannot: which TEXT columns are JSON, what the JSON shapes contain, which columns have application-layer-only constraints (tier, billing_status, quarantined), and the ID format conventions. This is exactly the kind of context that makes an LLM effective.

**Key structural decision**: organize tables by domain, not alphabetically. Group them as:
1. Core (tenants, captures, api_keys, signing_keys)
2. Billing (usage_counters -- with Stripe metering columns)
3. Auth (github_users, sessions)
4. Scheduling (schedules)
5. Webhooks (webhooks)
6. Notifications (notification_preferences, notification_sent)
7. Threat intelligence (threat_checks)

For each table, document: columns with types, constraints (including app-layer-only ones), indexes, FK relationships, and ID format conventions.

### KV and R2 patterns: document alongside schema, not separately

**KV and R2 key patterns belong in the same reference document, in their own sections immediately after the D1 schema.** Rationale:

- An LLM operating on WRL needs to understand the full data topology. Separating storage layers into different documents forces the LLM to cross-reference and increases the chance of missing context.
- The storage layers are tightly coupled: a capture's D1 row references R2 keys in its `artifacts` and `wacz` JSON columns; KV rate limit counters reference the same `tenantId` used as the D1 primary key.
- The total volume is small enough for a single document -- 10 D1 tables, 4 KV key patterns, 2 R2 key patterns.

## Current State: Storage Layer Analysis

### D1 Tables (10 active, 1 dropped)

| Table | Rows | Purpose | ID Format |
|-------|------|---------|-----------|
| tenants | low (hundreds) | Tenant registry, tier, billing, eIDAS config | `[a-z0-9_-]{1,64}` |
| captures | high (millions) | Capture lifecycle, artifacts refs, threat state | `cap_` + 32 hex (36 chars) |
| api_keys | low | Hashed API keys with scopes | SHA-256 hex (64 chars) |
| signing_keys | tiny (single digits) | Archived Ed25519 public keys | First 8 hex of SHA-256 |
| usage_counters | low | Monthly billing counters per tenant | Composite PK: (tenant_id, period YYYY-MM) |
| webhooks | low | Outbound webhook registrations | `whk_` + 32 hex (36 chars) |
| github_users | low | GitHub OAuth identity to tenant mapping | GitHub numeric user ID |
| sessions | moderate | Server-side cookie sessions (hash-before-store) | SHA-256 hex (64 chars) |
| schedules | low-moderate | Recurring capture cron definitions | `sch_` + 32 hex (36 chars) |
| notification_preferences | low | Per-tenant email + notification toggles | PK: tenant_id |
| notification_sent | moderate | Dedup log for threshold notifications | Composite PK: (tenant_id, period, event_type) |
| threat_checks | moderate-high | Audit log of every threat check verdict | AUTOINCREMENT integer |
| ~~share_tokens~~ | **dropped (0013)** | Was: read-only capture access tokens | -- |

### JSON Columns in D1

These TEXT columns store JSON and are parsed at read time:

| Table.Column | JSON Shape |
|---|---|
| tenants.config | Rate limit overrides, settings (nullable) |
| captures.artifacts | `{ screenshot, screenshotBefore?, html, headers }` -- R2 key strings |
| captures.wacz | `{ key, bundleHash, size, keyId?, timestampStatus?, qualifiedTimestampStatus? }` |
| captures.render | Render metadata object |
| captures.capture_settings | Capture configuration used |
| captures.change_summary | Scheduled capture diff results |
| api_keys.scopes | JSON array: `["capture", "read"]` |
| webhooks.events | JSON array: `["capture.complete", "capture.failed"]` |

### Application-Layer Constraints (not enforced by D1 CHECK)

D1/SQLite ALTER TABLE ADD COLUMN does not support CHECK constraints, so these are validated in `db.js`:

| Column | Valid Values | Constant |
|---|---|---|
| tenants.tier | `'free'`, `'pro'` | `VALID_TIERS` |
| tenants.billing_status | `'active'`, `'grace_period'`, `'blocked'` | `VALID_BILLING_STATUSES` |
| tenants.eidas_qualified | `0`, `1` | -- |
| captures.quarantined | `0`, `1` | -- |

### KV Key Patterns (4 patterns)

| Key Pattern | Value | TTL | Purpose | Module |
|---|---|---|---|---|
| `rl:{tenantId}:{group}:{windowId}` | Integer counter string | period * 2 | Rate limit sliding window | `kv.js` |
| `oauth_state:{state}` | JSON: `{ codeVerifier, createdAt }` | 600s (10 min) | PKCE OAuth state | `oauth.js` |
| `first_key:{tenantId}` | Raw API key string | 3600s (1 hr) | One-time key display after onboarding | `oauth.js` |
| `stripe_evt:{eventId}` | `'1'` | 604800s (7 days) | Stripe webhook idempotency dedup | `stripe-webhook.js` |

### R2 Object Key Patterns (2 patterns)

| Key Pattern | Content Type | Purpose |
|---|---|---|
| `captures/{captureId}/screenshot.png` | image/png | Page screenshot |
| `captures/{captureId}/screenshot-before.png` | image/png | Pre-consent screenshot (optional) |
| `captures/{captureId}/rendered.html` | text/html; charset=utf-8 | Rendered HTML snapshot |
| `captures/{captureId}/headers.json` | application/json | HTTP response headers |
| `captures/{waczHash}.wacz` | application/wacz+zip | WACZ archive (content-addressed by SHA-256) |

Note: per-capture artifacts use `captureId` as prefix; WACZ files are content-addressed by their SHA-256 hash (not captureId), enabling deduplication.

### Bindings Summary (from wrangler.toml)

| Binding | Type | Resource |
|---|---|---|
| `DB` | D1 | wrl-metadata |
| `BUCKET` | R2 | wrl-captures |
| `KV` | KV Namespace | Rate limits, OAuth state, ephemeral keys |
| `BROWSER` | Browser Rendering | Headless browser for captures |
| `CAPTURE_QUEUE` | Queue Producer | wrl-captures |
| `CAPTURE_DLQ` | Queue Producer | wrl-captures-dlq |
| `WEBHOOK_QUEUE` | Queue Producer | wrl-webhooks |
| `WEBHOOK_DLQ` | Queue Producer | wrl-webhooks-dlq |
| `EMAIL_QUEUE` | Queue Producer | wrl-emails |
| `EMAIL_DLQ` | Queue Producer | wrl-emails-dlq |
| `CAPTURE_RATE_LIMITER` | Rate Limit | 100/60s ceiling per tenant |
| `VERIFY_RATE_LIMITER` | Rate Limit | 60/60s |
| `GLOBAL_CAPTURE_LIMITER` | Rate Limit | 200/60s across all tenants |
| `ADMIN_RATE_LIMITER` | Rate Limit | 5/60s |
| `CAPTURE_IP_GUARD` | Rate Limit | 50/60s per IP |
| `AUTH_RATE_LIMITER` | Rate Limit | 10/60s |

## Proposed Tasks

### Task 1: Write the D1 schema section of the reference document
- Produce a hand-written current-state table listing for all 10 active tables
- Include columns, types, constraints (both D1 CHECK and application-layer), indexes, and FK relationships
- Group tables by domain (Core, Billing, Auth, Scheduling, Webhooks, Notifications, Threat Intel)
- Document all JSON column shapes with field-level detail
- Document ID format conventions (`cap_`, `whk_`, `sch_`, SHA-256 hex patterns)
- Call out the `quarantined` virtual status mapping (DB stores `status='complete' + quarantined=1`, API returns `status:'quarantined'`)

### Task 2: Write the KV key patterns section
- Document all 4 KV key patterns with format, value shape, TTL, and owning module
- Note that KV is used only for ephemeral/atomic operations -- all persistent metadata is in D1
- Mention the TENANT_ID_RE regex as the tenant ID format constraint shared across KV and D1

### Task 3: Write the R2 object key patterns section
- Document both key patterns (per-capture prefix and content-addressed WACZ)
- Note content-type metadata set on R2 objects
- Note that R2 keys are referenced from D1 JSON columns (captures.artifacts, captures.wacz.key)
- Call out that WACZ keys use SHA-256 content addressing, not captureId

### Task 4: Write the bindings and env vars section
- Document all wrangler.toml bindings (D1, R2, KV, Browser, Queues, Rate Limiters)
- List all secrets (set via `wrangler secret put`) with their purpose
- List all [vars] with their purpose
- Distinguish production vs staging resource names

### Task 5: Validate the reference against source code
- After writing, grep `src/db.js` exported functions to ensure every table operation is represented
- Verify KV key patterns against `src/kv.js`, `src/oauth.js`, `src/stripe-webhook.js`
- Verify R2 patterns against `src/capture.js` and `src/index.js`
- Confirm no storage patterns were missed

## Risks and Concerns

1. **Schema drift**: The hand-written summary will drift from migrations over time. Mitigate by adding a comment at the top of the schema section noting the last migration it reflects (currently 0016_email_verification). Future migration authors should update the reference doc as part of the migration PR.

2. **JSON column shapes are undocumented in migrations**: The shapes of `artifacts`, `wacz`, `render`, `capture_settings`, and `change_summary` are defined only by the code that writes them (`capture.js`, `db.js`). If these shapes change, the reference doc must be updated manually. Consider adding a validation step to CI that checks the reference doc's "last migration" marker against the actual migration count.

3. **Virtual status mapping is a stumbling block**: The `quarantined` status is not a real DB status value -- the DB stores `status='complete'` with `quarantined=1`, and `db.js` maps this to `status:'quarantined'` in the API response. This is a common source of confusion and must be prominently documented.

4. **KV key patterns are scattered across 3 modules**: Unlike D1 (centralized in `db.js`), KV usage is split across `kv.js`, `oauth.js`, and `stripe-webhook.js`. There is no single module that defines all KV key patterns. The reference doc becomes the single source of truth for KV patterns, which is a risk if new KV keys are added without updating the doc.

5. **Content-addressed WACZ vs captureId-prefixed artifacts**: The two different R2 key strategies (captureId prefix for screenshots/HTML vs SHA-256 hash for WACZ) can confuse LLMs into assuming all R2 lookups use the captureId. The doc must make this distinction explicit.

## Additional Agents Needed

None -- the data architecture analysis is complete. The document writer (likely the orchestrating agent) can use this analysis directly. If the reference doc needs to cover API routes in detail, the **api-design-minion** would contribute that section, but that is a separate planning question.
