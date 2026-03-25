WRL's API is formally versioned at 1.0.0 with a published changelog, deprecation policy, and semantic versioning for Worker releases. This signals stability to integrators and establishes a contract for how breaking changes will be communicated.

Success criteria:
- openapi.yaml version field set to 1.0.0
- CHANGELOG.md published at repo root with all changes since initial release, annotated as breaking or non-breaking
- Deprecation policy documented: minimum 6-month notice before removing or changing any endpoint behavior
- Deprecated endpoints return Deprecation and Sunset headers per RFC 8594
- Worker releases tagged with semantic versions (e.g., v1.0.0) in git
- CI enforces that openapi.yaml version matches the latest git tag
- API version header (WRL-API-Version) returned on all responses for future v2 negotiation
- CHANGELOG.md updated as part of every PR that changes API behavior (enforced by PR template checklist)

Scope:
- In: openapi.yaml 1.0.0, CHANGELOG.md, deprecation policy document, semantic version tags, WRL-API-Version response header, CI version check
- Out: API version negotiation (v2 routing), automated changelog generation, SDK versioning, client library generation

Constraints:
- Depends on all v1 API surface features being stable: R15 (MCP), R18 (batch), R27 (webhooks), R33 (capture auth gate)
- Version 1.0.0 is a commitment: no breaking changes without a major version bump
- Changelog format should follow Keep a Changelog (keepachangelog.com)
- Git tags must be annotated tags, not lightweight
