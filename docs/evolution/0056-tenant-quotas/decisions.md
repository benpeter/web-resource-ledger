# Decisions: R26 Tenant Quotas

## D1: Tier as column vs JSON field

**Chosen**: `tier TEXT NOT NULL DEFAULT 'free'` as a real column on `tenants` table.

**Rejected**: Storing tier inside the existing `config` JSON blob.

**Rationale**: Tier is a core business attribute that every capture request reads
and that operators may want to query/filter. A real column enables indexed lookups
and gets picked up automatically by the existing `INSERT OR IGNORE INTO tenants(id)`
statements -- auto-provisioned tenants become free tier with zero code changes.
The config JSON is for optional operator overrides, not core identity.

**Source**: data-minion planning, validated by api-design-minion.

## D2: Default quotas in code, not D1

**Chosen**: `TIER_QUOTAS` constant map in `src/quotas.js`, mirroring
`RATE_LIMITS` in `src/rate-limits.js`.

**Rejected**: Storing default quotas in a D1 table.

**Rationale**: Quota defaults are product policy, not tenant data. They change
with code releases and should deploy atomically. The existing rate limit pattern
proves this works well -- operators override per-tenant via config JSON;
defaults live in code.

**Source**: data-minion recommendation, consensus across all specialists.

## D3: RFC 9457 Problem Detail with limitType discriminator

**Chosen**: Reuse existing `problemResponse(429)` with `limitType: 'quota'` and
a nested `quota` object containing `limit`, `used`, `resource`, `resetsAt`.

**Rejected**: (a) Custom error shape matching the issue's `{ error: "quota_exceeded" }`
format -- would diverge from the established RFC 7807/9457 pattern. (b) Separate
endpoint returning quota status before capture -- YAGNI, adds latency.

**Rationale**: The codebase already uses RFC 9457 Problem Detail for all error
responses. Rate limit 429s use `limitType: 'tenant'`. Adding `limitType: 'quota'`
gives clients a clean discriminator with no breaking changes. The nested quota
object adds structured context without cluttering the top-level error shape.

**Source**: api-design-minion, validated by software-docs-minion.

## D4: Quota check placement -- after rate limit, before body parse

**Chosen**: Quota check sits after the per-tenant rate limit (Step 3) and before
URL validation/body parsing (Step 6) in the capture pipeline.

**Rejected**: (a) Before rate limit -- rate limit is cheaper (KV read vs D1 batch),
so it should short-circuit first. (b) After body parse -- wastes CPU parsing a
request body that will be rejected. (c) In the queue consumer -- the 202 has
already been returned; reject at the HTTP handler for fail-fast.

**Rationale**: Rate limit is O(1) KV lookup. Quota check is a D1 batch (two PK
lookups, sub-2ms). Ordering cheaper checks first minimizes wasted work.

**Source**: api-design-minion and iac-minion alignment.

## D5: No KV caching for quota check

**Chosen**: Direct D1 read on every capture request.

**Rejected**: Caching tier/quota data in KV with short TTL.

**Rationale**: iac-minion confirmed D1 edge-colocated reads are sub-5ms for simple
PK lookups. The `db.batch()` two-statement pattern stays well within the 10ms
latency budget. Adding KV caching would introduce staleness, cache invalidation
complexity, and additional KV reads -- all for marginal latency savings. YAGNI.

**Source**: iac-minion planning.

## D6: Whole-batch rejection

**Chosen**: Batch captures check quota upfront for the full batch size. If
`captureCount + urls.length > quota`, the entire batch is rejected with 429.

**Rejected**: Partial acceptance -- accept captures up to the remaining quota,
reject the rest with a 207 Multi-Status response.

**Rationale**: Partial acceptance creates confusing accounting for the tenant.
They would need to track which URLs from a batch succeeded and which were quota-
rejected, then decide whether to retry the rejected subset. Whole-batch rejection
is simpler for clients: either everything goes through or nothing does.

**Source**: api-design-minion, endorsed by ux-strategy-minion.

## D7: Usage dashboard in settings, not new route

**Chosen**: Usage section within the existing `#/settings` view, between Account
and API Keys cards.

**Rejected**: (a) New `#/usage` route -- adds navigation complexity for a
single-page feature. (b) Inline usage in the session boot response -- bloats the
critical auth path.

**Rationale**: Settings is where users go for account management. Usage is account
info. A dedicated route would be empty space for two progress bars. The data source
is a dedicated `GET /v1/account/usage` endpoint (not inline in session response)
to keep the auth boot payload lightweight.

**Source**: frontend-minion and ux-strategy-minion alignment.

## D8: "Starter" display name for free tier

**Chosen**: Internal code uses `free`/`pro`. UI shows `Starter`/`Pro`. Tier name
never appears in error responses.

**Rejected**: (a) Showing "Free" in the UI -- ux-strategy-minion flagged negative
connotations ("you're on the cheapest plan"). (b) Exposing tier name in 429
responses -- security-minion flagged potential information disclosure.

**Rationale**: "Starter" is neutral and forward-looking. Keeping tier names out
of error responses prevents tenants from inferring tier assignment of other
tenants through error message differences.

**Source**: Conflict resolution between ux-strategy-minion (naming) and
security-minion (information disclosure).

## D9: Overruled security-minion on queue consumer check

**Chosen**: Quota enforcement only at the HTTP handler (fail-fast at capture
submission), not at the queue consumer.

**Rejected**: security-minion recommended a dual-check -- validate quota both at
HTTP submission and again in the queue consumer before browser launch.

**Rationale**: By the time the queue consumer runs, the 202 response has already
been returned to the client. Rejecting in the consumer would create a silent
failure (capture accepted, then quietly dropped). The TOCTOU window is bounded by
the per-tenant rate limit -- at most a handful of concurrent captures can slip
through before the counter updates. Slight overages are explicitly acceptable
per the issue constraints.

**Source**: Overruled security-minion recommendation during synthesis.

## D10: checkQuota reuse in usage endpoint

**Chosen**: `GET /v1/account/usage` calls `checkQuota(db, tenantId, 0)` to get
quota and usage data, then reshapes the result for the API response.

**Rejected**: Duplicate D1 batch query in the usage endpoint handler.

**Rationale**: Multiple reviewers (Lucy, Margo) flagged that Task 3 would
duplicate the exact D1 batch query from `checkQuota`. Calling with `count=0`
effectively becomes a usage-only query. A fallback path handles the edge case
where the tenant is over limit (checkQuota returns `allowed: false` but the usage
endpoint still needs to return data, not an error).

**Source**: Lucy and Margo ADVISE during Phase 3.5, incorporated into Task 3.
