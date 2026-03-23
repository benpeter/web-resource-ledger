---
reviewer: code-review-minion
phase: stripe-legal-pages
verdict: APPROVE
---

# Code Review: Stripe Legal Pages

VERDICT: APPROVE

## Summary

Four new legal pages (privacy, terms, refund-policy, content-policy), CSS prose
layout additions, footer restructuring, and sitemap update. The work is clean,
consistent, and correct. All findings below are nits -- nothing blocking.

---

## FINDINGS

### HTML Validity and Semantics

- **Nit (privacy.html:37)**: `<article class="article">` wraps the entire legal
  document. `<article>` is semantically appropriate for self-contained content,
  but the class name `article` shadows the element name, which is a minor
  readability oddity. No functional issue.

- **Nit (all legal pages)**: The `<h4>` elements inside `<nav>` in the footer
  (`<h4 class="site-footer__heading">`) are valid per spec (nav can contain
  headings), but screen readers will announce these as heading level 4 out of
  nowhere in the document heading hierarchy. These are presentational labels,
  not structural headings. `<p>` or `<span>` with `role="presentation"` would
  avoid polluting the heading outline. Low severity -- navigating by headings
  will show spurious "Product" and "Legal" h4 entries. Consistent across all
  pages, so at least it is uniform.

- **Pass**: All pages have `<!DOCTYPE html>`, `lang="en"`, `charset`, `viewport`.

- **Pass**: Landmark roles (`role="banner"`, `role="contentinfo"`) are present
  on header and footer throughout. Redundant with implicit ARIA roles for
  `<header>` and `<footer>` but harmless.

- **Pass**: `<main id="content">` present on all pages including 404.

- **Pass**: Heading hierarchy is correct on all legal pages (h1 -> h2 -> h3,
  no skipped levels).

### Skip Link

- **Nit (all pages)**: The skip link uses `class="sr-only skip-link"`. The
  `.sr-only` class (from design-system.css) uses `clip: rect(0,0,0,0)` and
  `position: absolute`. The `.skip-link:focus` rule in landing.css uses
  `position: fixed` and `clip: auto`. This requires both classes to be present
  for the focus state to override the sr-only state -- which they are. However,
  specificity depends on source order. `design-system.css` is loaded before
  `landing.css`, so `.skip-link:focus` in landing.css wins as expected. Works
  correctly, but the coupling between two classes from two files is fragile if
  load order ever changes.

### CSS Correctness and Token Usage

- **Pass**: All CSS custom properties used in the new `.article` block
  (`--text-2xl`, `--text-3xl`, `--color-accent`, `--color-accent-hover`,
  `--color-border-subtle`, `--space-16`, etc.) are defined in either
  design-system.css or landing.css. No undefined token references.

- **Pass**: The `--space-20` token is declared in landing.css (line 17) but
  never used. Not a bug -- unused CSS variables are inert.

- **Nit (landing.css:103-104)**: `rgba(248, 248, 250, 0.4)` and similar raw
  rgba values are used in `.btn--inverse` rather than a token. The primary-text
  color (#f8f8fa) is tokenized as `--color-primary-text`, so `rgba(248, 248,
  250, 0.4)` is `--color-primary-text` at 40% opacity. This pattern repeats
  several times in the footer. Not wrong, but if the brand color changes the
  raw values will drift. Noted for a future cleanup pass -- not worth blocking.

- **Pass**: The responsive mobile rule correctly adjusts `.article` padding and
  `h2` margin-top. The footer `flex-direction: column` for mobile and
  `flex-direction: row` for tablet+ are both implemented.

### Cross-Page Consistency

- **Pass**: All six pages (index, 404, privacy, terms, refund-policy,
  content-policy) use identical header and footer markup. Header comment
  accurately lists all pages in the update reminder.

- **Nit (index.html vs legal pages -- nav anchor paths)**: On index.html, the
  nav links use fragment-only hrefs (`#how-it-works`, `#use-cases`, `#pricing`).
  On all other pages they correctly use `/#how-it-works`, etc. This is correct
  behavior -- the difference is intentional and appropriate.

- **Pass**: Footer legal nav links are identical across all pages: /terms,
  /privacy, /refund-policy, /content-policy. All four targets now exist.

### Link Correctness

- **Pass**: Internal cross-references between documents are correct:
  - terms.html links to `/content-policy` (line 96): target exists.
  - refund-policy.html links to `/privacy` (line 74): target exists.

- **Pass**: All canonical URLs match their file paths:
  - privacy.html -> `https://webresourceledger.com/privacy`
  - terms.html -> `https://webresourceledger.com/terms`
  - refund-policy.html -> `https://webresourceledger.com/refund-policy`
  - content-policy.html -> `https://webresourceledger.com/content-policy`

- **Pass**: Sitemap includes all four new legal pages with appropriate priority
  (0.3) and changefreq (yearly). lastmod dates match current date (2026-03-23).

- **Nit (sitemap.xml)**: terms.html effective date is 2026-03-16 but sitemap
  lastmod is 2026-03-23. This is a minor inaccuracy -- the sitemap lastmod
  represents when the file was added to the sitemap, not when the content was
  last substantively changed. Crawlers accept this. Not worth fixing.

### Accessibility

- **Pass**: Images in header and footer use `alt=""` with `aria-hidden="true"`.
  Correct pattern for decorative images.

- **Pass**: Logo `<a>` has `aria-label="Web Resource Ledger home"`, providing
  context beyond the decorative image.

- **Pass**: `<nav>` elements have distinct `aria-label` attributes ("Main",
  "Product", "Legal"), which prevents landmark confusion for screen reader users.

- **Pass**: Focus styles are present on nav links (`:focus-visible` with
  `outline: 2px solid var(--color-primary)`), article links (same), and
  skip link (fixed, visible state on focus). Focus is not suppressed anywhere.

- **Pass**: Tables in privacy.html have `<thead>` and `<tbody>` with `<th>`
  elements for column headers. No `scope` attribute, but for simple two- or
  four-column tables with clear column headers this is acceptable.

- **Nit (privacy.html)**: The GDPR rights list uses nested `<strong>` inside
  `<li>` for the right name before the em dash. Assistive technology reads
  this correctly. No issue.

### No Hardcoded Values Where Tokens Should Be Used

- The only hardcoded color values are the rgba opacity variants in the footer
  and hero dark-background contexts (e.g., `rgba(248, 248, 250, 0.85)`). These
  represent intentional alpha variations of `--color-primary-text` that CSS
  custom properties cannot express natively without `color-mix()` (not yet in
  the project's compatibility target). The pattern is consistent and intentional.
  Noted as a nit above, not a defect.

---

## Summary of Nits (non-blocking)

1. `<h4>` in footer nav pollutes heading outline -- consider `<p>` or `<span>`.
2. Skip-link coupling across two CSS files is load-order-sensitive (currently correct).
3. Raw rgba values are used where a token with opacity would be cleaner.
4. `--space-20` declared but never used (inert).
5. Sitemap lastmod date for terms.html doesn't match the document's effective date.

None of these require changes before merge.
