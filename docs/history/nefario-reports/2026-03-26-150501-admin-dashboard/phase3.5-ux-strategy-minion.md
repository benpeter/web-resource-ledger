## UX Strategy Review: Admin Dashboard

**Verdict: APPROVE**

### Journey Coherence

The three-level hierarchy (overview stats -> tenant table -> tenant detail) is coherent. The user has one job: replace manual D1 queries with structured operator visibility. The planned flow serves that job directly.

The auth flow is appropriate. A single password field validated against a live endpoint (`/v1/admin/overview`) is the right pattern -- it confirms the key works rather than accepting it blindly, and the feedback path (200 = proceed, 401 = show error) is unambiguous.

One gap worth noting: the plan specifies that on empty hash or `#/`, the router redirects to `#/tenants`. This means the tenant list is the landing view after auth. The stat cards on that view include an overview fetch in parallel, so the operator gets aggregate numbers plus the tenant table in one load. That is a sound decision -- no redundant overview-only page.

### Cognitive Load

The plan is conservative in ways that reduce cognitive load:

- **Manual refresh only**: Correct. Auto-polling on an admin dashboard used by a single operator adds interruption cost and zero value. The refresh button is explicit and visible.
- **Read-only**: Removing any write affordances eliminates error recovery burden entirely. An operator who cannot delete a tenant cannot accidentally delete one.
- **Sorted by captures descending by default**: The most active tenants surface first, which is the highest-signal ordering for an operator checking usage health. This is a good satisficing default.
- **eIDAS count hidden when zero**: Progressive disclosure applied correctly. A field that is zero for most tenants should not occupy permanent visual space.

The four stat cards (Total Tenants, Active This Period, Total Captures, Total Storage) are appropriately few. This fits within working memory limits and avoids the dashboard anti-pattern of showing every available number.

### Simplification

The `config` section on the detail view (raw JSON in a `<pre>`) is a minor concern. Showing raw JSON passes cognitive parsing cost to the operator. However, since config structure is not defined in this scope and the operator is a developer who will understand JSON, this is acceptable. Resist the temptation to structure it further until there is evidence the operator needs to act on specific config fields.

The usage history table on the detail view (period-over-period data) is justified. An operator checking whether a tenant's usage is growing or declining across months needs this. Twelve periods of history is appropriate -- it gives a full year without overwhelming the view.

### User Jobs-to-be-Done

Every planned surface maps to a real operator need:

- Stat cards: "How is the platform performing this month?" -- answered without a click
- Tenant table: "Which tenants are active / approaching limits?" -- answered by scanning
- Tenant detail: "What is the full picture for this specific tenant?" -- answered by drilling down
- Key section: "Does this tenant have active API keys?" -- answered on the detail view

No features are planned that lack a corresponding operator job. The explicit exclusions (billing management, tenant create/delete, real-time streaming, profitability calculations) are all correct calls -- they are either out of scope for the operator's current needs or depend on data not yet available.

### One Advisory Note

The plan instructs the `handleAdminDashboard` handler (for `GET /admin`) to return the HTML shell without admin auth, matching the pattern from the existing `/ui` route. This is correct architecturally -- auth happens client-side. However, the plan notes this route is NOT rate-limited. For a sole-operator tool this is not a usability risk, but it is worth the team being aware the `/admin` URL is publicly fetchable HTML.

This is not a UX concern -- it does not affect the operator's experience. Flag noted for the security review.
