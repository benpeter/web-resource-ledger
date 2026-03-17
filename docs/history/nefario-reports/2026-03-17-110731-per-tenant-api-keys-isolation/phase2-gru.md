# Gru -- Technology Landscape Validation

## Specialist: gru (Technology Radar)
## Phase: Planning (Phase 2)
## Question Context: Cloudflare-native auth alternatives, API key format best practices, KV latency for auth path, Worker gotchas

---

## TL;DR

The advisory's custom auth design is the correct approach. Cloudflare-native auth
primitives (Access Service Tokens, API Shield mTLS) solve a different problem
(perimeter auth for entire applications) and cannot provide the per-tenant
key-to-scope mapping WRL needs. The `wrl_live_` prefix convention remains industry
best practice. The "no KV caching" decision is validated -- post-rearchitecture
KV latency is better than the advisory assumed. One material risk to flag: KV
eventual consistency on revocation is 60 seconds, which the advisory accepts, but
there is a subtler issue with negative cache entries that deserves attention.

---

## Recommendations

### 1. Cloudflare-native auth primitives: NOT a substitute

**Ring: Hold** (for this use case)

I evaluated three Cloudflare-native auth mechanisms against the WRL requirements:

| Mechanism | What it does | Why it does not fit |
|-----------|-------------|---------------------|
| **Access Service Tokens** | Generates Client-ID/Client-Secret pairs for service-to-service auth. Cloudflare validates the token at the edge and issues a JWT. | Operates at the application perimeter -- it gates access to the entire Worker, not individual tenants. No concept of tenant isolation, custom scopes, or per-key revocation. You would still need all the custom auth logic inside the Worker. Feb 2026 added fine-grained policy permissions, but these are for Cloudflare dashboard access management, not application-level tenant scoping. |
| **API Shield (mTLS)** | Client certificates verified at the Cloudflare edge. Requests without valid certs are blocked before hitting the Worker. | Requires PKI infrastructure (client certificate issuance, distribution, rotation). Massive operational overhead for a system with single-digit tenants. Designed for IoT/mobile fleets, not API key management. Also: mTLS certificates cannot carry scopes or tenant identity without additional custom logic inside the Worker. |
| **WAF Token Authentication** | Validates tokens in custom rules at the WAF layer. | Token format is fixed; no custom claims, scopes, or tenant identity. Designed for protecting static assets, not API authorization. |

**Verdict:** All three are perimeter-level "is this request allowed to reach my Worker at all" mechanisms. WRL needs application-level "which tenant is this, what can they do" logic. These are fundamentally different problems. The advisory's custom KV-based auth is the only approach that provides tenant identity, scope enforcement, and per-key revocation within the Worker runtime.

Cloudflare announced an OAuth 2.0 auth server built on Workers in late 2025, which is interesting, but it is (a) designed for end-user OAuth flows, not machine-to-machine API keys, and (b) the advisory explicitly ruled out OAuth. No revisit warranted.

### 2. API key prefix convention: `wrl_live_` is correct

**Ring: Adopt** (prefix convention pattern)

The Stripe prefix pattern (`sk_live_`, `sk_test_`) remains the industry standard for API key formatting. No challenger has displaced it.

**Evidence:**
- Stripe has used this pattern since 2012 and continues to in their V2 API (2025).
- Unkey (the most prominent API key management SaaS) uses a similar prefix convention (`key_...`).
- WorkOS uses `sk_live_`/`sk_test_` prefixes, directly copying Stripe's pattern.
- The "Designing APIs for Humans" community (dev.to, 2025-2026) consistently recommends prefixed identifiers.

**Why the prefix matters operationally:**
1. **Leak detection:** `wrl_live_` is a greppable, unique string. GitHub secret scanning, Discord AutoMod, and CI/CD leak detectors can all pattern-match on it. Without a prefix, a base64url random string is indistinguishable from any other token.
2. **Support triage:** When an operator reports an auth issue, the key prefix immediately identifies it as a WRL key (vs. a Cloudflare API token, AWS key, etc.).
3. **Environment separation:** The `_live_` segment leaves room for `_test_` or `_staging_` prefixes if WRL ever adds environment-scoped keys.

**One nuance on format:** The advisory says "256-bit, base64url." This produces 43 characters of base64url. With the `wrl_live_` prefix (9 characters), the total key length is 52 characters. This is reasonable -- short enough to paste in a header, long enough for 256-bit entropy. No change recommended.

### 3. KV latency for auth path: no caching needed (confirmed)

**Ring: Adopt** (no-cache for auth lookup)

The advisory said "10-40ms latency acceptable within 300ms budget." The actual numbers are better than that after Cloudflare's August 2025 KV rearchitecture:

| Scenario | Latency | Source |
|----------|---------|--------|
| Hot key (in edge cache, <60s repeat) | <1ms | Cloudflare blog Oct 2025 |
| Tiered cache hit | ~80ms reduction vs. central | Cloudflare blog Oct 2025 |
| Cold read (new key, no cache) | p90 <12ms (Worker wall time) | Cloudflare blog Oct 2025 |
| Cold read to central storage | p50 ~80ms, p99 <200ms (pre-rearchitecture baseline) | Cloudflare blog Aug 2025 |
| Cold read via hybrid storage (small values) | p99 <5ms (KVSP path) | Cloudflare blog Aug 2025 |

API key records are small JSON objects (~200 bytes). They route through Cloudflare's distributed database path (KVSP), not R2. This means they benefit from the p99 <5ms improvements for small values.

**More importantly:** KV has a built-in 60-second cache (the `cacheTtl` default). After the first auth with a given key, subsequent auths from the same Cloudflare PoP will hit the edge cache and resolve in <1ms. There is no need to add application-level caching on top of KV's built-in caching.

**Custom caching would be actively harmful:**
- Adding an in-Worker cache (e.g., a `Map` in module scope) would survive across requests within the same Worker isolate, creating inconsistency: one isolate caches a key as valid, another sees it as revoked. KV's 60s cache already provides the right tradeoff between performance and consistency.
- Application-level caching also increases the revocation propagation window beyond the already-accepted 60 seconds.

**Conclusion:** The advisory's "no KV key caching" decision is correct. KV's native caching handles the hot path. Cold path latency is well within the 300ms budget even in worst-case scenarios. No change.

### 4. Cloudflare Worker limitations and gotchas

#### 4a. KV eventual consistency and negative caching (MEDIUM risk)

The advisory accepts 60s eventual consistency for key revocation. This is fine. But there is a subtler issue: **negative cache entries.**

When a KV `get()` returns null (key not found), Cloudflare caches this null result for up to 60 seconds. This means:

1. Admin creates a new tenant key via `POST /v1/admin/keys`
2. The KV write stores `apikey:{sha256hex}` in central storage
3. A request arrives at a different Cloudflare PoP within 60 seconds using the new key
4. That PoP has a negative cache entry for `apikey:{sha256hex}` (nobody queried it before, but the absence is cached)
5. The request falls through to the `CAPTURE_API_KEY` legacy fallback -- which does not match the new key
6. Auth fails with 401

**Practical impact:** Low. This only happens if someone tries to use a newly-created key at a PoP that recently had a cache miss for that exact key hash. In practice, nobody queries a key hash before it exists. The negative cache issue is primarily a concern for **key recreation after revocation** -- if you revoke a key and then create a new key that happens to hash to the same value (essentially impossible with SHA-256 of random input), the revoked status could be cached.

**The real scenario to document:** After creating a new key, the first request from each Cloudflare PoP will always hit central KV (no cache entry exists). This is a cold read, not a negative cache hit. So the issue described above is theoretical, not practical. Still, it is worth noting in the migration runbook: "New keys are usable immediately; there is no propagation delay for key creation (only for revocation)."

#### 4b. KV write rate: 1 write per key per second (LOW risk)

KV enforces a maximum of 1 write to the same key per second. If two admin requests try to modify the same key record within 1 second (e.g., near-simultaneous revocation requests), the second will get a 429 from KV.

**Practical impact:** Negligible at the expected admin API traffic (5/min rate limit). The admin rate limiter itself prevents this scenario. No mitigation needed.

#### 4c. KV operations per Worker invocation: 1,000 limit (LOW risk)

Each Worker invocation can make up to 1,000 KV operations. The `GET /v1/admin/keys` endpoint does a `list()` + `get()` for each key record. With N keys, that is 1 + N operations. At 999 keys, you hit the limit.

**Practical impact:** WRL will have single-digit to low double-digit keys. This is a non-issue for years. If it ever becomes a concern, pagination limits the number of `get()` calls per invocation.

#### 4d. Worker memory: 128MB limit (NOT a risk)

SHA-256 hashing a 52-character API key and looking up a ~200-byte JSON record is negligible memory. No concern.

#### 4e. `crypto.subtle.digest` availability (NOT a risk)

Cloudflare Workers fully support `crypto.subtle.digest('SHA-256', ...)` via the Web Crypto API. This is the correct API for hashing the API key. No fallback needed. The security-minion's code example using `crypto.subtle.digest` is correct.

#### 4f. Rate limiter binding as `unsafe.bindings` (LOW risk, existing pattern)

The `ADMIN_RATE_LIMITER` uses `unsafe.bindings` just like the existing rate limiters. The "unsafe" label is misleading -- it means the API is not yet GA and the binding shape may change. Cloudflare has maintained this API stable since its introduction. WRL already depends on three such bindings; adding a fourth carries no incremental risk. The edge-minion's `if (env.ADMIN_RATE_LIMITER)` guard pattern is correct for handling environments where the binding is unavailable.

---

## Proposed Tasks

No implementation tasks from gru (that is out of scope for this role). The technology validation produces the following **inputs to other agents' tasks:**

1. **For security-minion:** The negative caching behavior for newly-created keys is a documentation item, not a code item. No code change needed, but the migration runbook should note that key creation propagates via cold-read (no delay) while key revocation propagates via cache expiry (up to 60s).

2. **For software-docs-minion:** Add a note to the migration runbook: "Newly created keys are usable immediately from any Cloudflare location. Revoked keys may remain valid for up to 60 seconds due to edge caching."

3. **For edge-minion:** No changes to the proposed wrangler.toml configuration. The namespace ID scheme (1004/2004) and rate limiter settings are correct.

---

## Risks and Concerns

### Confirmed non-risks (things the advisory got right)

| Decision | Verdict | Rationale |
|----------|---------|-----------|
| Custom KV-based auth vs. Cloudflare-native | Correct | Native primitives are perimeter auth, not tenant auth |
| `wrl_live_` prefix | Correct | Industry standard, operationally valuable |
| No KV caching | Correct | KV native caching handles it; custom cache would be harmful |
| SHA-256 for key hashing | Correct | Web Crypto API available, computationally trivial |
| 256-bit key entropy | Correct | 2^256 search space, no brute-force concern |
| Soft-delete revocation | Correct | KV eventual consistency makes hard-delete equivalent |

### Risk: Unkey as a build-vs-buy alternative (DISMISSED)

Unkey is the most prominent API key management SaaS (YC W23, open-source). Should WRL use Unkey instead of building custom auth?

**No.** Reasons:

1. **Latency:** Unkey moved off Cloudflare Workers to AWS Fargate in December 2025 because Workers KV latency was too high for their use case (they sit in the critical path for thousands of APIs). WRL using KV directly avoids this extra hop -- the auth check is a single KV read within the same Worker, not an external API call.

2. **Dependency:** Adding Unkey as a dependency means WRL's auth path depends on an external SaaS. A service that itself had to rearchitect its infrastructure for performance is not a stable dependency for a latency-critical auth check.

3. **Complexity budget:** WRL has single-digit tenants. Unkey is designed for multi-thousand-tenant SaaS platforms. The custom KV-based auth is ~100 lines of code. Unkey adds an SDK dependency, an external API call, and a billing relationship. This violates the Helix Manifesto principle of minimizing dependencies.

4. **Feature match:** WRL needs: hash-based key lookup, scope checking, soft-delete revocation. That is all. Unkey provides rate limiting per key, usage analytics, key rotation workflows, and more. None of this is needed. YAGNI.

### Risk: EU AI Act compliance for API key storage (NOT APPLICABLE)

The EU AI Act August 2026 enforcement date affects AI system classification. WRL is a web resource capture tool, not an AI system. API key storage is governed by standard data protection (GDPR), not AI-specific regulation. No compliance risk from the auth implementation.

---

## Additional Agents Needed

None beyond what is already planned. The technology landscape validation confirms the advisory's design decisions. No architecture change is warranted.

One observation for **observability-minion**: the `authMethod: 'kv'` vs `authMethod: 'legacy'` enrichment proposed by security-minion is operationally important. The migration runbook should include the Coralogix query to check for `authMethod:legacy` traffic before removing the `CAPTURE_API_KEY` secret. This is an observability requirement, not a technology choice, so it belongs in observability-minion's scope.

---

## Sources

Technology landscape research was based on the following:

- [Cloudflare: Redesigning Workers KV for increased availability](https://blog.cloudflare.com/rearchitecting-workers-kv-for-redundancy/) -- August 2025 rearchitecture with p99 <5ms for small values
- [Cloudflare: We made Workers KV up to 3x faster](https://blog.cloudflare.com/faster-workers-kv/) -- October 2025 performance data, p90 <12ms Worker wall time
- [Cloudflare KV: How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/) -- 60s cache TTL, eventual consistency model
- [Cloudflare KV: Limits](https://developers.cloudflare.com/kv/platform/limits/) -- 1 write/sec per key, 1000 ops per invocation
- [Cloudflare: Service Tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) -- Access Service Tokens scope and limitations
- [Cloudflare: API Shield mTLS](https://developers.cloudflare.com/api-shield/security/mtls/) -- mTLS for API authentication
- [Cloudflare: Fine-grained Access permissions](https://developers.cloudflare.com/changelog/post/2026-02-13-access-policy-service-token-permissions/) -- Feb 2026 dashboard-level permissions, not application-level
- [Cloudflare: OAuth Auth Server through Workers](https://blog.cloudflare.com/oauth-2-0-authentication-server/) -- OAuth server on Workers, not relevant to machine-to-machine API keys
- [Stripe: API keys documentation](https://docs.stripe.com/keys) -- `sk_live_`/`sk_test_` prefix convention
- [Stripe: Best practices for managing secret API keys](https://docs.stripe.com/keys-best-practices) -- Key management patterns
- [InfoQ: Unkey ditches serverless after performance struggles](https://www.infoq.com/news/2025/12/unkey-serverless/) -- Unkey's move from Workers to AWS Fargate
- [Cloudflare: Web Crypto API](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) -- SHA-256 digest support in Workers
