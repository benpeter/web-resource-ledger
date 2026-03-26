# Phase 0097: Flip comparison table to standard orientation and fix docs layout overflow

Issue #233.

## Task

1. Flip comparison tables on both landing page and docs site from tools-as-rows
   to the standard features-as-rows orientation (features as rows, tools as columns).
2. Fix docs layout overflow by adding a `docs-content--wide` CSS modifier for the
   compare page only.
3. Raise the card-stack breakpoint on docs from 767px to 1024px to eliminate the
   dead zone where tablet users see a horizontally-scrolling table.
4. Add sticky first column on the docs comparison table so feature names remain
   visible during horizontal scroll.

## Rationale

- Standard SaaS comparison pattern: options as columns, attributes as rows
  (per Nielsen Norman Group research)
- "Column of green" effect: WRL's column becomes a vertical stripe of green
  badges the reader hits on every feature row
- Narrative ordering: strongest differentiators (Crypto Signing, Independent
  Timestamps, Public Verification) appear as the first rows
- The 42rem content column is correct for prose readability but too narrow
  for a 10-column comparison table
