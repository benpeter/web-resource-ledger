# Process: R25 Usage Metering

## TL;DR

5-task nefario orchestration implementing per-tenant usage metering. 4 planning specialists (data-minion, iac-minion, api-design-minion, test-minion), 7 architecture reviewers (5 mandatory + 2 discretionary). Lucy issued a BLOCK in Phase 3.5 over incorrect handler count in synthesis -- fixed via revision. All 5 execution tasks completed, 3 code review findings auto-fixed. 791 tests pass. 6 commits on branch.

## Phase 1: Meta-Plan

Nefario identified 4 planning specialists. data-minion for D1 schema design (UPSERT patterns, CHECK constraints). iac-minion for D1 bindings and wrangler config. api-design-minion for the admin endpoint shape and query parameter design. test-minion for the test strategy covering both unit (DAL functions) and integration (SELF.fetch) layers.

Notable exclusions: security-minion (no new auth surface -- reuses existing verifyAdminKey), frontend-minion (no UI work), observability-minion (logging follows existing patterns).

Lucy approved the team via autonomous gate.

## Phase 2: Specialist Planning

### data-minion
Recommended single-table design with composite PK `(tenant_id, period)`. Proposed D1 UPSERT for atomic counter increments. Emphasized CHECK constraints for non-negative counters and GLOB format validation on the period column. Recommended `computePeriod()` as a pure function with injectable date for testing.

### iac-minion
Confirmed the existing D1 binding in wrangler.toml was sufficient -- no new infrastructure. Advised using `migrations/0002_usage_counters.sql` following the established migration numbering. Noted PRAGMA foreign_keys behavior in D1 (per-session, not persistent).

### api-design-minion
Designed the GET /v1/admin/usage endpoint. Recommended `tenant` as required query param, `period` as optional (defaults to current month). Argued for returning zero-defaults instead of 404 when a tenant exists but has no usage data for the queried period. Proposed the response shape with 6 fields (tenantId, period, captureCount, storageBytes, apiCallCount, updatedAt).

### test-minion
Proposed two test files: unit tests for DAL functions (computePeriod, incrementUsage, getUsage, schema constraints) and integration tests for the admin endpoint. Emphasized testing at month boundaries for computePeriod and testing idempotent UPSERT behavior for incrementUsage.

No specialists recommended additional agents.

## Phase 3: Synthesis

Nefario produced a 5-task plan with 1 gate:

1. **D1 Schema + DAL** (iac-minion): Migration SQL + db.js functions. Gate after this task.
2. **Counter Integration** (data-minion): Wire incrementUsage into queue consumer and API handlers.
3. **Admin Endpoint + OpenAPI** (api-design-minion): handleAdminGetUsage + spec update.
4. **Unit Tests** (test-minion): computePeriod, incrementUsage, getUsage, schema constraints.
5. **Integration Tests** (test-minion): Admin usage endpoint via SELF.fetch.

Key synthesis decision: the handler count. Synthesis initially listed "6 authenticated handlers" for API call counting. This became the central conflict in Phase 3.5.

## Phase 3.5: Architecture Review

7 reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo (mandatory) + observability-minion, user-docs-minion (discretionary).

### Lucy's BLOCK

Lucy issued the only BLOCK verdict. The synthesis prompt told Task 2 to instrument "6 authenticated handlers" with API call counting. Lucy traced the actual code and found only 3 handlers call `verifyApiKey` (tenant auth): handleCreateCapture, handleBatchCapture, handleListCaptures. The other handlers (admin key management) use `verifyAdminKey` (infrastructure secret) -- admin operations should not count toward tenant usage.

Lucy's argument: "Counting admin-key operations as tenant API calls would inflate usage data and mislead billing. The synthesis must specify exactly which 3 handlers to instrument."

This was a legitimate catch. The synthesis was revised to specify the correct 3 handlers. All reviewers re-reviewed and approved.

### Other Reviewers

- **security-minion**: APPROVE. Confirmed UPSERT prevents race conditions, CHECK constraints prevent underflow, parameterized queries throughout.
- **test-minion**: ADVISE. Recommended testing computePeriod at UTC midnight boundary and testing UPSERT idempotency. Both incorporated into test prompts.
- **ux-strategy-minion**: APPROVE. No user-facing flow changes.
- **margo**: APPROVE. Confirmed scope is minimal -- single table, 4 DAL functions, no over-engineering.
- **observability-minion**: ADVISE. Recommended structured logging for usage increments. Incorporated into Task 2 prompt.
- **user-docs-minion**: APPROVE. No user-facing documentation needed (admin-only endpoint).

## Phase 4: Execution

### Task 1 (iac-minion): Schema + DAL
Created migration SQL with composite PK, CHECK constraints, and FK to tenants. Added 4 functions to db.js: computePeriod, incrementUsage, getUsage, tenantExists (tenantExists was added preemptively -- later validated by code review). Updated test fixtures with cleanDb and seedUsageCounter helpers.

Gate approved by Lucy (autonomous). Deliverable: 3 files, clean schema, well-tested DAL.

### Task 2 (data-minion): Counter Integration
Wired incrementUsage into the queue consumer (captures + storageBytes after successful performCapture) and 3 authenticated handlers (apiCalls). Modified performCapture to return storedBytes. All increments via ctx.waitUntil with .catch for resilience.

### Task 3 (api-design-minion): Admin Endpoint
Implemented handleAdminGetUsage in admin.js. Validates tenant (required, must match TENANT_ID_RE) and period (optional, YYYY-MM format). Checks tenant existence via tenantExists DAL function. Returns usage data with Cache-Control: private, no-store. Updated openapi.yaml with path and UsageResponse schema.

### Task 4 (test-minion): Unit Tests
20 tests across 4 describe blocks. Tests computePeriod with explicit dates, UTC midnight boundary, and default (no-arg) call. Tests incrementUsage for single increment, multiple increments (accumulation), multi-tenant isolation, multi-period isolation, zero-delta no-op, and concurrent-safe UPSERT. Tests getUsage for existing and missing rows. Tests schema CHECK constraints (negative values rejected).

### Task 5 (test-minion): Integration Tests
16 tests across 6 describe blocks using SELF.fetch against the real worker. Tests auth (401 without/wrong key), validation (missing tenant, invalid chars, bad period format, nonexistent tenant), success responses (zero defaults, seeded data, current period default), period filtering, response shape (Content-Type, Cache-Control, exact field set), and edge cases (hyphens/underscores in tenant IDs).

## Phase 5: Code Review

3 reviewers (code-review-minion, lucy, margo). 3 ADVISE findings, 0 BLOCK. All auto-fixed:

1. **lucy**: Raw `env.DB.prepare()` in admin.js violates db.js centralization. Fix: created tenantExists() in db.js.
2. **code-review-minion**: Inconsistent byte counting -- headers used String.length (UTF-16) while HTML used TextEncoder (UTF-8). Fix: standardized on TextEncoder.
3. **code-review-minion**: Test timezone sensitivity -- admin-usage.test.js used local Date for current period but computePeriod uses UTC. Fix: imported computePeriod from db.js.

Additionally, db.js module header was updated from "four tables" to "five tables" to include usage_counters.

## Phase 6: Test Execution

791 tests pass, 2 skipped (pre-existing browser integration tests). One test fix was needed in capture.test.js where the assertion `toEqual({ ok: true })` failed because performCapture now returns `{ ok: true, storedBytes }`. Changed to `expect(result.ok).toBe(true)` + `expect(result.storedBytes).toBeGreaterThan(0)`.

## Human Interventions

This was an autonomous orchestration (no human at gates -- Lucy decided). Key autonomous decisions:

- **Team approved as-is**: Lucy found the 4-specialist team appropriate for the scope.
- **Lucy's BLOCK resolved via revision**: The synthesis was revised to correct the handler count from 6 to 3. No human override needed.
- **All code review findings auto-fixed**: The 3 ADVISE findings were straightforward enough to fix without human judgment.
- **No scope changes**: All 5 tasks completed as planned. No tasks added or removed.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-22-174821-usage-metering/`
- Phase 3.5 review verdicts (Lucy's BLOCK): same companion directory, `phase3.5-lucy.md`
- Synthesis (final execution plan): `phase3-synthesis.md` in companion directory
- Evolution log decisions: `docs/evolution/0053-usage-metering/decisions.md`
