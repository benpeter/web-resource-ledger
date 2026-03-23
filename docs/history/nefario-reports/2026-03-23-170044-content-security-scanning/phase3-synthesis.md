## Delegation Plan

**Team name**: content-security-scanning
**Description**: Implement Google Web Risk URL screening for WRL captures -- pre-capture rejection, background re-scan with quarantine, and observability.

---

### Conflict Resolutions

Before task breakdown, these cross-specialist conflicts are resolved:

**1. HTTP 451 vs 403 for quarantined artifacts**

Chosen: **HTTP 451** (per the original issue spec).
Over: HTTP 403 (api-design-minion's recommendation).
Why: api-design-minion argues 451 is for "legal demands" per RFC 7725. However, RFC 7725 Section 3 says 451 is appropriate when "the server operator has received a legal demand to deny access to a resource" OR "has been notified of a judicial or administrative requirement." A content safety restriction based on threat intelligence databases is a policy-driven access restriction with legal backing (platform liability for serving malware). 403 is too generic -- it's used for auth failures throughout WRL already. 451 gives API consumers a clear, unambiguous signal that content is restricted for safety/legal reasons, distinct from auth-related 403s. The issue spec says 451, and the semantic argument supports it. We add 451 to the `titles` map in `responses.js`.

**2. status:"quarantined" vs contentRestriction overlay**

Chosen: **status:"quarantined"** as a new status value (per the original issue spec).
Over: contentRestriction overlay (ux-strategy-minion's recommendation).
Why: ux-strategy-minion argues this is a breaking change. However: (a) the issue spec explicitly requires `status:"quarantined"`, (b) WRL is pre-1.0 with no published API stability guarantee, (c) the overlay approach adds a second dimension clients must check (`if status === 'complete' && !contentRestriction?.restricted`), which is MORE complex for consumers, (d) adding a fourth enum value to a well-defined enum is standard API evolution. The `status` field is the canonical dispatch point for capture state. Quarantine IS a state change, not a metadata overlay. The existing `status !== 'complete'` gates in retrieval handlers naturally block quarantined captures without extra logic. We keep `status` as the single source of truth.

**3. Fail-open vs fail-closed pre-capture**

Chosen: **Fail-open** (per the original issue spec and security-minion).
Over: Fail-closed/503 (observability-minion suggested as an option).
Why: The issue spec explicitly says "capture proceeds" when the API fails. Content security scanning is defense-in-depth, not a security boundary. The re-scan cron provides a safety net. Fail-closed would make captures dependent on Google API uptime, violating the Helix Manifesto principle "ops reliability wins." Log the degradation prominently (severity 4) and alert on sustained failures.

**4. Field naming: safeBrowsing vs threatCheck**

Chosen: **threatCheck** for the API-facing field name.
Over: safeBrowsing (direct provider reference).
Why: software-docs-minion correctly flags that naming the field after a specific provider creates technical debt if the provider changes. The API surface should be provider-agnostic. Use `threatCheck` in API responses and OpenAPI spec. Use `safeBrowsing` / `webRisk` only in internal code (module names, log events, operations docs). Values: `"pass"`, `"fail"`, `"unavailable"`, `null` (captures before this feature).

**5. Safe Browsing API vs Web Risk API**

Chosen: **Google Web Risk Lookup API** (`webrisk.googleapis.com/v1/uris:search`).
Over: Google Safe Browsing v4 (non-commercial license restriction).
Why: Both security-minion and iac-minion flagged this. Safe Browsing v4 is explicitly "not for sale or revenue generating purposes." WRL has Stripe billing integration and paid tiers -- this is unambiguously commercial use. Web Risk is the commercial equivalent with the same threat data. 100K lookups/month free tier. The issue spec references "Safe Browsing" by name, but the correct commercial API is Web Risk. Internal code names the module `threat-check.js` (provider-agnostic); logging uses `threatcheck.*` prefix.

**6. Schema approach: status column vs separate quarantined column**

Chosen: **Hybrid -- add quarantine columns to captures + audit table** (data-minion's approach, adapted).
Over: Overloading status column alone (test-minion suggestion), separate table only (rejected by data-minion).
Why: data-minion's analysis is correct that the CHECK constraint on `status IN ('pending', 'complete', 'failed')` in `0001_initial_schema.sql` cannot be ALTERed in SQLite. However, rather than the table-rebuild pattern (risky), we use the pattern already established in the codebase: D1 ALTER TABLE ADD COLUMN, application-layer validation (as done for `tier` and `billing_status`). We add `quarantined INTEGER NOT NULL DEFAULT 0` as a boolean flag plus metadata columns. BUT we also update the status to `'quarantined'` for API consistency, accepting that the CHECK constraint must be addressed. Since SQLite in D1 does NOT enforce CHECK constraints on columns added via ALTER TABLE (they have no CHECK), and the original CHECK on `status` was in the CREATE TABLE -- we need to verify empirically. If the CHECK blocks updates, the migration must recreate the table. The implementing agent must test this on staging first.

**IMPORTANT NOTE on status CHECK constraint**: The `status` column has `CHECK (status IN ('pending', 'complete', 'failed'))` in the CREATE TABLE. D1/SQLite enforces CHECK constraints on UPDATE. The migration MUST either: (a) recreate the table without the CHECK (standard SQLite rebuild pattern -- tested on staging first), or (b) leave the CHECK and manage quarantine purely via the `quarantined` column while keeping `status = 'complete'` in the DB, mapping to `status: 'quarantined'` only at the API layer. The implementing agent should try approach (b) first as it's simpler and avoids the table rebuild risk. If we keep `status = 'complete'` in D1 but add `quarantined = 1`, the retrieval gate becomes `status === 'complete' && !quarantined` and the API response maps to `status: 'quarantined'` when the flag is set.

**7. Cron frequency: 6-hourly vs daily**

Chosen: **Daily at 03:00 UTC** (`0 3 * * *`).
Over: Every 6 hours (security-minion), piggybacking on per-minute cron.
Why: iac-minion's analysis is decisive -- a cron with interval >= 1 hour gets 15 minutes of CPU time vs 30 seconds for sub-hour intervals. Daily is sufficient for background safety re-scanning (not time-critical). This also conserves Web Risk API quota. The existing `*/1 * * * *` stays for schedule processing.

**8. Webhook event naming: capture.quarantined vs capture.restricted**

Chosen: **capture.quarantined** (consistent with internal status name).
Over: capture.restricted (ux-strategy-minion).
Why: The webhook consumer is a developer integrating with the API. The API returns `status: "quarantined"`. The webhook event should match the API field value for consistency. "restricted" is for tenant-facing UI copy, not machine-readable events.

---

### Task 1: D1 Schema Migration and DB Functions
- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Schema design is hard to reverse and all subsequent tasks depend on it. The CHECK constraint situation requires empirical verification.
- **Gate rationale**: |
    Chosen: Hybrid schema -- quarantine columns on captures + safe_browsing_checks audit table. Keep `status = 'complete'` in D1, use `quarantined` boolean flag, map to `status: 'quarantined'` at the API layer.
    Over: (1) Overloading status column (blocked by CHECK constraint), (2) Separate table with JOINs (performance overhead on every read).
    Why: Avoids risky table rebuild while giving fast single-row quarantine gates and full audit trail.
- **Prompt**: |
    You are implementing the D1 schema migration and database functions for WRL's content security scanning feature (Google Web Risk URL screening).

    ## Context

    WRL is a Cloudflare Worker (JavaScript, not TypeScript) that captures web pages. You are adding quarantine support so that captures of URLs flagged by threat intelligence can be restricted.

    The project follows the Helix Manifesto: YAGNI, KISS, fail loudly, lean and mean. All DB access is centralized in `src/db.js`. Migrations are in `migrations/`. The current schema has a CHECK constraint on `captures.status`: `CHECK (status IN ('pending', 'complete', 'failed'))`.

    ## Important Constraint: CHECK Constraint

    D1 (SQLite) does not support ALTER TABLE to modify CHECK constraints. Adding `'quarantined'` to the status CHECK requires table recreation, which is risky for production data.

    **Solution: Keep `status = 'complete'` in the DB for quarantined captures. Add a `quarantined INTEGER NOT NULL DEFAULT 0` flag column. The API layer maps `quarantined = 1` to `status: 'quarantined'` in responses.** This avoids touching the CHECK constraint entirely.

    The retrieval gate in the code (`status === 'complete'`) must additionally check `!record.quarantined`. The application layer handles the status mapping.

    ## What to Produce

    **1. Migration file: `migrations/0009_threat_check.sql`**

    Add columns to `captures`:
    - `quarantined INTEGER NOT NULL DEFAULT 0` -- artifact access gate (0 = accessible, 1 = blocked)
    - `quarantine_reason TEXT` -- threat type string (e.g., 'MALWARE'), NULL when not quarantined
    - `quarantined_at TEXT` -- ISO 8601 timestamp, NULL when not quarantined
    - `last_threat_check_at TEXT` -- most recent threat check time, for re-scan scheduling
    - `threat_check TEXT` -- result of pre-capture check: 'pass', 'unavailable', NULL for old captures

    Create index for re-scan cron query (partial index on status = 'complete'):
    ```sql
    CREATE INDEX idx_captures_threat_rescan
      ON captures (last_threat_check_at)
      WHERE status = 'complete' AND quarantined = 0;
    ```

    Create audit table `threat_checks`:
    ```sql
    CREATE TABLE threat_checks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      capture_id   TEXT    NOT NULL REFERENCES captures(id),
      checked_at   TEXT    NOT NULL,
      verdict      TEXT    NOT NULL CHECK (verdict IN ('safe', 'threat')),
      threat_types TEXT,
      source       TEXT    NOT NULL DEFAULT 'web_risk'
    );
    CREATE INDEX idx_threat_checks_capture
      ON threat_checks (capture_id, checked_at DESC);
    ```

    Note: D1 ALTER TABLE ADD COLUMN does NOT support CHECK constraints. The `quarantined IN (0, 1)` validation must be enforced at the application layer, following the pattern used for `tier` (VALID_TIERS) and `billing_status` (VALID_BILLING_STATUSES) in `db.js`.

    **2. Update `src/db.js`**

    Update `rowToCapture()` to include new fields:
    ```javascript
    quarantined: Boolean(row.quarantined),
    quarantineReason: row.quarantine_reason ?? null,
    quarantinedAt: row.quarantined_at ?? null,
    lastThreatCheckAt: row.last_threat_check_at ?? null,
    threatCheck: row.threat_check ?? null,
    ```

    Add new exported functions:

    - `quarantineCapture(db, captureId, reason, threatTypes)` -- sets `quarantined = 1`, `quarantine_reason`, `quarantined_at` on the capture. Inserts a `threat_checks` audit row with verdict `'threat'`. Uses `db.batch()` for atomicity. Only transitions captures where `status = 'complete'` (WHERE clause).

    - `recordThreatCheck(db, captureId, verdict, threatTypes)` -- inserts audit row AND updates `last_threat_check_at` on the capture. Uses `db.batch()`.

    - `listCapturesNeedingThreatCheck(db, olderThan, limit = 500)` -- returns captures needing re-scan: `WHERE status = 'complete' AND quarantined = 0 AND (last_threat_check_at IS NULL OR last_threat_check_at < ?)`. Order by `last_threat_check_at ASC` (NULLs first in SQLite ASC). Limit for API budget control. De-duplicate by URL (GROUP BY url) to avoid checking the same URL multiple times. Return both captureId and url.

    - `quarantineCapturesByUrl(db, url, reason, threatTypes)` -- quarantines ALL complete, non-quarantined captures with a given URL. Used by the re-scan cron when a URL is newly flagged. Returns the list of affected captureIds (needed for webhook dispatch).

    - `setCaptureThreatCheck(db, captureId, value)` -- sets the `threat_check` column ('pass' or 'unavailable') during capture creation.

    **3. Do NOT modify**:
    - `src/index.js` (that's Task 3 and 4)
    - `src/responses.js` (that's Task 3)
    - `wrangler.toml` (that's Task 5)

    ## Files to Read First
    - `migrations/0001_initial_schema.sql` -- understand the captures table and CHECK constraint
    - `migrations/0005_tenant_tiers.sql` -- see the ALTER TABLE ADD COLUMN pattern
    - `migrations/0006_billing.sql` -- see the application-layer validation pattern
    - `src/db.js` -- understand rowToCapture(), existing function patterns
    - `test/db.test.js` -- understand test patterns for DB functions

    ## Files to Modify
    - `migrations/0009_threat_check.sql` (new)
    - `src/db.js`

    ## Deliverables
    - Migration file that can be applied via `wrangler d1 migrations apply`
    - Updated `db.js` with all new functions and rowToCapture changes
    - All new functions follow existing patterns (db.batch, prepared statements, etc.)

    ## What NOT to Do
    - Do NOT attempt to modify the CHECK constraint on the status column
    - Do NOT create a table rebuild migration
    - Do NOT add an `unquarantineCapture` function (explicitly out of scope per issue spec -- no auto-restore)
    - Do NOT add retention/cleanup for the threat_checks audit table (YAGNI)
    - Do NOT store raw API responses in the audit table (KISS -- threat_types is sufficient)
- **Deliverables**: `migrations/0009_threat_check.sql`, updated `src/db.js` with 5 new functions and updated `rowToCapture()`
- **Success criteria**: Migration applies cleanly on fresh DB and on DB with existing data. New functions pass unit tests. `quarantineCapture` only affects `status = 'complete'` rows. `listCapturesNeedingThreatCheck` returns de-duplicated URLs ordered by staleness.

---

### Task 2: Web Risk API Client Module
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing the Google Web Risk API client module for WRL's content security scanning feature.

    ## Context

    WRL is a Cloudflare Worker (JavaScript, not TypeScript). It captures web pages and needs to screen URLs against Google's threat intelligence before capture and during periodic re-scans.

    **IMPORTANT**: Use Google Web Risk API (`webrisk.googleapis.com/v1/uris:search`), NOT Google Safe Browsing v4. Safe Browsing v4 is restricted to non-commercial use. WRL is a commercial SaaS.

    The project follows the Helix Manifesto: YAGNI, KISS, fail loudly, lean and mean. The module must follow the injectable dependency pattern established by `src/url-validation.js` (see `defaultResolvers` injection pattern there).

    ## What to Produce

    **1. New file: `src/threat-check.js`**

    Export two functions:

    ```javascript
    /**
     * Check a single URL against Google Web Risk.
     * @param {string} url - The URL to check
     * @param {object} env - Worker env (needs env.GOOGLE_WEB_RISK_API_KEY)
     * @param {object} [options]
     * @param {function} [options.lookup] - Injectable fetch function for testing
     * @returns {Promise<{safe: boolean, threatTypes?: string[], degraded?: boolean}>}
     */
    export async function checkUrl(url, env, { lookup } = {}) { ... }

    /**
     * Check multiple URLs against Google Web Risk (fan-out, one per URL).
     * Uses Promise.allSettled to prevent one failure from blocking others.
     * @param {string[]} urls - URLs to check
     * @param {object} env
     * @param {object} [options]
     * @returns {Promise<Map<string, {safe: boolean, threatTypes?: string[], degraded?: boolean}>>}
     */
    export async function checkUrls(urls, env, { lookup } = {}) { ... }
    ```

    **API details:**
    - Endpoint: `GET https://webrisk.googleapis.com/v1/uris:search`
    - Query params: `uri=<encoded-url>&threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING&threatTypes=UNWANTED_SOFTWARE&key=<API_KEY>`
    - API key from: `env.GOOGLE_WEB_RISK_API_KEY`
    - Successful response with no threats: `{}` (empty JSON object)
    - Successful response with threats: `{ "threat": { "threatTypes": ["MALWARE"], "expireTime": "..." } }`
    - Timeout: 2000ms (AbortController). On timeout, return `{ safe: true, degraded: true }`
    - On any non-200 response or network error: return `{ safe: true, degraded: true }` (fail-open)
    - On threat match: return `{ safe: false, threatTypes: ["MALWARE", ...] }`
    - On clean: return `{ safe: true }`

    **The `lookup` parameter**: Default is `null`. When null, use `fetch()` directly. When provided, call `lookup(fullUrl)` instead of `fetch(fullUrl)`. This follows the exact pattern of `resolve4`/`resolve6` injection in `url-validation.js`. Tests inject stubs; production uses real fetch.

    **URL encoding**: The target URL must be properly encoded in the query string using `encodeURIComponent()`.

    **`checkUrls`**: Fan out individual `checkUrl` calls via `Promise.allSettled`. Return a Map from URL string to result. If a single URL check fails/degrades, others continue independently.

    **2. New file: `test/threat-check.test.js`**

    Unit tests using injectable stubs (zero network calls). Follow the pattern of `test/url-validation.test.js`. Define stubs at top of file:

    ```javascript
    const cleanLookup = async () => new Response('{}', { status: 200 });
    const malwareLookup = async () => new Response(JSON.stringify({
      threat: { threatTypes: ['MALWARE'], expireTime: '2026-04-01T00:00:00Z' }
    }), { status: 200 });
    const multiThreatLookup = async () => new Response(JSON.stringify({
      threat: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'], expireTime: '...' }
    }), { status: 200 });
    const apiErrorLookup = async () => new Response('Internal Server Error', { status: 500 });
    const timeoutLookup = async () => { throw new DOMException('The operation was aborted', 'AbortError'); };
    const networkErrorLookup = async () => { throw new TypeError('Failed to fetch'); };
    ```

    Test cases:
    1. Clean URL returns `{ safe: true }`
    2. Malware URL returns `{ safe: false, threatTypes: ['MALWARE'] }`
    3. Multiple threat types returned correctly
    4. API 500 error returns `{ safe: true, degraded: true }` (fail-open)
    5. Timeout returns `{ safe: true, degraded: true }`
    6. Network error returns `{ safe: true, degraded: true }`
    7. Missing API key (env.GOOGLE_WEB_RISK_API_KEY undefined) returns `{ safe: true, degraded: true }` and does not throw
    8. `checkUrls` with mixed results: clean + malware + error -> correct per-URL results
    9. `checkUrls` with empty array returns empty Map
    10. URL is properly encoded in the request

    ## Files to Read First
    - `src/url-validation.js` -- understand the injectable dependency pattern (defaultResolvers)
    - `test/url-validation.test.js` -- understand test stub patterns
    - `src/log.js` -- understand the log() function signature (NOT used in this module -- logging happens at the call site in index.js)

    ## Files to Create
    - `src/threat-check.js`
    - `test/threat-check.test.js`

    ## What NOT to Do
    - Do NOT add logging inside this module (caller logs at the integration point)
    - Do NOT import from db.js (this is a pure API client)
    - Do NOT use Safe Browsing v4 API -- use Web Risk API (`webrisk.googleapis.com`)
    - Do NOT implement caching (the re-scan logic handles check frequency)
    - Do NOT add a batch API call (Web Risk has no batch endpoint -- use checkUrls fan-out instead)
    - Do NOT use TypeScript
- **Deliverables**: `src/threat-check.js` (Web Risk client module), `test/threat-check.test.js` (unit tests)
- **Success criteria**: All unit tests pass. Module returns correct discriminated results for safe, unsafe, and degraded scenarios. Injectable lookup enables zero-network testing.

---

### Task 3: Pre-Capture Integration and API Response Updates
- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    You are integrating the Web Risk threat check into WRL's capture creation endpoints and updating the API response handling for quarantined captures.

    ## Context

    WRL is a Cloudflare Worker (JavaScript, not TypeScript). You are wiring the threat check into the HTTP request path and updating all read endpoints to handle quarantined captures.

    **Two new modules are available:**
    - `src/threat-check.js` exports `checkUrl(url, env, { lookup })` and `checkUrls(urls, env, { lookup })`
    - `src/db.js` now has: `quarantineCapture()`, `recordThreatCheck()`, `setCaptureThreatCheck()`, and `rowToCapture()` returns `quarantined`, `quarantineReason`, `quarantinedAt`, `lastThreatCheckAt`, `threatCheck` fields.

    The `quarantined` field is a boolean. In the DB, `status` stays `'complete'` but `quarantined = 1`. The API must map this to `status: 'quarantined'` in responses.

    ## What to Produce

    **1. Update `src/responses.js`**: Add `451: 'Unavailable For Legal Reasons'` to the `titles` map.

    **2. Update `src/index.js` -- Pre-capture check in `handleCreateCapture`**:

    After Step 6 (URL validation / SSRF check, ~line 711-715) and BEFORE Step 7 (generate capture ID), add the threat check:

    ```javascript
    // Step 6b: Threat check (content security screening)
    const threat = await checkUrl(result.url, env);
    if (!threat.safe) {
      ctx.waitUntil(log(env, 5, 'security', {
        event: 'threatcheck.block',
        tenantId, keyName, keyHashPrefix, authMethod,
        threatTypes: threat.threatTypes,
        responseStatus: 422,
        cip,
      }) ?? Promise.resolve());
      return problemResponse(422, 'URL flagged by content security screening', rlHeaders, {
        threatTypes: threat.threatTypes,
      });
    }
    if (threat.degraded) {
      ctx.waitUntil(log(env, 4, 'security', {
        event: 'threatcheck.api_fail',
        tenantId, keyName, keyHashPrefix, authMethod,
        context: 'pre_capture',
        responseStatus: 202,
        cip,
      }) ?? Promise.resolve());
    }
    ```

    After creating the capture record (Step 8), store the threat check result:
    ```javascript
    ctx.waitUntil(
      setCaptureThreatCheck(env.DB, captureId, threat.degraded ? 'unavailable' : 'pass')
        .catch(() => {}) // non-critical
    );
    ```

    Also add a clean check log for successful checks (non-degraded):
    ```javascript
    if (!threat.degraded) {
      ctx.waitUntil(log(env, 3, 'security', {
        event: 'threatcheck.pass',
        tenantId, captureId, cip,
      }) ?? Promise.resolve());
    }
    ```

    Import `checkUrl` from `./threat-check.js` and `setCaptureThreatCheck` from `./db.js` at the top of `index.js`.

    **3. Update `src/index.js` -- Pre-capture check in `handleBatchCapture`**:

    In the batch handler, after URL validation passes for each item, check against Web Risk using `checkUrls()` for all validated URLs in parallel. For flagged URLs, add them to the batch errors with status 422 and `threatTypes`. For degraded checks, proceed and log.

    **4. Update `src/index.js` -- `handleGetCapture` (metadata endpoint)**:

    Change the gate at line 1299:
    ```javascript
    // Before:
    if (!record || record.status !== 'complete') {
    // After:
    if (!record || record.status !== 'complete') {
    ```
    Keep this gate as-is (it still catches pending/failed). Add a NEW check after it for quarantined captures:

    ```javascript
    if (record.quarantined) {
      // Return metadata but with status 'quarantined' and no artifact URLs
      const body = {
        id: record.captureId,
        status: 'quarantined',
        url: record.url,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
        quarantineReason: record.quarantineReason,
        quarantinedAt: record.quarantinedAt,
        threatCheck: record.threatCheck,
      };
      if (record.captureSettings) body.captureSettings = record.captureSettings;
      return jsonResponse(body, 200, {
        'Cache-Control': 'private, no-store',
        'Access-Control-Allow-Origin': '*',
      });
    }
    ```

    For non-quarantined complete captures, add `threatCheck` to the response body.

    **5. Update `src/index.js` -- `handleGetCaptureArtifact`**:

    After the existing `status !== 'complete'` check, add:
    ```javascript
    if (record.quarantined) {
      return problemResponse(451, 'Capture artifacts restricted due to content security policy', {
        'Cache-Control': 'no-store',
      }, {
        quarantineReason: record.quarantineReason,
        quarantinedAt: record.quarantinedAt,
      });
    }
    ```

    **6. Update `src/index.js` -- `handleVerifyCapture`**:

    Add quarantine check after fetching the record. Return 451 for quarantined captures.

    **7. Update `src/index.js` -- `handleCaptureStatus`**:

    Add a new branch for quarantined captures:
    ```javascript
    if (record.status === 'complete' && record.quarantined) {
      return jsonResponse({
        id: captureId,
        status: 'quarantined',
        quarantineReason: record.quarantineReason,
        quarantinedAt: record.quarantinedAt,
      }, 200, headers);
    }
    ```
    This must come BEFORE the `status === 'complete'` branch.

    **8. Update `src/index.js` -- `handleListCaptures`**:

    Add `'quarantined'` to the allowed status filter values. When `status=quarantined` is requested, the DB query should filter on `quarantined = 1` (not on the status column which stays 'complete'). Update the list DB query in db.js if needed, or handle the mapping in the handler. In the response, map quarantined captures to `status: 'quarantined'` with `quarantineReason` and `quarantinedAt` fields.

    **9. Update `src/webhooks.js`**:

    Add `'capture.quarantined'` to `VALID_EVENTS`. This allows tenants to subscribe to quarantine notifications.

    **10. Update the `scheduled()` handler dispatch in `src/index.js`**:

    The scheduled handler at line ~298 currently runs `handleScheduledTick` for all crons. Add dispatch for the daily re-scan cron:
    ```javascript
    async scheduled(controller, env, ctx) {
      if (controller.cron === '0 3 * * *') {
        const { handleRescanTick } = await import('./rescan.js');
        await handleRescanTick(controller, env, ctx);
        return;
      }
      await handleScheduledTick(controller, env, ctx);
      if (new Date(controller.scheduledTime).getUTCMinutes() === 0) {
        ctx.waitUntil(reportPendingMeterEvents(env, ctx));
      }
    },
    ```

    Use dynamic import for `rescan.js` to avoid loading it on every per-minute tick.

    ## Files to Read First
    - `src/index.js` -- all the handlers you're modifying (handleCreateCapture, handleBatchCapture, handleGetCapture, handleGetCaptureArtifact, handleVerifyCapture, handleCaptureStatus, handleListCaptures, scheduled())
    - `src/responses.js` -- the titles map and problemResponse helper
    - `src/webhooks.js` -- VALID_EVENTS
    - `src/threat-check.js` -- the module you're integrating (produced by Task 2)
    - `src/db.js` -- the new functions (produced by Task 1)

    ## Files to Modify
    - `src/responses.js` (add 451 title)
    - `src/index.js` (all handler changes + scheduled dispatch)
    - `src/webhooks.js` (add capture.quarantined event)

    ## What NOT to Do
    - Do NOT modify `src/db.js` (Task 1 owns it)
    - Do NOT modify `src/threat-check.js` (Task 2 owns it)
    - Do NOT create `src/rescan.js` (Task 4 owns it)
    - Do NOT modify `wrangler.toml` (Task 5 owns it)
    - Do NOT show tenant-facing threat type details in 451 responses (quarantineReason is for API consumers who own the capture; the 451 detail text should be generic)
    - Do NOT add an unquarantine admin endpoint (out of scope)
    - Do NOT use TypeScript
- **Deliverables**: Updated `src/responses.js`, `src/index.js`, `src/webhooks.js`
- **Success criteria**: Pre-capture threat check rejects flagged URLs with 422. Quarantined capture metadata returns 200 with `status: 'quarantined'` and no artifact URLs. Artifact endpoints return 451 for quarantined captures. Status endpoint shows quarantined state. List endpoint supports `?status=quarantined` filter. Scheduled handler dispatches to rescan on daily cron.

---

### Task 4: Re-scan Cron Handler
- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    You are implementing the background re-scan cron handler for WRL's content security scanning feature.

    ## Context

    WRL is a Cloudflare Worker (JavaScript, not TypeScript). A daily cron trigger (`0 3 * * *`) will re-check existing captures against Google Web Risk to detect URLs that became malicious after capture.

    The cron gets 15 minutes of CPU time (interval >= 1 hour on paid plan). The Web Risk API allows 6000 requests/minute with no batch endpoint (one URL per request).

    **Available modules:**
    - `src/threat-check.js` exports `checkUrl(url, env, { lookup })` and `checkUrls(urls, env, { lookup })`
    - `src/db.js` exports `listCapturesNeedingThreatCheck(db, olderThan, limit)`, `quarantineCapturesByUrl(db, url, reason, threatTypes)`, `recordThreatCheck(db, captureId, verdict, threatTypes)`

    ## What to Produce

    **1. New file: `src/rescan.js`**

    Export one function:

    ```javascript
    /**
     * Handle the daily re-scan cron tick.
     * Checks existing complete captures against Google Web Risk.
     *
     * @param {ScheduledController} controller
     * @param {object} env
     * @param {ExecutionContext} ctx
     */
    export async function handleRescanTick(controller, env, ctx) { ... }
    ```

    **Logic:**

    1. Query D1 for captures needing re-scan using `listCapturesNeedingThreatCheck(env.DB, olderThan, 500)`. The `olderThan` threshold should be 24 hours ago (only re-check URLs that haven't been checked in the last 24 hours). The limit of 500 is the per-invocation API budget cap.

    2. The returned results are de-duplicated by URL (the DB function handles this). For each unique URL:
       - Call `checkUrl(url, env)` (real API call, no stub injection)
       - If threat detected: call `quarantineCapturesByUrl(env.DB, url, threatTypes.join(','), threatTypes)` to quarantine ALL captures of that URL. For each affected captureId, dispatch a `capture.quarantined` webhook.
       - If clean: call `recordThreatCheck(db, captureId, 'safe', null)` for each capture with that URL to update `last_threat_check_at`.
       - If degraded (API error): skip this URL, it will be retried on next tick. Log at severity 4.

    3. Process URLs serially (not in parallel) to respect rate limits. The 500 URL limit and serial processing keeps the cron well within the 6000 req/min rate limit and 15-minute CPU budget.

    4. Log a batch summary at the end:
    ```javascript
    await log(env, 3, 'security', {
      event: 'threatcheck.rescan_tick',
      scannedCount,
      flaggedCount,
      skippedCount, // API errors
      durationMs: Date.now() - start,
      triggerTime: new Date(controller.scheduledTime).toISOString(),
    });
    ```

    5. For quarantine events, log each one:
    ```javascript
    await log(env, 4, 'security', {
      event: 'threatcheck.quarantine',
      captureId,
      tenantId: capture.tenantId,
      url,
      threatTypes,
    });
    ```

    **Webhook dispatch for quarantined captures:**

    Import `dispatchWebhooks` from `./webhook-dispatch.js`. For each capture quarantined by the re-scan, call `dispatchWebhooks` with event `'capture.quarantined'` and the capture data. Follow the same pattern as the queue consumer's webhook dispatch.

    **Error handling:**

    - If the entire cron handler throws, Cloudflare retries the cron. Use try/catch at the top level and log the error. Do NOT let individual URL check failures abort the entire scan.
    - Each URL check is wrapped in try/catch. Failures are counted as `skippedCount` and logged individually.

    **2. Update `wrangler.toml`**:

    Add `"0 3 * * *"` to the production cron triggers:
    ```toml
    [triggers]
    crons = ["*/1 * * * *", "0 3 * * *"]
    ```

    Add `"0 4 * * *"` to staging (offset by 1 hour to avoid quota collision):
    ```toml
    [env.staging.triggers]
    crons = ["*/1 * * * *", "0 4 * * *"]
    ```

    **3. Regenerate `wrangler.test.toml`**:

    Copy wrangler.toml, remove all `[[queues.consumers]]` sections and `[triggers]` sections. The existing comment at the top of wrangler.test.toml documents this pattern.

    ## Files to Read First
    - `src/scheduler.js` -- see the existing cron handler pattern
    - `src/webhook-dispatch.js` -- see `dispatchWebhooks` pattern
    - `src/log.js` -- log function signature
    - `src/index.js` lines ~298-303 -- see current scheduled() handler (Task 3 adds dispatch for '0 3 * * *')
    - `wrangler.toml` -- current cron config
    - `wrangler.test.toml` -- understand regeneration pattern

    ## Files to Create
    - `src/rescan.js`

    ## Files to Modify
    - `wrangler.toml` (add daily cron to both environments)
    - `wrangler.test.toml` (regenerate)

    ## What NOT to Do
    - Do NOT modify `src/index.js` (Task 3 owns the scheduled() dispatch)
    - Do NOT implement cursor-based resume across invocations (YAGNI -- 500 URLs/day is sufficient for current scale)
    - Do NOT implement exponential backoff for re-scan frequency (YAGNI)
    - Do NOT implement KV-based cursor storage (YAGNI)
    - Do NOT process URLs in parallel (serial respects rate limits simply)
    - Do NOT auto-un-quarantine if a URL becomes clean (out of scope per issue spec)
    - Do NOT use TypeScript
- **Deliverables**: `src/rescan.js`, updated `wrangler.toml`, regenerated `wrangler.test.toml`
- **Success criteria**: Re-scan handler queries D1 for stale checks, calls Web Risk API, quarantines flagged URLs, dispatches webhooks, logs summary. Cron triggers are correctly configured for both environments.

---

### Task 5: Observability -- Alerts, Runbooks, and Audit Schema
- **Agent**: observability-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 3, Task 4 (needs to know final log event names)
- **Approval gate**: no
- **Prompt**: |
    You are adding observability artifacts for WRL's content security scanning feature -- Coralogix alert definitions, runbooks, and audit log schema updates.

    ## Context

    WRL uses Coralogix for log-based monitoring. Alerts are provisioned via `scripts/provision-alerts.sh` and documented in `docs/operations/alerts.md`. Currently 4 alerts exist. You are adding 2 more.

    All threat-check log events use:
    - Subsystem: `security` (same as existing SSRF prevention)
    - Event prefix: `threatcheck.*`

    **Log events emitted by the implementation (Tasks 3 and 4):**

    | Event | Severity | When |
    |-------|----------|------|
    | `threatcheck.pass` | 3 (info) | Pre-capture URL check passes |
    | `threatcheck.block` | 5 (error) | Pre-capture URL check fails (URL flagged) |
    | `threatcheck.quarantine` | 4 (warn) | Existing capture quarantined during re-scan |
    | `threatcheck.rescan_tick` | 3 (info) | Daily re-scan batch completed |
    | `threatcheck.api_fail` | 5 (error) | Web Risk API error/timeout (has `context` field: `'pre_capture'` or `'rescan'`) |

    ## What to Produce

    **1. Update `scripts/provision-alerts.sh`**:

    Add two new alert payload functions following the existing pattern:

    **Alert: [WRL] Threat Check Quarantines**
    - Query: `event:"threatcheck.quarantine"` (app: wrl, subsystem: security)
    - Threshold: > 5 events in 24 hours
    - Priority: P3 (Low) -- system self-healed, operator reviews
    - Notification: Email to bp@ben-peter.com, 60-minute suppression
    - Time window: `LOGS_TIME_WINDOW_VALUE_HOURS_24`

    **Alert: [WRL] Threat Check API Failures**
    - Query: `event:"threatcheck.api_fail" AND context:"pre_capture"` (app: wrl, subsystem: security)
    - Threshold: > 2 events in 10 minutes
    - Priority: P2 (Medium) -- safety gate non-functional
    - Notification: Email to bp@ben-peter.com, 60-minute suppression
    - Time window: `LOGS_TIME_WINDOW_VALUE_MINUTES_10`

    Add two `upsert_alert` calls in `main()`. Update the final success message from "All 4 alerts" to "All 6 alerts".

    Follow the EXACT payload structure of the existing alerts (same JSON schema, same field names). Read the existing `capture_failures_payload` function carefully to match the format.

    **2. Update `docs/operations/alerts.md`**:

    Add two new alert definitions following the existing format:
    - Table with Query, Threshold, Priority
    - "What it monitors" paragraph
    - "Threshold rationale" paragraph
    - "Runbook:" link
    - Horizontal rule separator

    Update the opening paragraph count from "four" to "six".

    **3. Create `docs/operations/runbooks/threat-check-quarantines.md`**:

    Follow the exact structure of existing runbooks (see `runbooks/tsa-failures.md`):
    - What fires this alert
    - Check (Coralogix query with `event`, fields to examine)
    - Likely causes (legitimate URL compromised after capture, Safe Browsing false positive, tenant abuse)
    - Fix (verify via Google Transparency Report, un-quarantine if false positive via admin API, investigate tenant if abuse pattern)
    - False positive? (Yes, Google's lists have documented false positive rate)

    **4. Create `docs/operations/runbooks/threat-check-api-failures.md`**:

    - What fires this alert
    - Check (Coralogix query for `threatcheck.api_fail` with `context:"pre_capture"`)
    - Likely causes (API key invalid/quota exhausted, Google API outage, network issue)
    - Fix (check Google Cloud Console for key status and quota, check Google Cloud Status Dashboard, decide whether to accept fail-open or halt captures)
    - Impact (captures proceed without screening when API is down -- fail-open design)

    **5. Update `docs/audit-log-schema.md`**:

    Add the five new events to the Event Taxonomy table with severity, subsystem, and description. Add new audit fields: `threatTypes` (string[]), `context` (string: 'pre_capture' or 'rescan'), `scannedCount` (number), `flaggedCount` (number), `skippedCount` (number). Add example Coralogix queries for threat check investigation.

    ## Files to Read First
    - `scripts/provision-alerts.sh` -- existing alert payload format (read the FULL file)
    - `docs/operations/alerts.md` -- existing alert documentation format
    - `docs/operations/runbooks/tsa-failures.md` -- runbook template
    - `docs/operations/runbooks/capture-failures.md` -- another runbook example
    - `docs/audit-log-schema.md` -- existing event taxonomy and audit fields

    ## Files to Modify
    - `scripts/provision-alerts.sh`
    - `docs/operations/alerts.md`
    - `docs/audit-log-schema.md`

    ## Files to Create
    - `docs/operations/runbooks/threat-check-quarantines.md`
    - `docs/operations/runbooks/threat-check-api-failures.md`

    ## What NOT to Do
    - Do NOT modify any source code files (src/)
    - Do NOT create Grafana dashboards (WRL uses Coralogix, not Grafana)
    - Do NOT add alerts for rescan API failures (retry-safe, caught by rescan_tick summary)
    - Do NOT use TypeScript
- **Deliverables**: Updated `scripts/provision-alerts.sh` (2 new alerts), updated `docs/operations/alerts.md`, 2 new runbooks, updated `docs/audit-log-schema.md`
- **Success criteria**: Alert payloads match the existing JSON schema format exactly. Runbooks follow the established template. Audit schema documents all new events.

---

### Task 6: Documentation Updates
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 3 (needs final API shape)
- **Approval gate**: no
- **Prompt**: |
    You are updating WRL's documentation for the content security scanning feature -- OpenAPI spec, README, CONTRIBUTING, and OPERATIONS docs.

    ## Context

    WRL screens URLs against Google Web Risk (threat intelligence) before capture and re-scans existing captures daily. Flagged captures are quarantined: metadata accessible, artifacts restricted.

    **IMPORTANT naming convention**: The API uses provider-agnostic names. The field is `threatCheck` (not `safeBrowsing`). Internal code uses `threat-check.js`. Only operations/internal docs reference "Google Web Risk" by name. Public API docs say "threat intelligence" or "content security screening."

    ## What to Produce

    **1. Update `openapi.yaml`**:

    - Add `quarantined` to the `status` enum in `CaptureStatus`, `CaptureSummary`, and `CaptureRecord` schemas
    - Add `threatCheck` field to `CaptureRecord` and `CaptureSummary`: `{ type: string, enum: [pass, fail, unavailable], nullable: true, description: "Result of URL threat screening. null for captures created before this feature." }`
    - Add `quarantineReason` (string, nullable) and `quarantinedAt` (string, format: date-time, nullable) to `CaptureRecord` and `CaptureSummary`
    - Add 422 example for threat-check rejection on `POST /v1/captures`: `{ type: about:blank, status: 422, title: Unprocessable Content, detail: "URL flagged by content security screening", threatTypes: ["MALWARE"] }`
    - Add same example under batch capture per-item error
    - Add 451 response to `GET /v1/captures/{captureId}/artifacts/{type}` and WACZ endpoint: `{ type: about:blank, status: 451, title: "Unavailable For Legal Reasons", detail: "Capture artifacts restricted due to content security policy" }`
    - Add `quarantined` to the `status` query parameter enum on `GET /v1/captures`
    - Add `capture.quarantined` to webhook event enum
    - Bump version to next minor (0.8.0 or whatever follows current)

    **2. Update `README.md`**:

    Add a "Content Security" section in the Features area explaining:
    - URLs are screened against threat intelligence databases before capture
    - Existing captures are re-scanned daily
    - Flagged captures are quarantined (metadata accessible, artifacts restricted)
    - Screening degrades gracefully if the threat intelligence service is unavailable

    Add the `GOOGLE_WEB_RISK_API_KEY` secret to the setup steps, following the existing pattern for other secrets (`wrangler secret put`). Note that the key is optional -- captures proceed without screening if absent (graceful degradation).

    **3. Update `CONTRIBUTING.md`**:

    Add `GOOGLE_WEB_RISK_API_KEY` to the `.dev.vars` template with comment: `# Optional -- URL threat screening; omit for graceful degradation`

    **4. Update `OPERATIONS.md`** (if it exists) or `docs/operations/` README:

    Add `GOOGLE_WEB_RISK_API_KEY` to the Worker runtime secrets table with: Purpose = "Google Web Risk API key for URL threat screening", Required = "No -- captures proceed without screening (graceful degradation)"

    ## Files to Read First
    - `openapi.yaml` -- current spec (understand existing schemas, responses, patterns)
    - `README.md` -- existing structure, secret setup steps
    - `CONTRIBUTING.md` -- .dev.vars template
    - `docs/operations/alerts.md` -- reference for operations documentation style

    ## Files to Modify
    - `openapi.yaml`
    - `README.md`
    - `CONTRIBUTING.md`
    - Operations docs (if applicable)

    ## What NOT to Do
    - Do NOT modify any source code files
    - Do NOT reference "Google Safe Browsing" in public-facing docs (use "threat intelligence" or "content security screening")
    - Do NOT reference "Google Web Risk" in the OpenAPI spec (it's an implementation detail). Use "threat intelligence database" in schema descriptions.
    - Do NOT add implementation details about the re-scan frequency or API budget to public docs
    - Do NOT create an ARCHITECTURE.md (the project doesn't use one)
    - Do NOT use TypeScript
- **Deliverables**: Updated `openapi.yaml`, `README.md`, `CONTRIBUTING.md`, operations docs
- **Success criteria**: OpenAPI spec validates cleanly. New status values, fields, and response codes are documented. Secret setup instructions follow existing conventions.

---

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 post-execution. Task 2 includes unit tests for the threat-check module. Tasks 3 and 4 include instructions for testable patterns (injectable dependencies, fetchMock for integration tests). Phase 6 will run the full test suite.
- **Security**: security-minion is primary on Task 2 (API client). The threat model is addressed: fail-open rationale, no auto-un-quarantine, platform-level API key, quarantine only restricts artifacts (not metadata).
- **Usability -- Strategy**: ux-strategy-minion's contributions are incorporated: "content restricted" terminology for user-facing text, no threat types shown to tenants, provider-agnostic naming. The UI changes (badge--warning, renderDetailRestricted) are deferred to a separate issue -- this plan focuses on API/backend.
- **Usability -- Design**: No UI implementation in this plan. API-only. UI changes tracked as follow-up.
- **Documentation**: software-docs-minion handles Task 6 (OpenAPI, README, CONTRIBUTING). observability-minion handles Task 5 (alerts, runbooks, audit schema). Phase 8 post-execution covers any gaps.
- **Observability**: observability-minion is primary on Task 5. Alert definitions, runbooks, and audit log schema are covered.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: Tasks 3-5 produce runtime components with structured logging. Review focus: verify log event naming consistency, severity assignments, and alert threshold calibration.
  - user-docs-minion: Task 6 changes what API consumers need to know. Review focus: verify OpenAPI descriptions are clear about quarantine behavior and the 451 response semantics.
- **Not selected**:
  - ux-design-minion: No UI components in this plan (API/backend only).
  - accessibility-minion: No web-facing HTML/UI produced.
  - sitespeed-minion: No web-facing runtime code changes affecting performance.
  - data-minion: Already primary on Task 1; no separate review needed.
  - api-design-minion: Already primary on Task 3; no separate review needed.
  - iac-minion: Already primary on Task 4; no separate review needed.

---

### Decisions

- **HTTP status for quarantined artifacts**
  Chosen: 451 (Unavailable For Legal Reasons)
  Over: 403 (api-design-minion), which is already used for auth failures throughout WRL
  Why: Issue spec says 451. Semantically, content restricted due to threat intelligence is a policy/legal restriction, not an auth failure. 451 is unambiguous to API consumers.

- **Quarantine representation in DB vs API**
  Chosen: DB keeps `status='complete'` + `quarantined=1` flag; API returns `status:'quarantined'`
  Over: (a) Adding 'quarantined' to the status CHECK constraint (requires table rebuild), (b) contentRestriction overlay on `status:'complete'` (adds consumer complexity)
  Why: Avoids the SQLite CHECK constraint limitation while providing a clean API surface. The mapping happens in the response handlers, which already transform DB rows to API shapes.

- **API naming: threatCheck vs safeBrowsing**
  Chosen: `threatCheck` (provider-agnostic) in API responses
  Over: `safeBrowsing` (software-docs-minion flagged provider lock-in)
  Why: If WRL later switches to Cloudflare Radar URL Scanner or another provider, the API field name doesn't need to change. Internal module is `threat-check.js`, log events are `threatcheck.*`.

- **Re-scan frequency: daily vs 6-hourly**
  Chosen: Daily at 03:00 UTC
  Over: Every 6 hours (security-minion's suggestion)
  Why: iac-minion's CPU budget analysis -- daily cron gets 15 min CPU (vs 30s for sub-hour). Also conserves Web Risk API quota. Background re-scan is not time-critical.

- **UI implementation scope**
  Chosen: API/backend only in this plan. UI changes (badge--warning, restricted detail view, submit form error) tracked as follow-up.
  Over: Including frontend-minion tasks for the dashboard UI
  Why: YAGNI -- ship the backend protection first. The existing UI gracefully handles unknown status values (shows raw value). Frontend polish is a separate, lower-priority issue.

---

### Risks and Mitigations

1. **SQLite CHECK constraint blocks quarantine updates** (HIGH). The `captures.status` CHECK may reject UPDATEs if application code tries to set `status = 'quarantined'`. Mitigation: design keeps `status = 'complete'`, uses separate `quarantined` flag. Task 1 agent must verify on staging that the CHECK constraint does not affect the `quarantined` column (it shouldn't -- CHECK is only on `status`).

2. **Web Risk API cost spiral from re-scan** (MEDIUM). 10K captures checked daily = 300K lookups/month, exceeding free tier. Mitigation: 500 URL per-invocation cap, URL de-duplication, 24-hour check interval. At current WRL scale (hundreds of captures), this stays well within free tier.

3. **False positives quarantine legitimate content** (MEDIUM). Google's threat lists have documented false positives. Mitigation: no auto-un-quarantine (prevents oscillation attacks), webhook notifies tenant immediately, admin API for manual review (future). Metadata stays accessible so tenants can dispute.

4. **Fail-open window for malicious URLs** (MEDIUM). If Web Risk API is down, captures proceed unchecked. Mitigation: re-scan cron catches within 24 hours, Coralogix alert on sustained API failures (>2 in 10 min), fail-open is bounded and auditable.

5. **GCP dependency adds operational surface** (LOW). New cloud provider dependency (Google Cloud API key). Mitigation: single API key, no infrastructure beyond that. Documented in 1Password, operations docs, and runbooks.

---

### Execution Order

```
Batch 1 (parallel):
  Task 1: D1 Schema Migration and DB Functions  [APPROVAL GATE]
  Task 2: Web Risk API Client Module

  -- Gate: Task 1 schema design approved --

Batch 2 (parallel, after gate + Tasks 1,2):
  Task 3: Pre-Capture Integration and API Response Updates
  Task 4: Re-scan Cron Handler

Batch 3 (parallel, after Tasks 3,4):
  Task 5: Observability -- Alerts, Runbooks, and Audit Schema
  Task 6: Documentation Updates
```

Total approval gates: 1 (Task 1 schema design).

---

### External Skills

No external skills detected in project.

---

### Verification Steps

After all tasks complete:

1. **Unit tests pass**: `npm test` runs all existing + new tests green
2. **Migration applies**: `wrangler d1 migrations apply DB --local` succeeds
3. **Pre-capture rejection**: `curl -X POST /v1/captures` with a test URL against fetchMock returns 422 with `threatTypes`
4. **Quarantine gate**: Seeded quarantined capture returns 451 on artifact endpoints, 200 with `status:'quarantined'` on metadata endpoint
5. **Re-scan cron**: `worker.scheduled({ cron: '0 3 * * *', ... })` processes captures and quarantines flagged URLs
6. **Status filter**: `GET /v1/captures?status=quarantined` returns only quarantined captures
7. **Webhook event**: `capture.quarantined` is in VALID_EVENTS and can be subscribed to
8. **Alert provisioning**: `scripts/provision-alerts.sh --dry-run` shows 6 alerts (not 4)
9. **OpenAPI validation**: `openapi.yaml` validates without errors
10. **wrangler.test.toml**: No `[[queues.consumers]]` or `[triggers]` sections present
