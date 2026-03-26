# Phase 0097 Decisions

## 1. Table orientation: features-as-rows, tools-as-columns

**Chosen**: Transpose both tables so features are rows and tools are columns.

**Rationale**: Standard SaaS comparison pattern. Evaluators think feature-first
("who has RFC 3161 timestamps?"). WRL's column becomes a vertical stripe of
green badges. The strongest differentiators (Crypto Signing, Independent
Timestamps, Public Verification, eIDAS) are placed as the first rows.

**Alternative considered**: Keep tools-as-rows. Rejected because the old layout
required readers to scan horizontally across a row to compare one tool's
capabilities, which is harder to parse when there are 7+ feature columns.

## 2. Wide content modifier vs. site-wide layout change

**Chosen**: Scoped `docs-content--wide` CSS class applied via front matter flag.

**Rationale**: The 42rem max-width is correct for prose readability on all other
docs pages. Only the compare page needs more room. A front matter flag
(`wideContent: true`) keeps the change scoped to one page without affecting
the other 16 docs pages.

**Alternative considered**: Remove max-width site-wide. Rejected because long
prose lines become unreadable past ~80 characters.

## 3. Card-stack breakpoint: 767px -> 1024px (docs only)

**Chosen**: Raise the card-stack breakpoint on the docs comparison table from
767px to 1024px.

**Rationale**: At 768px, the sidebar (240px) leaves only ~528px for content.
A 10-column table overflows badly in that range. Card-stacking at <= 1024px
means tablet users get a readable card layout instead of a tiny scrollable
table. The landing page breakpoint stays at 767px because its 5-column table
fits better on wider viewports.

## 4. Sticky first column for feature names

**Chosen**: CSS `position: sticky; left: 0` on the feature name column (first
column) in the docs comparison table.

**Rationale**: With 10 tool columns, horizontal scrolling is expected on
viewports between 1025px and ~1400px. The reader needs to always see which
feature row they are looking at. Sticky positioning is supported in all
modern browsers and degrades gracefully.

## 5. data-tool attribute for mobile card labels

**Chosen**: Replace `data-label` with `data-tool` on `<td>` elements for the
flipped table. The mobile card-stack uses `content: attr(data-tool)` to show
the tool name before each cell's value.

**Rationale**: In the old orientation, `data-label` showed the feature name.
In the new orientation, the feature name is already the row header (card
title). What the reader needs on mobile is the tool name for each cell.
