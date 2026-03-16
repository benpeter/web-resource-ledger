MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Fix secrets and environment setup documentation for fork-ready onboarding

**Outcome**: A developer forking WRL can get both staging and production CD pipelines running by following README.md and OPERATIONS.md alone, without needing to reverse-engineer which secrets go where, what Cloudflare token permissions are required, or what infrastructure must pre-exist. This closes documentation gaps exposed during the pipeline fix session on 2026-03-16.

**Success criteria**:
- OPERATIONS.md lists the 5 specific Cloudflare API token permissions (Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read)
- OPERATIONS.md explains that Worker secrets persist across deploys and the CD pipeline only deploys code
- A "secret surfaces" explanation exists (once, in one file, cross-referenced from the other) covering: Cloudflare Worker secrets (runtime), GitHub environment secrets (CI), `.dev.vars` (local dev)
- README.md staging section documents KV namespace creation, R2 bucket creation, and wrangler.toml KV ID requirement
- Coralogix send key sourcing is documented (Settings > Send Your Data > API Keys)
- OPERATIONS.md environment setup tables link to README secret generation commands rather than duplicating them
- No content duplication between README.md and OPERATIONS.md — one is source of truth, the other cross-references
- Evolution log phase references today's pipeline fixes as context

**Scope**:
- In: README.md setup/staging sections, OPERATIONS.md environment setup section, evolution log entry for this phase
- Out: Code changes, workflow changes, wrangler.toml changes, new documentation files, CI pipeline modifications

**Constraints**:
- URLs in OPERATIONS.md remain as placeholders (they are correctly fork-dependent)
- Assume the reader knows Cloudflare Workers basics — document WRL-specific setup, not Workers 101

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
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-k31WEo/secrets-env-docs-onboarding/phase1-metaplan.md
