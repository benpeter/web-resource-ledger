## Domain Plan Contribution: ux-design-minion

### Analysis of Existing Design System

The current `design-system.css` (209 lines, well under the 5 KB ceiling) was built for application UI: data grids, alerts, badges, check lists, code blocks, disclosure widgets. The docs site (`docs.css`, 516 lines) extends it with a documentation layout (sidebar + prose), accessible color overrides (`--color-text-muted-docs`, `--color-link-docs`), and API reference components. Both are tightly scoped to their contexts and follow the rule: page-specific styles belong in the consuming module, not in `design-system.css`.

**What can be reused directly:**

- All color tokens (neutrals, brand, semantic) -- the palette IS the brand
- Typography tokens (font stacks, scale, weights, line heights)
- Spacing scale (`--space-1` through `--space-12`)
- Shape tokens (`--radius-sm/md/lg`)
- `.btn` and `.btn--primary/secondary/ghost` -- CTA buttons
- `.card` -- base card pattern for pricing cards and use-case cards
- `.sr-only` -- screen reader utility
- Accessible color overrides from docs.css: `--color-text-muted-docs` and `--color-link-docs` (these fix WCAG AA failures in the base tokens)
- Skip link pattern from docs.css
- `prefers-reduced-motion` media query

**What is missing for a landing page:**

The type scale tops out at `--text-2xl` (1.5rem / 24px). This is fine for documentation h1s but far too small for a landing page hero headline. A marketing page needs larger display sizes. The spacing scale maxes at `--space-12` (3rem / 48px) -- landing page sections need much more vertical breathing room. There is only one breakpoint (640px). The docs site added 767px for the sidebar collapse, but neither addresses tablet layout or wider desktops where a landing page must look intentional, not just stretched.

### Recommendations

#### 1. CSS Architecture: Separate Landing Page Stylesheet

Create `site/css/landing.css` as a peer to `docs.css`. It imports `design-system.css` tokens but defines its own layout, components, and marketing-specific extensions. This follows the existing pattern (docs.css is the consuming module for documentation; landing.css is the consuming module for marketing) and respects the style guide rule: "Don't embed page-specific styles in design-system.css."

Do NOT add landing-page tokens to `design-system.css`. Instead, define landing-specific custom properties in `landing.css` under `:root` with a clear comment block, the same way docs.css defines `--color-text-muted-docs` and `--color-link-docs`. These are local extensions, not system tokens.

```
site/css/landing.css    -- all landing page styles
site/css/design-system.css  -- symlink or copy of src/design-system.css (existing pattern)
```

#### 2. Landing-Page Token Extensions (in landing.css only)

```css
:root {
  /* Landing-page typography (extends design-system scale) */
  --text-3xl: clamp(1.75rem, 1.5rem + 1.25vw, 2.25rem);
  --text-4xl: clamp(2.25rem, 1.75rem + 2.5vw, 3rem);
  --text-hero: clamp(2.5rem, 2rem + 2.5vw, 3.5rem);

  /* Landing-page spacing (extends design-system scale) */
  --space-16: 4rem;
  --space-20: 5rem;
  --space-24: 6rem;

  /* Landing-page surfaces */
  --color-surface-hero: var(--color-primary);
  --color-surface-alt: var(--color-surface-muted);

  /* Accessible color overrides (same as docs.css -- DRY violation is
     acceptable because landing.css must be self-contained) */
  --color-text-muted-landing: #5a5650;
  --color-link-landing: #2f6a85;
}
```

Key rationale:
- Fluid typography via `clamp()` so hero text scales smoothly from mobile to desktop without breakpoints. The min/max bounds keep text readable at all viewport sizes and pass WCAG SC 1.4.4 (max is less than 2x min).
- Larger spacing tokens for section padding. Landing pages need generous vertical whitespace to separate conceptual blocks -- 48px (the current max) is not enough for full-bleed sections.
- `--color-surface-hero` uses the primary ink-blue for a dark hero section, creating visual contrast with the light page body. This inverts the text color in the hero (white on dark blue) -- the existing `--color-primary-text` (#f8f8fa) on `--color-primary` (#2a3444) achieves approximately 11:1 contrast, well exceeding WCAG AAA.

#### 3. Responsive Breakpoint Strategy

Three breakpoints, mobile-first:

| Breakpoint | Value | Rationale |
|---|---|---|
| Tablet | `768px` | Aligns with docs.css (767px), provides 2-column grids |
| Desktop | `1024px` | 3-column grids for pricing and use cases, wider hero |
| Max-width container | `1120px` | Content cap to prevent line length blowout on wide screens |

Mobile is the base (no media query). This is a content-driven strategy, not device-driven -- the grid layouts for 3-step and 4-use-case sections naturally need these thresholds. At 768px, a 2+1 or 2+2 grid becomes comfortable. At 1024px, 3-across and 4-across grids work.

The `max-width: 1120px` container is critical. Without it, the landing page would stretch to fill ultra-wide monitors, making the hero text uncomfortably long and the pricing cards absurdly wide. Center it with `margin: 0 auto` and add horizontal padding (`--space-6` on mobile, `--space-8` on tablet+).

#### 4. Semantic HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Web Resource Ledger -- Tamper-proof web evidence</title>
  <meta name="description" content="...">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/css/design-system.css">
  <link rel="stylesheet" href="/css/landing.css">
</head>
<body>
  <a class="sr-only skip-link" href="#content">Skip to content</a>

  <!-- h1: Site header with logo -- NOT a heading element, use p or span -->
  <header class="site-header">
    <div class="container">
      <a href="/" class="site-logo" aria-label="Web Resource Ledger home">
        <img src="/assets/logo-w-check.svg" alt="" width="28" height="28" aria-hidden="true">
        <span>Web Resource Ledger</span>
      </a>
      <nav aria-label="Main">
        <a href="#how-it-works">How It Works</a>
        <a href="#use-cases">Use Cases</a>
        <a href="#pricing">Pricing</a>
        <a href="https://docs.webresourceledger.com">Docs</a>
      </nav>
    </div>
  </header>

  <main id="content">

    <!-- Hero: dark bg, h1, tagline, CTA -->
    <section class="hero" aria-labelledby="hero-heading">
      <div class="container">
        <h1 id="hero-heading">...</h1>
        <p>...</p>
        <div class="hero-actions">
          <a href="https://docs.webresourceledger.com" class="btn btn--primary btn--lg">Get Started</a>
          <a href="#how-it-works" class="btn btn--ghost btn--lg btn--inverse">See How It Works</a>
        </div>
      </div>
    </section>

    <!-- How It Works: 3-step indicators -->
    <section id="how-it-works" class="page-section" aria-labelledby="how-heading">
      <div class="container">
        <h2 id="how-heading">How It Works</h2>
        <ol class="steps-grid" role="list">
          <li class="step-card">
            <span class="step-number" aria-hidden="true">1</span>
            <h3>Submit a URL</h3>
            <p>...</p>
          </li>
          <!-- steps 2, 3 -->
        </ol>
      </div>
    </section>

    <!-- Use Cases: 4-card grid -->
    <section id="use-cases" class="page-section page-section--alt" aria-labelledby="cases-heading">
      <div class="container">
        <h2 id="cases-heading">Use Cases</h2>
        <div class="card-grid-4">
          <article class="use-case-card card">
            <h3>...</h3>
            <p>...</p>
          </article>
          <!-- cards 2, 3, 4 -->
        </div>
      </div>
    </section>

    <!-- Pricing: 3 tiers -->
    <section id="pricing" class="page-section" aria-labelledby="pricing-heading">
      <div class="container">
        <h2 id="pricing-heading">Pricing</h2>
        <div class="pricing-grid">
          <article class="pricing-card card">
            <h3>Free</h3>
            <p class="pricing-price">...</p>
            <ul class="pricing-features">...</ul>
            <a href="..." class="btn btn--ghost">...</a>
          </article>
          <!-- Pro (highlighted), Enterprise -->
        </div>
      </div>
    </section>

  </main>

  <footer class="site-footer">
    <div class="container">
      <p>...</p>
      <nav aria-label="Footer">...</nav>
    </div>
  </footer>
</body>
</html>
```

**Accessibility notes for this structure:**

- Single `<h1>` in the hero. Each section gets an `<h2>`. Sub-items get `<h3>`. No skipped levels.
- `aria-labelledby` on each `<section>` ties the landmark to its visible heading.
- The steps use `<ol>` (ordered list) since sequence matters. The step numbers are `aria-hidden="true"` because the list order already conveys the sequence to screen readers.
- Navigation uses an `<a>` anchor list, not a `<ul>` inside `<nav>`. For a short horizontal nav, either works -- the label "Main" distinguishes it from the "Footer" nav.
- Skip link targets `#content` (the `<main>`).
- Logo image is decorative (`aria-hidden="true"`, empty `alt`); the text span provides the accessible name.
- `scroll-behavior: smooth` on `<html>` for anchor links. No JS needed. Respects `prefers-reduced-motion` (see CSS below).

#### 5. Landing-Page-Specific CSS Components

**Site Header (sticky nav)**

```css
.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: var(--space-3) 0;
}
```

Sticky header keeps nav accessible during scrolling. At mobile widths, the nav links should wrap or use a compact layout (flex-wrap). No hamburger menu needed -- with only 4 links, wrapping is simpler and more accessible than a CSS-only toggle.

**Container**

```css
.container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--space-6);
  }
}
```

**Hero Section**

```css
.hero {
  background: var(--color-primary);
  color: var(--color-primary-text);
  padding: var(--space-24) 0 var(--space-20);
  text-align: center;
}

.hero h1 {
  font-size: var(--text-hero);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-4);
  max-width: 20ch; /* constrain line length for readability */
  margin-inline: auto;
}
```

The dark hero using `--color-primary` (#2a3444) with `--color-primary-text` (#f8f8fa) creates a strong brand statement at the top. The rest of the page is light, creating a clear visual break between the hero promise and the detail sections. The `max-width: 20ch` on the h1 prevents hero headlines from running too wide on desktop, keeping them punchy and scannable.

**btn--lg variant** (new size for landing page CTAs)

```css
.btn--lg {
  min-height: 52px;
  padding: var(--space-3) var(--space-8);
  font-size: var(--text-md);
}
```

44px minimum touch target is already met by the base `.btn`. The `--lg` variant gives landing page CTAs more visual weight without dropping below the minimum.

**btn--inverse** (ghost button on dark background)

```css
.btn--inverse {
  color: var(--color-primary-text);
  border-color: rgba(255, 255, 255, 0.4);
}
.btn--inverse:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.6);
}
.btn--inverse:focus-visible {
  outline-color: var(--color-primary-text);
}
```

**Page Sections**

```css
.page-section {
  padding: var(--space-20) 0;
}
.page-section--alt {
  background: var(--color-surface-muted);
}

.page-section h2 {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  text-align: center;
  margin: 0 0 var(--space-12);
  color: var(--color-text);
}
```

Alternating section backgrounds (white / muted) creates visual rhythm without additional borders or decorative elements. This is the simplest way to separate content blocks on a long-scroll landing page.

**Step Indicators (How It Works)**

```css
.steps-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-8);
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: step;
}

@media (min-width: 1024px) {
  .steps-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.step-card {
  text-align: center;
  padding: var(--space-6);
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-primary-text);
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  margin-bottom: var(--space-4);
}
```

Step numbers are circular badges using the brand primary color. At mobile, steps stack vertically (single column). At 1024px, they go 3-across. The intermediate tablet breakpoint (768px) is not used here -- 3 narrow columns at 768px would be too cramped, and 2+1 for exactly 3 items looks orphaned. Stacked-to-3 is cleaner.

**Use Case Cards (4-card grid)**

```css
.card-grid-4 {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
}

@media (min-width: 768px) {
  .card-grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .card-grid-4 {
    grid-template-columns: repeat(4, 1fr);
  }
}

.use-case-card {
  padding: var(--space-6);
}

.use-case-card h3 {
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  margin: 0 0 var(--space-3);
}
```

4 use cases: 1-column mobile, 2x2 tablet, 4-across desktop. The `.card` base class from design-system.css gives the white surface + border + radius. The landing page just adds internal padding and typography.

**Pricing Cards**

```css
.pricing-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-6);
  align-items: start;
}

@media (min-width: 768px) {
  .pricing-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.pricing-card {
  padding: var(--space-6);
  text-align: center;
}

.pricing-card--featured {
  border-color: var(--color-accent);
  border-width: 2px;
  position: relative;
}

.pricing-card--featured::before {
  content: "Most Popular";
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-accent);
  color: var(--color-accent-text);
  padding: var(--space-1) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pricing-price {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  color: var(--color-text);
  margin: var(--space-4) 0;
}

.pricing-features {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-6);
  text-align: left;
}

.pricing-features li {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: var(--text-base);
  color: var(--color-text);
}

.pricing-features li::before {
  content: "";
  display: inline-block;
  width: 1em;
  margin-right: var(--space-2);
  /* Checkmark via CSS -- no icon dependency */
}
```

Pricing cards stack on mobile, go 3-across at tablet (768px -- they are narrow enough to work at this width, unlike step cards). The "featured" card gets an accent border and a "Most Popular" badge via CSS pseudo-element. The `align-items: start` prevents cards from stretching to equal height when content differs, but if the team prefers equal-height, `align-items: stretch` works too.

For the pricing feature checkmarks, use an inline SVG in a CSS `background-image` on the `::before` pseudo-element, or a simple Unicode check character. Avoid icon font dependencies.

**Footer**

```css
.site-footer {
  background: var(--color-primary);
  color: var(--color-primary-text);
  padding: var(--space-12) 0;
}

.site-footer a {
  color: var(--color-primary-text);
  text-underline-offset: 2px;
}
```

Dark footer mirrors the hero, bookending the page with the brand's ink-blue. Creates visual closure. Same contrast pair as hero -- verified accessible.

**Smooth Scrolling with Reduced Motion Respect**

```css
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}
```

This is the correct pattern -- opt INTO smooth scrolling only when the user has NOT expressed a preference for reduced motion. Never apply `scroll-behavior: smooth` unconditionally.

#### 6. Visual Design Decisions

**Marketing vs Documentation distinction:**

The docs site is restrained: 42rem max-width prose, sidebar navigation, small type scale, dense information. The landing page should feel like the same brand (same colors, same font stack, same spacing rhythm) but with more visual breathing room:

- Larger type (hero headline 2.5-3.5rem vs docs h1 at 1.5rem)
- More generous section padding (5-6rem vs docs 2rem)
- Full-width sections with alternating backgrounds (vs docs' single-column)
- Dark hero and footer (vs docs' all-light layout)
- Centered section headings (vs docs' left-aligned)

These differences are marketing conventions, not departures from the brand. The palette, border treatments, card styles, and button shapes remain identical.

**No decorative illustrations or graphics.**

The WRL brand communicates "institutional trust, precision, restraint" (per the style guide). Adding gradient blobs, abstract shapes, or stock illustrations would undercut this. The visual interest comes from:
- The dark-light-dark rhythm (hero / content sections / footer)
- The alternating section backgrounds
- The step number circles
- The featured pricing card accent border
- The logo and typography

This is sufficient. The page should feel closer to Stripe's documentation site or Cloudflare's developer pages than to a typical SaaS landing page with decorative gradients.

**No web fonts.**

The system font stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto...`) means zero font requests, zero FOIT/FOUT, and the best possible performance score. System fonts are also what the docs site uses. Adding a custom font for the landing page alone would create brand inconsistency and hurt Lighthouse performance.

### Proposed Tasks

1. **Create `site/css/landing.css`** -- Landing page stylesheet with all components described above. Imports design-system.css tokens. Contains: landing token extensions, container, site header, hero, page sections, steps grid, card grid, pricing grid, footer, smooth scroll, responsive breakpoints (768px, 1024px). Estimated size: 250-350 lines, well under 10 KB target when combined with design-system.css.

2. **Create `site/landing.html`** (or integrate into 11ty as a page template) -- Semantic HTML with the structure above. Single `<h1>`, proper heading hierarchy, landmark regions, `aria-labelledby` on sections, skip link, decorative image handling. Pure HTML, no JS. Inline the favicon SVG as a data URI (existing pattern).

3. **Create a landing page base layout** -- The docs site uses `layouts/base.njk` which includes the sidebar. The landing page needs its own layout (or can be a standalone HTML file without 11ty, depending on the build pipeline decision). If using 11ty, create `site/_includes/layouts/landing.njk` that loads `design-system.css` + `landing.css` instead of `docs.css`.

4. **Add `btn--lg` and `btn--inverse` variants** -- These go in `landing.css`, not `design-system.css`. They are marketing-specific sizes. If later needed in the app UI, promote them to the design system at that point.

5. **Verify contrast for all text/background combinations** -- Key pairs to verify:
   - `--color-primary-text` on `--color-primary` (hero, footer): ~11:1 -- passes
   - `--color-text` on `--color-surface` (content sections): ~14:1 -- passes
   - `--color-text` on `--color-surface-muted` (alt sections): ~13:1 -- passes
   - `--color-text-muted-landing` on `--color-surface`: needs verification (docs version passes at ~5.2:1)
   - Accent border on pricing featured card against white surface: decorative, not text -- no contrast requirement
   - Step number text (white on primary circle): same as hero -- passes

6. **Test responsive layouts at breakpoints** -- Verify grid behavior at 320px (narrow mobile), 640px (wide mobile), 768px (tablet), 1024px (desktop), 1440px (wide desktop). Specific things to check:
   - Nav links wrapping gracefully at narrow widths
   - Hero headline `clamp()` producing readable sizes at extremes
   - Pricing cards stacking cleanly on mobile
   - No horizontal overflow at any width
   - Touch targets >= 44x44px on all interactive elements

7. **Validate heading hierarchy and landmark structure** -- Before handoff, verify: one `<h1>`, sequential `<h2>`/`<h3>`, no skipped levels; `<header>`, `<main>`, `<footer>` landmarks; `<nav>` with distinct `aria-label` values; all sections with `aria-labelledby`.

### Risks and Concerns

1. **Type scale gap between design system and landing page.** The design system goes up to `--text-2xl` (1.5rem). The landing page needs `--text-hero` at 2.5-3.5rem. This 2x jump could feel disconnected if intermediate sizes are needed elsewhere later. Mitigation: the fluid `clamp()` values bridge the gap smoothly, and the tokens are scoped to `landing.css` so they do not pollute the system scale. If they prove useful beyond landing, promote them to `design-system.css` with a future phase.

2. **CSS-only nav limitations.** With 4 links, wrapping works fine. If more links are added later (pricing, blog, changelog, login, etc.), the header nav will need a mobile toggle. A CSS-only toggle (checkbox hack or `<details>`) is feasible but less accessible than a JS-powered disclosure. Cross that bridge when it comes. For now, 4 links is manageable.

3. **Dark hero/footer contrast edge cases.** The primary text color (#f8f8fa) on primary background (#2a3444) is excellent for body text, but thin font weights (weight-normal / 400) at small sizes on dark backgrounds can appear lighter than expected due to subpixel rendering. Recommendation: use `font-weight: var(--weight-medium)` (600) for body text in the hero, not `--weight-normal`.

4. **Lighthouse performance target (>= 95).** Two CSS files (design-system.css ~3KB + landing.css ~5KB) plus a single HTML file with no JS, no web fonts, and no images (except one inline SVG logo) should score 100 on performance trivially. The bigger risk is the accessibility score (>= 90). Common Lighthouse a11y failures: missing alt text, insufficient contrast, unlabeled form controls (we have none), heading order violations. The semantic structure above addresses all of these, but the actual heading content and any late additions (e.g., decorative images without proper `alt=""`) could introduce issues. Recommendation: run Lighthouse during development, not just at the end.

5. **11ty integration vs standalone HTML.** The docs site uses 11ty with Nunjucks templates. The landing page could be: (a) another 11ty page with a different layout template, or (b) a standalone HTML file served separately. Option (a) keeps the build unified and shares the favicon, CSS, and asset pipeline. Option (b) is simpler but duplicates asset references. I recommend option (a) -- create a `layouts/landing.njk` that omits the sidebar and docs nav, loads landing.css instead of docs.css, but shares the base `<head>` pattern (charset, viewport, favicon).

6. **`scroll-behavior: smooth` and anchor offset.** When using `scroll-behavior: smooth` with a sticky header, anchor targets will scroll behind the header. Fix with `scroll-margin-top` on section elements equal to the header height plus some padding. Estimate header height at ~56px, so `scroll-margin-top: 5rem` (80px) gives comfortable clearance. This is a pure CSS solution -- no JS needed.

### Additional Agents Needed

None expected. The landing page is a pure HTML/CSS deliverable within the existing design system. The frontend-minion handles implementation. The accessibility-minion should audit the final output for WCAG compliance (Lighthouse a11y score verification), but no additional specialist planning input is needed at this stage.
