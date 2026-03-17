# Lucy: Intent Alignment and Convention Compliance Review

## Verdict: ADVISE

The proposed scope is well-aligned with the issue description and success
criteria. One procedural issue (gating condition) requires explicit human
acknowledgment. Several CLAUDE.md conventions need to be baked into agent
prompts before implementation. No significant drift detected, but specific
findings below.

---

## Finding 1: Gating Condition Not Explicitly Cleared

**Severity**: SCOPE
**Element**: R12 constraint in `docs/backlog.md` line 39: "gated on multi-user decision -- do not build until a second user is real or imminent"
**Issue**: The backlog and issue both state R12 should not be built until a second user is real or imminent. The user initiated this orchestration (including an advisory that produced design decisions), which implies intent to build. However, there is no explicit statement in the scratch files or prompts that the gating condition has been satisfied (e.g., "a second user is imminent" or "I am choosing to build this now despite the gate").
**Risk**: If the gate was not consciously lifted, this entire orchestration is premature. The YAGNI principle in CLAUDE.md reinforces this: "don't build it until you need it."
**Recommendation**: The synthesis phase or the first human approval gate must include an explicit confirmation: "The multi-user gating condition on R12 is satisfied because [reason]." If the user cannot state the reason, defer implementation. This is not a blocker to *planning* -- planning ahead of the gate is fine -- but it must be resolved before any code is written.

## Finding 2: Evolution Log Phase Number

**Severity**: CONVENTION
**Element**: Metaplan line 437: "Evolution log entry (phase number TBD -- lucy to verify)"
**Verified**: The current `docs/evolution/README.md` lists phases 0001 through 0036 (0036-fail-loudly-2 is the last entry). The next phase is **0037**. The metaplan should use `0037-per-tenant-api-keys` (or similar short name).
**Recommendation**: Lock the phase number as 0037. Create `docs/evolution/0037-per-tenant-api-keys/prompt.md` at the start of implementation per CLAUDE.md rule 1.

## Finding 3: Scope Alignment -- Traceability Matrix

The issue's success criteria map cleanly to the proposed scope. No orphaned tasks. No unaddressed requirements.

| Success Criterion (from issue) | Plan Element | Status |
|------|------|--------|
| KV-based key lookup (`apikey:{sha256}` -> `{tenantId, scopes}`) | Auth module rewrite, KV schema for key records | COVERED |
| Per-tenant capture isolation | Existing `tenant:` secondary index + list endpoint already tenant-scoped | COVERED (existing, no new work needed) |
| Read/write key scoping (capture vs read-only) | Scope model: `capture`, `read`, `admin` with `capture implies read` | COVERED |
| Key provisioning via admin API | `POST/GET/DELETE /v1/admin/keys` | COVERED |
| Migration path for existing captures | Dual-mode fallback for `CAPTURE_API_KEY`, migration runbook | COVERED |
| v1 API contract unbroken | Legacy key works as `default` tenant during migration | COVERED |
| Per-IP rate limiting retained | Plan retains existing per-IP rate limiters, adds admin-specific limiter | COVERED |

**Note on "tenant tagging in KV records" (issue In-scope)**: The issue lists "tenant tagging in KV records" as in-scope. The codebase already tags captures with `tenantId` (see `src/kv.js` `createCapture()` line 68: `tenantId` is stored in every capture record since R8). No migration of existing capture records is needed -- they already have `tenantId: 'default'`. The plan correctly identifies this ("tagged to 'default' tenant via R8"). Verify during implementation that no additional capture-record changes are needed.

**Note on "capture migration" (issue In-scope)**: Same observation. Existing captures already have `tenantId: 'default'` and secondary index keys `tenant:default:ts:...`. No data migration is required unless the implementation changes the KV schema in a way that breaks compatibility. The plan should explicitly state "no capture data migration needed" to avoid unnecessary work.

## Finding 4: R13 Boundary -- Observability vs. Audit Logging

**Severity**: SCOPE
**Element**: Metaplan Consultation 4 (observability-minion) proposes `admin.key_create` and `admin.key_revoke` log events; issue advisory specifies "enrich existing events with `keyName`/`reason`, new `admin` subsystem for key_create/key_revoke"
**Analysis**: The boundary between "observability enrichment" (R12) and "audit logging" (R13) matters. R13 in the backlog is defined as "full audit trail" (issue #43). The proposed observability work is:
- Enriching existing log events with `keyName` and `reason` fields -- this is **R12 scope** (operational observability for the new auth model)
- Adding `admin.key_create` and `admin.key_revoke` events -- this is **borderline** but acceptable as R12 scope because these are operational events for the admin API, not a systematic audit trail

**What would cross into R13**: A structured audit log with guaranteed delivery, retention policies, tamper-evident storage, or coverage of all API operations (not just admin). The proposed scope does not include any of these.
**Recommendation**: The implementation should use the existing `log()` function (fire-and-forget Coralogix) for `admin.key_create`/`admin.key_revoke`. If any agent proposes guaranteed delivery, a separate audit log table, or event coverage beyond admin operations, flag it as R13 scope creep.

## Finding 5: CLAUDE.md Conventions That Must Be Enforced in Agent Prompts

**Severity**: COMPLIANCE
**Element**: CLAUDE.md Engineering Philosophy section
**Issue**: The metaplan's agent consultation prompts reference CLAUDE.md conventions in some places but do not systematically require compliance. The following conventions are directly load-bearing for R12 implementation and must be explicitly called out in the execution plan:

### 5a. "Fail loudly, degrade intentionally" (CLAUDE.md line 99-104)
**Applies to**: Auth module error handling, admin API error handling, dual-mode fallback.
**Specific risk**: The dual-mode fallback (legacy `CAPTURE_API_KEY` + KV-based lookup) could silently fall through to legacy auth without logging, making migration status unobservable.
**Required**: Every auth path (KV lookup failure, KV miss, revoked key, scope insufficient, legacy fallback used) must either log the outcome or return a distinguishable error. No catch block should swallow errors without logging. The `reason` field in log events must distinguish between "key not found in KV" and "KV lookup failed (service error)" -- per the engineering philosophy, "the system must distinguish 'service unavailable' from 'misconfigured'".

### 5b. "Latency is not an option" (CLAUDE.md line 94)
**Applies to**: KV-based key lookup on every authenticated request.
**Specific constraint**: The advisory says 10-40ms KV latency is acceptable within the 300ms budget. This is fine for auth-only overhead. But the auth check now involves a SHA-256 hash computation + KV get, vs. the current in-memory string comparison. The implementation must not add serial operations that compound with the existing capture pipeline latency. Verify that the SHA-256 computation uses `crypto.subtle.digest` (async but hardware-accelerated on Workers) and that no additional KV operations are added to the auth hot path.

### 5c. "Test the real boundaries" (CLAUDE.md line 105-111)
**Applies to**: test-minion's test strategy (Consultation 6).
**Specific constraint**: The engineering philosophy says "mocking out the browser is like testing an HTTP server without sending requests." For auth, KV is the external boundary. Unit tests with a mocked KV for scope/fallback logic are acceptable (per the philosophy: "unit tests with mocked renderers are fine for orchestration logic"). But the test suite must include at least one integration test that exercises the auth-to-capture flow with real KV-based keys via the deployed Worker or wrangler dev. test-minion's consultation should produce a plan that includes this.

### 5d. Evolution log structure (CLAUDE.md lines 29-81)
**Applies to**: All implementation phases.
**Required deliverables**:
- `docs/evolution/0037-per-tenant-api-keys/prompt.md` -- before implementation starts
- `docs/evolution/0037-per-tenant-api-keys/decisions.md` -- during implementation
- `docs/evolution/0037-per-tenant-api-keys/outcome.md` -- after implementation
- `docs/evolution/0037-per-tenant-api-keys/process.md` -- after PR creation
- Update `docs/evolution/README.md` with 0037 entry
- Update `docs/backlog.md` -- mark R12 done, update parking lot items that depend on R12 (per-tenant rate limiting, API key rotation without downtime)

## Finding 6: Prerequisite Dependencies Verified

**Severity**: TRACE
**Element**: R12 constraints: "R1 (list endpoint) and R8 (auth identity enrichment) must ship first"
**Verified**: Both R1 and R8 are marked DONE in `docs/backlog.md` (lines 22-23). The code confirms this: `src/auth.js` returns `tenantId: 'default'`, `src/kv.js` stores `tenantId` in capture records, and `src/index.js` has a functional `handleListCaptures` handler with tenant-scoped listing. Prerequisites are satisfied.

## Finding 7: Consultation Count Proportionality

**Severity**: SCOPE
**Element**: Metaplan proposes 11 specialist consultations for planning.
**Assessment**: The issue describes a focused auth rewrite with known design decisions (pre-resolved by advisory). Eleven consultations is high for a task where the design is already decided. However, I note that the user explicitly requested adding gru, lucy, and devx-minion (per `phase1-metaplan-rerun-prompt.md` line 86), bringing the count from 8 to 11. The original 8 were generated by nefario.

**Analysis of each consultation's value-add**:
- security-minion, api-design-minion, data-minion, test-minion: **Essential** -- these are the core implementation domains.
- observability-minion, edge-minion: **Justified** -- advisory explicitly requires both logging enrichment and rate limiter configuration.
- ux-strategy-minion, software-docs-minion: **Justified** -- per mandatory cross-cutting checklist.
- gru: **Justified** -- one-time platform check before building custom auth (user added).
- lucy: **Justified** -- this review (user added).
- devx-minion: **Marginal** -- the admin API's curl ergonomics overlap significantly with api-design-minion and ux-strategy-minion. Three agents (api-design, ux-strategy, devx) addressing aspects of the same three endpoints is a lot of input to synthesize for diminishing returns.

**Recommendation**: No agents should be removed (user added them deliberately), but the synthesis phase should be aware that api-design-minion, ux-strategy-minion, and devx-minion will produce overlapping recommendations on admin API ergonomics. The synthesis should deduplicate rather than aggregate.

---

## Recommendations

1. **MUST**: Obtain explicit human confirmation that the R12 gating condition is satisfied before writing code. Planning can proceed; implementation must not.

2. **MUST**: Use phase number 0037 for the evolution log. Create `docs/evolution/0037-per-tenant-api-keys/prompt.md` as the first implementation action.

3. **MUST**: Bake CLAUDE.md conventions (5a-5d above) into the execution plan as explicit acceptance criteria, not just references. Specifically:
   - Every catch block in new auth code must log or handle a named error type.
   - Auth `reason` field must distinguish service error from key-not-found from key-revoked from scope-insufficient from legacy-fallback.
   - At least one integration test exercises real KV auth flow end-to-end.
   - All four evolution log files produced.
   - `docs/backlog.md` updated to reflect R12 completion and dependent parking lot items.

4. **SHOULD**: Explicitly state in the plan that no capture data migration is needed (existing records already have `tenantId: 'default'` from R8). This prevents agents from proposing migration scripts for data that is already correctly tagged.

5. **SHOULD**: Draw a clear line between R12 observability (fire-and-forget log events via existing `log()` function) and R13 audit logging (guaranteed delivery, full coverage). Any agent that proposes audit-grade logging should be redirected to R13.

---

## Proposed Tasks

Lucy does not propose implementation tasks (that is nefario's domain). The recommendations above are constraints that should be applied to whatever task breakdown the synthesis produces.

---

## Risks and Concerns

| Risk | Severity | Mitigation |
|------|----------|------------|
| R12 gating condition not actually satisfied -- building speculative multi-tenant auth | High | Explicit human confirmation at first approval gate |
| Observability enrichment creeps into R13 audit logging territory | Medium | Define boundary: `log()` fire-and-forget = R12; guaranteed/complete = R13 |
| Three agents (api-design, ux-strategy, devx) produce contradictory admin API recommendations | Medium | Synthesis must deduplicate; api-design-minion's contract takes precedence on schema, ux-strategy on operator journey, devx on curl ergonomics |
| Dual-mode fallback introduces a silent auth path that masks migration status | Medium | Require `security.legacy_auth_used` log event on every legacy fallback hit |
| Auth KV lookup adds latency to every authenticated request | Low | Acceptable per advisory (10-40ms); verify no serial KV calls in auth hot path |

---

## Additional Agents Needed

None beyond the current 11. The coverage is thorough (arguably more than necessary -- see Finding 7). margo will review during Phase 3.5 per the standard governance flow.
