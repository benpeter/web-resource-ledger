## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. GET /v1/captures -- List Endpoint Design

**The core constraint: KV is not a database.** Cloudflare KV supports `list()` with a prefix and cursor, but has no filtering, no sorting, and no secondary indexes. Every capture is stored under `capture:{captureId}`, and captureIds are random (UUID-based), so there is no natural time ordering in key space. This shapes everything.

**Recommended MVP list endpoint:**

```
GET /v1/captures?limit=20&cursor={opaque}
```

Response shape:

```json
{
  "data": [ /* array of CaptureRecord-like objects */ ],
  "pagination": {
    "cursor": "eyJrZXkiOiJjYXB0dXJlOmNhcF8uLi4ifQ==",
    "hasMore": true,
    "limit": 20
  }
}
```

**What to include in v1, and what to defer:**

| Feature | Decision | Rationale |
|---------|----------|-----------|
| Cursor-based pagination | Include | KV.list() natively supports cursors. Offset is impossible without a sorted index. Cursor-based is the correct choice -- it aligns with the storage layer and scales. |
| `limit` parameter | Include | KV.list() supports `limit`. Cap at 100, default 20. |
| `status` filter | Include | Cheap client-side filter on the KV list results. Three values: `pending`, `complete`, `failed`. Most callers want only `complete`. |
| `url` filter | Defer | Requires scanning all values (KV list returns keys, not values). Unacceptable at scale. Needs D1 or a secondary index. |
| Sorting | Defer | KV has no sort order other than lexicographic key order. Since keys are random UUIDs, sorting by `createdAt` requires fetching and sorting values -- O(n) memory. Needs D1. |
| Full-text search | Defer | Far beyond KV capabilities. Needs D1 at minimum. |

**Critical implementation detail:** KV's `list()` returns keys only (no values). To populate the response, each key requires a separate `kv.get()`. This means listing 20 captures requires 21 KV operations (1 list + 20 gets). At current scale (single-digit tenants, low hundreds of captures) this is fine. At scale, this is the forcing function for D1 migration.

**Workaround for time-based access without D1:** Introduce a secondary KV key pattern. When a capture completes, also write a key like `tenant:{tenantId}:ts:{ISO8601}:{captureId}` with an empty value (or minimal metadata). This gives lexicographic ordering by timestamp under a tenant prefix. KV `list()` with prefix `tenant:{tenantId}:ts:` then returns captures in time order. This is a common KV pattern but adds write amplification. I recommend this only if D1 is deferred past the list endpoint -- it is a bridge, not the destination.

**Response shape recommendation -- use an envelope:** This is the first endpoint that returns a collection. Establish the envelope pattern now because every future collection endpoint will follow it. The `{ data, pagination }` shape is composable (add `meta` later for rate limit info or query echo) and the `pagination` object is reusable.

**Authentication:** The list endpoint MUST require Bearer auth (like `POST /v1/captures`). Currently, individual capture retrieval uses the capture ID as an access secret (no auth header). The list endpoint cannot follow this pattern -- it would expose all captures to anyone who can authenticate. When per-tenant keys arrive, the list endpoint naturally scopes to "captures belonging to this tenant."

**operationId:** `listCaptures` (following the existing pattern: `createCapture`, `getCapture`, `getCaptureStatus`).

**What the response items should look like:** Use the same `CaptureRecord` schema for each item, minus the `note` field. Do not invent a separate "summary" schema -- consistency trumps bandwidth optimization at this scale.

#### 2. Rate Limit Headers -- Scope for Completion

**Current state:**
- `Retry-After` header is returned on 429 responses and on 202 (pending capture). This is correct.
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` are not implemented.

**What Cloudflare's rate limiter binding gives us:** The `limit()` call returns `{ success: boolean }`. That is it. No remaining count, no reset timestamp. The `simple` config defines `limit` and `period`, but the binding does not expose how many tokens remain or when the window resets.

**Recommendation: Do the minimum that is honest.**

1. Return `X-RateLimit-Limit` on every response from rate-limited endpoints. This is a static value from config (10/min for capture, 60/min for verify). Easy to add, useful for clients to know what they are working with.

2. Do NOT return `X-RateLimit-Remaining` or `X-RateLimit-Reset` unless the rate limiter binding starts exposing that data. Fabricating these values (e.g., decrementing a counter in KV) adds write amplification, races under concurrency, and will be inaccurate. An inaccurate `Remaining` header is worse than no header -- it trains clients to trust a lie.

3. Continue returning `Retry-After: 60` on 429 responses. This is already implemented and correct.

**Scope:** Add `X-RateLimit-Limit` to `handleCreateCapture`, `handleVerifyCapture`, and `handleGetSigningKey` responses. Three code changes, one new header, no new infrastructure. That is the right scope.

**If Cloudflare later exposes remaining/reset data** (or WRL migrates to a custom token-bucket on D1/Durable Objects), add the remaining headers then. Design the response envelope to accommodate them (`meta.rateLimit` in list endpoint responses, headers on all endpoints).

#### 3. [consider] API Items -- Prioritized by Developer Experience Impact

Ranked by impact-to-effort ratio for realistic integration patterns:

**1st: CORS for capture POST (should, not consider -- upgrade priority)**

The retrieval GET endpoints already return `Access-Control-Allow-Origin: *`. The capture POST endpoint does not. This means browser-based clients cannot submit captures. For a web archival service, "capture this page from a browser extension or web UI" is a core integration pattern. Blocking it at the CORS level is a sharp edge.

Implementation: Add a preflight handler for `OPTIONS /v1/captures` and return `Access-Control-Allow-Origin` with a configurable allowlist (not `*` -- the POST endpoint requires auth, so wildcard CORS exposes the auth flow to any origin). Add `Access-Control-Allow-Headers: Authorization, Content-Type` and `Access-Control-Allow-Methods: POST`. This is a few lines of code with significant DX impact.

**2nd: Batch capture**

Realistic integration: monitoring services, legal teams archiving multiple pages, CI pipelines. Without batch, clients loop over single POST calls and manage N independent polling flows. With batch, one request returns N capture IDs and one polling strategy.

Design sketch:

```
POST /v1/captures/batch
{ "urls": ["https://a.com", "https://b.com"] }
```

Response:

```json
{
  "captures": [
    { "url": "https://a.com", "id": "cap_...", "statusUrl": "..." },
    { "url": "https://b.com", "id": "cap_...", "statusUrl": "..." }
  ],
  "errors": [
    { "url": "ftp://bad.com", "status": 400, "detail": "URL scheme 'ftp' is not allowed" }
  ]
}
```

Cap batch size at 10-20 URLs. Each URL goes through the same validation pipeline. Rate limit counts each URL individually (a batch of 10 counts as 10 against the per-IP limit). Return 207 Multi-Status if the batch has mixed results, 202 if all succeed, 400 if all fail.

This is a meaningful DX improvement but needs careful rate limit interaction design. Defer until after the list endpoint and rate limit headers.

**3rd: Webhooks**

Webhooks eliminate the polling loop entirely. For integrations that process captures asynchronously (Slack bots, legal workflow systems, monitoring dashboards), webhooks are the natural pattern. However, they require:
- Webhook registration endpoint (CRUD for webhook URLs)
- Payload signing (HMAC-SHA256)
- Retry logic with exponential backoff
- Dead letter handling
- Per-tenant webhook configuration (entangled with per-tenant keys)

This is significant infrastructure. Defer until per-tenant keys exist -- webhooks without tenant isolation are a non-starter for multi-user.

**4th: SSE/WebSocket**

These solve the same problem as webhooks (notification without polling) but require persistent connections. Cloudflare Workers support WebSockets via Durable Objects, which adds infrastructure complexity. SSE is simpler but Workers do not natively support long-lived SSE streams without Durable Objects either. The current polling pattern (status endpoint + Retry-After) works well for the capture lifecycle (typically 5-30 seconds). SSE/WebSocket are over-engineering until capture volume justifies the infrastructure.

**Verdict:** CORS for POST is the clear winner -- highest DX impact, lowest implementation cost, and it is already half-done. Batch capture is second. Webhooks and SSE/WebSocket should wait for per-tenant keys and higher traffic.

#### 4. Per-Tenant Keys -- API Contract Evolution

**Current state:** Single static `CAPTURE_API_KEY` in env. Auth returns `{ ok: true }` with no identity information. Rate limiting keys on `CF-Connecting-IP`.

**The contract change is smaller than it looks.** The v1 API contract does not need to break. Here is the migration path:

**Phase 1: Make auth return identity (internal only, no API change)**

`verifyApiKey()` currently returns `{ ok: true }`. Change it to return `{ ok: true, tenantId: 'tenant_xxx' }`. This is an internal refactor -- no API contract change. The `tenantId` flows into:
- KV key prefix (captures scoped to tenant)
- Rate limiter key (switch from IP to tenantId)
- Log context (which tenant did what)

The existing single key maps to a "default" tenant. No external behavior changes.

**Phase 2: Key lookup (internal, minor API change)**

Replace `env.CAPTURE_API_KEY` static comparison with a key lookup. Options:
- KV namespace for key-to-tenant mapping (simplest, fits Cloudflare Workers)
- D1 table (if D1 is added for the list endpoint, co-locate key storage)

The API contract change: the `Authorization: Bearer {key}` header works identically. The only visible difference is that the list endpoint now returns only captures belonging to the authenticated tenant. This is not a breaking change -- it is a narrowing of scope that clients expect.

**Phase 3: Key management endpoints (new API surface)**

```
POST   /v1/keys          -- create a new key (requires admin scope)
GET    /v1/keys           -- list keys for tenant (redacted)
DELETE /v1/keys/{keyId}   -- revoke a key
POST   /v1/keys/{keyId}/rotate -- generate replacement, return new key, old key has grace period
```

These are new endpoints, not modifications to existing ones. No v1 breakage.

**What MUST NOT change in v1:**
- `POST /v1/captures` request/response shape stays identical
- Capture ID format (`cap_{hex32}`) stays identical
- Unauthenticated retrieval by capture ID stays identical (the ID is still the secret for individual capture access)
- All error response shapes stay RFC 9457

**What changes visibly:**
- `GET /v1/captures` (list endpoint) returns only the authenticated tenant's captures
- The `note` field in the 202 response can drop the "no list endpoint" warning once the list endpoint ships
- Rate limit headers reflect per-tenant limits instead of per-IP limits

**Backward compatibility guarantee:** Any client that works with the current single-key v1 API will continue to work after per-tenant keys ship, because the single key becomes the first tenant's key. No code changes required on the client side.

**One risk: the unauthenticated retrieval pattern.** Currently, `GET /v1/captures/{captureId}` and `GET /v1/captures/{captureId}/status` require no auth -- the capture ID is the secret. This pattern works in single-tenant but becomes a tenant isolation question in multi-tenant: can tenant A access tenant B's capture if they somehow obtain the ID? The current design says yes (the ID is the secret, not the tenant boundary). This is a conscious design decision, not a bug -- it enables share-by-link workflows. But it should be explicitly documented as a design choice when per-tenant keys ship, and security-minion should validate this in their threat model.

### Proposed Tasks

**Task 1: GET /v1/captures list endpoint (MVP version)**
- What: Implement `GET /v1/captures` with cursor-based pagination and optional `status` filter. Requires Bearer auth. Returns `{ data, pagination }` envelope.
- Deliverables: Handler function, route registration, KV list integration, OpenAPI spec update, tests.
- Dependencies: None (can use existing auth and KV infrastructure).
- Scope guard: No sorting, no URL filter, no full-text search. These need D1.

**Task 2: Collection response envelope schema**
- What: Define the reusable `{ data, pagination }` envelope in `openapi.yaml` components. Define `PaginationInfo` schema with `cursor`, `hasMore`, `limit`. This sets the pattern for all future collection endpoints.
- Deliverables: OpenAPI schema components.
- Dependencies: Should be defined alongside Task 1.

**Task 3: X-RateLimit-Limit header on rate-limited endpoints**
- What: Add `X-RateLimit-Limit` header to all responses from `handleCreateCapture`, `handleVerifyCapture`, `handleGetSigningKey`. Value is the static limit from config (10, 60, 60 respectively).
- Deliverables: Code changes in handlers, OpenAPI spec header component, tests.
- Dependencies: None.

**Task 4: CORS for POST /v1/captures**
- What: Add OPTIONS preflight handler for `/v1/captures`. Return `Access-Control-Allow-Origin` from a configurable allowlist (env var), `Access-Control-Allow-Headers: Authorization, Content-Type`, `Access-Control-Allow-Methods: POST`. Update OpenAPI spec.
- Deliverables: Preflight handler, CORS header injection, env var for allowed origins, tests.
- Dependencies: None. Can be done in parallel with Tasks 1-3.

**Task 5: Auth identity enrichment (prerequisite for per-tenant)**
- What: Refactor `verifyApiKey()` to return `{ ok: true, tenantId: string }`. For now, the single static key maps to a hardcoded default tenant ID. Update all call sites to thread `tenantId` into logging and KV operations. This is a pure refactor with no external behavior change.
- Deliverables: Updated auth module, updated handler call sites, updated log calls, tests.
- Dependencies: None, but should happen before the list endpoint ships to avoid scoping the list endpoint incorrectly.

**Task 6: Batch capture endpoint design**
- What: Design `POST /v1/captures/batch` contract (request schema, 207 vs 202 response, per-URL error reporting, rate limit interaction). Produce API design document and OpenAPI spec addition. Do not implement yet.
- Deliverables: API design document, OpenAPI spec draft.
- Dependencies: Task 1 (list endpoint) and Task 3 (rate limit headers) should ship first to validate patterns.

### Risks and Concerns

**1. KV list performance ceiling.** KV `list()` + N `get()` calls is O(n) in KV operations per list request. At 1000+ captures per tenant, this will hit both latency and cost ceilings. The mitigation is D1, but D1 is listed as `[consider]` in the backlog. The list endpoint design should be KV-compatible today but D1-ready tomorrow -- the cursor and envelope shape should not need to change when the storage backend changes.

**2. Tenant scoping before per-tenant keys.** If the list endpoint ships before per-tenant keys, it must scope to "all captures" (since there is only one tenant). When per-tenant keys arrive, the list endpoint must scope to "this tenant's captures." If KV keys are not already prefixed by tenant, this migration is painful. Task 5 (auth identity enrichment) should happen before or alongside the list endpoint to ensure KV keys include tenant scope from the start.

**3. The capture-ID-as-secret pattern and multi-tenancy.** This is a design-level tension, not a bug. The current model says "knowing the ID grants access." Per-tenant keys say "your key scopes your access." These are compatible (the list endpoint scopes by tenant, individual access is by ID) but the interaction must be explicitly documented. Risk: a user expects per-tenant keys to prevent cross-tenant access to individual captures, but that is not what the current design provides.

**4. CORS allowlist maintenance.** A configurable origin allowlist for the POST endpoint is more secure than `*`, but it requires operators to update the list when new clients are deployed. If the allowlist is empty or misconfigured, browser clients silently fail (CORS errors are notoriously opaque). The env var should have a sensible default and the deployment docs should call it out.

**5. Batch capture rate limit interaction.** A batch of 10 URLs should count as 10 against the per-IP rate limit (not 1). If the rate limit is 10/min and a client sends a batch of 10, they have used their entire budget. This must be enforced server-side before validation begins, not after. If the limiter binding only supports `limit({ key })` without a "count" parameter, this may require multiple `limit()` calls or a switch to a different rate limiting approach.

### Additional Agents Needed

**data-minion** -- The list endpoint design is entangled with the storage layer. KV vs D1 is not just an infrastructure decision; it determines what query patterns the API can support. A data-minion should weigh in on whether to introduce a secondary KV index pattern (write amplification) or accelerate D1 adoption (infrastructure complexity). This decision shapes the API roadmap more than any other single factor.

**devx-minion** -- Once the list endpoint and collection envelope are designed, a devx-minion should evaluate the SDK generation story. The `{ data, pagination }` envelope, operationId conventions, and error schemas should produce clean SDK code. Catching DX issues at design time is cheaper than fixing them after the spec is published.
