## Verdict: ADVISE

This is a well-structured plan that follows existing codebase patterns closely. The complexity is proportional to the problem: six tasks for a feature that touches the data layer, two pipeline handlers, a new API endpoint, the web UI, the OpenAPI spec, and documentation. No new dependencies introduced. No new abstractions beyond one module (`src/quotas.js`) that mirrors the existing `src/rate-limits.js` pattern. No premature optimization (explicitly defers KV caching). No scope creep beyond the approved feature set.

The plan earns most of its complexity budget from essential requirements. The following items are minor concerns, not blocking issues.

### Advisories

- [simplicity]: The `handleAccountGetUsage` handler in Task 3 duplicates the D1 batch query and result-parsing logic already implemented in `checkQuota()` from Task 1.
  SCOPE: `src/account.js` -- `handleAccountGetUsage` function (Task 3)
  CHANGE: Reuse `checkQuota(db, tenantId, 0)` with `count=0` (which will always return `allowed: true` with the current usage data) instead of writing a second inline D1 batch with the same two prepared statements, same column parsing, and same `resetsAt` computation. The handler only needs to reshape the result into the response JSON. If `checkQuota`'s return shape is insufficient (e.g., missing `tierDisplay`), extend it minimally rather than duplicating the query.
  WHY: Two copies of the same D1 batch query, column parsing, and reset-date computation means two places to update when the schema changes (e.g., adding a new quota dimension). The duplication is small today but will drift as quota logic evolves.
  TASK: Task 3

- [simplicity]: The `resetsAt` computation (first of next month) is duplicated in three places: `checkQuota()` in Task 1 (twice, once per rejection branch), `handleAccountGetUsage` in Task 3, and implicitly in the `Retry-After` header construction in Task 2.
  SCOPE: `src/quotas.js` -- `resetsAt` computation
  CHANGE: Extract a single `computeQuotaReset()` function in `src/quotas.js` that returns the ISO 8601 reset timestamp. Call it from `checkQuota` (once, not per-branch) and from any handler that needs the reset date.
  WHY: The `new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()` expression appears three times with identical logic. A single function eliminates the duplication and makes the reset boundary easy to find and change (e.g., if billing periods ever shift).
  TASK: Task 1

- [simplicity]: The `X-Quota-*` response header construction is specified twice in Task 2 -- once for `handleCreateCapture` (202) and once for `handleBatchCapture` (207) -- with identical logic.
  SCOPE: `src/index.js` -- quota header construction in Task 2
  CHANGE: Extract a small helper (e.g., `buildQuotaHeaders(quotaCheck)`) that both handlers call. Three lines of code, one definition point.
  WHY: The header names and the `Math.max(0, ...)` computation are identical in both handlers. Without extraction, adding a fourth header (e.g., `X-Quota-Period`) requires edits in two places. Follows the existing pattern where `rlHeaders` construction is already structurally similar between handlers.
  TASK: Task 2

- [simplicity]: Task 3 specifies that `tierDisplay` is returned but the internal tier name is hidden from the API response, while Task 1's `checkQuota` returns the raw `tier` value. The `TIER_DISPLAY_NAMES` map already exists in `src/quotas.js`. However, if Task 3 reuses `checkQuota` (per the first advisory), the display name resolution should stay in the handler, not leak into `checkQuota`. Just noting: keep the display-name mapping at the API boundary, not in the data function.
  SCOPE: `src/quotas.js` and `src/account.js` -- tier display name resolution
  CHANGE: No structural change needed. This is a design note: if the Task 3 handler is refactored to call `checkQuota`, the `TIER_DISPLAY_NAMES[result.tier]` lookup should remain in the handler, not be pushed into `checkQuota`. The quota checker is a data function; display concerns belong at the API boundary.
  WHY: Prevents `checkQuota` from accumulating UI concerns. The function is already called in the capture pipeline where display names are irrelevant.
  TASK: Task 3

### What the plan gets right

- **Pattern consistency**: `src/quotas.js` mirrors `src/rate-limits.js` exactly -- same constant-map-plus-override-function shape. No new abstraction pattern to learn.
- **No new dependencies**: Zero new packages. Vanilla JS throughout.
- **No premature optimization**: Explicitly defers KV caching with a clear YAGNI justification (D1 PK lookup sub-2ms, well within 10ms budget).
- **No scope creep**: Explicitly excludes historical usage, upgrade CTAs, nav bar badges, queue consumer checks, and per-endpoint call quotas. Each exclusion is justified.
- **Correct insertion point**: Quota check after rate limit (cheaper KV check first) and before body parsing (avoid unnecessary work). The ordering rationale is sound.
- **Batch full-rejection**: Simpler than partial acceptance. Correct trade-off for an MVP.
- **Infrastructure proportionality**: No new bindings, no new KV namespaces, no new queues. One D1 column, one D1 batch query. Proportional.
- **TOCTOU acceptance**: Explicitly bounds the overage window at ~10 captures via the existing rate limit ceiling. Honest about the trade-off rather than building a distributed lock.
