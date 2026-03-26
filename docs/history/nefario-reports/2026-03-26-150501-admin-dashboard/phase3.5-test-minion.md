## Verdict: ADVISE

The test plan is structurally sound — real D1, `SELF.fetch()`, per-test seeding, `cleanDb` in `beforeEach`, response shape assertions. No fundamental blocking issues. Four specific gaps worth fixing before implementation begins.

---

### Issue 1: IP counter collision risk (medium)

The plan assigns `192.0.2.150` to the new test file. The existing landscape on `192.0.2.x`:

- `admin-keys.test.js`: starts at 10, uses 31 IPs → reaches 41
- `webhook-crud.test.js`: starts at 20, uses 12 IPs → reaches 32
- `schedule-crud.test.js`: starts at 100, uses 8 IPs → reaches 108
- `admin-usage.test.js`: starts at 100, uses 7 IPs → reaches 107
- `admin-cache-purge.test.js`: starts at 200 → could reach 250+

With 5 DAL describe blocks (each using a fresh IP per test) plus 3 API describe blocks with 8–10 tests each, the new file will consume 35–50 IPs, reaching `192.0.2.185–200` — directly into `admin-cache-purge`'s starting point. Collision risk is real.

**Fix**: Start at 150 and cap explicitly at 190, OR use a different subnet prefix (e.g., `10.0.1.x` which no other admin file uses). The plan should specify the subnet, not just the counter value. Implementation agent must count IPs needed before committing to a range.

---

### Issue 2: `eidas_capture_count` not seedable via existing fixtures (medium)

The `getOverviewStats` test plan includes "Aggregates eIDAS captures for current period" and the `listTenantsWithUsage` tests include multi-tenant scenarios where `eidasCaptureCount` should be assertable. However:

- The existing `seedUsageCounter` helper has no `eidas_capture_count` parameter — it seeds the column as 0 always.
- The new `seedTenantWithTier` helper seeds only the tenant row, not usage counters.

Any assertion on non-zero `eidasCaptureCount` in DAL or API tests will silently pass with zeroed values unless `seedUsageCounter` is extended. The test plan omits this fixture modification.

**Fix**: The Task 4 prompt should instruct the implementation agent to also update `seedUsageCounter` to accept an optional `eidasCaptureCount` parameter (default 0). Without this, eIDAS path coverage is false — the tests will pass but never exercise non-zero eIDAS values.

---

### Issue 3: `periods` boundary value missing from API test list (low)

The plan specifies `periods` param defaults to 6 and caps at 24, with "invalid `periods` param returns 400". The test list covers `periods=25` returning 400, but does not include a test for exactly `periods=24` returning 200. Boundary-adjacent values are where off-by-one errors hide.

**Fix**: Add one test: `periods=24` returns 200 with at most 24 history entries.

---

### Issue 4: `getTenantDetail` — missing test for `periodLimit` interaction with actual row count (low)

The plan tests "Periods param caps history results" but the scenario isn't specified clearly: does it test with more rows than the limit (confirming truncation), or just assert the default? If the tenant only has 3 usage rows and `periodLimit=6`, the result will be 3 — which looks correct regardless of whether the LIMIT clause works. The test should seed more rows than the limit to confirm actual truncation.

**Fix**: The "Periods param caps history results" test should explicitly seed N > limit rows and assert `result.usageHistory.length === limit`.

---

### Coverage assessment

The test plan covers the right layers in the right proportions:
- All four DAL functions tested with empty, single, and multi-entity cases
- All three API endpoints tested for auth, shape, headers, and error paths
- Security tests (tenant key rejection, no CORS headers) are present
- UI tests are appropriately lightweight (HTML structure + security headers, no browser automation)

The `Object.keys(body).sort()` response shape assertion pattern is correct — it catches field additions and removals that typed assertions miss. The `Cache-Control: private, no-store` header assertion on every endpoint is good hygiene.

---

### Summary of required changes to Task 4 prompt

1. Specify subnet prefix for IP counter (recommend `10.0.1.x` starting at 150 to avoid all `192.0.2.x` overlap)
2. Add `seedUsageCounter` modification to the fixtures task, extending it with `eidasCaptureCount` parameter
3. Add `periods=24` boundary test to `GET /v1/admin/tenants/:id` test list
4. Clarify that "Periods param caps history results" test must seed more rows than the cap value
