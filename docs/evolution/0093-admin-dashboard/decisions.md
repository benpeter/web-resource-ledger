# Phase 0093: Admin Dashboard -- Decisions

## D1: Rate limit -- 30 req/60s (not 20)

**Context**: api-design-minion recommended 20/60s, security-minion recommended 30/60s.

**Decision**: 30/60s. The admin key has ~256 bits of entropy -- brute-force is
not the threat model. The rate limit prevents self-DoS (operator mistake or
runaway script). 30/60s gives the dashboard enough headroom for parallel
fetches (overview + tenants) plus manual refreshes during incident triage.

**Rejected**: 20/60s was too conservative for a single-operator dashboard that
loads 2 endpoints per page view.

## D2: Separate /admin shell (not embedded in /ui)

**Context**: Two options considered: (A) add admin views to the existing /ui
SPA, gated by a role check; (B) separate /admin endpoint with its own HTML
shell.

**Decision**: Option B -- separate shell. The admin dashboard has different auth
(ADMIN_KEY vs tenant API key), different layout (wider container, no sidebar),
and should not be discoverable by tenant users. The separation also mirrors
src/ui/ → src/admin/ directory structure cleanly.

**Rejected**: Option A would have required mixing two auth models in the same
SPA and adding role-aware UI branching.

## D3: sessionStorage for admin key (not cookie, not memory)

**Context**: Where to store the admin key client-side after login.

**Decision**: sessionStorage. Tab-scoped (dies when tab closes), no CSRF risk
(Bearer token, not cookie), survives hash navigation within the SPA. The
security-minion confirmed this is appropriate for the threat model (operator
on their own machine, not a shared kiosk).

**Trade-off**: If the operator opens two admin tabs, they share the same
sessionStorage in the same origin. Acceptable for single-operator use.

## D4: No standalone getUsageHistory DAL function

**Context**: margo advisory noted that a standalone getUsageHistory function
would be dead code -- usage history is only ever fetched as part of
getTenantDetail.

**Decision**: Embed the usage history query in getTenantDetail's db.batch() call.
One function, one round-trip.

**Rejected**: Standalone function for theoretical future reuse (YAGNI).

## D5: Auth validation via GET /v1/admin/overview (not dedicated ping)

**Context**: The frontend needs to validate the admin key before showing the
dashboard. Options: (A) dedicated auth-check endpoint, (B) use an existing
admin endpoint.

**Decision**: Use GET /v1/admin/overview. It returns useful data for the first
page load anyway, and a 401 response doubles as auth rejection. No new
endpoint needed.

**Rejected**: Dedicated /v1/admin/ping or /v1/admin/auth endpoint (YAGNI --
adds an endpoint with no data value).

## D6: Column sort order -- client-side only

**Context**: Should table sorting hit the server or sort in-browser?

**Decision**: Client-side sort. The tenant list is small (tens of tenants, not
thousands). Sorting in JS avoids additional API complexity (ORDER BY
parameter, SQL injection surface). The security-minion's column-name allowlist
recommendation becomes unnecessary.

## D7: totalStorageBytes → currentPeriodStorageBytes (code review fix)

**Context**: code-review-minion identified that `totalStorageBytes` in
getOverviewStats was period-scoped but named as if all-time.

**Decision**: Rename to `currentPeriodStorageBytes` across DAL, API, frontend,
and tests. The SQL uses `CASE WHEN period = ?` so it's definitively
current-period only.

## D8: keyHashPrefix → keyHash.slice(0, 8) (code review fix)

**Context**: admin-detail.js referenced `k.keyHashPrefix` as a fallback for
unnamed keys, but getTenantDetail returns `keyHash` (full hash), not
`keyHashPrefix`.

**Decision**: Replace with `k.keyHash.slice(0, 8) + '...'` to show a truncated
hash as a recognizable identifier. The full hash is already exposed by the
existing admin key list endpoint, so truncation is a display convenience,
not a security measure.
