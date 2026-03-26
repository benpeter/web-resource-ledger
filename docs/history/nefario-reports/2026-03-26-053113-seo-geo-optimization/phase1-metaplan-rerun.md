# Meta-Plan: SEO + GEO Optimization (Revised)

## Context Summary

The project has two web properties:
- **Landing page** (`landing/public/`) -- static HTML at `webresourceledger.com`, deployed via Cloudflare Pages. Already has: title, meta description, canonical URL, OG/Twitter cards, Organization + SoftwareApplication JSON-LD, robots.txt, sitemap.xml (landing pages only -- missing docs site pages).
- **Docs site** (`site/`) -- Eleventy-based at `docs.webresourceledger.com`, deployed via Cloudflare Pages. Has basic `<title>` and `<meta description>` via Nunjucks template but NO structured data, NO OG/Twitter cards, NO sitemap, NO robots.txt. 16 content pages.

Neither site has: FAQ structured data, HowTo schema, `llms.txt`, per-page keyword optimization, or Google Search Console verification.

The ops-runbook skill is the only project-local skill and is irrelevant to this task.

## Team

- **seo-minion**: SEO/GEO strategy -- structured data schema design, keyword optimization, sitemap architecture, `llms.txt`, LLM extractability patterns, meta tag strategy
- **frontend-minion**: Implementation -- Eleventy template modifications, static HTML edits, JSON-LD injection, sitemap generation

## Planning Consultations

### Consultation 1: SEO + GEO Strategy and Structured Data Architecture
- **Agent**: seo-minion
- **Planning question**: This task covers both traditional SEO and generative engine optimization across two sites. Given the current state (landing page has Organization + SoftwareApplication JSON-LD, OG/Twitter cards, robots.txt, sitemap; docs site has only basic title/description), plan the full strategy:
  1. **Structured data architecture**: Which JSON-LD types (Organization, Product, FAQ, HowTo, SoftwareApplication) go on which pages? The landing page already has Organization and SoftwareApplication -- what needs adding vs. refining? What structured data belongs on the docs site pages?
  2. **Sitemap strategy**: Should each subdomain have its own sitemap, or should one reference the other? How should the docs site sitemap be generated (Eleventy plugin vs. static)?
  3. **Keyword strategy**: For a developer-tools product in the web evidence/archiving niche, what target keywords should drive per-page title/description optimization?
  4. **GEO / LLM extractability**: What should `llms.txt` contain? Beyond structured data, what content patterns on the landing page make it most useful for LLM citation -- specific claims, factual anchors, FAQ format? Are there content anti-patterns to avoid (marketing fluff LLMs filter out)?
  5. **Meta tag audit**: The landing page OG/Twitter cards exist but may not be optimized. The docs site has none. What's the per-page meta tag template for each site?
  6. **FAQ content**: Should a visible FAQ section be added to the landing page for both human visitors and structured data, or should FAQ schema reference existing content? What questions should it cover?
  7. **Cross-site coordination**: robots.txt for docs site, canonical URL strategy, heading hierarchy requirements -- anything the frontend-minion needs as a spec to implement correctly.
- **Context to provide**: `landing/public/index.html` (full file -- has existing structured data and meta tags), `site/_includes/layouts/base.njk` (current template head), `site/_data/site.js` (nav/page list), existing `landing/public/robots.txt` and `landing/public/sitemap.xml`, `PRODUCT.md`
- **Why this agent**: Owns the entire SEO/GEO domain. With ai-modeling-minion removed from the team, seo-minion must also cover the GEO content strategy (LLM extractability patterns, `llms.txt` design, citation-friendly copy). This agent produces the spec that frontend-minion implements.

### Consultation 2: Eleventy + Static HTML Implementation Architecture
- **Agent**: frontend-minion
- **Planning question**: Two implementation surfaces need modifying: a static HTML landing page and an Eleventy docs site. Plan the implementation approach:
  1. **Docs site template changes**: The base template (`base.njk`) needs OG tags, Twitter cards, and JSON-LD structured data injected. What's the cleanest approach using Eleventy's data cascade -- frontmatter per page, computed data, or data files? Should structured data be inline in `base.njk` or a separate Nunjucks partial?
  2. **Docs site sitemap**: Should we use an Eleventy plugin (e.g., `@11ty/eleventy-plugin-sitemap` or `eleventy-plugin-sitemap`) or generate it via a template? What about `robots.txt` -- template or static file?
  3. **Landing page modifications**: The landing page is static HTML (no build system). What's the best approach for adding/modifying JSON-LD blocks, potentially adding a FAQ section, and creating `llms.txt`? Any concerns about the existing structured data that needs refactoring?
  4. **File ownership**: List the specific files that need creating or modifying across both sites, so we can assign clean ownership boundaries between tasks. Note: seo-minion will provide the content/schema specs -- this question is about the template architecture and file structure for housing that content.
  5. **Validation approach**: How should we validate the structured data and meta tags post-implementation (Google Rich Results Test, Schema.org validator, Lighthouse)? Can any of this be automated in CI?
- **Context to provide**: `site/eleventy.config.js`, `site/_includes/layouts/base.njk`, `site/_includes/layouts/doc.njk`, `site/_data/site.js`, `site/content/index.md` (frontmatter example), `site/package.json`, `landing/public/index.html` (head section)
- **Why this agent**: Knows Eleventy's data cascade, template partials, and plugin ecosystem. The docs site implementation requires understanding how Eleventy processes frontmatter, computed data, and build-time generation. Also covers the static HTML landing page changes.

### Cross-Cutting Checklist
- **Testing**: Exclude from planning. No executable code is produced -- this is HTML, meta tags, and structured data. Lighthouse SEO audits serve as validation and can be run manually. Structured data validators (Google Rich Results Test, Schema.org) are the "tests" for this work.
- **Security**: Exclude from planning. No auth, API, user input, secrets, infrastructure, or dependency changes. Structured data and meta tags are read-only content consumed by crawlers and LLMs.
- **Usability -- Strategy**: Exclude from planning. The original meta-plan included ux-strategy-minion to evaluate whether a visible FAQ section would clutter the landing page. With the revised team, this concern is absorbed into seo-minion's planning question (item 6 asks whether FAQ should be visible or schema-only). If seo-minion recommends a visible FAQ section, the execution plan's Phase 3.5 review (ux-strategy-minion is mandatory) will catch any cognitive load issues before implementation.
- **Usability -- Design**: Exclude from planning. No new UI components or interaction patterns are being designed. If a visible FAQ section is added, it follows existing page patterns. Phase 3.5 mandatory review handles this.
- **Documentation**: Exclude from planning. The docs site is being modified for SEO/meta purposes, not content changes. The original meta-plan included software-docs-minion to advise on frontmatter changes, but frontend-minion already covers Eleventy frontmatter architecture (Consultation 2, item 1). Phase 8 post-execution documentation assessment will flag any gaps.
- **Observability**: Exclude from planning. No runtime components, APIs, or services are being created or modified.

### Notable Exclusions

- **ai-modeling-minion**: Removed per team adjustment. GEO/LLM extractability planning absorbed by seo-minion (Consultation 1, items 4 and 6). seo-minion's domain includes structured data and content patterns for search visibility, which overlaps substantially with GEO.
- **ux-strategy-minion**: Removed per team adjustment. The key planning question (visible FAQ vs. schema-only) is now in seo-minion's consultation. Phase 3.5 mandatory review by ux-strategy-minion provides a safety net before execution.
- **software-docs-minion**: Removed per team adjustment. Docs site frontmatter/template architecture is covered by frontend-minion. No docs content is changing -- only meta tags and structured data wrappers around existing content.

### Anticipated Approval Gates

1. **Structured data schema design** (MUST gate) -- Which JSON-LD types go on which pages, what content they contain, and the `llms.txt` specification. Hard to reverse (search engines cache structured data) and every implementation task depends on it. seo-minion proposes; user approves before HTML is modified.

2. **FAQ content** (OPTIONAL gate) -- Only if seo-minion recommends a visible FAQ section on the landing page. New user-facing content on the primary conversion page warrants review. If FAQ is schema-only (no visible section), no gate needed.

### Rationale

The revised two-agent team provides a clean what/how separation: seo-minion produces the complete SEO/GEO specification (structured data schemas, meta tag templates, keyword targets, `llms.txt` content, sitemap architecture), and frontend-minion implements it across both sites. This eliminates the coordination overhead of the original five-agent team while preserving domain expertise where it matters most.

The planning questions are designed as a coherent pair: seo-minion answers "what goes where and why" (the spec), frontend-minion answers "how to implement it cleanly in each site's architecture" (the template design). Each consultation covers ground the other does not, and they reference each other's boundaries explicitly (seo-minion item 7 produces specs for frontend-minion; frontend-minion item 4 maps files for clean task ownership).

Cross-cutting concerns (usability, security, testing, docs) are handled by Phase 3.5 mandatory reviewers and Phase 8 post-execution, not by adding planning agents. This is appropriate because the task produces no executable code, no new UI patterns, and no API changes.

### Scope

**In scope**: Landing page meta tags, structured data (JSON-LD), OG/Twitter cards optimization, semantic HTML review, heading hierarchy audit, canonical URLs, robots.txt for both sites, sitemaps for both sites, `llms.txt` at site root, FAQ structured data, citation-friendly copy adjustments, Google Search Console verification tag, Lighthouse SEO 95+ target.

**Out of scope**: Paid advertising, content marketing, blog posts, link building, analytics dashboards, new page creation beyond `llms.txt`, changes to the API worker, changes to CSS/visual design (unless needed for a new FAQ section).

### External Skill Integration

No external skills detected relevant to this task. The only project-local skill (`ops-runbook`) covers operational procedures and has no relevance to SEO/GEO work.
