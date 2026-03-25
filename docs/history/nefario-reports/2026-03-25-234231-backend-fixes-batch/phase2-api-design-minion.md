## Domain Plan Contribution: api-design-minion

### Recommendations

#### Issue #187: Skip wasted D1 round-trips for approaching_limit

**Recommendation: Option (a) -- check dedup at the call site, but expose a single-purpose helper.**

The current `dispatchNotification()` is a general-purpose function that handles multiple notification types. Its internal dedup logic (load prefs, check `notification_sent` table) is correct for the general case. The problem is specifically that `approaching_limit` fires on every capture from 161-200, meaning ~40 redundant `dispatchNotification()` calls per tenant per month, each burning 2 D1 queries before discovering the notification was already sent.

The cleanest approach is to add a single `checkNotificationSent()` call at the call site in `index.js` (the function already exists and is exported from `db.js`) and skip `dispatchNotification()` entirely when it returns true. This keeps `dispatchNotification()` unchanged as a self-contained, correct unit -- callers that don't pre-check still get the internal dedup safety net. The pre-check is purely an optimization, not a correctness requirement, so the two checks (call-site + internal) are not a DRY violation -- they serve different roles (performance vs. safety).

Do NOT remove the internal dedup from `dispatchNotification()`. It is a correctness guard against race conditions and other call paths. The call-site check is a performance short-circuit only.

The period computation (`YYYY-MM`) should be extracted into a shared helper (or reuse the existing one from `email-dispatch.js`) so the call site and `dispatchNotification()` compute identical periods.

**API surface impact:** None. This is internal queue-consumer logic with no public API changes.

#### Issue #181: Descriptive Content-Disposition filenames

**Recommendation: Strip `www.`, sanitize aggressively, use ISO date.**

The `Content-Disposition` header filename is consumed by browsers for the "Save As" dialog. The filename must be safe for all major OS filesystems (Windows is the strictest constraint).

Proposed filename pattern:
```
capture-{domain}-{date}.{ext}
```

Examples:
- `capture-example.com-2026-03-24.wacz`
- `capture-example.com-2026-03-24.png`
- `capture-example.com-2026-03-24-before.png` (for screenshot-before)
- `capture-example.com-2026-03-24.html`
- `capture-example.com-2026-03-24.json`

Domain extraction and sanitization rules:
1. Parse `record.url` with `new URL()` to get `hostname`.
2. Strip leading `www.` -- it adds no information and makes filenames longer.
3. Strip port numbers (they appear in `hostname` for non-standard ports). Port is a separate URL property, so `new URL(url).hostname` already excludes it.
4. Sanitize the hostname: replace any character that is not `a-z`, `0-9`, `.`, or `-` with `-`. This handles IDN/punycode domains safely (punycode is already ASCII-safe; if the browser has decoded it to Unicode, the regex catches it).
5. Truncate the domain portion to 100 characters max to avoid filesystem path length issues.
6. Date from `record.createdAt` formatted as `YYYY-MM-DD` (UTC).

For the `Content-Disposition` header, use RFC 6266 with both `filename` (ASCII fallback) and `filename*` (UTF-8 extended) parameters. Since we sanitize to ASCII-only, `filename` alone is sufficient -- skip `filename*` to keep it simple.

**API surface impact:** This changes the `Content-Disposition` header in artifact download responses. This is a behavioral change but NOT a breaking change -- `Content-Disposition` filenames are suggestions to the browser, not part of the API contract. No clients should be parsing this header programmatically. The actual artifact content and `Content-Type` remain unchanged.

**Cache implications:** Artifact responses use `Cache-Control: public, max-age=31536000, immutable`. The filename change does not affect cacheability because `Content-Disposition` is not part of the cache key. Already-cached responses will keep the old filenames until they expire (effectively forever for immutable). This is fine -- the old filenames still work, they are just less descriptive.

### Proposed Tasks

#### Task 1: Extract period computation helper
- **What:** Extract the `YYYY-MM` period computation from `email-dispatch.js` line 193 into a shared utility (either in `email-dispatch.js` as an exported function, or in a small utils module).
- **Deliverables:** Exported `computeNotificationPeriod()` function, used by both `dispatchNotification()` and the call site in `index.js`.
- **Dependencies:** None.

#### Task 2: Add call-site dedup short-circuit for approaching_limit
- **What:** In `src/index.js` lines 306-328, after the `newCount >= threshold` check, call `checkNotificationSent(env.DB, tenantId, period, 'approaching_limit')` and skip `dispatchNotification()` if true. Log the short-circuit at debug level.
- **Deliverables:** Modified queue consumer code. Test coverage proving the short-circuit avoids `dispatchNotification()` when already sent.
- **Dependencies:** Task 1 (for period helper).

#### Task 3: Build descriptive filename helper
- **What:** Create a pure function `buildArtifactFilename(url, createdAt, artifactName)` that returns the sanitized filename string. Keep it in `src/index.js` or a small utils module.
- **Deliverables:** Function with test coverage for: normal domains, `www.` stripping, IDN domains, URLs with ports, very long domains (truncation), missing/malformed URLs (graceful fallback to old generic filenames).
- **Dependencies:** None.

#### Task 4: Wire descriptive filenames into artifact download handler
- **What:** In `handleGetCaptureArtifact()`, replace the static `filenames` map lookup with a call to `buildArtifactFilename(record.url, record.createdAt, artifactName)`. Keep the static map as a fallback if URL parsing fails.
- **Deliverables:** Modified handler. Integration test confirming the `Content-Disposition` header contains domain and date.
- **Dependencies:** Task 3.

### Risks and Concerns

1. **Race condition on dedup (Task 2):** The call-site check and `dispatchNotification()`'s internal check are both reading from D1. Between the call-site read and `dispatchNotification()`'s write, another concurrent capture could pass the same check. This is already handled -- `dispatchNotification()` does `markNotificationSent()` BEFORE enqueuing, and D1's `INSERT OR IGNORE` makes it idempotent. The call-site check is purely a performance optimization, so a rare false-negative (check says not sent, internal dedup catches it) is fine.

2. **Filename encoding edge cases (Task 3-4):** Some HTTP clients may not handle long filenames or certain characters in `Content-Disposition`. The aggressive ASCII sanitization mitigates this. The fallback to generic filenames if `new URL()` throws is essential -- malformed URLs in the DB should not cause 500 errors on artifact downloads.

3. **`createdAt` field availability:** The `record` from `getCapture()` includes `createdAt` (mapped from `created_at`). Verified in `rowToCapture`. No risk here.

### Additional Agents Needed

None. These are straightforward internal changes with no public API contract modifications, no auth implications, no spec changes, and no documentation updates needed beyond inline code comments.
