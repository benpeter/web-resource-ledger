# software-docs-minion: Planning Contribution

## Planning Questions Addressed

### 1. Which documents need updating?

**Must update (directly affected by the change):**

| Document | What changes | Scope |
|----------|-------------|-------|
| `openapi.yaml` | New `admin` tag, new security scheme, 3 new admin endpoints, new schemas (AdminKeyCreate, AdminKeyResponse, AdminKeyList), new `403` response component, update `bearerAuth` description to cover KV-based keys | Large -- ~200-300 new lines |
| `OPERATIONS.md` | New `ADMIN_KEY` in Secret Surfaces table, migration runbook section, update Manual Deploy commands, update GitHub environment secrets tables (both production and staging) | Medium |
| `README.md` | Update "Configure capture API key" section (step 4) to mention dual-mode auth, add `ADMIN_KEY` setup step, update Usage section to explain tenant keys, update roadmap to mark R12 as done | Medium |
| `docs/backlog.md` | Mark R12 as done in Act 2, update parking lot items that depend on R12 (per-tenant rate limiting condition is now met, API key rotation now possible) | Small |
| `SECURITY.md` | Add "Admin API key bypass" and "Tenant isolation escape" to scope of security issues | Small -- 2 bullet points |

**Should NOT update (no meaningful change needed):**

| Document | Reason |
|----------|--------|
| `TERMS.md` | The ToS already uses generic language ("API key used for submission", "suspend or revoke any API key"). Multi-tenant auth does not change the legal terms. The identity data clause ("Your identity beyond the API key") still applies per-key. No update needed. |
| `CONTENT-POLICY.md` | Content policy is orthogonal to auth model. |
| `CONTRIBUTING.md` | May need a `.dev.vars` example update for `ADMIN_KEY`, but this is minor and can be done opportunistically. |

### 2. OpenAPI spec version bump

**Recommendation: bump to `0.5.0`.**

Rationale: This change adds new endpoints (additive, non-breaking) and introduces a new authentication model for existing endpoints (the capture/list endpoints now accept KV-based keys in addition to the legacy static key). The existing `bearerAuth` contract is preserved -- a valid bearer token still works for all tenant-scoped endpoints. The new admin endpoints are purely additive.

Under SemVer for pre-1.0 APIs, a minor bump (0.4.0 -> 0.5.0) is appropriate for new features that don't break existing clients. A patch bump would understate the significance of adding an entirely new auth subsystem and three new endpoints. A major bump is premature since the API is still pre-1.0 and the existing contract is unbroken.

### 3. Migration runbook structure within OPERATIONS.md

**Recommendation: New top-level section in OPERATIONS.md, positioned between "Secret Surfaces" and "GitHub Environment Setup".**

The migration runbook is an operational procedure, not a development guide (so it belongs in OPERATIONS.md, not README.md). It should be a standalone section with its own heading, not buried inside an existing section.

**Proposed structure:**

```
## Multi-Tenant Key Migration

### Prerequisites
- PR merged and deployed to staging
- `ADMIN_KEY` secret ready (generated but not yet set)
- Existing CAPTURE_API_KEY available for fallback verification

### Phase 1: Provision admin key (before switching auth)
1. Generate ADMIN_KEY
2. Set via wrangler secret put (staging first, then production)
3. Verify admin API responds (GET /v1/admin/keys returns empty list)

### Phase 2: Create first tenant key
1. POST /v1/admin/keys with ADMIN_KEY to create default tenant key
2. Verify new key works for capture submission
3. Verify new key works for list endpoint
4. Verify existing CAPTURE_API_KEY still works (dual-mode)

### Phase 3: Retire legacy key
1. Confirm all clients have switched to tenant key
2. Remove CAPTURE_API_KEY via wrangler secret delete
3. Verify tenant key still works
4. Verify CAPTURE_API_KEY no longer works

### Rollback
- If admin API broken: revert PR, redeploy; CAPTURE_API_KEY still works
- If tenant key broken but admin works: revoke bad key, create new one
- If both broken: revert PR; CAPTURE_API_KEY fallback is still active until Phase 3
```

**Key structural decisions:**
- Phases are sequential and each has explicit verification steps -- this matches the prompt's requirement that "PR merge, deploy, and secret provisioning are three separate events and the order matters"
- The rollback section addresses different failure modes separately rather than a single "undo everything" instruction
- Staging-first is implicit in Phase 1 ("staging first, then production") but should be explicit
- Each `wrangler secret put` command should include both `--env staging` and production variants

### 4. Admin API security scheme: separate scheme or reuse bearerAuth?

**Recommendation: Define a separate `adminAuth` security scheme.**

Rationale (three arguments):

1. **Semantic clarity in the spec.** The admin endpoints use a fundamentally different credential (the `ADMIN_KEY` infrastructure secret) than tenant endpoints (KV-stored tenant keys). Reusing `bearerAuth` for both would make the spec misleading -- a reader would see `bearerAuth` on admin endpoints and assume their tenant key works there. A separate scheme makes the distinction explicit in the spec itself, not just in the description.

2. **OpenAPI best practice.** OpenAPI security schemes describe "how to authenticate," and the admin key has different semantics: it is a static infrastructure credential set via `wrangler secret put`, not a tenant-scoped KV key. Even though the HTTP mechanism is identical (`Authorization: Bearer <token>`), the credential lifecycle, provisioning path, and authorization scope are completely different. A separate scheme communicates this.

3. **Future-proofing.** If the admin auth mechanism ever changes (e.g., HMAC signatures, mutual TLS, or a different header), a separate scheme can evolve independently without touching the tenant auth definition.

**Proposed definition:**

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: >
        Tenant API key. Provisioned via the admin API (POST /v1/admin/keys).
        Scoped to a single tenant. Used for capture submission and listing.
    adminAuth:
      type: http
      scheme: bearer
      description: >
        Admin infrastructure key. Set via `wrangler secret put ADMIN_KEY`.
        Grants access to key provisioning endpoints. Does not grant tenant
        capture/read access.
```

The admin endpoints use `security: [{ adminAuth: [] }]`. The existing tenant endpoints keep `security: [{ bearerAuth: [] }]`. No endpoint uses both.

### 5. Evolution log: anything beyond standard structure?

**Recommendation: Standard structure is sufficient, but the `decisions.md` file deserves special attention.**

This phase has an unusually rich decision space (the advisory produced 6+ named decisions with explicit specialist disagreements). The standard structure (`prompt.md`, `decisions.md`, `outcome.md`) handles this well, but `decisions.md` should be more detailed than typical phases:

- **Admin key identity decision**: Why admin key is NOT tenant 1 (this was a non-obvious choice that future developers will question)
- **Scope model**: Why three scopes, why `capture` implies `read`, why `admin` does NOT imply `capture/read`
- **Key format**: Server-generated vs client-generated, the `wrl_live_` prefix rationale
- **No KV caching decision**: The latency analysis that justified this
- **Soft-delete revocation**: Why not hard delete, the 60s eventual consistency acceptance
- **Dedicated admin rate limiter**: Why separate from existing rate limiters

The `process.md` (per CLAUDE.md requirements for nefario orchestrations) will capture the specialist disagreements and synthesis. `decisions.md` captures the decisions themselves. These are complementary, not redundant.

No additional evolution log files are needed beyond the standard structure + `process.md`.

---

## Recommendations

### Documentation tasks (ordered by implementation dependency)

1. **OpenAPI spec updates** (block: must be done with or immediately after code implementation)
   - Add `adminAuth` security scheme to `components.securitySchemes`
   - Add `admin` tag to the tags list
   - Add new schemas: `AdminKeyCreateRequest`, `AdminKeyCreateResponse`, `AdminKeyListResponse`, `AdminKeyRecord`
   - Add new `Problem403` response component (scope-based authorization failure)
   - Add three new path entries: `POST /v1/admin/keys`, `GET /v1/admin/keys`, `DELETE /v1/admin/keys/{keyHash}`
   - Update `bearerAuth` description to mention KV-based tenant keys
   - Bump version to `0.5.0`

2. **OPERATIONS.md updates** (block: must ship in same PR)
   - Add `ADMIN_KEY` to Secret Surfaces table
   - Add `ADMIN_RATE_LIMITER` to any relevant binding documentation if it exists
   - Write migration runbook as new section (see structure above)
   - Update Manual Deploy section to include `wrangler secret put ADMIN_KEY`
   - Update GitHub environment secrets tables for both `production` and `staging`

3. **README.md updates** (block: must ship in same PR)
   - Update step 4 (Configure capture API key) to explain it becomes a legacy fallback
   - Add new step between current 4 and 5 for `ADMIN_KEY` provisioning
   - Update Usage section to mention tenant keys and the admin API for key provisioning
   - Update roadmap Act 2 to reflect R12 completion

4. **SECURITY.md updates** (block: should ship in same PR)
   - Add "Admin API key compromise or bypass" to the scope of security issues
   - Add "Tenant data isolation escape (cross-tenant data access)" to scope

5. **docs/backlog.md updates** (block: must ship in same PR per project rules)
   - Mark R12 as done
   - Update parking lot items gated on R12

6. **Evolution log** (block: before PR, per project rules)
   - Create `docs/evolution/0037-per-tenant-api-keys/` directory
   - Write `prompt.md` before implementation begins
   - Write `decisions.md` during implementation
   - Write `outcome.md` after implementation
   - Write `process.md` after PR creation
   - Update `docs/evolution/README.md` index

---

## Proposed Tasks

### Task 1: OpenAPI spec -- admin endpoints and auth scheme
**Effort:** M
**Dependencies:** API design decisions finalized (from prompt.md, they are)
**Deliverable:** Updated `openapi.yaml` with version 0.5.0, new `adminAuth` scheme, `admin` tag, three admin endpoints with full request/response schemas and examples, updated `bearerAuth` description, new `Problem403` response component

### Task 2: OPERATIONS.md -- migration runbook and secret surface updates
**Effort:** M
**Dependencies:** Task 1 (endpoint paths and secret names must be final)
**Deliverable:** New "Multi-Tenant Key Migration" section with phased runbook, updated Secret Surfaces table, updated Manual Deploy section, updated GitHub environment tables

### Task 3: README.md -- auth model and setup flow updates
**Effort:** S
**Dependencies:** Task 1 (version and endpoint names)
**Deliverable:** Updated setup instructions reflecting `ADMIN_KEY`, updated usage section, updated roadmap

### Task 4: SECURITY.md and backlog.md updates
**Effort:** XS
**Dependencies:** None
**Deliverable:** Two new security scope items, R12 marked done in backlog

### Task 5: Evolution log structure
**Effort:** XS (structure only; content written during implementation)
**Dependencies:** None
**Deliverable:** Directory and `prompt.md` created

---

## Risks and Concerns

### Risk 1: OpenAPI spec size explosion
The current `openapi.yaml` is already ~1800 lines. Adding three endpoints with full request/response definitions, error responses, and examples could push it past 2200 lines. **Mitigation:** Aggressively reuse `$ref` for shared response components (the existing `Problem4xx` pattern is good). Consider whether the admin endpoints need CORS headers (they probably do not, since admin operations are server-to-server only, which saves boilerplate).

### Risk 2: Migration runbook becomes stale
The runbook will include specific `wrangler` commands and API calls. If the admin endpoint design changes during implementation, the runbook must update in lockstep. **Mitigation:** Write the runbook after the admin API implementation is stable, not before. Include it in the same PR so review catches discrepancies.

### Risk 3: README setup step numbering
The README uses numbered steps (1-9). Inserting a new step for `ADMIN_KEY` between steps 4 and 5 will require renumbering all subsequent steps and updating any cross-references to those steps (OPERATIONS.md references "README steps 4-7" multiple times). **Mitigation:** Search for all cross-references before renumbering. Consider whether `ADMIN_KEY` can be added after step 7 (alongside other secrets) rather than disrupting the existing numbering. The README cross-references in OPERATIONS.md use anchor-based links (`README.md#4-configure-capture-api-key`) which will break on renumber.

### Risk 4: Dual-mode auth explanation complexity
The README must explain that `CAPTURE_API_KEY` still works but is legacy, while new tenant keys are the intended path. This is a nuanced message for a README audience that expects simplicity. **Mitigation:** Keep the README simple -- the existing CAPTURE_API_KEY step stays as-is with a note that it is optional when using per-tenant keys. The migration runbook in OPERATIONS.md carries the detailed transition narrative. The README should not explain the dual-mode fallback in depth.

### Risk 5: 403 response is new to the API
The current API only returns 401 (no auth) and never 403 (insufficient scope). Adding 403 changes the error surface for existing clients. **Mitigation:** Document 403 clearly in the OpenAPI spec with examples showing which scope is required. Existing clients using `capture`-scoped keys will never see 403 on endpoints they already use, only on admin endpoints they were not calling before. This is strictly additive.

---

## Additional Agents Needed

**No additional specialist agents are needed for the documentation work.** The five planning questions are fully within software-docs-minion scope. However:

- **api-design-minion** should validate the OpenAPI spec changes (especially the schema design for admin key responses and the `adminAuth` vs `bearerAuth` separation) before the spec is finalized. The prompt says API design decisions are already resolved via advisory, but the OpenAPI schema details (field names, nullable handling, example values) benefit from api-design review.

- **security-minion** should review the migration runbook for operational security gaps (e.g., whether the ADMIN_KEY generation method is specified, whether there are timing windows where both auth paths are active and that is acceptable, whether the rollback path has security implications). This is validation, not new work.

- **iac-minion** should confirm whether `ADMIN_RATE_LIMITER` binding needs documentation in `wrangler.toml` comments or OPERATIONS.md (it is a new Cloudflare Rate Limiting binding that the prompt specifies but existing docs do not reference).
