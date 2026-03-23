## Domain Plan Contribution: iac-minion

### Recommendations

#### 1. Use a dedicated second cron expression (Option 1) -- strongly recommended

Add a second cron expression to the `[triggers]` block. Cloudflare Workers supports multiple cron expressions in a single Worker, all dispatching to the same `scheduled()` handler. The `controller.cron` string property distinguishes which schedule fired.

```toml
[triggers]
crons = ["*/1 * * * *", "0 3 * * *"]
```

The `scheduled()` handler in `src/index.js` would dispatch based on `controller.cron`:

```js
async scheduled(controller, env, ctx) {
  if (controller.cron === '0 3 * * *') {
    await handleSafeBrowsingRescan(controller, env, ctx);
    return;
  }
  // Existing per-minute logic
  await handleScheduledTick(controller, env, ctx);
  if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
    ctx.waitUntil(reportPendingMeterEvents(env, ctx));
  }
}
```

**Why this over the other options:**

- **Option 2 (piggyback on per-minute trigger)** is wasteful: 1,439 no-op checks per day. It also convolutes the per-minute handler with unrelated logic, violating KISS. Worse, it provides only 30s of CPU time (sub-1-hour interval), whereas a daily cron (`0 3 * * *`, interval >= 1 hour) gets **15 minutes of CPU time** on a paid plan. That 15 minutes is essential for paging through all captures in a single invocation.

- **Option 3 (separate Worker)** is unnecessary. The rescan needs the same bindings (D1, R2, queues) already available to the main Worker. A second Worker adds deployment complexity, doubles secret management, and fragments the codebase. No blocking concern justifies the split.

**Key CPU time implication:** Cloudflare gives 30s CPU for crons with < 1 hour intervals, but 15 minutes for crons >= 1 hour. The daily cron at `0 3 * * *` qualifies for the 15-minute budget, which is essential for scanning thousands of captures. This is the single strongest reason to use a dedicated daily cron rather than piggybacking on `*/1 * * * *`.

#### 2. Commercial use requires Google Web Risk, not Safe Browsing API

WRL is a paid SaaS product. The Google Safe Browsing API (v4) is explicitly restricted to non-commercial use: "not for sale or revenue generating purposes." WRL charges for captures and has Stripe billing integration -- this is commercial use.

The correct API is **Google Web Risk** (`uris.search`):
- 100,000 lookups/month free tier (more than sufficient for early-stage WRL)
- $0.50 per 1,000 calls beyond the free tier (100K-10M range)
- Rate limit: 6,000 `SearchUris` requests/minute
- No batch endpoint (one URL per request), but the rate limit is generous enough that serial lookups within the 15-minute CPU budget are practical

**Cost estimate at scale:** If WRL has 10,000 captures to rescan daily, that is 300K lookups/month. First 100K free, remaining 200K at $0.50/1K = $100/month. At 1,000 captures (likely near-term), this stays well within the free tier.

If Safe Browsing v4 batch capability (500 URLs/request) is preferred for engineering simplicity, the team must get explicit written confirmation from Google that WRL's use case qualifies as non-commercial. I would not assume this.

**Alternative: Update API with local hash prefix database.** Web Risk also offers a `threatLists.computeDiff` Update API that lets you maintain a local database of threat hash prefixes. Lookups against the local DB are free and unlimited. The tradeoff: complexity of maintaining a local threat list in D1 or KV, and the Update API pricing is significantly higher ($50/1K) for the `hashes.search` follow-up calls. For WRL's volume, the Lookup API is simpler and cheaper.

#### 3. Paging strategy for re-scan within CPU budget

The re-scan must page through all `captures` with `status = 'complete'` in D1. With the 15-minute CPU budget from a daily cron:

**Cursor-based pagination with D1:**
```sql
SELECT id, url FROM captures
WHERE status = 'complete'
  AND id > ?cursor
ORDER BY id ASC
LIMIT 500
```

Process 500 URLs per page. After checking each batch against Web Risk, update a `safe_browsing_status` column (or a new `url_threat_status` table). Use the last `id` as the cursor for the next page.

**If the full scan cannot complete in one invocation** (e.g., 50,000+ captures), store the cursor in KV (`rescan:cursor`) and resume from that point on the next daily trigger. The scan would be spread across multiple days, which is acceptable for a background safety check. Log progress so operators can verify the scan is advancing.

**Batch size for Web Risk API:** Since `uris.search` is one URL per request but the rate limit is 6,000/min, and each HTTP call is ~50-100ms wall clock, a practical batch of 500 unique URLs would take ~50s wall clock. Within 15 minutes of CPU time, paging through several thousand URLs per invocation is feasible.

**De-duplication:** Many captures may share the same URL (scheduled captures of the same page). De-duplicate URLs before calling the API to avoid wasting quota. Group captures by URL, check each unique URL once, apply the result to all captures with that URL.

#### 4. Infrastructure changes required

**wrangler.toml (production):**
- Add `"0 3 * * *"` to the `crons` array in `[triggers]`
- Add the same to `[env.staging.triggers]`
- No new bindings needed -- D1 and KV are already bound

**wrangler.test.toml:**
- Regenerate: copy wrangler.toml, remove all `[[queues.consumers]]` sections and `[triggers]` sections. The existing comment at the top of wrangler.test.toml documents this pattern.

**Secrets:**
- A Google Cloud API key for Web Risk needs to be provisioned:
  1. Create a GCP project, enable the Web Risk API
  2. Create an API key (restricted to Web Risk API only)
  3. Store in 1Password WRL vault as `GOOGLE_WEB_RISK_API_KEY`
  4. Push via `wrangler secret put GOOGLE_WEB_RISK_API_KEY` (and `--env staging`)
  5. Add to `~/.secrets` for local dev

**D1 migration:**
- New migration to add threat-status tracking. Two options:
  - (a) Add `threat_status TEXT` and `threat_checked_at TEXT` columns to `captures` table
  - (b) Create a new `url_threats` table keyed by normalized URL, with `status`, `checked_at`, `threat_types` columns -- this avoids updating every capture row and naturally de-duplicates
- Option (b) is preferred: the threat status is a property of the URL, not the individual capture. One URL checked once covers all captures of that URL.

#### 5. Staging environment parity

The staging environment must mirror the cron setup. Currently `[env.staging.triggers]` has `crons = ["*/1 * * * *"]` -- update it to include the daily rescan cron as well. Use a different time to avoid colliding with production scans if they share a GCP project (same API key, same quota pool):

```toml
[env.staging.triggers]
crons = ["*/1 * * * *", "0 4 * * *"]
```

### Proposed Tasks

1. **[iac] Add daily cron trigger to wrangler.toml** -- Add `"0 3 * * *"` to `[triggers].crons` and `"0 4 * * *"` to `[env.staging.triggers].crons`. Regenerate `wrangler.test.toml`.

2. **[iac] Provision Google Web Risk API key** -- Create GCP project, enable Web Risk API, create restricted API key. Store in 1Password WRL vault (both Production and Staging items). Push via `wrangler secret put` for both environments.

3. **[backend] Add cron dispatch in scheduled() handler** -- Route `controller.cron === '0 3 * * *'` to a new `handleSafeBrowsingRescan()` function. Keep existing per-minute logic untouched.

4. **[backend] Implement handleSafeBrowsingRescan()** -- Cursor-based pagination over complete captures, de-duplicate URLs, call Web Risk `uris.search`, store results in `url_threats` table. Store cursor in KV if scan cannot complete in one invocation.

5. **[backend] D1 migration for url_threats table** -- Create `url_threats` table with `(url TEXT PRIMARY KEY, threat_status TEXT, threat_types TEXT, checked_at TEXT)`. Index on `checked_at` for re-scan ordering (oldest-checked first).

6. **[backend] Pre-capture URL check** -- Before accepting a new capture request, check the URL against Web Risk. Reject with 403 if the URL is flagged as malicious. Cache the result in `url_threats` to avoid redundant API calls for the same URL within a time window.

7. **[test] Integration tests for rescan cron** -- Test the dispatch routing (`controller.cron` matching), pagination logic, and Web Risk API interaction (mocked HTTP for unit tests, real API call for integration smoke test).

### Risks and Concerns

1. **Commercial use and the Safe Browsing API:** Using Google Safe Browsing (v4) in a commercial SaaS product violates its terms of service. The implementation MUST use Google Web Risk or obtain explicit Google approval. This is a legal/compliance risk, not just a technical preference.

2. **Web Risk API has no batch endpoint:** Unlike Safe Browsing v4's `threatMatches.find` (500 URLs/request), Web Risk's `uris.search` checks one URL per request. This means more HTTP round-trips. The 6,000 req/min rate limit and 15-minute CPU budget are sufficient for thousands of URLs, but the implementation must handle this serially (or with limited parallelism) to stay within rate limits.

3. **CPU budget is plan-dependent:** The 15-minute CPU budget for >= 1-hour crons is only available on the Workers Paid plan. Verify WRL is on the paid plan (it almost certainly is given the browser rendering binding, but confirm).

4. **Scan completeness at scale:** If capture volume grows to tens of thousands, a single daily invocation may not scan all URLs. The cursor-based resume strategy handles this gracefully, but operators should monitor scan progress. A metric like "days since full scan completed" would be valuable.

5. **GCP dependency:** Adding Google Web Risk introduces a new cloud provider dependency (GCP API key, GCP project, GCP billing). This is a minimal operational surface (one API key, no infrastructure), but it needs to be documented in the operations runbook.

6. **False positives:** Legitimate URLs may be flagged by Web Risk. The system should not auto-delete captures. Instead: mark captures as `threat_detected`, prevent serving them via the API, and provide an admin endpoint for manual review and override.

7. **wrangler.test.toml regeneration:** The test config must be regenerated whenever wrangler.toml changes. The current process is manual (documented in vitest.config.js comment). Consider adding a CI check that verifies wrangler.test.toml is in sync with wrangler.toml.

### Additional Agents Needed

- **api-design-minion**: Design the pre-capture check flow (where in the request pipeline does the URL check happen, what error response format, how does caching interact with the existing capture API contract) and the admin override endpoint for false positives.
- **data-minion**: Design the `url_threats` table schema, indexing strategy for efficient re-scan pagination (oldest-checked-first ordering), and the interaction between the threat table and existing capture queries.
- **observability-minion**: Define logging and alerting for the rescan cron (scan progress metrics, API error rates, false positive rates, "days since full scan" metric).
