## Domain Plan Contribution: data-minion

### Recommendations

#### Schema approach: Hybrid -- extend `captures` table with quarantine columns AND add a `safe_browsing_checks` audit table

After reviewing all eight existing migrations, the `captures` table schema, `rowToCapture()`, and every code path that gates on `status`, I recommend **against all three options as stated** and instead propose a hybrid that is simpler and more operationally sound:

**1. Do NOT overload the `status` column (Option 3 -- rejected)**

The `status` CHECK constraint is `('pending', 'complete', 'failed')`. These are lifecycle states that drive queue processing, idempotency guards (line 165 of index.js), webhook dispatch events (`capture.complete`, `capture.failed`), status polling responses, and the `listCaptures` filter parameter. Adding `'quarantined'` to this enum conflates two orthogonal concerns: capture lifecycle progress and content safety assessment. A capture can be `complete` (it succeeded) and simultaneously quarantined (its content was flagged). These are independent dimensions.

More critically, the entire artifact retrieval path gates on `status === 'complete'` (lines 1299, 1357 of index.js). Changing a completed capture's status to `'quarantined'` would break the status polling contract -- a capture that was once `complete` would silently disappear from the metadata and artifact endpoints. Clients polling `/status` would never see it transition; it just vanishes. That is a broken contract.

**2. Do NOT use a separate `quarantine_events` table alone (Option 2 -- partially rejected)**

A standalone events table requires a JOIN on every artifact retrieval to check quarantine state. D1 is SQLite -- JOINs work fine, but this adds query complexity to every read path for a condition that applies to a tiny fraction of captures. The retrieval gate should be a simple column check on the row already fetched, not a subquery.

However, an audit trail of Safe Browsing check results IS valuable -- it answers "when was this URL last checked, what was the verdict, what threat types were found." This is a separate concern from the quarantine gate.

**3. Recommended approach: columns on `captures` + a `safe_browsing_checks` table**

Add to `captures`:
- `quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined IN (0, 1))` -- the artifact access gate. Binary, fast, indexed.
- `quarantine_reason TEXT` -- human-readable reason (e.g., `'SOCIAL_ENGINEERING'`, `'MALWARE'`). NULL when not quarantined.
- `quarantined_at TEXT` -- ISO 8601 timestamp of when quarantine was applied.
- `last_sb_check_at TEXT` -- ISO 8601 timestamp of the most recent Safe Browsing check for this capture's URL. Used by the re-scan cron to find stale checks.

Add a new `safe_browsing_checks` table:
- `id INTEGER PRIMARY KEY AUTOINCREMENT` -- monotonic for ordering
- `capture_id TEXT NOT NULL REFERENCES captures(id)` -- which capture was checked
- `checked_at TEXT NOT NULL` -- when
- `verdict TEXT NOT NULL CHECK (verdict IN ('safe', 'threat'))` -- result
- `threat_types TEXT` -- JSON array of threat types from Safe Browsing API (e.g., `["SOCIAL_ENGINEERING", "MALWARE"]`), NULL when safe
- `api_response TEXT` -- raw API response JSON for forensics, nullable

This gives you:
- A fast retrieval gate: change `status === 'complete'` to `status === 'complete' AND quarantined = 0` -- single row, no JOIN.
- An audit trail: every check is recorded, including "safe" results, so you can prove due diligence.
- Efficient re-scan query: `WHERE status = 'complete' AND (last_sb_check_at IS NULL OR last_sb_check_at < ?)` uses an index without touching the audit table.
- Clean quarantine/un-quarantine: set `quarantined = 1` or `0` with a timestamp, and insert an audit row. If Safe Browsing later clears a URL, you can un-quarantine without losing history.

#### Migration: `0009_safe_browsing.sql`

```sql
-- Safe Browsing integration: quarantine support and check audit trail.
-- quarantined: artifact access gate (0 = accessible, 1 = blocked).
-- quarantine_reason: threat type string, NULL when not quarantined.
-- quarantined_at: ISO 8601 timestamp of quarantine action.
-- last_sb_check_at: most recent Safe Browsing check time, for re-scan scheduling.
-- D1 ALTER TABLE ADD COLUMN does not support CHECK constraints;
-- validation enforced at the application layer.

ALTER TABLE captures ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0;
ALTER TABLE captures ADD COLUMN quarantine_reason TEXT;
ALTER TABLE captures ADD COLUMN quarantined_at TEXT;
ALTER TABLE captures ADD COLUMN last_sb_check_at TEXT;

-- Re-scan cron query: find complete captures needing a fresh check.
-- Partial index covers only 'complete' rows (pending/failed don't need scanning).
CREATE INDEX idx_captures_sb_rescan
  ON captures (last_sb_check_at, url)
  WHERE status = 'complete';

-- Audit trail of all Safe Browsing checks.
PRAGMA foreign_keys = ON;

CREATE TABLE safe_browsing_checks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id   TEXT    NOT NULL REFERENCES captures(id),
  checked_at   TEXT    NOT NULL,
  verdict      TEXT    NOT NULL CHECK (verdict IN ('safe', 'threat')),
  threat_types TEXT,
  api_response TEXT
);

-- Look up check history for a specific capture.
CREATE INDEX idx_sb_checks_capture
  ON safe_browsing_checks (capture_id, checked_at DESC);
```

#### `rowToCapture()` changes

Add four new fields to the mapping (lines 54-73 of db.js):

```javascript
function rowToCapture(row) {
  return {
    // ... existing fields ...
    quarantined: Boolean(row.quarantined),
    quarantineReason: row.quarantine_reason ?? null,
    quarantinedAt: row.quarantined_at ?? null,
    lastSbCheckAt: row.last_sb_check_at ?? null,
  };
}
```

#### Artifact retrieval gate changes

In `handleGetCapture` (line 1299) and `handleGetCaptureArtifact` (line 1357), the existing gate:

```javascript
if (!record || record.status !== 'complete') {
```

becomes:

```javascript
if (!record || record.status !== 'complete' || record.quarantined) {
```

Return a distinct HTTP status for quarantined captures -- `451 Unavailable For Legal Reasons` is appropriate (content restricted due to legal/safety determination). This lets API consumers distinguish "does not exist" (404) from "exists but restricted" (451). The response body should include the reason but NOT the artifacts.

#### Re-scan cron query

New db.js function for the re-scan job:

```javascript
export async function listCapturesNeedingSbCheck(db, olderThan, limit = 100) {
  const rows = await db.prepare(
    `SELECT * FROM captures
     WHERE status = 'complete'
       AND (last_sb_check_at IS NULL OR last_sb_check_at < ?)
     ORDER BY last_sb_check_at ASC NULLS FIRST
     LIMIT ?`
  ).bind(olderThan, limit).all();
  return (rows.results ?? []).map(rowToCapture);
}
```

This uses the `idx_captures_sb_rescan` partial index for efficient scanning. `NULLS FIRST` ensures newly captured URLs (never checked) are prioritized.

#### Pre-capture check

For new captures, the Safe Browsing check happens BEFORE `createCapture()` writes the pending record. If the URL is flagged, reject with 422 and never create a capture. This avoids writing data that would immediately be quarantined.

For scheduled captures, the same check runs after the cron fires but before enqueuing. Flagged URLs are logged and the schedule's `last_capture_status` is updated to a failure indicator.

#### `listCaptures` API changes

The `status` filter parameter currently accepts `pending | complete | failed`. Add `quarantined` as a valid filter value that maps to `WHERE quarantined = 1` (independent of the `status` column). This is a virtual status for API consumers -- internally it is a separate dimension.

Alternatively, add a separate `?quarantined=true|false` query parameter to keep the `status` filter orthogonal. This is cleaner since quarantine is orthogonal to lifecycle status.

#### Data volume considerations

The `safe_browsing_checks` table will grow proportionally to (captures x re-scan frequency). If re-scanning happens every 24 hours, a tenant with 10,000 captures generates 10,000 rows/day. At scale:

- Implement a retention policy: delete check rows older than N days (e.g., 90 days), keeping only the latest per capture.
- The audit table is append-only and cheap to query by `capture_id` (indexed). Bulk inserts via `db.batch()` keep write cost low.
- Consider batching the Safe Browsing API calls (the Lookup API supports up to 500 URLs per request), then writing results in a single `db.batch()`.

### Proposed Tasks

1. **Migration 0009**: Create `0009_safe_browsing.sql` with the four new columns on `captures`, the `idx_captures_sb_rescan` partial index, and the `safe_browsing_checks` table with its index.

2. **Update `rowToCapture()`**: Add `quarantined`, `quarantineReason`, `quarantinedAt`, `lastSbCheckAt` mappings. Application-layer validation for `quarantined IN (0, 1)` since D1 ALTER TABLE cannot add CHECK constraints.

3. **New db.js functions**:
   - `quarantineCapture(db, captureId, reason)` -- sets `quarantined = 1`, `quarantine_reason`, `quarantined_at`, inserts audit row.
   - `unquarantineCapture(db, captureId)` -- sets `quarantined = 0`, clears reason/timestamp, inserts audit row with verdict `'safe'`.
   - `recordSbCheck(db, captureId, verdict, threatTypes, apiResponse)` -- inserts audit row AND updates `last_sb_check_at` on the capture. Both in a `db.batch()`.
   - `listCapturesNeedingSbCheck(db, olderThan, limit)` -- returns captures needing re-scan, ordered by staleness.

4. **Retrieval gate update**: Modify `handleGetCapture` and `handleGetCaptureArtifact` to check `quarantined` flag, return 451 for quarantined captures with reason in the response body.

5. **List API update**: Add `?quarantined=true|false` filter parameter to `listCaptures`. Include `quarantined` and `quarantineReason` fields in list response summaries when quarantined.

6. **Webhook event**: Fire `capture.quarantined` webhook when a capture is quarantined (new event type), so tenants are notified.

### Risks and Concerns

1. **D1 ALTER TABLE CHECK constraint limitation**: D1 (SQLite) does not support CHECK constraints in `ALTER TABLE ADD COLUMN`. The `quarantined IN (0, 1)` constraint must be enforced at the application layer, consistent with the pattern established in migrations 0005 (tier) and 0006 (billing_status). Document this in the migration comment.

2. **URL deduplication for Safe Browsing API calls**: Multiple captures can share the same URL. The re-scan cron should deduplicate URLs before calling Safe Browsing, then fan out the quarantine action to all captures of that URL. Without deduplication, API quota is wasted checking the same URL repeatedly. The `idx_captures_sb_rescan` index includes `url` for this reason -- the cron can `GROUP BY url` and get one row per URL.

3. **Race condition: capture completing during quarantine**: A capture could be in `pending` state when the pre-capture check passes, then the URL gets flagged by the time it completes. The re-scan cron handles this (it checks `status = 'complete'` rows), but there is a window between capture completion and the next cron tick where a flagged capture's artifacts are accessible. Accept this as a known gap -- the window is bounded by cron frequency (currently 1 minute ticks). For tighter guarantees, run a Safe Browsing check inline at capture completion time as well.

4. **Safe Browsing API quota**: Google Safe Browsing Lookup API has rate limits. The re-scan cron must respect these. Batch URLs (up to 500 per request), pace requests, and use exponential backoff. Store the API response so a failed/partial check does not lose data.

5. **Un-quarantine path**: If Safe Browsing later clears a previously flagged URL, the system should un-quarantine automatically. This needs careful thought -- should it be automatic, or require admin approval? I recommend automatic un-quarantine by the re-scan cron (if the latest check returns `'safe'`), with a webhook notification (`capture.unquarantined`) so the tenant knows.

6. **`NULLS FIRST` in SQLite**: SQLite sorts NULLs as less than any other value by default in ASC order, so `ORDER BY last_sb_check_at ASC` naturally puts NULLs first. The `NULLS FIRST` clause is explicit but redundant -- verify this is supported by D1's SQLite version. If not, the default behavior achieves the same result; just drop the clause.

7. **Status polling contract**: The `/v1/captures/:id/status` endpoint (line 1550-1577) returns `pending`, `complete`, or `failed`. A quarantined capture should still show `status: 'complete'` (because it did complete) but include a `quarantined: true` flag and `quarantineReason`. Do NOT change the status value -- that breaks the polling contract and client state machines.

8. **Existing data**: Migration adds `quarantined = 0` and `last_sb_check_at = NULL` for all existing rows. The first cron run will see all existing complete captures as "never checked" and queue them for scanning. For a large existing dataset, this initial backfill could be rate-limited by Safe Browsing API quotas. Consider a configurable batch size and staggering the initial scan over multiple cron ticks.

### Additional Agents Needed

- **api-design-minion**: Define the 451 response shape, the `?quarantined` filter parameter contract, the `capture.quarantined` / `capture.unquarantined` webhook event schemas, and the pre-capture rejection response for flagged URLs.
- **security-minion**: Review the threat model -- should quarantined captures' metadata (URL, timestamps) still be accessible to the tenant? Should R2 artifacts be deleted or just access-gated? What about WACZ bundles that are already signed and distributed?
- **observability-minion**: Define logging for Safe Browsing API calls (latency, verdicts, quota usage), quarantine actions, and re-scan cron health (captures scanned per tick, API errors, queue depth of stale checks).
