# Domain Plan Contribution: security-minion

## Recommendations

### 1. Scheduled Handler Authentication: Internal Service Identity

The `scheduled()` handler runs without an HTTP request -- there is no `Authorization` header, no session cookie, and no client IP. This is invoked directly by Cloudflare's infrastructure. The handler has full access to `env` bindings (D1, R2, queues, secrets).

**Recommendation:** The `scheduled()` handler MUST NOT call `verifyApiKey()` or `verifyAdminKey()`. Instead, treat the scheduled handler as a trusted internal caller (Cloudflare guarantees only cron triggers invoke it). When it enqueues captures, it should inject a synthetic auth identity:

- `authMethod: 'scheduled'`
- `tenantId`: read from the schedule record in D1
- No API key hash or key name (not applicable)

The queue consumer (`handleCaptureMessage`) already validates message structure (tenantId regex, captureId regex, URL string). The scheduled handler feeds into the same queue, so all existing defense-in-depth applies: SSRF re-validation on dequeue, idempotency guard, capture lifecycle state machine.

**Critical constraint:** The scheduled handler must NEVER accept external parameters at runtime. The URL and tenantId come exclusively from D1 schedule records that were validated at creation time via authenticated API endpoints. This is the trust boundary -- the schedule record is the authorization artifact.

### 2. Cron Expression Validation: Deny Dangerous Patterns

Cron expressions from tenants flow into `wrangler.toml` `[triggers]` configuration (if using static cron triggers) or into D1 schedule records (if using a polling approach). Either way, malicious cron expressions can cause resource exhaustion.

**Recommendation:** Implement a strict cron parser with these constraints:

- **Minimum interval: 5 minutes.** Reject any expression that fires more often than once per 5 minutes. This prevents `* * * * *` (every minute) or `*/1 * * * *` from exhausting browser sessions, queue capacity, and quota.
- **Allowlist cron syntax:** Accept only standard 5-field cron (minute, hour, day-of-month, month, day-of-week). Reject extensions like `@reboot`, `@every`, second-level granularity, or non-standard specifiers.
- **Validate ranges:** Minutes 0-59, hours 0-23, day-of-month 1-31, month 1-12, day-of-week 0-7. Reject out-of-range values.
- **Maximum expression length:** 128 characters. Reject longer expressions.
- **Compute next-N firings:** Before accepting a schedule, compute the next 10 firing times and verify the minimum interval between any two consecutive firings is >= 5 minutes. This catches edge cases that simple regex validation misses (e.g., `0,1,2,3,4,5,6,7,8,9,10,... * * * *`).

**Implementation:** Use a well-maintained cron parser library (e.g., `cron-parser` or `croner`) -- do NOT write custom cron parsing. Cron syntax has enough edge cases that hand-rolled parsers reliably miss something. Pin the library version. The library should be evaluated for supply chain risk (check npm downloads, maintainer count, last publish date, known CVEs).

### 3. Schedule CRUD Endpoints: Reuse Existing Auth + Scope Model

Schedule management (create, list, update, delete, pause/resume) must be tenant-authenticated API endpoints.

**Recommendation:**

- **Required scope:** `capture` (since creating a schedule creates future captures). This reuses the existing scope hierarchy where `capture` implies `read`.
- **Auth flow:** Use the existing `verifyAuth()` dual-auth function (session cookie OR API key). No new auth mechanism needed.
- **Tenant isolation:** Every schedule record must have a `tenant_id` column. All queries must filter by `WHERE tenant_id = ?`. Never expose schedules cross-tenant. This is an IDOR prevention requirement (A01 Broken Access Control).
- **URL validation at creation time:** Call `validateUrl()` at schedule creation. The URL must pass SSRF validation before being stored. Additionally, re-validate at execution time (the URL's DNS could change between creation and execution -- the existing queue consumer pattern already does this).
- **Schedule ID format:** Follow the existing pattern -- `sch_` + 32 hex chars from `crypto.randomUUID()`. Validate with regex on all input paths.

### 4. Per-Tenant Schedule Limits: Abuse Prevention

Per-tenant limits on the number of active schedules are essential to prevent resource exhaustion.

**Recommendation:**

- **Default limit: 10 active schedules per tenant.** This is sufficient for legitimate use and prevents a single tenant from monopolizing cron execution slots.
- **Configurable via tenant config:** Use the existing `tenantConfig` pattern (D1 `tenants.config` JSON column) to allow per-tenant overrides. The override structure: `{ "schedules": { "maxActive": 25 } }`.
- **Hard ceiling: 100 schedules per tenant.** Even admin-configured overrides cannot exceed this. Enforced in application code, not just config validation.
- **Count enforcement:** At schedule creation, `SELECT COUNT(*) FROM schedules WHERE tenant_id = ? AND status = 'active'` must be checked. This must be done in the same D1 batch/transaction as the INSERT to prevent TOCTOU races.
- **Paused schedules count toward the limit.** A tenant cannot create 10 active + 90 paused schedules to circumvent the limit. The limit applies to all non-deleted schedules.

### 5. Rate Limiting for Scheduled Captures

Scheduled captures bypass HTTP rate limiters (CAPTURE_RATE_LIMITER, CAPTURE_IP_GUARD) because there is no HTTP request and no client IP.

**Recommendation:**

- **Quota enforcement is mandatory.** Before enqueuing a capture from the scheduled handler, call `checkQuota()` for the tenant. If the tenant is over quota, skip the scheduled capture and log it. This reuses the existing quota system and ensures scheduled captures count against the same monthly limits.
- **Per-tenant captures-per-hour guard.** Add a secondary rate limit specifically for scheduled captures: max N captures per tenant per hour from scheduled triggers. This prevents a scenario where a tenant creates 10 schedules, each firing every 5 minutes, generating 120 captures/hour. A reasonable default: 30 scheduled captures per tenant per hour.
- **Global scheduled capture limit.** Add a per-cron-invocation ceiling: process at most M total captures per scheduled() invocation across all tenants. This bounds the blast radius of a runaway cron job. Suggested ceiling: 50 captures per invocation.
- **Browser session pool awareness.** The existing session pool has a `max_concurrency` of 10 for the queue consumer. Scheduled captures feed into the same queue. No additional pool configuration is needed, but the scheduled handler should not enqueue more captures than the queue can reasonably process before the next cron firing.

### 6. SSRF: Dual Validation (Create-Time + Execute-Time)

The existing SSRF model validates URLs at two points: HTTP endpoint (creation) and queue consumer (dequeue). Scheduled captures add a third temporal dimension: the URL is stored and executed repeatedly over days/weeks.

**Recommendation:**

- **Create-time validation:** `validateUrl()` at schedule creation -- reuse existing function. This catches obviously malicious URLs immediately.
- **Execute-time validation:** The queue consumer already calls `validateUrl()` on every dequeued message (line 141 of index.js). No changes needed here.
- **DNS rebinding window:** The gap between create-time and execute-time validation for schedules is much longer than for one-off captures (days/weeks vs seconds). An attacker could register a domain, create a schedule pointing at it, wait for validation to pass, then point the domain's DNS at a private IP. The execute-time re-validation in the queue consumer mitigates this. Document this explicitly as the primary defense for scheduled captures.
- **Do NOT cache the resolved IP from creation time.** Always re-resolve at execution time.

### 7. Queue Message Provenance

Currently, queue messages contain `{ captureId, url, ip, tenantId, cip, enqueuedAt }`. The scheduled handler will enqueue messages without a `cip` (no client IP) and without an HTTP-originated IP.

**Recommendation:**

- Add a `source` field to queue messages: `'api'` for HTTP-originated captures, `'scheduled'` for cron-originated captures. This enables audit logging to distinguish capture provenance.
- Add a `scheduleId` field (nullable) so that capture records can be linked back to the originating schedule for grouping and review.
- The `cip` field should be `null` or omitted for scheduled captures. The queue consumer already handles `undefined` cip gracefully.
- **Do NOT add a `scheduledAt` timestamp from the cron controller.** Use `enqueuedAt` consistently. The `controller.scheduledTime` is informational metadata -- log it but do not use it as a trust-bearing field.

### 8. Schedule Record Integrity

Schedule records in D1 contain the URL and cron expression that drive future captures. If an attacker compromises a tenant's API key, they can create schedules that generate captures on their behalf.

**Recommendation:**

- **Audit logging:** Log all schedule CRUD operations (create, update, pause, resume, delete) with the auth identity (keyName, keyHashPrefix, authMethod). This enables forensic reconstruction of who created what schedule.
- **Schedule status state machine:** `active` -> `paused` -> `active` (toggle), `active`/`paused` -> `deleted` (soft delete). No resurrection of deleted schedules. The `deleted` state is terminal.
- **Immutable URL:** Once a schedule is created, the URL cannot be changed via update. To change the URL, delete the schedule and create a new one. This prevents an attacker from creating a benign schedule and later redirecting it to an SSRF target. (The execute-time re-validation mitigates this, but defense-in-depth says prevent the mutation entirely.)

### 9. Cron Trigger Architecture Decision: Single Polling Trigger vs Per-Schedule Triggers

Cloudflare Cron Triggers are configured in `wrangler.toml` and are static per deployment. You cannot dynamically add/remove cron triggers at runtime. This means per-schedule cron triggers are not viable for a multi-tenant service.

**Recommendation:** Use a **single cron trigger** (e.g., every 1 minute) that polls D1 for schedules due to fire. The `scheduled()` handler:

1. Queries D1: `SELECT * FROM schedules WHERE status = 'active' AND next_fire_at <= ?`
2. For each due schedule, validates the tenant is not over quota
3. Enqueues capture messages to the existing `CAPTURE_QUEUE`
4. Updates `next_fire_at` to the next cron-computed firing time

**Security implications of the polling model:**

- **next_fire_at computation must happen server-side.** Use the cron parser in the scheduled handler to compute the next firing time. Never trust a client-supplied `next_fire_at`.
- **Missed firings:** If the scheduled handler is slow or fails, some firings may be missed. This is acceptable (fail-safe: fewer captures, not more). Do NOT implement catch-up logic that replays missed firings -- this creates an amplification vector where a brief outage triggers a burst of captures.
- **Concurrent execution protection:** Two cron invocations could overlap and both pick up the same schedule. Use optimistic locking: `UPDATE schedules SET next_fire_at = ? WHERE id = ? AND next_fire_at = ?` (CAS). If the UPDATE affects 0 rows, another invocation already claimed it.
- **D1 row count:** A single `SELECT` scanning all active schedules across all tenants must be efficient. Add an index on `(status, next_fire_at)`.

### 10. Billing Integration for Scheduled Captures

Scheduled captures must count against the tenant's billing meter and quota.

**Recommendation:**

- The queue consumer already calls `incrementUsage()` after successful capture. No changes needed for billing counting.
- However, `checkQuota()` is currently called in the HTTP handler before enqueue. For scheduled captures, `checkQuota()` must be called in the scheduled handler before enqueue. If quota is exhausted, skip the scheduled capture, log it, and optionally pause the schedule.
- **Free tier abuse:** A free-tier tenant could create schedules that consume their 200 captures/month without any human interaction, then claim ignorance. This is acceptable -- quota is quota regardless of source. But the dashboard/API should show scheduled vs manual capture counts so tenants can understand their usage.

## Proposed Tasks

1. **Implement cron expression validator** -- strict 5-field parser with minimum 5-minute interval enforcement, range validation, next-N firing computation. Use a vetted library (supply chain review required).

2. **Design schedule D1 schema** -- `schedules` table with columns: `id` (sch_...), `tenant_id`, `url`, `cron_expression`, `status` (active/paused/deleted), `next_fire_at`, `last_fire_at`, `created_at`, `updated_at`, `created_by_key_hash` (audit trail). Index on `(status, next_fire_at)`.

3. **Implement schedule CRUD endpoints** -- POST/GET/DELETE /v1/schedules, PATCH /v1/schedules/:id (pause/resume only). Auth via `verifyAuth()`, scope `capture`. Per-tenant isolation. Per-tenant count limit with TOCTOU-safe enforcement.

4. **Implement scheduled() handler** -- single cron trigger polling model. Query due schedules, validate quota, enqueue captures with `source: 'scheduled'` and `scheduleId`, update `next_fire_at` with CAS. Global per-invocation ceiling.

5. **Extend queue message schema** -- add `source` and `scheduleId` fields. Update queue consumer logging to include provenance. Update `captures` D1 schema to store `schedule_id` for grouping.

6. **Add per-tenant scheduled capture rate limit** -- hourly ceiling on captures from scheduled triggers, configurable via tenant config, enforced in the scheduled handler.

7. **Security tests** -- test that: (a) cron expressions firing more often than every 5 minutes are rejected, (b) schedules cannot be created for private/reserved IPs, (c) schedule CRUD respects tenant isolation (IDOR tests), (d) paused schedules are not fired, (e) deleted schedules cannot be reactivated, (f) URL immutability on update, (g) per-tenant schedule count limits cannot be bypassed via race conditions, (h) scheduled captures count against quota.

## Risks and Concerns

### CRITICAL: Scheduled Handler is a Privilege Escalation Boundary

The `scheduled()` handler operates with full `env` access and no per-request authentication. If an attacker can manipulate D1 schedule records (via SQL injection, admin key compromise, or a TOCTOU race in schedule creation), they gain the ability to capture arbitrary URLs on an ongoing basis without holding a valid API key. The schedule record is the implicit credential.

**Mitigation:** Defense-in-depth at every layer -- SSRF re-validation at execution time, quota enforcement before enqueue, audit logging of all schedule mutations, immutable URLs in schedule records.

### HIGH: Cron Expression as Denial-of-Service Vector

A tenant crafting a cron expression that fires every minute (even with a 5-minute floor, 10 schedules x 5-minute interval = 120 captures/hour) could exhaust browser session pool capacity for all tenants, since all scheduled captures share the same queue and browser pool.

**Mitigation:** Per-tenant hourly scheduled capture ceiling + global per-invocation ceiling + existing queue max_concurrency (10) provides layered protection. Monitor browser session utilization after launch.

### HIGH: Missed Firing Catch-Up Amplification

If the system implements catch-up logic for missed cron firings (e.g., after an outage), a brief outage followed by recovery could trigger hundreds of captures simultaneously across all tenants.

**Mitigation:** Do NOT implement catch-up. A missed firing is simply skipped. The `next_fire_at` is always computed as the next future firing time, not the next firing time after the last recorded firing.

### MEDIUM: TOCTOU in Schedule Count Enforcement

If schedule count is checked with SELECT and then INSERT in separate statements, a race between two concurrent requests could allow a tenant to exceed the limit.

**Mitigation:** Use a single D1 batch that checks the count and inserts atomically. Alternatively, `INSERT ... SELECT` with a subquery that checks the count in a single statement.

### MEDIUM: Long-Lived SSRF via Schedule Records

Schedule records persist for weeks/months. A domain that resolves to a public IP at schedule creation time could be re-pointed to a private IP later. Unlike one-off captures where the TOCTOU window is seconds, scheduled captures have a window of days/weeks.

**Mitigation:** Execute-time re-validation in the queue consumer (already exists). This is the primary defense and is sufficient given the existing TOCTOU risk acceptance documented in `url-validation.js`.

### LOW: Stale Schedule Accumulation

Tenants may create schedules and never clean them up, leading to an ever-growing number of schedules to poll.

**Mitigation:** Add a `last_fire_at` column. Schedules that have not successfully fired in 30 days could be auto-paused with a notification. Defer this to post-MVP.

## Additional Agents Needed

- **iac-minion**: Configure the cron trigger in `wrangler.toml` (`[triggers] crons = ["* * * * *"]`), add the `schedules` table migration to `migrations/`, and configure any new queue bindings if needed.
- **test-minion**: Implement the security test suite described in proposed task 7, covering IDOR, cron validation edge cases, race conditions, and quota enforcement for scheduled captures.
