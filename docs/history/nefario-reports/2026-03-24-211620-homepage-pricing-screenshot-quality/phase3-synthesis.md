## Delegation Plan

**Team name**: homepage-pricing-screenshot-quality
**Description**: Replace placeholder pricing on homepage with real graduated tier pricing, and increase screenshot deviceScaleFactor from 2 to 4.

### Task 1: Update homepage pricing and screenshot scale factor
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are making two targeted fixes to the WRL project. Both are small, well-scoped changes.

    ## Fix 1 — Replace placeholder pricing with real graduated tiers

    ### Current state

    The file `landing/public/index.html` (lines 190-228) has a 3-card pricing grid with placeholder content:
    - "Explore" card with "Coming soon" badge and "Free" price
    - "Evidence" card (featured, accent border) with "Coming soon" badge and "Pro usage-based" price
    - "On-Premise" card with "Enterprise" price
    - A `<p class="pricing-note">Pricing is coming. The API is available now.</p>` below the grid

    The file `landing/public/css/landing.css` has the pricing CSS at lines 419-506, including:
    - `.pricing-grid` — CSS grid, 1-col default, 3-col at 768px+
    - `.pricing-card`, `.pricing-card__tier`, `.pricing-card__price`, `.pricing-card__description`
    - `.pricing-card--featured` — accent border + "Recommended" pseudo-element badge
    - `.pricing-note` — centered muted text
    - `.badge--info` — blue badge used only for "Coming soon" (verify: only in pricing cards)
    - Mobile override at ~line 724: `.pricing-card--featured::before { display: none; }`

    ### What to do

    Replace the 3-card grid with a **2-card layout**:

    **Card 1 — "Usage-Based Pricing"** (featured card, accent border):
    - Change the `::before` pseudo-element text from "Recommended" to "Pay as you go"
    - Contains two sections with small section headings:
      1. **Web Captures** — a semantic `<table>` with graduated tiers:
         | Volume | Price |
         |--------|-------|
         | First 200/month | Free |
         | 201 – 10,000 | €0.05 per capture |
         | 10,001 – 100,000 | €0.035 per capture |
         | 100,001+ | €0.015 per capture |
      2. **Qualified Timestamps (eIDAS)** — a second small table:
         | Volume | Price |
         |--------|-------|
         | First 50/month | Free |
         | 51+ | €0.10 per capture |
         - Add a note below: "Account-level opt-in add-on"

    - The "Free" rows should be visually prominent (bold, or use the existing `badge badge--pass` green style for a "Free" inline badge)
    - Use `€` symbol (not "EUR") — more scannable, reads correctly in screen readers

    **Card 2 — "On-Premise / Enterprise"** (plain card, no featured border):
    - Keep the existing description about self-hosted deployment, custom SLAs
    - Add a "Contact us" CTA (mailto: or link to docs, keep it simple)

    ### HTML requirements
    - Tables must use semantic `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `<caption>` (caption can be visually hidden with `sr-only` class if the section heading provides context)
    - Remove both `<span class="badge badge--info">Coming soon</span>` elements
    - Remove the `<p class="pricing-note">...</p>` paragraph
    - Remove the Explore and Evidence card markup entirely (replaced by usage-based card)
    - Update `aria-labelledby` attributes to point to new heading IDs

    ### CSS requirements (in `landing/public/css/landing.css`)
    - Change grid from `repeat(3, 1fr)` to `repeat(2, 1fr)` in the media query at line 490
    - Change `.pricing-card--featured::before` content from `"Recommended"` to `"Pay as you go"` at line 475
    - Add new rules for the pricing tables:
      - `.pricing-table` — `width: 100%; border-collapse: collapse;` with cell padding using design tokens (`--space-2` / `--space-3`)
      - `.pricing-table th` — left-aligned, `color: var(--color-text-muted)`, `font-weight: var(--weight-medium)`, `font-size: var(--text-sm)`, bottom border
      - `.pricing-table td` — standard text, `border-bottom: 1px solid var(--color-border-subtle)`
      - `.pricing-table__free` — row modifier for free tier (bold weight or use `--color-success-text`)
      - `.pricing-section-label` — small heading style for "Web Captures" / "Qualified Timestamps" within the card
    - Add `overflow-x: auto` on the table wrapper as a defensive measure for mobile
    - Remove `.badge--info` rule (lines 501-506) — only used by removed "Coming soon" badges
    - Remove `.pricing-note` rule (lines 494-499) — element is removed
    - Remove `.pricing-card__price` and `.pricing-card__price span` rules (lines 448-460) if no longer used after HTML changes — the new layout uses tables instead of large price display
    - Keep `.pricing-card__description` — still used by Enterprise card

    ### Design system tokens available (from design-system.css)
    - Spacing: `--space-1` through `--space-16`
    - Text sizes: `--text-xs`, `--text-sm`, `--text-base`, `--text-xl`, `--text-3xl`
    - Weights: `--weight-normal`, `--weight-medium`, `--weight-bold`
    - Colors: `--color-text`, `--color-text-muted`, `--color-border-subtle`, `--color-accent`, `--color-success-bg`, `--color-success-text`, `--color-success`
    - Badge: `.badge` base class + `.badge--pass` (green) already exist in design-system.css

    ## Fix 2 — Increase deviceScaleFactor to 4

    In `src/capture.js` line 454, change:
    ```js
    deviceScaleFactor: 2,
    ```
    to:
    ```js
    deviceScaleFactor: 4,
    ```

    This is a single-line change. No other code references this value. The existing `MAX_PAGE_HEIGHT` cap (8000px) bounds the worst case. Accept the file size tradeoff per the issue spec.

    ## Files to modify (exhaustive list)
    1. `landing/public/index.html` — lines 190-228 (pricing section)
    2. `landing/public/css/landing.css` — pricing CSS (lines 419-506) and mobile override (line 724)
    3. `src/capture.js` — line 454

    ## What NOT to do
    - Do NOT touch Stripe integration code, billing pages, or pricing logic
    - Do NOT change image compression or R2 storage settings
    - Do NOT modify any other sections of the homepage
    - Do NOT add JavaScript — this is a pure HTML/CSS content change + one config constant
    - Do NOT use any CSS frameworks or build tools — this is vanilla CSS
    - Do NOT modify design-system.css — add new pricing-specific styles to landing.css only

- **Deliverables**:
    - Updated `landing/public/index.html` with 2-card pricing layout, graduated tier tables, no "Coming soon" text
    - Updated `landing/public/css/landing.css` with 2-col grid, table styles, removed dead rules
    - Updated `src/capture.js` with `deviceScaleFactor: 4`
- **Success criteria**:
    - Homepage pricing section displays real tier prices matching Stripe config
    - "Coming soon" text completely removed
    - Free tier (200 captures/month, 50 eIDAS/month) clearly stated with visual prominence
    - Tables are semantic HTML with proper accessibility markup
    - Layout works on mobile (single column, tables don't overflow) and desktop (2-col grid)
    - `deviceScaleFactor` is 4 in capture.js
    - No dead CSS rules left behind (badge--info, pricing-note, pricing-card__price if unused)

### Cross-Cutting Coverage
- **Testing**: Not needed in execution. No executable logic changed (HTML/CSS content + one constant). Phase 6 will run existing tests to verify no regressions.
- **Security**: Not applicable. No user input handling, no auth changes, no API surface changes. The deviceScaleFactor is a hardcoded server-side constant (not user-controlled).
- **Usability -- Strategy**: Covered within the task prompt. The 2-card hybrid layout was selected specifically for journey coherence: usage-based pricing in one card communicates "one product, graduated tiers" rather than "competing plans." Free tier prominence addresses the primary user question ("what does it cost to try?").
- **Usability -- Design**: Covered within the task prompt. Table styling, visual hierarchy (free tier prominence), responsive behavior, and the featured card treatment are all specified.
- **Documentation**: Not needed. No API changes, no architectural changes. The pricing is user-facing content, not documentation. Phase 8 assessment will confirm.
- **Observability**: Not applicable. No runtime components changed (the deviceScaleFactor change affects screenshot output, not logging/metrics).

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This is a 3-file content and config change with no new components, no new data flows, no UI framework changes, and no runtime service modifications. The discretionary reviewers' domain signals (UI components, WCAG audit, performance budgets, coordinated observability, user docs impact) do not match this scope — it is existing HTML restructuring with semantic tables, not new interactive UI, and the accessibility requirements are addressed directly in the task prompt.
- **Not selected**:
  - ux-design-minion: No new interaction patterns or visual components; this is restructuring existing card content into tables using existing design tokens.
  - accessibility-minion: Accessibility requirements (semantic tables, captions, scope attributes, aria-labelledby) are specified directly in the task prompt. A separate review pass would add overhead disproportionate to the change.
  - sitespeed-minion: No new runtime code, scripts, or assets. Pure HTML/CSS content change.
  - observability-minion: No runtime components modified.
  - user-docs-minion: Pricing is communicated on the homepage itself; no separate user documentation update needed.

### Decisions

- **2-card hybrid over 3-card plan model**
  Chosen: Two cards (usage-based + enterprise) with graduated tier tables
  Over: Keeping 3 cards (Explore/Evidence/Enterprise) with updated prices, or a single full-width pricing table
  Why: The actual pricing is graduated usage-based, not plan-based. Three cards misrepresent the model by suggesting competing plans. A single table lacks visual hierarchy for the free tier and buries the enterprise option. Two cards match the actual product structure.

### Risks and Mitigations

1. **Table readability on mobile**: Two-column tables (Volume / Price) fit fine on mobile. Defensive `overflow-x: auto` on the table wrapper prevents horizontal overflow if content is wider than expected.
2. **Screenshot memory at 4x**: At 4x with MAX_PAGE_HEIGHT=8000, worst-case bitmap is ~655MB. The existing height cap bounds this, and typical pages produce 2-5MB PNGs. Monitor R2 storage and worker memory post-deploy. If tall-page captures fail, reduce MAX_PAGE_HEIGHT proportionally.
3. **R2 storage cost increase**: 4x screenshots are roughly 4x larger. Accepted tradeoff per issue spec.

### Execution Order

```
Batch 1 (single task, no gates):
  Task 1: frontend-minion — pricing HTML/CSS + deviceScaleFactor
```

No external skills used in this plan.

### Verification Steps

1. Open homepage locally and verify pricing section shows 2-card layout with graduated tier tables
2. Verify "Coming soon" text is completely absent (grep the HTML)
3. Verify free tier (200 captures, 50 eIDAS) is prominently displayed
4. Check responsive behavior: mobile (< 768px) shows stacked cards, desktop shows 2-col grid
5. Check table accessibility: inspect DOM for `<caption>`, `<thead>`, `<th scope="col">`
6. Verify `src/capture.js` has `deviceScaleFactor: 4`
7. Run existing test suite to confirm no regressions
