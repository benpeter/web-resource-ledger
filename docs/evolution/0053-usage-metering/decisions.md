# Decisions: R25 Usage Metering

## Single-table UPSERT over multi-table normalization

**Chosen**: Single `usage_counters` table with composite PK `(tenant_id, period)` and D1 UPSERT (`INSERT ... ON CONFLICT DO UPDATE SET col = col + excluded.col`).

**Over**: Separate counter tables per metric, or a normalized event log with aggregation queries.

**Why**: One table, one atomic SQL statement per increment. No joins, no aggregation at query time. D1 UPSERT is atomic -- no read-modify-write race. The composite PK enforces one row per tenant per billing period without secondary indexes. data-minion proposed this; no specialist disagreed.

## waitUntil for all counter increments

**Chosen**: All `incrementUsage()` calls wrapped in `ctx.waitUntil()` with `.catch()` swallowing failures to `console.warn`.

**Over**: Synchronous D1 writes in the request path; in-memory batching with periodic flush.

**Why**: Issue #101 explicitly requires "counter increments must not add measurable latency to the capture hot path." waitUntil defers the D1 write to after the response is sent. In-memory batching was rejected because Worker restarts would lose unflushed data (issue requires "survives Worker restarts"). The catch-and-warn pattern means a failed counter increment never breaks a capture or API response.

## Centralized tenantExists() DAL function

**Chosen**: New `tenantExists(db, tenantId)` function in `src/db.js` returning a boolean via `SELECT 1 FROM tenants WHERE id = ?`.

**Over**: Inline `env.DB.prepare()` in the admin handler; reusing `getTenantConfig()` (which returns the full row or null).

**Why**: Code review (lucy) caught a raw `env.DB.prepare()` call in `admin.js`, violating the db.js centralization invariant. `getTenantConfig()` returns more data than needed and its null semantics are overloaded (tenant doesn't exist vs. no config). A dedicated boolean function is clearer.

## TextEncoder for consistent byte counting

**Chosen**: `new TextEncoder().encode(str).byteLength` for both HTML and headers JSON.

**Over**: `String.length` for headers (which counts UTF-16 code units, not bytes).

**Why**: Code review (code-review-minion) caught inconsistent measurement. HTML already used TextEncoder; headers used `.length`. Since storage bytes are reported to tenants for billing, consistency matters. UTF-8 byte count matches what R2 actually stores.

## Chained .then() for success logging

**Chosen**: `incrementUsage(...).then(() => log(...))` -- success log fires only after the counter increment succeeds.

**Over**: Parallel fire-and-forget for both increment and log.

**Why**: Logging "counter incremented" when the increment might have failed is misleading for operators debugging billing discrepancies. The chained approach means the log entry is a reliable signal. If the increment fails, the outer `.catch()` logs the failure to console.warn instead.

## computePeriod() as pure function

**Chosen**: `computePeriod(date = new Date())` using `date.toISOString().slice(0, 7)` for UTC YYYY-MM.

**Over**: Letting callers compute the period string; storing period as integer (e.g., 202603).

**Why**: Centralizing period computation ensures UTC everywhere (no timezone bugs at month boundaries). The `date` parameter enables deterministic testing. String format matches the CHECK constraint in the migration SQL (`GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'`).

## Only 3 handlers get API call counting (not 6)

**Chosen**: `incrementUsage({ apiCalls: 1 })` added to `handleCreateCapture`, `handleBatchCapture`, and `handleListCaptures` only.

**Over**: Instrumenting all 6 handlers that appear to do authentication.

**Why**: Lucy caught in Phase 3.5 that the synthesis listed "6 authenticated handlers" but only 3 actually call `verifyApiKey` (tenant-scoped auth). The other handlers use `verifyAdminKey` (infrastructure secret) -- admin operations shouldn't count toward tenant usage quotas.
