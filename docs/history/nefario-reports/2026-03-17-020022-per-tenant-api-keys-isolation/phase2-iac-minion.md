# Domain Plan Contribution: iac-minion

## Recommendations

### (a) Secrets management: Fate of `CAPTURE_API_KEY`

**Recommendation: Repurpose `CAPTURE_API_KEY` as `ADMIN_KEY`. Remove it only after KV migration is confirmed working.**

The transition has three phases with distinct secret states:

1. **Pre-R12 (today)**: `CAPTURE_API_KEY` is a wrangler secret. `verifyApiKey()` compares it directly. Hardcoded `tenantId = 'default'`.

2. **R12 dual-mode (migration window)**: The auth module checks KV first (`apikey:{sha256}` lookup). If KV returns a key record, use it. If KV lookup returns null AND the provided key matches the legacy `CAPTURE_API_KEY` env var, treat the request as `tenantId = 'default'` with full scopes. This fallback is a safety net -- it ensures the existing single key continues working even if the KV migration record is accidentally deleted or KV has a transient read failure. The fallback should log a deprecation warning (severity 4) so the operator knows legacy auth was used.

3. **Post-migration**: Once the operator has confirmed their key exists in KV (via the admin API list endpoint), they can remove the `CAPTURE_API_KEY` wrangler secret. The code path can be removed in a follow-on PR. No rush -- the dual-mode path is not a security risk, just technical debt.

**Do NOT rename `CAPTURE_API_KEY` to `ADMIN_KEY` in the same PR.** That would require re-running `wrangler secret put` for both environments and updating all GitHub environment secrets simultaneously. Instead, introduce `ADMIN_KEY` as a new, separate secret. The existing `CAPTURE_API_KEY` stays as the legacy fallback until explicitly removed.

**Bootstrap scenario for a fresh deployment:**

A brand-new WRL deployment (no existing captures, no KV records) needs a way to provision its first tenant key. The sequence is:

1. Operator runs `wrangler secret put ADMIN_KEY` with a strong random value
2. Operator calls `POST /v1/admin/keys` with `Authorization: Bearer {ADMIN_KEY}` to create their first tenant key
3. Operator uses the returned tenant key for all capture operations
4. `CAPTURE_API_KEY` is never set in a fresh deployment -- only `ADMIN_KEY`

This means the admin API endpoint authenticates against `ADMIN_KEY` (env var), not against a KV-stored key. The admin key is an infrastructure credential (like `SIGNING_KEY` or `CORALOGIX_SEND_KEY`), not a tenant key. This avoids the chicken-and-egg problem entirely: the admin key exists in the env, tenant keys exist in KV, and they are separate trust domains.

### (b) `ADMIN_KEY` management

**Recommendation: `ADMIN_KEY` is a wrangler secret, managed identically to the existing four secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`, `IP_HASH_SEED`).**

Setup commands:

```bash
# Production
wrangler secret put ADMIN_KEY

# Staging
wrangler secret put ADMIN_KEY --env staging
```

**Impact on deployment pipeline**: None. The CD pipeline (`deploy-production.yml`, `deploy-staging.yml`) deploys code only. As documented in OPERATIONS.md: "Worker runtime secrets must be set once via `wrangler secret put` and persist across all subsequent deploys." Adding `ADMIN_KEY` follows this established pattern -- it is a one-time manual step per environment, not a pipeline change.

**GitHub environment secrets**: The smoke test workflows use `WRL_STAGING_CAPTURE_API_KEY` and `WRL_PROD_CAPTURE_API_KEY` for smoke testing capture functionality. The admin API does not need smoke testing in the CD pipeline (provisioning keys is not something you do on every deploy). So no new GitHub environment secrets are needed for the pipeline itself. If admin API smoke testing is desired later, add `WRL_PROD_ADMIN_KEY` and `WRL_STAGING_ADMIN_KEY` to the respective GitHub environments, but this is not required for R12.

**Documentation updates needed**:

- `OPERATIONS.md` "Secret Surfaces" table: add `ADMIN_KEY` row
- `OPERATIONS.md` "Manual Deploy" section: add `wrangler secret put ADMIN_KEY`
- `CONTRIBUTING.md` `.dev.vars` template: add `ADMIN_KEY=<a secret admin key you choose>`
- `README.md` setup steps: add a new step for `ADMIN_KEY` configuration
- `wrangler.toml` comment on line 51: add `ADMIN_KEY` to the list of secrets

### (c) New rate limiter bindings

**Recommendation: Add a single new rate limiter binding for admin endpoints, following the existing `namespace_id` numbering scheme.**

Current namespace IDs: production uses 1001-1003, staging uses 2001-2003. The pattern is clear: production gets 100x, staging gets 200x. Add:

```toml
# Production
[[unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1004"
simple = { limit = 5, period = 60 }

# Staging
[[env.staging.unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2004"
simple = { limit = 5, period = 60 }
```

**Cloudflare account-level constraints on rate limiter namespaces**: Rate limiter bindings use `[[unsafe.bindings]]` because the rate limiting API is not yet GA (it was introduced as part of the Workers API and is still under the `unsafe` designation). The `namespace_id` is a string identifier scoped to the Worker script -- it is NOT a globally unique resource like a KV namespace ID. Two different Workers can use the same `namespace_id` value without conflict. There is no documented limit on the number of rate limiter namespaces per Worker or per account, and at the scale WRL operates (4-5 bindings), there is zero risk of hitting any implicit limit.

The limit of 5 requests/minute for admin endpoints is deliberately aggressive. Key provisioning is a rare operation (creating a tenant key, revoking a compromised key). Legitimate use is single-digit requests per day, not per minute. An attacker brute-forcing the admin key endpoint should be throttled hard. This limit should be discussed with edge-minion for alignment.

### (d) KV namespace capacity

**No operational concerns.** The existing KV namespace holds:

- `capture:{captureId}` records (one per capture, grows with usage)
- `tenant:{tenantId}:ts:{ISO}:{captureId}` secondary index keys (one per capture)
- `signingkey:{keyId}` records (one per signing key version, handful total)

Adding `apikey:{sha256}` records introduces:

- Dozens of records total (one per API key, across all tenants)
- Each record is small JSON (~200 bytes: tenantId, scopes, createdAt, name)
- Read pattern: one KV GET per authenticated request (the key lookup)
- Write pattern: negligible (only when provisioning/revoking keys)

KV namespaces support billions of keys. The concern is not capacity but read latency (addressed in section e) and eventual consistency. Eventual consistency matters for key revocation: after revoking a key via `kv.delete()`, the revoked key may still resolve successfully for up to 60 seconds in edge caches. This is an acceptable window for key compromise response -- document it in the admin API response and the operator runbook.

**Key format concern**: The `apikey:{sha256}` prefix must not collide with existing key prefixes (`capture:`, `tenant:`, `signingkey:`). The `apikey:` prefix is distinct from all existing prefixes. Good.

### (e) Staging parity

**Recommendation: Enforce parity through wrangler.toml structure and a PR review checklist, not automation.**

The current wrangler.toml already demonstrates the parity pattern: every production binding has a staging equivalent with separate namespace IDs. The pattern is:

| Resource | Production | Staging |
|----------|-----------|---------|
| R2 bucket | `wrl-captures` | `wrl-captures-staging` |
| KV namespace | `b5cd6168...` | `ed564f8e...` |
| Rate limiters | 100x | 200x |
| Secrets | `wrangler secret put X` | `wrangler secret put X --env staging` |
| Vars | `APPLICATION_NAME = "wrl"` | `APPLICATION_NAME = "wrl-staging"` |

For R12, add to the staging section:

1. `ADMIN_RATE_LIMITER` binding (namespace_id 2004) -- in wrangler.toml, committed to git
2. `ADMIN_KEY` secret -- manual one-time `wrangler secret put ADMIN_KEY --env staging`

No pipeline changes needed. The wrangler.toml diff in the R12 PR will show both production and staging bindings side by side, making parity reviewable in code review.

**Consider adding a CI lint step** (post-R12, parking lot) that parses wrangler.toml and verifies every production binding has a staging counterpart. This is a nice-to-have, not a blocker. At the current scale (5-6 bindings), manual review is sufficient. If the binding count grows beyond 10, automate it.

### (f) GitHub Actions pipeline changes

**Recommendation: No pipeline changes are required for R12.**

Here is why, examining each workflow:

**`deploy-staging.yml`**: Runs `npm test`, then `wrangler deploy --env staging`, then smoke test. The smoke test uses `WRL_STAGING_CAPTURE_API_KEY`. After R12, the staging capture API key is now a tenant key stored in KV, but the smoke test does not care -- it sends `Authorization: Bearer {key}` and expects 202. The key value in the GitHub environment secret stays the same. The only requirement is that the staging `ADMIN_KEY` has been set via `wrangler secret put` and the staging tenant key has been provisioned via the admin API before the first post-R12 deploy. This is a one-time manual step, documented in the migration runbook.

**`deploy-production.yml`**: Same analysis. The `staging-smoke` job uses `WRL_STAGING_CAPTURE_API_KEY`, the `deploy` job runs `wrangler deploy`, the `smoke` job uses `WRL_PROD_CAPTURE_API_KEY`. All continue to work unchanged. The key provisioning step (migrating the existing key into KV) must happen between deploying the R12 code and the first post-deploy smoke test. Since the dual-mode fallback (section a) makes the legacy env var still work, the smoke test passes even if KV migration has not happened yet.

**`ci.yml`**: Runs `npm test` and `npm run lint:api`. No secrets involved. No changes needed.

**Migration sequencing for existing environments** (critical operational detail):

The R12 deploy is safe because of the dual-mode fallback. The sequence is:

1. Merge R12 PR to `main`
2. CI runs, staging deploys automatically
3. Smoke test passes (dual-mode: legacy `CAPTURE_API_KEY` env var still works)
4. Production deploys after staging smoke passes
5. Production smoke test passes (same dual-mode fallback)
6. **Post-deploy**: Operator sets `ADMIN_KEY` secret on both environments
7. **Post-deploy**: Operator calls admin API to provision the existing key as a KV tenant key
8. **Post-deploy (optional)**: Operator removes `CAPTURE_API_KEY` secret after confirming KV auth works

Steps 6-8 are manual, one-time operations. They do not block the deploy pipeline and do not require pipeline changes.

## Proposed Tasks

### Task 1: Add `ADMIN_KEY` wrangler secret to both environments

**What**: Generate a strong random admin key and set it via `wrangler secret put ADMIN_KEY` (production) and `wrangler secret put ADMIN_KEY --env staging` (staging).

**Deliverables**: Admin key set in both environments. Verified via `wrangler secret list` and `wrangler secret list --env staging`.

**Dependencies**: None. Can be done before R12 code ships (the Worker ignores unknown secrets).

**Timing**: Do this immediately before the R12 deploy, or immediately after.

### Task 2: Add admin rate limiter binding to wrangler.toml

**What**: Add `ADMIN_RATE_LIMITER` unsafe binding with namespace_id 1004 (production) and 2004 (staging) to wrangler.toml. Limit: 5 requests per 60 seconds.

**Deliverables**: Updated wrangler.toml with both production and staging bindings.

**Dependencies**: Depends on edge-minion confirming the rate limiter approach for admin endpoints. If edge-minion recommends reusing an existing binding, this task is unnecessary.

### Task 3: Update OPERATIONS.md for new secret surface

**What**: Add `ADMIN_KEY` to the secret surfaces table, the manual deploy section, and document the key provisioning runbook (how to create the first tenant key after a fresh deploy, how to migrate the existing key to KV).

**Deliverables**: Updated OPERATIONS.md.

**Dependencies**: Depends on security-minion's admin bootstrap design and api-design-minion's admin API contract.

### Task 4: Update CONTRIBUTING.md `.dev.vars` template

**What**: Add `ADMIN_KEY` to the `.dev.vars` template with a comment explaining its purpose.

**Deliverables**: Updated CONTRIBUTING.md.

**Dependencies**: None.

### Task 5: Post-deploy migration runbook

**What**: Write a step-by-step runbook for migrating the existing single-key setup to multi-tenant KV keys. Include: setting `ADMIN_KEY`, calling admin API to provision first tenant key, verifying KV auth works, removing legacy `CAPTURE_API_KEY` secret.

**Deliverables**: New section in OPERATIONS.md or standalone migration guide.

**Dependencies**: Depends on security-minion's migration design and api-design-minion's admin API contract. This is the most dependency-heavy task.

### Task 6: Verify staging parity in PR review

**What**: During the R12 PR review, verify that every new binding, variable, and secret instruction has both production and staging equivalents.

**Deliverables**: PR review checklist item. Not a code deliverable.

**Dependencies**: All other tasks.

## Risks and Concerns

### Risk 1: Migration ordering creates a window of degraded auth (LOW)

If the R12 code deploys but the operator forgets to provision the existing key in KV, the system falls back to legacy env var comparison. This is safe but means the new auth path is not exercised. Mitigation: the dual-mode fallback logs a deprecation warning. If the operator watches logs (Coralogix) after deploy, they will see the warning and know to complete migration.

### Risk 2: `ADMIN_KEY` compromise has high blast radius (MEDIUM)

The `ADMIN_KEY` env var can create keys for any tenant, revoke any key, and list all keys. It is the most privileged credential in the system. Mitigations:

- Generate with at least 256 bits of entropy (32-byte hex string)
- Rate-limit the admin endpoint aggressively (5 req/min)
- Log every admin API call at severity 5 (critical)
- Document rotation procedure in OPERATIONS.md
- The key is a wrangler secret -- it is encrypted at rest and only available to the Worker runtime

This risk already exists with `CAPTURE_API_KEY` (single key controls everything). `ADMIN_KEY` actually improves the situation by separating admin operations from tenant operations.

### Risk 3: KV eventual consistency on key revocation (LOW)

After revoking a key via `kv.delete("apikey:{hash}")`, edge caches may serve the old (valid) record for up to 60 seconds. A revoked key could authenticate successfully during this window. Mitigation: document this in the admin API response ("key revocation propagates within 60 seconds") and in the operator runbook. If immediate revocation is required (active breach), the operator can also rotate `ADMIN_KEY` and the rate limiter will throttle the attacker during the propagation window.

### Risk 4: wrangler.toml staging drift (LOW)

A future PR could add a production binding without a staging equivalent, or vice versa. This is an existing risk (not introduced by R12) and is managed through PR review. The suggestion to add a CI lint step for binding parity is a future improvement, not a blocker.

### Risk 5: Smoke test failure during migration window (LOW)

If the operator removes `CAPTURE_API_KEY` from the wrangler secrets before provisioning the existing key in KV, the smoke test will fail because `SMOKE_API_KEY` authenticates via the legacy path. Mitigation: the migration runbook must explicitly state "do NOT remove `CAPTURE_API_KEY` until you have verified the KV-based key works." The dual-mode fallback makes this a safe default.

### Risk 6: `ADMIN_KEY` not set returns opaque 503 (LOW)

If the admin endpoint is called before `ADMIN_KEY` is set in the environment, the misconfiguration guard (like the existing one in `verifyApiKey()` for `CAPTURE_API_KEY`) returns 503 "Service is not configured." This is correct behavior but may confuse a new operator. Mitigation: document the setup order in README and OPERATIONS.md.

## Additional Agents Needed

None. The current team covers all required domains:

- **security-minion** -- designs the auth module, KV key schema, admin bootstrap
- **api-design-minion** -- designs the admin API contract
- **edge-minion** -- advises on rate limiter bindings and caching impact
- **observability-minion** -- designs the logging schema for multi-tenant auth events
- **iac-minion** (this contribution) -- covers secrets management, wrangler config, pipeline, staging parity

The cross-cutting agents (test-minion, software-docs-minion) are correctly deferred to Phase 3.5 architecture review and post-execution phases as noted in the meta-plan.
