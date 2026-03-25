MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

WRL's API is formally versioned at 1.0.0 with a published changelog, deprecation policy, and semantic versioning for Worker releases. This signals stability to integrators and establishes a contract for how breaking changes will be communicated.

Success criteria:
- openapi.yaml version field set to 1.0.0
- CHANGELOG.md published at repo root with all changes since initial release, annotated as breaking or non-breaking
- Deprecation policy documented: minimum 6-month notice before removing or changing any endpoint behavior
- Deprecated endpoints return Deprecation and Sunset headers per RFC 8594/RFC 9745
- Worker releases tagged with semantic versions (e.g., v1.0.0) in git
- CI enforces that openapi.yaml version matches the latest git tag
- API version header (WRL-API-Version) returned on all responses for future v2 negotiation
- CHANGELOG.md updated as part of every PR that changes API behavior (enforced by PR template checklist)

Scope:
- In: openapi.yaml 1.0.0, CHANGELOG.md, deprecation policy document, semantic version tags, WRL-API-Version response header, CI version check
- Out: API version negotiation (v2 routing), automated changelog generation, SDK versioning, client library generation

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase2-api-spec-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase2-test-minion.md

## Key consensus across specialists:

1. api-design-minion: WRL-API-Version returns semver string from BUILD_VERSION; deprecation uses declarative config module (src/deprecations.js) read by post-response block; openapi.yaml/package.json/git tags must be identical; deprecation policy commits to 6-month notice with 30-day emergency clause.

2. api-spec-minion: Bump openapi.yaml to 1.0.0; add WRL-API-Version as global header component referenced from all 63 response blocks; add Deprecation/Sunset header components but only reference per-endpoint when deprecated; create CHANGELOG.md with retroactive history; RFC 9745 (not 8594) governs Deprecation header. CORS OPTIONS 204 response does not use standard header pattern — needs deliberate decision.

3. iac-minion: Shell script step in existing CI test job (not separate job); version-sync check runs unconditionally outside code-change gate; CHANGELOG warning not failure; manual annotated tags; no pre-commit hooks; PR template with changelog checklist.

4. test-minion: Extend existing expectSecurityHeaders() helper (rename to expectGlobalHeaders()) with WRL-API-Version assertion; avoid hardcoding version — use semver regex + import constant; unit + integration tests for deprecation headers; no meta-test for CI check. BUILD_VERSION is undefined in test context — need to handle.

## Cross-cutting consensus:
- All agree versions must be synchronized: openapi.yaml = package.json = git tag
- All agree BUILD_VERSION (already injected by deploy pipeline) should be the runtime source for the header
- api-spec-minion corrected RFC reference: Deprecation header is RFC 9745 (March 2025), not RFC 8594 (which is Sunset only)
- test-minion and api-design-minion both flagged BUILD_VERSION being undefined in tests
- api-spec-minion and test-minion both flagged the CORS OPTIONS 204 gap

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-JiE8yt/api-versioning-stability-commitment/phase3-synthesis.md
