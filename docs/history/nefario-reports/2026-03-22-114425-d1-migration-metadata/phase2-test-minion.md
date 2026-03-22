## Domain Plan Contribution: test-minion

### Recommendations

#### 1. vitest.config.js and wrangler.test.toml changes for D1

**wrangler.test.toml** -- Add a D1 binding alongside the existing KV binding. KV stays for rate limit counters (`rl:*` prefixed keys); D1 takes over captures, API keys, tenants, and signing key archive.

```toml
[[d1_databases]]
binding = "DB"
database_name = "wrl-metadata"
database_id = "local-test-db"        # miniflare ignores the real ID
migrations_dir = "migrations"        # convention: ./migrations/0001_*.sql
```

**vitest.config.js** -- Use `readD1Migrations` from `@cloudflare/vitest-pool-workers/config` to load migration SQL at config time. Pass them into miniflare bindings so the setup file can apply them.

```js
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import path from 'node:path';

const migrations = readD1Migrations(path.resolve(__dirname, 'migrations'));

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/apply-migrations.js'],
    // ... existing config
    poolOptions: {
      workers: {
        miniflare: {
          bindings: {
            // ... existing bindings
            TEST_MIGRATIONS: migrations,
          },
          // D1 binding is picked up from wrangler.test.toml automatically
        },
      },
    },
  },
});
```

**test/apply-migrations.js** -- New setup file (runs once per worker, outside isolated storage):

```js
import { env, applyD1Migrations } from 'cloudflare:test';
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

This is the official Cloudflare-documented pattern. The `readD1Migrations` / `applyD1Migrations` pair is idempotent -- safe to call multiple times, only unapplied migrations run.

#### 2. Test cleanup: replacing KV list/delete with D1 DELETE FROM

The current beforeEach pattern in nearly every test file is:

```js
const { keys } = await env.KV.list({ prefix: 'tenant:' });
for (const k of keys) await env.KV.delete(k.name);
```

The D1 equivalent is far cleaner and much faster. Replace with:

```js
beforeEach(async () => {
  await env.DB.exec('DELETE FROM captures');
  await env.DB.exec('DELETE FROM api_keys');
  await env.DB.exec('DELETE FROM tenant_config');
  // signing_keys table if that moves to D1 too
});
```

This is a single SQL statement per table -- no iteration, no pagination edge cases. Use `DELETE FROM` (not `DROP TABLE` + re-create) because the schema comes from the migration setup file that only runs once per worker. Truncation preserves the schema and indexes.

**Do NOT use PRAGMA or sqlite-specific reset commands.** D1's SQL dialect is a subset of SQLite, but `DELETE FROM` is the standard, portable, documented approach. There is no `TRUNCATE TABLE` in SQLite/D1.

If you want maximum speed and are certain no foreign key constraints cascade, you could batch them:

```js
await env.DB.batch([
  env.DB.prepare('DELETE FROM captures'),
  env.DB.prepare('DELETE FROM api_keys'),
  env.DB.prepare('DELETE FROM tenant_config'),
]);
```

`DB.batch()` runs all statements in a single roundtrip, which is faster than sequential `.exec()` calls.

#### 3. test/kv.test.js becomes test/db.test.js

This is the data layer test file. It currently tests 15+ functions exported from `src/kv.js` against the real miniflare KV binding. The migration plan:

- **Rename** `test/kv.test.js` to `test/db.test.js`.
- **Change imports** from `../src/kv.js` to `../src/db.js` (or whatever the new module name is).
- **Update function signatures**: The new DB functions will take `env.DB` instead of `env.KV` as the first argument. Every `createCapture(env.KV, ...)` becomes `createCapture(env.DB, ...)`.
- **Remove KV-specific assertions**: Tests that verified KV key prefixes (`capture:{id}`, `tenant:default:ts:...`) and secondary index keys are no longer relevant. Replace with tests that verify:
  - Correct SQL row insertion (SELECT after INSERT, verify columns).
  - Status transitions are enforced (pending -> complete, pending -> failed).
  - Tenant isolation via WHERE clause (critical: SQL injection prevention).
- **Keep pure-logic tests unchanged**: `tenantPrefix` validation, `rateLimitWindowId`, `rateLimitCounter` -- these remain KV-based (rate limits stay in KV). Keep them in `test/kv.test.js` or extract to a `test/rate-limit.test.js`.
- **Add SQL-specific tests**: See recommendation 7 below.

The test count should stay roughly the same. The semantics being tested (create, read, update, list, filter, paginate) are identical; only the storage backend changes.

#### 4. test/list-captures.test.js -- expand for SQL filtering/sorting

The existing file has 25 tests covering auth, empty results, response shape, status filter, pagination, headers, and rate limits. Most of these test HTTP endpoint behavior and will need minimal changes -- the HTTP contract doesn't change, just the backend.

**Changes needed:**

- **seedCapture/seedComplete/seedFailed helpers**: Update to call the new DB functions instead of KV functions. The helper signatures at the top of the file use `createCapture(env.KV, ...)` -- switch to `createCapture(env.DB, ...)`.
- **beforeEach cleanup**: Replace KV list/delete loop with `DELETE FROM captures`.
- **Pagination tests**: These should still pass since the endpoint returns the same envelope. However, cursor encoding will change (KV cursor is an opaque string from KV.list; D1 cursor will likely be a base64-encoded `{createdAt, id}` tuple). Verify the round-trip pagination test (`CRITICAL: round-trip pagination -- 25 items, 3 pages`) still works after the cursor format changes.

**New tests to add:**

- **Sort order validation**: D1 enables proper `ORDER BY created_at DESC` (newest first) or ASC. Add a test verifying default sort order with timestamps 1 second apart and asserting the response order matches.
- **URL-based filtering** (if adding `?url=` filter): Test prefix matching, exact matching, and SQL injection prevention (`?url='; DROP TABLE captures; --` should return 400 or empty results, not crash).
- **Date range filtering** (if adding `?since=` / `?until=`): Test ISO 8601 parsing, invalid date strings returning 400, boundary conditions.
- **Combined filters**: `?status=complete&limit=5&since=2024-01-01` -- verify that multiple WHERE clauses compose correctly.

#### 5. test/admin-keys.test.js and test/auth.test.js changes

**auth.test.js** -- This file tests `verifyApiKey` and `verifyAdminKey` functions from `src/auth.js`. The auth functions currently read from `env.KV` via `getApiKeyRecord`.

Changes:
- The `cleanupApiKeys` function (lines 17-19) currently does `env.KV.list({ prefix: 'apikey:' })` then deletes each. Replace with `env.DB.exec('DELETE FROM api_keys')`.
- `seedApiKey` in `test/fixtures.js` writes directly to `env.KV.put(apikey:...)`. It must be updated to INSERT into the D1 `api_keys` table instead. The function should become:

```js
export async function seedApiKey(db, rawKey, opts) {
  const keyHash = await hashApiKey(rawKey);
  await db.prepare(
    'INSERT INTO api_keys (key_hash, tenant_id, scopes, name, created_at, created_by, revoked, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(keyHash, opts.tenantId, JSON.stringify(opts.scopes), opts.name || 'test-key',
    new Date().toISOString(), 'test', opts.revoked ? 1 : 0, opts.revokedAt || null).run();
  return keyHash;
}
```

- The test on line 89 that manually writes invalid KV JSON (`env.KV.put(apikey:${keyHash}, JSON.stringify({tenantId: 'INVALID TENANT!', ...}))`) should become a direct D1 insert with invalid data -- or test the validation at the application layer instead. If the DB schema has a CHECK constraint on tenant_id format, the test should verify the constraint rejects the insert.
- **KV error simulation** (line 287-298): The test creates a `faultyKV` spy that throws on `.get()`. The D1 equivalent would be a `faultyDB` that throws on `.prepare().bind().first()`. The test structure stays the same but the mock interface changes.

**admin-keys.test.js** -- This file tests HTTP endpoints (`POST/GET/DELETE /v1/admin/keys`) via `SELF.fetch()`. These are integration tests that go through the full worker.

Changes:
- `cleanupApiKeys` (line 57-59): Replace `env.KV.list/delete` with `DELETE FROM api_keys`.
- Everything else should work unchanged because these tests hit the HTTP layer, not the storage layer directly. The worker internally switches from KV to D1, but the HTTP contract is identical.
- The last-admin-key guard tests (line 351-452) are particularly important to preserve because they test a business rule (cannot revoke the sole admin key for a tenant). This rule will be implemented differently in SQL (COUNT query instead of KV list/filter), but the HTTP behavior must be identical.

**Fixture updates** (test/fixtures.js):
- `seedApiKey` must change from `kv.put()` to `db.prepare().bind().run()`. This is the single most impactful fixture change since it's imported by auth.test.js, admin-keys.test.js, and mcp.test.js.
- The function signature changes from `seedApiKey(kv, rawKey, opts)` to `seedApiKey(db, rawKey, opts)`.

#### 6. isolatedStorage: false and D1

The current comment explains: "R2 isolated storage uses SQLite WAL files that can remain open between tests, causing 'failed to pop isolated storage stack frame' errors."

**D1 introduces the same risk**, possibly worse. D1 in miniflare is backed by SQLite with WAL mode. If isolated storage is enabled, each test gets its own D1 snapshot, but WAL file sharing between the D1 and R2 SQLite instances could amplify the existing instability.

**Recommendation: Keep `isolatedStorage: false` for now.** This is the safer option since:
1. The R2 WAL issue that originally motivated this setting still exists.
2. Adding D1 (another SQLite-backed binding) does not fix the underlying problem.
3. All tests already perform explicit cleanup in beforeEach, which is the correct pattern when isolatedStorage is off.
4. D1 cleanup (`DELETE FROM`) is faster and more reliable than KV cleanup (list + iterate + delete).

If in the future miniflare resolves the WAL/R2 isolation issue, the switch to `isolatedStorage: true` would be beneficial because it eliminates the need for manual cleanup entirely. But that is not a change to make during this migration.

#### 7. SQL-specific tests (EXPLAIN QUERY PLAN, etc.)

**Do not add EXPLAIN QUERY PLAN tests to the regular test suite.** Here is why:

- EXPLAIN output is implementation-specific and changes between SQLite versions. Miniflare's SQLite may differ from production D1's SQLite build.
- Query plan assertions are brittle -- adding a column, changing data volume, or updating SQLite can change the plan without affecting correctness.
- The purpose of EXPLAIN is human analysis during development, not automated regression.

**Instead, do this:**

1. **Add a one-time verification script** (`scripts/verify-indexes.sh` or similar) that runs EXPLAIN QUERY PLAN for critical queries and prints the output for human review. Run it during migration development and before deploying, not in CI.

2. **Add integration-level performance assertions** in the test suite where they provide value:
   - Listing 100 captures with a tenant filter should complete in under 50ms (wall clock).
   - These catch "missing index" regressions without being coupled to SQLite internals.

3. **Document the expected indexes** in the migration SQL files as comments:
   ```sql
   -- Index: captures_tenant_created covers WHERE tenant_id = ? ORDER BY created_at
   CREATE INDEX idx_captures_tenant_created ON captures(tenant_id, created_at);
   ```

4. **Test the migration itself**: Add a test that verifies the migration creates the expected tables and indexes by querying `sqlite_master`:
   ```js
   it('migration creates captures table with expected indexes', async () => {
     const result = await env.DB.prepare(
       "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='captures'"
     ).all();
     const indexNames = result.results.map(r => r.name);
     expect(indexNames).toContain('idx_captures_tenant_created');
   });
   ```
   This is stable -- it tests that the schema migration was applied correctly, not the optimizer's behavior.

### Proposed Tasks

**Task 1: Create migration SQL and setup file** (prerequisite for all other tasks)
- Write `migrations/0001_initial_schema.sql` with tables for captures, api_keys, tenant_config, signing_keys.
- Create `test/apply-migrations.js` setup file.
- Update `vitest.config.js` with `readD1Migrations`, `TEST_MIGRATIONS` binding, and `setupFiles`.
- Update `wrangler.test.toml` with `[[d1_databases]]` section.
- Verify migrations apply and a trivial test passes.
- Estimated scope: small.

**Task 2: Update test/fixtures.js**
- Change `seedApiKey` from KV to D1.
- Add a `cleanDb` helper that runs `DELETE FROM` on all tables (reusable across test files).
- Add D1-based seed helpers for captures if needed (`seedCapture(db, ...)`, `seedCompleteCapture(db, ...)`).
- This is a shared dependency -- must be done before updating individual test files.
- Estimated scope: small.

**Task 3: Migrate test/kv.test.js to test/db.test.js**
- Rename file.
- Update all imports and function calls.
- Replace KV-specific assertions with D1-equivalent assertions.
- Split out rate-limit tests (which stay KV-based) into test/rate-limit.test.js or keep them in kv.test.js with a clear comment.
- Verify all tests pass.
- Estimated scope: medium (this file has ~60 tests).

**Task 4: Migrate test/list-captures.test.js**
- Update helpers and beforeEach cleanup.
- Verify all existing pagination/filter tests pass.
- Add new tests for sort order, combined filters, SQL injection prevention.
- Estimated scope: medium.

**Task 5: Migrate test/auth.test.js and test/admin-keys.test.js**
- Update cleanup functions.
- Update seedApiKey calls to use DB.
- Update the KV error simulation test to simulate D1 errors.
- Verify all existing tests pass.
- Estimated scope: medium.

**Task 6: Migrate remaining test files that touch KV for metadata**
- Files identified from grep: capture.test.js, capture-retrieval.test.js, verify-integration.test.js, verify-html.test.js, wacz.test.js, signing-key.test.js, key-rotation.test.js, queue-consumer.test.js, batch-capture.test.js, mcp.test.js, and integration/advisory.test.js, integration/capture-pipeline.test.js.
- Each file needs: import updates, cleanup updates, seed function updates.
- Some files (mcp.test.js) write raw KV data -- these need SQL INSERTs instead.
- Estimated scope: large (12+ files, but mostly mechanical changes).

**Task 7: Add schema verification test**
- Test that migrations produce the expected tables, columns, and indexes.
- One test file, ~5 assertions.
- Estimated scope: small.

### Risks and Concerns

1. **Blast radius of fixture changes.** `seedApiKey` in `test/fixtures.js` is imported by auth.test.js, admin-keys.test.js, and mcp.test.js. Changing its signature from `(kv, ...)` to `(db, ...)` breaks all callers simultaneously. **Mitigation**: Update fixtures.js and all callers in the same commit, or temporarily support both signatures during transition.

2. **Raw KV writes in tests.** Several test files write directly to `env.KV.put()` instead of going through the data layer (mcp.test.js lines 266-440, batch-capture.test.js line 53, auth.test.js line 89). These bypassed the abstraction layer for test-specific scenarios. When migrating, each raw write must be understood and converted to the correct SQL INSERT, not blindly translated. Some may be testing edge cases that the D1 schema prevents (like invalid tenantId in auth.test.js line 89).

3. **Cursor format change.** The KV-backed cursor is opaque (returned by KV.list). The D1-backed cursor will be application-controlled (likely base64 of `{createdAt, id}`). Existing tests that assert cursor format (e.g., "invalid cursor returns 400") are fine, but tests that rely on specific cursor encodings may need updating.

4. **isolatedStorage: false means tests share D1 state.** With `isolatedStorage: false`, all tests in a single worker thread share the same D1 database. If a beforeEach cleanup misses a table, data leaks between tests. **Mitigation**: Use the centralized `cleanDb` helper from fixtures.js that truncates ALL metadata tables. Make it easy to add new tables to the cleanup list.

5. **D1 batch API semantics differ from KV.** KV operations are independent -- one failure does not roll back others. D1 `batch()` runs in a transaction -- if one statement fails, all are rolled back. Tests that previously relied on partial KV writes (e.g., write capture record but not index key) may need adjustment since D1 provides transactional consistency.

6. **Signing key archive.** The `signing-key:*` KV prefix is used by `signing-key.test.js` and `key-rotation.test.js`. If signing keys move to D1, those tests need updating too. If they stay in KV, those tests remain untouched. The migration plan should make a clear decision about this and communicate it.

7. **Performance regression in test execution.** KV cleanup (list + iterate + delete) is O(n) and slow for large datasets. D1 cleanup (`DELETE FROM`) is O(1) SQL but triggers actual SQLite operations. In practice, D1 cleanup should be faster for the typical test dataset sizes (< 100 records). But if a test seeds thousands of rows, DELETE without a WHERE clause could be slow. The 25-item round-trip pagination test is the largest current dataset -- should be fine.

8. **Rate limit counters must stay in KV.** The `rl:*` prefixed keys and `rateLimitCounter` / `rateLimitWindowId` functions use KV for sliding window counters with TTL-based expiration (`expirationTtl`). D1 does not have automatic key expiration. These must remain in KV, and the KV binding must be preserved in wrangler.test.toml for this purpose. Tests for rate limiting (`rateLimitCounter`, `rateLimitWindowId`, the KV counter mock tests) should not be migrated.

### Additional Agents Needed

- **api-design-minion**: The D1 migration will change cursor encoding for pagination. If the cursor format is part of the API contract (even informally), the API design perspective should confirm that a breaking cursor change is acceptable given there are no external users yet. Also, if new query parameters are being added (sort, date range, URL filter), the OpenAPI spec needs updating alongside the tests.

- **db-minion** (or equivalent data specialist): The schema design (table structure, indexes, foreign keys, CHECK constraints, column types) should be reviewed by someone with SQL expertise before tests are written against it. Test assertions about schema correctness are only as good as the schema design. Specifically: should `scopes` be a JSON array column or a junction table? Should `tenant_id` have a foreign key to a tenants table? These decisions affect test design.
