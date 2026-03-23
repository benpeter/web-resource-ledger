## Delegation Plan

**Team name**: tenant-quotas
**Description**: Implement per-tenant usage quotas (captures/month, storage GB) based on tier, with pre-capture enforcement, a self-serve usage dashboard in the web UI, and OpenAPI spec updates.

### Task 1: D1 migration + quotas module
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The tier column schema and quota constant definitions are foundational -- every downstream task depends on them. Wrong schema choices are hard to reverse once code is built on top.
- **Gate rationale**: |
    Chosen: `tier` as a real column on the `tenants` table with app-layer validation; default quotas as a code constant in `src/quotas.js`; per-tenant overrides in `config.quotas` JSON
    Over: (1) Tier stored inside `config` JSON blob -- rejected because tier is a core business attribute needing indexed queries, not optional config. (2) Default quotas stored in D1 -- rejected because they change with code releases and should deploy atomically with the code that uses them. (3) Separate `quota_overrides` table -- rejected because overrides are rare and config JSON already follows this pattern for rate limits.
    Why: Maximizes consistency with existing patterns (rate-limits.js constants, config JSON overrides), avoids unnecessary schema complexity, and keeps the hot-path query simple.
- **Prompt**: |
    You are implementing the data layer for tenant quotas in the WRL (Web Resource Ledger) Cloudflare Worker.

    ## Context

    WRL is a Cloudflare Worker that captures web pages. It uses D1 (edge SQLite) for metadata. Tenants are identified by IDs like `gh-12345`. The existing schema has:
    - `tenants` table with columns: `id TEXT PRIMARY KEY`, `config TEXT` (nullable JSON), `created_at`, `updated_at`, `updated_by`
    - `usage_counters` table with `(tenant_id, period)` composite PK, columns: `capture_count`, `storage_bytes`, `api_call_count`, `updated_at`
    - Rate limit overrides stored in `tenants.config` JSON as `{ rateLimit: { capture: { limit: N, period: N } } }`
    - Default rate limits defined as code constants in `src/rate-limits.js` with `RATE_LIMITS` map and `getEffectiveLimit(tenantConfig, group)` function

    The existing `getTenantConfig()` in `src/db.js` (line 252) reads `SELECT config FROM tenants WHERE id = ?`. The existing `getUsage()` in `src/db.js` (line 701) reads usage counters by `(tenant_id, period)`. The `computePeriod()` function (line 658) returns `'YYYY-MM'` format.

    The existing migration files are in `migrations/` numbered 0001-0004.

    ## What to build

    ### 1. Migration file: `migrations/0005_tenant_tiers.sql`

    ```sql
    ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
    ```

    Note: SQLite/D1 does NOT support CHECK constraints in ALTER TABLE ADD COLUMN. Validation of allowed values ('free', 'pro') must happen at the application layer.

    ### 2. New module: `src/quotas.js`

    Create a module following the exact pattern of `src/rate-limits.js`. It should export:

    **Constants:**
    ```js
    export const TIER_QUOTAS = {
      free: { capturesPerMonth: 100, storageBytes: 1 * 1024 * 1024 * 1024 },   // 1 GB
      pro:  { capturesPerMonth: 5000, storageBytes: 50 * 1024 * 1024 * 1024 },  // 50 GB
    };

    export const DEFAULT_TIER = 'free';

    // UI display names -- internal code uses 'free'/'pro', UI shows these
    export const TIER_DISPLAY_NAMES = {
      free: 'Starter',
      pro: 'Pro',
    };
    ```

    **Functions:**

    `getEffectiveQuota(tier, tenantConfig)` -- returns the effective quota for a tenant by merging tier defaults with any per-tenant overrides from `tenantConfig.quotas`. Pattern mirrors `getEffectiveLimit()` in rate-limits.js.

    ```js
    export function getEffectiveQuota(tier, tenantConfig) {
      const defaults = TIER_QUOTAS[tier] || TIER_QUOTAS[DEFAULT_TIER];
      if (!tenantConfig?.quotas) return { ...defaults };
      return {
        capturesPerMonth: tenantConfig.quotas.capturesPerMonth ?? defaults.capturesPerMonth,
        storageBytes: tenantConfig.quotas.storageBytes ?? defaults.storageBytes,
      };
    }
    ```

    `checkQuota(db, tenantId, count = 1)` -- performs a single D1 batch read (two prepared statements in one round-trip) to get tenant tier+config and current period usage, then checks whether the capture would exceed quota. Returns a result object.

    Implementation:
    ```js
    export async function checkQuota(db, tenantId, count = 1) {
      const period = computePeriod();
      const [tenantResult, usageResult] = await db.batch([
        db.prepare('SELECT tier, config FROM tenants WHERE id = ?').bind(tenantId),
        db.prepare(
          'SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?'
        ).bind(tenantId, period),
      ]);

      const tenant = tenantResult.results?.[0];
      if (!tenant) return { allowed: false, reason: 'tenant_not_found' };

      const tier = tenant.tier || DEFAULT_TIER;
      const config = tenant.config ? JSON.parse(tenant.config) : null;
      const quota = getEffectiveQuota(tier, config);

      const usage = usageResult.results?.[0];
      const captureCount = usage?.capture_count ?? 0;
      const storageBytes = usage?.storage_bytes ?? 0;

      if (captureCount + count > quota.capturesPerMonth) {
        // Compute reset date: first of next month
        const now = new Date();
        const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
        return {
          allowed: false,
          reason: 'capture_limit',
          limit: quota.capturesPerMonth,
          used: captureCount,
          requested: count,
          resetsAt,
          period,
        };
      }

      if (storageBytes >= quota.storageBytes) {
        const now = new Date();
        const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
        return {
          allowed: false,
          reason: 'storage_limit',
          limit: quota.storageBytes,
          used: storageBytes,
          resetsAt,
          period,
        };
      }

      return {
        allowed: true,
        quota,
        captureCount,
        storageBytes,
        tier,
        period,
      };
    }
    ```

    Import `computePeriod` from `./db.js`.

    Key design decisions:
    - Use `db.batch()` with two prepared statements (same pattern as `listCaptures` in db.js) for a single D1 round-trip
    - For capture count, check `captureCount + count > quota` (not `>=`) to support batch checks where `count` may be > 1
    - For storage, check `>= quota` (current storage already at/over limit -- we can't predict new capture size)
    - Gracefully handle missing usage_counters row (default to 0) and missing tenant row

    ### 3. Update `setTenantConfig` in `src/db.js`

    Add validation for `config.quotas` fields, following the existing `config.rateLimit` validation pattern (line 277-286 of db.js):

    ```js
    // After the existing rateLimit validation block:
    if (config.quotas) {
      if (config.quotas.capturesPerMonth !== undefined) {
        if (typeof config.quotas.capturesPerMonth !== 'number' ||
            config.quotas.capturesPerMonth < 1 ||
            !Number.isInteger(config.quotas.capturesPerMonth)) {
          throw new Error('quotas.capturesPerMonth must be a positive integer');
        }
      }
      if (config.quotas.storageBytes !== undefined) {
        if (typeof config.quotas.storageBytes !== 'number' ||
            config.quotas.storageBytes < 1 ||
            !Number.isInteger(config.quotas.storageBytes)) {
          throw new Error('quotas.storageBytes must be a positive integer');
        }
      }
    }
    ```

    ### 4. Add `setTenantTier` function in `src/db.js`

    ```js
    const VALID_TIERS = ['free', 'pro'];

    export async function setTenantTier(db, tenantId, tier, updatedBy) {
      if (!TENANT_ID_RE.test(tenantId)) {
        throw new Error(`Invalid tenantId: ${tenantId}`);
      }
      if (!VALID_TIERS.includes(tier)) {
        throw new Error(`Invalid tier '${tier}'; must be one of: ${VALID_TIERS.join(', ')}`);
      }
      const updatedAt = new Date().toISOString();
      await db.prepare(
        `UPDATE tenants SET tier = ?, updated_at = ?, updated_by = ? WHERE id = ?`
      ).bind(tier, updatedAt, updatedBy, tenantId).run();
    }
    ```

    Also export `VALID_TIERS` for use by admin handlers.

    ### 5. Update `getTenantConfig` in `src/db.js`

    The existing function reads `SELECT config FROM tenants WHERE id = ?`. It does NOT need to change -- the quota check uses its own batch query that reads `tier, config` together with usage. Keep `getTenantConfig` unchanged to avoid breaking existing rate-limit callers. The quota module handles its own data access.

    ## What NOT to do

    - Do NOT modify `src/index.js` -- the capture pipeline integration is a separate task
    - Do NOT create admin API endpoints for tier management -- separate task
    - Do NOT modify the UI -- separate task
    - Do NOT add KV caching -- YAGNI (D1 PK lookup is sub-2ms, well within 10ms budget)
    - Do NOT add a CHECK constraint in the migration SQL -- SQLite/D1 ALTER TABLE doesn't support it
    - Do NOT add a separate `quota_overrides` table -- use config JSON

    ## Files to create/modify

    - CREATE: `migrations/0005_tenant_tiers.sql`
    - CREATE: `src/quotas.js`
    - MODIFY: `src/db.js` (add `setTenantTier`, `VALID_TIERS` export; add quotas validation in `setTenantConfig`)

    ## Tests

    Create `test/quotas.test.js` with tests for:
    - `getEffectiveQuota` returns tier defaults when no config overrides
    - `getEffectiveQuota` merges per-tenant overrides with tier defaults
    - `getEffectiveQuota` falls back to free tier for unknown tier names
    - `checkQuota` returns allowed:true when under limits
    - `checkQuota` returns allowed:false with capture_limit reason when at/over captures
    - `checkQuota` returns allowed:false with storage_limit reason when at/over storage
    - `checkQuota` handles missing usage_counters row (defaults to 0)
    - `checkQuota` handles missing tenant row (returns tenant_not_found)
    - `checkQuota` respects count parameter for batch checks (e.g., count=5 when 97/100 used)
    - `checkQuota` returns correct resetsAt (first of next month)

    Update `test/db.test.js` with tests for:
    - `setTenantConfig` validates quotas.capturesPerMonth (must be positive integer)
    - `setTenantConfig` validates quotas.storageBytes (must be positive integer)
    - `setTenantConfig` accepts valid quota overrides
    - `setTenantTier` validates tier values (rejects invalid, accepts 'free' and 'pro')
    - `setTenantTier` updates the tier column

    Follow the existing test patterns in `test/db.test.js` -- use the same miniflare/D1 setup, import `applyMigrations` from `test/apply-migrations.js`.

    Include the `// tva` comment near the top of `src/quotas.js`.

- **Deliverables**: `migrations/0005_tenant_tiers.sql`, `src/quotas.js`, updated `src/db.js`, `test/quotas.test.js`, updated `test/db.test.js`
- **Success criteria**: Migration applies cleanly; `getEffectiveQuota` resolves tier defaults and overrides; `checkQuota` returns correct allow/deny decisions; `setTenantTier` validates and updates; all new tests pass

### Task 2: Quota check in capture pipeline + 429 response
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: This wires the quota check into the critical capture request path. The insertion point, response format, and batch semantics affect every API consumer. Getting the 429 response shape wrong breaks SDK clients.
- **Gate rationale**: |
    Chosen: Insert quota check after rate limit (step 3) and before body parsing (step 4) in handleCreateCapture; after rate limit (step 5) and before per-URL loop (step 7) in handleBatchCapture; use existing `problemResponse(429, ..., headers, { limitType: 'quota', quota: {...} })` pattern; reject entire batch when quota insufficient
    Over: (1) Quota check in queue consumer only -- rejected because user gets 202 then silent failure. (2) Partial batch acceptance on quota -- rejected because quota is a budget concept and partial acceptance creates confusing accounting. (3) Separate 429 response type -- rejected because `limitType` discriminator on existing ProblemDetail is cleaner and backward-compatible.
    Why: Fail-fast before expensive work (D1 writes, queue dispatch); consistent with existing rate-limit response patterns; batch full-rejection is simpler and matches API design principles.
- **Prompt**: |
    You are wiring the quota check into the WRL capture pipeline and defining the 429 quota-exceeded response.

    ## Context

    WRL is a Cloudflare Worker (`src/index.js`). The capture pipeline in `handleCreateCapture` (line 534) follows these steps:
    1. Content-Type check
    2. Auth check (`verifyApiKey`) -- yields `tenantId`
    3. Usage increment (`incrementUsage` via `ctx.waitUntil`)
    4. Rate limit check (`checkCaptureRateLimit`)
    5. Global capacity check
    6. Parse JSON body
    7. Validate url field
    8. URL validation (SSRF)
    9. Generate capture ID
    10. Write D1 record
    11. Queue dispatch
    12. Return 202

    The batch endpoint `handleBatchCapture` (line 684) follows a similar pattern but parses the body first (needs batch size for rate limit check).

    Task 1 created `src/quotas.js` with:
    - `checkQuota(db, tenantId, count = 1)` returns `{ allowed: true, quota, captureCount, storageBytes, tier, period }` or `{ allowed: false, reason, limit, used, requested, resetsAt, period }`
    - `TIER_QUOTAS`, `DEFAULT_TIER`, `TIER_DISPLAY_NAMES` constants
    - `getEffectiveQuota(tier, tenantConfig)` function

    The existing 429 rate-limit response uses `problemResponse(429, detail, headers, { limitType: 'tenant' })` -- see `src/index.js` line 573. The `problemResponse` function (in `src/responses.js`) creates RFC 9457 Problem Detail responses with `...extra` spread.

    ## What to build

    ### 1. Import `checkQuota` in `src/index.js`

    Add to the imports at the top:
    ```js
    import { checkQuota } from './quotas.js';
    ```

    ### 2. Insert quota check in `handleCreateCapture`

    After the rate limit check (after line 577 where `rl.writePromise` is handled and `rlHeaders` are built) and BEFORE the global rate limit check (step 5, line 586), add the quota check:

    ```js
    // Step 3b: Monthly quota check
    const quotaCheck = await checkQuota(env.DB, tenantId);
    if (!quotaCheck.allowed) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'security.quota_exceeded',
        tenantId, keyName, keyHashPrefix, authMethod,
        reason: quotaCheck.reason,
        limit: quotaCheck.limit,
        used: quotaCheck.used,
        responseStatus: 429,
        cip,
      }) ?? Promise.resolve());

      const retryAfterDate = new Date(quotaCheck.resetsAt).toUTCString();
      const quotaHeaders = {
        'Retry-After': retryAfterDate,
        ...rlHeaders,
      };
      const detail = quotaCheck.reason === 'capture_limit'
        ? `Monthly capture quota reached (${quotaCheck.used}/${quotaCheck.limit}). Resets ${quotaCheck.resetsAt}.`
        : `Storage quota reached. Resets ${quotaCheck.resetsAt}.`;

      return problemResponse(429, detail, quotaHeaders, {
        limitType: 'quota',
        quota: {
          limit: quotaCheck.limit,
          used: quotaCheck.used,
          resource: quotaCheck.reason === 'capture_limit' ? 'captures' : 'storage',
          resetsAt: quotaCheck.resetsAt,
        },
      });
    }
    ```

    Note on `Retry-After`: Use HTTP-date format (RFC 9110) for quota responses, not seconds. Rate limits reset in seconds; quotas reset at calendar boundaries. The HTTP-date format is more meaningful.

    ### 3. Add `X-Quota-*` headers on successful 202 responses

    After the quota check passes, build quota headers. Add them to the 202 response:

    ```js
    // Build quota info headers for successful responses
    const quotaHeaders = {};
    if (quotaCheck.allowed) {
      quotaHeaders['X-Quota-Limit'] = String(quotaCheck.quota.capturesPerMonth);
      quotaHeaders['X-Quota-Used'] = String(quotaCheck.captureCount);
      quotaHeaders['X-Quota-Remaining'] = String(Math.max(0, quotaCheck.quota.capturesPerMonth - quotaCheck.captureCount));
    }
    ```

    Then merge `quotaHeaders` into the 202 response headers alongside `rlHeaders`.

    ### 4. Insert quota check in `handleBatchCapture`

    After the rate limit check (step 5, line 732) and after `rlHeaders` are built (line 755), add the quota check with the batch count:

    ```js
    // Step 5b: Monthly quota check (entire batch)
    const quotaCheck = await checkQuota(env.DB, tenantId, body.urls.length);
    if (!quotaCheck.allowed) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'security.quota_exceeded',
        tenantId, keyName, keyHashPrefix, authMethod,
        reason: quotaCheck.reason,
        limit: quotaCheck.limit,
        used: quotaCheck.used,
        requested: body.urls.length,
        responseStatus: 429,
        cip,
      }) ?? Promise.resolve());

      const retryAfterDate = new Date(quotaCheck.resetsAt).toUTCString();
      const quotaHeaders = {
        'Retry-After': retryAfterDate,
        ...rlHeaders,
      };
      const detail = quotaCheck.reason === 'capture_limit'
        ? `Batch of ${body.urls.length} captures would exceed monthly quota (${quotaCheck.used}/${quotaCheck.limit}). Resets ${quotaCheck.resetsAt}.`
        : `Storage quota reached. Resets ${quotaCheck.resetsAt}.`;

      return problemResponse(429, detail, quotaHeaders, {
        limitType: 'quota',
        quota: {
          limit: quotaCheck.limit,
          used: quotaCheck.used,
          requested: body.urls.length,
          resource: quotaCheck.reason === 'capture_limit' ? 'captures' : 'storage',
          resetsAt: quotaCheck.resetsAt,
        },
      });
    }
    ```

    The batch endpoint rejects the ENTIRE batch when quota is insufficient (not partial acceptance). This is consistent with how quota is a budget concept -- partial batch acceptance makes accounting confusing.

    ### 5. Add `X-Quota-*` headers on batch 207 response

    Same pattern as single capture -- merge quota headers into the batch 207 response.

    ## Important implementation notes

    - The quota check placement is: after auth, after rate limit, BEFORE body parsing (single) or BEFORE per-URL loop (batch). This order ensures:
      - tenantId is available (from auth)
      - Rate limit fires first (cheaper -- KV check vs D1 query)
      - Quota check avoids unnecessary work on requests that will be rejected
    - Do NOT add a quota check to the queue consumer (`handleCaptureMessage`). The spec says "before browser session creation" which means the HTTP handler. The queue consumer already has the 202 accepted -- failing silently there would violate fail-loudly principles.
    - Do NOT add quota headers to non-capture endpoints (verify, admin, etc.) -- quotas apply only to capture operations
    - Do NOT modify `src/responses.js` -- the existing `problemResponse` with `extra` spread already supports the response shape
    - Do NOT modify `src/quotas.js` or `src/db.js` -- those were built in Task 1

    ## Files to modify

    - MODIFY: `src/index.js` (import checkQuota; add quota check to handleCreateCapture and handleBatchCapture; add X-Quota-* headers to successful responses)

    ## Tests

    Update `test/capture-integration.test.js` (or the most relevant capture test file) with:
    - Capture request at quota returns 429 with `limitType: 'quota'` and `quota` object
    - Capture request under quota returns 202 with `X-Quota-*` headers
    - Batch capture where batch size exceeds remaining quota returns 429 (whole-batch rejection)
    - Batch capture under quota returns 207 with `X-Quota-*` headers
    - Quota check runs after rate limit (verify ordering by testing a request that's both rate-limited and over-quota -- should get rate limit 429, not quota 429)
    - Storage quota exceeded returns 429 with `resource: 'storage'`

    Follow existing test patterns. The test fixtures in `test/fixtures.js` can be extended if needed.

- **Deliverables**: Updated `src/index.js` with quota checks in both capture handlers; tests for pipeline integration
- **Success criteria**: Captures at/over quota return 429 with correct response shape; captures under quota return 202 with X-Quota headers; batch captures check quota upfront for the entire batch; quota check adds <10ms latency (single D1 batch)

### Task 3: GET /v1/account/usage endpoint
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are implementing the `GET /v1/account/usage` endpoint for tenant self-serve usage checking.

    ## Context

    WRL is a Cloudflare Worker. The `/v1/account/*` namespace is session-gated (authenticated via `__Host-wrl_session` cookie). The router in `src/index.js` (line 170-220) verifies the session and attaches it to `env._session` before calling account handlers.

    Existing account handlers live in `src/account.js`. They follow a consistent pattern:
    - Read `tenantId` from `env._session.tenantId`
    - Set `Cache-Control: private, no-store` via the `ACCOUNT_CACHE` constant
    - Log events with `ctx.waitUntil(log(...))`
    - Return `jsonResponse(body, status, ACCOUNT_CACHE)`

    The `getUsage()` function in `src/db.js` (line 701) reads `usage_counters` by `(tenant_id, period)` and returns `{ tenantId, period, captureCount, storageBytes, apiCallCount, updatedAt }`.

    The `computePeriod()` function in `src/db.js` (line 658) returns the current `'YYYY-MM'` period string.

    Task 1 created `src/quotas.js` with:
    - `TIER_QUOTAS` -- map of tier defaults `{ free: { capturesPerMonth, storageBytes }, pro: {...} }`
    - `TIER_DISPLAY_NAMES` -- map of `{ free: 'Starter', pro: 'Pro' }`
    - `getEffectiveQuota(tier, tenantConfig)` -- resolves effective quota from tier + config overrides
    - `DEFAULT_TIER` -- 'free'

    The `getTenantConfig()` function in `src/db.js` reads `SELECT config FROM tenants WHERE id = ?`.

    ## What to build

    ### 1. Add `handleAccountGetUsage` in `src/account.js`

    ```js
    export async function handleAccountGetUsage(request, env, ctx, _match) {
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const cip = await computeCip(env, clientIp);
      const { tenantId } = env._session;

      const period = computePeriod();

      // Batch read: tenant row (for tier + config) and usage counters
      const [tenantResult, usageResult] = await env.DB.batch([
        env.DB.prepare('SELECT tier, config FROM tenants WHERE id = ?').bind(tenantId),
        env.DB.prepare(
          'SELECT capture_count, storage_bytes FROM usage_counters WHERE tenant_id = ? AND period = ?'
        ).bind(tenantId, period),
      ]);

      const tenantRow = tenantResult.results?.[0];
      const tier = tenantRow?.tier || DEFAULT_TIER;
      const config = tenantRow?.config ? JSON.parse(tenantRow.config) : null;
      const quota = getEffectiveQuota(tier, config);

      const usage = usageResult.results?.[0];
      const captureCount = usage?.capture_count ?? 0;
      const storageBytes = usage?.storage_bytes ?? 0;

      // Compute reset date: first of next month
      const now = new Date();
      const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

      ctx.waitUntil(log(env, 3, 'oauth', {
        event: 'oauth.usage_view',
        cip,
        tenantId,
        authMethod: 'session',
        responseStatus: 200,
      }) ?? Promise.resolve());

      return jsonResponse({
        tenantId,
        period,
        tierDisplay: TIER_DISPLAY_NAMES[tier] || TIER_DISPLAY_NAMES[DEFAULT_TIER],
        captures: {
          used: captureCount,
          limit: quota.capturesPerMonth,
          remaining: Math.max(0, quota.capturesPerMonth - captureCount),
        },
        storageBytes: {
          used: storageBytes,
          limit: quota.storageBytes,
          remaining: Math.max(0, quota.storageBytes - storageBytes),
        },
        resetsAt,
      }, 200, ACCOUNT_CACHE);
    }
    ```

    Import `computePeriod` from `./db.js` and `getEffectiveQuota, TIER_DISPLAY_NAMES, DEFAULT_TIER` from `./quotas.js`.

    Key decisions:
    - Response includes `tierDisplay` (e.g., "Starter") -- NOT the internal tier name. The UI shows the display name; the internal value stays hidden.
    - `remaining` is computed server-side to avoid client math errors
    - `resetsAt` is an ISO 8601 timestamp for the first day of the next month
    - Uses a D1 batch (same pattern as checkQuota) for single round-trip
    - Cache-Control: `private, no-store` (usage data is tenant-specific, should not be cached by intermediaries)

    ### 2. Register the route in `src/index.js`

    Add the route tuple to the `routes` array, in the account routes section (after line 63):
    ```js
    ['GET',    /^\/v1\/account\/usage$/, handleAccountGetUsage],
    ```

    Add to the import from `./account.js`:
    ```js
    import { handleAccountListKeys, handleAccountCreateKey, handleAccountRevokeKey, handleAccountAcceptTos, handleAccountGetUsage } from './account.js';
    ```

    ### 3. Support API key auth for usage endpoint

    The account routes currently require session auth. However, API key users should also be able to check their own usage. Check how the session gate works in the router (around line 170-220 of index.js). If the route is session-only, that's fine for MVP -- API key users can use `GET /v1/admin/usage` with the admin key. But note this in a comment.

    Actually, looking at the router: account routes are gated by `verifySession`. API key auth goes through `verifyApiKey`. These are separate auth paths. For MVP, the usage endpoint should be session-only (consistent with all other `/v1/account/*` routes). Do NOT add API key auth to this endpoint -- it would break the security invariant that account routes are session-scoped.

    ## What NOT to do

    - Do NOT expose the internal tier name ('free', 'pro') in the response -- use `tierDisplay` with the display name ('Starter', 'Pro')
    - Do NOT modify `src/quotas.js` or `src/db.js` -- Task 1 owns those
    - Do NOT add historical usage (multi-period) -- current period only for MVP
    - Do NOT add this to the `/auth/session` response -- keep the boot payload lightweight
    - Do NOT add a `?tenant=` parameter -- always scoped to the authenticated tenant

    ## Files to modify

    - MODIFY: `src/account.js` (add `handleAccountGetUsage` handler, add imports)
    - MODIFY: `src/index.js` (add route tuple, add import)

    ## Tests

    Add tests for the new endpoint. Can go in a new `test/account-usage.test.js` or extend an existing account test file:
    - Authenticated session returns 200 with correct response shape
    - Response includes `tierDisplay`, `captures`, `storageBytes`, `resetsAt`
    - `remaining` is correctly computed (limit - used, minimum 0)
    - Tenant with zero usage returns 0 for all used fields
    - Unauthenticated request returns 401

- **Deliverables**: `handleAccountGetUsage` handler in `src/account.js`, route registration in `src/index.js`, tests
- **Success criteria**: `GET /v1/account/usage` returns current period usage with effective quota limits; response includes `tierDisplay`, `captures`, `storageBytes`, and `resetsAt`; session-gated with correct cache headers

### Task 4: Web UI usage dashboard
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    You are adding a Usage section to the WRL web UI settings view.

    ## Context

    WRL has a single-page web UI served as an inline HTML document. The UI is built with vanilla JS -- no frameworks. All JS is stored as template literal string constants in `src/ui/ui-*.js` files, embedded into the HTML shell.

    The settings view is in `src/ui/ui-settings.js`. It follows a card-based section pattern:
    - Account info card (GitHub username, Tenant ID, Member since)
    - API Keys card (list + create form)

    The mount flow:
    1. `renderSettings()` creates the skeleton (heading + loading placeholder)
    2. `mountSettings()` fetches data and calls `buildSettingsContent(view, accountData, keysData)`
    3. `buildSettingsContent` builds the Account section and API Keys section

    CSS is in `src/ui/ui-css.js` as a string constant `UI_CSS`. Design tokens (CSS custom properties) are in `src/ui/design-system.css`.

    The user object `_wrlUser` is populated at boot from `/auth/session`. It has `{ githubId, githubLogin, tenantId, tosAcceptedAt, tosVersion }` -- note: `createdAt` is referenced in code but NOT present in the session response (pre-existing bug, not your concern).

    Task 3 created `GET /v1/account/usage` which returns:
    ```json
    {
      "tenantId": "gh-12345",
      "period": "2026-03",
      "tierDisplay": "Starter",
      "captures": { "used": 42, "limit": 100, "remaining": 58 },
      "storageBytes": { "used": 524288000, "limit": 1073741824, "remaining": 549453824 },
      "resetsAt": "2026-04-01T00:00:00.000Z"
    }
    ```

    The `apiFetch` function is globally available and handles auth redirects.

    ## What to build

    ### 1. Modify `mountSettings()` to fetch usage data

    Change `mountSettings()` to make TWO parallel fetches:
    ```js
    Promise.all([
      apiFetch('/v1/account/keys', { credentials: 'same-origin' }),
      apiFetch('/v1/account/usage', { credentials: 'same-origin' })
    ]).then(function(responses) {
      var keysRes = responses[0];
      var usageRes = responses[1];
      // ... handle both responses
    })
    ```

    If the usage fetch fails, still render settings (keys section) -- usage failure should not block the entire view. Show an inline error in the usage card: "Could not load usage data."

    ### 2. Add Usage section to `buildSettingsContent`

    Insert a new "Usage" card section BETWEEN the Account section and the API Keys section. The card layout:

    ```
    +-----------------------------------------------+
    | Usage                          March 2026      |
    |                                                |
    | Captures          42 of 100                    |
    | [========------------------------------] 42%   |
    |                                                |
    | Storage           524 MB of 1 GB               |
    | [============================---------] 51%    |
    |                                                |
    | Plan: Starter       Resets Apr 1, 2026         |
    +-----------------------------------------------+
    ```

    Implementation:
    - Create a `<section class="settings-section card">` with heading "Usage"
    - Show period label as human-readable month (e.g., "March 2026") -- format from the `period` field ("2026-03")
    - For each metric (captures, storage), render:
      - A label row with metric name and "N of M" text
      - A progress bar using `role="progressbar"` with ARIA attributes
    - Progress bar is two nested divs: `.usage-bar` (track) and `.usage-bar-fill` (fill)
    - Fill width set via inline style `width: NN%` (clamped 0-100)
    - Three visual states based on percentage:
      - 0-79%: default (uses `--color-accent`)
      - 80-94%: warning class `.usage-bar-fill--warning` (uses `--color-warning`)
      - 95-100%: critical class `.usage-bar-fill--critical` (uses `--color-error`)
    - Show tier display name and reset date at the bottom
    - Storage bytes formatted as human-readable: implement a `formatBytes(n)` helper using SI units (1000-based: KB, MB, GB)

    ### 3. Progress bar HTML structure

    For each metric:
    ```html
    <div class="usage-metric">
      <div class="usage-metric-header">
        <span class="usage-metric-label">Captures</span>
        <span class="usage-metric-value">42 of 100</span>
      </div>
      <div class="usage-bar" role="progressbar"
           aria-valuenow="42" aria-valuemin="0" aria-valuemax="100"
           aria-label="42 of 100 captures used this month">
        <div class="usage-bar-fill" style="width: 42%"></div>
      </div>
    </div>
    ```

    Note: Build all DOM elements with `document.createElement()` -- this is the project convention. Do NOT use `innerHTML` for content that includes any data from the API.

    ### 4. ARIA and accessibility

    - Each progress bar must have `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
    - `aria-label` with human-readable text: "42 of 100 captures used this month" / "524 MB of 1 GB storage used this month"
    - When usage data loads, announce via the existing settings live region: `settingsAnnounce('Usage data loaded.')`
    - The threshold color change alone is not sufficient -- the numeric "N of M" text beside the bar provides the same information non-visually

    ### 5. Add CSS to `src/ui/ui-css.js`

    Add these styles to the `UI_CSS` string:

    ```css
    /* Usage section */
    .usage-metric { margin-bottom: var(--space-4); }
    .usage-metric:last-child { margin-bottom: 0; }
    .usage-metric-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: var(--space-1);
    }
    .usage-metric-label {
      font-size: var(--text-sm);
      font-weight: 500;
      color: var(--color-text-muted);
    }
    .usage-metric-value {
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
      color: var(--color-text);
    }
    .usage-bar {
      height: 8px;
      background: var(--color-surface-muted);
      border-radius: var(--radius-sm);
      overflow: hidden;
      border: 1px solid var(--color-border-subtle);
    }
    .usage-bar-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: var(--radius-sm);
      transition: width 0.2s ease;
      min-width: 0;
    }
    .usage-bar-fill--warning { background: var(--color-warning); }
    .usage-bar-fill--critical { background: var(--color-error); }
    .usage-footer {
      display: flex;
      justify-content: space-between;
      margin-top: var(--space-3);
      font-size: var(--text-sm);
      color: var(--color-text-muted);
    }
    ```

    ### 6. Error and edge-case handling

    - **Usage fetch fails**: Show an inline error within the usage card ("Could not load usage data.") -- do not block keys section from rendering
    - **Zero usage**: Show bars at 0% with "0 of N" text. Do NOT hide the section.
    - **Usage data loading**: Show "Loading usage..." placeholder inside the usage card while the fetch is in progress (can be a simple text node, replaced when data arrives)

    ### 7. Handle quota-exceeded 429 in capture submit form

    In the captures view (the existing submit form error handler), check for `limitType: 'quota'` in the 429 response body. If present, show a quota-specific error message instead of the generic rate-limit message:

    The existing error handling in `apiFetch` or in the submit form shows "Too many requests. Please wait N seconds..." for 429s. For quota 429s, the message should be: "Monthly capture limit reached. Your quota resets on {date}."

    Check how the submit form error is displayed -- look at `ui-captures.js` for the error handling pattern. Add a check: if `res.status === 429`, parse the body and check for `limitType === 'quota'`. If so, use the quota-specific message. Otherwise fall through to the existing rate-limit message.

    ## What NOT to do

    - Do NOT create a separate `#/usage` route -- the usage section goes inside `#/settings`
    - Do NOT add a warning banner to the captures list view -- that's future scope, not part of this task
    - Do NOT disable the submit button when over quota -- just show the 429 error message when it happens
    - Do NOT add historical period navigation -- current period only
    - Do NOT add upgrade/upsell CTAs -- there's no upgrade path yet
    - Do NOT fix the `_wrlUser.createdAt` bug -- that's a pre-existing issue, separate fix
    - Do NOT use frameworks (React, etc.) or `<progress>` elements -- vanilla JS with div-based progress bars
    - Do NOT add quota info to the nav bar or captures list -- settings only

    ## Files to modify

    - MODIFY: `src/ui/ui-settings.js` (add usage section to buildSettingsContent, modify mountSettings for parallel fetch, add formatBytes helper, add progress bar builder)
    - MODIFY: `src/ui/ui-css.js` (add usage bar CSS)
    - MODIFY: `src/ui/ui-captures.js` (handle quota-specific 429 error message in submit form) -- only if the submit error handling is in this file

    ## Tests

    Update `test/ui-dashboard.test.js` or create a new test file:
    - Usage section renders with correct progress bar percentages
    - Warning threshold (>80%) applies correct CSS class
    - Critical threshold (>95%) applies correct CSS class
    - Storage bytes formatted correctly (0, MB range, GB range)
    - Usage section handles error state (fetch failure shows error message, keys still render)
    - ARIA attributes present on progress bars

- **Deliverables**: Updated `src/ui/ui-settings.js` with usage card, updated `src/ui/ui-css.js` with progress bar styles, optionally updated `src/ui/ui-captures.js` for quota 429 handling, tests
- **Success criteria**: Settings view shows usage section with progress bars; three visual threshold states work; ARIA attributes present; storage formatted as human-readable; error state handled gracefully; quota-specific 429 shows correct message

### Task 5: OpenAPI spec updates
- **Agent**: api-spec-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |
    You are updating the WRL OpenAPI spec to document the new quota feature.

    ## Context

    WRL's OpenAPI spec is at `openapi.yaml` in the project root. It follows OpenAPI 3.1 conventions. Existing patterns:
    - Error responses use `$ref` components: `Problem400`, `Problem401`, `Problem429`, `Problem503`
    - The `ProblemDetail` schema in components follows RFC 9457
    - The existing `Problem429` response documents rate limiting with `Retry-After` header
    - The existing 429 response uses `limitType: 'tenant'` as an extension field in the ProblemDetail body (but this isn't currently documented in the spec)

    The docs site at `site/content/` uses Eleventy with Nunjucks templates. The API Reference page (`api-reference.njk`) auto-renders from `openapi.yaml`.

    ## What to build

    ### 1. Extend the 429 response documentation

    Update the existing `Problem429` response component to document both rate-limit and quota 429 responses. Add a second example (`quotaExceeded`) alongside any existing examples.

    Add a `QuotaDetail` schema in `components/schemas`:
    ```yaml
    QuotaDetail:
      type: object
      properties:
        limit:
          type: integer
          description: Maximum allowed for this resource in the current period
          example: 100
        used:
          type: integer
          description: Current usage count
          example: 100
        resource:
          type: string
          enum: [captures, storage]
          description: Which resource quota was exceeded
          example: captures
        resetsAt:
          type: string
          format: date-time
          description: ISO 8601 timestamp when the quota resets (first of next month)
          example: "2026-04-01T00:00:00.000Z"
        requested:
          type: integer
          description: Number of items requested (present only for batch requests)
          example: 10
    ```

    Document the `limitType` discriminator pattern in the ProblemDetail schema:
    - `limitType` absent or `undefined`: IP-based rate limit
    - `limitType: 'tenant'`: Per-tenant rate limit
    - `limitType: 'quota'`: Monthly quota exceeded (additional `quota` object present)

    ### 2. Add `GET /v1/account/usage` endpoint

    New path with:
    - Tag: `account`
    - Summary: "Get current usage and quota"
    - Description: Returns the authenticated tenant's current-period usage against their effective quotas
    - Auth: session cookie (same as other `/v1/account/*` routes)
    - Response 200 schema:

    ```yaml
    AccountUsageResponse:
      type: object
      required: [tenantId, period, tierDisplay, captures, storageBytes, resetsAt]
      properties:
        tenantId:
          type: string
          example: "gh-12345"
        period:
          type: string
          pattern: '^\d{4}-\d{2}$'
          example: "2026-03"
        tierDisplay:
          type: string
          description: Human-readable tier name for UI display
          example: "Starter"
        captures:
          $ref: '#/components/schemas/UsageMetric'
        storageBytes:
          $ref: '#/components/schemas/UsageMetric'
        resetsAt:
          type: string
          format: date-time
          example: "2026-04-01T00:00:00.000Z"

    UsageMetric:
      type: object
      required: [used, limit, remaining]
      properties:
        used:
          type: integer
          minimum: 0
          example: 42
        limit:
          type: integer
          minimum: 0
          example: 100
        remaining:
          type: integer
          minimum: 0
          example: 58
    ```

    ### 3. Add X-Quota headers

    Add header components:
    ```yaml
    X-Quota-Limit:
      description: Maximum captures allowed in the current billing period
      schema:
        type: integer
    X-Quota-Used:
      description: Captures used in the current billing period
      schema:
        type: integer
    X-Quota-Remaining:
      description: Captures remaining in the current billing period
      schema:
        type: integer
    ```

    Reference these headers in the 202 response of `POST /v1/captures` and the 207 response of `POST /v1/captures/batch`.

    ### 4. Update capture endpoint descriptions

    Add a note to `POST /v1/captures` and `POST /v1/captures/batch` descriptions:
    "Captures are subject to monthly quotas based on the tenant's tier. When the quota is exceeded, a 429 response is returned with `limitType: 'quota'` and a `quota` object containing the limit, usage, and reset timestamp."

    For the batch endpoint, add: "If the batch size would exceed the remaining quota, the entire batch is rejected with a 429 response."

    ### 5. Update admin tenant config documentation

    If the spec has a schema for the tenant config object (used by `PUT /v1/admin/tenants/:id/config`), extend it to include the `quotas` override fields:
    ```yaml
    quotas:
      type: object
      description: Per-tenant quota overrides (take precedence over tier defaults)
      properties:
        capturesPerMonth:
          type: integer
          minimum: 1
          description: Override monthly capture limit
        storageBytes:
          type: integer
          minimum: 1
          description: Override storage limit in bytes
    ```

    ## What NOT to do

    - Do NOT create a separate `Problem429Quota` response component -- extend the existing `Problem429` with examples
    - Do NOT add `additionalProperties: false` to ProblemDetail -- RFC 9457 explicitly allows extension members
    - Do NOT document internal tier names in the spec -- only `tierDisplay` is exposed
    - Do NOT document admin tier management endpoints unless they already exist in the spec

    ## Files to modify

    - MODIFY: `openapi.yaml`

    ## Validation

    After making changes, validate the spec is valid OpenAPI 3.1 by checking that the YAML structure is correct. The docs site CI will catch structural errors.

- **Deliverables**: Updated `openapi.yaml` with QuotaDetail schema, AccountUsageResponse schema, UsageMetric schema, X-Quota headers, updated 429 documentation, new GET /v1/account/usage path
- **Success criteria**: OpenAPI spec is valid; quota-exceeded 429 response is documented with example; new usage endpoint is fully specified; X-Quota headers documented on capture responses

### Task 6: Docs site content updates
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 5
- **Approval gate**: no
- **Prompt**: |
    You are updating the WRL documentation site to cover the new quota feature.

    ## Context

    WRL's docs site lives in `site/content/`. It uses Eleventy with Markdown content files and a Nunjucks template for the API reference. Current content files:
    - `index.md` -- landing page with guides list
    - `authentication.md` -- auth methods, API keys, scopes
    - `batch.md` -- batch capture guide with rate limit mention
    - `mcp.md` -- MCP integration
    - `verification.md` -- capture verification
    - `webhooks.md` -- webhook configuration
    - `api-reference.njk` -- auto-generated from openapi.yaml

    There is currently NO dedicated rate limits or quotas guide. Rate limit info is scattered across batch.md, README.md, and the API reference.

    ## What to build

    ### 1. Create `site/content/limits.md` -- "Limits & Quotas" guide

    Create a single guide covering both rate limits and quotas (they are closely related -- both produce 429s). Structure:

    ```markdown
    ---
    title: Limits & Quotas
    ---

    # Limits & Quotas

    WRL enforces two types of request limits: **rate limits** (short-term burst protection) and **quotas** (monthly usage limits).

    ## Rate Limits vs Quotas

    | | Rate Limits | Quotas |
    |---|---|---|
    | **Scope** | Per IP or per tenant | Per tenant |
    | **Window** | 60 seconds | Calendar month |
    | **Enforced by** | KV counters + Cloudflare bindings | D1 usage counters |
    | **Reset** | Rolling window (seconds) | First of next month |
    | **HTTP response** | 429 with `Retry-After` (seconds) | 429 with `Retry-After` (HTTP-date) |
    | **Discriminator** | `limitType` absent or `"tenant"` | `limitType: "quota"` |

    ## Rate Limits

    [Document the existing rate limits: 10/min per tenant default, 50/min per IP, 200/min global]

    ## Quotas

    Captures are subject to monthly quotas based on your account tier:

    | Tier | Captures/month | Storage |
    |------|---------------|---------|
    | Starter | 100 | 1 GB |
    | Pro | 5,000 | 50 GB |

    ### Checking Your Usage

    Use the `GET /v1/account/usage` endpoint to check current usage:
    [Show example request and response]

    Usage is also available in the [web UI settings page](/ui#/settings).

    ### Quota Headers

    Successful capture responses include quota information in headers:
    - `X-Quota-Limit`: Maximum captures in the current period
    - `X-Quota-Used`: Captures used so far
    - `X-Quota-Remaining`: Captures remaining

    ### Quota Exceeded (429)

    When a capture request exceeds the monthly quota, the API returns a 429 with `limitType: "quota"`:
    [Show example 429 response body]

    The `Retry-After` header contains an HTTP-date (not seconds) indicating when the quota resets.

    ### Batch Requests

    Batch capture requests (`POST /v1/captures/batch`) check quota for the entire batch upfront. If the batch size exceeds the remaining quota, the entire batch is rejected with a 429.

    ## Distinguishing 429 Responses

    Check the `limitType` field in the response body:
    [Show the three cases: absent, "tenant", "quota"]
    ```

    ### 2. Update `site/content/index.md`

    Add "Limits & Quotas" to the guides list (between Authentication and Batch or wherever makes sense).

    ### 3. Update `site/content/batch.md`

    In the rate limits section of batch.md, add a cross-reference:
    "For complete rate limit and quota documentation, see [Limits & Quotas](/limits/)."

    ### 4. Update `site/content/authentication.md`

    If there's an endpoint/scope table, add `GET /v1/account/usage` with scope "session" or "authenticated."

    ## What NOT to do

    - Do NOT create separate guides for rate limits and quotas -- one guide covers both
    - Do NOT update README.md -- that's a separate task handled by post-execution docs phase
    - Do NOT modify the OpenAPI spec -- Task 5 owns that
    - Do NOT document admin quota override management -- operator docs go in OPERATIONS.md (post-execution phase)

    ## Files to create/modify

    - CREATE: `site/content/limits.md`
    - MODIFY: `site/content/index.md` (add to guides list)
    - MODIFY: `site/content/batch.md` (add cross-reference)
    - MODIFY: `site/content/authentication.md` (add usage endpoint)

- **Deliverables**: New `site/content/limits.md` guide, updated navigation and cross-references
- **Success criteria**: Limits & Quotas guide covers both rate limits and quotas; 429 disambiguation is clearly documented; usage endpoint documented with examples; cross-references from batch.md and authentication.md

### Cross-Cutting Coverage

- **Testing**: Covered by each task's test requirements. Phase 6 (post-execution) will run the full test suite. Each task includes specific test deliverables: quotas module unit tests (Task 1), pipeline integration tests (Task 2), endpoint tests (Task 3), UI tests (Task 4).
- **Security**: security-minion's recommendations are incorporated directly: tier as a column not config JSON (Task 1); `tierDisplay` instead of internal tier name in API responses (Task 3); admin-only tier changes via existing admin config endpoint (Task 1 validation); `Cache-Control: private, no-store` on usage endpoint (Task 3); entire-batch rejection prevents partial-acceptance confusion (Task 2). Phase 3.5 review will verify.
- **Usability -- Strategy**: ux-strategy-minion's recommendations are incorporated: usage as settings section not separate route (Task 4); `tierDisplay: "Starter"` instead of "Free" (Task 3 response, Task 4 display); three threshold states for progress bars (Task 4); no quota on submit form (Task 4); current period only (Task 4).
- **Usability -- Design**: Covered by Task 4's frontend work. Progress bars use ARIA attributes, color thresholds, and numeric labels. Phase 3.5 review by accessibility-minion.
- **Documentation**: Covered by Task 5 (OpenAPI spec) and Task 6 (docs site guide). Phase 8 will handle README updates and OPERATIONS.md.
- **Observability**: Not a separate task. Log events (`security.quota_exceeded`, `oauth.usage_view`) are added inline in Tasks 2 and 3. No new runtime components that need dedicated observability setup. X-Quota headers on successful responses enable client-side monitoring.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: Task 4 produces web UI with progress bars that need WCAG review.
    Review focus: Progress bar ARIA markup, color contrast for three threshold states, screen reader announcement of usage data.
- **Not selected**:
  - ux-design-minion: The usage section follows existing card-based patterns with no novel interaction design. The progress bars are standard components. Accessibility-minion covers the WCAG compliance angle.
  - observability-minion: No new runtime components. Quota checks reuse existing D1 queries. Log events follow established patterns.
  - sitespeed-minion: No new page loads or assets. The usage fetch is a lightweight JSON endpoint added to an existing page's mount.
  - user-docs-minion: The docs site guide (Task 6) covers developer-facing documentation. End-user documentation is not applicable -- WRL users are developers.

### Decisions

- **Tier naming: internal vs. display**
  Chosen: Internal code uses `'free'`/`'pro'`; API responses expose `tierDisplay: 'Starter'`/`'Pro'`; 429 error messages omit tier name entirely
  Over: (1) Exposing internal tier name in API (security-minion flagged this -- tier names reveal pricing model information). (2) Using "Starter" everywhere including code (ux-strategy preference) -- rejected because "free" is clearer in code/DB contexts
  Why: Separates concerns -- code uses simple identifiers, UI gets user-friendly names, API responses avoid leaking business logic. The `TIER_DISPLAY_NAMES` map in quotas.js is the single mapping point.

- **Queue consumer quota check (defense-in-depth)**
  Chosen: Primary enforcement at HTTP handler only; no queue consumer check
  Over: Dual-check at both HTTP handler and queue consumer (security-minion recommendation)
  Why: The queue consumer has already returned 202 -- failing silently at the consumer violates the fail-loudly principle. The overage from the TOCTOU race window is bounded at ~10 captures (one rate-limit window) which is explicitly acceptable per spec. Adding queue consumer checks would create a confusing UX where accepted captures silently fail. If defense-in-depth is needed later, it belongs in a separate backlog item with proper status-update semantics (e.g., webhook notification of quota-exceeded failure).

- **Batch quota behavior: full rejection vs. partial acceptance**
  Chosen: Reject the entire batch with 429 when quota is insufficient
  Over: Partial acceptance up to remaining quota (security-minion noted existing batch partial-acceptance precedent for rate limits)
  Why: api-design-minion's reasoning is stronger -- quota is a budget concept, and partial acceptance creates confusing accounting. The existing batch partial-acceptance is only for legacy auth rate limits (a special case), not the default behavior.

- **Usage endpoint: dedicated `/v1/account/usage` vs. embedded in `/auth/session`**
  Chosen: Dedicated `GET /v1/account/usage` endpoint
  Over: Extending `/auth/session` response with usage data (ux-strategy-minion suggested this for captures-list banner without extra fetch)
  Why: `/auth/session` fires on every page load and must remain lightweight. Adding D1 usage queries to the boot path adds latency to every page, not just settings. A dedicated endpoint can be cached per-session and only fetched when the settings view mounts. The captures-list warning banner (ux-strategy's Task 4) is deferred to a future phase -- current scope is settings only.

### Risks and Mitigations

1. **TOCTOU race window on usage counters (MEDIUM)**: Usage is incremented post-capture via `ctx.waitUntil()`. Concurrent requests may both pass the quota check before either increment lands. Maximum realistic overage: ~10 captures (bounded by per-tenant rate limit of 10/60s). **Mitigation**: Accepted by spec ("slight overages are acceptable"). Documented in evolution log.

2. **Storage quota enforcement gap (LOW for MVP)**: Capture storage size is unknown at request time (determined after browser rendering). The quota check compares current cumulative `storage_bytes` against the limit, but cannot predict the new capture's size. A tenant at 990 MB / 1 GB could submit a capture that produces 50 MB. **Mitigation**: Accept as a soft limit. If strict enforcement is needed later, the queue consumer can check post-render and block further captures (backlog item).

3. **`ctx.waitUntil` increment failures (LOW)**: If `incrementUsage` fails (D1 transient error), the counter underreports and the tenant gets effectively free captures. The existing code logs this as `wrl:usage_increment_fail`. **Mitigation**: Existing logging provides visibility. A periodic reconciliation job (count D1 captures rows per tenant per period) is a backlog item if this proves problematic.

4. **Legacy auth quota bypass (LOW)**: The legacy `CAPTURE_API_KEY` fallback routes all requests to `tenantId: 'default'`. The `default` tenant will get `free` tier via the migration DEFAULT. No bypass as long as the `default` tenant stays at `free` tier. **Mitigation**: Documented. The `default` tenant's tier is set by migration default and can be verified operationally.

5. **D1 batch latency tail (LOW)**: The quota check adds one D1 batch (two PK lookups) to the capture hot path. PK lookups are sub-2ms each; batch overhead is one internal RPC. Well within 10ms budget. **Mitigation**: Monitor P99 latency post-deployment. If tail latency exceeds 10ms under load, add KV read-through cache with 60s TTL (YAGNI for now).

### Execution Order

```
Phase 4a: Task 1 (D1 migration + quotas module) ─── GATE
                    │
           ┌───────┴───────┐
Phase 4b:  Task 2          Task 3 ─── (parallel, both depend on Task 1)
           (pipeline)      (usage endpoint)
                    │              │
           ┌───────┴───────┐      │
Phase 4c:  Task 4          Task 5 ─── (parallel; Task 4 needs Task 3, Task 5 needs Task 2+3)
           (UI)            (OpenAPI)
                                  │
Phase 4d:                  Task 6
                           (docs site)
```

Gate positions:
1. After Task 1: Schema and quotas module must be reviewed before pipeline integration
2. After Task 2: Pipeline integration must be reviewed before downstream work (captures are the critical path)

### Verification Steps

After all tasks complete:

1. **Apply migration**: `wrangler d1 migrations apply` (staging) -- verify `tier` column exists on tenants with default `'free'`
2. **Quota enforcement**: Submit captures until quota is reached -- verify 429 with `limitType: 'quota'` response
3. **Batch rejection**: Submit a batch capture exceeding remaining quota -- verify entire batch rejected with 429
4. **Under-quota headers**: Submit a capture under quota -- verify 202 response includes `X-Quota-*` headers
5. **Usage endpoint**: Call `GET /v1/account/usage` with a valid session -- verify response shape with tier display name, captures, storage, resetsAt
6. **Web UI**: Navigate to Settings -- verify Usage section with progress bars, correct percentages, threshold coloring
7. **OpenAPI spec**: Validate spec with a linter -- verify quota schemas, usage endpoint, X-Quota headers documented
8. **Docs site**: Build docs site -- verify Limits & Quotas guide renders, cross-references work
9. **Existing tests**: Run full test suite -- verify no regressions
