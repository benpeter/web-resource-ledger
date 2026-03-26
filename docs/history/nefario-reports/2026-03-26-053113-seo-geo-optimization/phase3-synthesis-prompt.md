MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
SEO + GEO optimization for the Web Resource Ledger landing page and docs site. Combines traditional SEO (#136) and generative engine optimization (#137) into a single pass, since both touch the same files.

### SEO (#136)
- Unique, keyword-optimized title tags and meta descriptions on all pages
- Structured data (JSON-LD) for Organization, Product, and FAQ
- Open Graph and Twitter Card meta tags
- Google Search Console verified, sitemap submitted
- Lighthouse SEO audit score 95+
- Semantic HTML, headings hierarchy, canonical URLs, robots.txt

### GEO (#137)
- Landing page content structured for LLM extractability
- Schema.org structured data covers Product, Organization, FAQ, HowTo
- llms.txt file at site root with machine-readable product summary
- Citation-friendly copy with specific numbers and use cases

### Scope
- In: Landing page + docs site meta tags, structured data, semantic HTML, sitemap, robots.txt, OG/Twitter cards, Search Console setup, llms.txt, FAQ sections
- Out: Paid advertising, content marketing, blog posts, link building, analytics dashboards

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase2-seo-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase2-frontend-minion.md

## Key consensus across specialists:

### seo-minion
- Biggest gaps: missing OG image, docs site baseUrl bug (points to wrong domain), zero docs SEO infrastructure, no llms.txt
- Landing page strong but needs FAQ section, meta description fix, HowTo JSON-LD
- Proposes 12 tasks with OG image and baseUrl fix as unblocking first tasks
- Critical bug: site.js baseUrl is https://webresourceledger.com instead of https://docs.webresourceledger.com

### frontend-minion
- Template-based approach over plugins for docs site (simpler for 17 pages)
- Landing page work is additive, not a rebuild
- Docs needs complete SEO infrastructure build
- Proposes 7 tasks, baseUrl fix is prerequisite
- Inline OG tags in base.njk preferred over partials

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase3-synthesis.md

Important notes:
- This project uses vanilla JS/HTML/CSS — no frameworks. The landing page is static HTML with no build system.
- The docs site uses Eleventy with Nunjucks templates.
- The project CLAUDE.md emphasizes YAGNI and KISS principles.
- Keep the number of tasks reasonable — consolidate where possible.
- Each execution task prompt must be fully self-contained (agent will not see other task outputs unless explicitly passed).
- Use seo-minion for content/schema spec tasks, frontend-minion for implementation tasks.
- OG image creation should NOT be a task — it requires design assets that don't exist. Use a text-based OG image approach or skip it (out of scope per issue).
- The issue scope says "Out: analytics dashboards" — Google Search Console verification tag is a simple meta tag, which is in scope, but actual Search Console setup/submission is a manual step.
