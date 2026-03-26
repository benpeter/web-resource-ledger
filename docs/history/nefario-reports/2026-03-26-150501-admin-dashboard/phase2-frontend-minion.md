## Domain Plan Contribution: frontend-minion

### Recommendations

**Option B: Separate `/admin` endpoint serving its own HTML shell.**

This is the clear winner. Here is the rationale:

1. **Auth model incompatibility rules out Options A and C.** The existing `/ui` SPA uses dual auth (session cookies via GitHub OAuth OR `sessionStorage` API key). Admin auth uses `verifyAdminKey` -- a Bearer token against an infrastructure secret, with no session, no cookies, no GitHub identity. Mixing these into the same boot flow (`bootApp()` in `ui-auth.js`) would require forking the auth logic into a conditional mess. A separate shell keeps both auth flows clean and unmixed.

2. **Security isolation.** The admin dashboard exposes cross-tenant data (all tenants, all usage, all keys). The tenant UI exposes single-tenant data. Serving them from the same HTML payload means a XSS in the tenant UI could theoretically reach admin DOM. A separate `/admin` endpoint with its own CSP and its own auth gate eliminates that surface entirely.

3. **Bundle size and load time.** The existing `/ui` shell already concatenates 14 JS modules inline. Adding admin views (tenant list, per-tenant detail, usage charts) would push the bundle larger for all users, not just admins. A separate shell loads only admin code for admin users -- trivially meeting the <2s target since the admin code is small and there are no heavy dependencies.

4. **Operational separation.** The admin dashboard is for operators, not end users. Different deployment cadence, different error handling expectations. If admin code breaks, tenant UI keeps working and vice versa.

5. **Full design system reuse.** The design system CSS (`design-system.css`) is already a standalone export (`DESIGN_SYSTEM_CSS`). The admin shell imports it identically to the tenant shell. Tables, badges, cards, alerts, data grids -- everything the admin dashboard needs is already in the design system. Zero duplication.

**Architecture:**

```
src/admin/
  admin-shell.js     -- htmlAdminDashboard(), analogous to ui-shell.js
  admin-css.js       -- admin-specific CSS (layout, admin-only components)
  admin-auth.js      -- admin Bearer token auth gate (prompt, store in sessionStorage, validate against /v1/admin/usage?tenant=default)
  admin-tenants.js   -- tenant list view (table with id, tier, eidas flag, current period captures)
  admin-detail.js    -- per-tenant detail view (usage history, keys, config)
```

**Route registration in `index.js`:**

```js
['GET', /^\/admin$/, handleAdminDashboard],
```

The handler calls `htmlAdminDashboard()` -- same pattern as `handleDashboard()` calling `htmlDashboard()`. Admin auth happens client-side (the admin key is stored in `sessionStorage` and sent as Bearer on every API call). The `/admin` route itself is unauthenticated (it serves a static HTML shell), just like `/ui` is. This matches the existing architecture: the shell is public, the API calls are authenticated.

**Hash routing within admin:**

```
#/tenants        -- tenant list (default)
#/tenants/:id    -- per-tenant detail (usage, keys, config)
```

Two routes. That is all. YAGNI -- start with exactly what replaces the manual D1 queries.

**Admin auth flow:**

1. Admin loads `/admin` -- shell renders auth gate (input for admin key)
2. Admin enters key, client stores it in `sessionStorage` under `wrl_admin_key`
3. Client validates by calling `GET /v1/admin/usage?tenant=default&period=2026-03` with `Authorization: Bearer <key>`
4. On 200: render admin shell with nav. On 401: show error, clear key.
5. All subsequent `apiFetch` calls attach the Bearer token from `sessionStorage`.
6. No cookies, no CSRF, no session endpoint -- pure Bearer token auth.

**New backend endpoints needed:**

The admin dashboard needs one endpoint that does not exist yet:

- `GET /v1/admin/tenants` -- list all tenants with their tier, eidas_qualified flag, created_at. This is the backbone of the tenant list view. Without it, the dashboard would need to hardcode tenant IDs or make the operator type them.

The existing endpoints cover the rest:
- `GET /v1/admin/usage?tenant=X&period=Y` -- per-tenant usage (already exists)
- `GET /v1/admin/keys?tenant=X` -- per-tenant API keys (already exists via `listApiKeyRecords`)
- `GET /v1/admin/tenants/:id/config` -- per-tenant config (already exists)

**Data fetching pattern:**

Live D1 queries on every view render. No caching layer, no polling. The admin refreshes the page when they want fresh data. For the tenant list, fetch `/v1/admin/tenants` once on view mount. For per-tenant detail, fetch usage + keys + config in parallel on view mount. This is simple, matches the "no cached snapshots" requirement, and avoids stale data.

Optionally: a manual "Refresh" button on each view that re-fetches. No auto-refresh interval -- the admin clicks when they want.

### Proposed Tasks

1. **[backend] Add `GET /v1/admin/tenants` endpoint** -- returns `{ tenants: [{ id, tier, eidasQualified, createdAt }] }`. Uses admin auth. Query: `SELECT id, tier, eidas_qualified, created_at FROM tenants ORDER BY created_at ASC`. Add `listTenants()` to `db.js`. Register route in `index.js`.

2. **[backend] Add usage summary to tenant list response** -- optionally join current-period usage counters into the tenant list so the overview table can show capture counts without N+1 requests. Alternative: the frontend can batch-fetch usage per tenant, but a single query is cleaner. Proposed: `GET /v1/admin/tenants?include=usage` adds `currentPeriod: { captureCount, storageBytes, apiCallCount, eidasCaptureCount, period }` to each tenant.

3. **[frontend] Create `src/admin/admin-shell.js`** -- HTML shell function `htmlAdminDashboard()` that mirrors `ui-shell.js` structure: inline design system CSS + admin CSS + admin JS modules. Returns a `Response` with appropriate CSP headers. Title: "WRL Admin".

4. **[frontend] Create `src/admin/admin-auth.js`** -- auth gate for admin key. Input field, submit handler, `sessionStorage` persistence, validation against a real admin endpoint. `adminApiFetch()` wrapper that always attaches Bearer token.

5. **[frontend] Create `src/admin/admin-css.js`** -- admin-specific styles. Reuse design system tokens exclusively. Admin layout (sidebar or top nav with "Tenants" link), table enhancements for the tenant overview.

6. **[frontend] Create `src/admin/admin-tenants.js`** -- tenant list view. Table with columns: Tenant ID, Tier (badge), eIDAS (badge), Captures (current period), Storage, Created. Each row links to `#/tenants/:id`. Empty state if no tenants.

7. **[frontend] Create `src/admin/admin-detail.js`** -- per-tenant detail view. Sections: overview (tier, eidas, created), current period usage (data grid), historical usage (last 6 months table), API keys (table with name, scopes, created, revoked status), tenant config (JSON display). Back link to `#/tenants`.

8. **[frontend] Register `/admin` route in `index.js`** -- add `handleAdminDashboard` handler, import `htmlAdminDashboard`. One line in the routes array, one import, one handler function.

9. **[frontend] Accessibility pass** -- ensure admin views meet WCAG 2.2 AA: table headers use `<th scope="col">`, data tables have captions, badges have sufficient color contrast, focus management on view transitions, skip-to-content link, `aria-current="page"` on active nav.

### Risks and Concerns

1. **Missing `GET /v1/admin/tenants` endpoint.** This is the critical dependency. The frontend cannot render a tenant list without it. The existing admin API operates on individual tenants (usage, config, keys) but has no list-all operation. This must ship before or alongside the frontend.

2. **N+1 usage queries.** If the tenant list endpoint does not include usage data, the frontend must call `GET /v1/admin/usage?tenant=X` for each tenant to populate the overview table. With 10 tenants, that is 11 requests on page load. With 100 tenants, it is untenable. The backend should provide a batch or joined response. Recommendation: `GET /v1/admin/tenants?include=usage` joins `usage_counters` for the current period.

3. **Historical usage requires multiple requests.** To show a 6-month usage history for a tenant, the frontend needs to call the usage endpoint 6 times (once per period) or the backend needs a new endpoint that returns multiple periods. Recommendation: add `GET /v1/admin/usage?tenant=X&periods=6` (or similar) that returns an array of period rows. Alternatively, add a range parameter: `&from=2025-10&to=2026-03`. This is a backend concern but directly impacts frontend feasibility.

4. **Admin key exposure in browser.** The admin key sits in `sessionStorage`. This is the same pattern the tenant UI uses for API keys. The risk profile is identical and already accepted. However, note that `sessionStorage` is cleared on tab close, so the admin must re-enter the key each session. This is acceptable security behavior for an infrastructure secret.

5. **No tier limits data.** The dashboard should show "usage vs. limits" per the success criteria, but the tier system only has `free` and `pro` as values in the database. The actual limits (captures per period, storage cap) are defined in application code, not in D1. The frontend needs to either: (a) hardcode tier limits in the admin JS, which couples frontend to backend policy, or (b) the backend exposes tier limits via the tenant config endpoint. Recommendation: the backend should return `limits` alongside `config` in the tenant detail, so the frontend can display a usage bar/percentage without hardcoding thresholds.

6. **<2s load time is trivially met.** The admin shell is a single inlined HTML document with no external resources, no images, no fonts. The design system CSS is ~5 KB, admin CSS will be ~2 KB, admin JS will be ~8-10 KB. Total payload under 20 KB. Even with D1 query latency (~50-100ms per query), the complete render should happen in well under 1 second. The real latency risk is the N+1 usage query problem in risk #2 -- solve that and the budget is easily met.

7. **CSP strictness.** The admin shell uses `'unsafe-inline'` for scripts and styles (same as the tenant UI). This is the tradeoff of the inline-everything architecture. It is an accepted pattern in this project. The admin shell should copy the exact CSP from the tenant shell.

### Additional Agents Needed

- **api-design-minion**: Design the `GET /v1/admin/tenants` endpoint (response shape, pagination if needed, `?include=usage` join behavior). Also design the multi-period usage query for historical data. These are new API surfaces that need proper design before implementation.

- **security-minion**: Review the admin key-in-sessionStorage pattern for the admin dashboard specifically. The admin key has broader privileges than a tenant API key (cross-tenant access). Confirm that the existing threat model covers this, or identify if additional controls are needed (e.g., shorter session lifetime, IP-binding, or a separate admin-session mechanism).
