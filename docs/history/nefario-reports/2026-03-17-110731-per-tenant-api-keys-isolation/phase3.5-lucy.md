# Lucy Review: Per-Tenant API Keys and Tenant Isolation

## Verdict: ADVISE

The plan is well-aligned with the original request. All seven success criteria from the prompt trace to plan tasks. Scope is contained -- no R13 (audit logging) bleed. CLAUDE.md conventions are respected throughout. Six findings below, none blocking.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|-------------|--------|
| KV-based key lookup (`kv.get("apikey:{sha256}")`) | Task 1: `verifyApiKey` KV lookup, Task 2: `getApiKeyRecord` | COVERED |
| Per-tenant capture isolation | Task 3: scope enforcement on existing endpoints, `requiredScope` param | COVERED |
| Read/write key scoping | Task 1: `hasScope()` with capture-implies-read, Task 3: per-endpoint scope | COVERED |
| Key provisioning via admin API (POST/GET/DELETE) | Task 3: three admin handlers in `src/admin.js` | COVERED |
| Migration path for existing captures (tagged to "default" tenant via R8) | Task 3: dual-mode legacy fallback, Task 5: OPERATIONS.md migration runbook | COVERED |
| v1 API contract unbroken -- existing single key works as first tenant key | Task 1: legacy CAPTURE_API_KEY fallback with hardcoded `tenantId: 'default'` | COVERED |
| Per-IP rate limiting retained as secondary control alongside per-tenant | Task 3: existing IP-based rate limiting untouched, admin gets its own | COVERED |

No orphaned requirements. No unaddressed requirements.

---

## Drift Analysis

### No R13 (Audit Logging) Scope Creep -- CLEAN

The plan explicitly excludes audit-grade logging in Task 1 ("Do NOT add audit-grade logging (R13 scope)") and Task 5 ("Do NOT add audit logging documentation (R13 scope)"). The observability additions (enriching existing log events with `keyName`/`authMethod`, new `admin.key_create`/`admin.key_revoke` events) are operational logging, not audit logging. These are proportional to the feature being added. The distinction is correctly maintained.

### Scope Containment -- CLEAN

The prompt's "Out" list (OAuth, social signup, RBAC beyond read/write, admin web UI, billing, CLI tooling) is not present in the plan. The plan adds only what is in the prompt's "In" list. The "admin" scope in the scope model is a minor expansion beyond "read/write" but is explicitly documented in the prompt's Design Decisions section, so it traces to the request.

---

## CLAUDE.md Compliance Findings

### Finding 1: Fail-Loudly Convention

**Category**: COMPLIANCE
**Severity**: Minor (correct in spirit, verify in execution)
**SCOPE**: Task 1 auth module, Task 3 admin handlers
**CHANGE**: The plan prescribes enriched failure objects with `reason` fields distinguishing `key_not_found`, `key_revoked`, `scope_insufficient`, `missing_header`, `invalid_scheme`, `service_not_configured`. Admin handlers return distinct 400/401/403/404/415/429/503 codes with descriptive messages.
**WHY**: This is fully compliant with CLAUDE.md's "Fail loudly, degrade intentionally" and "distinguish 'service unavailable' from 'misconfigured'" directives. The misconfiguration guard (503 when `ADMIN_KEY` absent) vs auth failure (401) vs scope failure (403) is exactly the pattern CLAUDE.md demands.
**TASK**: No action needed. Noting compliance for the record. Implementation reviewers should verify no silent catch blocks are introduced.

### Finding 2: 300ms Latency Budget

**Category**: COMPLIANCE
**Severity**: Minor (correctly analyzed, verify assumption)
**SCOPE**: Task 1 `verifyApiKey` hot path
**CHANGE**: The plan adds one `env.KV.get()` call (10-40ms) plus one SHA-256 hash (sub-ms) to the auth hot path. No serial KV calls. No custom caching.
**WHY**: Well within the 300ms budget per CLAUDE.md. The plan explicitly cites this constraint and explains why custom caching is unnecessary. KV's built-in 60s edge cache handles repeated lookups.
**TASK**: No action needed. The latency analysis is sound.

### Finding 3: Real-Boundary Testing Convention

**Category**: COMPLIANCE
**Severity**: Minor (well-covered)
**SCOPE**: Task 4 test suite
**CHANGE**: All tests use real miniflare-backed KV. The round-trip lifecycle test (create key -> capture -> list -> revoke -> verify 401) exercises the full integration. No KV mocking.
**WHY**: CLAUDE.md mandates "integration tests must exercise the real external boundaries." KV is the critical external boundary for this feature. The plan's test strategy is fully compliant.
**TASK**: No action needed.

---

## Scope and Proportionality Findings

### Finding 4: Task 3 Is a Mega-Task

**Category**: SCOPE
**Severity**: Advisory
**SCOPE**: Task 3 modifies five files (`src/admin.js` NEW, `src/index.js`, `src/capture.js`, `src/rate-limits.js`, `wrangler.toml`), implements three HTTP endpoints, route registration, admin auth wiring, scope enforcement on existing endpoints, rate limiter changes, and log enrichment across two modules.
**CHANGE**: Task 3 bundles admin API handlers, route registration, scope enforcement on existing endpoints, log enrichment in `src/capture.js`, and wrangler.toml infrastructure changes into a single delegation.
**WHY**: This is the largest task by file count and responsibility breadth. If the edge-minion produces a defect in scope enforcement wiring (index.js) it could be masked by correct admin handler logic (admin.js). However, Task 3 depends on Tasks 1+2 being complete, and its outputs are validated by Task 4's comprehensive test suite including the scope enforcement tests. The single-agent assignment is pragmatic given the tight coupling between route registration and handler implementation. The approval gate on Task 1 (the auth contract) mitigates the highest-risk dependency.
**TASK**: Consider whether scope enforcement on existing endpoints (the `requiredScope` parameter threading in `src/index.js` and log enrichment in `src/capture.js`) could be split out as a distinct sub-task. Not blocking -- Task 4's tests will catch regressions -- but a split would reduce the blast radius of a single agent error. Nefario can accept or reject at discretion.

### Finding 5: Evolution Log Phase Numbering

**Category**: CONVENTION
**Severity**: Informational
**SCOPE**: Task 6 creates `docs/evolution/0037-per-tenant-api-keys/`
**CHANGE**: The plan assigns phase number 0037.
**WHY**: The evolution index (`docs/evolution/README.md`) shows the last phase is `0036-fail-loudly-2`. Phase 0037 is the correct next sequential number. Compliant.
**TASK**: No action needed.

### Finding 6: Evolution Log Structure Compliance

**Category**: COMPLIANCE
**Severity**: Advisory
**SCOPE**: Task 6 creates `prompt.md` and placeholder `decisions.md`. Missing: `outcome.md` (correctly deferred), `process.md` (correctly deferred).
**CHANGE**: Task 6 creates the evolution log structure before implementation starts (CLAUDE.md Rule 1). It does not create `outcome.md` or `process.md` yet (per CLAUDE.md Rules 3 and the Process Documentation section, these come after implementation and PR creation respectively).
**WHY**: Compliant with CLAUDE.md evolution log rules. However, CLAUDE.md Rule 4 requires updating `docs/backlog.md` after the phase and recording backlog changes in `outcome.md`. Task 5 handles backlog updates (marking R12 done) but bundles this with documentation updates rather than the evolution log.
**TASK**: Ensure that `outcome.md` (written post-implementation) includes a "Backlog changes" section per CLAUDE.md Rule 4, and that `process.md` is written after PR creation per CLAUDE.md Process Documentation requirements. The plan's verification steps (line 932) confirm "docs/backlog.md shows R12 as done" but do not confirm outcome.md or process.md exist. Add these to verification steps. The nefario wrap-up sequence should handle this, but per CLAUDE.md Precedence section, the calling session must add steps that skills omit.

---

## Gating Condition

The plan correctly surfaces the R12 gating condition ("gated on multi-user decision -- do not build until a second user is real or imminent") at the first approval gate (Conflict Resolution 4). The user initiated this orchestration with a full advisory and design decisions, which implies intent to proceed. The plan's approach -- allow planning, gate execution at first approval -- is proportionate.

---

## Summary

Six findings, zero blocking. The plan is tightly aligned with the original request, respects all CLAUDE.md conventions, avoids R13 scope creep, and includes proper evolution log setup. The two advisory items are: (1) Task 3's size could warrant a split but is mitigated by Task 4's test coverage, and (2) verification steps should explicitly include outcome.md and process.md creation.
