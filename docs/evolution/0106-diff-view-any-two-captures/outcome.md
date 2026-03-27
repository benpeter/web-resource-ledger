# Outcome

## What was built

Users can now compare any two captures of the same URL from the capture
detail page, not just the latest scheduled pair. The feature has two parts:

### Backend: API response enrichment

- `GET /v1/captures/{id}` now includes `changeSummary` (when present) and
  `scheduleId` (when present) in the response body
- `GET /v1/captures` list projection now includes `scheduleId` for complete
  captures with a schedule

These fields were already stored in D1 but never surfaced through the API.

### Frontend: Capture comparison picker

The dead "Changes" section on the capture detail page was replaced with a
working "Compare Captures" section:

- **Quick-compare link**: When `changeSummary.previousCaptureId` exists,
  shows a direct link to compare with the previous scheduled capture
- **Capture picker**: Toggle button expands an inline list of all captures
  of the same URL, with lazy loading (20 per page) and pagination
- **Date-ordered diff links**: Older capture is always the base (id1),
  newer is the target (id2)
- **"Scheduled" badge**: Captures from schedules show a visual indicator
- **Current capture**: Shown but disabled (greyed out with "(current)")
- **Accessibility**: `aria-expanded` toggle, `aria-live` status region,
  Escape key closes picker, semantic `<ul>/<li>/<a>` markup
- **Empty state**: If only one capture exists, the picker section hides

### OpenAPI spec

Added `changeSummary` schema to `CaptureRecord` component. The field was
being returned but undocumented.

## Files changed

| File | Change |
|------|--------|
| `src/index.js` | Surface changeSummary and scheduleId in API responses |
| `src/ui/ui-detail.js` | Replace dead Changes section with capture picker |
| `src/ui/ui-css.js` | Styles for capture picker component |
| `openapi.yaml` | Add changeSummary to CaptureRecord schema |
| `test/fixtures.js` | Add changeSummary parameter to seedCapture |
| `test/capture-retrieval.test.js` | Tests for changeSummary/scheduleId in responses |
| `test/list-captures.test.js` | Test for scheduleId in list projection |

## Test results

All 1668 tests pass (65 test files). Three new tests added:
- changeSummary presence in detail response
- changeSummary/scheduleId absence when not set
- scheduleId in list projection for scheduled captures

## Surface consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | Updated: added `changeSummary` to CaptureRecord schema |
| Docs site | No update needed: no dashboard documentation page exists |
| Landing page | No update needed: feature enhancement, not new capability |
| MCP server | No update needed: `diff_captures` already accepts arbitrary IDs |
| Legal pages | No update needed: no new data collection or processing |

## Backlog changes

- Marked done: "Change detection between scheduled captures" parking lot
  item (Phase 0059 origin)
