# Domain Plan Contribution: frontend-minion

## Recommendations

### 1. Docs Site Template Changes (Eleventy Data Cascade)

**Use frontmatter per page + computed data fallbacks.** Here is the rationale:

- Every docs page already has `title` and `description` in frontmatter (confirmed: `index.md`, `authentication.md`, `compare.njk` all follow this pattern). This is the right place for per-page SEO content -- it keeps metadata co-located with content.
- Add optional frontmatter fields: `ogImage`, `canonicalUrl`, `noindex`. These default to sensible values in a computed data file or directly in the template with Nunjucks conditionals.
- **Do NOT use a separate computed data file** (e.g., `eleventyComputed.js`) for this. The logic is simple enough to handle with Nunjucks defaults in the template: `{{ ogImage or '/assets/og-default.png' }}`. Adding a computed data layer adds indirection for no benefit.

**Structured data: separate Nunjucks partial, not inline in base.njk.**

- Create `site/_includes/partials/json-ld.njk` containing the Organization JSON-LD block (static, same on every page).
- `base.njk` includes it with `{% include "partials/json-ld.njk" %}`.
- This keeps `base.njk` focused on page structure and avoids it growing into a 150-line file with multiple inline `<script type="application/ld+json">` blocks.
- Page-specific structured data (e.g., FAQ on the getting-started page) should be added via a `jsonld` frontmatter block or a per-page partial included conditionally.

**OG and Twitter Card tags: add directly to `base.njk` `<head>`.**

These are 6-8 `<meta>` tags that vary by page title/description -- simple enough to live in the base template with Nunjucks variable interpolation. No partial needed.

Template additions to `base.njk <head>`:
```html
<link rel="canonical" href="{{ site.docsUrl }}{{ page.url }}">
<meta property="og:type" content="article">
<meta property="og:url" content="{{ site.docsUrl }}{{ page.url }}">
<meta property="og:title" content="{{ title }} -- {{ site.title }}">
<meta property="og:description" content="{{ description or site.description }}">
<meta property="og:site_name" content="{{ site.title }}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{{ title }} -- {{ site.title }}">
<meta name="twitter:description" content="{{ description or site.description }}">
```

Note: `site.js` needs a `docsUrl` field (`https://docs.webresourceledger.com`) separate from the existing `baseUrl` which points to the landing page domain.

### 2. Docs Site Sitemap and robots.txt

**Sitemap: use an Eleventy template, not a plugin.**

- The docs site has ~17 pages. A Nunjucks template (`site/content/sitemap.njk`) that iterates `collections.all` is simpler and more transparent than adding a plugin dependency. The template is ~15 lines, easily auditable, and produces a valid sitemap.xml.
- Set `permalink: /sitemap.xml` and `eleventyExcludeFromCollections: true` in the sitemap template frontmatter.
- Filter out pages that shouldn't be in the sitemap (e.g., the sitemap itself) by checking for a `noindex` frontmatter flag.

Example template approach:
```njk
---
permalink: /sitemap.xml
eleventyExcludeFromCollections: true
---
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{%- for page in collections.all %}
{%- if not page.data.noindex %}
  <url>
    <loc>{{ site.docsUrl }}{{ page.url }}</loc>
  </url>
{%- endif %}
{%- endfor %}
</urlset>
```

**robots.txt: static passthrough file.**

- Create `site/content/robots.txt` with `permalink: /robots.txt` in frontmatter (or as a plain file in the passthrough copy path).
- Content: `User-agent: *\nAllow: /\nSitemap: https://docs.webresourceledger.com/sitemap.xml`
- A template is overkill for a 3-line file. A static file with passthrough copy is cleaner.

### 3. Landing Page Modifications

**Current state is already solid.** The landing page has:
- Good `<title>`, `<meta description>`, canonical URL, robots meta
- OG and Twitter Card tags
- Organization and SoftwareApplication JSON-LD blocks
- Semantic HTML with proper heading hierarchy, ARIA labels, skip link

**What needs changing:**

1. **Refactor `SoftwareApplication` to `Product` type.** The seo-minion should decide the exact schema type, but from a template perspective the existing inline `<script type="application/ld+json">` blocks are the right approach for a static HTML file. No build system means no partials -- keep them inline.

2. **Add FAQ JSON-LD.** This requires a visible FAQ section in the HTML (Google requires FAQ structured data to match visible page content). Add an FAQ `<section>` between the comparison table and pricing sections. The JSON-LD block goes in `<head>` alongside the existing ones.

3. **Add HowTo JSON-LD.** The "How It Works" section already has the right content structure (3 ordered steps). Add a corresponding HowTo JSON-LD block in `<head>`.

4. **Create `landing/public/llms.txt`.** New static file. Plain text, machine-readable product summary. This is a passthrough static file -- no build step needed.

5. **Update `landing/public/sitemap.xml`.** Already exists with 5 URLs. Add any new pages if FAQ becomes a separate page (unlikely -- it should be a section on the landing page).

**No concerns about existing structured data needing major refactoring.** The Organization block is clean. The SoftwareApplication block may need type adjustment but the content is accurate.

### 4. File Ownership (Complete File List)

**Docs site -- files to CREATE:**

| File | Purpose |
|------|---------|
| `site/_includes/partials/json-ld.njk` | Organization JSON-LD partial |
| `site/content/sitemap.njk` | Sitemap template |
| `site/content/robots.txt` | robots.txt (passthrough or permalink) |

**Docs site -- files to MODIFY:**

| File | Changes |
|------|---------|
| `site/_includes/layouts/base.njk` | Add canonical URL, OG tags, Twitter Card tags, `{% include "partials/json-ld.njk" %}` |
| `site/_data/site.js` | Add `docsUrl`, `description` (site-level default description) |
| `site/content/*.md` and `*.njk` (all 17 pages) | Verify/update `description` frontmatter for SEO optimization |
| `site/eleventy.config.js` | Add passthrough for robots.txt if using static file approach |

**Landing page -- files to CREATE:**

| File | Purpose |
|------|---------|
| `landing/public/llms.txt` | LLM-readable product summary |

**Landing page -- files to MODIFY:**

| File | Changes |
|------|---------|
| `landing/public/index.html` | Add FAQ section + FAQ JSON-LD, add HowTo JSON-LD, potentially refactor SoftwareApplication to Product, review/optimize title and meta description |
| `landing/public/sitemap.xml` | Update lastmod dates, potentially add entries |
| `landing/public/robots.txt` | Already exists and is correct. No changes unless adding llms.txt reference |
| `landing/public/terms.html` | Add meta description if missing |
| `landing/public/privacy.html` | Add meta description if missing |
| `landing/public/refund-policy.html` | Add meta description if missing |
| `landing/public/content-policy.html` | Add meta description if missing |
| `landing/public/security.html` | Add meta description if missing |
| `landing/public/404.html` | Add noindex meta tag if missing |

**Ownership boundaries for task splitting:**

- **Task A (Docs site template infrastructure):** `base.njk`, `site.js`, `json-ld.njk`, `sitemap.njk`, `robots.txt`, `eleventy.config.js`
- **Task B (Docs site content metadata):** All 17 content pages' frontmatter (title/description optimization)
- **Task C (Landing page structured data + FAQ):** `index.html` (JSON-LD blocks, FAQ section)
- **Task D (Landing page secondary pages):** `terms.html`, `privacy.html`, `refund-policy.html`, `content-policy.html`, `security.html`, `404.html`
- **Task E (GEO artifacts):** `llms.txt`

Tasks A and C are the heavy ones. Tasks B, D, and E are straightforward content tasks.

### 5. Validation Approach

**Manual validation (post-implementation, pre-merge):**

1. **Google Rich Results Test** (https://search.google.com/test/rich-results) -- paste the deployed preview URL to validate FAQ, HowTo, Organization, Product structured data. Works with Cloudflare Pages preview URLs.
2. **Schema.org Validator** (https://validator.schema.org/) -- validates JSON-LD syntax and property correctness.
3. **Lighthouse SEO audit** -- run via Chrome DevTools or `npx lighthouse <url> --only-categories=seo`. Target 95+.
4. **Meta tag preview** -- use https://metatags.io/ or similar to check OG/Twitter card rendering.

**Automatable in CI:**

- **Structured data syntax validation:** A small script that extracts `<script type="application/ld+json">` blocks from built HTML and validates them as valid JSON. This catches syntax errors (trailing commas, unescaped characters). Can run in CI after Eleventy build.
- **Lighthouse CI:** `@lhci/cli` can run Lighthouse in CI and assert scores. Add to the docs site build pipeline. The landing page (static HTML) can also be served locally and tested.
- **HTML validation:** `html-validate` or `vnu-jar` (W3C validator) catches missing required attributes, invalid meta tag placement, etc.
- **Link checking:** Verify all canonical URLs, OG URLs, and sitemap URLs resolve. `linkinator` or a simple curl-based script.

**What NOT to automate:** Google Rich Results Test requires Google's rendering engine -- no local equivalent provides the same fidelity. Schema.org validation can be approximated locally but Google's interpretation of "eligible for rich results" is a black box. Keep these as manual pre-merge checks.

**Recommended CI addition:**
```yaml
# In docs site build pipeline
- name: Validate structured data
  run: |
    node -e "
      const fs = require('fs');
      const glob = require('glob');
      const files = glob.sync('site/_output/**/*.html');
      for (const f of files) {
        const html = fs.readFileSync(f, 'utf8');
        const matches = html.matchAll(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/g);
        for (const m of matches) {
          try { JSON.parse(m[1]); }
          catch (e) { console.error(f, e.message); process.exit(1); }
        }
      }
    "
```

## Proposed Tasks

### Task 1: Docs Site Template Infrastructure
**What:** Modify `base.njk` to add canonical URL, OG tags, Twitter Card tags. Create `json-ld.njk` partial with Organization JSON-LD. Update `site.js` with `docsUrl` and `description` fields.
**Deliverables:** Modified `base.njk`, new `_includes/partials/json-ld.njk`, modified `site.js`
**Dependencies:** seo-minion provides the Organization JSON-LD spec and recommended OG tag values. No code dependencies.

### Task 2: Docs Site Sitemap + robots.txt
**What:** Create `sitemap.njk` template and `robots.txt` static file. Update `eleventy.config.js` if needed for passthrough.
**Deliverables:** New `sitemap.njk`, new `robots.txt`, potentially modified `eleventy.config.js`
**Dependencies:** None. Can run in parallel with Task 1.

### Task 3: Docs Site Content Metadata
**What:** Review and optimize `title` and `description` frontmatter across all 17 content pages for keyword relevance and uniqueness.
**Deliverables:** Modified frontmatter in all `site/content/*.md` and `*.njk` files.
**Dependencies:** seo-minion provides keyword-optimized titles and descriptions. Task 1 must be complete so the template consumes these values.

### Task 4: Landing Page Structured Data + FAQ
**What:** Add FAQ HTML section to `index.html`. Add FAQ and HowTo JSON-LD blocks. Review/refactor existing SoftwareApplication JSON-LD. Add OG image meta tag if an image is available.
**Deliverables:** Modified `index.html`
**Dependencies:** seo-minion provides FAQ content, HowTo structured data spec, and Product/SoftwareApplication schema decision.

### Task 5: Landing Page Secondary Pages
**What:** Add/verify meta description, OG tags, and canonical URLs on terms, privacy, refund-policy, content-policy, security, and 404 pages.
**Deliverables:** Modified HTML files for each secondary page.
**Dependencies:** seo-minion provides meta descriptions. Can run in parallel with Task 4.

### Task 6: llms.txt
**What:** Create `landing/public/llms.txt` with machine-readable product summary following the llms.txt convention.
**Deliverables:** New `llms.txt` file.
**Dependencies:** seo-minion provides the content spec. No code dependencies.

### Task 7: Validation + CI
**What:** Run Lighthouse SEO audit on both sites. Validate structured data with Schema.org validator and Google Rich Results Test. Add JSON-LD syntax validation script to CI.
**Deliverables:** Passing Lighthouse 95+ score, valid structured data, CI validation script.
**Dependencies:** All other tasks complete. Requires deployed preview URLs for Google Rich Results Test.

## Risks and Concerns

1. **No OG image exists.** Both sites lack `og:image` meta tags. Without an OG image, social media shares show generic previews. Creating an OG image (1200x630px) is a design task that falls outside this scope but significantly impacts social sharing quality. Recommend adding a placeholder reference now and flagging image creation as a follow-up.

2. **Docs site is on `docs.webresourceledger.com`, landing on `webresourceledger.com`.** These are separate Cloudflare Pages projects with separate sitemaps. The landing page sitemap should NOT include docs URLs and vice versa. Cross-linking via `<link rel="alternate">` is not needed since they serve different content types. But the `site.js` `baseUrl` currently points to `https://webresourceledger.com` (landing domain) -- this is wrong for the docs site canonical URLs. Must be fixed to `https://docs.webresourceledger.com`.

3. **`site.js` `baseUrl` is currently the landing page domain.** The docs site's `base.njk` uses `{{ site.title }}` but doesn't use `{{ site.baseUrl }}` for any URLs yet. When we add canonical URLs and OG URLs, using the wrong base URL would produce incorrect canonicals pointing docs pages to the landing domain. This must be caught and fixed as part of Task 1.

4. **Landing page secondary pages may lack `<head>` boilerplate.** The terms, privacy, etc. pages are separate static HTML files. They likely duplicate the header/footer but may have inconsistent or missing meta tags. Each one needs individual inspection before modification. Since there is no templating system, changes must be applied to each file individually.

5. **FAQ content risks.** Adding an FAQ section means adding visible content to the landing page. If the FAQ answers are low-quality or duplicate existing content, Google may ignore the FAQ structured data or (worse) treat it as thin content. The seo-minion should provide FAQ content that adds genuine value beyond what is already on the page.

6. **Eleventy version compatibility.** The project uses `@11ty/eleventy ^3.0.0`. Eleventy 3.x uses ESM by default. Any sitemap plugin or CI script must be compatible with ESM. The template-based sitemap approach avoids this risk entirely.

## Additional Agents Needed

None. The current team (seo-minion for content specs and keyword research, frontend-minion for implementation) is sufficient. The OG image creation could involve a design specialist, but that is out of scope per the task definition.
