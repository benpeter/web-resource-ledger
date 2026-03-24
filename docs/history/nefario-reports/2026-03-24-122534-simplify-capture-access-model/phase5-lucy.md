# Lucy Review: Simplify Capture Access Model (Phase 0075, Issue #169)

## Verdict: ADVISE

The implementation accurately matches the stated requirements with no goal drift or scope creep. Two minor CLAUDE.md compliance gaps should be addressed before merge.

---

## Requirements Traceability

| Requirement (from prompt.md) | Implementation | Status |
|------------------------------|---------------|--------|
| 1. Auth gate only on `GET /v1/captures` (list) | `src/index.js:470` -- list route requires `verifyAuth()` with `requiredScope: 'read'` | Covered |
| 2. Remove auth from individual capture access | `src/index.js:482-500` -- individual routes use optional auth; `env._captureAuth` unset = public access | Covered |
| 3. Remove share token system | `src/share-tokens.js` deleted; zero `wrl_share_`/`shareToken` references in `src/`, `test/`, `openapi.yaml`, `site/` | Covered |
| 4. Remove share token cleanup from cron | `src/scheduler.js` has no share token references; cron handler in `src/index.js:304-314` only runs schedules + meter reporting | Covered |
| 5. Update SECURITY.md | `SECURITY.md:29-43` documents new access model (capability token, public endpoints, threat analysis) | Covered |
| 6. Update OpenAPI spec | `openapi.yaml:2507,2572,2668` -- all three individual capture endpoints have `security: []` | Covered |
| 7. Fix verify-page.spec.js E2E test | `test/e2e/verify-page.spec.js` explicitly tests public access without auth | Covered |
| D1 migration to drop share_tokens table | `migrations/0013_drop_share_tokens.sql` drops table + 3 indexes | Covered |
| Backlog updated | `docs/backlog.md:68-71` -- share token parking lot items struck through with Phase 0075 rationale | Covered |

All stated requirements are addressed. No orphaned tasks (nothing in the implementation lacks a requirement). No unaddressed requirements.

---

## Drift Assessment

No drift detected.

- **Scope creep**: None. The only addition beyond the explicit 7 items is rate limiting on the newly-public artifact endpoint (`src/index.js:1568-1576`), which is a proportionate defense-in-depth measure against abuse of a newly-open surface. It uses the existing `VERIFY_RATE_LIMITER` binding, adds no new infrastructure.
- **Over-engineering**: None. The optional auth pattern (check credentials only when present; undefined = public) is the simplest approach.
- **Feature substitution**: None.
- **Gold-plating**: None.

The key-resolver.js change in `packages/verify/` (`lib/key-resolver.js:88-99`) adds an actionable 401 error message explaining that individual captures are now public. This is a proportionate UX improvement for the verify CLI, directly consequent to the access model change.

---

## CLAUDE.md Compliance

### Conventions Verified

| Directive | Status |
|-----------|--------|
| YAGNI (no speculative features) | Pass -- nothing beyond stated scope |
| KISS (simple beats elegant) | Pass -- optional auth via `env._captureAuth` is straightforward |
| Fail loudly, degrade intentionally | Pass -- bad credentials return 401, not silent passthrough; rate limit logs include event type and limiter name (`artifact_public`) |
| Test the real boundaries | Pass -- E2E test (`verify-page.spec.js`) exercises public access end-to-end |
| Vanilla solutions preferred | Pass -- no new dependencies |
| Error handling: no silent catch | Pass -- no empty catch blocks; all error paths return problem responses or log |

### Findings

**Finding 1 [COMPLIANCE]: Evolution log incomplete**

- CHANGE: Phase 0075 directory (`docs/evolution/0075-simplify-capture-access-model/`) contains only `prompt.md`. Missing `decisions.md` and `outcome.md`.
- WHY: CLAUDE.md "Evolution Log > Rules" items 2-3 require `decisions.md` during the phase and `outcome.md` after the phase. The orchestration is still in progress, so `outcome.md` is expected to come later, but `decisions.md` should have been written as decisions were made (e.g., the choice of optional-auth pattern, the rate limiting addition, the capability-token rationale).
- FIX: Write `decisions.md` documenting: (a) capability token security model rationale, (b) optional auth pattern choice, (c) rate limiting on public artifacts. Write `outcome.md` after PR creation.
- SEVERITY: COMPLIANCE (minor -- addressable before merge)

**Finding 2 [COMPLIANCE]: Evolution log index not updated**

- CHANGE: `docs/evolution/README.md` does not include a row for Phase 0075.
- WHY: CLAUDE.md "Evolution Log > Rules" item 5: "add every new phase to `docs/evolution/README.md`."
- FIX: Add `| [0075-simplify-capture-access-model](0075-simplify-capture-access-model/) | Simplify capture access model: public individual captures, remove share tokens (Issue #169) |` to the table.
- SEVERITY: COMPLIANCE (minor -- addressable before merge)

---

## Security Model Assessment (scope-limited, not a full security review)

The access model change is internally consistent:

- List endpoint stays auth-gated (prevents enumeration)
- Individual captures use 128-bit IDs as capability tokens (122 bits entropy from UUID v4)
- Authenticated requests still get tenant isolation (can't see other tenants' captures)
- Bad credentials fail loudly with 401 (not silently degraded to public access)
- Cross-tenant access returns 404, not 403 (no enumeration via error codes)
- Public artifact access is rate-limited per IP
- SECURITY.md documents residual risks (ID leakage via logs/shared URLs)

---

## Summary

Implementation is clean, focused, and well-tested. The two compliance findings (evolution log docs) are administrative and should not block the code changes themselves, but must be addressed before the phase is considered complete per project conventions.
