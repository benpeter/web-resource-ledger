MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
Execute the open-source readiness plan (phase 0012) for web-resource-ledger. This was planned with lucy, devx-minion, software-docs-minion, and margo.

**Outcome**: The repo meets baseline open-source hygiene standards so outside contributors can find, understand, and safely contribute to the project.

**Steps 1–8 only**:

1. Fix `.gitignore` — add `.DS_Store`, `*.log`, `.env`, `.vscode/`, `.idea/`; clean existing `.DS_Store` files
2. Fix `LICENSE` — fill in `[yyyy]` and `[name of copyright owner]` placeholders in the Apache 2.0 appendix
3. `package.json` metadata — add `description`, `license` ("Apache-2.0"), `repository`, `author`, `engines` (>=18)
4. Create `.nvmrc` with `18`
5. Create `.github/workflows/ci.yml` — minimal: checkout, setup-node (from .nvmrc), npm ci, npm test, npm run lint:api. No matrix, no coverage, no deploy.
6. Create `CONTRIBUTING.md` — short, practical. Prerequisites, local setup (tests are self-contained via Miniflare), dev server needs .dev.vars + Workers Paid for Browser Rendering, PR expectations, vanilla JS by design, links to backlog and evolution log.
7. Create `SECURITY.md` — supported versions (latest on main), report via GitHub Security Advisories, no bug bounty/SLAs.
8. Create `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.

**Constraints**:
- Follow CLAUDE.md evolution log requirements (create `docs/evolution/0012-open-source-readiness/`)
- Margo-approved scope only — no ESLint, no Dependabot, no issue/PR templates, no CODEOWNERS, no release automation
- Single PR against `main`

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
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
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-2Ir2JF/open-source-readiness/phase1-metaplan.md`
