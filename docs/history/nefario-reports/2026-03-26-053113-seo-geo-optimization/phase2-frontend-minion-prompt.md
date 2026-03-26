You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
SEO + GEO optimization for the Web Resource Ledger landing page and docs site. Combines traditional SEO and generative engine optimization into a single pass.

### SEO requirements
- Unique, keyword-optimized title tags and meta descriptions on all pages
- Structured data (JSON-LD) for Organization, Product, and FAQ
- Open Graph and Twitter Card meta tags
- Lighthouse SEO audit score 95+
- Semantic HTML, headings hierarchy, canonical URLs, robots.txt

### GEO requirements
- Landing page content structured for LLM extractability
- Schema.org structured data covers Product, Organization, FAQ, HowTo
- llms.txt file at site root with machine-readable product summary

### Scope
- In: Landing page + docs site meta tags, structured data, semantic HTML, sitemap, robots.txt, OG/Twitter cards, llms.txt, FAQ sections
- Out: Paid advertising, content marketing, blog posts, link building, analytics dashboards

## Your Planning Question
Two implementation surfaces need modifying: a static HTML landing page and an Eleventy docs site. Plan the implementation approach:

1. **Docs site template changes**: The base template (base.njk) needs OG tags, Twitter cards, and JSON-LD structured data injected. What's the cleanest approach using Eleventy's data cascade -- frontmatter per page, computed data, or data files? Should structured data be inline in base.njk or a separate Nunjucks partial?
2. **Docs site sitemap**: Should we use an Eleventy plugin (e.g., @11ty/eleventy-plugin-sitemap or eleventy-plugin-sitemap) or generate it via a template? What about robots.txt -- template or static file?
3. **Landing page modifications**: The landing page is static HTML (no build system). What's the best approach for adding/modifying JSON-LD blocks, potentially adding a FAQ section, and creating llms.txt? Any concerns about the existing structured data that needs refactoring?
4. **File ownership**: List the specific files that need creating or modifying across both sites, so we can assign clean ownership boundaries between tasks. Note: seo-minion will provide the content/schema specs -- this question is about the template architecture and file structure for housing that content.
5. **Validation approach**: How should we validate the structured data and meta tags post-implementation (Google Rich Results Test, Schema.org validator, Lighthouse)? Can any of this be automated in CI?

## Context
Read these files to understand the current state:
- site/eleventy.config.js
- site/_includes/layouts/base.njk
- site/_includes/layouts/doc.njk
- site/_data/site.js
- site/content/index.md (frontmatter example)
- site/package.json
- landing/public/index.html (head section)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: frontend-minion

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

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase2-frontend-minion.md
