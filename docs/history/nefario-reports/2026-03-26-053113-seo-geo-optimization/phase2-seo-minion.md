## Domain Plan Contribution: seo-minion

### Current State Assessment

**Landing page (webresourceledger.com)**:
- Title tag: 59 chars, includes primary keyword. Good.
- Meta description: 196 chars -- too long. Will be truncated in SERPs. Needs trimming to 155 chars max.
- Canonical: present, self-referencing. Good.
- robots meta: `index, follow`. Good.
- OG tags: present but `og:image` is missing -- social shares will show no preview image.
- Twitter Card: `summary` type with no `twitter:image` -- should be `summary_large_image` with image.
- JSON-LD: Organization + SoftwareApplication. Both syntactically valid. SoftwareApplication has a single `Offer` with price "0" but no `AggregateOffer` covering the paid tiers.
- robots.txt: minimal, references sitemap. Good.
- Sitemap: covers 5 landing pages. Missing `/security` page. `lastmod` dates are all identical (2026-03-23) -- should reflect actual modification dates.
- Heading hierarchy: clean -- one h1, h2s for sections, h3s for items. No skipped levels.
- Semantic HTML: strong -- `<header>`, `<main>`, `<footer>`, `<nav>`, `<article>`, `<section>` all used correctly.
- Secondary pages (terms, privacy, security, etc.): have title/description but no OG/Twitter cards, no canonical tags, no structured data.

**Docs site (docs.webresourceledger.com)**:
- base.njk template: title and description from front matter. No canonical, no robots meta, no OG/Twitter cards, no structured data.
- `site.js` has `baseUrl: "https://webresourceledger.com"` -- this is wrong for the docs subdomain. Should be `https://docs.webresourceledger.com`.
- No robots.txt.
- No sitemap.
- No llms.txt anywhere.
- Front matter has good titles and descriptions on at least some pages (index.md, verification.md).

### Recommendations

#### 1. Structured Data Architecture

**Landing page -- keep and refine**:
- **Organization**: current implementation is good. Add `description` property.
- **SoftwareApplication**: refine the `offers` to use `AggregateOffer` with multiple `Offer` objects reflecting the actual pricing tiers (free tier, paid tiers, enterprise). This makes the structured data truthful about the pricing model.

**Landing page -- add**:
- **FAQPage**: add a visible FAQ section at the bottom of the landing page (before footer) with 6-8 questions. Dual purpose: answers real prospect questions AND produces FAQ rich results in Google. The FAQ content also serves GEO -- LLMs extract Q&A format extremely well.
- **HowTo**: mark up the existing "How It Works" section as HowTo structured data. The three-step flow (Capture, Sign, Verify) maps cleanly to `HowToStep`. This is eligible for rich results.

**Landing page -- do NOT add**:
- `Product` type. `SoftwareApplication` is the correct type and is already there. `Product` is for physical goods or generic products -- `SoftwareApplication` is the more specific, correct type for this use case and Google treats it well.

**Docs site**:
- **TechArticle** or **Article**: on each documentation page via the base.njk template. Include `headline`, `description`, `dateModified`, `author` (Organization ref), and `isPartOf` referencing the WebSite.
- **WebSite**: single JSON-LD block on every docs page identifying the docs site.
- No FAQ/HowTo/Product on docs pages -- they are reference documentation, not marketing pages.

#### 2. Sitemap Strategy

**Each subdomain gets its own sitemap.** This is the correct approach because:
- Google treats subdomains as separate sites for crawling purposes.
- Each needs its own Search Console property.
- Cross-referencing sitemaps from different subdomains creates confusion.

**Landing page sitemap** (`webresourceledger.com/sitemap.xml`):
- Add the missing `/security` page.
- Update `lastmod` dates to reflect actual file modification times, not a blanket date.
- Remove `changefreq` (Google ignores it) and `priority` (Google ignores it). They add noise.

**Docs site sitemap** (`docs.webresourceledger.com/sitemap.xml`):
- Generate via Eleventy. Use the `@11ty/eleventy-plugin-sitemap` or a simple Nunjucks template that iterates over collections. Given the KISS principle, a static Nunjucks template (`sitemap.njk`) with front matter `permalink: /sitemap.xml` that loops over all pages is simpler than adding a plugin dependency.
- Include all 17+ docs pages with their actual `lastmod` from git or front matter.

**Docs site robots.txt** (`docs.webresourceledger.com/robots.txt`):
- Create as a passthrough file. Content: `User-agent: *\nAllow: /\nSitemap: https://docs.webresourceledger.com/sitemap.xml`

#### 3. Keyword Strategy

Primary keyword targets by page (landing site):

| Page | Primary Keyword | Title Tag (max 60 chars) |
|------|----------------|--------------------------|
| Homepage | web evidence, web capture proof | `Web Resource Ledger -- Cryptographic Web Evidence` (50 chars) |
| Security | web capture security, GDPR compliance | `Security & Compliance -- Web Resource Ledger` (already good, 46 chars) |
| Terms | (low priority) | Keep as-is |
| Privacy | (low priority) | Keep as-is |

Docs site keyword targets:

| Page | Primary Keyword | Title Tag Pattern |
|------|----------------|-------------------|
| Getting Started | web capture API quickstart | `Getting Started -- WRL Docs` |
| Verification | verify web capture, WACZ verification | `Verification -- WRL Docs` |
| Legal Evidence | web evidence court, FRE 901, eIDAS evidence | `Legal Evidence -- WRL Docs` |
| MCP Server | MCP web capture, AI agent web evidence | `MCP Server -- WRL Docs` |
| API Reference | web capture API, evidence API | `API Reference -- WRL Docs` |
| Compare | web archiving tools comparison | `Compare -- WRL Docs` |
| Architecture | (low priority) | Keep pattern |
| Security | web capture security | `Security & Compliance -- WRL Docs` |

The niche is narrow ("web evidence", "web capture with proof", "cryptographic web archiving") so keyword competition is low. The strategy should focus on long-tail terms that prospects actually search:
- "prove web page existed at date"
- "web page evidence for court"
- "capture website with timestamp"
- "eIDAS web evidence"
- "WACZ signed archive"
- "MCP server web capture"

Meta descriptions should be unique per page, 150-155 chars, include the primary keyword, and end with a call-to-action or value proposition.

#### 4. GEO / LLM Extractability

**llms.txt**: Create at both site roots.

`webresourceledger.com/llms.txt` should contain:
```
# Web Resource Ledger (WRL)

> Tamper-evident web archiving with cryptographic proof. Captures web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Produces signed WACZ bundles that anyone can independently verify.

## Product

Web Resource Ledger is a web capture API that produces cryptographically signed evidence bundles. Each capture includes a rendered screenshot, HTML snapshot, HTTP headers, and resource manifest -- all bundled into a signed WACZ archive.

- Ed25519 digital signatures on every capture
- RFC 3161 independent timestamps (default)
- eIDAS-qualified timestamps (optional, EU legal standard)
- Public verification URLs (no account needed)
- WACZ open archive format
- REST API, MCP server, CLI verification tool
- 200 free captures/month, usage-based pricing after
- Self-hostable under Apache 2.0

## Use Cases

- Legal evidence: FRE 901(b)(9) and FRE 902(14) authentication, eIDAS Art. 41(2) timestamps
- Compliance archiving: timestamped, tamper-evident records for regulatory audits
- AI agent grounding: MCP server for verifiable web observations
- Journalism: preserve sources with cryptographic proof

## Links

- Docs: https://docs.webresourceledger.com
- API Reference: https://docs.webresourceledger.com/api-reference/
- GitHub: https://github.com/benpeter/web-resource-ledger
- Pricing: https://webresourceledger.com/#pricing
```

`docs.webresourceledger.com/llms.txt` should contain a similar header plus a documentation index with one-line descriptions per page and their URLs.

**Content patterns for LLM extractability** (landing page):
- The landing page is already strong on factual claims and specific standards (FRE 901, eIDAS Art. 41(2), Ed25519, RFC 3161). This is exactly what LLMs extract well.
- Add a visible FAQ section with concise, factual answers. LLMs heavily weight Q&A format for citation.
- Ensure the hero tagline and first paragraph are self-contained definitions -- LLMs often extract the first ~200 words as a summary.
- Pricing specifics (200 free/month, EUR per capture) are already present and citation-friendly.

**Anti-patterns to avoid**:
- Marketing superlatives without substance ("best-in-class", "revolutionary"). The current copy avoids this -- maintain that discipline.
- Vague comparisons without specifics. The comparison table is excellent -- keep it.
- Content behind JavaScript rendering. The landing page is static HTML -- perfect.
- Excessive use of em-dashes or stylized punctuation in key definitions (LLMs sometimes misparse these).

#### 5. Meta Tag Audit and Templates

**Landing page template** (for all HTML files):

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{page title} -- Web Resource Ledger</title>
<meta name="description" content="{150-155 char unique description}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://webresourceledger.com/{path}">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://webresourceledger.com/{path}">
<meta property="og:title" content="{page title} -- Web Resource Ledger">
<meta property="og:description" content="{same as meta description}">
<meta property="og:site_name" content="Web Resource Ledger">
<meta property="og:image" content="https://webresourceledger.com/assets/og-image.png">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{page title} -- Web Resource Ledger">
<meta name="twitter:description" content="{same as meta description}">
<meta name="twitter:image" content="https://webresourceledger.com/assets/og-image.png">
```

Current gaps on landing page secondary pages (terms, privacy, security, refund-policy, content-policy):
- Missing: canonical tag, OG tags, Twitter Card tags
- These are low-priority pages but canonical tags prevent duplicate content issues

**Docs site template** (base.njk additions):

```html
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://docs.webresourceledger.com{{ page.url }}">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:url" content="https://docs.webresourceledger.com{{ page.url }}">
<meta property="og:title" content="{{ title }} -- WRL Docs">
<meta property="og:description" content="{{ description or site.title }}">
<meta property="og:site_name" content="WRL Documentation">
<meta property="og:image" content="https://webresourceledger.com/assets/og-image.png">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{ title }} -- WRL Docs">
<meta name="twitter:description" content="{{ description or site.title }}">
<meta name="twitter:image" content="https://webresourceledger.com/assets/og-image.png">
```

**Critical fix**: `site.js` `baseUrl` must change from `https://webresourceledger.com` to `https://docs.webresourceledger.com`. This affects canonical URLs and any sitemap generation.

#### 6. FAQ Content

Add a visible FAQ section to the landing page between the Pricing section and the footer. It should be rendered as `<section>` with `<h2>` heading and individual `<h3>` questions with `<p>` answers. The FAQ structured data (`FAQPage` JSON-LD) should mirror this visible content exactly -- Google penalizes FAQ schema that doesn't match visible content.

Recommended questions (8 questions covering the most common prospect concerns):

1. **What is Web Resource Ledger?** -- One-paragraph definition. Critical for GEO.
2. **How does WRL differ from a screenshot or PDF?** -- Cryptographic proof, independent verification, tamper evidence.
3. **Is WRL evidence admissible in court?** -- FRE 901/902, eIDAS, but clarify WRL provides the technical foundation (not legal advice).
4. **Can I verify a capture without an account?** -- Yes, public verification, no trust required.
5. **What is a WACZ file?** -- Open web archive format, not vendor-locked.
6. **How does pricing work?** -- 200 free/month, usage-based after.
7. **Can I self-host WRL?** -- Yes, Apache 2.0, deploy on your infrastructure.
8. **Does WRL work with AI agents?** -- Yes, MCP server and REST API for programmatic capture.

#### 7. Cross-Site Coordination Spec (for frontend-minion)

**Docs site robots.txt**: Create `site/content/robots.txt` (or as a passthrough file) with:
```
User-agent: *
Allow: /
Sitemap: https://docs.webresourceledger.com/sitemap.xml
```

**Canonical URL strategy**:
- Landing pages: `https://webresourceledger.com/{path}` (no trailing slash for flat pages, trailing slash for section roots)
- Docs pages: `https://docs.webresourceledger.com/{path}/` (Eleventy default with trailing slash)
- Cross-site: no cross-canonical references. Each site is its own canonical authority.

**Heading hierarchy requirements**:
- Every page must have exactly one `<h1>`.
- Docs pages: the `<h1>` comes from the markdown `# Heading`. The base template must NOT add another h1.
- Heading levels must not skip (h2 -> h4 without h3 is invalid).

**OG image requirement**: A single 1200x630 PNG at `/assets/og-image.png` on the landing site. The docs site can reference the same image via absolute URL. This image needs to be created -- it does not exist yet.

**Sitemap generation for docs**: Create `site/content/sitemap.njk` with permalink `/sitemap.xml` that iterates `collections.all` and outputs XML. No plugin dependency needed.

**llms.txt for docs site**: Create as a passthrough file or Nunjucks template.

### Proposed Tasks

#### Task 1: Fix landing page meta description and OG/Twitter gaps
- **What**: Trim homepage meta description to 155 chars. Add `og:image` and `twitter:image` to homepage. Upgrade Twitter Card to `summary_large_image`.
- **Deliverables**: Updated `landing/public/index.html` head section.
- **Dependencies**: OG image asset must be created first (Task 8).

#### Task 2: Add meta tags to landing page secondary pages
- **What**: Add canonical, OG, and Twitter Card tags to terms.html, privacy.html, security.html, refund-policy.html, content-policy.html.
- **Deliverables**: Updated HTML files.
- **Dependencies**: OG image (Task 8). Can proceed without OG image by adding placeholder path.

#### Task 3: Add FAQ section and FAQPage structured data to landing page
- **What**: Add visible FAQ section with 8 questions. Add `FAQPage` JSON-LD matching the visible content.
- **Deliverables**: Updated `index.html` with FAQ section HTML and JSON-LD script block. Nav link to `#faq`.
- **Dependencies**: None.

#### Task 4: Add HowTo structured data to landing page
- **What**: Add `HowTo` JSON-LD for the "How It Works" section (Capture, Sign, Verify steps).
- **Deliverables**: New JSON-LD script block in `index.html`.
- **Dependencies**: None.

#### Task 5: Refine SoftwareApplication structured data
- **What**: Add `AggregateOffer` with multiple `Offer` objects reflecting actual pricing tiers. Add `description` to Organization schema.
- **Deliverables**: Updated JSON-LD blocks in `index.html`.
- **Dependencies**: None.

#### Task 6: Docs site base template SEO additions
- **What**: Add to `base.njk`: canonical tag, robots meta, OG tags, Twitter Card tags, TechArticle JSON-LD. Fix `site.js` `baseUrl` to `https://docs.webresourceledger.com`.
- **Deliverables**: Updated `base.njk`, updated `site.js`.
- **Dependencies**: OG image (Task 8) for absolute URL reference.

#### Task 7: Docs site robots.txt and sitemap
- **What**: Create robots.txt as passthrough copy. Create `sitemap.njk` template that generates XML sitemap from `collections.all`.
- **Deliverables**: `site/content/robots.txt` (or passthrough), `site/content/sitemap.njk`.
- **Dependencies**: Correct `baseUrl` in `site.js` (Task 6).

#### Task 8: Create OG image asset
- **What**: Create a 1200x630 PNG social sharing image with WRL branding (logo, tagline, brand colors).
- **Deliverables**: `landing/public/assets/og-image.png`.
- **Dependencies**: None. Should be done early since multiple tasks reference it.

#### Task 9: Create llms.txt for both sites
- **What**: Create `landing/public/llms.txt` with product summary. Create docs site `llms.txt` (passthrough or template) with documentation index.
- **Deliverables**: Two llms.txt files.
- **Dependencies**: None.

#### Task 10: Fix landing page sitemap
- **What**: Add missing `/security` URL. Remove `changefreq` and `priority` (Google ignores them). Update `lastmod` dates.
- **Deliverables**: Updated `landing/public/sitemap.xml`.
- **Dependencies**: None.

#### Task 11: Ensure all docs pages have unique descriptions
- **What**: Audit all docs page front matter. Any page missing a `description` field needs one added (unique, 150-155 chars, keyword-aware).
- **Deliverables**: Updated front matter across docs content files.
- **Dependencies**: None.

#### Task 12: Google Search Console setup
- **What**: Verify both `webresourceledger.com` and `docs.webresourceledger.com` in Search Console. Submit sitemaps for both.
- **Deliverables**: Verified properties, submitted sitemaps.
- **Dependencies**: Sitemaps must exist first (Tasks 7, 10). This is a manual/ops task, not a code task.

### Execution Order

1. **Task 8** (OG image) -- unblocks multiple tasks
2. **Tasks 3, 4, 5, 9, 10, 11** in parallel -- no dependencies on each other
3. **Tasks 1, 2** after Task 8
4. **Task 6** (docs base template) -- critical path for docs SEO
5. **Task 7** after Task 6
6. **Task 12** after Tasks 7 and 10

### Risks and Concerns

1. **OG image creation is a design task, not an SEO/code task.** If no designer is available, a simple branded image (logo + tagline on brand-colored background) is sufficient. The absence of an OG image is the single biggest social sharing gap right now.

2. **`site.js` baseUrl is wrong.** It says `https://webresourceledger.com` but the docs site is served from `https://docs.webresourceledger.com`. Any canonical URL or sitemap generation that uses this value will produce incorrect URLs. This must be fixed before any docs site SEO work.

3. **Landing page is static HTML (no templating).** This means meta tag templates cannot be applied automatically -- each HTML file must be edited individually. This is manageable for 7 pages but increases the risk of inconsistency. Consider whether a lightweight build step for the landing site would be worthwhile (out of scope for this task, but worth noting).

4. **FAQ schema compliance risk.** Google's rich results for FAQ require that the FAQ content is visible on the page. Hidden FAQs, accordion-only content behind JavaScript, or schema that doesn't match visible content will result in manual actions or loss of rich results. The FAQ must be fully visible in the HTML.

5. **No `schedules` page in sitemap or nav.** `site/content/schedules.md` exists but is not in `site.js` nav. Either add it to nav and sitemap, or add `noindex` if it is draft content. Orphan pages waste crawl budget and confuse site structure.

6. **Lighthouse SEO score target of 95+.** The current landing page likely scores well given its semantic HTML and existing meta tags. The docs site will score lower due to missing canonical, description inconsistency, and no robots meta. After implementing Tasks 6 and 11, both sites should clear 95+.

### Additional Agents Needed

- **frontend-minion**: Required for implementation of all template changes (base.njk, Nunjucks sitemap template, passthrough file configuration in eleventy.config.js). The SEO spec above describes *what* to implement; frontend-minion implements it.
- **A designer or asset creation capability**: For the OG image (Task 8). If no design minion exists, frontend-minion could generate a simple SVG-to-PNG or use the existing logo assets.
- No other specialists needed. The current team (seo-minion + frontend-minion) can cover everything in scope.
