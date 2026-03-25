You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

WRL's API is formally versioned at 1.0.0 with a published changelog, deprecation policy, and semantic versioning for Worker releases. This signals stability to integrators and establishes a contract for how breaking changes will be communicated.

Success criteria:
- openapi.yaml version field set to 1.0.0
- CHANGELOG.md published at repo root with all changes since initial release
- Deprecation policy documented: minimum 6-month notice
- Deprecated endpoints return Deprecation and Sunset headers per RFC 8594
- Worker releases tagged with semantic versions (annotated tags)
- CI enforces that openapi.yaml version matches the latest git tag
- API version header (WRL-API-Version) returned on all responses
- CHANGELOG.md updated as part of every PR that changes API behavior

## Your Planning Question

How should CI enforce that openapi.yaml version matches the latest git tag? The current CI (ci.yml) runs `npm test` and `redocly lint openapi.yaml` in the test job, with a code-change gate that skips tests for docs-only changes. What's the minimal addition -- a shell script step in the existing test job, a dedicated job, or a reusable action? Should the version check be a pre-commit hook, a CI step, or both? How should annotated git tags be created -- manually via `git tag -a`, via GitHub Release UI, or automated on merge to main? The deploy pipeline (deploy-production.yml) already reads package.json version via `jq -r .version` and injects it as BUILD_VERSION. How should the tag, openapi.yaml version, and package.json version stay synchronized? What's the right PR template checklist item to enforce CHANGELOG.md updates -- and should CI also lint for it?

## Context

- Current CI workflow: ci.yml with test + test-integration jobs, code-change gate that skips for docs-only changes
- deploy-production.yml already injects BUILD_VERSION from package.json, validates semver format at line 61
- deploy-staging.yml uses same pattern
- The only existing tag is verify/v0.1.0 (a sub-package tag, not the main API)
- No PR template exists
- No pre-commit hooks exist
- This is a Cloudflare Workers project deployed via wrangler

## Context Boundary
iac-minion designs the CI enforcement mechanism and tag workflow. api-design-minion decides the version-coupling semantics (what must match what). iac-minion implements that coupling as a CI check.

## Instructions
1. Read .github/workflows/ci.yml, .github/workflows/deploy-production.yml, and .github/workflows/deploy-staging.yml to understand the current CI/CD state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution in this format:

## Domain Plan Contribution: iac-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase2-iac-minion.md
