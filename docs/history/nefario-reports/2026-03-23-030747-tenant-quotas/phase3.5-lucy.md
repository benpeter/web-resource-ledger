# Lucy Review: tenant-quotas Delegation Plan

## Verdict: ADVISE

The plan is well-aligned with the original request. All 12 success criteria from the prompt are addressed with traceable plan tasks. The plan follows existing codebase patterns (rate-limits.js structure, config JSON overrides, existing test harnesses). No significant scope creep or goal drift detected. The 6-task decomposition is proportional to the feature scope.

The following issues should be addressed but are not blocking.

---

### Advisories

1. [governance]: Task 4 prompt references `src/ui/design-system.css` but that file does not exist at that path
   SCOPE: Task 4 prompt, `src/ui/design-system.css` file path
   CHANGE: Correct the path in the Task 4 prompt to `src/design-system.css` (which is where `--color-warning`, `--color-accent`, `--color-error` are defined) or `src/design-system.js` (which also contains these tokens). The frontend-minion will search for the wrong file if the path is wrong.
   WHY: The file `src/ui/design-system.css` does not exist. The actual design system CSS is at `src/design-system.css` and `src/design-system.js`. An incorrect path in the prompt may cause the agent to create a new file or waste cycles looking for a nonexistent one.
   TASK: Task 4

2. [governance]: Task 4 CSS references `--color-warning` directly but existing codebase uses `--color-warning-text` and `--color-warning-bg` variant tokens
   SCOPE: Task 4 CSS for `.usage-bar-fill--warning`
   CHANGE: Verify that `--color-warning` (defined as `#e6a817` in design-system.css) is the correct token for a background fill. The existing UI uses `--color-warning-text` and `--color-warning-bg` for warning states, not `--color-warning` directly. The plan should clarify which token to use, or the agent should inspect the design system and pick the appropriate one.
   WHY: Using a raw color token instead of a semantic token (bg vs text) may produce incorrect contrast. `--color-warning` is an orange (`#e6a817`) that may have insufficient contrast against a light track background, or may not match the visual language of existing warning states.
   TASK: Task 4

3. [governance]: Plan has no evolution log task -- CLAUDE.md requires `docs/evolution/NNNN-*/` with prompt.md, decisions.md, outcome.md, and process.md
   SCOPE: Evolution log (CLAUDE.md "Evolution Log" section, rules 1-7 + "Process Documentation" section)
   CHANGE: The orchestrator must ensure the evolution log directory is created (next sequential number would be `0056-tenant-quotas`), `prompt.md` is written before execution begins, `decisions.md` is maintained during execution, and `outcome.md` + `process.md` are written after PR creation. The backlog (`docs/backlog.md`) must also be updated. These are CLAUDE.md-mandated deliverables, not optional post-execution cleanup.
   WHY: CLAUDE.md states "This is non-negotiable -- the build process is as much a deliverable as the product itself." The plan's Cross-Cutting Coverage section mentions "Phase 8 will handle README updates" but does not mention evolution log or backlog updates. The orchestrator session must handle this per CLAUDE.md Precedence rules.
   TASK: Cross-cutting (all tasks)

4. [governance]: `setTenantTier` function is created in Task 1 but no endpoint exposes it -- the function is dead code at delivery
   SCOPE: `src/db.js` `setTenantTier` function (Task 1)
   CHANGE: Either (a) defer `setTenantTier` to when the admin endpoint is built (YAGNI -- don't build it until you need it), or (b) add a brief admin endpoint task that wires it up. The prompt's scope says "In: ... tier field on tenant record" and "Out: ... Automatic tier upgrades" -- but manual tier setting by an operator is listed nowhere.
   WHY: The Helix Manifesto / CLAUDE.md engineering philosophy states "YAGNI -- don't build it until you need it." Building a function with no caller violates this principle. The function itself is small, but the principle matters for consistency. Note: the existing `setTenantConfig` already allows quota overrides, which is the primary admin-side requirement.
   TASK: Task 1

5. [governance]: Task 3 duplicates the D1 batch query logic from `checkQuota` instead of reusing it
   SCOPE: `handleAccountGetUsage` in `src/account.js` (Task 3)
   CHANGE: Consider whether `handleAccountGetUsage` should call `checkQuota()` and reshape the result, rather than duplicating the `SELECT tier, config FROM tenants` + `SELECT capture_count, storage_bytes FROM usage_counters` batch pattern. If duplication is intentional (different return shape, avoiding coupling), note that in the prompt so the agent doesn't refactor it.
   WHY: KISS / Lean and Mean. Two separate modules performing identical D1 batch queries with identical parsing logic is a maintenance surface. If `checkQuota` changes its query (e.g., adding a column), `handleAccountGetUsage` must be updated independently. The plan's gate rationale for Task 1 specifically calls out "Maximizes consistency with existing patterns" -- but then Task 3 creates a parallel pattern.
   TASK: Task 3

---

### Traceability Matrix

| Prompt Requirement | Plan Coverage | Status |
|---|---|---|
| Default quotas per tier (free: 100 captures/1GB, pro: 5000/50GB) | Task 1: `TIER_QUOTAS` constant | Covered |
| Quota check before browser session creation | Task 2: check in handleCreateCapture/handleBatchCapture after rate limit | Covered |
| 429 with `quota_exceeded` error shape | Task 2: `problemResponse(429, ...)` with `limitType: 'quota'` | Covered |
| Per-tenant quota overrides in D1 | Task 1: `config.quotas` JSON validation in `setTenantConfig` | Covered |
| Web UI usage dashboard with progress bars | Task 4: usage section in settings view | Covered |
| Dashboard updates on page load (not real-time) | Task 4: fetch in `mountSettings()` | Covered |
| Best-effort enforcement (eventual consistency) | Risks section acknowledges TOCTOU; spec-compliant | Covered |
| Tier stored per tenant, defaults to "free" | Task 1: migration `ALTER TABLE tenants ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'` | Covered |

No unaddressed requirements. No orphaned tasks (all tasks trace to at least one requirement).

### Scope Assessment

The plan stays within the stated scope boundaries. Items explicitly marked "Out" in the prompt (automatic upgrades, storage eviction, per-endpoint quotas, notifications) are not present in the plan. Task 6 (docs site content) is a natural deliverable for a feature that adds a new API endpoint and changes API response shapes -- not scope creep.

The `X-Quota-*` response headers (Task 2 section 3) are not explicitly listed in the prompt's success criteria but are a standard API convention for quota-aware endpoints and directly support the prompt's requirement that "tenants can see their usage." This is a reasonable inclusion.
