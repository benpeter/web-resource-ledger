# Process: Per-Tenant API Keys and Tenant Isolation

## TL;DR

An 11-specialist nefario orchestration implemented per-tenant API key authentication for WRL in a single PR (#90). The task was pre-designed by a nefario advisory run that resolved the major architecture questions. This execution run focused on implementation details the advisory didn't specify: exact code structure, test strategy, migration sequencing, and observability enrichment. 6 tasks executed in 3 batches with 1 approval gate. 7 Phase 3.5 reviewers produced 18 advisory items, all incorporated. 575 tests pass. The human intervened at 5 approval gates (team, reviewers, plan, auth gate, PR) and added 3 specialists to the planning team.

## Specialists Consulted

### Phase 2: Planning (11 agents, parallel)

The initial meta-plan selected 8 specialists. The human added gru, lucy, and devx-minion before approving the team, triggering a full Phase 1 re-run with 11 planning consultations.

**security-minion** — Designed the auth resolution order and identified the 5 security-critical implementation details: dual-mode fallback scoping, timing-safe comparison approach, deployment ordering constraints, admin auth separation, and KV key pattern injection risks. Strongest contribution: the structural separation of `verifyAdminKey` and `verifyApiKey` as the primary defense against scope confusion.

**api-design-minion** — Designed the three admin endpoint contracts. Key positions: POST returns 201 with keyHash for DELETE convenience, GET excludes revoked by default, DELETE is idempotent returning 200. Introduced the `hasScope()` helper as the single enforcement point for `capture implies read`.

**data-minion** — Analyzed the KV schema and confirmed existing captures need no migration (already tagged `tenantId: 'default'` from R8). Recommended against secondary index for key listing (YAGNI at expected scale). Defined the `createdBy` identity model as simply `"admin"` for the initial implementation.

**observability-minion** — Audited all 28 `log()` call sites and identified 14 post-auth events needing `keyName` enrichment. Designed the `authMethod` field (`"kv"` / `"legacy"`) as the migration progress indicator. Defined 6 machine-parseable reason values for auth failures. Key insight: the auth result object should carry all observability fields so handlers don't re-derive context.

**edge-minion** — Specified wrangler.toml changes: namespace IDs 1004/2004 continuing the established pattern. Recommended no CORS on admin endpoints (security anti-pattern for infrastructure credentials). Designed the admin rate limit group and `Cache-Control: private, no-store` on all admin responses.

**test-minion** — Defined the testing philosophy: never mock KV (use real miniflare-backed KV everywhere). Designed the test structure: 4 describe blocks for auth, full CRUD + lifecycle for admin API. Key contribution: the round-trip lifecycle test (create→capture→revoke→401) as the highest-confidence assertion.

**ux-strategy-minion** — Designed the operator journey: three-endpoint admin API is the right abstraction, implicit tenant creation (no tenant management API), idempotent DELETE. Structured the migration runbook as three phases matching the operator's mental model ("can I deploy?", "how do I switch?", "when do I clean up?"). Recommended natural-language 403 messages naming both required and actual scope.

**software-docs-minion** — Mapped the documentation surface: OpenAPI 0.5.0, separate `adminAuth` scheme, OPERATIONS.md runbook, README updates. Confirmed TERMS.md doesn't need changes. Identified the evolution log phase number as 0037.

**gru** — Validated the technology choice: no Cloudflare-native auth primitive replaces the custom KV auth. Access Service Tokens and API Shield are perimeter-level ("should this request reach my Worker?"), not application-level tenant identity. Confirmed `wrl_live_` prefix is industry standard (Stripe pattern). Confirmed no KV caching needed (built-in 60s edge cache handles repeat lookups at <1ms). Dismissed Unkey as a build-vs-buy alternative.

**lucy** — Flagged the R12 gating condition ("do not build until a second user is real or imminent") for user confirmation. Verified evolution log numbering (0037). Confirmed scope alignment with all 7 success criteria. Identified 4 CLAUDE.md conventions as load-bearing for agent prompts: fail-loudly, 300ms latency budget, real-boundary testing, evolution log structure. Noted the devx/api-design/ux overlap for dedup in synthesis.

**devx-minion** — Focused on curl-based workflow ergonomics: one-time key display with `warning` field, keyHash in POST/GET responses for DELETE convenience, actionable error messages for each failure mode. Recommended against `X-Admin-Key` header (prevention should happen at auth module level, not header convention). Disagreed with api-design-minion on revoked key visibility (include by default vs exclude).

### Phase 3.5: Architecture Review (7 agents, parallel)

**security-minion** (ADVISE, 3 items) — Misconfiguration guard should use binding-presence check, not KV content scan. Unauthenticated `GET /v1/captures/{id}` is a gap post-multi-tenant. keyHash sensitivity level should be documented in OpenAPI.

**test-minion** (ADVISE, 3 items) — Cross-tenant isolation test needed (the core security property). KV error path test needed (only place where a spy is appropriate). KV cleanup between describe blocks underspecified.

**ux-strategy-minion** (APPROVE) — Journey coherent, cognitive load well-managed, prior advisory concerns resolved.

**lucy** (ADVISE, 2 items) — Task 3 breadth is wide (5 files, 3 concerns). outcome.md and process.md must be created post-implementation per CLAUDE.md precedence.

**margo** (ADVISE, 3 items) — Drop pagination on admin key list (YAGNI). Log auth details in handler, not capture pipeline. Read current OpenAPI version at execution time, don't hardcode.

**observability-minion** (ADVISE, 4 items) — Supplement `status` field, don't replace. Add `kv_error` reason value. Add `idempotent` flag on revoke events. Document auth.js dependency on log.js in the task prompt.

**user-docs-minion** (ADVISE, 3 items) — Staging-first must be a named step, not parenthetical. 60-second revocation window should be in README. Phase 1 verification needs a concrete curl command.

## Conflict Resolutions

### Revoked key visibility in GET (api-design vs devx)
- **api-design-minion**: Exclude revoked by default. Primary use case is "show active keys." Noise-free default.
- **devx-minion**: Include revoked by default. Single-digit key counts, complete view is more useful.
- **Resolution**: Exclude by default (api-design-minion). The opt-in `?include=revoked` is trivial. Operators auditing active access shouldn't need to filter. Matches Stripe's pattern.

### Name uniqueness (ux-strategy flagged)
- **ux-strategy-minion**: Enforcement creates key rotation friction.
- **devx-minion**: Enforce among active keys per tenant.
- **Resolution**: No uniqueness constraint. Names are labels, `keyHash` is the identifier. Avoids the rotation friction without losing anything.

### Effective vs requested scopes in POST response (api-design vs devx)
- **devx-minion**: Return effective scopes (expand `capture` to `['capture', 'read']`).
- **api-design-minion**: Return as-requested. Runtime enforcement via `hasScope()`.
- **Resolution**: Return as-requested. Keeps the contract simple. The implication rule lives in one place (`hasScope()`), not materialized in storage.

### Pagination on admin key list (synthesis vs margo)
- **Synthesis**: Included cursor-based pagination matching `GET /v1/captures`.
- **Margo**: YAGNI. Full array fetched into memory anyway. ~30 lines, 2 schemas, tests for no value.
- **Resolution**: Drop pagination. Return full array. Added parking lot item for secondary index at 500+ keys.

### Log enrichment location (synthesis vs margo)
- **Synthesis**: Thread `keyName`/`authMethod` through `performCapture()` signature.
- **Margo**: Couples auth concerns to capture pipeline. Log in handler.
- **Resolution**: Log in handler (margo). `src/capture.js` stays focused on captures.

### Auth failure event fields (synthesis vs observability)
- **Synthesis**: Replace `status` field with `reason`.
- **Observability-minion**: Supplement, don't replace. Breaking existing Coralogix queries during migration is the worst time.
- **Resolution**: Supplement. Both fields present.

## Human Interventions

### Team approval gate
The human added gru, lucy, and devx-minion to the planning team before approval. Rationale inferred: gru for technology validation (is custom auth the right call?), lucy for governance alignment, devx-minion for curl ergonomics on the admin API. This triggered a full Phase 1 re-run with 11 consultations.

### Reviewer approval gate
The human added user-docs-minion as a discretionary reviewer. The migration runbook is operator-facing documentation — user-docs-minion's domain. user-docs-minion produced 3 advisory items, all incorporated.

### Execution plan approval gate
Approved without changes. 18 advisories were pre-incorporated.

### Auth module gate (Task 1)
Approved without changes. The auth module matched the plan's specifications.

### Post-execution phases
Selected "Run all" (code review, tests, documentation).

### What the human chose NOT to intervene on
- The 6 conflict resolutions were accepted as synthesized.
- The gating condition ("do not build until second user is real or imminent") was not explicitly addressed during execution. Lucy flagged it; the plan surfaced it at the gate. The human approved without comment, implicitly accepting the implementation.
- Task 3's breadth (5 files, 3 concerns) was not split despite lucy's advisory. Accepted as a single task.

## Where to Read More

- Pre-implementation advisory: `docs/history/nefario-reports/2026-03-17-020022-per-tenant-api-keys-isolation.md`
- Execution report: `docs/history/nefario-reports/2026-03-17-110731-per-tenant-api-keys-isolation.md`
- Phase 2 specialist contributions: `docs/history/nefario-reports/2026-03-17-110731-per-tenant-api-keys-isolation/phase2-*.md`
- Phase 3.5 review verdicts: `docs/history/nefario-reports/2026-03-17-110731-per-tenant-api-keys-isolation/phase3.5-*.md`
- Synthesis (full delegation plan): `docs/history/nefario-reports/2026-03-17-110731-per-tenant-api-keys-isolation/phase3-synthesis.md`
- Issue context: GitHub Issue #42
