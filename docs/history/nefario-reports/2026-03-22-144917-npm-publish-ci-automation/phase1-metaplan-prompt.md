MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
**Outcome**: The @w-r-l/verify npm package is published automatically via CI on tag push, with version bump tooling and changelog generation. Manual npm publish is no longer needed.

**Success criteria**:
- GitHub Actions workflow triggers on `v*` tag push to the `verify/` directory
- Workflow runs tests, builds, and publishes to npm under the @w-r-l org
- npm publish uses a scoped automation token stored as a GitHub Actions secret
- Version bump script updates package.json version and creates a git tag in one command
- CHANGELOG.md is generated from conventional commits (or a lightweight equivalent) covering changes since last tag
- Publishing a pre-existing version fails gracefully (no broken CI state)
- The existing v0.1.0 package on npm is unaffected

**Scope**:
- In: GitHub Actions publish workflow, version bump script, changelog generation, npm token secret setup
- Out: Monorepo publish orchestration (only @w-r-l/verify for now), GitHub Releases (nice-to-have, not required), pre-release/beta channel

**Constraints**:
- npm org @w-r-l already exists; package @w-r-l/verify is already published at v0.1.0
- Workflow must not publish on every push to main -- only on explicit tag push
- The verify tool lives in `packages/verify/` subdirectory (issue says `verify/` but actual path is `packages/verify/`); workflow should only trigger for changes in that path

**Codebase context**:
- Existing CI workflows: ci.yml (test on push/PR), deploy-production.yml, deploy-staging.yml, vibe-coded-badge.yml
- Package at packages/verify/package.json: @w-r-l/verify v0.1.0, ESM, node>=20, uses node --test
- No existing publish workflow
- Existing CI uses actions/checkout@v4.2.2 (pinned SHA), actions/setup-node@v4.4.0 (pinned SHA)
- .nvmrc exists at root for node version

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/encapsulated-splashing-melody

## External Skill Discovery
Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning)
5. For each specialist, write a specific planning question
6. Return the meta-plan in the structured format
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-g11yDo/npm-publish-ci-automation/phase1-metaplan.md`
