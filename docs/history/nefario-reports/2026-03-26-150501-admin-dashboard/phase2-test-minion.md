# Domain Plan Contribution: test-minion

## Recommendations

### 1. Follow Established Integration Test Patterns -- Do Not Invent New Ones

The codebase has a mature, consistent testing approach built around `@cloudflare/vitest-pool-workers` with real D1. The admin dashboard tests must follow the same conventions exactly:

- **SELF.fetch()** for all HTTP endpoint tests (see `admin-keys.test.js`, `admin-usage.test.js`)
- **env.DB** for direct DAL function tests (see `db.test.js`)
- **cleanDb() in beforeEach** for test isolation (every existing test file does this)
- **IP counter per test file** to avoid admin rate limiter collisions (5 req/60s per IP)
- **Seed functions in fixtures.js** for test data setup (seedApiKey, seedCapture, seedUsageCounter, seedGithubUser, etc.)

No new test infrastructure is needed. The existing `test/fixtures.js` already has the building blocks.

### 2. Test Strategy: Three Layers

**Layer 1: DAL Function Unit Tests (~60% of new tests)**

New aggregate query functions (tenant overview, cross-tenant stats, tier breakdown) should be tested directly against `env.DB` in `test/db.test.js` or a new `test/admin-dal.test.js` file. These tests:

- Call the DAL function directly with `env.DB`
- Seed specific data scenarios via `seedCapture`, `seedUsageCounter`, `seedApiKey`, etc.
- Assert return shape, aggregation correctness, edge cases (empty tenants, zero usage)
- Are fast (no HTTP overhead) and test the SQL logic in isolation

This is where aggregate query correctness matters most. Seed data **must** be used -- you cannot test a `SUM()` or `COUNT()` with `GROUP BY` on an empty database. But each test seeds its own data (factory pattern via existing `seed*` helpers), not a shared fixture file.

**Layer 2: Admin API Endpoint Tests (~35% of new tests)**

New endpoints (e.g., `GET /v1/admin/tenants`, `GET /v1/admin/tenants/:id/usage`) should follow the exact pattern from `admin-keys.test.js` and `admin-usage.test.js`:

- Auth tests: 401 without header, 401 with wrong key, 200 with correct ADMIN_KEY
- Validation tests: 400 for invalid params
- Response shape tests: exact field list, Content-Type, Cache-Control headers
- Security: legacy CAPTURE_API_KEY and tenant keys must not work on admin routes
- Rate limiting: each `describe` block uses `nextIp()` to get a unique IP

These tests exercise the full request path (routing, auth middleware, handler, DAL, response serialization) through SELF.fetch(). They catch integration issues that DAL-only tests miss: param parsing, error response format (RFC 9457), header correctness.

**Layer 3: Admin UI Tests (~5% of new tests)**

The existing UI test pattern is lightweight and appropriate: test the **exported JS string constants**, not a real DOM. See `ui-dashboard.test.js` and `ui-settings-usage.test.js` for the established approach:

- Assert that the HTML shell contains expected structural elements (`<div id="admin-app">` or similar)
- Assert security invariants: no `innerHTML` assignments with variable data (XSS guard)
- Assert no external resource loads (`<script src=`, `<link rel="stylesheet" href=`)
- Extract and test pure-logic helper functions (formatters, percentage calculations) using the same evaluation technique in `ui-settings-usage.test.js`
- Test response headers (CSP, Cache-Control, Content-Type) on the route

**Do NOT** attempt browser-level E2E tests for the admin UI. The project has no Playwright/browser test infrastructure, and spinning one up for an internal admin dashboard violates YAGNI. The vanilla JS UI is rendered server-side as a string constant -- string-level assertions are sufficient and match the existing pattern.

### 3. Seed Data Strategy for Aggregate Queries

Each test function seeds its own data. No shared fixture files. No pre-populated "test database." This is the pattern the entire test suite follows and it works:

```js
// Example: testing a "tenant overview" aggregate function
it('returns correct capture counts across multiple tenants', async () => {
  await seedCapture(env.DB, 'cap_' + 'a'.repeat(32), { tenantId: 'tenant-a', status: 'complete' });
  await seedCapture(env.DB, 'cap_' + 'b'.repeat(32), { tenantId: 'tenant-a', status: 'failed' });
  await seedCapture(env.DB, 'cap_' + 'c'.repeat(32), { tenantId: 'tenant-b', status: 'complete' });
  await seedUsageCounter(env.DB, { tenantId: 'tenant-a', captureCount: 5 });
  await seedUsageCounter(env.DB, { tenantId: 'tenant-b', captureCount: 2 });

  const overview = await getAdminTenantOverview(env.DB);
  expect(overview).toHaveLength(2);
  // ... assertions on aggregated fields
});
```

For aggregate queries with JOINs (e.g., tenant + usage_counters + captures + api_keys), seed all relevant tables. The existing `cleanDb()` function already handles teardown in FK-safe order, and `beforeEach` ensures a clean slate.

**Key seed data scenarios to cover:**

- Empty database (no tenants) -- should return empty array, not error
- Tenant with zero usage data -- should return zeros, not null/undefined
- Multiple tenants with varying data volumes -- verify aggregation is per-tenant
- Tenants across different tiers (free, pro) -- verify tier grouping/filtering
- Tenants with and without billing (stripe_customer_id null vs set)
- Usage data across multiple periods -- verify period filtering on aggregates
- Revoked vs active API keys -- verify count correctness based on filter

### 4. New Fixture Helpers Needed

The existing `fixtures.js` will need one or two new helpers. Keep them minimal:

- **`seedTenantWithTier(db, tenantId, tier)`** -- seeds a tenant row with a specific tier value. Currently `seedApiKey` and `seedCapture` create tenants via `INSERT OR IGNORE INTO tenants (id)` which only sets the `id` column. For admin dashboard tests, we need tenants with `tier`, `billing_status`, and `stripe_customer_id` populated.

No other new helpers are likely needed. Existing `seedCapture`, `seedUsageCounter`, `seedApiKey`, `seedGithubUser` cover the test data needs.

### 5. Response Shape Testing is Non-Negotiable

Every new admin endpoint must have a test that asserts **exactly** which fields appear in the response body. See the existing pattern:

```js
it('response body has exactly the expected fields', async () => {
  const res = await get('?tenant=default');
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(
    ['apiCallCount', 'captureCount', 'period', 'storageBytes', 'tenantId', 'updatedAt'].sort(),
  );
});
```

This catches field name typos, accidental data leakage, and response contract drift. It is especially important for the admin dashboard because the vanilla JS frontend will parse these exact field names.

### 6. Do Not Run Tests Casually

Per CLAUDE.md and CLAUDE.local.md, `npm test` spins up a full workerd runtime consuming ~8 GB. Tests should only be run when code changes need verification. Never run two test instances in parallel. CSS-only or copy-only UI changes do not warrant a test run.

## Proposed Tasks

### T1: Add `seedTenantWithTier` helper to `test/fixtures.js`
- Create a helper that seeds a tenant with tier, billing_status, stripe_customer_id, payment_method_added_at
- Add it to the existing exports
- Estimated: ~20 lines of code

### T2: Write DAL tests for new aggregate query functions
- Create `test/admin-dal.test.js` (or extend `test/db.test.js`)
- Test tenant list query (all tenants with their tier, capture count, usage summary)
- Test per-tenant detail query (full usage breakdown with JOINs)
- Test edge cases: empty database, zero-usage tenants, multi-period data
- Test tier filtering if the API supports it
- Each test seeds its own data, cleans up via `cleanDb()` in `beforeEach`
- Follow the exact naming and structure patterns from `db.test.js`

### T3: Write integration tests for new admin API endpoints
- Create `test/admin-dashboard.test.js` (or similar)
- Test auth (401 without/wrong key, 200 with ADMIN_KEY)
- Test param validation (400 for invalid tenant IDs, periods)
- Test response shape (exact field lists, Content-Type, Cache-Control headers)
- Test data correctness (seeded data appears in responses)
- Test security: tenant keys and CAPTURE_API_KEY rejected on admin routes
- Use `nextIp()` pattern with a unique IP range (e.g., starting at 150)

### T4: Write admin UI unit tests
- Create `test/ui-admin.test.js`
- Test HTML shell structure (expected DOM ids, no external resources)
- Test security invariants (innerHTML assignments only use empty string)
- Test CSP and response headers on the admin UI route
- Extract and test any pure-logic formatter functions (if the UI includes byte formatting, percentage calculations, date formatting)
- Follow patterns from `ui-dashboard.test.js` and `ui-settings-usage.test.js` exactly

### T5: Verify no regression in existing tests
- After all new code is written, run `npm test` once to confirm no regressions
- Verify the admin rate limiter IP range does not collide with existing test files
- Check that `cleanDb()` covers any new tables (unlikely since we are using existing tables)

## Risks and Concerns

### Risk 1: Admin Rate Limiter Collisions
The admin rate limiter is 5 req/60s per IP. Every existing admin test file uses a `nextIp()` counter starting at a different base (admin-keys starts at 10, admin-usage starts at 100, account-usage starts at 200). **The new test file must use a non-overlapping IP range.** I recommend starting at 150 for the new admin dashboard tests. Document the range in the file header comment, matching the convention in existing admin test files.

### Risk 2: Aggregate Query Performance on D1
Aggregate queries with JOINs across `tenants`, `captures`, `usage_counters`, and `api_keys` will be live D1 queries. The "loads in under 2 seconds" success criterion means these queries must be efficient. Tests should assert on correctness, but the implementation should be reviewed for index usage. If the dashboard needs to aggregate across all tenants, consider:
- Whether existing indexes support the query plan
- Whether a new covering index is needed for the dashboard query
- Whether the query should limit/paginate results

Tests will not catch performance issues with small seed data, so this is an implementation concern, not a testing concern. But the test plan should flag it.

### Risk 3: Test Memory Budget
The test suite already consumes ~8 GB via workerd. Adding a new test file with many seed data scenarios will not significantly increase memory (D1 is in-memory SQLite, and we are talking about dozens of rows). However, **do not create a separate test file that runs in a different worker instance** -- all admin tests should share the same worker, which they do by default with vitest-pool-workers.

### Risk 4: Response Shape Drift Between API and UI
The admin dashboard UI (vanilla JS) will parse JSON responses from the admin API. If the API response shape changes, the UI breaks silently. The response shape tests (T3) catch API-side drift, but there is no mechanism to catch UI-side drift (the UI parses field names as strings in JS). Consider adding a comment in the admin UI JS that references the test file where the response contract is asserted, so future developers know to update both places.

### Risk 5: isolatedStorage is Disabled
The vitest config sets `isolatedStorage: false` due to R2 SQLite WAL issues. This means all tests in all files share the same D1 database instance across the test run. The `cleanDb()` in `beforeEach` is the only isolation mechanism. If a test fails to clean up (e.g., throws before `beforeEach` runs on the next test), subsequent tests may see stale data. This is an existing risk, not a new one, but aggregate queries are more sensitive to stale data than single-record queries.

## Additional Agents Needed

None beyond what is presumably already involved in the plan. The test strategy integrates with whatever DAL functions and API endpoints the implementation agent builds. No specialized tooling, infrastructure, or external dependencies are required.

The test approach is entirely within the existing testing stack: vitest + @cloudflare/vitest-pool-workers + real D1. No new test frameworks, no browser automation, no additional CI configuration needed.
