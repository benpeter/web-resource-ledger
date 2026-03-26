## Delegation Plan

**Team name**: seo-geo-pass
**Description**: SEO and GEO optimization for the WRL landing page and docs site -- meta tags, structured data, sitemaps, llms.txt, FAQ section, and docs site SEO infrastructure.

### Task 1: Docs site SEO infrastructure + sitemap + robots.txt
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing SEO infrastructure for the WRL docs site (Eleventy + Nunjucks).

    ## Context

    The docs site at `docs.webresourceledger.com` is built with Eleventy 3.x (ESM). The site currently has:
    - A base template at `site/_includes/layouts/base.njk` with `<title>` and `<meta name="description">` but NO canonical, NO OG/Twitter tags, NO structured data, NO robots meta
    - Site data at `site/_data/site.js` with `baseUrl: "https://webresourceledger.com"` -- this is WRONG for the docs subdomain
    - Eleventy config at `site/eleventy.config.js` with passthrough copies for css, js, assets
    - ~18 content pages in `site/content/` (md and njk files) with `title` and `description` frontmatter
    - No robots.txt, no sitemap

    ## Tasks

    ### 1. Fix site.js

    Add a `docsUrl` field and a site-level `description`:

    ```js
    export default {
      title: "WRL Documentation",
      docsUrl: "https://docs.webresourceledger.com",
      baseUrl: "https://webresourceledger.com",
      description: "Developer documentation for Web Resource Ledger -- cryptographic web evidence API with Ed25519 signatures and RFC 3161 timestamps.",
      nav: [ ... ]  // keep existing nav unchanged
    };
    ```

    Keep `baseUrl` as-is (it's used to link back to the landing page) but add `docsUrl` for the docs site's own canonical URLs.

    ### 2. Update base.njk <head>

    Add these tags inside `<head>`, after the existing `<meta name="description">` line:

    ```html
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{{ site.docsUrl }}{{ page.url }}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="{{ site.docsUrl }}{{ page.url }}">
    <meta property="og:title" content="{{ title }} — {{ site.title }}">
    <meta property="og:description" content="{{ description or site.description }}">
    <meta property="og:site_name" content="{{ site.title }}">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="{{ title }} — {{ site.title }}">
    <meta name="twitter:description" content="{{ description or site.description }}">
    ```

    Also add a WebSite + Organization JSON-LD block in `<head>` (inline, not a partial -- KISS):

    ```html
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "{{ site.title }}",
      "url": "{{ site.docsUrl }}",
      "publisher": {
        "@type": "Organization",
        "name": "Web Resource Ledger",
        "url": "https://webresourceledger.com/"
      }
    }
    </script>
    ```

    Do NOT create a separate partial file for the JSON-LD. It is one small block -- inline is simpler.

    ### 3. Create sitemap.njk

    Create `site/content/sitemap.njk`:

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

    ### 4. Create robots.txt

    Create `site/content/robots.txt` as a Nunjucks template with permalink:

    ```
    ---
    permalink: /robots.txt
    eleventyExcludeFromCollections: true
    ---
    User-agent: *
    Allow: /

    Sitemap: https://docs.webresourceledger.com/sitemap.xml
    ```

    ### 5. Create llms.txt for docs site

    Create `site/content/llms.txt`:

    ```
    ---
    permalink: /llms.txt
    eleventyExcludeFromCollections: true
    ---
    # WRL Documentation

    > Developer documentation for Web Resource Ledger (WRL) — a cryptographic web evidence API. Captures web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Produces signed WACZ bundles.

    ## Docs

    - [Getting Started](https://docs.webresourceledger.com/): Quickstart guide — first capture in five minutes
    - [Authentication](https://docs.webresourceledger.com/authentication/): API key management and OAuth login
    - [Verification](https://docs.webresourceledger.com/verification/): How to verify capture authenticity
    - [Legal Evidence](https://docs.webresourceledger.com/legal-evidence/): FRE 901/902, eIDAS Art. 41(2) legal framework
    - [Batch Captures](https://docs.webresourceledger.com/batch/): Bulk capture API for multiple URLs
    - [Limits & Quotas](https://docs.webresourceledger.com/limits/): Rate limits and usage quotas
    - [Webhooks](https://docs.webresourceledger.com/webhooks/): Event notifications for capture completion
    - [MCP Server](https://docs.webresourceledger.com/mcp/): Model Context Protocol integration for AI agents
    - [API Reference](https://docs.webresourceledger.com/api-reference/): Full REST API specification
    - [Architecture](https://docs.webresourceledger.com/architecture/): System design and data flow
    - [Compare](https://docs.webresourceledger.com/compare/): Comparison with other web archiving tools
    - [Security & Compliance](https://docs.webresourceledger.com/security/): Security practices, GDPR, SOC 2

    ## Links

    - Product: https://webresourceledger.com
    - GitHub: https://github.com/benpeter/web-resource-ledger
    - API Reference: https://docs.webresourceledger.com/api-reference/
    ```

    ### 6. Review and update docs page frontmatter

    Check every content file in `site/content/`. Each page MUST have both `title` and `description` in frontmatter. The `description` should be:
    - Unique per page (no duplicates across the site)
    - 150-155 characters max
    - Include the primary keyword for that page
    - Factual, not promotional

    Pages to check (read each one):
    - `index.md`, `authentication.md`, `verification.md`, `legal-evidence.md`
    - `batch.md`, `limits.md`, `webhooks.md`, `mcp.md`
    - `api-reference.njk`, `architecture.md`, `compare.njk`, `schedules.md`
    - `security/index.md`, `security/whitepaper.md`, `security/dpa.md`
    - `security/subprocessors.md`, `security/incident-response.md`, `security/data-retention.md`

    For `schedules.md`: this page exists but is NOT in the site.js nav. Add `noindex: true` to its frontmatter so it gets excluded from the sitemap. Do NOT add it to nav.

    Use these keyword targets when writing/optimizing descriptions:
    - Getting Started → "web capture API quickstart"
    - Verification → "verify web capture, WACZ verification"
    - Legal Evidence → "web evidence court, FRE 901, eIDAS evidence"
    - MCP Server → "MCP web capture, AI agent web evidence"
    - API Reference → "web capture API, evidence API"
    - Compare → "web archiving tools comparison"
    - Security → "web capture security"

    ### 7. Build and verify

    After all changes, run the Eleventy build to verify nothing breaks:

    ```bash
    cd site && npx @11ty/eleventy
    ```

    Check that:
    - The build succeeds with no errors
    - `_output/sitemap.xml` exists and contains all expected URLs with the correct `docs.webresourceledger.com` domain
    - `_output/robots.txt` exists
    - `_output/llms.txt` exists
    - A sample HTML file in `_output/` contains the canonical tag, OG tags, and JSON-LD

    ## File ownership

    CREATE:
    - `site/content/sitemap.njk`
    - `site/content/robots.txt` (Nunjucks template with permalink)
    - `site/content/llms.txt` (Nunjucks template with permalink)

    MODIFY:
    - `site/_data/site.js` (add docsUrl, description)
    - `site/_includes/layouts/base.njk` (add meta tags, canonical, OG, Twitter, JSON-LD)
    - `site/content/*.md` and `*.njk` (frontmatter descriptions where missing/weak)
    - `site/content/schedules.md` (add noindex: true)

    DO NOT MODIFY:
    - `site/eleventy.config.js` -- no changes needed. The `.njk` template format is already configured and permalink-based output works without passthrough config.
    - Any landing page files

    ## What NOT to do

    - Do NOT install any Eleventy plugins (no sitemap plugin, no SEO plugin)
    - Do NOT create separate partial files for JSON-LD or meta tags -- keep it inline in base.njk
    - Do NOT add `og:image` or `twitter:image` tags (no image asset exists yet)
    - Do NOT modify any files in the `landing/` directory
    - Do NOT add TechArticle structured data per-page (YAGNI -- the WebSite + Organization block is sufficient)
    - Do NOT add `lastmod` to sitemap entries (would require git integration, not worth the complexity)
- **Deliverables**: Updated base.njk with full SEO meta tags, updated site.js, sitemap.xml template, robots.txt, llms.txt, optimized frontmatter across all docs pages
- **Success criteria**: Eleventy builds without errors; `_output/sitemap.xml` has correct docs domain URLs; `_output/robots.txt` and `_output/llms.txt` exist; sample HTML output contains canonical, OG, Twitter, and JSON-LD tags

### Task 2: Landing page SEO + structured data + FAQ + llms.txt
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The FAQ section adds visible content to the landing page and is hard to reverse (it changes the page structure, JSON-LD schema, navigation, and sitemap). Multiple downstream concerns depend on the FAQ content quality.
- **Gate rationale**: |
    Chosen: Add 8-question FAQ section with FAQPage + HowTo JSON-LD, refine existing SoftwareApplication offers to AggregateOffer
    Over: (1) Skip FAQ and only add meta tags/structured data; (2) Create FAQ as a separate page instead of a section
    Why: FAQ section serves dual purpose -- SEO rich results AND GEO extractability. Inline section avoids orphan page and keeps the landing page self-contained. AggregateOffer accurately represents the tiered pricing.
- **Prompt**: |
    You are updating the WRL landing page (static HTML, no build system) for SEO and GEO optimization.

    ## Context

    The landing page at `webresourceledger.com` is a static HTML file at `landing/public/index.html`. It already has:
    - Good title tag, meta description (but too long at 196 chars -- needs trimming to 155 max)
    - Canonical URL, robots meta, OG tags, Twitter Card tags
    - Organization and SoftwareApplication JSON-LD
    - Semantic HTML with proper heading hierarchy
    - Missing: `og:image`, `twitter:image` (skip these -- no image asset exists)
    - Missing: FAQ section, HowTo JSON-LD, FAQPage JSON-LD

    Secondary pages (terms.html, privacy.html, refund-policy.html, content-policy.html, security.html) have title, description, canonical, and robots but are missing OG and Twitter Card tags.

    The sitemap at `landing/public/sitemap.xml` is missing the `/security` page and has stale `changefreq`/`priority` attributes that Google ignores.

    ## Tasks

    ### 1. Fix homepage meta description

    Trim the meta description in `index.html` to 155 characters max. Keep the core message: Ed25519 signatures, RFC 3161 timestamps, signed WACZ bundles, independent verification.

    ### 2. Upgrade Twitter Card

    In `index.html`, change `<meta name="twitter:card" content="summary">` to `<meta name="twitter:card" content="summary_large_image">`.

    ### 3. Refine SoftwareApplication JSON-LD

    Replace the single `Offer` with an `AggregateOffer` that reflects the actual pricing tiers:

    ```json
    "offers": {
      "@type": "AggregateOffer",
      "priceCurrency": "EUR",
      "lowPrice": "0",
      "offerCount": "3",
      "offers": [
        {
          "@type": "Offer",
          "name": "Free tier",
          "description": "200 captures per month",
          "price": "0",
          "priceCurrency": "EUR"
        },
        {
          "@type": "Offer",
          "name": "Usage-based",
          "description": "Pay per capture after free tier",
          "price": "0.05",
          "priceCurrency": "EUR"
        },
        {
          "@type": "Offer",
          "name": "Enterprise",
          "description": "Custom volume pricing and SLA",
          "price": "0",
          "priceCurrency": "EUR",
          "priceSpecification": {
            "@type": "PriceSpecification",
            "priceCurrency": "EUR",
            "eligibleQuantity": {
              "@type": "QuantitativeValue",
              "minValue": 100000
            }
          }
        }
      ]
    }
    ```

    Also add `"description"` to the Organization JSON-LD block:
    ```json
    "description": "Cryptographic evidence of web content. Captures web pages with tamper-evident proof anyone can verify."
    ```

    ### 4. Add HowTo JSON-LD

    The landing page has a "How It Works" section with three steps (Capture, Sign, Verify). Add a HowTo JSON-LD block in `<head>`:

    ```json
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": "How to capture web evidence with WRL",
      "description": "Three steps to create cryptographic evidence of web content.",
      "step": [
        {
          "@type": "HowToStep",
          "position": 1,
          "name": "Capture",
          "text": "Send a URL to the WRL API. A headless browser captures the full page: rendered HTML, screenshot, HTTP headers, and all resources."
        },
        {
          "@type": "HowToStep",
          "position": 2,
          "name": "Sign",
          "text": "WRL signs the capture with Ed25519 and obtains an RFC 3161 timestamp from an independent authority. Optionally, an eIDAS-qualified timestamp."
        },
        {
          "@type": "HowToStep",
          "position": 3,
          "name": "Verify",
          "text": "Anyone can verify the capture's authenticity using the public verification URL or CLI tool. No account needed."
        }
      ]
    }
    ```

    Read the actual "How It Works" section content in index.html and adjust the step text to match what is actually on the page. The JSON-LD must reflect the visible content.

    ### 5. Add FAQ section and FAQPage JSON-LD

    Add a visible FAQ section to `index.html` AFTER the pricing section and BEFORE the footer. Use this structure:

    ```html
    <!-- FAQ -->
    <section class="faq" id="faq" aria-labelledby="faq-heading">
      <div class="container">
        <h2 id="faq-heading">Frequently Asked Questions</h2>
        <dl class="faq__list">
          <div class="faq__item">
            <dt><h3>What is Web Resource Ledger?</h3></dt>
            <dd>Web Resource Ledger (WRL) is a web capture API that produces cryptographically signed evidence bundles. Each capture includes a rendered screenshot, HTML snapshot, HTTP headers, and resource manifest — all bundled into a signed WACZ archive with Ed25519 signatures and RFC 3161 timestamps.</dd>
          </div>
          <!-- ... more items -->
        </dl>
      </div>
    </section>
    ```

    Include these 8 questions:

    1. **What is Web Resource Ledger?** — One-paragraph definition covering what it does, what it produces, and how it signs captures.
    2. **How does WRL differ from a screenshot or PDF?** — Cryptographic signatures prove the capture is unaltered. Independent timestamps prove when it was made. The WACZ bundle includes all page resources, not just an image. Anyone can verify without trusting the capturer.
    3. **Is WRL evidence admissible in court?** — WRL captures meet the technical requirements of FRE 901(b)(9) and FRE 902(14) for self-authenticating evidence, and eIDAS Art. 41(2) for qualified timestamps. However, WRL provides the technical foundation — consult legal counsel for jurisdiction-specific admissibility.
    4. **Can I verify a capture without an account?** — Yes. Every capture has a public verification URL. Verification checks signatures and timestamps using the CLI tool or web verifier. No account or API key is required.
    5. **What is a WACZ file?** — WACZ (Web Archive Collection Zipped) is an open web archive format used by the web archiving community. It bundles HTTP request/response pairs, rendered content, and metadata into a single ZIP-based container. WRL adds cryptographic signatures and timestamps to the WACZ package.
    6. **How does pricing work?** — 200 captures per month are free. After the free tier, pricing is usage-based starting at EUR 0.05 per capture with volume discounts. eIDAS-qualified timestamps are an optional add-on at EUR 0.10 per capture.
    7. **Can I self-host WRL?** — Yes. WRL is open source under the Apache 2.0 license. You can deploy it on your own Cloudflare Workers infrastructure. The hosted service at api.webresourceledger.com is the same codebase.
    8. **Does WRL work with AI agents?** — Yes. WRL provides an MCP (Model Context Protocol) server that AI agents can use to capture and verify web pages programmatically. The REST API also supports any HTTP client.

    Read the actual landing page content to ensure FAQ answers are consistent with what is already stated on the page. Do not contradict existing copy.

    Add a corresponding FAQPage JSON-LD block in `<head>` that mirrors the visible FAQ content exactly (Google requires FAQ structured data to match visible content).

    Also add an FAQ link to the main nav: `<a href="#faq">FAQ</a>` (before the Docs link).

    ### 6. Add OG and Twitter Card tags to secondary pages

    For each of these files: `terms.html`, `privacy.html`, `refund-policy.html`, `content-policy.html`, `security.html`:

    Add after the existing `<link rel="canonical" ...>` line:

    ```html
    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://webresourceledger.com/{page-path}">
    <meta property="og:title" content="{page title from existing title tag}">
    <meta property="og:description" content="{existing meta description content}">
    <meta property="og:site_name" content="Web Resource Ledger">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="{page title from existing title tag}">
    <meta name="twitter:description" content="{existing meta description content}">
    ```

    Use `summary` (not `summary_large_image`) for secondary pages since they have no hero image.

    For `404.html`: add `<meta name="robots" content="noindex">` if not already present. Do NOT add OG/Twitter tags to the 404 page.

    ### 7. Fix landing page sitemap

    Update `landing/public/sitemap.xml`:
    - Add the missing `/security` URL
    - Remove all `<changefreq>` and `<priority>` elements (Google ignores them, they add noise)
    - Keep `<lastmod>` dates as-is (they are close enough; exact git dates are not worth the effort for a static site)

    ### 8. Create llms.txt

    Create `landing/public/llms.txt` with this content:

    ```
    # Web Resource Ledger (WRL)

    > Tamper-evident web archiving with cryptographic proof. Captures web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Produces signed WACZ bundles that anyone can independently verify.

    ## Product

    Web Resource Ledger is a web capture API that produces cryptographically signed evidence bundles. Each capture includes a rendered screenshot, HTML snapshot, HTTP headers, and resource manifest — all bundled into a signed WACZ archive.

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

    ### 9. Add FAQ styling

    Add minimal CSS for the FAQ section. Look at the existing landing page CSS patterns in `landing/public/css/landing.css` and follow the same conventions. The FAQ should:
    - Use the same `container` class and spacing as other sections
    - Use `<dl>` with `<dt>`/`<dd>` for semantic markup
    - Keep styling minimal -- no accordions, no JavaScript, just visible Q&A
    - Match the visual weight and spacing of other landing page sections

    ## File ownership

    MODIFY:
    - `landing/public/index.html` (meta description, Twitter Card, JSON-LD refinements, FAQ section, HowTo JSON-LD, FAQPage JSON-LD, nav link)
    - `landing/public/terms.html` (add OG + Twitter tags)
    - `landing/public/privacy.html` (add OG + Twitter tags)
    - `landing/public/refund-policy.html` (add OG + Twitter tags)
    - `landing/public/content-policy.html` (add OG + Twitter tags)
    - `landing/public/security.html` (add OG + Twitter tags)
    - `landing/public/404.html` (add noindex if missing)
    - `landing/public/sitemap.xml` (add /security, remove changefreq/priority)
    - `landing/public/css/landing.css` (FAQ section styles)

    CREATE:
    - `landing/public/llms.txt`

    DO NOT MODIFY:
    - Any files in the `site/` directory
    - Do NOT add `og:image` or `twitter:image` tags (no image asset exists)
    - Do NOT change the page title tag (it is already good at 59 chars)
    - Do NOT refactor from SoftwareApplication to Product type (SoftwareApplication is the correct schema type for this use case)
    - Do NOT add any JavaScript for the FAQ section (no accordions, no toggle)
    - Do NOT install any dependencies or build tools
- **Deliverables**: Updated index.html with FAQ section, HowTo/FAQPage JSON-LD, refined SoftwareApplication offers, trimmed meta description; OG/Twitter tags on all secondary pages; fixed sitemap; llms.txt; FAQ CSS
- **Success criteria**: All landing page HTML files have complete meta tags (title, description, canonical, OG, Twitter); index.html has FAQ section with matching FAQPage JSON-LD; HowTo JSON-LD matches visible How It Works section; sitemap includes /security and has no changefreq/priority; llms.txt exists at site root; all JSON-LD blocks are valid JSON

### Task 3: Lighthouse audit + JSON-LD validation
- **Agent**: seo-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    You are validating the SEO implementation across both WRL sites after the implementation tasks are complete.

    ## Context

    Two sites have been updated:
    - **Landing page**: `webresourceledger.com` — static HTML at `landing/public/`
    - **Docs site**: `docs.webresourceledger.com` — Eleventy site at `site/`

    ## Validation Steps

    ### 1. Validate JSON-LD syntax

    For the landing page, extract all `<script type="application/ld+json">` blocks from `landing/public/index.html` and validate they are valid JSON. Check for:
    - Valid JSON syntax (no trailing commas, proper quoting)
    - Correct `@context` and `@type` values
    - FAQPage questions match visible FAQ section content
    - HowTo steps match visible "How It Works" section
    - AggregateOffer contains multiple Offer objects

    For the docs site, build Eleventy and check a sample output file:
    ```bash
    cd site && npx @11ty/eleventy
    ```
    Then check `site/_output/index.html` for the WebSite JSON-LD block.

    ### 2. Verify meta tag completeness

    For the landing page, check every HTML file in `landing/public/`:
    - `index.html`: title (<=60 chars), description (<=155 chars), canonical, robots, OG (type, url, title, description, site_name), Twitter Card (card, title, description)
    - `security.html`, `terms.html`, `privacy.html`, `refund-policy.html`, `content-policy.html`: same tags present
    - `404.html`: has `<meta name="robots" content="noindex">`

    For the docs site, check `site/_output/index.html`:
    - title, description, robots, canonical (with `docs.webresourceledger.com` domain), OG tags, Twitter Card tags, WebSite JSON-LD

    ### 3. Verify sitemap

    Landing page (`landing/public/sitemap.xml`):
    - Contains `/security` URL
    - No `<changefreq>` or `<priority>` elements
    - All URLs use `https://webresourceledger.com/` domain

    Docs site (`site/_output/sitemap.xml`):
    - Contains all navigable docs pages
    - All URLs use `https://docs.webresourceledger.com/` domain
    - Does NOT contain the sitemap itself or pages with `noindex: true`

    ### 4. Verify robots.txt and llms.txt

    - `landing/public/robots.txt` exists (should already exist)
    - `site/_output/robots.txt` exists and references the docs sitemap
    - `landing/public/llms.txt` exists
    - `site/_output/llms.txt` exists

    ### 5. Check heading hierarchy

    For `landing/public/index.html`:
    - Exactly one `<h1>`
    - No skipped heading levels (h2 -> h4 without h3)
    - FAQ section uses `<h2>` for section title and `<h3>` for individual questions

    ### 6. Report findings

    Create a validation report listing:
    - PASS/FAIL for each check
    - Any issues found with specific file paths and line numbers
    - Recommendations for fixes

    If any JSON-LD blocks have syntax errors, fix them directly.

    ## File ownership

    READ (for validation):
    - All files in `landing/public/`
    - `site/_output/` (after building)

    MODIFY (only if fixing validation errors found):
    - `landing/public/index.html` (JSON-LD fixes only)
    - `site/` files (only if build fails or output is incorrect)

    ## What NOT to do

    - Do NOT run Lighthouse (requires a deployed URL or a local server -- out of scope for this task)
    - Do NOT modify any content beyond fixing validation errors
    - Do NOT add new features or structured data types
    - Do NOT submit sitemaps to Google Search Console (manual step)
- **Deliverables**: Validation report with PASS/FAIL for each check; any JSON-LD syntax fixes
- **Success criteria**: All JSON-LD blocks are valid JSON with correct types; all HTML files have required meta tags; sitemaps have correct URLs; robots.txt and llms.txt present on both sites

### Cross-Cutting Coverage

- **Testing**: No dedicated test task. The validation in Task 3 covers correctness. No unit tests needed for static HTML/meta tags. Phase 6 (post-execution) will run existing tests to confirm nothing breaks.
- **Security**: Not applicable. No new attack surface, no auth changes, no user input handling. All changes are static HTML metadata.
- **Usability -- Strategy**: The FAQ section adds user-facing content. The FAQ questions were chosen to address real prospect concerns (court admissibility, pricing, self-hosting, AI integration). ux-strategy-minion should review in Phase 3.5.
- **Usability -- Design**: The FAQ section needs visual design review to ensure it fits the landing page's existing design system. accessibility-minion should check the `<dl>` markup pattern. Both should review in Phase 3.5.
- **Documentation**: No architectural changes requiring documentation. The llms.txt files are themselves documentation artifacts. Phase 8 will assess if any docs updates are needed.
- **Observability**: Not applicable. No runtime components, no APIs, no background processes.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - ux-design-minion: The FAQ section adds visible UI to the landing page. Review focus: visual hierarchy of FAQ section, consistency with existing section styling, `<dl>` interaction pattern.
  - accessibility-minion: FAQ section introduces new HTML structure with `<dl>`/`<dt>`/`<dd>`. Review focus: semantic correctness of FAQ markup, heading hierarchy after FAQ addition, screen reader compatibility.
- **Not selected**:
  - sitespeed-minion: Changes are static HTML metadata additions -- no JS, no new assets, no layout shifts. No performance impact.
  - observability-minion: No runtime components affected.
  - user-docs-minion: llms.txt serves as machine-readable documentation. No user-facing docs changes needed.
  - seo-minion: Already participating as Task 3 validator, not needed as architectural reviewer.

### Decisions

- **Inline JSON-LD vs. separate partial files**
  Chosen: Inline JSON-LD blocks in base.njk and index.html
  Over: Separate Nunjucks partial file (`partials/json-ld.njk`) as proposed by frontend-minion
  Why: The docs site has one small JSON-LD block (WebSite + Organization). A separate file adds indirection for ~15 lines of static content. KISS principle wins.

- **Keep SoftwareApplication vs. switch to Product schema type**
  Chosen: Keep SoftwareApplication, refine its Offer to AggregateOffer
  Over: Switch to Product type as frontend-minion suggested considering
  Why: seo-minion correctly identified that SoftwareApplication is the more specific, correct schema type for an API/software product. Google treats it well. Product is for physical goods or generic products.

- **Add docsUrl field vs. fix baseUrl**
  Chosen: Add new `docsUrl` field to site.js while keeping `baseUrl` as-is
  Over: Rename `baseUrl` to point to docs domain (seo-minion's recommendation)
  Why: `baseUrl` may be used for cross-site links back to the landing page. Adding a separate `docsUrl` is safer and avoids breaking any existing references.

- **Twitter Card type for secondary pages**
  Chosen: `summary` for secondary pages, `summary_large_image` only for homepage
  Over: `summary_large_image` for all pages (seo-minion's template)
  Why: Secondary pages (terms, privacy, etc.) have no hero image or visual content worth a large card. `summary` is more appropriate when there is no `og:image`.

### Risks and Mitigations

1. **FAQ content quality risk**: Low-quality FAQ answers could be treated as thin content by Google. Mitigation: FAQ answers are specific, factual, and reference concrete standards (FRE 901, eIDAS, Ed25519). They add information not already in the hero or feature sections.

2. **Docs site baseUrl confusion**: Adding `docsUrl` while keeping `baseUrl` could confuse future developers about which to use. Mitigation: The field name `docsUrl` is self-documenting. A comment in site.js would help.

3. **OG image missing**: Both sites lack `og:image` meta tags. Social shares will show text-only previews. Mitigation: Explicitly out of scope per instructions. Can be addressed in a follow-up with a simple branded PNG.

4. **Google Search Console not automated**: Verification and sitemap submission require manual steps. Mitigation: HUMAN_ACTION_REQUIRED -- add Search Console verification meta tag now, note manual submission as a follow-up.

5. **schedules.md orphan page**: Exists in content but not in nav. Mitigation: Task 1 adds `noindex: true` to its frontmatter to exclude from sitemap and prevent Google from indexing a potentially draft page.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Docs site SEO infrastructure
  Task 2: Landing page SEO + structured data + FAQ

  [APPROVAL GATE: Task 2 — FAQ content and structured data]

Batch 2 (sequential after both complete):
  Task 3: Validation audit
```

### External Skills

No external skills detected in project.

### Verification Steps

After all tasks complete:
1. Eleventy builds without errors
2. All JSON-LD blocks parse as valid JSON
3. Every HTML file (landing + docs output) has: title, description, canonical (with correct domain), OG tags, Twitter Card tags
4. Sitemaps reference correct domains and include all navigable pages
5. robots.txt exists on both sites with correct sitemap references
6. llms.txt exists on both sites
7. FAQ section is visible on landing page with matching FAQPage JSON-LD
8. No heading hierarchy violations (one h1 per page, no skipped levels)
9. HUMAN_ACTION_REQUIRED: Verify both sites in Google Search Console and submit sitemaps
