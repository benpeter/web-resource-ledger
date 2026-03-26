# Phase 0097 Outcome

## What was produced

Flipped both comparison tables (landing page and docs site) from tools-as-rows
to the standard features-as-rows orientation, and fixed the docs layout overflow.

### Files changed

- **`landing/public/index.html`** -- Comparison table transposed: 4 feature rows,
  5 tool columns (WRL + 4 competitors). Uses `data-tool` attribute for mobile
  card labels. WRL column highlighted with `comparison-highlight-col`.

- **`landing/public/css/landing.css`** -- Added `.comparison-highlight-col` style.
  Updated mobile card-stack `td::before` to use `attr(data-tool)` instead of
  `attr(data-label)`.

- **`site/content/compare.njk`** -- Comparison table transposed: 7 feature rows,
  10 tool columns (WRL + 9 competitors). Added `wideContent: true` front matter
  flag. Feature name column uses `comparison-sticky-col` for sticky positioning.
  Feature rows ordered by WRL's strongest differentiators first: Crypto Signing,
  Independent Timestamps, Public Verification, eIDAS, API Access, Standard Format,
  Source Available.

- **`site/_includes/layouts/doc.njk`** -- Conditional `docs-content--wide` class
  based on `wideContent` front matter flag.

- **`site/css/docs.css`** -- Added `docs-content--wide` modifier
  (`max-width: calc(100vw - 240px - var(--space-12))`). Added
  `.comparison-highlight-col` and `.comparison-sticky-col` styles. Raised
  card-stack breakpoint from 767px to 1024px for the comparison table.

### Follow-up (PR #246)

A nefario orchestration session identified gaps in the initial implementation:

- Landing card-stack breakpoint was not raised (still 767px vs docs' 1024px)
- Dead `.comparison-highlight` CSS class was left in landing.css
- `data-tool` attribute inconsistent with docs' `data-label`
- Unused `comparison-table--flipped` class on table element
- No WRL highlight in card-stack mode on landing page

These were fixed in PR #246 (`fix/landing-comparison-cleanup`).

### Backlog changes

No backlog changes. This phase resolves Issue #233 which was a refinement of
the Phase 0090 comparison table work. No new items were deferred or discovered.
