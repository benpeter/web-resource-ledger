## UX Strategy Review

**Verdict: APPROVE**

This is a backend infrastructure migration. No user-facing UI changes. My review is scoped to the API surface, which is the only UX-relevant output.

---

### What the plan gets right

**Newest-first default sort** is the correct call. The old KV order (oldest-first) was an artifact of lexicographic key ordering, not a deliberate UX decision. Recency bias is real for both consumer types (MCP agents, future list UI). The plan documents this explicitly and cites Phase 0016 as backing evidence.

**Total count in the pagination envelope** is worth the cost. Any list interface -- UI or agent -- needs "N of M" context. A cheap `COUNT(*)` is a good trade. The new `{ total, offset, limit, hasMore }` envelope is more useful than the old `{ cursor, hasMore, limit }` at every point of consumption.

**`-field` sort convention** (`-created_at` / `created_at`) is self-documenting and extensible. A `newest/oldest` enum would have broken the moment a second sort field was added. The chosen convention scales without a schema change.

**Prefix match with 4-char minimum** correctly maps to the stated user job ("show me captures of example.com"). Domain-first URL typing is the natural behavior. The minimum character enforcement prevents trivially broad queries without adding visible friction to the common case.

**Cron Trigger deferred** is correct YAGNI. The edge case (stuck pending captures) is real but the queue retry mechanism covers it in practice. The right call.

---

### One advisory note (non-blocking)

Task 2 instructs the implementing agent to "update tool description to mention available filters and offset pagination" in `src/mcp.js`. When writing that description, apply progressive disclosure: lead with the common case (list captures, newest first) and present filters as secondary capabilities. Do not enumerate all parameters upfront in the description text. A wall of parameter documentation in a tool description creates cognitive load for the MCP agent consuming the interface and obscures the primary job.

Structure the description as: primary job first, then "optional filters: url prefix, date range, status, sort order, offset pagination."

This is advisory only -- it does not affect the plan structure or task assignments.

---

### No concerns

- No new cognitive load on existing API consumers. Cursor removal is clean (zero external users, as stated).
- The `url` parameter rejecting `%` characters prevents confusion between filter behavior and raw SQL wildcard semantics.
- Tenant isolation via `WHERE tenant_id = ?` is the right default -- no change in security posture.
