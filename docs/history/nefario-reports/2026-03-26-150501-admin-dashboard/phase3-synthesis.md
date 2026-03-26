## Delegation Plan

**Team name**: admin-dashboard
**Description**: Build an admin dashboard for operator visibility into tenant overviews, per-tenant usage, and tier consumption -- replacing manual D1 queries with a live `/admin` UI.

### Conflict Resolution: Rate Limit

api-design-minion recommended 20/60s; security-minion recommended 30/60s. Resolved in favor of **30/60s** (security-minion's position). Rationale: the admin key has approximately 256 bits of entropy, making brute-force non-viable regardless of rate. The rate limit exists to prevent accidental self-DoS, not to resist enumeration. 30/60s gives comfortable headroom for a dashboard session (initial 2-request parallel load + multiple drill-downs + refreshes) without reaching limits during normal operation. A lower value would frustrate the operator within a single minute of exploration. The blast radius is limited -- this only affects requests authenticated with the admin infrastructure secret.

---

### Task 1: Add DAL functions to `src/db.js`

- **Agent**: data-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Add four admin dashboard DAL functions to `src/db.js`

    You are adding four new data access layer functions to the existing `src/db.js` module for an admin dashboard. These functions provide read-only aggregate views of tenant and usage data. No schema changes or migrations are needed -- all queries work against existing tables and indexes.

    ### Context

    The existing DAL in `src/db.js` follows strict conventions:
    - All DB access is centralized in this module (no raw `env.DB.prepare()` elsewhere)
    - Functions use `db.prepare(...).bind(...)` for parameterized queries
    - Functions return plain JS objects with camelCase keys (transformed from snake_case DB columns)
    - `db.batch()` is used when multiple statements need to execute in a single round-trip
    - The `computePeriod()` function (already exported from `db.js`) returns the current `YYYY-MM` period string

    The relevant tables are:
    - `tenants` -- columns: `id`, `tier`, `billing_status`, `grace_period_end`, `payment_method_added_at`, `stripe_customer_id`, `eidas_qualified`, `config`, `created_at`, `updated_at`
    - `usage_counters` -- columns: `tenant_id`, `period`, `capture_count`, `storage_bytes`, `api_call_count`, `eidas_capture_count`, `updated_at`. Composite PK: `(tenant_id, period)`
    - `api_keys` -- columns: `key_hash`, `tenant_id`, `scopes`, `name`, `created_at`, `created_by`, `revoked`, `revoked_at`

    ### Functions to add

    **1. `listTenantsWithUsage(db, period)`**

    Returns all tenants with their current-period usage in a single query.

    ```sql
    SELECT
      t.id,
      t.tier,
      t.billing_status,
      t.payment_method_added_at,
      t.eidas_qualified,
      t.config,
      t.created_at,
      COALESCE(u.capture_count, 0) AS capture_count,
      COALESCE(u.storage_bytes, 0) AS storage_bytes,
      COALESCE(u.api_call_count, 0) AS api_call_count,
      COALESCE(u.eidas_capture_count, 0) AS eidas_capture_count,
      (SELECT COUNT(*) FROM api_keys ak WHERE ak.tenant_id = t.id AND ak.revoked = 0) AS key_count
    FROM tenants t
    LEFT JOIN usage_counters u
      ON u.tenant_id = t.id AND u.period = ?
    ORDER BY t.created_at DESC
    ```

    Return shape: array of objects with camelCase keys. Include `config` as raw string (the handler will parse it). Include `keyCount` as a number.

    **2. `getUsageHistory(db, tenantId, limit = 12)`**

    Returns historical usage for a single tenant across multiple periods.

    ```sql
    SELECT period, capture_count, storage_bytes, api_call_count, eidas_capture_count, updated_at
    FROM usage_counters
    WHERE tenant_id = ?
    ORDER BY period DESC
    LIMIT ?
    ```

    Return shape: array of `{ period, captureCount, storageBytes, apiCallCount, eidasCaptureCount, updatedAt }`.

    **3. `getTenantDetail(db, tenantId, periodLimit = 6)`**

    Returns comprehensive tenant data in a single `db.batch()` call (one D1 round-trip). Three statements:

    ```sql
    -- Statement 1: tenant row
    SELECT * FROM tenants WHERE id = ?

    -- Statement 2: usage history
    SELECT period, capture_count, storage_bytes, api_call_count, eidas_capture_count, updated_at
    FROM usage_counters WHERE tenant_id = ? ORDER BY period DESC LIMIT ?

    -- Statement 3: active keys
    SELECT key_hash, name, scopes, created_at, created_by
    FROM api_keys WHERE tenant_id = ? AND revoked = 0 ORDER BY created_at DESC
    ```

    Return shape: `{ tenant: {...}, usageHistory: [...], keys: [...] }` or `null` if tenant not found. Transform keys to camelCase. Parse `scopes` from JSON string to array.

    **4. `getOverviewStats(db, period)`**

    Returns platform-wide aggregate statistics.

    ```sql
    -- Statement 1: tenant breakdown
    SELECT
      COUNT(*) AS total_tenants,
      SUM(CASE WHEN tier = 'free' THEN 1 ELSE 0 END) AS free_count,
      SUM(CASE WHEN tier = 'pro' THEN 1 ELSE 0 END) AS pro_count,
      SUM(CASE WHEN billing_status = 'active' THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN billing_status = 'grace_period' THEN 1 ELSE 0 END) AS grace_count,
      SUM(CASE WHEN billing_status = 'blocked' THEN 1 ELSE 0 END) AS blocked_count,
      (SELECT COUNT(*) FROM api_keys WHERE revoked = 0) AS active_api_keys
    FROM tenants

    -- Statement 2: usage aggregates
    SELECT
      SUM(CASE WHEN period = ? THEN capture_count ELSE 0 END) AS current_captures,
      SUM(capture_count) AS all_time_captures,
      SUM(CASE WHEN period = ? THEN storage_bytes ELSE 0 END) AS current_storage,
      SUM(CASE WHEN period = ? THEN eidas_capture_count ELSE 0 END) AS current_eidas_captures
    FROM usage_counters
    ```

    Use `db.batch()` for single round-trip. Return shape: `{ totalTenants, tenantsByTier: {free, pro}, tenantsByBillingStatus: {active, gracePeriod, blocked}, totalCapturesCurrentPeriod, totalCapturesAllTime, totalStorageBytes, totalEidasCaptures, activeApiKeys }`.

    ### Implementation rules

    - Export all four functions
    - Follow the exact coding style of existing functions (JSDoc comments, parameter validation patterns)
    - Use `COALESCE` for LEFT JOINs to ensure zeroed defaults
    - No new indexes needed (existing PKs and indexes are sufficient at current scale)
    - Do NOT use `db.exec()` -- always use `db.prepare().bind().all()` or `db.batch()`

    ### What NOT to do

    - Do NOT modify existing DAL functions
    - Do NOT add any new tables or migrations
    - Do NOT compute "approaching limits" logic in the DAL -- that is application-layer logic using `getEffectiveQuota()` from `quotas.js`
    - Do NOT add pagination -- YAGNI at current scale

    ### Files to modify

    - `src/db.js` -- add the four functions at the end, before any closing comments

    ### Success criteria

    - All four functions exported from `src/db.js`
    - Parameterized queries (no string interpolation)
    - camelCase return keys
    - `db.batch()` used where multiple statements needed
    - Existing functions and exports unchanged

- **Deliverables**: Four new exported functions in `src/db.js`: `listTenantsWithUsage`, `getUsageHistory`, `getTenantDetail`, `getOverviewStats`
- **Success criteria**: Functions exported, use parameterized queries, return camelCase objects, batch where possible

---

### Task 2: Add admin dashboard API endpoints and raise rate limit

- **Agent**: api-design-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: The API surface (three endpoints with response shapes) is hard to reverse once the frontend depends on it, and both the frontend task (Task 3) and test task (Task 4) depend on these contracts.
- **Gate rationale**: |
    Chosen: Three focused GET endpoints (`/v1/admin/tenants`, `/v1/admin/tenants/:id`, `/v1/admin/overview`), each returning purpose-specific response shapes. Tenant list includes embedded usage (via JOIN) to avoid N+1. Detail includes usage history + keys in one response (via db.batch). Overview returns aggregated platform stats.
    Over: (1) Single mega-endpoint returning everything -- rejected because it mixes concerns that change at different rates and prevents parallel client-side fetches. (2) Reusing existing per-tenant endpoints (`GET /v1/admin/usage`) with a loop -- rejected because it creates N+1 queries.
    Why: Three endpoints match the existing API pattern (purpose-specific, one resource per endpoint), enable parallel fetching on dashboard load, and each maps cleanly to a single DAL function or db.batch call.
- **Prompt**: |

    ## Task: Add admin dashboard API endpoints and raise rate limit

    You are adding three new admin API endpoints for an operator dashboard and raising the admin rate limit from 5/60s to 30/60s. The endpoints are read-only views of tenant and usage data, protected by the existing `verifyAdminKey` auth gate.

    ### Context

    The existing admin API in `src/admin.js` handles key management (create, list, revoke) and usage queries. All admin endpoints:
    - Use `verifyAdminKey` auth (Bearer token against `ADMIN_KEY` secret)
    - Are rate-limited by `ADMIN_RATE_LIMITER` (currently 5/60s, you will raise to 30/60s)
    - Return `Cache-Control: private, no-store` via the `ADMIN_CACHE` constant
    - Use `problemResponse()` for errors (RFC 9457 format)
    - Log all requests via `ctx.waitUntil(log(...))`
    - Return camelCase JSON field names

    `src/admin.js` is currently 495 lines focused on key management. The dashboard handlers are a different concern, so create a new file `src/admin-dashboard.js`.

    The route table in `src/index.js` uses regex patterns with capture groups. Admin auth and rate limiting are handled centrally in the fetch handler (lines 527-549) for all `/v1/admin/*` routes, so the new endpoints automatically get auth + rate limiting.

    ### Part 1: Create `src/admin-dashboard.js` with three handler functions

    **Handler 1: `handleAdminListTenants(request, env, ctx)`**

    Endpoint: `GET /v1/admin/tenants`

    Implementation:
    1. Import `listTenantsWithUsage` from `./db.js` and `getEffectiveQuota` from `./quotas.js`
    2. Extract optional `period` query param; default to `computePeriod()`; validate with `/^\d{4}-\d{2}$/`
    3. Call `listTenantsWithUsage(env.DB, period)`
    4. For each tenant, parse `config` JSON and compute quota via `getEffectiveQuota(hasPaymentMethod, parsedConfig)`
    5. Log the request via `ctx.waitUntil(log(env, 3, 'admin', { event: 'admin.list_tenants', ... }))`

    Response shape:
    ```json
    {
      "data": [
        {
          "tenantId": "acme-corp",
          "tier": "free",
          "billingStatus": "active",
          "hasPaymentMethod": false,
          "eidasQualified": false,
          "createdAt": "2025-11-01T12:00:00.000Z",
          "currentPeriod": {
            "period": "2026-03",
            "captureCount": 142,
            "eidasCaptureCount": 0,
            "storageBytes": 524288000,
            "apiCallCount": 890
          },
          "quota": {
            "capturesPerMonth": 200,
            "storageBytes": 1073741824
          },
          "keyCount": 2
        }
      ],
      "meta": {
        "totalTenants": 12,
        "period": "2026-03"
      }
    }
    ```

    - `hasPaymentMethod` is a boolean derived from `payment_method_added_at IS NOT NULL`
    - `quota` is computed server-side by `getEffectiveQuota()`
    - Do NOT include raw `config` or `payment_method_added_at` timestamp in the response
    - Headers: `ADMIN_CACHE` (`Cache-Control: private, no-store`)

    **Handler 2: `handleAdminGetTenant(request, env, ctx, match)`**

    Endpoint: `GET /v1/admin/tenants/:id`

    The `match` parameter contains regex capture groups. `match[1]` is the tenant ID (already validated by route regex `[a-z0-9_-]{1,64}`).

    Implementation:
    1. Import `getTenantDetail` from `./db.js`
    2. Extract tenant ID from `match[1]`
    3. Extract optional `periods` query param (default 6, max 24, validate as positive integer)
    4. Call `getTenantDetail(env.DB, tenantId, periods)`
    5. If result is null, return `problemResponse(404, 'Tenant not found')`
    6. Compute quota via `getEffectiveQuota()`
    7. Log the request

    Response shape:
    ```json
    {
      "tenantId": "acme-corp",
      "tier": "free",
      "billingStatus": "active",
      "gracePeriodEnd": null,
      "hasPaymentMethod": false,
      "paymentMethodAddedAt": null,
      "stripeCustomerId": null,
      "eidasQualified": false,
      "config": {},
      "createdAt": "2025-11-01T12:00:00.000Z",
      "updatedAt": "2026-03-15T09:30:00.000Z",
      "quota": {
        "capturesPerMonth": 200,
        "storageBytes": 1073741824
      },
      "keys": [
        {
          "keyHash": "a1b2c3...",
          "name": "production",
          "scopes": ["capture", "read"],
          "createdAt": "2025-11-01T12:00:00.000Z",
          "createdBy": "admin"
        }
      ],
      "usageHistory": [
        { "period": "2026-03", "captureCount": 142, "eidasCaptureCount": 0, "storageBytes": 524288000, "apiCallCount": 890 }
      ]
    }
    ```

    - `config` is the parsed JSON object (or `{}` if null)
    - Headers: `ADMIN_CACHE`

    **Handler 3: `handleAdminGetOverview(request, env, ctx)`**

    Endpoint: `GET /v1/admin/overview`

    Implementation:
    1. Import `getOverviewStats` from `./db.js`
    2. Extract optional `period` query param; default to `computePeriod()`; validate
    3. Call `getOverviewStats(env.DB, period)`
    4. Log the request

    Response shape:
    ```json
    {
      "totalTenants": 12,
      "totalCapturesCurrentPeriod": 4520,
      "totalCapturesAllTime": 45000,
      "totalStorageBytes": 21474836480,
      "totalEidasCaptures": 120,
      "tenantsByTier": { "free": 8, "pro": 4 },
      "tenantsByBillingStatus": { "active": 10, "gracePeriod": 1, "blocked": 1 },
      "activeApiKeys": 24,
      "period": "2026-03"
    }
    ```

    - Headers: `ADMIN_CACHE`

    ### Part 2: Register routes in `src/index.js`

    Add three new routes to the `routes` array, after the existing admin routes:

    ```js
    ['GET',    /^\/v1\/admin\/tenants$/, handleAdminListTenants],
    ['GET',    /^\/v1\/admin\/tenants\/([a-z0-9_-]{1,64})$/, handleAdminGetTenant],
    ['GET',    /^\/v1\/admin\/overview$/, handleAdminGetOverview],
    ```

    Add the import at the top of `index.js`:
    ```js
    import { handleAdminListTenants, handleAdminGetTenant, handleAdminGetOverview } from './admin-dashboard.js';
    ```

    **Route ordering note**: Place `GET /v1/admin/tenants/:id` AFTER the existing `GET /v1/admin/tenants/:id/config` route (line 85-86). The `$` anchor on the new route prevents collision, but keeping the more specific route first is good practice. Add a comment noting the relationship.

    ### Part 3: Raise admin rate limit from 5/60s to 30/60s

    **`src/rate-limits.js`**: Change `admin: { limit: 5, period: 60 }` to `admin: { limit: 30, period: 60 }`.

    **`wrangler.toml`**: Change `simple = { limit = 5, period = 60 }` to `simple = { limit = 30, period = 60 }` in BOTH the production `ADMIN_RATE_LIMITER` binding (around line 48) AND the staging `ADMIN_RATE_LIMITER` binding (around line 258).

    Update the comment in `src/admin.js` header (line 10) that says "5 req/60s per IP" to "30 req/60s per IP".

    ### What NOT to do

    - Do NOT modify existing admin handlers in `src/admin.js` (except the rate limit comment)
    - Do NOT add WebSocket/SSE support
    - Do NOT add pagination
    - Do NOT add a caching layer
    - Do NOT add CORS headers on admin endpoints
    - Do NOT add ORDER BY parameters that accept user input (the tenant list always sorts by `created_at DESC`)

    ### Files to create

    - `src/admin-dashboard.js`

    ### Files to modify

    - `src/index.js` -- add import + three routes
    - `src/rate-limits.js` -- raise admin limit
    - `wrangler.toml` -- raise binding limit (production + staging)
    - `src/admin.js` -- update rate limit comment in header

    ### Success criteria

    - Three new GET endpoints accessible with admin key auth
    - All responses use `ADMIN_CACHE` headers
    - All requests logged
    - Period param validated
    - Tenant detail returns 404 for unknown tenant
    - Rate limit raised in both code and wrangler config
    - No CORS headers on admin responses
    - Existing admin endpoints unaffected

- **Deliverables**: `src/admin-dashboard.js` with three handlers; route registration in `src/index.js`; rate limit raised to 30/60s
- **Success criteria**: Endpoints return correct response shapes, proper auth gate, logging, error handling, rate limit change applied in both code and wrangler config

---

### Task 3: Build admin dashboard frontend

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |

    ## Task: Build the admin dashboard frontend

    You are building a standalone admin dashboard served from `GET /admin` that lets operators view tenant data, usage, and platform overview. The dashboard is a separate HTML shell from the existing tenant UI at `/ui`, with its own auth flow (admin key in sessionStorage).

    ### Architecture

    Follow the exact same pattern as the existing tenant UI:
    - `src/ui/ui-shell.js` inlines all CSS + JS into a single HTML response
    - Each view is a separate JS module file exporting a string constant
    - DOM is built with `createElement`/`appendChild` -- never use `innerHTML` with variable data (XSS prevention)
    - Design system CSS (`src/design-system.js` exports `DESIGN_SYSTEM_CSS`) provides all tokens and component styles
    - Hash routing for view navigation

    ### Files to create

    **1. `src/admin/admin-shell.js`**

    Export `htmlAdminDashboard()` function that returns a `Response` with:
    - HTML document with inline CSS (design system + admin CSS) and inline JS (auth + views)
    - Title: "WRL Admin"
    - CSP header: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
    - `Cache-Control: no-store`
    - `X-Frame-Options: DENY`
    - `<div id="admin-app"></div>` as mount point
    - `<noscript>` message

    **2. `src/admin/admin-auth.js`**

    Export `ADMIN_AUTH_JS` string constant containing the auth gate code:
    - On load: check `sessionStorage.getItem('wrl_admin_key')`
    - If absent: render a login form with `<input type="password" autocomplete="off">` and a submit button
    - On submit: validate by calling `GET /v1/admin/overview` with `Authorization: Bearer <key>`. Use the overview endpoint because it is a single lightweight GET that confirms admin access.
    - On 200: store key in `sessionStorage`, render the admin shell (nav + content area)
    - On 401: show error alert using `.alert.alert--error` pattern, clear input
    - Paste-friendly -- do NOT disable paste
    - Provide a "Logout" button that calls `sessionStorage.removeItem('wrl_admin_key')` and reloads

    Helper function `adminFetch(path)` that wraps `fetch()` with `Authorization: Bearer` header from sessionStorage.

    **3. `src/admin/admin-css.js`**

    Export `ADMIN_CSS` string constant. Only admin-specific CSS additions -- the design system covers everything else. Use design system CSS custom properties exclusively (no hardcoded colors, sizes, or fonts).

    Key classes needed:
    - `.view-container--admin` -- `max-width: 1100px` (wider than the 860px tenant views, scoped to admin)
    - `.admin-stats-row` -- `display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); margin-bottom: var(--space-6);`
    - `.admin-stat`, `.admin-stat-value`, `.admin-stat-label` -- mirrors the billing-stat pattern (centered text, bold value, muted label)
    - `.admin-table-wrap` -- `overflow-x: auto` for responsive table handling
    - `.admin-table tr` -- `cursor: pointer` on data rows, hover background `var(--color-surface-muted)`
    - `.admin-table th button` -- sortable header button styling (inherits font, no border, pointer cursor)
    - `.admin-tenant-link` -- tenant ID cell using `font-family: var(--font-mono); color: var(--color-primary)`
    - `.admin-refresh-btn` -- refresh button styling matching existing `.usage-refresh-btn` pattern

    Estimated approximately 60-80 lines of CSS.

    **4. `src/admin/admin-tenants.js`**

    Export `ADMIN_TENANTS_JS` string constant -- the tenant list view.

    On mount:
    1. Call `adminFetch('/v1/admin/overview')` and `adminFetch('/v1/admin/tenants')` in parallel via `Promise.all`
    2. Show loading placeholder ("Loading tenant data..." in muted text)
    3. On success, render:

    **Level 1: Stat cards** (reuse billing stat-cell pattern)
    - Total Tenants (from overview)
    - Active This Period (tenants with captureCount > 0, computed client-side from tenant list)
    - Total Captures (from overview `totalCapturesCurrentPeriod`)
    - Total Storage (from overview `totalStorageBytes`, formatted human-readable)

    **Level 2: Tenant table** (semantic HTML `<table>`)
    - Columns: Tenant ID (link to detail), Tier (badge), Captures (period), Storage, Keys, Created
    - Tenant ID column: `<a href="#/tenants/${id}">` with `.admin-tenant-link` class
    - Tier column: use existing `.badge` component
    - Numeric columns: right-aligned, `font-variant-numeric: tabular-nums`
    - Created column: human-readable date format
    - Default sort: captures descending (client-side sort)
    - Sortable columns: click `<th>` buttons to toggle sort. Use `aria-sort` attribute on active column.
    - Empty state: "No tenants found." in muted text
    - `<th scope="col">` on all headers
    - `aria-label="Tenant list"` on the `<table>`

    **Refresh button**: Below stats, above table. On click, re-fetches both endpoints.

    **Error handling**: On API failure, show `.alert.alert--error` with `role="alert"`: "Could not load tenant data. Please try refreshing."

    **5. `src/admin/admin-detail.js`**

    Export `ADMIN_DETAIL_JS` string constant -- per-tenant detail view.

    Route: `#/tenants/:tenantId` (extract tenant ID from hash)

    On mount:
    1. Call `adminFetch('/v1/admin/tenants/${tenantId}?periods=12')`
    2. Show loading placeholder

    On success, render:

    **Back link**: "Back to tenants" linking to `#/tenants` (reuse `buildBackLink()` pattern from `ui-detail.js`)

    **Tenant header**: h1 with tenant ID, badge showing tier

    **Current period usage**: Card section (`.settings-section.card` pattern) with:
    - Capture count vs. quota limit (progress bar using `.usage-bar` pattern if quota is finite)
    - Storage bytes (formatted)
    - API call count
    - eIDAS capture count (only if > 0)

    **Usage history table**: Compact table showing period-over-period data:
    | Period | Captures | Storage | API Calls | eIDAS |
    Use `.billing-tier-table` styling (compact, --text-sm)

    **API Keys section**: Table showing active keys with name, scopes (as badges), created date. Read-only display only.

    **Tenant config section**: Show config as formatted JSON in a `<pre>` with `<code>`. Only if config is non-empty.

    **Error handling**: Same pattern as tenant list.

    ### Route handling

    Add a hash router within the admin shell:
    ```
    #/tenants       -> tenant list (default)
    #/tenants/:id   -> tenant detail
    ```

    On empty hash or `#/`, redirect to `#/tenants`. Listen to `hashchange` event.

    ### Register the `/admin` route

    In `src/index.js`:
    1. Import: `import { htmlAdminDashboard } from './admin/admin-shell.js';`
    2. Add to routes array: `['GET', /^\/admin$/, handleAdminDashboard],`
    3. Add handler function (same pattern as `handleDashboard`):
    ```js
    function handleAdminDashboard() {
      return htmlAdminDashboard();
    }
    ```

    Note: The `/admin` route is NOT under `/v1/admin/` so it does NOT go through admin auth/rate-limit in the fetch handler. This is correct -- the HTML shell is served unauthenticated (just like `/ui`). Auth happens client-side before API calls.

    ### Accessibility requirements

    - Heading hierarchy: h1 = page/view title, h2 = section headings
    - Semantic table: `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`
    - Sortable columns: `<button>` inside `<th>`, `aria-sort="ascending"` / `aria-sort="descending"`
    - `aria-live="polite"` region (visually hidden) for announcing sort changes and refresh completion
    - Focus management: on view navigation, focus the h1 via `tabIndex=-1` + `.focus()`
    - Error alerts: `role="alert"` on error messages
    - Login form: proper `<label>` for the password input

    ### Formatting helpers

    Implement these as plain functions in the tenants module:
    - `formatBytes(bytes)` -- human-readable bytes (KB, MB, GB)
    - `formatDate(isoString)` -- "Mar 15, 2026" format
    - `formatNumber(n)` -- locale-formatted number with commas/dots

    ### What NOT to do

    - Do NOT use any framework (React, Vue, etc.) or build tool
    - Do NOT use `innerHTML` with variable data -- always `textContent` or `createElement`
    - Do NOT add auto-refresh or polling
    - Do NOT add dark mode
    - Do NOT load external resources (fonts, scripts, stylesheets)
    - Do NOT add mobile-specific responsive design (just ensure `overflow-x: auto` on tables so nothing breaks)
    - Do NOT add tenant management features (create, delete, edit) -- this dashboard is read-only visibility

    ### Files to create

    - `src/admin/admin-shell.js`
    - `src/admin/admin-auth.js`
    - `src/admin/admin-css.js`
    - `src/admin/admin-tenants.js`
    - `src/admin/admin-detail.js`

    ### Files to modify

    - `src/index.js` -- add import, route, handler function

    ### Success criteria

    - `GET /admin` returns a valid HTML document with inline CSS + JS
    - Admin key prompt appears on first visit
    - After entering valid key, tenant list renders with stat cards
    - Tenant drill-down shows usage history, keys, config
    - All data from live API calls (no cached snapshots)
    - No external resource loads
    - Page loads in under 2 seconds (inline-everything architecture makes this trivial)
    - Tables are accessible with proper ARIA attributes
    - `textContent` used for all data rendering (no XSS vectors)

- **Deliverables**: `src/admin/` directory with 5 JS modules; route registration in `src/index.js`
- **Success criteria**: Dashboard renders from `/admin`, admin auth gate works, tenant list and detail views functional, accessible markup, no external resource loads

---

### Task 4: Write tests for admin dashboard

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2, Task 3
- **Approval gate**: no
- **Prompt**: |

    ## Task: Write tests for the admin dashboard DAL, API, and UI

    You are writing tests for the new admin dashboard functionality. Follow the exact conventions of the existing test suite -- `@cloudflare/vitest-pool-workers` with real D1, `SELF.fetch()` for HTTP tests, `cleanDb()` in `beforeEach`.

    ### Context: Testing conventions in this project

    - **No mocks for D1**: Tests use the real D1 binding (`env.DB`) via vitest-pool-workers
    - **`cleanDb(db)` in `beforeEach`**: Every test file imports this from `test/fixtures.js`
    - **`nextIp()` pattern**: Each test file maintains its own IP counter to avoid rate limiter collisions. Existing ranges: admin-keys starts at 10, admin-usage at 100, account-usage at 200. **Use IP range starting at 150** for these tests.
    - **`SELF.fetch()`**: For HTTP endpoint tests, construct requests with `new Request()` and call `SELF.fetch(req)`. Set `CF-Connecting-IP` header for rate limiting.
    - **Response shape assertions**: Assert exact field lists with `Object.keys(body).sort()`.
    - **Seed data**: Each test seeds its own data using helpers from `fixtures.js`. No shared fixtures.
    - **Admin auth**: Use `TEST_ADMIN_KEY` from `fixtures.js` for the `Authorization: Bearer` header.

    ### Test file 1: `test/admin-dashboard.test.js`

    This is the main test file covering both DAL functions and API endpoints.

    **Rate limit IP counter**: Start at 150, increment per describe block.

    **New fixture helper needed**: Add `seedTenantWithTier(db, tenantId, overrides)` to `test/fixtures.js`. This helper seeds a tenant row with customizable columns:

    ```js
    export async function seedTenantWithTier(db, tenantId, {
      tier = 'free',
      billingStatus = 'active',
      stripeCustomerId = null,
      paymentMethodAddedAt = null,
      eidasQualified = 0,
      config = null,
      createdAt = new Date().toISOString(),
    } = {}) {
      await db.prepare(
        `INSERT OR REPLACE INTO tenants
           (id, tier, billing_status, stripe_customer_id, payment_method_added_at, eidas_qualified, config, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(tenantId, tier, billingStatus, stripeCustomerId, paymentMethodAddedAt, eidasQualified,
             config ? JSON.stringify(config) : null, createdAt).run();
    }
    ```

    **DAL function tests** (test with `env.DB` directly):

    `listTenantsWithUsage`:
    - Empty database returns empty array
    - Tenant with no usage row returns zeroed counters
    - Multiple tenants with mixed usage data
    - Tenants ordered by created_at DESC
    - keyCount reflects only active (non-revoked) keys

    `getUsageHistory`:
    - Returns periods in DESC order
    - Respects limit parameter
    - Empty history returns empty array
    - Tenant with no usage data returns empty array

    `getTenantDetail`:
    - Returns null for nonexistent tenant
    - Includes tenant metadata, usage history, and active keys
    - Keys array excludes revoked keys
    - Periods param caps history results

    `getOverviewStats`:
    - Empty database returns zeroed stats
    - Correctly counts tenants by tier
    - Correctly counts tenants by billing status
    - Aggregates captures across all tenants for current period
    - All-time captures includes all periods
    - Active API keys excludes revoked keys

    **API endpoint tests** (use `SELF.fetch()`):

    `GET /v1/admin/tenants`:
    - 401 without Authorization header
    - 401 with wrong key
    - 200 with valid admin key
    - Response has correct field structure (`data` array, `meta` object)
    - Each tenant object has expected fields (tenantId, tier, billingStatus, hasPaymentMethod, eidasQualified, createdAt, currentPeriod, quota, keyCount)
    - `quota` is computed correctly (free tier = 200 captures, paid = Infinity)
    - Invalid `period` param returns 400
    - Cache-Control header is `private, no-store`
    - Content-Type is `application/json`

    `GET /v1/admin/tenants/:id`:
    - 401 without auth
    - 404 for nonexistent tenant
    - 200 returns full tenant detail with usageHistory and keys arrays
    - `periods` param defaults to 6, caps at 24
    - Invalid `periods` param returns 400
    - Keys array shows name, scopes, createdAt, createdBy (no raw key)
    - Cache-Control: `private, no-store`

    `GET /v1/admin/overview`:
    - 401 without auth
    - 200 returns aggregate stats with expected fields
    - `tenantsByTier` and `tenantsByBillingStatus` reflect seeded data
    - Cache-Control: `private, no-store`

    **Security tests**:
    - Tenant API key (TEST_TENANT_KEY) rejected on admin endpoints
    - No CORS headers (`Access-Control-Allow-Origin`) on admin responses

    ### Test file 2: `test/ui-admin.test.js`

    Lightweight UI tests following the pattern from `ui-dashboard.test.js`:

    - `GET /admin` returns 200 with `text/html` content type
    - Response contains `<div id="admin-app">`
    - Response contains `Cache-Control: no-store`
    - CSP header includes `frame-ancestors 'none'`
    - X-Frame-Options: DENY is present
    - No external script/stylesheet loads (`<script src=`, `<link rel="stylesheet" href=`)
    - HTML does not contain `innerHTML` assignments with template literals (search the response body string)

    ### Fixture modification

    Add `seedTenantWithTier` to `test/fixtures.js` and export it.

    ### What NOT to do

    - Do NOT create browser/E2E tests (no Playwright)
    - Do NOT run tests casually -- only run when code changes need verification
    - Do NOT create a separate test worker instance
    - Do NOT use mocks for D1 queries

    ### Files to create

    - `test/admin-dashboard.test.js`
    - `test/ui-admin.test.js`

    ### Files to modify

    - `test/fixtures.js` -- add `seedTenantWithTier` helper

    ### Success criteria

    - All DAL function tests cover empty, single, and multi-tenant scenarios
    - All API endpoint tests verify auth, response shape, headers, and error cases
    - UI tests verify HTML structure and security headers
    - IP counter range (150+) does not overlap with existing test files
    - Tests pass with `npm test`

- **Deliverables**: `test/admin-dashboard.test.js`, `test/ui-admin.test.js`, `seedTenantWithTier` in `test/fixtures.js`
- **Success criteria**: All tests pass, cover auth/shape/headers/edge cases, no IP counter collisions

---

### Cross-Cutting Coverage

- **Testing**: Task 4 covers all three layers (DAL, API, UI) with real D1 integration tests. Phase 6 post-execution will run the full suite.
- **Security**: Addressed inline across Tasks 2 and 3. Admin auth via existing `verifyAdminKey`. sessionStorage for client-side key (tab-scoped, clears on close). No CORS on admin endpoints. CSP on HTML shell. `textContent` for data rendering (no innerHTML with variables). ORDER BY is hardcoded (no user-controlled sort columns in SQL). Rate limit raised to 30/60s with documented rationale. Phase 5 code review will audit.
- **Usability -- Strategy**: The three-level hierarchy (overview stats -> tenant table -> tenant detail) directly replaces manual D1 queries with a structured workflow. Manual refresh only -- no auto-polling complexity. Journey is: enter admin key -> see overview -> drill into tenant. Phase 3.5 review by ux-strategy-minion will evaluate.
- **Usability -- Design**: ux-design-minion's specifications are incorporated directly into Task 3's prompt: stat card grid, table design, accessible sortable headers, wider admin container, existing design system component reuse. Phase 3.5 will review.
- **Documentation**: Phase 8 post-execution will assess documentation needs. The evolution log (prompt.md, decisions.md, outcome.md) will be created as part of the orchestration process per CLAUDE.md requirements.
- **Observability**: All admin endpoints log requests via `ctx.waitUntil(log(...))`, consistent with existing admin handlers. No new observability infrastructure needed -- admin dashboard is a low-frequency operator tool, not a production service requiring dedicated metrics. Excluded from Phase 3.5 review.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - ux-design-minion: Plan includes Task 3 producing user-facing UI (admin dashboard views, tables, stat cards, detail views).
    Review focus: Visual hierarchy correctness, component reuse verification, accessibility of table/sort interaction patterns.
- **Not selected**:
  - accessibility-minion: ux-design-minion covers accessibility review for this scope (admin-only internal tool, single operator). The accessibility specs are already detailed in Task 3's prompt.
  - sitespeed-minion: Admin dashboard is an inline-everything single-page app with no external resources. Total payload under 20 KB. Performance budget is trivially met -- no Lighthouse audit adds value here.
  - observability-minion: No new runtime services. Admin endpoints follow existing logging patterns. No coordinated observability strategy needed.
  - user-docs-minion: Internal operator tool. No end-user documentation impact.

### Decisions

- **Rate limit value**
  Chosen: 30 req/60s (security-minion's recommendation)
  Over: 20 req/60s (api-design-minion's recommendation)
  Why: Admin key has approximately 256 bits of entropy making brute-force non-viable. Rate limit is for self-DoS prevention, not security. 30/60s gives comfortable headroom for normal dashboard operation (2 parallel requests per page load + drill-downs + refreshes).

- **Dashboard handlers in separate file**
  Chosen: New `src/admin-dashboard.js` file
  Over: Adding handlers to existing `src/admin.js` (api-design-minion noted it is already 495 lines)
  Why: Different concern (dashboard read-only views vs. key management mutations). Keeps modules focused and under reasonable line counts.

- **API endpoint structure**
  Chosen: Three focused endpoints (`/v1/admin/tenants`, `/v1/admin/tenants/:id`, `/v1/admin/overview`)
  Over: Single enriched endpoint returning everything; using existing per-tenant endpoints in a loop
  Why: Matches existing API pattern (purpose-specific endpoints). Enables parallel client-side fetches. Each maps to a clean DAL function or db.batch call.

- **Auth validation probe endpoint**
  Chosen: Validate admin key by calling `GET /v1/admin/overview`
  Over: Creating a dedicated `GET /v1/admin/ping` endpoint (security-minion suggested `GET /v1/admin/keys?limit=0` or a ping endpoint)
  Why: Overview endpoint is lightweight, already needs to be called, and confirms both auth and data access. A dedicated ping endpoint would be YAGNI.

### Risks and Mitigations

1. **Route collision between `GET /v1/admin/tenants/:id` and `GET /v1/admin/tenants/:id/config`** -- Mitigated by regex anchoring (`$` on the new route). Existing config route has `/config` suffix that prevents match. Route ordering documented in code comments.

2. **Unbounded tenant list at scale** -- At current scale (tens of tenants), returning all tenants is correct. If tenant count grows past approximately 500, add pagination as an additive change. Not building it now (YAGNI).

3. **Admin key in browser sessionStorage** -- Accepted residual risk for an operator-only tool. CSP prevents exfiltration. sessionStorage clears on tab close. If admin user base grows beyond single operator, switch to GitHub OAuth with admin role (infrastructure already exists).

4. **`admin.js` at 495 lines** -- Mitigated by creating new `admin-dashboard.js` rather than adding to existing file.

5. **Config JSON parsing per tenant in list endpoint** -- Negligible at current scale (tens of tenants, small config objects). Noted for future monitoring if tenant count grows.

### Execution Order

```
Batch 1:
  Task 1: DAL functions (data-minion)

GATE: Task 2 approval (API surface review)

Batch 2 (sequential after Task 1):
  Task 2: API endpoints + rate limit (api-design-minion)

Batch 3 (sequential after Task 2):
  Task 3: Frontend (frontend-minion)

Batch 4 (sequential after Tasks 1, 2, 3):
  Task 4: Tests (test-minion)

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (npm test)
  Phase 8: Documentation assessment
```

### External Skills

No external skills are used in the plan.

### Verification Steps

1. `npm test` passes with all new and existing tests
2. Deploy to staging and verify:
   - `GET /admin` renders login form
   - After entering admin key, tenant list loads with stat cards
   - Drill-down shows tenant detail with usage history and keys
   - `GET /v1/admin/tenants`, `GET /v1/admin/tenants/:id`, `GET /v1/admin/overview` return correct JSON
   - Rate limit allows 30 requests per minute
3. Verify security:
   - Admin endpoints reject tenant API keys
   - No CORS headers on admin responses
   - CSP headers on `/admin` HTML response
   - Admin key not visible in network responses
