## Advisory Report

**Question**: How should WRL implement per-tenant API keys and tenant isolation (R12), and specifically: (1) What is the admin key -- is it implicitly tenant 1? (2) Should key provisioning happen via admin API, CLI, or both?

**Confidence**: HIGH

**Recommendation**: Implement a KV-based key lookup with a dedicated `ADMIN_KEY` wrangler secret as the bootstrap/superadmin credential, separate from tenant keys. Key provisioning happens exclusively through an admin API (`/v1/admin/keys`). The existing `CAPTURE_API_KEY` remains as a dual-mode fallback for tenant `default` during migration, then gets removed. CLI tooling is out of scope for R12.

### Executive Summary

The team reached strong consensus on the core architecture: SHA-256 hash-then-lookup in KV, three scopes (`capture`, `read`, `admin`), server-generated 256-bit keys, soft-delete revocation, and unauthenticated capture-ID-as-secret endpoints unchanged. The v1 API contract stays unbroken. All five specialists agree this is a clean, YAGNI-appropriate design for single-digit tenants.

The one significant conflict -- whether admin auth uses the existing `CAPTURE_API_KEY` env var as a temporary superadmin (security-minion) or a new dedicated `ADMIN_KEY` secret (iac-minion) -- resolves in favor of `ADMIN_KEY`. The separation is cleaner: `CAPTURE_API_KEY` is a tenant credential (backward-compatible fallback for the `default` tenant), while `ADMIN_KEY` is an infrastructure credential (like `SIGNING_KEY` or `IP_HASH_SEED`). This directly answers question 1: the admin key is NOT tenant 1. It is a separate infrastructure-level credential that can provision keys for any tenant, including the first one. Tenant 1 (`default`) gets its own tenant keys through the admin API, just like any other tenant.

Question 2 is answered unanimously: key provisioning must happen via the admin API. No CLI tooling in R12. If CLI is ever built, it would be a thin client calling the admin API -- not a separate provisioning path. This aligns with the user's explicit preference and the project's "lean and mean" philosophy.

### Team Consensus

1. **KV key storage format**: `apikey:{hex(SHA-256(rawKey))}` maps to `{ tenantId, scopes, name, createdAt, createdBy, revoked }`. SHA-256 hash-then-lookup eliminates the timing side-channel. All five specialists agree on this schema.

2. **Three scopes, no more**: `capture` (create captures), `read` (list/retrieve), `admin` (manage keys). `capture` implies `read` (a key that can create should be able to list). `admin` does NOT imply `capture` or `read` (prevents accidental god-keys). All agree this is the right granularity.

3. **Server-generated keys**: 256-bit entropy, returned exactly once at creation. No client-provided keys. Key format uses `wrl_live_` prefix for scanner detectability (api-design-minion), though security-minion proposed raw base64url. Format is a minor detail to settle during implementation.

4. **Soft-delete revocation**: `revoked: true` flag, not hard delete. Preserves audit trail, prevents re-registration, and handles KV eventual consistency better. 60-second propagation window is an accepted residual risk at this scale.

5. **Unauthenticated endpoints unchanged**: `GET /v1/captures/{id}`, status, artifacts, and verify remain capability-based (capture ID is the bearer secret). Tenant isolation is enforced at the list endpoint and capture creation, not at individual capture access.

6. **Admin API, not CLI**: Three endpoints (`POST/GET/DELETE /v1/admin/keys`). Server-to-server, no CORS. Key provisioning is an API-first operation. CLI, if ever built, would call the admin API.

7. **Dedicated admin rate limiter**: New `ADMIN_RATE_LIMITER` binding at 5/min per IP, separate namespace (1004/2004). Rate check before auth on admin endpoints to throttle pre-auth abuse.

8. **Observability**: Enrich `security.auth_fail` with `reason` field (controlled vocabulary). Add `keyName` to all tenant-scoped events. New `admin` subsystem with `admin.key_create` and `admin.key_revoke` at severity 4. New `security.scope_violation` event at severity 5. Add `tenantId` to post-auth rate limit events.

9. **v1 contract unbroken**: The only new HTTP status existing callers might encounter is 403 for scope violations, but this only affects NEW keys with limited scopes. The migrated first-tenant key gets full scopes.

10. **No pipeline changes**: Dual-mode fallback means deploys work before and after migration. Key provisioning is a post-deploy manual step, not a CI/CD concern.

### Dissenting Views

- **Admin key architecture**: security-minion recommends NO separate `ADMIN_KEY` -- use `CAPTURE_API_KEY` as bootstrap superadmin, granting implicit `['capture', 'read', 'admin']` scopes when it matches via env-var fallback. Delete the env var after provisioning KV keys. iac-minion recommends a new `ADMIN_KEY` wrangler secret, separate from `CAPTURE_API_KEY`, following the existing pattern of infrastructure secrets. Resolution: **`ADMIN_KEY` wins**. Reasons: (a) It cleanly separates the tenant credential (`CAPTURE_API_KEY` = default tenant's capture key) from the infrastructure credential (`ADMIN_KEY` = operator's management key), answering the user's question about what the admin key is. (b) It avoids overloading `CAPTURE_API_KEY` with two meanings (tenant auth AND admin bootstrap), which would be confusing to document and error-prone to operate. (c) It follows the existing secret management pattern (`SIGNING_KEY`, `IP_HASH_SEED`, `CORALOGIX_SEND_KEY` are all separate infrastructure secrets). (d) Security-minion's concern about "doubling the configuration surface" is valid but the alternative creates worse confusion. One more `wrangler secret put` command is trivial compared to explaining "your capture key is also secretly an admin key until you delete it."

- **Admin scope: tenant-scoped vs. global**: security-minion says admin scope should be tenant-scoped (admin key for tenant `acme` can only manage keys for tenant `acme`), with the env-var fallback providing cross-tenant bootstrap. api-design-minion says `GET /v1/admin/keys` should list ALL keys across all tenants because the admin is a service-operator role, not a tenant-scoped role. Resolution: **Hybrid approach**. The `ADMIN_KEY` env var is the superadmin -- it can create/list/revoke keys for any tenant. KV-stored keys with `admin` scope are tenant-scoped -- they can only manage keys within their own tenant. This gives operators full control via `ADMIN_KEY` and gives tenants self-service key management via their own admin keys. The list endpoint returns all keys when authenticated via `ADMIN_KEY`, and tenant-scoped keys when authenticated via a KV admin key. This is the simplest model that serves both use cases without introducing a `super-admin` scope.

- **403 detail message**: security-minion initially said name the missing scope, then revised to NOT name it ("don't create an oracle"). api-design-minion says name the missing scope for usability ("This API key does not have the 'capture' scope required for this operation"). Resolution: **Name the scope**. The scope model is public (documented in the API spec). A valid key holder already knows what scopes exist. Withholding the scope name in 403 responses only frustrates legitimate operators debugging misconfigured keys, without meaningfully hindering an attacker who already has a valid key. Use the api-design-minion's phrasing.

- **Key ID format**: api-design-minion proposes `key_` prefix + first 16 hex chars of SHA-256 as a display-safe identifier. security-minion uses the full SHA-256 hex as the identifier for revocation. Resolution: **Use the full hash for API operations** (`DELETE /v1/admin/keys/{keyHash}`), but display the `key_` prefixed short ID in list responses for human readability. The short ID is a display concern, not an API contract concern. The full hash is needed for unambiguous KV lookup during revocation. This avoids the 64-bit collision risk that api-design-minion flagged.

- **`list.success` severity normalization**: observability-minion recommends changing `list.success` from severity 6 (verbose) to severity 3 (info) for consistency. Resolution: **Include in R12 scope** as a minor housekeeping item. It is a one-line change and improves Coralogix query consistency before R13 adds more events.

### Supporting Evidence

#### Security (security-minion)

The auth module rewrite is well-specified: KV-first lookup, env-var fallback with timing-safe comparison, revocation check before fallback. Key risks are properly identified: KV eventual consistency (60s revocation window), bootstrap key left in production, IDOR on admin API, raw key in logs, self-lockout. All have mitigations. The timing-safe analysis is correct: SHA-256 hash-then-lookup eliminates the timing channel on the KV path; the env-var fallback retains existing timing-safe comparison.

The `tenant-keys:{tenantId}` secondary index (array of key hashes per tenant) is a pragmatic choice for single-digit keys per tenant. Read-modify-write races are acceptable at this scale. No need for the KV list-prefix pattern.

#### API Design (api-design-minion)

The three admin endpoints are clean and follow existing conventions (RFC 9457 errors, `data` array envelope, Bearer auth). The `capture` implies `read` decision is correct for usability. The 409 safeguard against revoking the last admin key prevents the most common lockout scenario. CORS should NOT apply to admin endpoints.

Key format with `wrl_live_` / `wrl_test_` prefix aids secret scanning and environment identification. This is a good practice borrowed from Stripe/GitHub.

#### Edge (edge-minion)

Keep global rate limiter at 200/min (shared resource protection, not tenant fairness). Per-tenant rate limiting deferred. Dedicated admin rate limiter at 5/min with rate check BEFORE auth (catches pre-auth abuse). No KV caching for key records -- security trumps latency, and the 10-40ms cost is well within the 300ms budget. CDN cache headers are already correct for multi-tenancy; future CDN must exclude `/v1/admin/*`.

The rate-limit-before-auth ordering for admin endpoints is a subtle but important security detail. For capture endpoints, current auth-before-rate-limit ordering is acceptable because per-IP at 10/min bounds the KV read cost from invalid key floods.

#### Infrastructure (iac-minion)

No pipeline changes needed. Dual-mode fallback makes deploys safe during migration. New `ADMIN_RATE_LIMITER` binding follows existing namespace numbering (1004/2004). Staging parity maintained through wrangler.toml structure. Documentation updates needed for OPERATIONS.md, CONTRIBUTING.md, and README.

The migration sequence (deploy, set ADMIN_KEY, provision KV keys, optionally remove CAPTURE_API_KEY) is safe because the dual-mode fallback is always available.

#### Observability (observability-minion)

The R12/R13 boundary is well-drawn: R12 enriches existing events with `keyName` and `reason`, adds minimal new events (`scope_violation`, `key_create`, `key_revoke`). R13 builds the full audit trail. The `admin` subsystem separation from `security` is the right call -- constructive events (provisioning) vs. defensive events (auth failures) serve different operational queries.

Forward-compatible schema decisions (controlled vocabulary for `reason`, `keyName` on all tenant-scoped events, separate `admin` subsystem) prevent R13 from having to retrofit R12's log schema.

### Risks and Caveats

1. **KV eventual consistency on revocation**: A revoked key works for up to 60 seconds at edge locations that haven't received the update. Accepted residual risk. Per-IP rate limiting bounds damage during the window. Document for operators.

2. **`ADMIN_KEY` compromise has high blast radius**: The superadmin credential can create keys for any tenant. Mitigated by: 256-bit entropy, aggressive rate limiting (5/min), audit logging, wrangler secret encryption at rest. This risk already exists with `CAPTURE_API_KEY` (single key controls everything) -- `ADMIN_KEY` actually reduces blast radius by separating admin from capture operations.

3. **Bootstrap key left in production**: Operators may forget to remove `CAPTURE_API_KEY` after migrating to KV keys. Mitigated by: deprecation warning logged on every env-var fallback usage, health check field showing `authMode: "env-var-fallback"`. The key does not grant admin access (that is now `ADMIN_KEY`), so the risk is reduced compared to security-minion's original proposal where the env var was the superadmin.

4. **IDOR on admin API**: Tenant A's admin key used to manage Tenant B's keys if scoping is implemented incorrectly. Mitigated by: admin handlers extract tenantId from the authenticated key record, never from request parameters (except when authenticated via `ADMIN_KEY` env var). Critical test case: "admin key for tenant A cannot list keys for tenant B."

5. **No key rotation mechanism**: Create + revoke requires two API calls with a window where both keys are valid. Acceptable for single-digit keys with manual operator management. Atomic rotation can be added later if needed.

6. **Raw key logged accidentally**: The `POST /v1/admin/keys` response contains the raw key. Logging middleware must never log this response body. Mitigated by code comment and review discipline.

7. **The `ADMIN_KEY` design creates a permanent infrastructure dependency**: Unlike security-minion's proposal where the env var is removed after bootstrap, `ADMIN_KEY` as a dedicated secret implies it persists. To onboard a new tenant, the operator needs `ADMIN_KEY`. This is the intended design -- it is an infrastructure credential like `SIGNING_KEY`, not a temporary bootstrap credential. The tradeoff is accepted: permanent secret vs. re-setting an env var for each new tenant onboarding.

### Next Steps

If the recommendation is adopted, the implementation path is:

1. **Prerequisites**: R1 (list endpoint) and R8 (auth identity enrichment) -- both already DONE.

2. **Gating condition**: The issue states "do not build until a second user is real or imminent." This advisory provides the design so that when the gate opens, implementation can proceed immediately.

3. **Implementation scope** (single PR, as recommended by security-minion):
   - Rewrite `verifyApiKey()` with KV-first lookup and env-var fallback
   - Add scope enforcement to `handleCreateCapture` and `handleListCaptures`
   - Implement three admin endpoints (`POST/GET/DELETE /v1/admin/keys`)
   - Add `ADMIN_RATE_LIMITER` binding to wrangler.toml
   - Enrich log events with `keyName`, `reason`, `tenantId` fields
   - Add `admin` subsystem events
   - Update OpenAPI spec with admin endpoints and 403 responses
   - Update OPERATIONS.md, CONTRIBUTING.md

4. **Post-deploy migration** (manual, one-time):
   - `wrangler secret put ADMIN_KEY` (both environments)
   - Call `POST /v1/admin/keys` to provision first tenant key for `default` tenant
   - Verify KV auth works
   - Optionally remove `CAPTURE_API_KEY` secret

5. **Follow-on work**:
   - R13 (audit logging): full audit trail, `audit.*` events, admin list logging
   - Per-tenant rate limiting: new rate limiter binding keyed by tenantId
   - Key rotation endpoint: atomic create-new + revoke-old

### Conflict Resolutions

1. **ADMIN_KEY vs. CAPTURE_API_KEY as superadmin** (security-minion vs. iac-minion): Resolved in favor of dedicated `ADMIN_KEY`. The separation of tenant credentials from infrastructure credentials is cleaner, easier to document, and aligns with the existing secret management pattern. Security-minion's concern about configuration surface is outweighed by the clarity benefit.

2. **Admin scope: tenant-scoped vs. global** (security-minion vs. api-design-minion): Resolved with hybrid approach. `ADMIN_KEY` env var is global superadmin. KV-stored `admin` scope keys are tenant-scoped. Both use cases served without scope explosion.

3. **403 detail message content** (security-minion vs. api-design-minion): Resolved in favor of naming the required scope. The scope model is public; withholding it hinders operators without meaningfully improving security.

4. **Key identifier format** (api-design-minion's short `key_` prefix vs. security-minion's full hash): Resolved by using full hash for API operations (unambiguous, no collision risk) and short `key_` prefix for display in list responses (human-readable).
