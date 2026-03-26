MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

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

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan
(see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ABryFQ/seo-geo-optimization/phase1-metaplan.md`
