MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
**Outcome**: A static landing page deployed on Cloudflare Pages at a custom domain, presenting WRL to prospective users with clear value propositions, use cases, and pricing. Built with plain HTML/CSS (no framework), using the WRL brand design system.

**Success criteria**:
- Hero section with tagline, one-sentence value prop, and primary CTA (link to docs or signup)
- How-it-works section: 3-step visual flow (capture, sign, verify)
- Use cases section covering: legal evidence, compliance archiving, AI agent web grounding, journalism source preservation
- Pricing section with tier cards showing usage-based pricing (free tier, pro tier, enterprise contact)
- Footer with links to: documentation site, web UI app, GitHub repo, terms of service, privacy
- Custom domain configured with HTTPS
- Page loads in <1s on 3G (no JS frameworks, minimal assets)
- Lighthouse performance score >= 95, accessibility score >= 90
- Responsive: works on mobile, tablet, desktop
- Deployed via Cloudflare Pages on push to main

**Scope**:
- In: Single-page static HTML/CSS, hero, how-it-works, use cases, pricing, footer, Cloudflare Pages deployment, custom domain
- Out: Blog, changelog page, interactive demos, signup form (links to the web UI instead), analytics/tracking

**Constraints**:
- No JavaScript frameworks -- plain HTML and CSS only
- Brand design system (BRAND phase) and Web UI (R17) should be available so the page can link to them
- Pricing tiers are illustrative placeholders until billing (R29) ships -- must be easy to update
- Must not duplicate content from the docs site; link to it instead
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/gleaming-noodling-quokka

## Codebase Context
- Brand design system exists at src/design-system.css (CSS custom properties) and documented in docs/style-guide.md
- Design system JS version at src/design-system.js (for embedding in Workers)
- Documentation site at site/ directory, deployed to docs.webresourceledger.com via Cloudflare Pages
- Web UI is inline in the Worker (src/ui/*.js), no separate app subdomain yet
- Logo assets: src/assets/logo-w-check.svg (primary mark), site/assets/ has copies
- Domain: webresourceledger.com, planned subdomain: webresourceledger.com (root) for landing page
- Docs site wrangler.toml at site/wrangler.toml, uses [assets] directory = "./_output"
- Existing deploy workflow: .github/workflows/deploy-docs.yml for the docs site
- No existing landing page directory or structure yet

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan (see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question that draws on their unique expertise
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wpZsJf/landing-page/phase1-metaplan.md
