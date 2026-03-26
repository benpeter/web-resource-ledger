MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Feature list and competitor comparison table for WRL landing page and docs site.

Outcome: Prospective users can see at a glance how WRL compares to alternative web capture and archival approaches. A dedicated feature list and competition comparison table on the public site converts "what is this?" visitors into "I need this" users by showing WRL's cryptographic integrity advantage over every competitor. The feature list also highlights technical/developer capabilities (API, MCP server, Ed25519 signatures, WACZ format) so developer-minded visitors see that WRL is programmable and interoperable.

Success criteria:
- Landing site has a feature list section showing WRL's core capabilities
- Feature list includes technical/developer benefits subsection with links to docs
- Comparison table covers at least 9 competitors
- Table columns: integrity approach, cryptographic signing, independent timestamps, public verification, API access, standard format (WACZ), eIDAS support
- Each competitor row is factually accurate (no strawmanning)
- Responsive table on mobile
- Landing page (summary) and docs site (full version with detailed notes)

Constraints:
- Pure HTML + CSS, no JS framework
- Must match existing design system (design-system.css)

## Working Directory

/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/cuddly-sparking-badger

## Existing Structure

Landing page: landing/public/index.html (sections: Hero, Use Cases, How It Works, Pricing)
Landing CSS: landing/public/css/landing.css + design-system.css
Docs site: site/content/ (Eleventy-based, .md and .njk files)
Current docs pages: api-reference, architecture, authentication, batch, index, legal-evidence, limits, mcp, schedules, security/, verification, webhooks

## External Skill Discovery

Check .claude/skills/ and .skills/ for SKILL.md files. Only ops-runbook was found in .claude/skills/ — not relevant to this task.

## Instructions

1. Read relevant files to understand the codebase context
2. External skills: ops-runbook discovered, not relevant (classified as LEAF, not applicable)
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question
6. Return the meta-plan in structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-0ldPyr/feature-list-competitor-comparison/phase1-metaplan.md
