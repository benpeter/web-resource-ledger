# Margo Re-Review: Usage Metering Delegation Plan (Revision Round 1)

## Verdict: APPROVE

Both items from the prior ADVISE are resolved. No new issues introduced by the revision.

---

### Fix 1: Redundant Index -- Resolved

The migration prompt now explicitly prohibits a secondary index (Task 1 prompt, "Do NOT create a secondary index" with explanation; repeated in "What NOT to do" and success criteria). The rationale is also included for the implementing agent: the composite PK already handles exact-match lookups on `(tenant_id, period)`, and a range-scan index is YAGNI until a range-scan query exists. The fix is correctly applied and the instruction is unambiguous.

### Fix 2: seedUsageCounter Plain INSERT -- Resolved

The fixture now uses a plain `INSERT INTO usage_counters (...)` without a conflict clause (Task 1 prompt, lines for seedUsageCounter). The rationale is included in the prompt: "Test fixtures should set up exact known state, not silently merge with existing data. If a test calls seedUsageCounter twice with the same tenant+period, it should fail loudly (UNIQUE constraint violation) rather than silently overwriting -- that would mask a test isolation bug." This is the correct framing. The behavior is now as simple as it should be.

The `INSERT OR IGNORE INTO tenants` for the parent row is appropriate -- the tenant may legitimately pre-exist from other fixture calls in the same test, and silently ignoring duplicates on the parent row is not a test isolation risk (the tenant has no mutable test state beyond its existence).

---

### No New Issues

The revision introduced no new complexity. Spot checks:

- `computePeriod` is not injectable into `incrementUsage`, but the test plan uses Option B (seedUsageCounter for period-controlled state, separate computePeriod unit tests for derivation logic). The tradeoff is documented and the test coverage is adequate.
- The tenant existence check in `handleAdminGetUsage` delegates the function name choice to the implementing agent with explicit guidance to check db.js. This is appropriate given the agent will have direct file access.
- Task count (5), dependency count (0), abstraction count (0 new layers) remain proportional to the problem.
- The `updatedAt` dual-path behavior (NULL on initial INSERT, non-null after UPSERT update) is correctly specified in both the schema (no DEFAULT on `updated_at`) and the test cases (lines covering both paths).

The plan is ready for execution.
