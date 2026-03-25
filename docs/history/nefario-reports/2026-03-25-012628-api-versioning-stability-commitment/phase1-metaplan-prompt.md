MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
**Outcome**: WRL's API is formally versioned at 1.0.0 with a published changelog, deprecation policy, and semantic versioning for Worker releases. This signals stability to integrators and establishes a contract for how breaking changes will be communicated.

**Success criteria**:
- openapi.yaml version field set to 1.0.0
- CHANGELOG.md published at repo root with all changes since initial release, annotated as breaking or non-breaking
- Deprecation policy documented: minimum 6-month notice before removing or changing any endpoint behavior
- Deprecated endpoints return `Deprecation` and `Sunset` headers per RFC 8594
- Worker releases tagged with semantic versions (e.g., v1.0.0) in git
- CI enforces that openapi.yaml version matches the latest git tag
- API version header (`WRL-API-Version`) returned on all responses for future v2 negotiation
- CHANGELOG.md updated as part of every PR that changes API behavior (enforced by PR template checklist)

**Scope**:
- In: openapi.yaml 1.0.0, CHANGELOG.md, deprecation policy document, semantic version tags, `WRL-API-Version` response header, CI version check
- Out: API version negotiation (v2 routing), automated changelog generation, SDK versioning, client library generation

**Constraints**:
- Depends on all v1 API surface features being stable: R15 (MCP), R18 (batch), R27 (webhooks), R33 (capture auth gate)
- Version 1.0.0 is a commitment: no breaking changes without a major version bump
- Changelog format should follow Keep a Changelog (keepachangelog.com)
- Git tags must be annotated tags, not lightweight
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/crystalline-dreaming-sutton

## Codebase Context

Key files:
- openapi.yaml: currently version 0.8.0 (info.version field)
- package.json: currently version 0.1.0
- src/responses.js: central response helpers (jsonResponse, problemResponse) — ideal injection point for WRL-API-Version header
- src/index.js: main router with all route definitions
- .github/workflows/ci.yml: runs `npm test` and `npm run lint:api` (redocly lint openapi.yaml)
- No CHANGELOG.md at repo root (only packages/verify/CHANGELOG.md)
- No deprecation policy document exists
- No PR template exists (.github/pull_request_template.md not found)
- No existing Deprecation/Sunset/WRL-API-Version headers in codebase
- No external skills discovered in .claude/skills/ or .skills/

## External Skill Discovery
No project-local skills found in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills to discover — skip external skill integration
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase1-metaplan.md
