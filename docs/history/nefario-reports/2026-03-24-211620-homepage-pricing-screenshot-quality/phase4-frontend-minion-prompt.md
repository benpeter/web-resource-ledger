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
- **IMPORTANT (reviewer advisory)**: Before removing `.pricing-card__price` and `.pricing-card__price span` rules (lines 448-460), grep for usage in the final HTML. The Enterprise card may still use this class. Only remove if confirmed unused.
- Keep `.pricing-card__description` — still used by Enterprise card

### Mobile badge advisory (from architecture review)
The existing CSS at ~line 724 has `.pricing-card--featured::before { display: none; }` which hides the badge on mobile. Make a DELIBERATE choice:
- Option A: Remove the mobile override so "Pay as you go" shows on mobile too
- Option B: Keep it hidden (the card title provides context)
Choose whichever makes more sense given the final layout. Document your choice with a brief CSS comment.

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
