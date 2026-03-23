## Domain Plan Contribution: security-minion

### Recommendations

#### 1. API Selection: Safe Browsing v4 Lookup API -- with a licensing caveat that may force Web Risk

**CRITICAL: Licensing constraint.** Google Safe Browsing API is explicitly restricted to **non-commercial use only** ("not for sale or revenue generating purposes"). WRL is a revenue-generating SaaS with Stripe billing integration. Using Safe Browsing API violates Google's terms of service.

**Two viable paths:**

**Option A (Recommended): Google Web Risk Lookup API (`uris.search`)**
- Commercial-use equivalent of Safe Browsing. Same threat data, same Google infrastructure.
- REST endpoint: `GET https://webrisk.googleapis.com/v1/uris:search?uri=URL&threatTypes=...&key=API_KEY`
- Latency: Single HTTP GET per URL. Google's edge infrastructure typically responds in 50-150ms from Cloudflare Workers (both run on major cloud edge networks). Well within the <200ms budget.
- Free tier: 100,000 lookups/month at no cost. Beyond that, $0.50/1,000 calls. At WRL's current scale (free tier is 200 captures/month per tenant), this is effectively free for a long time.
- No local database needed -- pure stateless lookup, perfect for Workers.
- The Update API v5 (`hashes.search`) requires maintaining a local hash database, which is impossible on Workers (no persistent filesystem, no SQLite for hash prefix lists). Workers KV is too slow for hash prefix lookups and D1 would add unnecessary complexity.

**Option B (Fallback): Google Safe Browsing v4 Lookup API**
- Only viable if WRL has a purely non-commercial tier and the scanning only applies there. Given WRL has paid tiers, this is not defensible.

**Recommendation: Use Web Risk Lookup API.** The free tier covers early growth. The cost at scale ($0.50/1K) is negligible compared to capture processing costs (Browser Rendering, R2 storage). The stateless REST model is a perfect fit for Workers.

#### 2. Integration Point: Pre-capture check in `handleCreateCapture`, NOT in the queue consumer

The Safe Browsing/Web Risk check should happen **synchronously in the HTTP request path** (between URL validation at line 711 and capture ID generation at line 718 in `index.js`), not in the queue consumer. Rationale:

- **Fast rejection**: The caller gets an immediate HTTP 422 with the threat type. No pending capture record is created, no queue message is sent, no wasted resources.
- **Latency budget**: The Web Risk lookup adds ~100ms to the capture request. The existing `validateUrl()` already does DNS resolution (similar latency). Combined, the pre-capture validation stays well under 300ms.
- **Fail-open on API errors**: If the Web Risk API is unavailable (timeout, 5xx), the capture proceeds. The URL was already validated for SSRF. Content safety is defense-in-depth, not a security boundary -- the re-scan cron provides a second chance. Log the API failure at severity 4 (WARN) for alerting.
- **Batch endpoint**: `handleBatchCapture` must also integrate the check. The Web Risk API does NOT support batch URL checks in a single request, so for batches, fan out individual lookups with `Promise.allSettled` and reject only the flagged URLs (partial success).

For the **scheduler** (`handleScheduledTick`), the check should happen in the queue consumer (`handleCaptureMessage`) since scheduled captures skip the HTTP path. Add the Web Risk check after the SSRF re-validation (line 150) and before the idempotency guard.

#### 3. Quarantine Model: Metadata visible, artifacts restricted

**Quarantined captures should preserve metadata but block artifact access.** This is the correct balance for security and usability:

- **Metadata endpoint** (`GET /v1/captures/{id}`): Returns the record with `status: 'quarantined'` and a new `quarantine` object containing `{ reason, threatTypes, quarantinedAt, lastCheckedAt }`. The owning tenant needs to see WHY a capture was quarantined to take action (dispute, delete, investigate).
- **Artifact endpoints** (`GET /v1/captures/{id}/artifacts/*`): Return HTTP 451 ("Unavailable For Legal Reasons") with `Content-Security-Scanning: quarantined` header and a problem+json body explaining the restriction. This prevents serving known-malicious content through WRL as a proxy.
- **Verification endpoint** (`GET /v1/verify/{id}`): Return 451. A quarantined capture must not appear "verified" -- that would undermine the integrity promise.
- **List endpoint** (`GET /v1/captures`): Include quarantined captures in listings (they are the tenant's data), but with `status: 'quarantined'` so clients can filter.

**Why not restrict metadata too?** If tenants cannot see their quarantined captures, they cannot dispute false positives or understand what happened. Hiding metadata creates support burden and opacity. The threat data (URL, timestamps) is not itself dangerous -- the artifacts (rendered HTML, screenshots of phishing pages) are.

#### 4. Re-scan Cron: New dedicated cron trigger, not overloaded onto the existing */1 schedule

**Architecture:**

- Add a **second cron trigger** (e.g., `0 */6 * * *` -- every 6 hours) specifically for content security re-scans. Do NOT overload the existing `*/1 * * * *` scheduler, which handles time-sensitive capture scheduling. Content re-scanning is a background hygiene task with different SLA requirements.
- The re-scan handler queries D1 for all `status = 'complete'` captures, paginated, checking each URL against Web Risk. Use a `last_safety_check_at` column to prioritize captures that haven't been checked recently.
- **Quarantine transition**: When a previously-safe URL is now flagged:
  1. Update `captures.status` from `'complete'` to `'quarantined'`
  2. Write quarantine metadata: `quarantine_reason`, `quarantine_threat_types`, `quarantined_at`
  3. Do NOT delete R2 artifacts (they may be needed for legal evidence or dispute resolution)
  4. Log at severity 5 (ERROR) with `event: 'security.capture_quarantined'`
  5. Dispatch a webhook to the tenant (existing webhook infrastructure) with event `capture.quarantined`
- **Un-quarantine**: If a re-scan finds a previously-quarantined URL is now clean, do NOT automatically restore. Require explicit admin action. False negatives from Google are possible, and auto-restore creates a weaponizable oscillation pattern (attacker toggles page content to cycle through quarantine/restore).
- **Rate limiting re-scan API calls**: With 100K free lookups/month, budget allocation matters. At 4 re-scans/day and 1000 captures, that's 120K lookups/month just for re-scans. Consider:
  - Only re-scan captures from the last 90 days (older content is less likely to change)
  - Exponential backoff on re-scan frequency for captures that have been clean for N consecutive checks
  - Hard cap on re-scan API calls per cron invocation (e.g., 500)

#### 5. API Key: Platform-level, not per-tenant

**One platform-level Web Risk API key**, stored as a Worker secret via `wrangler secret put GOOGLE_WEBRISK_API_KEY`. Rationale:

- WRL is a single Worker instance serving all tenants. Per-tenant Google API keys would require tenants to provision their own Google Cloud projects, which destroys the value proposition of a managed service.
- The platform key is the **principal** making the request. Google's quota and billing apply to the platform, not individual tenants.
- Store in 1Password (WRL vault, Production and Staging items) alongside other secrets, per existing conventions.
- **Separate keys for staging vs production** to isolate quota consumption and prevent staging tests from eating production free tier.

### Proposed Tasks

#### Task 1: D1 Schema Migration for Quarantine Support

**What**: Create migration `0009_content_security.sql` that:
- Adds `'quarantined'` to the valid status values for captures (currently `pending`, `complete`, `failed`). Note: D1/SQLite `CHECK` constraints are on the column definition in `0001_initial_schema.sql` -- since `ALTER TABLE ... ALTER COLUMN` is not supported in SQLite, the new status value must be handled in **application-layer validation only** (the existing CHECK constraint cannot be modified in-place; this is consistent with how `VALID_TIERS` and `VALID_BILLING_STATUSES` are already handled at the application layer in `db.js`).
- Adds columns to `captures`: `quarantine_reason TEXT`, `quarantine_threat_types TEXT` (JSON array), `quarantined_at TEXT`, `last_safety_check_at TEXT`
- Adds index: `CREATE INDEX idx_captures_safety_check ON captures (status, last_safety_check_at)` for efficient re-scan queries

**Deliverables**: Migration file, updated `db.js` with `quarantineCapture()` and `getRescanCandidates()` functions, updated `rowToCapture()` to include quarantine fields.

**Dependencies**: None.

**Security note**: The existing SQLite CHECK constraint `CHECK (status IN ('pending', 'complete', 'failed'))` on the `captures` table will **reject INSERTs/UPDATEs with `status = 'quarantined'`**. The migration must either (a) recreate the table without the CHECK (disruptive), or (b) work around it. The pragmatic approach: since D1 does not support `ALTER TABLE ... DROP CONSTRAINT`, and the project already handles tier/billing validation in application code, the migration should CREATE a new table without the CHECK, copy data, drop old table, rename. This is the standard SQLite table-alteration pattern. Alternatively, test whether D1's SQLite version enforces CHECK constraints on UPDATE (some SQLite builds have quirks here). **This must be verified empirically before implementation.**

#### Task 2: Web Risk API Client Module

**What**: Create `src/safe-browsing.js` (or `src/web-risk.js`) module that:
- Exports `checkUrl(url, env)` returning `{ safe: true }` or `{ safe: false, threatTypes: [...] }`
- Exports `checkUrls(urls, env)` for batch use, using `Promise.allSettled`
- Uses `env.GOOGLE_WEBRISK_API_KEY` secret
- Implements fail-open: on timeout (2s), network error, or non-200 response, returns `{ safe: true, degraded: true }`
- Logs all API failures at severity 4
- Logs all threat detections at severity 5
- Has configurable threat types: `MALWARE`, `SOCIAL_ENGINEERING`, `UNWANTED_SOFTWARE`
- URL-encodes the target URL properly (RFC 3986)

**Deliverables**: Module file, unit tests with mocked fetch responses (safe, unsafe, timeout, error), integration test that hits the real Web Risk API with a known-safe and known-test URL.

**Dependencies**: `GOOGLE_WEBRISK_API_KEY` provisioned in Google Cloud Console and stored via `wrangler secret put`.

#### Task 3: Pre-capture Integration

**What**: Integrate `checkUrl()` into `handleCreateCapture` (after SSRF validation, before capture ID generation) and `handleBatchCapture`. For `handleCreateCapture`:
- If `checkUrl` returns `{ safe: false }`, return HTTP 422 with problem+json: `{ detail: "URL flagged as potentially malicious", threatTypes: [...] }`
- If `checkUrl` returns `{ safe: true, degraded: true }`, proceed but log the degradation
- Log all rejections with `event: 'security.content_blocked'`

For `handleBatchCapture`:
- Check all URLs in parallel
- Return per-item errors for flagged URLs; proceed with clean URLs

For scheduled captures in `handleCaptureMessage`:
- Check URL after SSRF validation
- If flagged, fail the capture with `error: 'URL flagged by content security scanning'` and `retryable: false`

**Deliverables**: Updated `index.js` handlers, updated queue consumer, tests.

**Dependencies**: Task 2.

#### Task 4: Quarantine Enforcement on Read Paths

**What**: Update all capture read endpoints to handle `status: 'quarantined'`:
- `handleGetCapture`: Return metadata with `status: 'quarantined'` and quarantine details, but omit artifact URLs
- `handleGetCaptureArtifact`: Return 451 with problem+json body
- `handleVerifyCapture`: Return 451
- `handleCaptureStatus`: Return status `'quarantined'`
- `listCaptures`: Include quarantined captures normally (filterable by status)

**Deliverables**: Updated endpoint handlers, tests verifying 451 responses.

**Dependencies**: Task 1.

#### Task 5: Re-scan Cron Trigger

**What**: Create `src/rescan.js` with `handleRescanTick(controller, env, ctx)`:
- Query D1 for re-scan candidates: `status = 'complete'` AND (`last_safety_check_at IS NULL` OR `last_safety_check_at < datetime('now', '-6 hours')`)
- Limit to 500 URLs per invocation (API budget control)
- For each URL, call `checkUrl()`
- If newly flagged: call `quarantineCapture()`, dispatch webhook, log
- Update `last_safety_check_at` for all checked URLs (even if still safe)
- Add cron trigger to `wrangler.toml`: `0 */6 * * *` (every 6 hours) for both production and staging

**Deliverables**: Rescan module, updated `wrangler.toml`, updated `scheduled()` handler to dispatch to rescan on the 6-hour cron, tests.

**Dependencies**: Tasks 1, 2.

#### Task 6: Coralogix Alert Rule

**What**: Create alert for quarantine spike: >5 quarantines in 24 hours.
- Log events with `event: 'security.capture_quarantined'` are already structured for Coralogix
- Alert definition (Coralogix Alerts API or UI)
- Also: alert on sustained Web Risk API degradation (>10 consecutive `degraded: true` responses)

**Deliverables**: Alert configuration (documented), verification that alerts fire on test data.

**Dependencies**: Tasks 2, 5 (needs real quarantine events to test).

#### Task 7: Secret Provisioning

**What**:
- Create Google Cloud project (or use existing) for Web Risk API
- Enable Web Risk API
- Generate API keys (one for production, one for staging)
- Store in 1Password (WRL vault, Production and Staging items) under field `GOOGLE_WEBRISK_API_KEY`
- Deploy via `wrangler secret put GOOGLE_WEBRISK_API_KEY` and `wrangler secret put GOOGLE_WEBRISK_API_KEY --env staging`

**Deliverables**: Keys provisioned, 1Password updated, secrets deployed, `wrangler.toml` comments updated.

**Dependencies**: None (can be done in parallel with Task 2).

### Risks and Concerns

#### CRITICAL: Licensing -- Safe Browsing API vs. Web Risk API

The Google Safe Browsing API is **non-commercial use only**. WRL has Stripe billing, paid tiers, and is explicitly a revenue-generating service. Using the Safe Browsing API instead of Web Risk would violate Google's ToS. This is not a gray area -- the docs explicitly say "not for sale or revenue generating purposes" and direct commercial users to Web Risk.

**Mitigation**: Use Google Web Risk API. The 100K/month free tier covers early growth. Cost at scale is negligible ($0.50/1K lookups).

#### HIGH: SQLite CHECK Constraint on captures.status

The `captures` table has `CHECK (status IN ('pending', 'complete', 'failed'))` baked into the `CREATE TABLE` in migration `0001_initial_schema.sql`. Adding `'quarantined'` requires table recreation in SQLite (no `ALTER TABLE ... ALTER CONSTRAINT`). This is a data migration with risk of downtime or data loss if done incorrectly.

**Mitigation**: Use the standard SQLite table-rebuild pattern (create new table, copy data, drop old, rename). Test on staging with production-volume data first. Have a rollback migration ready.

#### HIGH: API Cost Spiral from Re-scan Cron

The re-scan cron could consume API quota rapidly as the captures table grows. 10,000 captures checked 4x/day = 40K lookups/day = 1.2M/month = ~$550/month in Web Risk costs. This exceeds capture processing costs at small scale.

**Mitigation**: Implement aggressive re-scan budgeting:
- Only re-scan captures from the last 90 days
- Exponential backoff: after 3 consecutive clean checks, reduce frequency to weekly
- Hard per-invocation cap (500 URLs)
- Monitor monthly API usage via Google Cloud billing alerts
- Consider: skip re-scan for captures whose URL domain is on a known-good allowlist (optional, future)

#### MEDIUM: Fail-open Creates a Window for Known-bad URLs

If the Web Risk API is down, captures proceed. An attacker who can detect WRL's API dependency could time attacks to coincide with Google outages or rate limit exhaustion.

**Mitigation**:
- The re-scan cron provides a second check within 6 hours
- Log all degraded checks prominently (Coralogix alert on sustained degradation)
- The fail-open window is bounded and auditable
- Alternative: fail-closed mode as a per-tenant config option for high-security tenants (future)

#### MEDIUM: Quarantine Bypass via Direct R2 Access

Quarantine only blocks access through the WRL API. If R2 bucket keys are predictable or if signed URLs exist, artifacts could be accessed directly.

**Mitigation**: Current architecture uses R2 binding (not public bucket), so artifacts are only accessible through the Worker. No signed URL generation exists. This is already secure by design. Document this assumption so future changes (e.g., CDN-served artifacts) don't inadvertently bypass quarantine.

#### MEDIUM: Webhook Disclosure of Quarantined Content

When a capture is quarantined, the webhook to the tenant includes the URL. If the tenant's webhook endpoint is compromised, this leaks which URLs WRL considers malicious.

**Mitigation**: Webhooks already go to tenant-configured endpoints (authenticated via HMAC signing). The URL itself is not secret (it was submitted by the tenant). The webhook should include the quarantine reason but NOT any rendered content. This is acceptable risk.

#### LOW: Google Web Risk API Availability

Google's API has high availability but is a single external dependency. No SLA is published for the free tier.

**Mitigation**: Fail-open design, re-scan cron as secondary check, alert on sustained degradation. Consider adding a second threat intelligence source in the future (e.g., Cloudflare Radar URL Scanner) for redundancy.

#### LOW: False Positives Causing Legitimate Content Quarantine

Google's threat lists have false positives. A quarantined capture of legitimate content damages trust.

**Mitigation**:
- No auto-un-quarantine (prevents oscillation attacks)
- Admin API to manually lift quarantine after review
- Webhook notification gives tenants immediate awareness
- Future: tenant-facing dispute flow

### Additional Agents Needed

**iac-minion** -- Needed to:
- Provision Google Cloud project and enable Web Risk API
- Generate and deploy API keys via `wrangler secret put`
- Update `wrangler.toml` with the new cron trigger
- Create/configure Coralogix alert rules

No other additional specialists are needed. The implementation is within the existing Worker codebase, uses established patterns (D1 migrations, queue consumers, cron triggers, Coralogix logging), and the existing team can handle the code changes.
