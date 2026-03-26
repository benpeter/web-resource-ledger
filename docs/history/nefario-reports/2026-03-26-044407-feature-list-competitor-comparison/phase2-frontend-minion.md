# Domain Plan Contribution: frontend-minion

## Recommendations

### 1. Responsive Pattern for 8-Column Comparison Table

An 8-column data table cannot be meaningfully displayed as a traditional table at 320px. The only CSS-only patterns that work:

**Recommended: Card-stack pattern at mobile (< 768px)**

Each row becomes a stacked card. Use `display: block` on `table`, `thead`, `tr`, `td`. Hide the `thead` visually with `.sr-only` (keep it in the DOM for screen readers). Each `td` gets a `data-label` attribute and a `::before` pseudo-element that renders the column header inline:

```css
@media (max-width: 767px) {
  .comparison-table thead { /* visually hide, keep for a11y */
    position: absolute; width: 1px; height: 1px;
    overflow: hidden; clip: rect(0,0,0,0);
  }
  .comparison-table tr {
    display: block;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
    background: var(--color-surface);
  }
  .comparison-table td {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }
  .comparison-table td::before {
    content: attr(data-label);
    font-weight: var(--weight-medium);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    flex-shrink: 0;
    margin-right: var(--space-3);
  }
  .comparison-table td:last-child { border-bottom: none; }
}
```

This pattern is entirely CSS (the `data-label` attributes are in the HTML, which is static). The competitor/tool name becomes the card heading. Each feature becomes a label-value row inside the card.

**Why not horizontal scroll?** `overflow-x: auto` on a wrapper works technically but is a terrible UX for a comparison table -- users cannot see two rows side by side to compare. It also fails the "can a user actually use this" test that the Helix manifesto demands.

**Why not column hiding?** Hiding columns means the user never sees critical differentiation data on mobile. The whole point of a comparison table is to show everything.

**Desktop (>= 768px):** Standard `<table>` with the existing `.table` class styling. The 8 columns at 1120px container width gives ~140px per column, which is tight but workable because most cells will contain badges (pass/fail/skip) not long text.

### 2. Landing Page Summary vs Full Docs Table

**Landing page: Condensed comparison (3-4 key columns only)**

Do NOT put the full 8-column table on the landing page. Instead, show a curated summary that highlights WRL's strongest differentiators. Proposed approach:

- **Layout**: A styled `<table>` with 4-5 columns max: Tool name, Cryptographic Signing, Independent Timestamps, Public Verification, Standard Format. These are the columns where WRL wins clearly.
- **Rows**: 4-5 competitors max (the most well-known). A "See full comparison" link points to the docs page.
- **Mobile**: Even at 5 columns, the card-stack pattern applies below 768px.
- **CTA**: Below the table, a line like "Full comparison of 9 tools across 7 criteria" linking to docs.

This follows the landing page's existing pattern: the pricing section summarizes two tiers without showing every detail, linking to docs for full information.

**Docs site: Full comparison table**

The docs page gets the complete 8-column, 9+ row table. It lives in the docs site's prose content area (`max-width: 42rem` in `.docs-content`). At that width, even desktop needs `overflow-x: auto` on a wrapper -- 42rem (672px) cannot hold 8 columns comfortably.

**Recommendation for docs:** Override `.docs-content` max-width for the comparison page only, or use a breakout container pattern:

```css
.comparison-table-wrapper {
  max-width: calc(100vw - 240px - 2rem); /* sidebar + padding */
  overflow-x: auto;
  margin: 0 calc(-1 * var(--space-6));
  padding: 0 var(--space-6);
}
```

This lets the table break out of the 42rem prose column while staying within the viewport. On mobile (sidebar collapsed), it becomes `max-width: calc(100vw - 2rem)`.

### 3. Design System Components to Reuse

**Direct reuse (no changes needed):**

| Component | Where | Usage |
|-----------|-------|-------|
| `.badge--pass` | Both | "Yes" / supported features |
| `.badge--fail` | Both | "No" / unsupported features |
| `.badge--skip` | Both | "Partial" / limited support |
| `.table` + `th`/`td` | Both | Base table styling |
| `.card` | Landing | Wrapping feature list items |
| `.sr-only` | Both | Visually hidden table headers on mobile |

**Reuse with extension (landing.css additions):**

| Component | Extension needed |
|-----------|-----------------|
| `.landing-section` | New `landing-section--comparison` not needed; use existing `--white` or `--muted` |
| `.section-header` | Reuse as-is for the comparison section heading |
| `.container` | Reuse as-is |

**Reuse with extension (docs.css additions):**

| Component | Extension needed |
|-----------|-----------------|
| `.docs-prose table` | The docs prose already styles tables (th/td). Add comparison-specific overrides for the wider layout. |

### 4. Feature List Layout

The landing page feature list should use a grid of feature items. Two approaches that match the existing design:

**Recommended: Icon + text grid (reuse `.card` + new `.feature-item`)**

```html
<div class="features-grid">
  <div class="card feature-item">
    <span class="badge badge--pass" aria-hidden="true">...</span>
    <h3>Ed25519 Digital Signatures</h3>
    <p>Every capture is signed...</p>
  </div>
  ...
</div>
```

```css
.features-grid {
  display: grid;
  gap: var(--space-6);
}

.feature-item {
  padding: var(--space-6);
}

.feature-item h3 {
  margin: var(--space-3) 0 var(--space-2);
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
}

.feature-item p {
  margin: 0;
  color: var(--color-text-muted);
  line-height: var(--leading-relaxed);
}

@media (min-width: 768px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 1024px) {
  .features-grid { grid-template-columns: repeat(3, 1fr); }
}
```

This mirrors the existing `.use-cases-grid` pattern (1-col mobile, 2-col tablet, 3-col desktop) but the use-cases grid does 4-col at desktop. For features, 3-col is better because feature descriptions tend to be shorter than use-case descriptions.

**Badge as icon substitute:** Rather than adding SVG icons (which would require new assets and design decisions -- out of scope for frontend-minion), use the existing `.badge` component as a visual anchor. A green `.badge--pass` with a checkmark character or short label like "Core" / "Standard" / "eIDAS" works within the existing system.

### 5. Accessibility

**Table semantics (critical):**

- Use a real `<table>` element, not `div` grids. Screen readers announce row/column relationships automatically with native table markup.
- `<caption>` element for the table's accessible name (can be visually hidden with `.sr-only` if the section header serves that purpose).
- `scope="col"` on all `<th>` elements in the header row.
- `scope="row"` on the first `<td>` (or `<th>`) in each body row (the competitor name).
- `aria-label` on badge elements to convey meaning beyond color: `<span class="badge badge--pass" aria-label="Yes">` or use visible text inside the badge.

**Mobile card-stack pattern:**

- The `thead` is visually hidden but remains in the DOM for screen readers. This means screen readers still get full table semantics even when the visual layout is cards.
- The `data-label` pseudo-elements are decorative from a screen reader perspective (they are in CSS `content`, which some screen readers read and some don't). The actual column association comes from the preserved table markup.

**Color independence:**

- Badges already have text content (not just color). The `--pass`, `--fail`, `--skip` variants use distinct background + text + border -- but the text inside the badge must also differ (e.g., "Yes", "No", "Partial") so the information is not conveyed by color alone.

**Focus management:**

- No special focus management needed for a static comparison table.
- If the landing page summary links to the docs comparison, the docs page anchor should receive focus via `scroll-margin-top` (already set on `.landing-section`).

**Reduced motion:**

- No animations in the comparison table. The existing `prefers-reduced-motion` rule in design-system.css covers any future additions.

### 6. Landing Page Section Placement

Based on the current page structure (Hero > Use Cases > How It Works > Pricing), the new sections should slot in as:

- **Feature list**: After "Use Cases", before "How It Works". It answers "what does WRL include?" after the user has seen "who is it for?"
- **Comparison summary**: After "How It Works", before "Pricing". Once the user understands the mechanism, show them how it stacks up against alternatives before they see pricing.

Both sections get their own `id` attributes and nav links in the site header.

## Proposed Tasks

1. **Landing page: Feature list section** -- Add a new `landing-section` with a features grid using `.card` components. 6-8 feature items with badge, heading, description. Responsive 1/2/3 column grid. Reuse `.card`, `.badge`, `.section-header`. New CSS: `.features-grid`, `.feature-item` in `landing.css`.

2. **Landing page: Comparison summary section** -- Add a condensed comparison table (5 columns, 4-5 rows) as a new `landing-section`. Reuse `.table`, `.badge--pass/fail/skip`. New CSS: mobile card-stack pattern for the comparison table in `landing.css`. Add "See full comparison" link to docs.

3. **Landing page: Navigation update** -- Add nav links for the new sections in the site header. Update the `<nav>` in the header and potentially the footer.

4. **Docs site: Full comparison page** -- Create a new content page (e.g., `site/content/comparison.md` or `.njk`) with the full 8-column, 9+ row table. Add the breakout wrapper CSS for the wider table. New CSS additions in `docs.css`. Add to sidebar navigation.

5. **Docs site: Comparison table responsive CSS** -- Add the card-stack mobile pattern to `docs.css`. This is the most complex CSS task. The `data-label` attributes must be in the HTML template (Nunjucks or Markdown won't generate them automatically -- this will need to be a `.njk` file, not `.md`).

6. **Design system: No changes** -- All needed components already exist. No modifications to `design-system.css`.

## Risks and Concerns

1. **`data-label` in Markdown**: The docs site uses Markdown for content. Markdown tables cannot have `data-label` attributes on `<td>` elements. The comparison page in the docs site **must** be a Nunjucks template (`.njk`), not Markdown. This is consistent with `api-reference.njk` which already uses Nunjucks for structured content.

2. **Docs prose column width**: The docs content area is `max-width: 42rem` (672px). An 8-column table at 672px gives ~84px per column. Even with short badge content, column headers (e.g., "Independent Timestamps") will wrap. The breakout wrapper is necessary, not optional. If the breakout approach feels too invasive, an alternative is to make the full comparison page use a different layout template without the 42rem constraint.

3. **Badge text content**: Current badges in the codebase are empty or have short text. For the comparison table, each badge needs explicit visible text ("Yes", "No", "Partial", "N/A") to be accessible. Do not rely on color alone.

4. **Content decisions are not frontend decisions**: The actual competitor list, which features to highlight, and what the summary vs full table contains are content/strategy decisions. Frontend-minion provides the layout and CSS patterns; the content needs to come from whoever owns the competitive analysis.

5. **Screen reader testing**: The card-stack mobile pattern with visually-hidden `thead` is well-established but should be tested with VoiceOver on iOS Safari. Some mobile screen readers handle `display: block` on table elements differently. If issues arise, fallback to `overflow-x: auto` horizontal scroll with an `aria-label` noting the table scrolls.

## Additional Agents Needed

- **Content/strategy agent**: To define which competitors appear in the table, what features to include, and how to describe each. Frontend can build the containers but needs the actual data.
- **ux-design-minion**: The feature list needs visual anchors (icons or badges). If SVG icons are desired instead of text badges, design needs to provide them. Also, the landing page section ordering (where features and comparison fit in the page flow) is a UX decision that should be validated.
