# Margo Review: SEO + GEO Optimization

## Verdict: APPROVE

This plan is well-proportioned to the problem. It adds metadata and markup to two static sites using zero new dependencies, zero build tool changes, zero abstraction layers, and zero runtime components. The "What NOT to do" sections on both tasks show the plan has already internalized YAGNI and KISS constraints.

### What I checked

**Complexity budget**: Near zero. No new technologies, no new services, no new dependencies, no new abstraction layers. All changes are static HTML/Nunjucks edits and three new plain-text files.

**Scope alignment**: The request asks for SEO + GEO optimization across landing page and docs site. The plan delivers exactly that -- meta tags, structured data, sitemaps, robots.txt, llms.txt, FAQ section. No adjacent features, no future-proofing, no technology expansion.

**YAGNI compliance**: The plan explicitly excludes: Eleventy plugins, separate partial files for JSON-LD, per-page TechArticle structured data, lastmod in sitemaps, og:image tags, JavaScript FAQ accordions. These are all correct exclusions.

**Dependency count**: Zero new dependencies. The docs site sitemap uses a Nunjucks template instead of an Eleventy sitemap plugin. The landing page remains static HTML with no build system. This is the right call.

**Abstraction layers**: Zero new layers. JSON-LD is inline in templates, not extracted into partials or data files. The docsUrl field is a simple string addition to an existing data file, not a URL-resolution abstraction.

**Task count**: 3 tasks for two sites plus validation. Proportional to scope. No inflation.

**Infrastructure proportionality**: No infrastructure changes whatsoever. Pure content and markup edits.

### Minor observations (non-blocking, no action required)

The Enterprise Offer in the AggregateOffer JSON-LD (Task 2, step 3) sets `"price": "0"` which is technically incorrect for an enterprise tier with custom pricing. This is a domain-correctness concern, not a complexity concern -- outside my scope to adjudicate.

The approval gate on Task 2 is justified. The FAQ section is the only part of this plan that adds visible content rather than invisible metadata, and it touches page structure, navigation, and multiple JSON-LD blocks.
