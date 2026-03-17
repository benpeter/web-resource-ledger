# Domain Plan Contribution: edge-minion

## Recommendations

### (a) Per-Tenant Rate Limiting: Not in R12, but R12 Must Lay Groundwork

Per-tenant rate limiting should remain a follow-on (the parking lot correctly
says "when R12 ships"). The reason: the current Cloudflare rate limiter binding
model uses a fixed `namespace_id` per binding, and each binding has a single
`{ limit, period }` definition in `wrangler.toml`. You cannot dynamically
assign different limits to different tenants within one binding -- you would
need either one binding per tenant (not scalable, requires redeployment) or
application-level rate tracking in KV/Durable Objects (more complex than it
sounds).

**However, R12 must lay explicit groundwork:**

1. **Log `tenantId` on every rate limit event.** The existing log calls in
   `handleCreateCapture` and `handleListCaptures` log `limiter` and `cip` but
   not `tenantId`. After R12, every rate limit hit log entry must include
   `tenantId` so operators can see which tenant is consuming capacity. This is
   cheap to add during R12 since auth already runs before rate limit checks in
   the `handleCreateCapture` flow.

2. **Design rate limit keys to be tenant-aware in the future.** Today the
   per-IP limiter keys on `clientIp`:
   ```js
   env.CAPTURE_RATE_LIMITER.limit({ key: clientIp })
   ```
   When per-tenant limiting ships, the key would change to `tenantId` or
   `${tenantId}:${clientIp}` (compound key for per-tenant-per-IP). R12 does
   not need to implement this, but the code should not introduce any pattern
   that makes this change harder. Specifically: do not couple rate limit
   enforcement to the auth result shape in a way that would require refactoring.
   A clean separation -- auth returns identity, rate limiter consumes identity
   -- is the right pattern and the current code already does this.

3. **Document the future rate limit binding strategy.** In the evolution log,
   note that per-tenant rate limiting will likely use a new Cloudflare rate
   limiter binding with `namespace_id` keyed by `tenantId` (one shared binding
   where the `.limit({ key: tenantId })` call differentiates tenants), or
   application-level tracking in KV with a TTL-based sliding window. The
   binding approach is simpler but gives all tenants the same limit. The KV
   approach allows per-tenant quotas but adds a KV read+write per request.
   Decision deferred to when per-tenant limiting is actually needed.

**My recommendation:** The Cloudflare rate limiter binding approach (same
binding, key by `tenantId`) is strongly preferred for the initial per-tenant
limiting when it ships. It keeps the architecture simple -- one new
`[[unsafe.bindings]]` entry in `wrangler.toml` with a reasonable default limit
(e.g., 30/min per tenant), and tenants that need more capacity get the limit
bumped via a config change. This is operationally identical to the current
per-IP model. Differentiated per-tenant quotas (tenant A gets 50/min, tenant B
gets 10/min) require application-level logic and should only be built if
billing is implemented.


### (b) Admin Endpoint Rate Limiting: Dedicated Binding, Aggressive Limits

Admin endpoints (`/v1/admin/keys`) need their own dedicated Cloudflare rate
limiter binding with a separate `namespace_id`. Reasons:

- **Blast radius isolation.** Admin operations are low-volume but
  high-consequence. An attacker brute-forcing the admin API should not consume
  rate limit budget that affects capture operations, and vice versa.
- **Different limit profile.** Capture endpoints allow 10/min per IP. Admin
  endpoints should allow far fewer operations: key provisioning is an
  infrequent operational task, not a user-facing workflow.

**Recommended binding:**

```toml
[[unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1004"
simple = { limit = 5, period = 60 }
```

And for staging:

```toml
[[env.staging.unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2004"
simple = { limit = 5, period = 60 }
```

**Why 5/min:** Key provisioning operations (create, revoke, list) are
measured in single-digit calls per session. An operator onboarding a new
tenant might create 2-3 keys. Listing keys might happen a few times during
investigation. 5/min per IP is generous for legitimate use and restrictive
enough to slow brute-force attempts. If an operator needs to provision keys
in bulk (unlikely given the "no billing" scope), they can space calls or the
limit can be increased.

**Key the limiter by IP, not by admin identity.** Even though the admin
endpoint requires authentication, rate limiting by IP catches pre-auth abuse
(attackers sending garbage admin keys). Rate limiting after auth would let
unauthenticated requests burn compute and KV reads before being rejected.
The check order should be: IP rate limit -> auth check -> handler.

**Update `src/rate-limits.js`:**

```js
export const RATE_LIMITS = {
  capture: { limit: 10, period: 60 },
  verify:  { limit: 60, period: 60 },
  admin:   { limit: 5,  period: 60 },
};
```

And extend `getRateLimitGroup()` in `src/index.js`:

```js
function getRateLimitGroup(method, pathname) {
  if (pathname === '/v1/captures') return 'capture';
  if (pathname.startsWith('/v1/verify/') || pathname.startsWith('/.well-known/signing-key')) return 'verify';
  if (pathname.startsWith('/v1/admin/')) return 'admin';
  return null;
}
```


### (c) Caching Implications: Current Headers Are Correct; Future CDN Needs Care

**Current caching headers are safe for multi-tenancy:**

- Artifact endpoints (`/v1/captures/{id}/artifacts/*`) use
  `Cache-Control: public, max-age=31536000, immutable`. This is correct
  because artifacts are addressed by capture ID (a 128-bit random value
  acting as an access secret). Multi-tenancy does not change this -- the
  capture ID remains the authorization token for artifact access. There is
  no tenant credential in the URL or headers that a CDN could confuse.

- Metadata endpoints (`/v1/captures/{id}`, `/v1/captures/{id}/status`) use
  `Cache-Control: private, no-store`. This is correct for tenant-scoped
  data. No change needed.

- List endpoint (`GET /v1/captures`) uses `Cache-Control: private, no-store`.
  This is correct and critical -- the list is tenant-scoped and must never
  be cached by intermediaries.

- Verify endpoint uses conditional caching (`public, max-age=86400, swr=7d`
  for verified results, `no-store` for unverified). This is fine --
  verification results are public and capture-ID-scoped, not tenant-scoped.

**Future CDN (Fastly) cache poisoning risks:**

When the parking lot Fastly CDN item activates, there are two specific risks
to design against:

1. **Cache key must include full request path.** Fastly defaults to this, but
   if custom VCL strips or normalizes URL components, artifact responses could
   be served for wrong capture IDs. Standard Fastly configuration avoids this.

2. **The `Vary: Origin` on CORS responses must be respected.** Currently only
   `POST /v1/captures` gets CORS headers. If a CDN caches the CORS preflight
   response (`204` with `Access-Control-*` headers), it must vary by `Origin`.
   The current code sets `Vary: Origin` on the `204` response -- this is
   correct. If the CDN layer ignores `Vary`, different origins could get each
   other's CORS decisions. Fastly respects `Vary` by default.

3. **No `Authorization` header in cache keys for public endpoints.** Artifact
   endpoints are public (no auth required) but artifact URLs are unguessable.
   If a CDN adds the `Authorization` header to the cache key (some do this as
   a security default), it would fragment the cache needlessly. Fastly and
   Cloudflare both exclude `Authorization` from cache keys by default for
   `public` responses.

4. **Admin API must never be cached.** Admin endpoints should set
   `Cache-Control: private, no-store` on all responses. If a CDN layer is
   added, admin paths must be excluded from caching entirely (Fastly
   `pass`/`pipe` in VCL).

**Recommendation for R12:** No caching header changes needed. Add a comment
in the admin endpoint handlers explicitly noting `Cache-Control: private,
no-store` is mandatory for these responses, and document in the evolution log
that future CDN integration must exclude `/v1/admin/*` from caching.


### (d) Global Rate Limiter: Keep Global, Add Monitoring

The `GLOBAL_CAPTURE_LIMITER` (200/min) should remain global, not per-tenant.
This is a service capacity protection mechanism -- it prevents the underlying
Browser Rendering binding from being overwhelmed regardless of who sends the
requests.

**Why global is correct:**

- The Browser Rendering binding is a shared resource with a hard concurrency
  limit (Cloudflare imposes per-Worker-script limits). Whether one tenant
  sends 200 requests or two tenants each send 100, the origin capacity is the
  same. Per-tenant capacity shares would either over-provision (sum of shares
  exceeds actual capacity, risking overload) or under-provision (each tenant
  gets a fraction, wasting capacity when others are idle).

- With 2-3 tenants, global limiting is simpler and fairer. Per-tenant shares
  make sense at scale (10+ tenants) where statistical multiplexing works.

- The global limiter returns `503 Service Unavailable` (not `429`), which is
  semantically correct -- it is a capacity signal, not an abuse signal. This
  distinction matters: tenants should retry on 503, but not assume they are
  being throttled for bad behavior.

**What R12 should add:** Log `tenantId` when the global limiter fires. Today
the log entry is:

```js
{ event: 'security.capacity_limit', cip }
```

After R12:

```js
{ event: 'security.capacity_limit', tenantId, cip }
```

This gives operators visibility into which tenant(s) are driving capacity
pressure, which is essential input for the future per-tenant rate limiting
decision. If logs show one tenant consistently triggering the global limiter,
that is the activation signal for the parking lot item.


### (e) KV Key Lookup Latency: Acceptable, Cache Strategically

**Baseline analysis:**

KV reads at the edge are typically 10-40ms on cache hits (data served from the
nearest Cloudflare POP) and potentially higher on cache misses (first read at
a POP after a write, or very cold POPs). The `<300ms uncached` constraint in
CLAUDE.md applies to the full request lifecycle.

For capture creation (`POST /v1/captures`), the current flow before R12:

1. Auth: timing-safe string comparison (~0ms compute, env var read)
2. Per-IP rate limit: Cloudflare rate limiter call (~1-5ms)
3. Global rate limit: Cloudflare rate limiter call (~1-5ms)
4. Body parse + URL validation (~1-10ms including DNS resolution)
5. KV write (pending record + index): ~20-80ms (two writes)
6. Return 202 (background capture starts via `ctx.waitUntil`)

After R12, Step 1 becomes:

1a. Extract Bearer token (~0ms)
1b. SHA-256 hash the token (~0ms, crypto.subtle is fast)
1c. KV read: `kv.get("apikey:{hash}")` (~10-40ms)

This adds 10-40ms to every authenticated request. For capture creation, the
total pre-202 time budget is roughly 50-130ms today, becoming 60-170ms with
the KV lookup. Well within the 300ms constraint.

For list operations (`GET /v1/captures`), the KV lookup adds to an already
KV-heavy operation (list + N individual record fetches). The marginal impact
of one more KV read is proportionally small.

**Should key lookup results be cached?**

**No, do not cache API key records.** The reasons:

1. **Security vs latency trade-off favors security.** Caching key records
   means revoked keys continue working until the cache expires. The entire
   point of KV-based keys (vs. env var) is that key compromise can be
   responded to immediately. A 60-second cache means a revoked key works for
   up to 60 seconds after revocation. This is unacceptable for a security
   control -- the issue specifically calls out "key compromise affects only
   one tenant."

2. **`caches.default` has correctness risks.** The Cache API in Workers stores
   responses keyed by URL. You would need to synthesize a fake URL for the
   cache key (e.g., `https://cache/apikey/{hash}`). This is a hack that
   creates maintenance burden and subtle bugs (cache eviction, serialization
   of the key record, cache TTL management). It is not worth the complexity
   for 10-40ms savings.

3. **Workers isolate-level memory does not persist.** There is no `Map` or
   module-level variable that survives across requests in production Workers
   (each request may run in a different isolate). Module-level variables _do_
   persist within a single isolate's lifetime, but relying on this for security
   state is fragile and would require invalidation logic that does not exist.

4. **KV itself caches at the edge.** Cloudflare KV is already an
   eventually-consistent system with edge caching. Reads from POPs that have
   recently read the same key are fast (~10ms). Adding another caching layer
   on top of KV's own caching provides diminishing returns.

**Exception -- limited use of stale data for rate limit decisions:** If
per-tenant rate limiting is added later and needs the tenant ID from the key
record, the rate limit check could use the tenant ID from a recently-verified
key record (within the same request) without a second KV read. But this is
just passing the `tenantId` from the auth result to the rate limiter -- not
caching the key record itself.

**Recommendation:** Accept the 10-40ms latency cost. Monitor KV read latency
via `Server-Timing` or Coralogix logs. If key lookup latency becomes a
measurable problem at scale (which it will not with 2-3 tenants), revisit with
Durable Objects for auth state -- but this is deep in the parking lot.


## Proposed Tasks

### Task 1: Add admin rate limiter binding to wrangler.toml

**What:** Add `ADMIN_RATE_LIMITER` binding with `namespace_id: "1004"` (prod)
and `"2004"` (staging), `{ limit: 5, period: 60 }`.

**Deliverables:**
- Updated `wrangler.toml` with new `[[unsafe.bindings]]` entries for both
  prod and staging
- Updated `src/rate-limits.js` with `admin: { limit: 5, period: 60 }`

**Dependencies:** None. Can be done before or in parallel with admin endpoint
implementation.

### Task 2: Wire admin rate limiting into request flow

**What:** Extend `getRateLimitGroup()` to recognize `/v1/admin/*` paths.
Apply `ADMIN_RATE_LIMITER` by IP in the admin endpoint handler(s) _before_
auth, so unauthenticated abuse is throttled early. Set
`Cache-Control: private, no-store` on all admin responses.

**Deliverables:**
- Updated `getRateLimitGroup()` in `src/index.js`
- Rate limit check in admin handler(s) with log event
  `security.rate_limit` and `limiter: 'admin'`
- `X-RateLimit-Limit` header on admin responses (follows existing R5 pattern)

**Dependencies:** Task 1 (binding exists), admin endpoint handlers exist
(api-design-minion's work).

### Task 3: Add tenantId to rate limit log events

**What:** After R12's auth module returns `tenantId` from the key record,
update all rate limit log calls in `handleCreateCapture` and
`handleListCaptures` to include `tenantId`. Also add `tenantId` to
`security.capacity_limit` events.

**Deliverables:**
- Updated log calls in `handleCreateCapture` (per-IP limiter and global
  limiter)
- Updated log calls in `handleListCaptures` (per-IP limiter and global
  limiter)
- Note: only add `tenantId` when auth has succeeded. If rate limiting
  fires before auth (as with admin endpoints), `tenantId` is absent -- use
  `cip` only.

**Dependencies:** R12 auth module returns tenantId (security-minion's work).

### Task 4: Document CDN and caching guidance for multi-tenancy

**What:** In the R12 evolution log `decisions.md`, document:
- Current caching headers require no changes for multi-tenancy
- Future CDN integration must exclude `/v1/admin/*` from caching
- The `Vary: Origin` on CORS responses must be preserved in any CDN config
- The global rate limiter remains global (not per-tenant) with rationale
- Per-tenant rate limiting deferred to post-R12 with activation signal
  documented

**Deliverables:** Section in `decisions.md` covering edge/caching decisions.

**Dependencies:** None.


## Risks and Concerns

### Risk 1: KV Eventual Consistency on Key Revocation

KV writes propagate globally within ~60 seconds but this is not guaranteed.
A key revoked in one region may remain valid in another for a brief window.
For a service with 2-3 tenants this is acceptable (the operator revoking a
key is aware of the propagation delay), but it should be documented in the
operations runbook. If instant global revocation is required in the future,
the architecture would need to move to Durable Objects for auth state or
add a "denied keys" check via a faster store.

**Mitigation:** Document the ~60s propagation window in OPERATIONS.md.
Operators should monitor Coralogix for requests with revoked keys during
the propagation window.

### Risk 2: Rate Limit Ordering with Auth

The current code runs auth before rate limiting in `handleCreateCapture`:
auth (Step 2) then rate limit (Step 3). This means unauthenticated requests
are rejected at auth before consuming rate limit budget. The admin endpoint
should reverse this: rate limit _then_ auth. This prevents an attacker from
brute-forcing admin keys at high volume -- the rate limiter catches the
abuse before the KV lookups pile up.

For the capture endpoint, the current auth-before-rate-limit order is fine:
the env var comparison is near-zero cost. But with KV-based auth in R12,
each auth check is a KV read. If an attacker sends 1000 requests/second
with invalid keys, each one burns a KV read before hitting the rate limiter.
Consider moving per-IP rate limit check _before_ auth for capture endpoints
too, or accept the KV read cost (Cloudflare's KV pricing is generous and
the rate of illegitimate requests to a non-public API is likely low).

**Recommendation:** For admin endpoints, rate limit before auth (clear win).
For capture endpoints, keep auth before rate limit (the current flow reads
naturally, and the per-IP limiter at 10/min would not meaningfully reduce KV
reads from an attack -- the attacker is blocked after 10 requests either
way). If abuse is observed in logs, reorder capture endpoints later.

### Risk 3: Global Rate Limiter and Tenant Fairness

With a single global 200/min limiter, a noisy tenant can starve others.
Example: Tenant A sends 190 captures/min, leaving Tenant B with effectively
10/min of headroom. The global limiter does not distinguish between them.

This is a known trade-off, explicitly deferred by the parking lot item.
R12's contribution is logging `tenantId` on capacity events so the
operator can detect when this happens and take action (contact the noisy
tenant, implement per-tenant limits, raise the global limit).

### Risk 4: Admin Endpoint Cache Poisoning (Future CDN)

If a CDN layer is added and the admin endpoints are not explicitly excluded
from caching, responses like "key created successfully" or "key list" could
be cached and served to other requesters (different admin keys from different
IPs). The `Cache-Control: private, no-store` header prevents this in
standards-compliant CDNs, but defense-in-depth requires explicit CDN-level
exclusion of `/v1/admin/*` paths.

**Mitigation:** This is a future concern (CDN is in parking lot), but
document it now so it is not forgotten.


## Additional Agents Needed

None. The current team of security-minion, api-design-minion,
observability-minion, edge-minion, and iac-minion covers the R12 scope.

The one gap worth noting: **test-minion** is explicitly excluded from
planning (per the metaplan) but should participate in Phase 3.5 architecture
review. The rate limit ordering change (rate limit before auth for admin
endpoints) is a subtle security behavior that integration tests should
verify -- specifically, that an attacker hitting the admin endpoint at
>5/min from one IP gets 429 responses without any KV auth lookups being
performed.
