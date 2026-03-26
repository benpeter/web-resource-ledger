MODE: META-PLAN

You are creating a revised meta-plan after a team adjustment.

## Task

<github-issue>
## SEO + GEO optimization

Combines traditional search engine optimization (#136) and generative engine optimization (#137) into a single pass, since both touch the same files (landing page HTML, meta tags, structured data, docs site).

### SEO (#136)
- Unique, keyword-optimized title tags and meta descriptions on all pages
- Structured data (JSON-LD) for Organization, Product, and FAQ
- Open Graph and Twitter Card meta tags
- Google Search Console verified, sitemap submitted
- Lighthouse SEO audit score 95+
- Semantic HTML, headings hierarchy, canonical URLs, robots.txt

### GEO (#137)
- Landing page content structured for LLM extractability (clear factual claims, concise definitions, FAQ format)
- Schema.org structured data covers Product, Organization, FAQ, HowTo
- `llms.txt` file at site root with machine-readable product summary
- Citation-friendly copy with specific numbers and use cases

## Scope
- In: Landing page + docs site meta tags, structured data, semantic HTML, sitemap, robots.txt, OG/Twitter cards, Search Console setup, llms.txt, FAQ sections
- Out: Paid advertising, content marketing, blog posts, link building, analytics dashboards
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/giggly-jingling-stallman

## Original Meta-Plan
Read the original meta-plan from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase1-metaplan.md

The following meta-plan was produced for the original team. Use it as context for the revised plan, not as a template to minimally edit.

## Team Adjustment
- Removed: ai-modeling-minion, ux-strategy-minion, software-docs-minion
- Revised team: seo-minion, frontend-minion
- Rationale: seo-minion covers GEO strategy (llms.txt, structured data, LLM extractability). frontend-minion covers Eleventy template and static HTML implementation. Clean what/how separation. Original team had 3x coordination overhead for what is fundamentally "add metadata and markup to two sites."

## Constraints
- Keep the same scope and task description
- Preserve external skill integration decisions unless the team change removes all agents relevant to a skill's domain
- Generate planning consultations for ALL agents in the revised team (seo-minion, frontend-minion)
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request (beyond cross-cutting requirements)
- Design planning questions as a coherent set -- each question should address aspects that no other agent on the team covers, and questions should reference cross-cutting boundaries where relevant

## Instructions
1. Read relevant files to understand the codebase context
2. Generate planning consultations for the revised team
3. Update the cross-cutting checklist
4. Write your complete revised meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase1-metaplan-rerun.md`
