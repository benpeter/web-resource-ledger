## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Admin Authentication in the Browser: Prompt + sessionStorage

**Recommendation: Prompt for the ADMIN_KEY and store it in sessionStorage.** This is the correct approach for this context. Justification:

- The admin dashboard is a same-origin UI served from the same Worker (`/ui/admin` or similar, alongside the existing `/ui` tenant dashboard). There is no cross-origin trust boundary to worry about.
- `sessionStorage` is scoped to the tab and clears when the tab closes. This limits the exposure window compared to `localStorage` (which persists indefinitely and survives browser restarts).
- The key is sent as a `Bearer` token in the `Authorization` header on every API call, exactly matching the existing `verifyAdminKey` flow. No new auth mechanism needed.
- **Do NOT use cookies.** The existing admin auth is Bearer-token based. Adding cookies introduces CSRF attack surface and complicates the auth model for zero benefit.

**Implementation details:**

- On page load, check `sessionStorage.getItem('wrl_admin_key')`. If absent, render a login form with a single password input.
- On form submit, make a lightweight probe request (e.g., `GET /v1/admin/keys?limit=0` or a new `GET /v1/admin/ping`) with the entered key as `Authorization: Bearer <key>`. If 200, store in `sessionStorage`. If 401, show error. Do NOT store the key before validation.
- The probe request counts against the ADMIN_RATE_LIMITER (5/60s per IP). This is acceptable because login attempts are infrequent. But see rate limit recommendation below.
- Provide a visible "Logout" button that calls `sessionStorage.removeItem('wrl_admin_key')` and reloads.

**Security constraints on the login form:**

- **No autocomplete**: set `autocomplete="off"` on the input field. The admin key is an infrastructure secret, not a user password -- browser password managers should not cache it.
- **Paste-friendly**: Do not disable paste. Operators will paste from 1Password.
- **No key echo**: Use `<input type="password">` so the key is masked.
- **CSP**: The existing CSP (`default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'`) is already correct for a same-origin SPA. No changes needed. `connect-src 'self'` restricts fetch calls to the same origin, preventing exfiltration of the key via script injection.

#### 2. CSRF: Not a Concern with Bearer-Token Auth (No Cookies)

**Correct -- CSRF is not a concern here.** CSRF attacks exploit the browser's automatic inclusion of cookies on cross-origin requests. Since the admin dashboard sends the key via the `Authorization` header (which browsers never attach automatically), a malicious third-party page cannot forge admin requests.

The existing tenant dashboard (`/ui`) uses session cookies (`__Host-wrl_session`) and therefore correctly requires the `X-WRL-CSRF` header for mutations. The admin dashboard does NOT use cookies and MUST NOT use the `X-WRL-CSRF` mechanism -- it would be cargo-culting security for a threat that does not exist in Bearer-token auth.

**One caveat**: If a future change adds cookie-based admin sessions, CSRF protection must be added simultaneously. Document this invariant in the code.

#### 3. SQL Injection: Mitigated by Prepared Statements, but Verify New Queries

**The existing D1 access pattern is sound.** All queries in `db.js` use `db.prepare(...).bind(...)` -- parameterized queries that prevent SQL injection regardless of input content. The DAL comment at the top of `db.js` ("All DB access is centralised here. No raw env.DB.prepare() calls should exist outside this module") is the correct architectural constraint.

**For the new dashboard endpoints, the risk is bypassing this pattern.** Specific guidance:

- **All new queries MUST go through `db.js`.** No inline `env.DB.prepare()` calls in dashboard handler code. This is already the project convention -- enforce it in review.
- **Query parameters for dashboard views** (tenant filter, date ranges, sort order, pagination) must be validated before reaching `db.js`. The existing patterns are good models:
  - `TENANT_ID_RE` for tenant ID validation (`/^[a-z0-9_-]{1,64}$/`)
  - Period validation (`/^\d{4}-\d{2}$/`)
  - Integer validation for `limit`/`offset`
- **ORDER BY and column names cannot be parameterized** in prepared statements. If the dashboard allows sorting by column, use an allowlist (e.g., `const SORT_COLUMNS = new Set(['captureCount', 'storageBytes', 'createdAt'])`) and reject anything not in the set. Never interpolate user input into `ORDER BY` clauses.
- **Aggregation queries** (e.g., `SELECT tenant_id, SUM(captures) ... GROUP BY tenant_id`) are fine with prepared statements as long as the `WHERE` clause parameters are bound.

#### 4. Rate Limit: Raise to 30/60s for Admin Dashboard

**The current 5 req/60s limit is too restrictive for a dashboard.** A single page load showing tenant overview + per-tenant usage + key list could easily make 3-5 parallel requests. Navigating between views would exhaust the limit within 60 seconds.

**Recommendation: Raise `ADMIN_RATE_LIMITER` to 30 req/60s.** Rationale:

- The admin key is an infrastructure secret known only to the operator. Brute-force is not the primary threat model -- the key has ~256 bits of entropy (`wrl_live_` prefix + 32 random bytes base64url-encoded).
- The `AUTH_RATE_LIMITER` (10/60s) protects against brute-force on the OAuth login flow, which faces a genuinely adversarial internet. The admin endpoints face a different threat profile (known IPs, infrastructure secret).
- 30/60s provides comfortable headroom for dashboard navigation (5-6 views with 4-5 requests each) without enabling abuse.
- The rate limit is per-IP, so a compromised key used from a different IP would get its own 30/60s budget. This is acceptable because a compromised admin key is a critical incident regardless of rate limiting.

**Changes required:**

1. `wrangler.toml`: Change `ADMIN_RATE_LIMITER` `simple.limit` from `5` to `30` (both production and staging).
2. `src/rate-limits.js`: Change `admin` limit from `5` to `30`.
3. Document the change rationale in the evolution log.

**Alternative considered and rejected**: A separate `ADMIN_DASHBOARD_RATE_LIMITER` binding with a higher limit. This adds operational complexity (new binding to manage) for no meaningful security benefit. A single limiter at 30/60s is sufficient.

#### 5. Additional Security Requirements for the Admin Dashboard

**A. Information Disclosure via Admin Endpoints**

The new dashboard endpoints will expose tenant data (usage, configuration, capture counts). This is authorized for admin users but the responses must be hardened:

- **Cache-Control: `private, no-store`** on all admin responses. The existing `ADMIN_CACHE` constant in `admin.js` already does this -- reuse it for all new endpoints.
- **No CORS headers** on admin endpoints. Admin endpoints are same-origin only. Never add `Access-Control-Allow-Origin` to admin responses. Verify no wildcard CORS leaks into the admin path.
- **X-Frame-Options: DENY** is already set globally in `index.js` line 701. Verify it applies to the admin dashboard HTML page as well.

**B. Admin Dashboard HTML Page Security**

- Serve the admin dashboard from a separate route (e.g., `GET /admin`) with its own CSP, distinct from the tenant dashboard at `/ui`.
- **CSP** should match the existing pattern: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
- The admin page must NOT be cacheable: `Cache-Control: no-store`.

**C. Logging**

All admin dashboard API calls must be logged at severity 3 (info) with:
- `event: 'admin.<action>'`
- `authMethod: 'admin_key'`
- `cip` (hashed client IP)
- `responseStatus`

The existing admin handlers already do this consistently. New dashboard-specific endpoints must follow the same pattern. Failed requests (auth failures, validation errors) must also be logged at severity 4-5. This is critical for security monitoring -- the admin key is a high-value target.

**D. No Tenant Data in URL Paths**

If the dashboard uses client-side routing (e.g., `/admin#tenant/acme`), that is fine because fragment identifiers are not sent to the server. If it uses server-side routes (e.g., `/admin/tenants/acme`), ensure tenant IDs in URL paths are validated with `TENANT_ID_RE` before use.

**E. Output Encoding**

The dashboard renders tenant data (tenant IDs, key names, usage numbers) in HTML. Even though tenant IDs are constrained by `TENANT_ID_RE` and key names by `NAME_RE`, always use `textContent` (not `innerHTML`) when rendering data from API responses. This prevents stored XSS if a validation regex is ever relaxed. The existing tenant dashboard in `/ui` already follows this pattern.

### Proposed Tasks

1. **[Auth] Implement admin key prompt + sessionStorage flow** -- Password input form, probe-on-submit, store on success, logout button. Use existing `verifyAdminKey` path. No new auth mechanism.

2. **[Rate Limit] Raise ADMIN_RATE_LIMITER from 5/60s to 30/60s** -- Update `wrangler.toml` (production + staging) and `src/rate-limits.js`. One-line change each.

3. **[API] Add new admin dashboard endpoints behind verifyAdminKey** -- Tenant list, per-tenant detail, tier consumption. All queries through `db.js`. All responses with `Cache-Control: private, no-store`. All requests logged.

4. **[API] Add ORDER BY allowlist validation in db.js** -- If dashboard supports sortable columns, the DAL must enforce a column allowlist. Never interpolate sort parameters.

5. **[UI] Serve admin dashboard HTML from separate route with correct CSP** -- `GET /admin` returns HTML shell with strict CSP. Same pattern as existing `/ui` but separate page.

6. **[Security Review] Verify no CORS headers leak onto admin endpoints** -- Explicit check during implementation that admin paths never get `Access-Control-Allow-Origin` in the response.

### Risks and Concerns

**RISK 1 (Medium): Admin key in browser memory**
- The ADMIN_KEY will live in `sessionStorage` and in the JavaScript heap for the lifetime of the tab. A browser extension, XSS in another same-origin page, or browser devtools access could extract it.
- **Mitigation**: CSP with `connect-src 'self'` prevents exfiltration via network. `frame-ancestors 'none'` prevents clickjacking. The key is masked in the input. sessionStorage clears on tab close. This is an accepted residual risk for an operator-only tool.
- **Future consideration**: If the admin user base grows beyond a single operator, switch to GitHub OAuth with an admin role (the OAuth infrastructure already exists for tenant auth). This is out of scope for MVP.

**RISK 2 (Low): Rate limit increase enables faster brute-force**
- Raising from 5/60s to 30/60s means an attacker can try 30 keys per minute per IP instead of 5.
- **Mitigation**: At 256 bits of entropy, brute-force is not a viable attack regardless of rate. The rate limit exists primarily to prevent accidental self-DoS, not brute-force. 30/60s remains conservative.

**RISK 3 (Low): Dashboard data aggregation reveals business intelligence**
- Aggregated usage views (total captures across all tenants, tier distribution) are more valuable to an attacker than individual endpoint responses. A compromised admin key accessing the dashboard gives a fuller picture than calling individual endpoints.
- **Mitigation**: This is inherent to any dashboard. The admin key is already the keys to the kingdom. Logging all admin requests to Coralogix (already in place) enables detection of unauthorized access patterns.

**RISK 4 (Informational): No key rotation mechanism**
- If the admin key is compromised, rotation requires `wrangler secret put ADMIN_KEY` and then updating the key in 1Password. There is no in-band rotation via the API.
- **Mitigation**: This is the current operational model and is acceptable for a single-operator system. Document the rotation procedure in the evolution log.

### Additional Agents Needed

- **iac-minion**: To update `wrangler.toml` rate limiter values (production + staging) and verify the binding changes deploy correctly.
- **test-minion**: To write tests for (a) admin auth flow rejects invalid keys and returns 401, (b) rate limit behavior at new threshold, (c) new dashboard endpoints enforce admin auth, (d) no CORS headers on admin responses.
