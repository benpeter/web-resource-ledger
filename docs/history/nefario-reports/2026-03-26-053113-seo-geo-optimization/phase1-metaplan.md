# Meta-Plan: SEO + GEO Optimization

## Context Summary

The project has two web properties:
- **Landing page** (`landing/public/`) -- static HTML at `webresourceledger.com`, deployed via Cloudflare Pages. Already has: title, meta description, canonical URL, OG/Twitter cards, Organization + SoftwareApplication JSON-LD, robots.txt, sitemap.xml (landing pages only -- missing docs site pages).
- **Docs site** (`site/`) -- Eleventy-based at `docs.webresourceledger.com`, deployed via Cloudflare Pages. Has basic `<title>` and `<meta description>` via Nunjucks template but NO structured data, NO OG/Twitter cards, NO sitemap, NO robots.txt. 16 content pages.

Neither site has: FAQ structured data, HowTo schema, `llms.txt`, per-page keyword optimization, or Google Search Console verification.

The ops-runbook skill is the only project-local skill and is irrelevant to this task.

## Planning Consultations

### Consultation 1: SEO Technical Audit and Implementation Strategy
- **Agent**: seo-minion
- **Planning question**: Given the current state of both sites (landing page with basic OG/structured data, docs site with minimal meta tags and no structured data), what is the optimal implementation order? Specifically: (1) Which structured data types (Organization, Product, FAQ, HowTo, SoftwareApplication) should go on which pages? (2) Should the sitemap cover both subdomains or be separate per subdomain? (3) What keyword strategy makes sense for a developer-tools product in the web evidence/archiving niche? (4) What does the `llms.txt` file need to contain for GEO effectiveness?
- **Context to provide**: `landing/public/index.html` (full file), `site/_includes/layouts/base.njk`, `site/_data/site.js` (nav/page list), existing `robots.txt` and `sitemap.xml`, `PRODUCT.md`
- **Why this agent**: Core domain expertise for both SEO and GEO. Knows structured data best practices, sitemap standards, and `llms.txt` conventions.

### Consultation 2: Landing Page Content Structure for LLM Extractability
- **Agent**: ai-modeling-minion
- **Planning question**: The GEO scope requires making landing page content "structured for LLM extractability." Beyond schema.org markup, what content patterns make a product page most useful for LLM citation? Specifically: (1) Should the FAQ section use a different writing style than the rest of the page? (2) What specific claims/numbers should be surfaced for citation-friendly copy? (3) How should `llms.txt` relate to the existing structured data? (4) Are there content anti-patterns that hurt GEO (e.g., marketing fluff that LLMs filter out)?
- **Context to provide**: `landing/public/index.html`, `PRODUCT.md`, the existing SoftwareApplication schema
- **Why this agent**: Understands how LLMs process and extract information from web pages, which is the core of GEO optimization.

### Consultation 3: Docs Site Template Architecture for SEO
- **Agent**: frontend-minion
- **Planning question**: The docs site uses Eleventy with Nunjucks templates. The base template (`base.njk`) needs OG tags, Twitter cards, and structured data injected. (1) What's the cleanest way to add per-page OG metadata using Eleventy's data cascade (frontmatter vs. computed data vs. data files)? (2) Should structured data be inline in `base.njk` or a separate partial? (3) The docs site needs a sitemap -- should we use an Eleventy plugin or generate it statically? (4) How should `robots.txt` be handled for the docs subdomain?
- **Context to provide**: `site/eleventy.config.js`, `site/_includes/layouts/base.njk`, `site/_includes/layouts/doc.njk`, `site/_data/site.js`, `site/content/index.md` (frontmatter example)
- **Why this agent**: Knows Eleventy's data cascade and template architecture. The implementation touches template files that need to be modified correctly.

### Cross-Cutting Checklist
- **Testing**: Exclude from planning. No executable code is being produced -- this is HTML/meta/structured data changes. Lighthouse SEO audits (mentioned in scope) serve as the validation mechanism and can be run manually post-implementation.
- **Security**: Exclude from planning. No auth, API, user input, or infrastructure changes. Structured data and meta tags are read-only by crawlers.
- **Usability -- Strategy**: ALWAYS include -- How should FAQ content be structured to serve both human visitors and LLM extractors without cluttering the page? Should FAQs be a new visible section on the landing page, or only in structured data? What's the cognitive load impact of adding more sections?
- **Usability -- Design**: Exclude from planning. If FAQ becomes a visible section, ux-design-minion would be needed in execution, but the planning question is strategic (should it exist) not visual (how should it look).
- **Documentation**: ALWAYS include -- The docs site itself is being modified (meta tags, structured data, sitemap). software-docs-minion should advise on whether any docs content pages need frontmatter changes and whether the docs site should have its own FAQ or HowTo structured data.
- **Observability**: Exclude from planning. No runtime components, APIs, or services being created or modified.

### Notable Exclusions

- **edge-minion**: CDN caching headers and Cloudflare Pages configuration are not changing -- only the HTML/content served is being modified. If cache-busting becomes relevant for meta tag changes, it can be addressed in execution.
- **accessibility-minion**: Structured data and meta tags are invisible to assistive technology. If a visible FAQ section is added, accessibility review would be needed in execution (Phase 3.5) but not for planning.
- **product-marketing-minion**: The copy and positioning already exist on the landing page. This task optimizes discoverability of existing content, not messaging. If keyword strategy requires copy changes, seo-minion will flag it.

### Anticipated Approval Gates

1. **Structured data schema design** (MUST gate) -- Which JSON-LD types go on which pages, and what content they contain. This is hard to reverse (search engines cache structured data) and every implementation task depends on it. seo-minion + ai-modeling-minion will propose; user approves before any HTML is modified.

2. **FAQ content** (OPTIONAL gate) -- If a visible FAQ section is recommended for the landing page, the content and placement need review. New user-facing content on the primary conversion page warrants a look.

### Rationale

This task is primarily an SEO/GEO domain problem with two implementation surfaces (static HTML landing page, Eleventy docs site). The core planning expertise needed is:
- **seo-minion**: Owns the entire SEO/GEO strategy -- structured data, sitemaps, meta tags, keyword optimization, `llms.txt`
- **ai-modeling-minion**: GEO is fundamentally about LLM behavior -- this agent understands how LLMs extract and cite information
- **frontend-minion**: The docs site template changes require Eleventy expertise to implement cleanly
- **ux-strategy-minion**: Guards against cluttering the landing page with SEO-driven content that hurts the user journey
- **software-docs-minion**: The docs site is both documentation AND an SEO surface being optimized

### Scope

**In scope**: Landing page meta tags, structured data (JSON-LD), OG/Twitter cards optimization, semantic HTML review, heading hierarchy audit, canonical URLs, robots.txt for both sites, sitemaps for both sites, `llms.txt` at site root, FAQ structured data, citation-friendly copy adjustments, Google Search Console verification tag, Lighthouse SEO 95+ target.

**Out of scope**: Paid advertising, content marketing, blog posts, link building, analytics dashboards, new page creation beyond `llms.txt`, changes to the API worker, changes to CSS/visual design (unless needed for a new FAQ section).

### External Skill Integration

No external skills detected relevant to this task. The only project-local skill (`ops-runbook`) covers operational procedures and has no relevance to SEO/GEO work.
