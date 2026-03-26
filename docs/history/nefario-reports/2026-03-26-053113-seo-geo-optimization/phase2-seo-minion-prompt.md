You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
SEO + GEO optimization for the Web Resource Ledger landing page and docs site. Combines traditional SEO and generative engine optimization into a single pass.

### SEO requirements
- Unique, keyword-optimized title tags and meta descriptions on all pages
- Structured data (JSON-LD) for Organization, Product, and FAQ
- Open Graph and Twitter Card meta tags
- Google Search Console verified, sitemap submitted
- Lighthouse SEO audit score 95+
- Semantic HTML, headings hierarchy, canonical URLs, robots.txt

### GEO requirements
- Landing page content structured for LLM extractability (clear factual claims, concise definitions, FAQ format)
- Schema.org structured data covers Product, Organization, FAQ, HowTo
- llms.txt file at site root with machine-readable product summary
- Citation-friendly copy with specific numbers and use cases

### Scope
- In: Landing page + docs site meta tags, structured data, semantic HTML, sitemap, robots.txt, OG/Twitter cards, Search Console setup, llms.txt, FAQ sections
- Out: Paid advertising, content marketing, blog posts, link building, analytics dashboards

## Your Planning Question
This task covers both traditional SEO and generative engine optimization across two sites. Given the current state (landing page has Organization + SoftwareApplication JSON-LD, OG/Twitter cards, robots.txt, sitemap; docs site has only basic title/description), plan the full strategy:

1. **Structured data architecture**: Which JSON-LD types (Organization, Product, FAQ, HowTo, SoftwareApplication) go on which pages? The landing page already has Organization and SoftwareApplication -- what needs adding vs. refining? What structured data belongs on the docs site pages?
2. **Sitemap strategy**: Should each subdomain have its own sitemap, or should one reference the other? How should the docs site sitemap be generated (Eleventy plugin vs. static)?
3. **Keyword strategy**: For a developer-tools product in the web evidence/archiving niche, what target keywords should drive per-page title/description optimization?
4. **GEO / LLM extractability**: What should llms.txt contain? Beyond structured data, what content patterns on the landing page make it most useful for LLM citation -- specific claims, factual anchors, FAQ format? Are there content anti-patterns to avoid (marketing fluff LLMs filter out)?
5. **Meta tag audit**: The landing page OG/Twitter cards exist but may not be optimized. The docs site has none. What's the per-page meta tag template for each site?
6. **FAQ content**: Should a visible FAQ section be added to the landing page for both human visitors and structured data, or should FAQ schema reference existing content? What questions should it cover?
7. **Cross-site coordination**: robots.txt for docs site, canonical URL strategy, heading hierarchy requirements -- anything the frontend-minion needs as a spec to implement correctly.

## Context
Read these files to understand the current state:
- landing/public/index.html (full file -- has existing structured data and meta tags)
- site/_includes/layouts/base.njk (current template head)
- site/_data/site.js (nav/page list)
- landing/public/robots.txt
- landing/public/sitemap.xml
- PRODUCT.md (if it exists)
- site/content/ directory to see what docs pages exist

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: seo-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase2-seo-minion.md
