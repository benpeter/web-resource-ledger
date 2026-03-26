# Lucy -- Consistency & Alignment Review

**Phase**: 0093 admin-dashboard
**Scope reference**: `docs/evolution/0093-admin-dashboard/prompt.md`
**Date**: 2026-03-26

---

## Original Requirements (verbatim from prompt.md)

| # | Requirement | Source |
|---|-------------|--------|
| R1 | Dashboard shows list of all tenants | prompt.md: "Tenant list view" |
| R2 | Per-tenant capture counts (current period and historical) | prompt.md: "per-tenant capture counts (current period and historical)" |
| R3 | Tier/plan info per tenant | prompt.md: "tier/plan info" |
| R4 | Usage vs. limits | prompt.md: "usage vs. limits" |
| R5 | Data is live from D1 (not cached snapshots) | prompt.md: success criteria |
| R6 | Protected by admin authentication | prompt.md: success criteria |
| R7 | Loads in under 2 seconds | prompt.md: success criteria |
| R8 | Aggregate usage overview | prompt.md: "aggregate usage overview" |

**Explicit out-of-scope**: Tenant self-service portal, billing management, real-time streaming metrics, profitability calculations.

---

## Traceability Matrix

| Requirement | Plan Element(s) | Status |
|-------------|-----------------|--------|
| R1 Tenant list | `GET /v1/admin/tenants` + `admin-tenants.js` list view | COVERED |
| R2 Per-tenant capture counts | `listTenantsWithUsage` returns `captureCount`; detail view shows `usageHistory` with historical periods | COVERED |
| R3 Tier/plan info | List view shows tier badge; detail shows tier, billingStatus, config | COVERED |
| R4 Usage vs. limits | Detail view renders usage bar with quota from `getEffectiveQuota` | COVERED |
| R5 Live D1 data | All three DAL functions query `env.DB` directly; `Cache-Control: private, no-store` on all responses | COVERED |
| R6 Admin auth | Routes under `/v1/admin/*` gated by `verifyAdminKey` + `ADMIN_RATE_LIMITER` in `index.js`; client-side login gate validates key against `/v1/admin/overview` before showing shell | COVERED |
| R7 <2s load time | `db.batch()` used for detail and overview (single round-trip); list is a single query with LEFT JOIN; no blocking waterfall in client JS (`Promise.all` for overview + tenants) | COVERED (design-level; runtime verification needed) |
| R8 Aggregate overview | `GET /v1/admin/overview` with `getOverviewStats`; stat cards rendered in tenant list view | COVERED |

**Orphaned plan elements** (not traceable to a stated requirement): None found.
**Unaddressed requirements**: None found.

---

## CLAUDE.md Compliance

### Vanilla JS (no frameworks) -- PASS

All frontend code uses `document.createElement`, `textContent`, `addEventListener`. No React, no Vue, no jQuery, no Tailwind. Template literal strings exported as constants, inlined into the HTML shell. This matches the existing `src/ui/` pattern exactly.

### YAGNI/KISS -- PASS

The implementation delivers exactly what was requested: three API endpoints, three DAL functions, and a client-side SPA with two views (list + detail). No speculative features. The column sort and refresh button are minimal UX necessities, not scope creep. The `periods` query param on the detail endpoint (default 6, max 24) is proportional -- it serves R2 (historical counts) without building a full analytics engine.

### Fail Loudly -- PASS (with one note)

**Server-side**: No catch blocks. Errors propagate naturally to the worker's top-level error handler.

**Client-side**: All `.catch(function() { ... })` blocks display user-visible error messages via alert elements with `role="alert"`. This matches the existing UI pattern in `src/ui/ui-schedules.js`, `ui-billing.js`, etc. The formatting helper catch blocks in `formatDate`/`formatNumber` degrade to showing the raw value -- a sensible handled degradation, not silent swallowing.

### Lean and Mean -- PASS

No new dependencies. Three new DAL functions added to `db.js` (the centralised data access layer). Frontend uses the existing design system CSS and reuses existing component classes (`badge`, `card`, `alert`, `btn`). The `admin/` directory mirrors the `ui/` directory structure.

### Code Follows Existing Patterns -- PASS

| Pattern | Existing (src/ui/) | New (src/admin/) | Match? |
|---------|-------------------|------------------|--------|
| Shell HTML generation | `ui-shell.js` exports `htmlDashboard()` | `admin-shell.js` exports `htmlAdminDashboard()` | Yes |
| CSS as JS constant | `ui-css.js` exports `UI_CSS` | `admin-css.js` exports `ADMIN_CSS` | Yes |
| View JS as string constants | `ui-login.js` exports `LOGIN_JS` | `admin-auth.js` exports `ADMIN_AUTH_JS` | Yes |
| CSP headers | Same CSP policy (unsafe-inline for script/style, no external sources) | Yes |
| Route registration | One-liner tuple in `routes` array | Yes |
| Admin API handler signature | `(request, env, ctx)` or `(request, env, ctx, match)` | Yes |
| DAL in db.js | All DB queries centralised in `db.js` with JSDoc | Yes |
| Admin cache header | `const ADMIN_CACHE = { 'Cache-Control': 'private, no-store' }` in admin.js | Same pattern in admin-dashboard.js | Yes |
| IP hashing for logs | `computeCip(env, clientIp)` before logging | Yes |
| textContent (no innerHTML) | Used throughout UI | Used throughout admin, with explicit XSS prevention comment on config rendering | Yes |

### Test Pattern -- PASS

Test file follows existing conventions: imports from `fixtures.js`, uses `cleanDb` in `beforeEach`, unique IPs per describe block to avoid rate limit interference, tests both DAL functions directly and HTTP endpoints via `SELF.fetch()`. Covers auth rejection, 404, success, parameter validation, and security (tenant key rejected, no CORS headers).

---

## Scope Creep Check

| Indicator | Assessment |
|-----------|------------|
| Task count inflation | 3 API endpoints, 3 DAL functions, 5 frontend files. Proportional to scope. |
| Technology expansion | None. Same stack. |
| Abstraction layers | No new abstractions. Reuses existing auth, logging, response helpers. |
| Adjacent features | No billing management, no tenant editing, no profitability calcs. Out-of-scope items stayed out. |
| Pre-optimization | `db.batch()` is a justified optimisation (single round-trip to D1), not premature. |
| Dependency introduction | None. |

---

## Findings

### F1 -- [CONVENTION] `keyHashPrefix` fallback in detail view may be dead code

**File**: `src/admin/admin-detail.js`, line 318
**What**: `nameTd.textContent = k.name || k.keyHashPrefix || '(unnamed)'`
**Issue**: The `getTenantDetail` DAL function returns `keyHash` (the full hash) but not `keyHashPrefix`. If `k.name` is null, the fallback chain goes to `k.keyHashPrefix` (which is `undefined`) and then to `'(unnamed)'`. The `keyHashPrefix` reference is harmless (falls through to the next `||`) but misleading -- it suggests the API returns a field it does not.
**Fix**: Either change to `k.name || '(unnamed)'` (since `keyHashPrefix` is never returned), or add a `keyHashPrefix: row.key_hash.slice(0, 8)` field to the DAL mapping in `getTenantDetail` so the display shows a truncated hash as a recognisable identifier.
**Severity**: ADVISE -- cosmetic, no functional bug, but inconsistent with the actual API response shape.

### F2 -- [CONVENTION] key_hash exposed in full on detail API response

**File**: `src/db.js`, line 2021-2027 (`getTenantDetail` keys mapping)
**What**: The keys array returned by `getTenantDetail` includes the full `keyHash` (64-character hex). The existing `admin.js` endpoint (`handleAdminListKeys`) also returns the full `keyHash`, so this is consistent with existing behaviour. However, the admin-dashboard.js detail handler at line 163 passes this full `keys` array to the JSON response unchanged.
**Issue**: No actual violation -- the existing admin key list endpoint already exposes full hashes. Noting for awareness: the detail API exposes the same data. The admin.js security invariant comment says "Raw key is NEVER logged; only returned in the 201 response body" -- this is about the raw API key (the bearer token), not the hash. The hash is safe to expose.
**Severity**: No action needed. Documenting for completeness.

---

## VERDICT: APPROVE

The implementation is a clean, proportional delivery of the stated requirements. Every requirement traces to plan elements. No scope creep detected. Code follows established patterns faithfully -- same directory structure as `src/ui/`, same HTML shell approach, same DAL centralisation in `db.js`, same auth and rate limiting infrastructure. Tests are comprehensive. The one finding (F1) is a cosmetic inconsistency in a dead-code fallback path -- worth fixing but not blocking.
