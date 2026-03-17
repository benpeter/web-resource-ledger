# Domain Plan Contribution: iac-minion

## Recommendations

### 1. wrangler.toml: ADMIN_RATE_LIMITER binding (both envs)

Add a new `[[unsafe.bindings]]` block for `ADMIN_RATE_LIMITER` in both the top-level (production) and `[env.staging]` sections. Follow the established numbering scheme: production 100x, staging 200x.

**Exact additions (production, after the GLOBAL_CAPTURE_LIMITER block at line 33):**

```toml
[[unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1004"
simple = { limit = 5, period = 60 }
```

**Exact additions (staging, after the staging GLOBAL_CAPTURE_LIMITER block at line 81):**

```toml
[[env.staging.unsafe.bindings]]
name = "ADMIN_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2004"
simple = { limit = 5, period = 60 }
```

The limit of 5 req/60s is deliberately aggressive. Key provisioning is a rare admin operation (single-digit calls per day). Brute-force attempts against the admin endpoint should be throttled hard. This aligns with the advisory design decisions.

**Also update the secrets comment on line 51** to include `ADMIN_KEY`:

```toml
# Secrets (CAPTURE_API_KEY, ADMIN_KEY, SIGNING_KEY, CORALOGIX_SEND_KEY, IP_HASH_SEED) are set via:
#   wrangler secret put <NAME> --env staging
```

### 2. wrangler secrets: ADMIN_KEY for both envs

`ADMIN_KEY` is a new wrangler secret, managed identically to the existing five secrets. It follows the established pattern: one-time `wrangler secret put`, persists across all deploys, never touches the CD pipeline.

**Pre-deploy or post-deploy -- either works.** The Worker ignores unknown secrets, so setting `ADMIN_KEY` before the R12 code ships is harmless. Setting it after is also safe because the dual-mode fallback in `CAPTURE_API_KEY` keeps the existing auth path working.

Recommended setup commands:

```bash
# Generate
openssl rand -hex 32

# Production
wrangler secret put ADMIN_KEY
# Paste the hex string when prompted

# Staging
wrangler secret put ADMIN_KEY --env staging
# Paste a DIFFERENT hex string when prompted
```

Use different values for production and staging. This is the same practice as all other secrets.

No new GitHub environment secrets are needed. The smoke tests authenticate with `WRL_STAGING_CAPTURE_API_KEY` and `WRL_PROD_CAPTURE_API_KEY`, which continue to work unchanged via the dual-mode fallback. Admin API smoke testing is not required for the CD pipeline.

### 3. OPERATIONS.md migration runbook

The runbook belongs in OPERATIONS.md as a new top-level section. It covers the full lifecycle: pre-merge safety, post-deploy provisioning, verification, legacy removal, and rollback.

**Proposed structure and content:**

```markdown
## Per-Tenant API Key Migration (R12)

### Overview

R12 replaces the single shared `CAPTURE_API_KEY` with per-tenant API keys stored in KV.
A dual-mode fallback ensures backward compatibility: the existing key continues working
during migration. No downtime or pipeline changes are required.

### Pre-merge

Nothing required. The dual-mode fallback makes the deploy safe. The existing
`CAPTURE_API_KEY` wrangler secret and GitHub environment secrets continue to work
unchanged after the R12 code is deployed.

### Post-deploy: Set ADMIN_KEY

The admin API authenticates against a new `ADMIN_KEY` wrangler secret. Set it in
both environments:

    openssl rand -hex 32

    # Production
    wrangler secret put ADMIN_KEY

    # Staging
    wrangler secret put ADMIN_KEY --env staging

Use different values for production and staging. Store both values securely
(password manager, not plaintext).

### Post-deploy: Provision first tenant key

Create a tenant API key using the admin API:

    # Production
    curl -X POST https://<PROD_URL>/v1/admin/keys \
      -H "Authorization: Bearer <ADMIN_KEY>" \
      -H "Content-Type: application/json" \
      -d '{"name": "primary", "scopes": ["capture"]}'

    # Save the returned key value -- it is shown only once

    # Staging
    curl -X POST https://<STAGING_URL>/v1/admin/keys \
      -H "Authorization: Bearer <STAGING_ADMIN_KEY>" \
      -H "Content-Type: application/json" \
      -d '{"name": "primary", "scopes": ["capture"]}'

### Verification

Confirm the new tenant key works for captures:

    curl -X POST https://<PROD_URL>/v1/captures \
      -H "Authorization: Bearer <NEW_TENANT_KEY>" \
      -H "Content-Type: application/json" \
      -d '{"url": "https://example.com"}'

    # Expected: 202 with capture ID

List provisioned keys to confirm KV state:

    curl https://<PROD_URL>/v1/admin/keys \
      -H "Authorization: Bearer <ADMIN_KEY>"

### Update GitHub environment secrets

Once the KV-based tenant key is verified working, update the GitHub environment
secrets to use the new tenant key:

1. Go to repo Settings > Environments > production
2. Update `WRL_PROD_CAPTURE_API_KEY` to the new tenant key value
3. Go to repo Settings > Environments > staging
4. Update `WRL_STAGING_CAPTURE_API_KEY` to the new staging tenant key value

This ensures smoke tests use the new auth path going forward.

### CAPTURE_API_KEY removal (when safe)

Once ALL of the following are true:
- Tenant key is provisioned and verified in both environments
- GitHub environment secrets updated to tenant key values
- At least one full deploy cycle has passed with green smoke tests
- Coralogix logs show no "legacy auth fallback" deprecation warnings

Remove the legacy secret:

    wrangler secret delete CAPTURE_API_KEY
    wrangler secret delete CAPTURE_API_KEY --env staging

The dual-mode fallback code path can be removed in a follow-on PR.

### Rollback

If R12 causes issues:

1. Revert the R12 commit and push to main (triggers normal deploy pipeline)
2. Keys stored in KV are harmless orphans -- they remain but are never read
3. The `ADMIN_KEY` wrangler secret is also harmless -- the Worker ignores it
4. `CAPTURE_API_KEY` continues working as before

No secret cleanup is needed after rollback.
```

### 4. .dev.vars changes for local development

Update the `.dev.vars` template in CONTRIBUTING.md to include `ADMIN_KEY`:

**Current template (CONTRIBUTING.md lines 22-28):**

```ini
# Required
SIGNING_KEY=<your Ed25519 private key>
CAPTURE_API_KEY=<a secret API key you choose>
IP_HASH_SEED=<any random string, used for privacy-safe IP hashing>
```

**Updated template:**

```ini
# Required
SIGNING_KEY=<your Ed25519 private key>
CAPTURE_API_KEY=<a secret API key you choose>
ADMIN_KEY=<a secret admin key you choose>
IP_HASH_SEED=<any random string, used for privacy-safe IP hashing>
```

Also update the staging secrets list at line 55-58 to add:

```bash
wrangler secret put ADMIN_KEY --env staging
```

And add a new README step (step 4.5 or renumber) for ADMIN_KEY configuration, following the same pattern as the existing CAPTURE_API_KEY step.

### 5. Staging environment handling

Staging parity is maintained through the wrangler.toml structure (every production binding has a staging counterpart) and the established numbering scheme. For R12:

| Resource | Production | Staging |
|----------|-----------|---------|
| ADMIN_RATE_LIMITER namespace | 1004 | 2004 |
| ADMIN_KEY secret | `wrangler secret put ADMIN_KEY` | `wrangler secret put ADMIN_KEY --env staging` |

No pipeline changes needed. The wrangler.toml diff in the PR will show both bindings side by side, making parity reviewable.

### 6. GitHub Actions: smoke test compatibility

**No workflow file changes required.** Here is the analysis for each workflow:

**`ci.yml`**: Runs `npm test` and `npm run lint:api`. No secrets, no deployment, no changes needed.

**`deploy-staging.yml`**: The smoke test sends `Authorization: Bearer {WRL_STAGING_CAPTURE_API_KEY}`. With the dual-mode fallback, this key works whether it is resolved via KV or via the legacy env var comparison. After migration, once the GitHub environment secret is updated to the new tenant key, it authenticates via KV. Either way, the smoke test passes without modification.

**`deploy-production.yml`**: Same analysis. The `staging-smoke` job and `smoke` job both use existing `CAPTURE_API_KEY` secrets. The dual-mode fallback ensures no disruption during migration.

**Migration sequencing (critical):**

1. R12 PR merges to main
2. Staging deploys automatically -- smoke test passes via dual-mode fallback
3. Production deploys -- smoke test passes via dual-mode fallback
4. Operator sets `ADMIN_KEY` in both environments (manual, one-time)
5. Operator provisions tenant keys via admin API (manual, one-time)
6. Operator updates GitHub environment secrets to use tenant keys (manual, one-time)
7. Next deploy cycle uses tenant key auth path -- smoke tests validate new path
8. Operator removes `CAPTURE_API_KEY` wrangler secret when ready

Steps 4-8 are entirely post-deploy manual operations. The CD pipeline never needs modification.

## Proposed Tasks

### Task 1: Add ADMIN_RATE_LIMITER binding to wrangler.toml

**What**: Add `ADMIN_RATE_LIMITER` unsafe binding with namespace_id 1004 (production) and 2004 (staging). Limit 5 req/60s. Update the secrets comment in the staging section.

**Files**: `wrangler.toml`

**Dependencies**: None. This is a wrangler.toml-only change with no code dependencies.

### Task 2: Update OPERATIONS.md with migration runbook

**What**: Add the "Per-Tenant API Key Migration (R12)" section as outlined in recommendation 3. Also update the "Secret Surfaces" table to add `ADMIN_KEY` row, and update the "Manual Deploy (Emergency Bypass)" section to include `wrangler secret put ADMIN_KEY`.

**Files**: `OPERATIONS.md`

**Dependencies**: Depends on api-design-minion finalizing the admin API contract (endpoint paths, request/response shapes) so the runbook curl examples are accurate. Depends on security-minion confirming the dual-mode fallback behavior so the runbook's safety assertions are correct.

### Task 3: Update CONTRIBUTING.md .dev.vars template

**What**: Add `ADMIN_KEY=<a secret admin key you choose>` to the `.dev.vars` template. Add `wrangler secret put ADMIN_KEY --env staging` to the staging secrets list.

**Files**: `CONTRIBUTING.md`

**Dependencies**: None.

### Task 4: Update README.md setup steps

**What**: Add a new setup step for `ADMIN_KEY` configuration, following the same pattern as step 4 (CAPTURE_API_KEY). Include generation command, `wrangler secret put` command, `.dev.vars` entry, and security note.

**Files**: `README.md`

**Dependencies**: None, but should align with the step numbering from api-design-minion and software-docs-minion if they are also modifying README.

### Task 5: Set ADMIN_KEY wrangler secrets (post-merge operational task)

**What**: Generate strong random values and run `wrangler secret put ADMIN_KEY` for production and `wrangler secret put ADMIN_KEY --env staging` for staging. Verify via `wrangler secret list`.

**Deliverables**: Secrets set in both environments.

**Dependencies**: R12 PR merged (or can be done before merge -- Worker ignores unknown secrets).

**Note**: This is an operational task, not a code task. It belongs in the runbook but is listed here for tracking completeness.

### Task 6: Verify staging parity in PR review

**What**: During R12 PR review, verify that every new wrangler.toml binding, every new secret instruction, and every documentation update covers both production and staging.

**Deliverables**: PR review checklist item.

**Dependencies**: All other tasks complete.

## Risks and Concerns

### Risk 1: Smoke test gap during migration window (LOW)

**Risk**: Between R12 deploy and tenant key provisioning, smoke tests use the dual-mode fallback. This means the new KV auth path is not exercised by CI until the operator completes migration and updates GitHub environment secrets.

**Mitigation**: The migration runbook includes explicit verification steps. The dual-mode fallback logs deprecation warnings to Coralogix, so the operator has visibility. This window is expected to be hours, not days.

### Risk 2: ADMIN_KEY not set causes opaque 503 for admin endpoints (LOW)

**Risk**: A fresh deployment or an operator who skips the ADMIN_KEY setup step gets a generic 503 when hitting admin endpoints. This may be confusing.

**Mitigation**: The 503 response body should include `"error": "Service is not configured"` (consistent with existing misconfiguration guard pattern). The README setup steps and OPERATIONS.md runbook document the required setup order. The health endpoint should ideally NOT report ADMIN_KEY absence as unhealthy -- it is an optional capability, not a service health issue.

### Risk 3: CAPTURE_API_KEY premature removal breaks smoke tests (MEDIUM)

**Risk**: If the operator deletes `CAPTURE_API_KEY` from wrangler secrets before updating the GitHub environment secrets (`WRL_PROD_CAPTURE_API_KEY`, `WRL_STAGING_CAPTURE_API_KEY`) to the new tenant key values, the next deploy's smoke test will fail because the smoke test sends the old key value, the legacy fallback path is gone, and the old key value does not exist in KV.

**Mitigation**: The runbook explicitly states the ordering: (1) provision tenant key, (2) update GitHub environment secrets, (3) verify a full deploy cycle passes, (4) only then remove `CAPTURE_API_KEY`. Each step has a verification gate.

### Risk 4: KV eventual consistency on key revocation (LOW)

**Risk**: After deleting a key from KV, edge caches may serve the old record for up to 60 seconds. A revoked key could authenticate during this window.

**Mitigation**: Document the propagation delay in the admin API response and operator runbook. At WRL's scale, this is an acceptable window. If immediate revocation is critical (active breach), the operator can also rotate the entire Worker deployment or set the revoked key's scopes to empty (update, not delete) which avoids the cache staleness issue.

### Risk 5: Rate limiter namespace_id collision (NEGLIGIBLE)

**Risk**: The `namespace_id` "1004" could collide with another Worker's rate limiter namespace.

**Mitigation**: Rate limiter namespace IDs are scoped per Worker script, not globally. Two Workers using "1004" do not interfere with each other. This is a non-issue but worth documenting for future contributors who might worry about it.

## Additional Agents Needed

None beyond the current planning team. All infrastructure surfaces are covered:

- **security-minion**: dual-mode fallback design, admin bootstrap sequence
- **api-design-minion**: admin API contract (endpoint paths, request/response shapes for runbook examples)
- **edge-minion**: rate limiter binding confirmation, caching implications
- **observability-minion**: deprecation warning logging for legacy auth path
- **test-minion**: integration tests for new auth paths
- **software-docs-minion**: README/CONTRIBUTING/OPERATIONS documentation updates

The iac-minion's tasks (wrangler.toml bindings, runbook structure, .dev.vars template, staging parity) are fully scoped. The runbook content depends on api-design-minion and security-minion outputs for accurate curl examples and migration assertions.
