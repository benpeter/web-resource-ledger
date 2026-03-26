**Outcome**: An admin dashboard exists where the operator can see tenant overviews, per-tenant usage, tier consumption, and basic profitability signals — replacing manual D1 queries for operational awareness.

**Success criteria**:
- Dashboard shows: list of all tenants, per-tenant capture counts (current period and historical), tier/plan info, usage vs. limits
- Data is live from D1 (not cached snapshots)
- Protected by admin authentication
- Loads in under 2 seconds

**Scope**:
- In: Tenant list view, usage summary per tenant, aggregate usage overview
- Out: Tenant self-service portal, billing management, real-time streaming metrics, profitability calculations (requires cost data not yet available)
