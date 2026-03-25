# Phase 0067: Decisions

## D1: Screenshot diff approach — hash comparison over pixel diff

**Chosen**: Server-side R2 etag hash comparison for API, client-side canvas pixel diff for UI only.

**Over**: Server-side pixel comparison with pixelmatch (recommended by prompt).

**Why**: Workers have ~128MB memory. Loading two full screenshots (potentially 5-10MB each) plus a pixelmatch diff buffer would risk OOM on large captures. R2 already computes etags for stored objects, so `head()` gives us change detection for free. The client-side canvas pixel diff in the UI gives users the visual comparison they need without server-side memory pressure. The tradeoff: the API returns a boolean `changed` instead of a `screenshotSimilarity: 0.97` numeric score. This was a deliberate constraint accepted during synthesis.

**Impact**: Webhook consumers cannot threshold on similarity percentage — they get `changed: true/false` only. If numeric similarity is needed later, a separate endpoint using a Durable Object (with more memory) could compute it on demand.

## D2: HTML diff library — diff-match-patch-es

**Chosen**: `diff-match-patch-es@1.0.1` (ESM rewrite of Google's diff-match-patch).

**Over**: Hand-rolling line-level diff, or using `fast-diff` (no semantic cleanup).

**Why**: Character-level diff with semantic cleanup is non-trivial (~300 lines of algorithmic code). The library is 15KB minified, zero dependencies, Apache-2.0, and the underlying algorithm is 15+ years old (boring technology). The ESM variant is tree-shakeable. We use only 4 symbols: `diffMain`, `diffCleanupSemantic`, `DIFF_DELETE`, `DIFF_INSERT`. Version is pinned exactly (no caret).

## D3: Change summary storage — JSON TEXT column on captures

**Chosen**: `change_summary TEXT` column in D1 captures table, populated via `ctx.waitUntil()` after capture completion.

**Over**: Separate diff_results table, or computing on-demand at read time.

**Why**: The change summary is a small JSON blob (~100-200 bytes) tied 1:1 to a capture. A separate table adds join complexity for no benefit. Computing on-demand at list/read time would require fetching artifacts from R2 on every schedule list request — unacceptable latency. The `ctx.waitUntil()` pattern means the summary computation doesn't block the capture response.

## D4: HTML diff size guard — 2MB limit with truncation flag

**Chosen**: If either HTML artifact exceeds 2MB, skip diff and return `{ changed: true, truncated: true, stats: { additions: 0, deletions: 0 }, hunks: [] }`.

**Over**: Streaming diff, or no limit (risk CPU timeout).

**Why**: Workers have 60s CPU time. `diff-match-patch` on two 5MB HTML documents could easily exceed that. The 2MB guard provides a predictable upper bound. The `truncated` flag tells the consumer that the diff was not computed rather than silently returning incomplete results. Additionally, hunks are capped at 200 per diff to bound response size.

## D5: UI diff view — three screenshot comparison modes

**Chosen**: Tabbed interface with side-by-side, overlay slider, and canvas pixel diff.

**Over**: Single comparison mode, or server-rendered diff image.

**Why**: Different comparison modes serve different use cases. Side-by-side is good for layout changes, overlay slider reveals subtle pixel differences, and canvas pixel diff highlights the exact changed regions. All three are client-side only (no server resources needed). The ARIA tablist pattern ensures keyboard/screen-reader accessibility.

## D6: Schedule list enrichment — LEFT JOIN for change badges

**Chosen**: `LEFT JOIN captures c ON s.last_capture_id = c.id` in `listSchedules()` query.

**Over**: Separate API call per schedule, or denormalizing change_summary onto schedules table.

**Why**: The join is on `last_capture_id` (primary key), so performance cost is negligible. Denormalizing would create a data consistency problem (two places to update). A separate API call per schedule would be N+1 queries. The LEFT JOIN is the standard relational approach.

## D7: API response design — include parameter for selective sections

**Chosen**: `?include=html,screenshot,headers` query parameter controlling which diff sections are computed and returned.

**Over**: Always computing all sections, or separate endpoints per section type.

**Why**: The diff endpoint fetches artifacts from R2. If the consumer only needs header comparison, there's no reason to fetch and diff 2MB of HTML. Separate endpoints would fragment the API. The `include` parameter gives consumers control while keeping a single endpoint. The summary is always returned regardless of `include` selection.
