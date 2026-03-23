# Domain Plan Contribution: frontend-minion

## Recommendations

### 1. Page File Structure: Flat `.html` files, not directories

Use flat files at the root of `landing/public/`:

```
landing/public/
  index.html
  privacy.html
  refund-policy.html
  terms.html
  content-policy.html
  404.html
  robots.txt
  sitemap.xml
  css/
  assets/
```

**Why flat files, not `privacy/index.html` directories:**

Cloudflare Workers Static Assets uses `auto-trailing-slash` as the default
`html_handling` mode. Under this mode:

- A flat file `privacy.html` is served at the canonical URL `/privacy` (no
  trailing slash). Requests to `/privacy.html` and `/privacy/` both 307-redirect
  to `/privacy`.
- A directory file `privacy/index.html` is served at `/privacy/` (with trailing
  slash). Requests to `/privacy` 307-redirect to `/privacy/`.

Flat files produce cleaner canonical URLs (`/privacy` vs `/privacy/`) and avoid
the extra redirect when users type the path without a trailing slash. They also
keep the file structure simpler -- no nested directories for single files.

The existing `index.html` and `404.html` already follow the flat-file pattern.

**Resulting clean URLs:**
- `webresourceledger.com/privacy`
- `webresourceledger.com/refund-policy`
- `webresourceledger.com/terms`
- `webresourceledger.com/content-policy`

### 2. Prose Content Layout: New section in `landing.css`, not a separate file

Legal pages need a prose/article layout that the current CSS does not provide.
The landing page has cards, grids, and hero sections -- none of which suit
long-form text with headings, paragraphs, ordered/unordered lists, and
definition lists.

**Add an "article" section to `landing.css`** (approximately section 15, after
the responsive adjustments). Do not create a separate CSS file -- the total
addition is roughly 60-80 lines of CSS, and a separate file means an extra
HTTP request for pages that already load `landing.css`.

**Required article styles:**

```css
/* Article / prose layout for legal pages */
.article {
  max-width: 72ch;        /* optimal reading width */
  margin: 0 auto;
  padding: var(--space-16) 0;
}

.article h1 {
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  line-height: var(--leading-tight);
  letter-spacing: -0.02em;
  margin: 0 0 var(--space-4);
  color: var(--color-text);
}

.article .article__meta {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  margin: 0 0 var(--space-12);
}

.article h2 {
  font-size: var(--text-2xl);
  font-weight: var(--weight-bold);
  margin: var(--space-12) 0 var(--space-4);
  color: var(--color-text);
}

.article h3 {
  font-size: var(--text-xl);
  font-weight: var(--weight-bold);
  margin: var(--space-8) 0 var(--space-3);
  color: var(--color-text);
}

.article p {
  margin: 0 0 var(--space-4);
  line-height: var(--leading-relaxed);
  color: var(--color-text);
}

.article ul, .article ol {
  margin: 0 0 var(--space-4);
  padding-left: var(--space-6);
  line-height: var(--leading-relaxed);
}

.article li {
  margin-bottom: var(--space-2);
}

.article a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.article a:hover {
  color: var(--color-accent-hover);
}

.article a:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

**Key design decisions:**
- `max-width: 72ch` for comfortable reading (65-75ch is the typographic sweet
  spot). The existing `container` class provides the outer padding; the article
  class constrains the text column within it.
- Use existing design tokens throughout -- no hardcoded values.
- The `article__meta` class handles the "Last updated: ..." line beneath the
  title, which is standard for legal pages and important for Stripe reviewers.
- Link styling uses `--color-accent` to distinguish from body text while staying
  within the design system.
- Add a responsive override at the mobile breakpoint to reduce vertical spacing.

### 3. Shared Header/Footer: Copy-paste is acceptable for 6 pages

With 6 total pages (index, 404, privacy, refund-policy, terms, content-policy)
and zero build tools, copy-paste of the header/footer markup is the right call.

**Why this is fine:**
- The header is 15 lines of HTML. The footer (even after restructuring) will be
  roughly 30 lines. That is a manageable amount of duplication across 6 files.
- The header/footer structure changes rarely -- the last change was adding the
  Sign In button.
- Introducing a build step (SSG, includes, web components) to deduplicate 45
  lines across 6 files would violate YAGNI and the project's "lean and mean"
  philosophy.
- The 404.html already demonstrates this copy-paste pattern is established.

**Mitigation for maintenance:**
- Add an HTML comment at the top of each header/footer block:
  `<!-- Shared header: update in all pages (index, 404, privacy, refund-policy, terms, content-policy) -->`
- This is a grep-friendly marker for future bulk updates.

**Header adjustments for legal pages:**
- On index.html, the nav links point to `#how-it-works`, `#use-cases`, `#pricing`
  (same-page anchors).
- On legal pages, these must become `/#how-it-works`, `/#use-cases`, `/#pricing`
  (absolute paths with fragment).
- The 404.html already uses this pattern (`/#how-it-works`), confirming the
  convention.

### 4. Footer Restructuring: Two `<nav>` elements with semantic grouping

**Proposed footer markup:**

```html
<footer class="site-footer" role="contentinfo">
  <div class="container">
    <div class="site-footer__inner">
      <div>
        <div class="site-footer__brand">
          <img src="/assets/logo-w-check-light.svg" width="28" height="28" alt="" aria-hidden="true">
          <span class="site-footer__wordmark">Web Resource Ledger</span>
        </div>
        <p class="site-footer__tagline">Open source under Apache 2.0. Independently verifiable by design.</p>
      </div>

      <div class="site-footer__links">
        <nav aria-label="Product">
          <h4 class="site-footer__heading">Product</h4>
          <a href="https://docs.webresourceledger.com">Docs</a>
          <a href="https://api.webresourceledger.com/ui">Web UI</a>
          <a href="https://docs.webresourceledger.com/api-reference/">API Reference</a>
          <a href="https://github.com/benpeter/web-resource-ledger">GitHub</a>
        </nav>
        <nav aria-label="Legal">
          <h4 class="site-footer__heading">Legal</h4>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/refund-policy">Refund Policy</a>
          <a href="/content-policy">Content Policy</a>
        </nav>
      </div>
    </div>

    <div class="site-footer__bottom">
      <p class="site-footer__operator">Gerhard Benjamin Peter &middot; Weidenh&auml;user Str. 73, 35037 Marburg &middot; <a href="mailto:bp@ben-peter.com">bp@ben-peter.com</a></p>
      <p>&copy; 2026 Web Resource Ledger</p>
    </div>
  </div>
</footer>
```

**Key decisions:**

1. **Two separate `<nav>` elements** with distinct `aria-label` values ("Product"
   and "Legal"). Screen readers announce each nav region by label, making it easy
   for users to jump to the right section. This is better than one `<nav>` with
   all links.

2. **`<h4>` headings** within each nav ("Product", "Legal"). These are visually
   styled as small uppercase labels. Using a heading element (rather than a
   `<span>`) means screen reader users can navigate by headings to find these
   sections. `<h4>` is appropriate since the footer lives outside `<main>` and
   these are subsections of the footer content.

3. **Legal links now point to on-site pages** (`/terms`, `/privacy`, etc.)
   instead of GitHub markdown files. This is a critical change -- Stripe
   reviewers expect these pages on the business domain.

4. **Operator identity in `site-footer__bottom`**, separated from the nav links.
   This is informational, not navigational -- it sits below the border-top
   divider alongside the copyright notice. HTML entities (`&middot;`,
   `&auml;`) ensure the German characters render correctly regardless of
   encoding edge cases.

5. **The `mailto:` link** provides a direct contact mechanism -- important for
   Stripe's "business contact information" requirement.

**CSS additions for footer restructuring:**

```css
.site-footer__links {
  display: flex;
  gap: var(--space-12);
}

.site-footer__heading {
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(248, 248, 250, 0.5);
  margin: 0 0 var(--space-3);
}

.site-footer nav {
  display: flex;
  flex-direction: column;   /* Change from row to column within each nav */
  gap: var(--space-1);
}

.site-footer__operator {
  font-size: var(--text-sm);
  color: rgba(248, 248, 250, 0.6);
  margin: 0 0 var(--space-2);
}

.site-footer__operator a {
  color: rgba(248, 248, 250, 0.7);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.site-footer__operator a:hover {
  color: var(--color-primary-text);
}
```

**Responsive behavior:**
- On mobile (`max-width: 767px`), the `site-footer__links` should stack
  vertically: `flex-direction: column; gap: var(--space-8);`
- The `site-footer__inner` already handles column-to-row layout via the
  existing media query.

### 5. Meta Tags: Minimal but correct

Each legal page needs:

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{Page Title} -- Web Resource Ledger</title>
<meta name="description" content="{1-2 sentence description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://webresourceledger.com/{path}">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<link rel="stylesheet" href="/css/design-system.css">
<link rel="stylesheet" href="/css/landing.css">
```

**Specific page meta:**

| Page | `<title>` | `<meta name="description">` |
|------|-----------|----------------------------|
| `/privacy` | Privacy Policy -- Web Resource Ledger | How Web Resource Ledger collects, uses, and protects your data. |
| `/terms` | Terms of Service -- Web Resource Ledger | Terms governing use of the Web Resource Ledger API and services. |
| `/refund-policy` | Refund Policy -- Web Resource Ledger | Refund and cancellation policy for Web Resource Ledger paid plans. |
| `/content-policy` | Content Policy -- Web Resource Ledger | Acceptable use policy for content captured through Web Resource Ledger. |

**What to skip:**
- **Open Graph / Twitter Cards**: Not needed on legal pages. These pages are
  not shareable marketing content. Adding OG tags would be harmless but is
  unnecessary work with no benefit.
- **JSON-LD structured data**: Not applicable to legal pages.
- **`robots` meta tag**: Include `index, follow` as on the homepage. Legal
  pages should be indexable -- Stripe reviewers may check that these URLs are
  publicly accessible and not blocked.

### 6. Sitemap: Add all 4 pages with low priority

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://webresourceledger.com/</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://webresourceledger.com/terms</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://webresourceledger.com/privacy</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://webresourceledger.com/refund-policy</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://webresourceledger.com/content-policy</loc>
    <lastmod>2026-03-23</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

- **`changefreq: yearly`** -- legal pages change infrequently.
- **`priority: 0.3`** -- these are support pages, not landing pages. Lower
  priority signals to crawlers that the homepage is the primary content.
- **`lastmod`** should reflect the actual deployment date of these pages.

## Proposed Tasks

### Task 1: Add article/prose CSS to `landing.css`

Add the `.article` styles (described in Recommendation 2) to `landing.css`.
This must happen first since all 4 pages depend on it.

Estimated addition: ~80 lines of CSS.

### Task 2: Restructure footer markup and CSS

1. Update the footer CSS in `landing.css` to support the two-column nav layout
   with headings, operator identity line, and responsive behavior.
2. Update the footer HTML in `index.html` to the new structure.
3. Update the footer HTML in `404.html` to the new structure (it currently has
   a simpler footer -- it should get the full footer to match).

### Task 3: Create the 4 legal page HTML files

Create `privacy.html`, `terms.html`, `refund-policy.html`, and
`content-policy.html` in `landing/public/`.

Each file follows this template:
- Standard `<head>` with page-specific meta tags
- Skip link
- Site header (with `/#` prefixed anchor links)
- `<main id="content">` containing:
  - `<div class="container"><article class="article">` wrapping the prose
  - `<h1>` with page title
  - `<p class="article__meta">` with "Last updated: {date}" and/or
    "Effective: {date}"
  - Prose content in semantic HTML (`<h2>`, `<h3>`, `<p>`, `<ul>`, `<ol>`)
- Site footer (new structure)

**Note:** The actual legal prose content is NOT a frontend concern -- it should
be provided by whoever is drafting the legal text. The frontend task is to
create the page shells with placeholder sections that match the final heading
structure.

### Task 4: Update `sitemap.xml`

Add the 4 new URLs as specified in Recommendation 6. Also update the `lastmod`
on the homepage entry since the footer is changing.

### Task 5: Update header nav links on `index.html` (if needed)

Evaluate whether the homepage header needs any changes. Currently, the anchor
links (`#how-it-works`, etc.) work fine on the homepage itself. No changes
needed to `index.html`'s header nav -- the `/#` prefix is only needed on
sub-pages.

### Task 6: Cross-page verification

After all pages are created:
- Verify every internal link works (footer links from each page, header links)
- Verify `robots.txt` still references the correct sitemap
- Check that the CSP noted in `wrangler.toml` still applies (it should --
  `style-src 'self'` and `script-src 'none'` are compatible with these pages)

## Risks and Concerns

### Risk 1: Content Security Policy compatibility

The `wrangler.toml` documents a desired CSP with `script-src 'none'`. The legal
pages have no JavaScript, so this is fine. However, verify that the CSP is
actually being applied via Cloudflare Transform Rules (the `wrangler.toml`
comment says it must be configured at the dashboard level). If it is not yet
active, this is a pre-existing gap, not a new risk.

### Risk 2: Legal prose content authorship

The frontend implementation can proceed with placeholder content, but the actual
legal text must be reviewed and finalized. The page structure (heading hierarchy,
list formatting) depends on the content structure. If the legal content is
provided as plain text, it will need to be converted to semantic HTML. Coordinate
with whoever is drafting the legal content to ensure the heading structure is
agreed upon before building the pages.

### Risk 3: Footer duplication across 6 files

The restructured footer is more complex than the current one (~30 lines vs ~20).
Any future footer change requires updating 6 files. This is manageable now but
would become painful at 10+ pages. If the site grows beyond legal pages, that
would be the point to consider a minimal build step or server-side includes.
For now, the HTML comment marker (`<!-- Shared footer: update in all pages -->`)
is sufficient.

### Risk 4: German characters in operator identity

The operator address contains `ae` (Weidenhaeuser). Using HTML entities
(`&auml;`) is safer than relying on UTF-8 encoding alone, even though the page
declares `charset="UTF-8"`. This guards against any intermediate processing that
might mangle the encoding. The `&middot;` separator is also an entity for the
same reason.

### Risk 5: Existing footer links point to GitHub

The current footer links for "Terms" and "Content Policy" point to GitHub
markdown files (`github.com/benpeter/web-resource-ledger/blob/main/TERMS.md`
and `CONTENT-POLICY.md`). After this change, they will point to on-site pages.
The GitHub markdown files should be kept but updated to note that the canonical
versions are on the website. This is a coordination item, not a frontend task.

### Risk 6: 404.html footer needs updating too

The `404.html` has a simpler footer (only Docs and GitHub links, no brand
tagline differences, uses inline SVG instead of the `<img>` tag). It must be
updated to match the new footer structure. This is easy to overlook -- include
it explicitly in the implementation task.

## Additional Agents Needed

### Legal content author (not an agent -- human decision)

The prose content for privacy policy, terms of service, refund policy, and
content policy must be authored or approved by someone with legal authority.
The frontend minion can structure placeholder headings based on typical SaaS
legal pages, but the actual text is not a frontend deliverable.

### No additional technical agents needed

- **Security minion**: Already consulted in parallel. CSP and header
  considerations are covered.
- **Sitespeed minion**: Not needed. These are lightweight HTML pages with no
  JavaScript, no images, and minimal CSS. Performance is inherently good.
- **API design minion**: Not involved. These are static pages with no API
  interaction.
- **UX design minion**: Not needed for legal pages. The design system tokens
  and existing visual language provide sufficient guidance. Legal pages are
  commodity content -- clean typography and readable layout are all that is
  required.
