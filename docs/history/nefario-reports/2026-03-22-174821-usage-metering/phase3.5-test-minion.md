# Test-Minion Review -- Usage Metering Delegation Plan (Revision Round 1)

**Verdict: APPROVE**

## Fixes Verified

All three issues I raised in round 1 are addressed correctly.

**Fix 1: Period isolation both-sides assertion (Task 4)**
The `isolates periods` test now explicitly states: "assert BOTH the new-period row has the expected values AND the old-period row is unchanged. Do not only check the new row." This is the assertion that would catch a regression where the UPSERT conflict target silently narrows from `(tenant_id, period)` to `(tenant_id)` alone. Verified.

**Fix 2: updatedAt dual-path test (Task 4)**
Two distinct tests now cover the two UPSERT code paths:
- `returns null updatedAt on first INSERT (before any update)` -- seeds via seedUsageCounter (plain INSERT), queries via getUsage, asserts null. Validates that the INSERT path does not set updated_at.
- `returns non-null updatedAt after increment` -- seeds via seedUsageCounter, then calls incrementUsage to trigger the ON CONFLICT UPDATE path, then asserts updatedAt is a valid ISO timestamp.

The second test is the critical one: it exercises exactly the `updated_at = strftime(...)` line in the DO UPDATE clause. If that assignment were ever dropped from the SQL, this test fails. Verified.

**Fix 3: End-to-end wiring test (Task 5)**
Group 7 now contains `authenticated API call increments usage counter`. It makes a real authenticated API call through the full worker stack, then queries the admin usage endpoint and asserts apiCalls >= 1. The guidance to prefer GET /v1/captures over POST /v1/captures is correct -- POST enqueues to a queue that miniflare may not flush synchronously within the test. Verified.

## Advisory (non-blocking)

**Rate limit IP management in the E2E test (Task 5)**

The plan says "plan test counts per describe block carefully" and "each describe block MUST use a different IP via nextIp()." This handles admin rate limit isolation correctly. The E2E test in group 7 makes both a tenant API call (to /v1/captures) and an admin API call (to /v1/admin/usage). These hit two separate rate limit pools:

- Admin pool: 5 req/60s per IP, keyed on the CF-Connecting-IP of the admin request
- Tenant pool: separate pool keyed on the tenant API key's IP

The plan acknowledges this ("the tenant API call uses a different rate limit pool than the admin call") but does not give the implementing agent explicit IP assignment guidance for the tenant call. If the tenant call reuses an IP from a different describe block that also calls /v1/captures, those pools collide.

The agent should assign the E2E describe block its own IP via nextIp() and use it for both calls. Since the pools are separate, using the same IP for both is fine -- they do not interfere with each other. This is straightforward to implement and the plan's framing points there; noting it so the agent does not skip IP assignment for the tenant-side call.

This is ADVISORY. The plan is complete enough for a competent agent to handle it.

## Overall Assessment

The revision addresses all three gaps identified in round 1. The test task prompts are specific, include concrete import lists and test body outlines, reference the correct existing test analogues (admin-keys.test.js for integration patterns, db.test.js for DAL unit patterns), and set realistic count targets (17-20 unit tests, 14-17 integration tests). The "what NOT to do" sections are well-targeted and prevent common mistakes (vi.useFakeTimers, testing ctx.waitUntil behavior, modifying source files).

**APPROVE**
