---
task: "Per-tenant API keys and tenant isolation"
source-issue: 42
date: 2026-03-17
mode: execution
task-count: 6
gate-count: 1
agents: security-minion, data-minion, edge-minion, software-docs-minion, test-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo, observability-minion, user-docs-minion
compaction-events: 2
---

## Summary

Implemented per-tenant API key authentication for WRL. Replaced single static `CAPTURE_API_KEY` with KV-based key lookup (`apikey:{sha256hex}`), added admin API (POST/GET/DELETE `/v1/admin/keys`), enforced per-tenant capture isolation via scope checking (`capture`/`read`/`admin`), and added a three-phase migration runbook. Dual-mode legacy fallback preserves backward compatibility. 575 tests pass (65 new). OpenAPI bumped to 0.5.0.

Resolves #42

## Original Prompt

A second operator can use WRL with their own API key. Captures are isolated by tenant. Key compromise affects only one tenant. The single static key becomes the first tenant's key — no breaking change to existing clients. Design decisions pre-resolved by nefario advisory (2026-03-17): admin key is separate infrastructure credential, three-scope model, server-generated 256-bit keys with `wrl_live_` prefix, soft-delete revocation, dedicated admin rate limiter.

## Key Design Decisions

1. **Separate `verifyAdminKey` / `verifyApiKey` functions** — Structural separation prevents any tenant or legacy key from ever granting admin access. Security-minion's strongest recommendation.

2. **Misconfiguration guard uses binding-presence check** — `!env.KV && !env.CAPTURE_API_KEY` rather than KV content scan. Avoids KV read on every failed auth and false 503 on fresh deploy with empty KV. Per security-minion Phase 3.5 advisory.

3. **KV errors fail loudly (500), never fall through to legacy** — A KV I/O failure returns `reason: 'kv_error'` immediately. Silent degradation to legacy auth would mask infrastructure problems. Per CLAUDE.md fail-loudly convention and observability-minion advisory.

4. **Revoked keys hard-rejected, no legacy fallthrough** — A revoked key returns 401 identical to not-found. Critical security invariant: revoking a KV key must not accidentally restore access via the legacy `CAPTURE_API_KEY` path.

5. **No pagination on admin key list** — Full array returned. At single-digit key counts, cursor/limit machinery adds ~30 lines, 2 schemas, and tests for no value. Per margo YAGNI advisory.

6. **Log enrichment in handler, not capture pipeline** — `keyName`/`authMethod` logged where auth succeeds (index.js handlers), not threaded through `performCapture()` signature. Decouples auth concerns from capture pipeline. Per margo advisory.

7. **Exclude revoked keys from GET by default** — `?include=revoked` opts in. Primary use case is "show active keys." Per api-design-minion, matching Stripe's pattern.

8. **`status` field supplemented, not replaced** — Auth failure events keep existing `status` field and add `reason`. Avoids breaking Coralogix queries during migration. Per observability-minion advisory.

## Phases

### Phase 1: Meta-Plan
Initial team of 8 specialists. User added gru (technology landscape validation), lucy (intent alignment), and devx-minion (admin API curl ergonomics). Full Phase 1 re-run with 11 specialists. Planning questions designed as coherent set covering security, API design, data model, observability, edge config, testing, UX, docs, technology validation, governance, and developer experience.

### Phase 2: Specialist Planning (11 agents)
All 11 specialists contributed in parallel. Key consensus: custom KV auth is correct (gru confirmed no Cloudflare-native replacement), `wrl_live_` prefix is industry standard, no KV caching needed (built-in 60s edge cache), miniflare real KV for all tests. One conflict: revoked key visibility in GET (api-design vs devx-minion). Lucy flagged the R12 gating condition ("do not build until second user is real or imminent") for user confirmation.

### Phase 3: Synthesis
Consolidated into 6 tasks with 1 approval gate. Resolved 6 conflicts (revoked key visibility, name uniqueness, effective vs requested scopes, gating condition surfacing, warning field inclusion, `wrl_test_` prefix deferral). Execution in 3 batches.

### Phase 3.5: Architecture Review (7 reviewers)
5 mandatory + 2 discretionary (observability-minion, user-docs-minion). Result: 1 APPROVE (ux-strategy), 6 ADVISE, 0 BLOCK. 18 advisory items incorporated: misconfiguration guard approach, KV error handling, `status` field preservation, pagination removal, log enrichment scope, cross-tenant isolation test, KV error path test, staging-first runbook step, verification commands.

### Phase 4: Execution

**Batch 1** (parallel): Tasks 1, 2, 6
- Task 1 (auth module): security-minion rewrote `src/auth.js` with `hashApiKey`, `hasScope`, `verifyApiKey`, `verifyAdminKey`. All 510 existing tests passed. **GATE approved.**
- Task 2 (KV data layer): data-minion added 4 CRUD functions and prefix registry to `src/kv.js`.
- Task 6 (evolution log): software-docs-minion created phase 0037 structure.

**Batch 2**: Task 3
- Task 3 (admin API): edge-minion created `src/admin.js` with 3 handlers, wired routes/auth/rate-limiter in `src/index.js`, added scope enforcement on existing endpoints, enriched log events.

**Batch 3** (parallel): Tasks 4, 5
- Task 4 (tests): test-minion wrote 65 new tests across 3 files. 575/575 pass. Round-trip lifecycle test validates create→capture→revoke→401 flow.
- Task 5 (docs): software-docs-minion updated OpenAPI (v0.5.0), OPERATIONS.md (migration runbook), README, SECURITY.md, backlog.

### Phase 5-8: Verification
All 575 tests pass. Documentation assessment found 0 debt items — all outcomes covered by Task 5.

## Verification

Verification: all checks passed (575 tests, docs complete).

## Test Plan

- [x] KV-based key lookup with scope enforcement (test/auth.test.js)
- [x] Dual-mode legacy fallback preserves backward compatibility (test/auth.test.js)
- [x] Revoked keys do not fall through to legacy (test/auth.test.js)
- [x] Admin auth is structurally separate (test/auth.test.js)
- [x] Admin API CRUD endpoints (test/admin-keys.test.js)
- [x] Round-trip lifecycle: create → capture → revoke → 401 (test/admin-keys.test.js)
- [x] Cross-tenant isolation (test/admin-keys.test.js)
- [x] KV CRUD functions (test/kv.test.js)
- [x] Admin rate limiting independent from capture (test/admin-keys.test.js)
- [x] Scope enforcement on existing endpoints (test/admin-keys.test.js)

## Agent Contributions

### Planning (Phase 2)

| Agent | Key Contribution |
|-------|-----------------|
| security-minion | Auth resolution order, dual-mode fallback security, deployment ordering, KV injection analysis |
| api-design-minion | Admin API contracts (POST/GET/DELETE), scope implication model, idempotent DELETE |
| data-minion | KV schema for key records, no secondary index, no TTL, existing captures need no migration |
| observability-minion | 14 events need enrichment, 6 reason values, authMethod field for migration tracking |
| edge-minion | Namespace IDs 1004/2004, no CORS, Cache-Control: private no-store, admin rate limit group |
| test-minion | Never mock KV (use miniflare), round-trip lifecycle test, shared hash helper |
| ux-strategy-minion | Implicit tenant creation, idempotent DELETE, 3-phase runbook, natural-language 403 |
| software-docs-minion | Version 0.5.0, separate adminAuth scheme, runbook structure, TERMS.md unchanged |
| gru | Custom KV auth confirmed correct, no Cloudflare-native replacement, wrl_live_ prefix validated |
| lucy | Gating condition flagged, evolution log 0037 confirmed, 4 CLAUDE.md conventions load-bearing |
| devx-minion | Curl workflow ergonomics, one-time key display UX, keyHash in responses, error catalog |

### Review (Phase 3.5)

| Reviewer | Verdict | Key Finding |
|----------|---------|-------------|
| security-minion | ADVISE | Misconfiguration guard should use binding-presence check, not KV content scan |
| test-minion | ADVISE | Cross-tenant isolation test needed; KV error path test needed |
| ux-strategy-minion | APPROVE | Journey coherent, cognitive load well-managed |
| lucy | ADVISE | Task 3 breadth is wide; outcome.md/process.md must be created post-implementation |
| margo | ADVISE | Drop pagination; log in handler not capture pipeline; check OpenAPI version |
| observability-minion | ADVISE | Supplement status field; add kv_error reason; idempotent flag on revoke event |
| user-docs-minion | ADVISE | Staging-first explicit step; 60s revocation in README; Phase 1 verification command |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration of 6 tasks across 11 planning specialists, 7 reviewers, and 5 execution agents

</details>

<details>
<summary>Compaction Events</summary>

2 compaction events during session (after Phase 3 and Phase 3.5).

</details>

## Working Files

All working files are in the companion directory:
[`docs/history/nefario-reports/2026-03-17-110731-per-tenant-api-keys-isolation/`](./2026-03-17-110731-per-tenant-api-keys-isolation/)

46 files including:
- Phase 1: meta-plan (original + re-run after team adjustment)
- Phase 2: 11 specialist contributions with prompts
- Phase 3: synthesis with full delegation plan
- Phase 3.5: 7 reviewer verdicts with prompts
- Phase 4: execution agent prompts
- Original prompt
