## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. Use the existing `problemResponse` with `extra` fields -- do NOT invent a new response shape

The issue description suggests a flat `{ "error": "quota_exceeded", "detail": "...", "limit": N, "used": N }` shape, but the codebase already has a well-established RFC 9457 Problem Details pattern via `problemResponse(status, detail, headers, extra)`. The `extra` parameter spreads additional fields into the response body. This is already used for rate limiting -- see `{ limitType: 'tenant' }` on line 573 of `src/index.js`.

The quota-exceeded response should be:

```json
{
  "type": "about:blank",
  "status": 429,
  "title": "Too Many Requests",
  "detail": "Monthly capture quota reached (100/100). Resets 2026-04-01T00:00:00Z.",
  "limitType": "quota",
  "quota": {
    "limit": 100,
    "used": 100,
    "resource": "captures",
    "resetsAt": "2026-04-01T00:00:00Z"
  }
}
```

**Rationale:**

- **Consistency with existing 429 responses.** Rate limit 429s already use `problemResponse(429, ..., headers, { limitType: 'tenant' })`. Adding `limitType: 'quota'` lets SDK clients distinguish rate-limit-exceeded from quota-exceeded by switching on `limitType` without needing a new error shape. This is the discriminator pattern -- one response schema, one field that tells you which kind of 429 you hit.
- **RFC 9457 permits extension members.** The `quota` object with `limit`, `used`, `resource`, and `resetsAt` is fully compliant. Clients that understand quota can use it; clients that don't just see a standard problem response.
- **The `detail` message is human-readable and actionable.** It includes the counts AND the reset date so operators can diagnose without parsing the structured fields. This follows the existing convention documented in `src/responses.js` lines 1-5.
- **`resetsAt` instead of `Retry-After`.** Rate limits use `Retry-After` because the wait is seconds. Quotas reset at calendar boundaries (first of next month). Include `Retry-After` header too (seconds until reset), but the ISO 8601 timestamp in the body is more useful for UI display and logging.

#### 2. Pipeline insertion point: after rate limit (step 3), before body parsing (step 4)

In `handleCreateCapture`, the current flow is:

```
Step 1: Content-Type check
Step 2: Auth check (verifyApiKey) → yields tenantId
Step 3: Per-tenant rate limit (checkCaptureRateLimit)
   --> NEW: Step 3b: Quota check (monthly capture limit)
Step 4: Parse JSON body
Step 5: Validate url field
Step 6: URL validation (SSRF)
Step 7: Generate capture ID
Step 8: Write D1 record
Step 9: Log
Step 10: Queue dispatch
Step 11: Return 202
```

**Why after rate limit but before body parsing:**

- **Quota check needs `tenantId`**, which comes from step 2 (auth). So it must be after step 2.
- **Quota check should be before any expensive work.** The issue explicitly says "before browser session creation," but in the HTTP handler the expensive work is D1 write + queue dispatch (steps 8-10). Checking quota before body parsing (step 4) saves the JSON parse cost on quota-exceeded requests.
- **Rate limiting and quota enforcement are orthogonal.** Rate limits protect against burst abuse (requests per minute). Quotas protect against cumulative overage (captures per month). Rate limit fires first because it is cheaper (KV counter check vs D1 query). If a tenant is rate-limited, no need to check quota.
- **Do NOT check quota inside the queue consumer.** The queue consumer (`handleCaptureMessage`) runs asynchronously after the 202 has already been returned. Checking quota there would mean accepting the capture, telling the user it is pending, then silently failing it. That violates the principle of failing loudly and early.

#### 3. Batch endpoint: upfront quota check for the whole batch

For `handleBatchCapture`, check quota upfront for `body.urls.length` items, same as the existing rate limit pattern (line 732: `checkCaptureRateLimit(env, auth, clientIp, 'capture', body.urls.length)`).

The batch endpoint already parses the body before rate limiting (step 3 is parse, step 5 is rate limit) because it needs the batch size. Add the quota check immediately after the rate limit check at step 5, before the per-URL processing loop (step 7).

**Do NOT check quota per-item in the loop.** Reasons:

- **Partial acceptance is confusing for quota.** If a batch of 10 URLs has 3 remaining in quota, accepting 3 and rejecting 7 with `quota_exceeded` is a poor developer experience. The tenant should know upfront that they cannot afford the batch.
- **Consistency with rate limiting.** The existing KV-auth batch rate limit is an upfront check for the whole batch. Quota should follow the same pattern.
- **Atomicity.** Quota is a monthly budget. Partial batch acceptance makes accounting harder and forces the client to figure out which items succeeded.

If the batch would exceed quota, return the whole-request 429 (not a 207 with per-item errors):

```json
{
  "type": "about:blank",
  "status": 429,
  "title": "Too Many Requests",
  "detail": "Batch of 10 captures would exceed monthly quota (95/100). Resets 2026-04-01T00:00:00Z.",
  "limitType": "quota",
  "quota": {
    "limit": 100,
    "used": 95,
    "requested": 10,
    "resource": "captures",
    "resetsAt": "2026-04-01T00:00:00Z"
  }
}
```

The `requested` field is added only for batch responses so clients know how many items triggered the rejection.

#### 4. `limitType` as the discriminator field for 429 responses

The existing 429 responses use `limitType: 'tenant'` (for rate limits) or omit `limitType` (for IP-based rate limits). Formalize this into a documented discriminator:

| `limitType` value | Meaning | Recovery |
|---|---|---|
| (absent) | IP-based rate limit | Wait `Retry-After` seconds |
| `"tenant"` | Per-tenant rate limit | Wait `Retry-After` seconds |
| `"quota"` | Monthly quota exceeded | Wait until `quota.resetsAt` or upgrade tier |

This should be reflected in the OpenAPI spec. The existing `ProblemDetail` schema has no `additionalProperties: false` constraint (and should not get one -- RFC 9457 explicitly allows extension members). Define a new `QuotaExceededProblem` schema that extends `ProblemDetail` with the `limitType` and `quota` fields, and reference it from the 429 response using `oneOf` with the discriminator.

#### 5. Quota headers on successful responses

Follow the same pattern as rate limit headers. On successful capture requests (202), include quota usage headers so clients can monitor their budget proactively:

```
X-Quota-Limit: 100
X-Quota-Used: 42
X-Quota-Resource: captures
X-Quota-Resets-At: 2026-04-01T00:00:00Z
```

These are custom headers (no RFC standard for quota headers exists yet). The `X-` prefix is technically deprecated by RFC 6648, but the pragmatic convention for quota headers is not yet standardized. An alternative is to use `RateLimit` headers from the draft RFC 9110 successor, but that conflates rate limits and quotas. Custom `X-Quota-*` headers are clearer.

Include these on ALL capture-related responses (202, 207, 429) so clients always know their quota position.

#### 6. Usage dashboard endpoint: `GET /v1/account/usage`

The issue mentions a "web UI usage dashboard with progress bars." The UI needs an endpoint to fetch quota and usage data. Design:

```
GET /v1/account/usage
Authorization: Bearer <session-cookie or API key>
```

Response:

```json
{
  "tenantId": "gh-12345",
  "period": "2026-03",
  "tier": "free",
  "quotas": {
    "captures": {
      "limit": 100,
      "used": 42,
      "remaining": 58,
      "resetsAt": "2026-04-01T00:00:00Z"
    },
    "storageBytes": {
      "limit": 1073741824,
      "used": 524288000,
      "remaining": 549453824,
      "resetsAt": "2026-04-01T00:00:00Z"
    }
  }
}
```

**Design notes:**

- Place under `/v1/account/` because this is tenant-scoped self-serve data, consistent with the existing `/v1/account/keys`, `/v1/account/tos` pattern.
- `operationId: getAccountUsage` -- follows the existing `list*`, `get*`, `create*` convention.
- `tier` field tells the UI which tier label and limits to display.
- `remaining` is computed server-side (avoids client math and races).
- Storage quota uses bytes, not GB -- consistent with the existing `storageBytes` field in `usage_counters` and `getUsage()`.
- The admin endpoint `GET /v1/admin/usage` already exists for admin-scoped usage queries. The account endpoint is the self-serve equivalent.

#### 7. Default quota tiers as application constants

Define defaults alongside the existing `RATE_LIMITS` pattern in a new `src/quotas.js` module:

```js
export const TIER_QUOTAS = {
  free: {
    captures: 100,         // per month
    storageBytes: 1073741824, // 1 GB
  },
  pro: {
    captures: 5000,        // per month
    storageBytes: 53687091200, // 50 GB
  },
};

export const DEFAULT_TIER = 'free';
```

Per-tenant overrides stored in the `tenants.config` JSON column (same as rate limit overrides). The config shape adds a `quota` key:

```json
{
  "rateLimit": { "capture": { "limit": 20, "period": 60 } },
  "quota": { "captures": 500, "storageBytes": 5368709120 },
  "tier": "pro"
}
```

Effective quota resolution: `tenantConfig.quota.captures ?? TIER_QUOTAS[tier].captures ?? TIER_QUOTAS[DEFAULT_TIER].captures`. Per-tenant overrides beat tier defaults, tier defaults beat free-tier defaults.

#### 8. Tenant tier storage

The `tenants` table currently has no `tier` column. Two options:

**Option A: Add `tier` column to `tenants` table (recommended).** New migration `0005_tenant_quotas.sql`:

```sql
ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'
  CHECK (tier IN ('free', 'pro'));
```

**Option B: Store tier inside the `config` JSON blob.** No migration needed, but tier cannot be queried or indexed efficiently.

Recommend Option A. Tier is a first-class billing concept that may need indexing for admin queries ("how many pro tenants?"). It should not be buried in a JSON blob.

#### 9. `Retry-After` header semantics for quota responses

For rate limit 429s, `Retry-After` is seconds until the rate limit window resets (typically 10-60 seconds). For quota 429s, the reset is the first of the next month, which could be days away.

Use `Retry-After` with the HTTP-date format (RFC 9110 section 10.2.3) instead of seconds for quota responses:

```
Retry-After: Wed, 01 Apr 2026 00:00:00 GMT
```

This avoids absurdly large second counts (e.g., `Retry-After: 691200` for 8 days) and is more meaningful. The `Retry-After` header spec explicitly supports HTTP-date format.


### Proposed Tasks

#### Task 1: Define quota constants and resolution logic
**What to do:** Create `src/quotas.js` with `TIER_QUOTAS`, `DEFAULT_TIER`, and a `getEffectiveQuota(tenantConfig, resource)` function that resolves per-tenant overrides against tier defaults (mirroring the `getEffectiveLimit` pattern in `src/rate-limits.js`).
**Deliverables:** `src/quotas.js` module with exported constants and resolution function.
**Dependencies:** None.

#### Task 2: Add `tier` column to tenants table
**What to do:** Write migration `0005_tenant_quotas.sql` adding `tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro'))` to the `tenants` table.
**Deliverables:** Migration SQL file.
**Dependencies:** None.

#### Task 3: Implement quota check function
**What to do:** Create a `checkQuota(db, tenantId, resource, count)` function in `src/db.js` (or `src/quotas.js`) that reads the current period's `usage_counters` row and compares against the effective quota. Returns `{ exceeded: boolean, limit: number, used: number, resetsAt: string }`.
**Deliverables:** Function with unit tests.
**Dependencies:** Task 1 (quota constants), Task 2 (tier column).

#### Task 4: Insert quota check into `handleCreateCapture`
**What to do:** After the rate limit check (step 3) and before body parsing (step 4), add the quota check. On exceeded, return `problemResponse(429, ...)` with `limitType: 'quota'` and `quota` extra fields. Include `Retry-After` header with HTTP-date format. Also add `X-Quota-*` headers to the successful 202 response.
**Deliverables:** Updated `handleCreateCapture` in `src/index.js`.
**Dependencies:** Task 3 (quota check function).

#### Task 5: Insert quota check into `handleBatchCapture`
**What to do:** After the batch rate limit check (step 5) and before the per-URL loop (step 7), add an upfront quota check for `body.urls.length` items. Reject the entire batch with a 429 if the batch would exceed quota. Include `requested` in the quota extra fields. Also add `X-Quota-*` headers to the successful 207 response.
**Deliverables:** Updated `handleBatchCapture` in `src/index.js`.
**Dependencies:** Task 3 (quota check function), Task 4 (for consistency review).

#### Task 6: Add `GET /v1/account/usage` endpoint
**What to do:** Implement a new endpoint that returns the tenant's current-period usage against their effective quotas. Session-gated (same auth as `/v1/account/keys`). Supports API key auth as well.
**Deliverables:** Handler function, route registration in `src/index.js`.
**Dependencies:** Task 1 (quota constants), Task 2 (tier column), Task 3 (quota resolution).

#### Task 7: Update `setTenantConfig` validation for quota overrides
**What to do:** Extend the admin `PUT /v1/admin/tenants/{id}/config` validation to accept and validate `quota` and `tier` fields in the config body. `quota.captures` must be a positive integer. `quota.storageBytes` must be a non-negative integer. `tier` must be one of the valid tier names.
**Deliverables:** Updated validation in `setTenantConfig` or `handlePutTenantConfig`.
**Dependencies:** Task 1 (tier names), Task 2 (tier column).

#### Task 8: Update OpenAPI spec for quota responses
**What to do:**
- Add `QuotaExceededProblem` schema extending `ProblemDetail` with `limitType` and `quota` fields.
- Add `X-Quota-*` header definitions to `components/headers`.
- Add quota-exceeded example to the 429 response of `POST /v1/captures` and `POST /v1/captures/batch`.
- Add `GET /v1/account/usage` path with request/response schemas.
- Add `AccountUsage` and `QuotaDetail` schemas to `components/schemas`.
- Update the `Problem429` response component to document the `limitType` discriminator.
**Deliverables:** Updated `openapi.yaml`.
**Dependencies:** Tasks 4-6 (implementation shapes the spec).


### Risks and Concerns

1. **D1 read latency on the quota check hot path.** The quota check requires reading `usage_counters` from D1 on every capture request. The rate limit check already reads `tenantConfig` from D1 (line 495: `getTenantConfig(env.DB, auth.tenantId)`), so this is one additional D1 query. If latency becomes a concern, both queries could be combined into a single D1 batch call. However, this is a measured optimization -- do not prematurely optimize.

2. **Race condition: concurrent requests may exceed quota.** Two requests arriving simultaneously could both read `used: 99` (limit 100), both pass the check, and both increment to 101. This is acceptable for several reasons: (a) the `usage_counters` table uses `capture_count + excluded.capture_count` which is atomic per-write, (b) the overshoot is bounded by concurrency (at most a few extra captures), and (c) this is the same tradeoff the existing rate limit KV counters make. Do not add locking or transactions -- the cure is worse than the disease for a soft quota.

3. **Quota check reads stale data.** The `incrementUsage` call in `handleCreateCapture` is fire-and-forget via `ctx.waitUntil`. This means the quota check reads `usage_counters` before the current request's increment has been written. The counter may be 1-2 behind reality under high concurrency. This is fine for a soft quota -- users will see slight overages rather than under-counts.

4. **Storage quota enforcement timing.** Capture storage bytes are only known after the capture completes (in the queue consumer), not at request time. The quota check at request time can only enforce capture count, not storage. Storage quota enforcement must be a separate concern -- either checked in the queue consumer (with graceful degradation if exceeded) or enforced retroactively by disabling new captures when storage is over quota. Recommend: check storage quota at capture request time using *current* storage usage. If already over storage quota, reject new captures. This does not predict the size of the new capture, but prevents runaway usage.

5. **Backward compatibility.** Adding `limitType` and `quota` fields to the 429 response body is an additive change (new optional fields on an existing response). This is backward-compatible. The `X-Quota-*` headers are new headers that existing clients will ignore. No breaking changes.

6. **Batch partial-acceptance vs full-rejection.** The recommendation to reject the entire batch when quota is insufficient is a design decision that differs from the rate limit behavior (which does partial acceptance for legacy auth). Document this clearly -- the batch endpoint returns 429 (not 207) when quota is exceeded, because quota is a budget concept and partial acceptance would create confusing accounting.


### Additional Agents Needed

None. The current team is sufficient for the described scope. The api-spec-minion will handle the OpenAPI spec updates based on the conventions described here. The data-minion (if involved) can handle the D1 migration. The frontend work (progress bars in the web UI) is a standard UI task that does not require additional API design input beyond the `GET /v1/account/usage` endpoint defined above.
