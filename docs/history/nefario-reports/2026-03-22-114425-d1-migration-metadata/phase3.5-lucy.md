# Lucy Review: D1 Migration for Metadata

## Verdict: ADVISE

The plan is well-aligned with the user's original request and CLAUDE.md engineering
philosophy. Scope is tightly contained, YAGNI/KISS are applied correctly (Cron Trigger
deferred, FK enforcement deferred, offset/limit over cursor). Conflict resolutions are
well-reasoned and traceable to stated requirements. Three issues require attention before
execution.

---

### Findings

- [TRACE] Task 2 omits `src/verify.js` from call site updates
  SCOPE: `src/verify.js`, `src/index.js` (line 1050), `src/mcp.js` (line 413)
  CHANGE: `verify.js` imports `getCapture` and `getArchivedSigningKey` from `./kv.js` and receives a `KV` binding via destructured `deps` parameter. It must be updated to import from `./db.js` and accept `DB` instead of `KV`. Callers in `index.js` (`performVerification({ KV: env.KV, ... })`) and `mcp.js` (same pattern) must pass `DB: env.DB`. Add `src/verify.js` to Task 2's "Files to create/modify" list.
  WHY: Without this change, `verify.js` will still import from the gutted `kv.js` and call functions that no longer exist there. Verification endpoints will break at runtime.
  TASK: 2

- [TRACE] Task 2 claims `auth.js` imports `getApiKeyRecord` -- it does not
  SCOPE: `src/auth.js`
  CHANGE: `auth.js` only imports `TENANT_ID_RE` from `kv.js`. It does not import or call `getApiKeyRecord`. The Task 2 prompt's `src/auth.js` section ("Import getApiKeyRecord from './db.js'", "Change env.KV to env.DB for getApiKeyRecord calls") is incorrect. The only change needed in `auth.js` is keeping the `TENANT_ID_RE` import -- which can come from either `kv.js` or `db.js` since the plan exports it from both.
  WHY: If the executing agent follows the prompt literally, it will add a spurious import to `auth.js`. Low severity but introduces unnecessary code.
  TASK: 2

- [CONVENTION] Evolution log phase number not established
  SCOPE: `docs/evolution/`
  CHANGE: The plan does not name the evolution log directory. The next sequential number is `0047`. The executing orchestration must create `docs/evolution/0047-d1-migration-metadata/` with `prompt.md` before execution begins, per CLAUDE.md Evolution Log Rule 1.
  WHY: CLAUDE.md requires the evolution directory and `prompt.md` to be created before the phase starts. This is non-negotiable per project instructions.
  TASK: all (cross-cutting)

---

### Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|-------------|--------|
| D1 schema: captures, tenants, api_keys tables | Task 1 schema (4 tables including signing_keys) | Covered |
| All capture CRUD via D1 | Task 2 db.js | Covered |
| All tenant/key ops via D1 | Task 2 db.js | Covered |
| SQL pagination (offset/limit) | Task 2 listCaptures | Covered |
| Filtering (status, URL, date range) | Task 2 listCaptures + index.js | Covered |
| Sorting (by timestamp) | Task 2 sort param | Covered |
| KV reduced to rate limit counters only | Task 2 kv.js reduction | Covered |
| Migration script (KV to D1) | Task 3 Part B | Covered |
| List query latency <100ms p95 at 10K | Index design in Task 1; not explicitly tested | Acceptable |
| All tests updated to D1 | Task 3 Part A | Covered |
| Schema via migration files | Task 1 migrations/ | Covered |
| Remove KV metadata namespaces from wrangler.toml | NOT in plan | See note |

**Note on KV namespace removal**: The prompt says "all other KV namespaces removed from wrangler.toml" but the current wrangler.toml has only one KV namespace (binding `KV`), which is shared between metadata and rate limits. The plan correctly retains it for rate limit counters. The prompt's "remove" language is misleading but the plan's behavior is correct -- there are no separate metadata-only KV namespaces to remove.

### Alignment Assessment

The plan correctly restates the problem, addresses all success criteria, and stays within
declared scope boundaries (no dual-write, no backups, no read replicas, no full-text
search). The deferred items (Cron Trigger, FK enforcement) are justified per YAGNI. The
three tasks are sequenced correctly with appropriate dependency ordering.
