MODE: META-PLAN

You are re-running the meta-plan for an adjusted team.

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
- Depends on all v1 API surface features being stable
- Version 1.0.0 is a commitment: no breaking changes without a major version bump
- Changelog format should follow Keep a Changelog (keepachangelog.com)
- Git tags must be annotated tags, not lightweight
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/crystalline-dreaming-sutton

## Original Meta-Plan
Read from: /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase1-metaplan.md

The following meta-plan was produced for the original team. Use it as context for the revised plan, not as a template to minimally edit.

## Team Adjustment
Added: (none)
Removed: ux-strategy-minion, software-docs-minion, user-docs-minion

Revised team: api-design-minion, api-spec-minion, iac-minion, test-minion

Rationale for removals:
- ux-strategy-minion: No UX design decisions in scope. Already a mandatory Phase 3.5 reviewer.
- software-docs-minion: Single-page deprecation policy doc does not warrant a planning specialist. Content determined by api-design-minion's RFC 8594 decisions.
- user-docs-minion: CHANGELOG.md owned by api-spec-minion. "Versioning guide" and "docs site updates" are not in the success criteria.

## Instructions
- Keep the same scope and task description
- Generate planning consultations for ALL agents in the revised team
- Re-evaluate the cross-cutting checklist against the new team
- Produce output at the same depth and format as the original
- Do NOT change the fundamental scope of the task
- Do NOT add agents the user did not request
- Design planning questions as a coherent set — each question should address aspects that no other agent on the team covers, and questions should reference cross-cutting boundaries where relevant
- Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase1-metaplan-rerun.md
