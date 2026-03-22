# Domain Plan Contribution: data-minion

## Recommendations

### D1 Feature Availability (Verified)

Cloudflare D1 is built on SQLite and supports all features this migration needs:

- **UPSERT**: `INSERT ... ON CONFLICT DO UPDATE` -- confirmed via community usage and D1 docs
- **Partial indexes**: `CREATE INDEX ... WHERE` -- explicitly documented in D1 best practices
- **JSON functions**: Full SQLite JSON extension (`json_extract`, `json_each`, `->`, `->>`, `json_set`, etc.)
- **Foreign keys**: Supported via `PRAGMA foreign_keys = ON` (must be enabled per connection)
- **Generated columns**: Supported
- **EXPLAIN QUERY PLAN**: Available for index validation
- **Batch statements**: `db.batch()` for multi-statement transactions

Key limits to respect:
- 10 GB max database size (ample for metadata -- artifacts stay in R2)
- 1 MiB max row size (captures with JSON blobs must stay well under this)
- 100 KB max SQL statement length per statement in a batch
- Large UPDATE/DELETE must be batched (1,000 rows at a time for migrations)

### Schema Design

The schema maps the four KV record types to four relational tables with proper indexes. Key design decisions:

**1. Captures table -- structured columns, not a JSON blob**

The current KV capture record stores everything as a flat JSON document. The D1 schema should decompose this into typed columns for the fields that get queried/filtered/sorted (`status`, `url`, `tenant_id`, `created_at`) while keeping variable-shape data (`artifacts`, `wacz`, `render`, `capture_settings`) as JSON columns.

This is the right tradeoff because:
- `WHERE status = ?` and `ORDER BY created_at` need real columns for index coverage
- `artifacts`, `wacz`, `render`, `capture_settings` are opaque blobs read whole -- never filtered or sorted on
- Avoids `json_extract` in WHERE clauses (which cannot use standard indexes)

**2. Tenants table -- implicit today, explicit in D1**

Currently tenants exist only as part of key prefixes and API key records. D1 should have an explicit `tenants` table that serves as the FK parent for `captures.tenant_id` and `api_keys.tenant_id`. The `tenant_config` currently in KV (`tenant:{tenantId}:config`) maps to a `config` JSON column on this table.

**3. API keys table -- keyed by hash, not auto-increment**

The `key_hash` (SHA-256 hex) is the natural primary key since every auth lookup goes `hash -> record`. No auto-increment ID needed. The hot-path query is `SELECT * FROM api_keys WHERE key_hash = ?` which hits the PK index directly.

**4. Signing keys table -- tiny table, simple design**

Single-digit rows over the service lifetime. Simple table, no special indexing needed.

### Proposed DDL

```sql
-- 0001_create_tables.sql

-- Enable foreign keys (D1 requires this per-connection, but setting it
-- in migration documents intent; application code must also set it)
PRAGMA foreign_keys = ON;

-- Tenants
-- Explicit tenant registry. Currently implicit in KV key prefixes.
CREATE TABLE tenants (
  id         TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9_-]*' AND length(id) BETWEEN 1 AND 64),
  config     TEXT,            -- JSON: rate limit overrides, future settings (nullable)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  updated_by TEXT
);

-- Captures
CREATE TABLE captures (
  id               TEXT PRIMARY KEY CHECK (id GLOB 'cap_[a-f0-9]*' AND length(id) = 36),
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  url              TEXT NOT NULL,
  ip               TEXT,
  created_at       TEXT NOT NULL,   -- ISO 8601, written at capture creation
  completed_at     TEXT,            -- set when status -> 'complete'
  failed_at        TEXT,            -- set when status -> 'failed'
  error            TEXT,            -- human-readable error for failed captures
  retryable        INTEGER,         -- 0 or 1, for failed captures
  render_quality   TEXT,            -- 'full' or 'partial'
  artifacts        TEXT,            -- JSON: { screenshot, screenshotBefore?, html, headers? }
  wacz             TEXT,            -- JSON: { key, bundleHash, size, keyId, timestampStatus }
  render           TEXT,            -- JSON: { waitUntilReached, timedOut, durationMs }
  capture_settings TEXT             -- JSON: { version, consent: { ... } }
);

-- Primary listing query: tenant's captures sorted by time, optionally filtered by status
CREATE INDEX idx_captures_tenant_created
  ON captures(tenant_id, created_at DESC);

-- Filtered listing: status + tenant + time (covers WHERE status = ? AND tenant_id = ?)
CREATE INDEX idx_captures_tenant_status_created
  ON captures(tenant_id, status, created_at DESC);

-- API Keys
CREATE TABLE api_keys (
  key_hash   TEXT PRIMARY KEY CHECK (length(key_hash) = 64),  -- SHA-256 hex
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  scopes     TEXT NOT NULL,     -- JSON array: ["capture", "read"] or ["capture", "read", "admin"]
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  revoked_at TEXT
);

-- List keys by tenant (admin panel, last-admin-key guard)
CREATE INDEX idx_api_keys_tenant
  ON api_keys(tenant_id, revoked, created_at);

-- Signing Keys
CREATE TABLE signing_keys (
  key_id      TEXT PRIMARY KEY CHECK (length(key_id) = 8),  -- 8-char hex fingerprint
  algorithm   TEXT NOT NULL DEFAULT 'Ed25519',
  public_key  TEXT NOT NULL,     -- base64-encoded raw 32-byte public key
  archived_at TEXT NOT NULL
);
```

### Index Design Rationale

**`idx_captures_tenant_created` on `(tenant_id, created_at DESC)`**

This is the workhorse index. The `listCaptures` endpoint always scopes by `tenant_id` and orders by `created_at`. With `DESC` ordering, the most common query (recent captures first) reads the index forward. D1/SQLite will use this for:
```sql
SELECT * FROM captures WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
```
At 10K rows per tenant, the B-tree seek is O(log n) plus a sequential scan of `LIMIT` rows. Well under 100ms.

**`idx_captures_tenant_status_created` on `(tenant_id, status, created_at DESC)`**

Covers the filtered query:
```sql
SELECT * FROM captures WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?
```
Without this, the query would scan the entire tenant partition and filter in-memory (exactly what the current KV implementation does with its overfetch-and-filter). With this covering index, SQLite seeks directly to the matching status partition.

**No partial index for pending captures self-cleanup**

The KV model uses `expirationTtl: 86400` to auto-expire stuck pending captures. D1 has no built-in TTL. Options:
- A scheduled cron (via Cloudflare Cron Triggers) that runs `DELETE FROM captures WHERE status = 'pending' AND created_at < datetime('now', '-24 hours')` -- simplest, matches the KV behavior
- A partial index `CREATE INDEX idx_captures_pending ON captures(created_at) WHERE status = 'pending'` would accelerate this cleanup query if the pending set grows large. At current scale, unnecessary -- the composite index already covers it. Add later if needed.

**PK on `api_keys.key_hash`**

The auth hot path is `SELECT * FROM api_keys WHERE key_hash = ?`. Making `key_hash` the PK means this is a direct rowid lookup via SQLite's internal index. No secondary index needed.

**`idx_api_keys_tenant` on `(tenant_id, revoked, created_at)`**

Covers admin list queries:
```sql
-- Active keys for a tenant
SELECT * FROM api_keys WHERE tenant_id = ? AND revoked = 0 ORDER BY created_at;
-- All keys including revoked
SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at;
```
The `revoked` column in the index lets SQLite skip revoked rows without a filter scan when `includeRevoked = false`.

### Pagination: Offset/Limit vs Cursor

The current KV implementation uses cursor-based pagination (opaque cursor wrapping KV's native cursor). For D1, I recommend **offset/limit pagination** for the captures list endpoint:

Reasons to switch from cursor to offset/limit:
1. **D1 is SQL** -- `LIMIT ? OFFSET ?` is native and efficient with the covering index
2. **Simpler API** -- no opaque cursor encoding/decoding, no cursor decode errors
3. **Supports "jump to page"** -- offset allows skipping to page N directly
4. **10K rows per tenant** -- at this scale, offset performance is identical to cursor (no deep-scan penalty until 100K+)
5. **Status filter works natively** -- `WHERE status = ?` eliminates the overfetch-and-filter hack

The API should still return `hasMore` (computed as `offset + limit < total_count`).

However: **if the API contract with external consumers is already published and uses cursor-based pagination**, preserve the cursor API but implement it with `OFFSET/LIMIT` internally (encode offset into the cursor). This avoids a breaking API change. The planning team should confirm whether the cursor API is published.

### Migration Strategy: KV Data to D1

Since there are no external users yet, this is a clean migration with no dual-write requirement. The migration has three phases:

**Phase A: Schema creation (wrangler migration)**
- Create D1 database via wrangler: `wrangler d1 create wrl-metadata` (production) and `wrangler d1 create wrl-metadata-staging` (staging)
- Apply DDL migration: `wrangler d1 migrations apply wrl-metadata --remote`
- Add D1 binding to `wrangler.toml`

**Phase B: Data migration script (one-time)**
- A standalone script (not a migration SQL file) that reads all records from KV and inserts into D1
- Must run against both staging and production KV namespaces
- Must handle the tenant bootstrapping problem: scan API keys to discover all tenant IDs, insert into `tenants` table first, then migrate captures and API keys with FK constraints satisfied
- Batch inserts in chunks of 100 rows (D1 batch limit considerations)
- Idempotent: use `INSERT OR IGNORE` so re-runs skip existing records

**Phase C: Code cutover**
- Replace all `kv.js` function implementations to use `env.DB` (D1 binding) instead of `env.KV`
- Remove secondary index key management (no more `tenant:{id}:ts:{ISO}:{captureId}` keys)
- Remove cursor encode/decode logic, replace with offset/limit
- Keep `env.KV` binding for rate limit counters only (`rl:*` keys)

Detailed migration script pseudocode:

```js
// migrate-kv-to-d1.js -- run via wrangler or as a one-off Worker

async function migrateAll(env) {
  // 1. Discover tenants from API keys
  const apiKeyList = await env.KV.list({ prefix: 'apikey:' });
  const tenantIds = new Set();

  for (const k of apiKeyList.keys) {
    const record = await env.KV.get(k.name, 'json');
    if (record?.tenantId) tenantIds.add(record.tenantId);
  }

  // Also discover from captures (legacy 'default' tenant)
  // and tenant config keys
  const configList = await env.KV.list({ prefix: 'tenant:' });
  for (const k of configList.keys) {
    const match = k.name.match(/^tenant:([^:]+):config$/);
    if (match) tenantIds.add(match[1]);
  }

  // 2. Insert tenants
  const tenantStmts = [...tenantIds].map(id =>
    env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(id)
  );
  // Also migrate tenant configs
  for (const id of tenantIds) {
    const config = await env.KV.get(`tenant:${id}:config`, 'json');
    if (config) {
      tenantStmts.push(
        env.DB.prepare(
          'UPDATE tenants SET config = ?, updated_at = ?, updated_by = ? WHERE id = ?'
        ).bind(JSON.stringify(config), config.updatedAt, config.updatedBy, id)
      );
    }
  }
  await env.DB.batch(tenantStmts);

  // 3. Migrate API keys (batch in chunks of 100)
  for (const k of apiKeyList.keys) {
    const hash = k.name.slice('apikey:'.length);
    const record = await env.KV.get(k.name, 'json');
    if (!record) continue;
    // ... batch INSERT OR IGNORE into api_keys
  }

  // 4. Migrate captures (batch in chunks of 100)
  const captureList = await env.KV.list({ prefix: 'capture:' });
  for (const k of captureList.keys) {
    const record = await env.KV.get(k.name, 'json');
    if (!record) continue;
    // Ensure tenant exists (for pre-R8 records without tenantId)
    if (record.tenantId && !tenantIds.has(record.tenantId)) {
      tenantIds.add(record.tenantId);
      await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(record.tenantId).run();
    }
    // ... batch INSERT OR IGNORE into captures
  }

  // 5. Migrate signing keys
  const signingKeyList = await env.KV.list({ prefix: 'signing-key:' });
  // ... INSERT OR IGNORE into signing_keys
}
```

### Foreign Key Enforcement

D1 (SQLite) does not enable foreign keys by default. `PRAGMA foreign_keys = ON` must be set per connection. In the Workers context, this means:

- The D1 binding creates a new connection per request
- The application code must run `PRAGMA foreign_keys = ON` as the first statement in every batch or use a wrapper function
- The migration data load should temporarily defer FKs (`PRAGMA defer_foreign_keys = true`) to allow inserting tenants and captures in the same batch

Recommended pattern:

```js
// db.js -- D1 access layer wrapper
export async function withForeignKeys(db, fn) {
  await db.prepare('PRAGMA foreign_keys = ON').run();
  return fn(db);
}
```

### Column Type Choices

SQLite is dynamically typed, but the schema uses `TEXT` for ISO 8601 timestamps rather than `INTEGER` (Unix epoch) because:
1. The existing KV records store ISO strings -- no conversion needed during migration
2. The API returns ISO strings -- no conversion needed on read
3. SQLite compares ISO 8601 strings correctly for `ORDER BY` and range queries (lexicographic order matches chronological order for UTC timestamps)
4. `strftime` functions work with both formats, but ISO is more readable in raw queries

`INTEGER` is used only for `revoked` (0/1 boolean) and `retryable` (0/1 boolean) since SQLite has no native boolean type.

JSON columns (`artifacts`, `wacz`, `render`, `capture_settings`, `config`, `scopes`) use `TEXT` since D1 supports the JSON extension for extraction but the column type is still TEXT under the hood.

### Pending Capture Expiration

The KV model uses `expirationTtl: 86400` to auto-expire pending captures. D1 has no TTL mechanism. Two options:

**Option A (Recommended): Cron Trigger cleanup**
Add a scheduled handler that runs every hour:
```js
async function scheduled(event, env) {
  await env.DB.prepare(
    "DELETE FROM captures WHERE status = 'pending' AND created_at < datetime('now', '-24 hours')"
  ).run();
}
```
This matches the KV behavior. The `idx_captures_tenant_status_created` index covers this query efficiently.

**Option B: Application-level soft expiry**
Leave pending records in the table but treat them as expired in queries:
```sql
WHERE status != 'pending' OR created_at > datetime('now', '-24 hours')
```
More complex, pollutes the table over time. Not recommended.

## Proposed Tasks

### Task 1: Create D1 databases and DDL migration
**What**: Create `wrl-metadata` (production) and `wrl-metadata-staging` (staging) D1 databases. Write the `0001_create_tables.sql` migration file with the schema above. Add `[[d1_databases]]` bindings to `wrangler.toml` for both environments.
**Deliverables**: Updated `wrangler.toml`, `migrations/0001_create_tables.sql`
**Dependencies**: None

### Task 2: Write the D1 data access layer (`db.js`)
**What**: New module `src/db.js` that replaces `src/kv.js` for all non-rate-limit operations. Exports the same function signatures but uses `env.DB` (D1 binding). Implements:
- `createCapture(db, ...)` -- `INSERT INTO captures`
- `completeCapture(db, ...)` -- `UPDATE captures SET status = 'complete', ...`
- `failCapture(db, ...)` -- `UPDATE captures SET status = 'failed', ...`
- `getCapture(db, captureId)` -- `SELECT * FROM captures WHERE id = ?`
- `listCaptures(db, tenantId, { offset, limit, status })` -- proper `WHERE` + `ORDER BY` + `LIMIT/OFFSET`
- `createApiKeyRecord(db, ...)` -- `INSERT INTO api_keys`
- `getApiKeyRecord(db, keyHash)` -- `SELECT * FROM api_keys WHERE key_hash = ?`
- `revokeApiKeyRecord(db, keyHash)` -- `UPDATE api_keys SET revoked = 1, ...`
- `listApiKeyRecords(db, { tenantId, includeRevoked })` -- proper `WHERE` clause
- `archiveSigningKey(db, ...)` -- `INSERT OR IGNORE INTO signing_keys`
- `getArchivedSigningKey(db, keyId)` -- `SELECT * FROM signing_keys WHERE key_id = ?`
- `listArchivedSigningKeys(db)` -- `SELECT * FROM signing_keys`
- `getTenantConfig(db, tenantId)` -- `SELECT config FROM tenants WHERE id = ?`
- `setTenantConfig(db, tenantId, config, updatedBy)` -- `UPDATE tenants SET config = ?, ...`
- FK pragma wrapper

**Deliverables**: `src/db.js`, unit tests
**Dependencies**: Task 1 (schema must be finalized)

### Task 3: Write one-time KV-to-D1 migration script
**What**: A standalone script (runnable as a Worker or via `wrangler d1 execute`) that reads all KV records and inserts into D1. Must be idempotent (re-runnable). Handles: tenant discovery, FK ordering, batch chunking (100 rows), JSON column serialization, pre-R8 records without tenantId (assign to 'default' tenant).
**Deliverables**: `scripts/migrate-kv-to-d1.js`, instructions in evolution log
**Dependencies**: Task 1 (D1 databases must exist), Task 2 (share column mapping)

### Task 4: Wire D1 into application code
**What**: Update all call sites in `src/index.js`, `src/capture.js`, `src/auth.js`, `src/admin.js` to use `db.js` instead of `kv.js` for metadata operations. Keep `kv.js` for rate limit counters only. Update `listCaptures` caller to use offset/limit instead of cursor.
**Deliverables**: Updated source files, `kv.js` reduced to rate-limit-only functions
**Dependencies**: Task 2

### Task 5: Add pending capture cleanup via Cron Trigger
**What**: Add a `scheduled` export to the Worker that deletes pending captures older than 24 hours. Configure in `wrangler.toml` with `[triggers] crons = ["0 * * * *"]` (hourly).
**Deliverables**: Scheduled handler in `src/index.js`, updated `wrangler.toml`
**Dependencies**: Task 1

### Task 6: Verify index effectiveness
**What**: After data migration, run `EXPLAIN QUERY PLAN` against the key queries to confirm index usage. Document results. Queries to verify:
- `SELECT ... FROM captures WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`
- `SELECT ... FROM captures WHERE tenant_id = ? AND status = ? ORDER BY created_at DESC LIMIT 20`
- `SELECT * FROM api_keys WHERE key_hash = ?`
- `SELECT * FROM api_keys WHERE tenant_id = ? AND revoked = 0 ORDER BY created_at`
**Deliverables**: EXPLAIN QUERY PLAN output in evolution log `outcome.md`
**Dependencies**: Task 1, Task 3 (needs data for realistic plans)

## Risks and Concerns

### 1. PRAGMA foreign_keys is not persistent in D1
D1 connections are per-request; `PRAGMA foreign_keys = ON` must be set every time. If the application code forgets this, FK violations will silently succeed. The wrapper pattern I described mitigates this, but it is a footgun. Consider whether FKs are worth the ceremony -- at this scale (single-digit tenants, low write volume), application-level validation may be sufficient and simpler. **Recommendation: keep FKs in the DDL for documentation/correctness, enforce via wrapper, but don't panic if a request skips it -- the data invariants are also checked in application code.**

### 2. Offset pagination degrades at very high offsets
`OFFSET 50000 LIMIT 20` still scans 50,000 index entries before returning 20 rows. At the stated 10K rows per tenant target, this is a non-issue. If a single tenant ever reaches 100K+ captures, switch to keyset pagination (`WHERE created_at < ? ORDER BY created_at DESC LIMIT 20`) which is O(1) regardless of offset. The schema supports both approaches -- no migration needed, just a query change.

### 3. Pre-R8 captures without tenantId
The code comments mention "pre-R8 records" that have no `tenantId`. These must be assigned to a default tenant during migration. The migration script must create a `default` tenant if it doesn't exist and assign orphaned captures to it. The `captures.tenant_id` is `NOT NULL`, so this is mandatory.

### 4. D1 eventual consistency
D1 uses a primary writer with read replicas. Writes are immediately visible to the same Worker invocation, but there may be replication lag for subsequent requests routed to different replicas. For this workload (capture status updates read by the same user shortly after), this is acceptable. The critical path -- `createCapture` followed by queue consumer `completeCapture` -- is write-then-write, not read-after-write across replicas.

### 5. Migration script must handle KV list pagination
`kv.list()` returns at most 1,000 keys per call. The migration script must paginate through all KV keys using the cursor. At current data volumes this is a handful of pages, but the script must handle it correctly to be robust.

### 6. JSON column size and the 1 MiB row limit
The `artifacts`, `wacz`, `render`, and `capture_settings` JSON columns are small (a few hundred bytes each). The `url` column could theoretically be long but is bounded by the HTTP spec (~8KB practical limit). No risk of hitting the 1 MiB row limit with this schema.

### 7. Cron Trigger for cleanup requires Workers Paid plan
Verify that the current plan supports Cron Triggers. If not, an alternative is to piggyback cleanup on the next capture request (delete stale pendings during `listCaptures`), but this couples unrelated concerns.

### 8. Rate limit counters stay in KV
The rate limit counters (`rl:*` keys) must remain in KV because they use `expirationTtl` for automatic cleanup and require sub-millisecond latency for the hot auth path. D1's SQL overhead (~5-10ms per query) is acceptable for metadata but not for rate limiting that runs on every request. This is the correct polyglot persistence decision: KV for ephemeral counters, D1 for structured metadata.

## Additional Agents Needed

- **iac-minion**: Needed to handle the D1 database provisioning (`wrangler d1 create`), binding configuration in `wrangler.toml`, and Cron Trigger setup. The schema design is this agent's domain, but the infrastructure provisioning is iac-minion's.
- **test-minion**: The test suite (`test/kv.test.js`) must be rewritten for the D1 data layer. D1 has local testing support via `wrangler dev --local` and Miniflare's D1 simulator. The test-minion should design the test strategy for the new `db.js` module, including migration script verification.

No other specialists needed. The api-design-minion should weigh in on whether to preserve cursor-based pagination in the API contract or switch to offset/limit (noted as an open question above).
