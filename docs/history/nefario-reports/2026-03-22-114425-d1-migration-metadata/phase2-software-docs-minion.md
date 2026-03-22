# Domain Plan Contribution: software-docs-minion

## Recommendations

### Assessment of current documentation state

I read every documentation artifact in the project. Here is exactly what mentions KV, what describes the list/pagination API, and what needs changing:

**Documents that reference KV as a metadata store (must update):**

1. **README.md** -- Setup section "Create KV namespace" (step 2, lines 137-141) describes creating `wrl-kv`. The staging section (lines 309-317) describes creating staging KV. The "Finding and sharing captures" section (lines 89-117) documents cursor-based pagination with `cursor`, `limit`, and `status` params. All of these change.
2. **OPERATIONS.md** -- "Multi-Tenant Key Migration" section (lines 165-253) is entirely about KV-based key management. The "Secret Surfaces" section (line 155) mentions "fallback when KV key not found". The "Cloudflare API Token Permissions" section (line 260) lists "Workers KV Storage > Edit".
3. **openapi.yaml** -- The `GET /v1/captures` endpoint (around line 1149) documents cursor-based pagination with `cursor`/`limit`/`status` params. The `Pagination` schema (line 602) defines cursor-based pagination. The 500 error example (line 1289) says "KV storage read failed". The version is `0.5.0` and needs a bump.
4. **CONTRIBUTING.md** -- Line 13 says "The test suite is fully self-contained via Miniflare's simulated Workers runtime." This remains true but now needs D1 bindings instead of KV mocks, which is a meaningful change for contributors.
5. **docs/audit-log-schema.md** -- Lines 29-31 list events `capture.list_fail` ("List captures KV error"), `capture.kv_create_fail`, and `capture.kv_fail`. Line 80 describes severity 5 as "KV errors". These event names and descriptions need updating.
6. **docs/backlog.md** -- Multiple references to KV-based storage (lines 39, 63, 101, 113, 157, 185, 201, 202). Backlog items about D1 and pagination filtering need status updates.
7. **docs/mcp.md** -- The `list_captures` tool (line 131) documents `cursor` pagination param. This changes to offset/limit.
8. **wrangler.toml** -- Not a doc artifact per se, but the KV namespace bindings and the absence of D1 bindings are the source of truth for infrastructure config. Must add `[[d1_databases]]` and eventually remove the KV metadata namespace (keeping it for rate limit counters).

**Documents that do NOT need changes:**

- `docs/operations/alerts.md` and `docs/operations/runbooks/*.md` -- These reference Coralogix queries by event name, not storage backend. If event names change (e.g., `capture.kv_fail` becomes `capture.db_fail`), these might need updating, but that depends on whether the implementation changes the event names.
- `docs/evolution/` phases -- Historical; never edited. The new phase (0047) will document the D1 decisions.
- `TERMS.md`, `CONTENT-POLICY.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` -- No storage references.

### What does NOT exist but should

1. **No ARCHITECTURE.md exists.** The project has no standalone architecture document. Architecture is currently spread across the README (data flow), OPERATIONS.md (infrastructure), and evolution logs (decisions). I recommend **not** creating one for this phase -- the project is small enough that the README and OPERATIONS.md cover it. Creating an ARCHITECTURE.md now would add a maintenance burden with no clear consumer. If the project grows past a handful of contributors, revisit.

2. **No migration runbook exists.** The D1 migration needs a runbook in `docs/operations/runbooks/`. The one-time KV-to-D1 data migration script is an operational task that someone (Ben) will execute against staging and then production. A runbook ensures it is done correctly and is repeatable if something goes wrong.

3. **No D1 management section in OPERATIONS.md.** After migration, operators need to know how to inspect D1 state, run schema migrations, and handle D1-specific issues. This is analogous to the existing "Multi-Tenant Key Migration" section but for D1.

### Documentation priority and sequencing

The documentation updates split into two categories:

**Must ship with the code PR (blocking):**
- openapi.yaml changes (new pagination params, new query params, schema updates)
- README.md setup section updates (D1 creation replaces KV creation)
- CONTRIBUTING.md test infrastructure note
- wrangler.toml D1 bindings (source of truth)

**Must ship before migration execution (blocking for ops):**
- Migration runbook in `docs/operations/runbooks/d1-migration.md`
- OPERATIONS.md D1 management section

**Should ship with the code PR (non-blocking but strongly recommended):**
- docs/audit-log-schema.md event name updates
- docs/backlog.md status updates
- docs/mcp.md pagination param updates
- docs/evolution/0047-d1-migration-metadata/ decisions.md and outcome.md

**Can ship after (cleanup):**
- OPERATIONS.md retirement of "Multi-Tenant Key Migration" KV section (mark as historical)

## Proposed Tasks

### Task 1: Update openapi.yaml for D1-backed list endpoint

**What changes:**
- `GET /v1/captures` parameters: replace `cursor` with `offset` (integer, default 0) and keep `limit`. Add `url` filter (string, substring match or exact), `from`/`to` date range filters (ISO 8601), `sort` parameter (e.g., `created_at:asc`, `created_at:desc`).
- `Pagination` schema: replace cursor-based model with offset-based model. New fields: `offset`, `limit`, `total`, `hasMore`. Remove `cursor`.
- Response examples: update all examples to use new pagination shape.
- Remove `kvError` example (line 1289) or rename to generic storage error.
- Bump version from `0.5.0` to `0.6.0` (new query capabilities are a minor version bump).
- Update `GET /v1/admin/keys` if its pagination also changes.

**Dependencies:** Depends on api-design-minion finalizing the exact query parameter contract. The OpenAPI spec is the contract -- it should be written before the implementation.

**Size:** M (the OpenAPI file is large and has many cross-references)

### Task 2: Update README.md setup and usage sections

**What changes:**
- Step 2 "Create KV namespace": Replace with "Create D1 database" instructions (`wrangler d1 create wrl-metadata` or similar). Keep KV creation for rate limit counters if KV is still needed.
- Staging section: Update D1 database creation for staging.
- "Finding and sharing captures" section: Update example response to show offset-based pagination. Update query parameter documentation to include new filters and sorting.
- Prerequisites: Add D1 to the list (or note it is included with Workers).
- If KV namespace is fully removed for metadata: remove the KV creation step entirely and add a note that KV is only used internally for rate limiting (no setup needed since the rate limiter binding is declarative in wrangler.toml).

**Dependencies:** Final wrangler.toml config (D1 database name and binding name)

**Size:** S

### Task 3: Write D1 migration runbook

**File:** `docs/operations/runbooks/d1-migration.md`

**What it covers:**
- Pre-migration checklist (verify D1 database exists in both staging and production, verify schema is applied, verify backup strategy)
- Step-by-step execution of the migration script against staging
- Verification queries against D1 to confirm data integrity (row counts, spot checks)
- Smoke test against staging after migration
- Repeat for production
- Post-migration: verify KV metadata is no longer being written (check Coralogix for any KV-related events)
- Rollback procedure: since there are no external users, rollback is "revert the code, KV data is still there"

**Dependencies:** The migration script must exist before the runbook can be finalized.

**Size:** S

### Task 4: Update OPERATIONS.md with D1 management section

**What changes:**
- Add "D1 Database Management" section covering: how to inspect tables (`wrangler d1 execute`), how to apply schema migrations, how to check database size/row counts, how to export data.
- Update "Cloudflare API Token Permissions" to add D1 permissions and note whether KV Storage permission can be removed.
- Mark "Multi-Tenant Key Migration" section as historical (the migration was from legacy static key to KV; now KV is itself being replaced, but the section documents a completed process -- it should stay as-is with a note that key storage has moved to D1).
- Update secret surfaces table if D1 introduces any new secrets (unlikely -- D1 uses binding-based auth, not secret keys).

**Dependencies:** Final D1 binding config, migration script path

**Size:** S

### Task 5: Update docs/audit-log-schema.md

**What changes:**
- Rename events if implementation changes them: `capture.list_fail` description from "List captures KV error" to "List captures database error" (or whatever the new event name is). Same for `capture.kv_create_fail` and `capture.kv_fail`.
- Update severity mapping description: change "KV errors" to "Database errors" or "Storage errors".
- If event names change (e.g., `capture.kv_fail` -> `capture.db_fail`), document both old and new names with a note about when the change occurred, so existing Coralogix queries can be updated.

**Dependencies:** Must be done after the implementation is finalized so event names are accurate.

**Size:** XS

### Task 6: Update docs/mcp.md

**What changes:**
- `list_captures` tool parameters: replace `cursor` with `offset` (or add new filter/sort params if exposed via MCP). Update parameter table and examples.
- If MCP tool gains new filter capabilities (URL filter, date range, sort), document them.

**Dependencies:** MCP adapter implementation must be updated first.

**Size:** XS

### Task 7: Update docs/backlog.md

**What changes:**
- Move D1 item from Storage parking lot to Done: `[consider] D1 (edge SQLite)` (line 113)
- Move pagination filtering and sorting from API Enhancements parking lot to Done: `[consider] Pagination filtering and sorting` (line 101)
- Update Done section with D1 migration entry
- Review if any other items are unblocked by D1 (e.g., items that assumed KV limitations)

**Dependencies:** After implementation is complete.

**Size:** XS

### Task 8: Update CONTRIBUTING.md test infrastructure note

**What changes:**
- Line 13 mentions "Miniflare's simulated Workers runtime" -- this is still true but should note that D1 bindings are used (Miniflare supports D1 simulation).
- If test setup changes (e.g., need to run migrations before tests), document that in the test section.
- If `isolatedStorage: false` behavior changes with D1, update the gotcha note.

**Dependencies:** After test infrastructure is migrated.

**Size:** XS

### Task 9: Evolution log entries (0047-d1-migration-metadata)

**What changes:**
- `decisions.md`: Document schema design choices, why offset pagination over cursor, why D1 over Turso/Neon/PlanetScale, index strategy, migration approach (one-time script vs. dual-write), KV retention for rate limiting.
- `outcome.md`: What was built, what changed, performance characteristics, any surprises.
- `process.md`: Per CLAUDE.md requirements, document the agent orchestration process.
- Update `docs/evolution/README.md` index with 0047 entry.

**Dependencies:** Written during and after the phase, per project rules.

**Size:** S (but mandatory per CLAUDE.md)

## Risks and Concerns

### Risk 1: OpenAPI spec divergence during implementation

The OpenAPI spec is the API contract. If the implementation builds new query params without updating the spec first, the spec and implementation will diverge. This is especially risky because the project has `npm run lint:api` in CI that validates the spec.

**Mitigation:** Update the OpenAPI spec *before* or *simultaneously with* the implementation. Design-first: agree on the new `GET /v1/captures` parameter contract in the spec, then implement to match.

### Risk 2: Audit log event name changes break existing Coralogix queries and alerts

The runbooks in `docs/operations/runbooks/` and the alert rules in `docs/operations/alerts.md` reference specific event names. If `capture.kv_fail` becomes `capture.db_fail`, existing alert rules configured in Coralogix will silently stop matching.

**Mitigation:** Either keep the same event names (rename the description but not the event string -- pragmatic), or update the Coralogix alert rules as part of the migration. Document the event name mapping in the migration runbook.

### Risk 3: MCP tool contract change is a breaking change for agents

The `list_captures` MCP tool currently accepts `cursor`. Changing to `offset` is a breaking change for any MCP client that has hardcoded `cursor` usage. Since the MCP server is relatively new and the tool descriptions guide agent behavior, this is low-risk but worth noting.

**Mitigation:** Accept the break -- the project is pre-1.0 with no external users. Document in the evolution log that this is a breaking change.

### Risk 4: README KV setup instructions break forks

Anyone who has forked WRL and follows the README will have KV namespaces they may or may not still need. The README update needs to be clear about what changes for existing operators.

**Mitigation:** Add a brief "Upgrading from KV" note in the README or link to the migration runbook. Since there are no external users yet (per the prompt), this is low-priority.

### Risk 5: Documentation updated but not the wrangler.toml

The `wrangler.toml` is the source of truth for Cloudflare bindings. If documentation says "create a D1 database" but `wrangler.toml` does not have the `[[d1_databases]]` binding, nothing works.

**Mitigation:** wrangler.toml changes must be in the same PR as the implementation. Documentation references the binding name from wrangler.toml -- don't invent names in docs before they exist in config.

## Additional Agents Needed

### api-design-minion (critical dependency)

The new query parameters for `GET /v1/captures` (offset/limit vs. cursor, filter syntax, sort syntax, date range format) are **API design decisions**, not documentation decisions. I can document whatever contract is agreed upon, but the contract itself needs api-design-minion input:

- Should pagination be offset-based or keyset-based? (Offset is simpler but has known issues with concurrent inserts; keyset is more robust but harder to implement)
- What filter syntax? Query params (`?url=example.com&status=complete`) or a filter query language?
- What sort syntax? (`?sort=created_at:desc` or `?sort=-created_at`?)
- Should `cursor` remain as an alias for backward compatibility?

### observability-minion (if event names change)

If audit log event names change (e.g., `capture.kv_fail` -> `capture.db_fail`), the Coralogix alerting rules need updating. The provisioning script in Phase 0046 likely hardcodes the old event names.

### iac-minion (for wrangler.toml and D1 provisioning)

D1 database creation, binding configuration in wrangler.toml, and staging/production environment setup are infrastructure tasks. The documentation follows the infrastructure -- not the other way around.
