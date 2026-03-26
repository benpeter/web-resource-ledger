# Domain Plan Contribution: api-spec-minion

## Recommendations

### 1. Use a single flat route table, not two separate views

The reference document should have **one complete route table** covering all routes from `src/index.js` lines 64-124, plus the two special-case routes handled before the regex router (`/mcp` at line 494, CORS preflight for `/v1/captures` at line 511). Each route gets a row with these columns:

| Column | Why it matters for developers/LLMs |
|--------|-------------------------------------|
| Method | Required for any API call |
| Path | The URL pattern (use OpenAPI-style `{param}` syntax, not regex) |
| Auth type | One of: `api-key`, `admin-key`, `session`, `signature` (Stripe), `none` |
| Rate limit group | Maps to `RATE_LIMITS` object in `rate-limits.js` (capture/verify/admin/auth/account/none) |
| Surface | `public-api`, `admin`, `account`, `auth`, `billing`, `notification`, `ui`, `infra` |
| OpenAPI | `yes` or blank -- whether the route is documented in `openapi.yaml` |

This avoids duplication with `openapi.yaml` because the table only carries **routing metadata** (auth, rate limits, surface classification) -- not request/response schemas. For schema details, the document should point to `openapi.yaml` with a one-liner like: "For request/response schemas, see `openapi.yaml`."

### 2. Do NOT duplicate OpenAPI content into the reference doc

The `openapi.yaml` is 5,197 lines and covers 23 path items with full request/response schemas. Copying any of that into the reference doc creates drift. The reference doc should:

- State that `openapi.yaml` is the source of truth for public API schemas
- List which routes are NOT in `openapi.yaml` (these are the ones that need extra attention)
- For routes missing from the spec, provide a one-line description of purpose and auth mechanism

### 3. Extract route data programmatically from `src/index.js`

The routes array (lines 64-124) is machine-readable: each entry is `[method, regex, handler]`. A simple script can extract this and cross-reference against `openapi.yaml` paths to identify gaps. This should be done once during document creation -- not as ongoing automation (the reference doc is a snapshot, and the routes array changes infrequently).

### 4. Document the auth model in a dedicated section

The fetch handler (lines 468-600+) implements a layered auth model that is NOT fully captured by the routes array:

- **Admin routes** (`/v1/admin/*`): `verifyAdminKey()` checked in fetch handler before route dispatch
- **Account/billing routes** (`/v1/account/*`, `/v1/billing/*`): `verifySession()` checked in fetch handler, with ToS enforcement and CSRF checks
- **Auth routes** (`/auth/*`): No auth required, but rate-limited via `AUTH_RATE_LIMITER`
- **Notification action routes** (`/v1/notifications/unsubscribe`, `/v1/notifications/verify-email`): No auth, rate-limited via `AUTH_RATE_LIMITER`
- **Capture/read routes** (`/v1/captures`, etc.): Dual auth via `verifyAuth()` -- session cookie OR API key
- **Verify routes** (`/v1/verify/*`, `/.well-known/*`): No auth required
- **Stripe webhook** (`/v1/stripe/webhook`): Signature verification internal to handler
- **MCP** (`/mcp`): Handled before router, own CORS

This auth routing logic is critical context for any developer touching these routes and is not documented anywhere else.

### 5. Document the verify subdomain restriction

The fetch handler (lines 478-490) restricts `verify.webresourceledger.com` and `verify-staging.webresourceledger.com` to only verification-related paths. This is an important routing constraint that belongs in the reference doc.

### 6. Rate limit details: reference the constants, don't duplicate them

The reference doc should show the rate limit groups and their default values from `rate-limits.js` (capture: 10/60s, verify: 60/60s, admin: 5/60s, auth: 20/60s, account: 30/60s) plus the binding ceiling (100) and IP guard limits. But note these are per-tenant-overridable via `tenantConfig.rateLimit`.

## Proposed Tasks

### Task 1: Extract complete route table
- Parse `src/index.js` routes array (lines 64-124) plus special-case routes (`/mcp`, CORS preflight)
- Convert regex patterns to human-readable paths (e.g., `cap_[a-f0-9]{32}` -> `{captureId}`)
- Cross-reference each route against `openapi.yaml` paths to mark coverage
- Determine auth type for each route by reading the fetch handler auth logic (lines 526-600+)
- Determine rate limit group using `getRateLimitGroup()` function (lines 136-146)

### Task 2: Write the route table section
- Flat markdown table with columns: Method, Path, Auth, Rate Limit Group, Surface, In OpenAPI
- Group rows by surface area (public API first, then admin, account, auth, billing, notification, UI, infra)
- Add a note pointing to `openapi.yaml` for request/response schemas

### Task 3: Write the auth model section
- Document the four auth mechanisms: API key, admin key, session cookie, dual auth
- Document the fetch handler's auth dispatch logic (which prefixes trigger which auth)
- Document ToS enforcement gate on account routes
- Document CSRF checking on session-authenticated mutations
- Document the verify subdomain path restriction

### Task 4: Write the rate limiting section
- Table of rate limit groups with default limits from `RATE_LIMITS`
- Note the binding ceiling (100) and IP guard limits
- Note per-tenant override mechanism via `tenantConfig.rateLimit`
- Map which Cloudflare rate limiter bindings correspond to which groups

## Risks and Concerns

1. **Routes missing from OpenAPI spec**: The following routes in `src/index.js` are NOT in `openapi.yaml` and have no public schema documentation:
   - `/ui` (dashboard)
   - `/favicon.ico`
   - `/v1/admin/tenants/{tenantId}/config` (GET, PUT)
   - `/v1/admin/cache/purge` -- wait, this IS in the spec
   - `/v1/account/first-key` (GET), `/v1/account/first-key/ack` (POST)
   - `/v1/account/keys` (GET, POST), `/v1/account/keys/{keyHash}` (DELETE)
   - `/v1/account/tos` (POST)
   - `/v1/account/settings` (GET, PATCH)
   - `/v1/account/notifications/resend-verification` (POST)
   - `/v1/notifications/verify-email` (GET, POST)
   - `/v1/billing/checkout` (POST), `/v1/billing/portal` (POST)
   - `/v1/stripe/webhook` (POST)
   - `/auth/login`, `/auth/callback`, `/auth/logout`, `/auth/session`
   - `/mcp`
   - `/v1/captures/{captureId}/diff/{targetId}` -- wait, this IS in the spec

   These gaps are fine for the reference doc (we document them in the route table) but represent a real spec gap for anyone trying to use the account/billing/auth flows programmatically.

2. **Drift risk**: The route table in the reference doc will drift from `src/index.js` over time. Mitigation: add a comment in the reference doc noting the source file and line range, so developers know where to check for updates. Do NOT try to automate this -- the doc is a snapshot.

3. **Auth logic complexity**: The auth model is implemented across the fetch handler, `verifyAuth()`, `verifySession()`, and individual handlers. The reference doc should document the fetch-handler-level gates but note that some handlers do additional auth checks internally (e.g., Stripe webhook signature verification).

## Additional Agents Needed

None -- the route table extraction and auth model documentation are straightforward reading tasks that don't require additional specialist knowledge. The api-spec-minion's contribution here is the structural recommendation (flat table, no schema duplication, auth model as separate section), not the actual writing of the reference doc.
