## Code Review — SEO + GEO Optimization

Reviewer: code-review-minion
Date: 2026-03-26

---

VERDICT: APPROVE

---

FINDINGS:

- [NIT] site/content/sitemap.njk:10 -- URL concatenation `{{ site.docsUrl }}{{ page.url }}` is correct (no trailing slash on docsUrl, leading slash on page.url from Eleventy), but the docs sitemap omits `<lastmod>` entries present in the landing sitemap.xml. Not a correctness issue -- `<lastmod>` is optional per the Sitemap protocol -- but the two sitemaps are inconsistent in what signals they provide to crawlers.
  AGENT: seo-minion
  FIX: Either accept the inconsistency (low impact) or add `<lastmod>{{ page.date | date: "%Y-%m-%d" }}</lastmod>` inside the `<url>` block if Eleventy page dates are reliable.

- [NIT] site/_includes/layouts/base.njk:27-34 -- The JSON-LD WebSite block interpolates `{{ site.title }}` and `{{ site.docsUrl }}` directly into a JSON string without an explicit JSON-escape filter. In Nunjucks, autoescape is on by default for HTML contexts but does not JSON-encode values (it HTML-encodes). If `site.title` ever contained a double-quote or backslash, it would break the JSON. Currently the values in site.js are hardcoded safe strings, so this is not exploitable today, but the pattern is fragile.
  AGENT: seo-minion
  FIX: Either use a `| dump` filter (`{{ site.title | dump }}` outputs a JSON-encoded string including quotes) or keep the current approach but add a code comment noting the values must be JSON-safe. Given site.js is a static config file with no user-controlled input, the practical risk is negligible.

- [NIT] landing/public/sitemap.xml:8-27 -- URLs for secondary pages (`/terms`, `/privacy`, `/security`, etc.) lack trailing slashes, which is inconsistent with the root URL `/` and with how Cloudflare Pages typically resolves these paths. The canonical tags in the corresponding HTML files also lack trailing slashes (`href="https://webresourceledger.com/terms"`). This is internally consistent, but if the server redirects `/terms` → `/terms/`, crawlers will follow the redirect and canonical/sitemap URLs won't match the final URL.
  AGENT: seo-minion
  FIX: Verify whether Cloudflare Pages redirects `/terms` → `/terms/`. If it does, add trailing slashes to both the sitemap and canonical `href` attributes across all secondary landing pages to avoid redirect chains.

- [NIT] site/content/llms.njk:3 -- `eleventyExcludeFromCollections: true` is correctly set, which prevents `/llms.txt` from appearing in the docs sitemap. However, neither the docs `robots.njk` nor the landing `robots.txt` reference `llms.txt` as a discoverable resource. The llms.txt spec (draft) does not require robots.txt linkage, but adding a comment or `# llms.txt: https://docs.webresourceledger.com/llms.txt` line to robots.txt would aid AI crawler discovery.
  AGENT: seo-minion / geo-minion
  FIX: Low priority. Optionally add a comment line to both robots files pointing to their respective llms.txt.

---

CHECKS PASSED (no blocking issues found):

- JSON-LD: All 4 blocks in landing/public/index.html parse as valid JSON (Organization, SoftwareApplication, HowTo, FAQPage). No structural errors.
- Meta tags: All 12 meta tags in base.njk are properly formed. No unclosed tags.
- XSS: FAQ content in index.html contains no script tags, event handlers, javascript: URIs, or injection vectors. Content is static, hardcoded prose.
- Sitemap XML: landing/public/sitemap.xml is valid XML per XML parser. Namespace is correct (`http://www.sitemaps.org/schemas/sitemap/0.9`). 6 URLs, all with valid `<lastmod>` dates.
- robots.txt correctness: docs robots.njk references `https://docs.webresourceledger.com/sitemap.xml`; landing robots.txt references `https://webresourceledger.com/sitemap.xml`. No cross-contamination.
- Eleventy template safety: sitemap.njk, robots.njk, and llms.njk all have `eleventyExcludeFromCollections: true` and no `layout:` declaration. They will not be wrapped in HTML or appear in the docs sitemap.
- Hardcoded secrets: None found in any changed file.
- CSS: FAQ styles (section 17) follow existing token conventions (custom properties, no magic numbers). Footer heading styles are consistent with h2 elements. No framework dependencies introduced.
- Footer heading fix: All 7 landing HTML files use `<h2 class="site-footer__heading">` consistently.
- llms.txt format: File ends with newline. Valid llms.txt format (H1 title, blockquote description, H2 sections, bullet links).
- Docs frontmatter: Checked representative content files (authentication.md, verification.md, legal-evidence.md). Description fields are present, specific, and within reasonable length for meta descriptions.
- Anchor nav integrity: `href="#faq"` in nav links to `id="faq"` on the FAQ section. Match confirmed.
