# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. Constrained filter parameters, not SQL exposure

Expose filtering through named query parameters, never raw SQL or SQL-like expressions. The two consumer classes -- MCP tool callers (LLM agents) and a future web UI -- both benefit from constrained, discoverable parameters over flexible query languages.

**Rationale (Hick's Law + error prevention):** Every degree of freedom in a query interface is a decision the consumer must make. SQL flexibility sounds powerful but creates a "blank page" problem -- agents must generate syntactically correct queries, and UI builders must design open-ended filter builders. Constrained parameters are self-documenting, trivially validatable server-side, and eliminate an entire class of input errors.

**Recommended query parameters for `GET /v1/captures` and MCP `list_captures`:**

| Parameter | Type | Purpose | JTBD |
|-----------|------|---------|------|
| `status` | enum (pending, complete, failed) | Already exists. Keep as-is. | "Show me what succeeded / what's still running / what broke" |
| `url` | string (substring match) | Filter by captured URL. Case-insensitive contains. | "Did I already capture this domain/page?" -- the primary recall job |
| `created_after` / `created_before` | ISO 8601 datetime | Date range filtering | "Show me captures from last week" / "What did I capture today?" |
| `sort` | enum (newest, oldest) | Sort direction. Default: `newest` | Reverse the current ascending default to match user mental model |
| `limit` | integer 1-100 | Already exists. Keep as-is. | Page size control |
| `offset` | integer >= 0 | New: offset-based pagination | Deterministic page navigation |

**What NOT to add (YAGNI):**
- `domain` filter (separate from `url`) -- the substring `url` filter covers this naturally; a caller searching for "example.com" captures gets them whether they pass `url=example.com` or a hypothetical `domain=example.com`. Adding both creates a choice the user must make.
- `render_quality` filter -- indifferent feature per Kano. No one's job-to-be-done starts with "find my degraded renders."
- `sort_by` with multiple columns -- one sort axis (creation time) covers both consumer jobs. Multi-column sort is a power feature with near-zero demand and non-trivial cognitive cost ("which column is primary?").
- Full-text search on URL -- substring match is sufficient at the current scale ceiling (10K captures). Full-text search was explicitly scoped out in the prompt.

### 2. Default sort order: newest-first

The current ascending (oldest-first) order was a pragmatic artifact of KV's lexicographic ordering, not a UX choice. The Phase 0016 decisions explicitly note: "The API contract does not promise sort order, so this can change with D1 migration."

**Change the default to `newest` (descending `created_at`).** Both consumer jobs are recency-biased:
- MCP agents: "Did my capture complete?" / "What's my latest capture?" -- these always want the most recent items first.
- Web UI: every capture management dashboard in existence defaults to newest-first. This is a must-be expectation (Kano) -- its absence would confuse, its presence goes unnoticed.

Expose `sort=oldest` for the rare reverse-chronological need, but don't make users pay the cognitive tax of specifying direction for the 95% case.

### 3. Pagination model: offset/limit with backward-compatible cursor support

The migration from cursor-based to offset/limit pagination is the right call for both consumers, but needs careful handling.

**Why offset/limit is correct for this product:**
- **Web UI (future):** Offset/limit enables "page 3 of 7" navigation, total counts, and "jump to page N" -- all expectations users bring from every table UI they've ever used. Cursor-based pagination in a web table is a known anti-pattern that forces infinite-scroll or "load more" as the only navigation model.
- **MCP agents:** Agents think in simple terms: "give me items 20-40." Offset/limit maps directly to this mental model. Cursors require agents to manage opaque state between calls -- an unnecessary memory burden.

**Backward compatibility concern:**

The current cursor format `{"kv":"..."}` is an opaque string from the consumer's perspective. No consumer is storing cursors across sessions (they're ephemeral, per-pagination-sequence tokens). The risk of breaking existing consumers is effectively zero because:
1. There are no external users yet (stated in the task).
2. Cursors are session-scoped -- no one persists them.
3. The MCP tool schema defines `cursor` as optional.

**Recommendation:** Ship offset/limit as the primary pagination model. Remove cursor support entirely rather than maintaining two mechanisms. Dual pagination models create exactly the kind of "which one do I use?" cognitive load that adds permanent complexity for zero benefit.

If there is anxiety about removing cursors, keep the `cursor` parameter as a deprecated alias that the server silently ignores (returning a deprecation notice in the response), but do not invest in making cursors work with D1. The clean break is the simpler path and there are no users to break.

### 4. MCP tool schema changes

The `list_captures` MCP tool gains new parameters. Apply progressive disclosure: keep the tool usable with zero parameters (returns newest captures with default limit), and make every filter optional.

**Updated MCP tool parameters:**
```
status:    z.enum(['pending', 'complete', 'failed']).optional()  -- unchanged
limit:     z.number().int().min(1).max(100).optional()           -- unchanged
offset:    z.number().int().min(0).optional()                    -- NEW, replaces cursor
url:       z.string().optional()                                 -- NEW
created_after:  z.string().optional()                            -- NEW, ISO 8601
created_before: z.string().optional()                            -- NEW, ISO 8601
sort:      z.enum(['newest', 'oldest']).optional()               -- NEW, default newest
```

**Tool description update:** The tool description should communicate what's filterable in natural language so that LLM agents can discover capabilities without reading schemas:

> "List your captures with optional filters. Filter by status (pending/complete/failed), URL substring, or date range (created_after/created_before as ISO 8601). Results ordered newest-first by default (use sort=oldest to reverse). Paginate with offset and limit."

This description serves as the "visibility" heuristic for agent consumers -- they can't see a UI, so the description *is* the UI.

### 5. Response envelope: add `total` count

With D1, a `SELECT COUNT(*)` is cheap. Add a `total` field to the pagination envelope:

```json
{
  "data": [...],
  "pagination": {
    "total": 142,
    "offset": 0,
    "limit": 20,
    "hasMore": true
  }
}
```

**Why:** The `total` field is a must-be feature (Kano) for the web UI consumer -- every paginated table needs it. For MCP agents, it provides immediate context ("you have 142 captures" vs "here are 20, there might be more"). This is the "system status visibility" heuristic (Nielsen #1) -- the user should know the scope of their data without paginating to the end.

Remove the `cursor` field from the pagination envelope. Replace with `offset`.

### 6. URL filter semantics: case-insensitive substring, not regex

The `url` parameter should be a simple case-insensitive substring match (`WHERE url LIKE '%' || ? || '%' COLLATE NOCASE`). Not regex, not glob, not exact match.

**Rationale:** The job is recall -- "did I capture anything from this site?" Users will type `example.com` or `nytimes` or `blog`. Substring match handles all these cases without the user needing to understand match semantics. Exact match would miss ("was it http or https? did it have www?"). Regex is overkill and creates an injection surface.

Use parameterized queries to prevent SQL injection -- the substring is a bound parameter, never interpolated.

## Proposed Tasks

1. **Change default sort to newest-first** -- Update both REST and MCP handlers to `ORDER BY created_at DESC` as default. Add `sort` query parameter (enum: newest/oldest).

2. **Replace cursor with offset/limit pagination** -- Remove cursor encoding/decoding logic. Add `offset` parameter to REST and MCP. Return `total` count in pagination envelope. Update pagination response shape: `{ total, offset, limit, hasMore }`.

3. **Add URL substring filter** -- Add `url` query parameter to REST and MCP. Implement as case-insensitive `LIKE` in D1 query. Index the `url` column if `LIKE` with leading wildcard is slow at 10K rows (test first -- SQLite may not need it at this scale).

4. **Add date range filters** -- Add `created_after` and `created_before` query parameters. Validate as ISO 8601. Map to `WHERE created_at >= ? AND created_at <= ?` in D1.

5. **Update MCP tool description** -- Rewrite `list_captures` description to enumerate available filters in natural language. Remove cursor reference.

6. **Update REST API documentation** -- Document new query parameters, changed default sort, new pagination model.

## Risks and Concerns

### Risk: `LIKE '%term%'` performance at scale
SQLite (D1) cannot use a B-tree index for `LIKE` queries with a leading wildcard. At the 10K capture ceiling stated in success criteria, this is a non-issue (full table scan on 10K rows is sub-millisecond in SQLite). **But:** if the product grows past 100K captures per tenant, URL search will need either FTS5 or a separate indexed domain column. Flag this as a future concern, not a current blocker. The YAGNI principle applies -- don't optimize for scale that doesn't exist.

### Risk: Offset pagination deep-page performance
`OFFSET 5000 LIMIT 20` in SQLite still scans and discards 5000 rows. At 10K captures this is negligible. At 100K+ it matters. If future scale demands it, the solution is keyset pagination (`WHERE created_at < ? ORDER BY created_at DESC LIMIT 20`) -- but that's a cursor model by another name and should only be introduced when evidence shows offset pagination is slow. Don't pre-engineer this.

### Risk: Breaking change to pagination response envelope
The response shape changes from `{ cursor, hasMore, limit }` to `{ total, offset, limit, hasMore }`. Any consumer parsing the current response will see `cursor` disappear and `total`/`offset` appear. Since there are no external consumers, this is safe. Document the change in release notes regardless.

### Risk: MCP tool parameter removal (cursor)
Removing the `cursor` parameter from the MCP tool schema is a breaking change in the tool contract. MCP clients that have cached the old schema may still pass `cursor`. The handler should silently ignore unrecognized parameters rather than failing (defensive parsing). Zod's `.passthrough()` or equivalent handles this.

### Concern: Date filter format ambiguity
ISO 8601 allows many representations (`2026-03-22`, `2026-03-22T14:00:00Z`, `2026-03-22T14:00:00+02:00`). Define clearly: accept any ISO 8601 datetime. If only a date is provided (`2026-03-22`), interpret `created_after` as start of day UTC and `created_before` as end of day UTC. Document this. Ambiguity here would violate the "don't make me think" principle.

## Additional Agents Needed

No additional agents are needed for this specific planning question. The recommendations are implementable by the existing team. However, two notes:

- **api-design-minion** should validate these recommendations against REST API conventions and ensure the query parameter naming is consistent with the existing API surface (e.g., snake_case vs camelCase -- the current API uses camelCase in response bodies but query params appear to be lowercase).
- **test-minion** should ensure the new filter/sort/pagination parameters have thorough integration test coverage, especially edge cases: empty date ranges, URL filter with special characters, offset beyond total count, combined filters.
