# Phase 0067: Outcome

## What was built

Change detection and visual diffing for WRL captures — the ability to compare two captures of the same URL and surface structured differences across HTML content, screenshots, and HTTP headers.

### New files
- `src/diff.js` (244 lines) — Pure computation module: `diffHtml()`, `diffHeaders()`, `diffScreenshot()`, `computeChangeSummary()`
- `src/ui/ui-diff.js` (908 lines) — Visual diff view with three screenshot comparison modes, HTML hunk display, and header comparison table
- `migrations/0015_change_summary.sql` — Adds `change_summary TEXT` column to captures table

### Modified files
- `src/index.js` (+293 lines) — `handleDiffCaptures` endpoint handler, change summary computation in capture completion pipeline
- `src/db.js` (+52 lines) — `getPreviousCaptureId()`, `setChangeSummary()`, change_summary in `rowToCapture`/`rowToSchedule`, LEFT JOIN in `listSchedules()`
- `src/webhook-dispatch.js` (+16 lines) — `changeDetection` field in `capture.complete` webhook payload
- `src/ui/ui-css.js` (+395 lines) — Diff-specific CSS (code blocks, gutters, overlay slider, header tables, change badges)
- `src/ui/ui-detail.js` (+22 lines) — "Compare with previous capture" link
- `src/ui/ui-schedules.js` (+18 lines) — Changed/Unchanged badges on schedule list
- `src/ui/ui-shell.js` (+13 lines) — Diff view route
- `src/ui/ui-submit.js` (+21 lines) — Change badges on capture list items
- `openapi.yaml` — Full schema for `GET /v1/captures/{baseId}/diff/{targetId}`
- `package.json` — Added `diff-match-patch-es@1.0.1`

### Totals
- 13 files changed, ~2000 lines added
- 1 new dependency (zero transitive)
- 1 D1 migration
- All 1449 existing tests pass

## Success criteria coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| Diff endpoint returns structured response | Done | `GET /v1/captures/{id1}/diff/{id2}` |
| HTML text-level diff with line context | Done | Character-level via diff-match-patch, grouped into hunks with context |
| Screenshot visual diff | Done | Server: hash comparison. Client: canvas pixel diff with 8MP guard |
| Header diff (add/remove/change) | Done | Key-value comparison with status code change detection |
| Diff summary in response | Done | `{ changed, sections: { html, screenshot, headers } }` |
| Changed badge on schedule list | Done | LEFT JOIN enrichment, links to diff view |
| Visual diff view in web UI | Done | Three modes: side-by-side, overlay slider, pixel diff |
| Webhook includes change flag | Done | `changeDetection: { changed, summary }` in `capture.complete` |
| CPU-bounded diffing | Done | 2MB size limit, 200 hunk cap, 5s timeout guard |
| Auth: read scope, tenant isolation | Done | 401 without auth, 404 for cross-tenant |

## Deviations from prompt

1. **screenshotSimilarity numeric score** — The prompt specified `screenshotSimilarity: 0.97` in the summary. The implementation returns a boolean `changed` field instead. This was a deliberate decision: server-side pixel comparison would exceed Workers memory limits. The client-side canvas diff does compute a percentage, but it's not surfaced in the API.

2. **Screenshot diff method** — The prompt specified "pixel-level visual diff with highlighted regions, returned as image." The implementation does hash comparison server-side and pixel diff client-side only. No diff image is returned from the API — the visual diff is rendered in the browser.

## What was not built (explicitly out of scope)

- Semantic diffing (understanding what changed means)
- DOM-level structural diff
- CSS diff / JavaScript behavior diff
- Diff history/timeline view
- Configurable change thresholds
- Diff-specific test file (documented as deferred — see backlog)

## Backlog changes

- ~~R37: Change detection and diffing~~ — **Done** (this phase)
- **Added**: Diff unit/integration tests — `test/diff.test.js` covering `diffHtml`, `diffHeaders`, `diffScreenshot`, `computeChangeSummary`, and at least one integration test for `handleDiffCaptures` (flagged by lucy review)
- **Added**: Pipeline diff optimization — Extract stats-only variant of `diffHtml` for the capture completion pipeline where hunks are discarded (flagged by margo review)
- **Added**: Screenshot similarity score — Optional future enhancement to surface numeric similarity percentage in API/webhook responses, likely via Durable Object with more memory budget
