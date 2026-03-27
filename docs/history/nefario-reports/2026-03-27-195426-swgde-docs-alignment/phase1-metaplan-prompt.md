MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Align WRL's documentation with SWGDE's Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024). This is a documentation-only task: map WRL's existing capabilities to SWGDE terminology and recommendations, create a SWGDE compliance mapping page on the docs site, and update existing docs pages to reference the standard where relevant.

In scope:
- New docs page: site/content/swgde-compliance.md -- SWGDE compliance mapping page that walks through each relevant SWGDE section and shows how WRL satisfies it, with honest identification of areas where WRL's automated approach differs from SWGDE's manual-examiner model.
- Update legal-evidence.md: Add a section or cross-reference to SWGDE alignment, positioning WRL captures alongside FRE and eIDAS coverage.
- Update verification.md: Where verification checks map to SWGDE requirements (especially 7.3 Hashing), add cross-references.
- Update architecture.md: Where the pipeline description maps to SWGDE's configuration/contamination requirements (3.4, 4.1), note the alignment.
- SEO value: Use SWGDE-specific terminology ("forensically sound", "collection documentation", "tool validation", "content volatility") naturally in the new and updated pages.

Out of scope:
- Code changes: No runtime, API, or pipeline changes. Documentation only.
- Claiming SWGDE certification: SWGDE does not certify products.
- Other SWGDE documents: Only 21-F-001.
- Gap remediation: Document gaps honestly but do not implement fixes.

SWGDE sections to map (at minimum): 3.1, 3.4, 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1.1, 9

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/compressed-drifting-falcon

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context (especially site/content/ docs pages, the docs site structure, and existing legal-evidence.md, verification.md, architecture.md)
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ubBLmP/swgde-docs-alignment/phase1-metaplan.md
