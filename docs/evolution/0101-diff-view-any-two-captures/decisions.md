# Decisions

## Root cause: changeSummary never surfaced in API

The `changeSummary` field was computed and stored in D1 during scheduled
captures, but `handleGetCapture` never included it in the response body.
The existing "Compare with previous capture" link in the UI was therefore
dead code -- it relied on `data.changeSummary.previousCaptureId` which was
always undefined. Both frontend-minion and feature-dev:code-explorer
independently identified this gap.

**Decision**: Surface `changeSummary` and `scheduleId` in the GET capture
response. Also add `scheduleId` to the list projection so the picker can
show a "Scheduled" badge.

## Single-selection vs two-selection model

**Alternatives considered**:
1. Two independent dropdowns (pick base and target separately)
2. Current capture = implicit target, user picks a base (single-selection)
3. Full comparison matrix page

**Decision**: Option 2. The user is already viewing a capture detail page,
so the current capture is the natural implicit target. Single-selection
reduces cognitive load and avoids the "compare capture with itself" mistake.
The diff URL ordering (older=base, newer=target) is handled automatically.

## Inline picker vs modal/dropdown

**Alternatives considered**:
1. Modal dialog with capture list
2. Native `<select>` dropdown
3. Inline expandable section with toggle button

**Decision**: Option 3 (inline picker). A modal would break flow in a
single-page app. A `<select>` can't show rich information (dates, badges).
The inline section with a toggle follows the existing disclosure pattern
used elsewhere in the UI (e.g., accordion sections).

## Accessibility approach

**Alternatives considered**:
1. Full ARIA listbox pattern with `role="listbox"`, `role="option"`,
   keyboard arrow navigation
2. Plain semantic HTML (`<ul>/<li>/<a>`)

**Decision**: Option 2. Both margo and accessibility-minion agreed that a
plain list of links is semantically correct (each item navigates to a diff
page) and requires no custom keyboard handling. The ARIA listbox pattern is
for selection widgets, not navigation lists. The toggle button uses
`aria-expanded` and `aria-controls` for disclosure semantics.

## Client-side exact URL filtering

The `GET /v1/captures` endpoint uses `LIKE` prefix matching on URLs. When
the picker fetches captures for a URL, prefix matches from other URLs
could appear (e.g., `example.com/page` matching `example.com/page/sub`).

**Decision**: Apply client-side exact URL filtering:
`captures.filter(c => c.url === url)`. This keeps the API generic while
ensuring the picker only shows captures of the exact same URL. The
performance cost is negligible since the API already filters by URL prefix.

## "Scheduled" badge on captures

The picker shows which captures came from a schedule (vs manual submission).
This helps users identify the automated monitoring context vs one-off
captures.

**Decision**: Show a "Scheduled" badge when `cap.scheduleId` is truthy.
Uses the existing accent color design token.
