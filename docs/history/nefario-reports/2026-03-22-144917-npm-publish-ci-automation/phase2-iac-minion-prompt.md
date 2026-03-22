You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
**Outcome**: The @w-r-l/verify npm package is published automatically via CI on tag push, with version bump tooling and changelog generation. Manual npm publish is no longer needed.

**Success criteria**:
- GitHub Actions workflow triggers on `v*` tag push to the `verify/` directory
- Workflow runs tests, builds, and publishes to npm under the @w-r-l org
- npm publish uses a scoped automation token stored as a GitHub Actions secret
- Version bump script updates package.json version and creates a git tag in one command
- CHANGELOG.md is generated from conventional commits (or a lightweight equivalent) covering changes since last tag
- Publishing a pre-existing version fails gracefully (no broken CI state)
- The existing v0.1.0 package on npm is unaffected

**Constraints**:
- npm org @w-r-l already exists; package @w-r-l/verify is already published at v0.1.0
- Workflow must not publish on every push to main -- only on explicit tag push
- The verify tool lives in `packages/verify/` subdirectory; workflow should only trigger for changes in that path

## Your Planning Question
What is the optimal GitHub Actions workflow design for tag-triggered npm publishing in a monorepo subdirectory (`packages/verify/`)? Specifically: (a) How should the trigger filter work -- `tags: ['v*']` with or without path filtering (tags don't have path context)? (b) Should the workflow run the package's own tests (`node --test`) or also root-level vitest tests? (c) What is the correct approach for `npm publish` with `--provenance` on GitHub Actions (OIDC permissions)? (d) How should the workflow handle the case where the version already exists on npm (exit code handling)?

## Context
Existing workflows at `.github/workflows/` (ci.yml, deploy-staging.yml, deploy-production.yml), `packages/verify/package.json`, `.nvmrc` (node 22), root `package.json`. Existing CI uses SHA-pinned actions (`actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`, `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`). No existing git tags.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in the format below
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-g11yDo/npm-publish-ci-automation/phase2-iac-minion.md`

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks with deliverables and dependencies>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved, or "None">
