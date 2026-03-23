## Domain Plan Contribution: security-minion

### Recommendations

#### (a) Can a tenant bypass quotas by creating multiple API keys?

**Answer: No -- the data model correctly prevents this.** API keys are bound to
tenants via `api_keys.tenant_id` (see `src/db.js:createApiKeyRecord`). The
`verifyApiKey` function in `src/auth.js` resolves every key to its `tenantId`
before any operation proceeds. Usage counters in `usage_counters` are keyed on
`(tenant_id, period)`, not on API key hash. Quotas checked against
`usage_counters.capture_count` will aggregate all activity for a tenant
regardless of which key was used.

**However, there are two bypass vectors to address:**

1. **Self-serve tenant re-registration**: A GitHub user could create a second
   GitHub account and sign up again, getting a fresh `gh-{id}` tenant with a
   fresh quota. This is an inherent limitation of self-serve signup and is
   acceptable at the free tier. Mitigation is out of scope per the spec
   ("automatic tier upgrades" are out), but the system should log tenant
   creation events so operators can spot abuse patterns.

2. **Legacy auth bypass**: The legacy `CAPTURE_API_KEY` fallback in
   `verifyApiKey` (line 212-236) always returns `tenantId: 'default'`. If the
   `default` tenant has a different quota tier than the caller's actual
   tenant, this could be exploited. **Recommendation: ensure legacy auth is
   either removed before quota enforcement ships, or the `default` tenant
   inherits the most restrictive (free) tier quotas.**

#### (b) Maximum realistic overage and intentional exploitation

**Architecture analysis:**

The capture flow is two-phase:
1. **HTTP handler** (`handleCreateCapture`): auth, rate limit, create D1
   record, enqueue to `CAPTURE_QUEUE`, return 202.
2. **Queue consumer** (`handleCaptureMessage`): dequeue, run browser capture,
   `incrementUsage` via `ctx.waitUntil()`.

Usage counters are incremented **after** capture completion (line 163 of
`index.js`), not at enqueue time. This is the TOCTOU gap.

**Quota check placement matters critically.** Per the spec, the quota check
runs "before browser session creation." Two options:

- **Check at HTTP handler (before enqueue)**: The counter lags because
  `incrementUsage` fires post-completion. Captures already in-flight or
  queued are invisible to the check.

- **Check at queue consumer (before browser launch)**: Tighter enforcement
  because fewer captures are "in flight" between check and increment. But
  the tenant already received a 202 -- they believe the capture was accepted.

**Recommended: check at both points.** Primary enforcement at the HTTP
handler (to fail fast with 429 before creating a D1 record and queue
message). Secondary defense-in-depth at the queue consumer (to catch
captures that slipped through the race window -- fail them with a
`quota_exceeded` error instead of launching a browser).

**Maximum realistic overage calculation:**

- `max_concurrency = 10` globally across all tenants. Per-tenant rate limit
  is 10/60s (or custom override, max 100/60s via binding ceiling).
- Worst case: a tenant submits a burst of captures right at quota boundary.
  Due to rate limiting (10/60s default), at most 10 captures could be
  accepted in a single rate limit window before the counter updates.
- With `max_concurrency = 10`, at most 10 captures could be simultaneously
  processing in the queue consumer. But since captures take 5-30 seconds,
  only a fraction of those would complete between the quota check and the
  next check.
- **Realistic maximum overage: ~10 captures** (one rate limit window's worth
  of burst, all accepted before the first `incrementUsage` writes back).
  With the secondary queue-consumer check, this drops to ~1-2 (only those
  that passed the consumer check simultaneously before any increment landed).

**Intentional exploitation risk:**

A malicious tenant could deliberately time burst requests to maximize the
TOCTOU gap. This is bounded by the rate limiter (10/60s default, 100/60s
ceiling). With the dual-check approach, exploitation is limited to the number
of concurrent in-flight captures for that tenant, which is at most
`max_concurrency = 10` (shared globally, so typically fewer per tenant).

**Assessment: acceptable.** The spec explicitly allows "slight overages."
10 captures over a 100/month free tier is 10% overage in the worst case.
For the pro tier (5000/month), it is negligible (0.2%). The dual-check
approach brings this to 1-2 captures of overage in practice.

#### (c) Admin key protection for per-tenant quota overrides

The quota override will be stored in the `tenants.config` JSON column, set via
`PUT /v1/admin/tenants/:tenantId/config`. This endpoint is already gated by
`verifyAdminKey` (infrastructure secret), not tenant API keys. This is the
correct protection level.

**Recommendation: admin key is sufficient.** Reasons:

1. Quota overrides are an operational setting, same category as rate limit
   overrides which already live in tenant config and use the same admin key.
2. Adding a separate auth mechanism would increase complexity with no
   meaningful security benefit -- anyone with the admin key already has full
   infrastructure access.
3. The admin key is rate-limited (5 req/60s per IP via `ADMIN_RATE_LIMITER`)
   and timing-safe compared.

**Additional safeguards:**

- **Input validation**: Quota override values must be validated on write.
  Enforce minimum 0 (or 1), maximum sane upper bounds (e.g., 1M
  captures/month, 10 TB storage). Reject negative values, non-integers for
  capture counts, and non-positive values for storage.
- **Audit logging**: The existing `admin.tenant_config_updated` log event
  (index.js:1131) covers this. Ensure the log includes the old and new quota
  values for diff-ability.
- **No tenant self-service for quota changes**: The `/v1/account/*` routes
  must NOT expose quota override writes. The session-gated account routes
  should only expose read access to quota/usage data.

#### (d) Absolute numbers vs. relative (percentage of quota) in usage dashboard

**Recommendation: expose both, with deliberate choices about what goes where.**

- **Usage dashboard (authenticated, session-gated)**: Show absolute numbers
  AND percentage. The tenant needs absolute numbers to understand their
  consumption, and percentages to understand proximity to limits. The session
  is already tenant-scoped, so there is no cross-tenant information leakage.

- **429 quota_exceeded response body**: The spec already defines
  `{ "limit": N, "used": N }`. This is fine -- a tenant calling the API with
  their own key already knows their own identity. The response should NOT
  include tier name, only the numeric limits. Reason: tier names are
  internal business categories; exposing them gives tenants information about
  your pricing model that could be used to negotiate or reverse-engineer
  other tenants' arrangements.

- **GET /auth/session response**: Currently returns `githubId`,
  `githubLogin`, `tenantId`, `tosAcceptedAt`, `tosVersion`. **Do NOT add
  tier or quota information here.** This endpoint fires on every page load
  and should remain minimal. Create a separate `/v1/account/usage` endpoint
  for the dashboard to call.

#### (e) Security implications of surfacing tier information

**Risk: tenant inference of other tenants' tiers is LOW but not zero.**

Attack scenario: A tenant could probe the system's behavior under different
conditions to infer tier information about other tenants. Specific vectors:

1. **Rate limit headers**: Already exposed via `X-RateLimit-Limit`. Custom
   rate limit overrides are visible in these headers. A tenant can see their
   own limits but not others'. Low risk.

2. **Quota limits in 429 response**: The `{ "limit": N }` field reveals the
   tenant's own quota. If default tier quotas are public (e.g., on a pricing
   page), this tells the tenant nothing new. If a tenant has a custom
   override, the 429 response reveals their specific limit. This is
   acceptable -- they need to know their own limit.

3. **Cross-tenant inference via shared infrastructure**: The
   `GLOBAL_CAPTURE_LIMITER` (200/60s) is shared across all tenants. If a
   tenant gets 503 "Service at capacity," they know the global system is
   busy, but cannot distinguish which other tenants are consuming capacity.
   Low risk.

4. **Timing side-channels**: If the quota check adds measurably different
   latency for different tiers, an attacker could infer information. However,
   the spec requires <10ms for the quota check (single D1 read). Since all
   tiers use the same code path with the same D1 query, timing differences
   will be below measurement noise. No risk.

**Recommendation:**

- Do NOT expose tier name/label in API responses or user-facing endpoints.
  Expose only numeric limits (captureLimit, storageLimitBytes).
- Do NOT expose other tenants' usage or limits in any endpoint. All usage
  endpoints must be tenant-scoped.
- The admin usage endpoint (`GET /v1/admin/usage`) already correctly requires
  the admin key, so cross-tenant visibility is admin-only.
- If a public pricing page exists, the default tier quotas are public anyway.
  Custom overrides should remain private to the tenant + admin.

### Proposed Tasks

#### Task 1: Quota enforcement at HTTP handler (pre-enqueue check)

**What**: Add a quota check in `handleCreateCapture` and `handleBatchCapture`
after auth and rate limit checks, before creating the D1 capture record.
Read `usage_counters` for the current period and compare against the
tenant's tier default or custom override from `tenants.config`.

**Deliverables**:
- `checkQuota(db, tenantId, metric)` function in `src/db.js` (or new
  `src/quota.js`) that returns `{ allowed: true }` or
  `{ allowed: false, limit, used }`.
- Default tier definitions (free: 100 captures/month, 1 GB storage; pro:
  5000 captures/month, 50 GB storage) as constants.
- 429 response with `quota_exceeded` error shape per spec.
- Batch capture handler must check quota against batch size (remaining
  capacity vs. items in batch), not just single-item.

**Dependencies**: Tier field on tenant record (migration task), usage counter
data (R25, already implemented).

**Security requirements**:
- Quota check must read from D1, not a cached value (stale caches could allow
  bypass). The spec allows <10ms latency -- a single D1 read is well within
  this.
- Reject the entire batch if remaining quota is less than batch size, OR
  accept a partial batch up to the remaining quota. Decision for design, but
  either way the check must happen BEFORE any D1 writes or queue dispatches.

#### Task 2: Defense-in-depth quota check at queue consumer

**What**: Add a secondary quota check in `handleCaptureMessage` before calling
`performCapture`. If the tenant is now over quota (due to captures that
completed after the HTTP handler check), fail the capture with
`status: 'failed'`, `error: 'quota_exceeded'`, `retryable: false`, and
ack the message (do not retry -- the quota won't un-exceed).

**Deliverables**:
- Quota check call in `handleCaptureMessage`, after idempotency guard (line
  124) and before `performCapture` call (line 143).
- Log event: `capture.quota_exceeded_dequeue` with tenantId, captureId,
  used, limit.

**Dependencies**: Task 1 (shared `checkQuota` function).

**Security requirements**:
- Must NOT retry quota-exceeded captures. Retrying would waste queue
  throughput and never succeed within the billing period.
- Must ack the message after failing it, to prevent DLQ accumulation.

#### Task 3: Tier field migration and default assignment

**What**: Add a `tier` column to the `tenants` table. New migration
(`0005_tenant_tiers.sql`) with `ALTER TABLE tenants ADD COLUMN tier TEXT NOT
NULL DEFAULT 'free'`. Existing tenants (including `default`) get `'free'`.

**Deliverables**:
- Migration file.
- `getTenantTier(db, tenantId)` function or extend `getTenantConfig` to
  include tier.
- Validation: tier values must come from an allowlist (`free`, `pro`). No
  freeform strings.

**Security requirements**:
- Tier assignment can only be changed via admin API (`PUT /v1/admin/tenants/
  :tenantId/config` or a new dedicated endpoint). Never via session-gated
  account routes.
- The `createGitHubUser` flow (self-serve signup) must always assign
  `'free'` tier. The tier value must not be controllable by the OAuth
  callback or any user-supplied data.
- Input validation: reject unknown tier values with 400, not silently
  default. Fail closed.

#### Task 4: Tenant-scoped usage endpoint for the dashboard

**What**: New `GET /v1/account/usage` endpoint, session-gated (same auth as
other `/v1/account/*` routes). Returns usage for the authenticated tenant's
current billing period, plus their quota limits.

**Deliverables**:
- Handler returning `{ period, captureCount, captureLimit, storageBytes,
  storageLimitBytes, percentUsed: { captures, storage } }`.
- No tier name in the response -- only numeric limits.

**Security requirements**:
- Must be scoped to the authenticated tenant (from session's `tenantId`).
  No `?tenant=` parameter.
- Must NOT expose other tenants' data.
- Must NOT expose tier name (internal business category).
- Cache-Control: `private, no-store` (usage data is sensitive and
  tenant-specific).
- Rate-limited per the account group limits.

#### Task 5: Quota override validation in tenant config

**What**: Extend `setTenantConfig` validation (currently only validates
`rateLimit` overrides) to also validate quota overrides.

**Deliverables**:
- Validation for `config.quota.captureLimit` (positive integer, max 1000000)
  and `config.quota.storageLimitBytes` (positive integer, max 10TB in bytes).
- Reject `config.tier` if set via config (tier should be a top-level column,
  not embedded in JSON config, to prevent confusion and ensure schema
  enforcement).
- Log old vs. new quota values in the `admin.tenant_config_updated` event.

**Dependencies**: Task 3 (tier column).

#### Task 6: Legacy auth quota alignment

**What**: Ensure the `default` tenant (used by legacy `CAPTURE_API_KEY` auth)
is subject to free-tier quotas, preventing legacy auth as a quota bypass.

**Deliverables**:
- Verify `default` tenant exists in D1 with `tier = 'free'`.
- If legacy auth is slated for removal, document the timeline. If not,
  ensure quota checks apply identically to `tenantId: 'default'`.

**Dependencies**: Task 1, Task 3.

### Risks and Concerns

1. **TOCTOU race window in usage counters (MEDIUM)**: Usage is incremented
   post-capture via `ctx.waitUntil()`. Between the HTTP handler quota check
   and the increment, captures are invisible to the quota. The dual-check
   approach (Tasks 1 + 2) mitigates this to 1-2 captures of overage. This
   is explicitly accepted by the spec ("slight overages are acceptable").

2. **`ctx.waitUntil` increment failures (MEDIUM)**: If `incrementUsage`
   fails (D1 transient error), the counter underreports, and the tenant
   effectively gets free captures. The current code logs this as a warning
   (`wrl:usage_increment_fail`) but does not retry. For quota enforcement,
   this means a tenant could accumulate uncounted captures. **Mitigation**:
   consider moving `incrementUsage` out of `ctx.waitUntil()` and into the
   synchronous path for the queue consumer -- the capture is already
   complete, so a few ms of D1 write latency is acceptable. Alternatively,
   add a periodic reconciliation job that counts D1 `captures` rows per
   tenant per period and corrects `usage_counters`.

3. **Storage quota enforcement gap (HIGH in implementation complexity)**:
   Capture count quotas are straightforward -- increment by 1 per capture.
   Storage quotas depend on `result.storedBytes`, which is only known after
   the capture completes. A tenant at 999 MB of a 1 GB limit could submit
   a capture that produces 500 MB of artifacts, pushing them to 1.5 GB.
   **Pre-capture storage estimation is unreliable.** Recommendation: enforce
   storage quotas at the queue consumer AFTER the capture completes but
   BEFORE incrementing the counter. If over storage quota, the artifacts are
   already stored (can't un-upload mid-capture). Options: (a) accept the
   overage and block the next capture, (b) delete the artifacts and fail the
   capture. Option (a) is simpler and consistent with "slight overages are
   acceptable."

4. **Batch capture quota exhaustion (MEDIUM)**: A batch of 10 URLs where the
   tenant has 3 captures remaining. Decision needed: reject the entire batch
   (simpler, but poor UX) or accept partial (up to remaining quota, reject
   the rest with 429). The current batch handler has precedent for partial
   success (rate limit mid-batch returns per-item errors). Partial acceptance
   is consistent with existing behavior.

5. **Tier escalation via config manipulation (LOW)**: The `PUT /v1/admin/
   tenants/:tenantId/config` endpoint currently accepts arbitrary JSON in the
   config body (only `rateLimit` is validated). If tier is stored in config
   JSON rather than as a dedicated column, a future developer could
   accidentally allow tier changes via config updates. **Mitigation**: store
   tier as a dedicated column (Task 3), and explicitly reject `tier` in
   config JSON (Task 5).

6. **Information disclosure in error responses (LOW)**: The quota_exceeded
   response includes `limit` and `used` values. For the tenant's own
   request, this is expected. Ensure these values are not cached by
   intermediaries (enforce `Cache-Control: private, no-store` on 429
   responses).

### Additional Agents Needed

None -- the current team is sufficient. The security concerns are
addressable within the existing architecture. The key security decisions
(dual-check placement, tier column vs. config JSON, response shape) are
documented above for the synthesis phase.
