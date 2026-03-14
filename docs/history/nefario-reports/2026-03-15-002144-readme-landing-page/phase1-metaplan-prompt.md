MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
Restructure README as project landing page with usage examples and complete setup docs

Outcome: The README serves as an effective landing page so that someone encountering the project for the first time can quickly understand what WRL does and why it matters, see how to use it with concrete examples, and then find complete setup instructions — in that order. The current README buries the value proposition and omits critical setup steps (CAPTURE_API_KEY), making first-time adoption unnecessarily difficult.

Success criteria:
- README structure follows: positioning/why → usage examples → setup/deploy (in that order)
- Positioning section explains what WRL does and why someone would want tamper-evident web archival (1-2 sentences beyond the tagline)
- Usage section includes curl-based examples for the core flow: capture a URL, retrieve artifacts, validate a signed bundle (derived from openapi.yaml)
- CAPTURE_API_KEY setup is documented for both production (wrangler secret put) and local dev (.dev.vars), at parity with existing SIGNING_KEY docs
- README mentions that the project is built using despicable-agents
- README includes the despicable badge (gold/amber shields.io badge linking to the despicable-agents repo) and the vibe-coded-badge-action badge
- All existing setup instructions (KV namespace, R2 bucket, SIGNING_KEY) are preserved — nothing removed, only restructured and augmented

Scope:
- In: README.md content, structure, and ordering
- Out: openapi.yaml changes, code changes, new documentation files, evolution log structure, CLAUDE.md changes

Constraints:
- Must reference openapi.yaml for API details rather than duplicating the full spec
- despicable-agents mention should be natural, not promotional — it's part of the project's story
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

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
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-IFBYvJ/readme-landing-page/phase1-metaplan.md
