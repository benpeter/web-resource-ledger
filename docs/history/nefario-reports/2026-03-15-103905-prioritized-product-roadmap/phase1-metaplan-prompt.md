MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Review backlog and produce a prioritized product roadmap

**Outcome**: The existing backlog (`docs/backlog.md`) is transformed into a sequenced product roadmap that defines a meaningful evolution path for WRL. Each roadmap item is scoped and described well enough to become a GitHub issue without further research, so that issue creation is a mechanical follow-up step rather than a planning session.

**Success criteria**:
- Every backlog item is explicitly addressed (prioritized, deferred, or dropped with rationale)
- Roadmap items are sequenced with dependency reasoning (what enables what)
- Each item has a one-line summary, outcome statement, and rough scope — sufficient to seed a GitHub issue title + body
- The roadmap distinguishes between near-term (next 1-3 phases), mid-term, and longer-horizon work
- Product coherence: the sequence tells a story of incremental value, not a grab-bag of tasks

**Scope**:
- In: Reviewing `docs/backlog.md`, evolution log context, current codebase state; producing a prioritized roadmap document
- Out: Creating GitHub issues (tracked separately), writing code, changing architecture, modifying existing backlog format

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan (see your Core Knowledge for the output format).

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as ORCHESTRATION or LEAF (see External Skill Integration in your Core Knowledge)
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase1-metaplan.md`
