## Domain Plan Contribution: frontend-minion

### Recommendations

#### Fix 1 — Pricing Section Layout

**Recommendation: Option (c) — hybrid layout, two cards.**

The current 3-card grid maps to a named-plan model (Explore/Evidence/Enterprise) that does not match the actual graduated usage-based pricing. Repurposing 3 cards (option a) would force the graduated capture tiers and the eIDAS add-on into separate cards, which misrepresents the pricing — they are layers of the same product, not competing plans.

A pure pricing table (option b) is information-dense but lacks visual hierarchy. It does not give the free tier the prominence it deserves, and it makes the enterprise/on-premise option look like just another row.

The hybrid approach uses:

1. **Primary card** — "Usage-Based Pricing" — containing a compact table of graduated tiers for Web Captures and a second small table (or inline list) for eIDAS Timestamps. The free tier allowances (200 captures/month free, 50 eIDAS timestamps/month free) get prominent treatment at the top of each table block, using the existing `badge--pass` (green) style or a "Free" callout. This card gets the `pricing-card--featured` treatment with the accent border, but the `::before` pseudo-element content changes from "Recommended" to something like "Pay as you go".

2. **Secondary card** — "On-Premise / Enterprise" — retains the existing text about self-hosted deployment with custom SLAs. Stays as a plain card without the featured border. Add a "Contact us" CTA.

**Grid layout change**: Switch from `repeat(3, 1fr)` to a 2-column layout at 768px+. The primary card could span wider or both cards can be equal width — equal width is simpler and reads well. On mobile, they stack naturally (the grid already collapses to single-column below 768px).

**Graduated tier table structure inside the primary card**: Use a semantic `<table>` element, not a div-based layout. This is tabular data — volume tiers and corresponding prices. The table needs:
- Minimal styling (no heavy borders — use subtle bottom borders on rows, matching `--color-border-subtle`)
- Two columns: Volume and Price per capture
- The "Free" row visually distinguished (bold, or with the green badge)
- A separate smaller section below for eIDAS with the same structure
- A note clarifying eIDAS is an opt-in add-on

**Elements to remove**:
- Both `<span class="badge badge--info">Coming soon</span>` elements
- The `<p class="pricing-note">Pricing is coming. The API is available now.</p>` paragraph
- The `badge--info` CSS rule in landing.css (only used by the "Coming soon" badges — verify no other usage first, but grep confirms it is only in the pricing cards)
- The Explore and Evidence card markup entirely (replaced by the single usage-based card)

**New CSS needed**:
- `.pricing-table` — minimal table styling (width: 100%, border-collapse, cell padding using design system spacing tokens)
- `.pricing-table th` — left-aligned, muted text color, font-weight medium, small font size
- `.pricing-table td` — standard text, bottom border with `--color-border-subtle`
- `.pricing-table__free` — row modifier for the free tier (could use `--color-success` or bold)
- `.pricing-section-label` — small heading within the card separating "Web Captures" from "eIDAS Timestamps"
- Update the media query from `repeat(3, 1fr)` to `repeat(2, 1fr)`
- Remove or repurpose `.pricing-card--featured::before` content (change from "Recommended" to "Pay as you go" or remove entirely)

**Accessibility considerations**:
- The `<table>` must have a `<caption>` (can be visually hidden with `sr-only` if the section heading provides enough context)
- Use `<thead>` and `<tbody>` for proper table semantics
- Scope attributes on `<th>` elements: `scope="col"`
- Currency values should use `<span>` with appropriate formatting, not special symbols that might confuse screen readers — use "EUR" or the euro sign consistently
- `aria-labelledby` on the cards should point to updated heading IDs

#### Fix 2 — deviceScaleFactor

**Recommendation: Change is safe. One line, no downstream concerns.**

After searching the entire codebase, `deviceScaleFactor` appears exactly once in production code (`src/capture.js:454`). It is set on `browser.newContext()` and affects Playwright's internal rendering resolution. There are no other references to the scale factor value in the capture pipeline, no calculations that derive from it, and no downstream code that assumes a specific pixel density.

The key dimensions to verify:
- **Viewport**: 1280x720 logical pixels. At 4x, the bitmap becomes 5120x2880 for the viewport area.
- **Full-page screenshots**: With `MAX_PAGE_HEIGHT` of 8000 logical pixels, the worst case bitmap is 5120x32000 pixels = ~163 million pixels. At 4 bytes per pixel (RGBA), that is ~655 MB of raw bitmap before PNG compression. This is a significant increase from 2x (where worst case was 2560x16000 = ~41M pixels, ~164 MB).

**Risk**: Memory pressure on Cloudflare Browser Rendering workers. The security minion's earlier analysis (from phase 0016) recommended capping at 2x and computing a pixel budget of 50 million pixels. At 4x with MAX_PAGE_HEIGHT=8000, the pixel count is 163M — well above that recommended budget. However, the issue spec explicitly says to accept the file size tradeoff, and this is a hardcoded server-side value (not user-controlled), so the abuse vector does not apply.

**Mitigation**: The existing `MAX_PAGE_HEIGHT` cap (8000px) already bounds the worst case. Most pages are much shorter. PNG compression is effective on rendered web content (large areas of flat color). In practice, typical screenshots at 4x will be 2-5 MB rather than the theoretical maximum. Monitor R2 storage costs and worker memory after deployment.

No other code changes needed for the scale factor change.

### Proposed Tasks

#### Task 1: Replace pricing section HTML

**What**: Remove the 3-card pricing grid. Replace with a 2-card layout: one usage-based pricing card with graduated tier tables, one enterprise/on-premise card.

**Deliverables**:
- Updated `landing/public/index.html` lines 190-228
- Remove both "Coming soon" badges
- Remove the `pricing-note` paragraph
- New semantic `<table>` elements for capture tiers and eIDAS tiers
- Free tier prominently marked
- Enterprise card retains existing copy, gains a "Contact us" link

**Dependencies**: None (self-contained HTML change)

#### Task 2: Update pricing section CSS

**What**: Adjust the pricing grid to 2 columns. Add table styling for graduated tiers. Remove `badge--info` rule. Update or remove the `--featured::before` pseudo-element.

**Deliverables**:
- Updated `landing/public/css/landing.css` pricing section
- New rules: `.pricing-table`, `.pricing-table th`, `.pricing-table td`, `.pricing-section-label`, `.pricing-table__free`
- Grid change: `repeat(3, 1fr)` to `repeat(2, 1fr)` in the media query
- Remove `.badge--info` rule (lines 501-506)
- Removal of `.pricing-card__price` and `.pricing-card__price span` rules if no longer used (verify after HTML changes)

**Dependencies**: Task 1 (HTML structure drives CSS needs)

#### Task 3: Change deviceScaleFactor to 4

**What**: Single-line change in `src/capture.js` line 454: `deviceScaleFactor: 2` to `deviceScaleFactor: 4`.

**Deliverables**:
- Updated `src/capture.js`

**Dependencies**: None

#### Task 4: Verify responsive behavior

**What**: After HTML/CSS changes, verify the pricing section renders correctly at mobile (<768px), tablet (768px-1024px), and desktop (1024px+) widths. Check that the graduated pricing table is readable on small screens (table does not overflow or become unreadable).

**Deliverables**: Verification that the layout works across breakpoints. If the table overflows on mobile, add `overflow-x: auto` on the table container or switch to a stacked layout for small screens.

**Dependencies**: Tasks 1 and 2

### Risks and Concerns

1. **Table readability on mobile**: A `<table>` with two columns (Volume / Price) is fine on mobile, but if we add more columns later (e.g., for multiple products side-by-side), it could overflow. The current 2-column structure is safe. Add `overflow-x: auto` as a defensive measure on the table wrapper.

2. **Screenshot memory pressure at 4x**: As noted above, 4x scale with 8000px max page height produces large bitmaps. The Cloudflare Browser Rendering worker has memory limits. If captures start failing on very tall pages, the mitigation is to reduce `MAX_PAGE_HEIGHT` (e.g., to 4000) or accept that the 8000px cap was set for 2x and should be proportionally reduced for 4x. This is an operational concern to monitor post-deploy, not a blocker.

3. **R2 storage cost increase**: 4x screenshots are roughly 4x larger in file size than 2x (not 16x, because PNG compression scales sub-linearly with pixel count). Over time this increases storage costs. The issue spec explicitly accepts this tradeoff.

4. **Removing badge--info CSS**: Grep confirms `badge--info` is only used in the pricing section's "Coming soon" badges. Safe to remove. But if another page adds it later, it would need to be re-added. Low risk — the class can be re-introduced if needed.

5. **Euro currency formatting**: Use `EUR 0.05` or the `€` symbol consistently. The `€` symbol is universally understood in the EU context and is more scannable than "EUR" in a pricing table. Recommend `€0.05` format (symbol prefix, no space, matching standard European pricing display). For screen readers, the euro sign reads correctly in all major screen readers.

### Additional Agents Needed

None. The pricing section is a pure HTML/CSS change within existing vanilla markup. The deviceScaleFactor change is a single-line constant. No API changes, no infrastructure changes, no security implications beyond what has already been analyzed. The current team is sufficient.
