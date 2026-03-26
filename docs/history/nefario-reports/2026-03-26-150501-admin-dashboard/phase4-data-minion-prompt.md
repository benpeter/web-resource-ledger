## Task: Add three admin dashboard DAL functions to src/db.js

You are adding three new data access layer functions to the existing src/db.js module for an admin dashboard. These functions provide read-only aggregate views of tenant and usage data. No schema changes or migrations are needed -- all queries work against existing tables and indexes.

### Context

The existing DAL in src/db.js follows strict conventions:
- All DB access is centralized in this module (no raw env.DB.prepare() elsewhere)
- Functions use db.prepare(...).bind(...) for parameterized queries
- Functions return plain JS objects with camelCase keys (transformed from snake_case DB columns)
- db.batch() is used when multiple statements need to execute in a single round-trip
- The computePeriod() function (already exported from db.js) returns the current YYYY-MM period string

The relevant tables are:
- tenants -- columns: id, tier, billing_status, grace_period_end, payment_method_added_at, stripe_customer_id, eidas_qualified, config, created_at, updated_at
- usage_counters -- columns: tenant_id, period, capture_count, storage_bytes, api_call_count, eidas_capture_count, updated_at. Composite PK: (tenant_id, period)
- api_keys -- columns: key_hash, tenant_id, scopes, name, created_at, created_by, revoked, revoked_at

### Functions to add

1. listTenantsWithUsage(db, period)
2. getTenantDetail(db, tenantId, periodLimit = 6)
3. getOverviewStats(db, period)

See full synthesis plan for SQL queries and return shapes.

### Implementation rules
- Export all three functions
- Follow the exact coding style of existing functions
- Use COALESCE for LEFT JOINs
- No new indexes needed
- Do NOT add standalone getUsageHistory (YAGNI, embedded in getTenantDetail)

### Files to modify
- src/db.js

### Success criteria
- All three functions exported
- Parameterized queries
- camelCase return keys
- db.batch() used where multiple statements needed
