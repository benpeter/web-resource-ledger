---
task: "API versioning and stability commitment"
date: 2026-03-25
source-issue: 113
status: complete
task-count: 5
gate-count: 2
agents: [api-spec-minion, api-design-minion, test-minion, iac-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo, gru, code-review-minion]
mode: execution
---

## Summary

WRL's API is formally versioned at 1.0.0 with a complete stability contract. The openapi.yaml and package.json are bumped to 1.0.0 (CI-enforced sync). Every API response includes a WRL-API-Version header (via BUILD_VERSION). A retroactive CHANGELOG.md covers all versions from 0.1.0 to 1.0.0 in Keep a Changelog format. DEPRECATION-POLICY.md commits to 6-month notice (30-day emergency clause), citing RFC 9745 (Deprecation) and RFC 8594 (Sunset). Three new OpenAPI header components (WRLAPIVersion, Deprecation, Sunset) are defined. CI enforces version sync unconditionally and warns on missing changelog updates. A PR template with 4-item checklist is added. 1449 tests pass, OpenAPI lint clean.

Resolves #113.

## Original Prompt

WRL's API is formally versioned at 1.0.0 with a published changelog, deprecation policy, and semantic versioning for Worker releases. This signals stability to integrators and establishes a contract for how breaking changes will be communicated.

## Key Design Decisions

### D1: RFC 9745 for Deprecation, RFC 8594 for Sunset
The original issue attributed both headers to RFC 8594. api-spec-minion corrected: RFC 9745 (January 2025) governs the Deprecation header with Structured Field Date `@timestamp` format. RFC 8594 governs only the Sunset header with HTTP-date format.

### D2: YAGNI — defer deprecation injection code
lucy and margo independently flagged ROUTE_KEYS map and injection code as YAGNI. Zero deprecated endpoints = zero callers. Only the empty DEPRECATIONS config with documented schema shipped.

### D3: No src/version.js
margo flagged as redundant third copy. Tests import from package.json. BUILD_VERSION injected at deploy time from package.json. CI enforces package.json == openapi.yaml.

### D4: 57 response headers blocks (not 63)
api-spec-minion precisely counted during review. 6 false positives excluded (component definition, schema properties, URL strings).

### D5: CI changelog check is advisory (::warning::)
Non-blocking by design. Not every src/ change is an API behavior change. Hard failure would create false positives for refactors and test-only changes.

### D6: 6-month deprecation notice with 30-day emergency clause
Balanced commitment with agility for a v1.0.0 API. 12-month (GitHub's convention) rejected as too restrictive at current scale.

## Phases

### Phase 1-2: Planning
4 specialists consulted: api-design-minion (header mechanism, deprecation lifecycle), api-spec-minion (OpenAPI structure, RFC correction), iac-minion (CI placement), test-minion (BUILD_VERSION unavailability). Team adjusted once (gru added as reviewer, confirmed no additional planning specialists needed).

### Phase 3: Synthesis
5 execution tasks, 2 approval gates. Three execution batches: Batch 1 (Tasks 1-3 parallel), Batch 2 (Task 4), Batch 3 (Task 5).

### Phase 3.5: Architecture Review
7 reviewers. 4 APPROVE (security-minion, ux-strategy-minion, gru, test-minion as ADVISE). 1 BLOCK (margo: ROUTE_KEYS and src/version.js YAGNI). 2 ADVISE (lucy: same YAGNI concern, test-minion: CI changelog clarification). Plan revised: ROUTE_KEYS, injection code, and src/version.js removed. Re-review: all APPROVE.

### Phase 4: Execution
**Batch 1** (3 tasks parallel):
- Task 1 (api-spec-minion): OpenAPI spec — 1.0.0 bump, 3 header components, 57 WRLAPIVersion references, x-deprecation-policy extension. Gate 1: APPROVED.
- Task 2 (api-design-minion): Worker — WRL-API-Version header (+3 lines in post-response block), empty src/deprecations.js.
- Task 3 (api-design-minion): CHANGELOG.md (retroactive 0.1.0–1.0.0) and DEPRECATION-POLICY.md. Gate 2: APPROVED with ADVISE (forward-references accepted).

**Batch 2**:
- Task 4 (test-minion): Tests — renamed expectSecurityHeaders→expectGlobalHeaders, 5 new tests (semver format, header absence, deprecation absence, empty config). 1449 tests pass.

**Batch 3**:
- Task 5 (iac-minion): CI — scripts/check-version-sync.sh, 2 CI steps (version-sync unconditional, changelog warning), PR template.

### Phase 5: Code Review
3 reviewers. code-review-minion: APPROVE (ADVISE: use yq for version-sync). lucy: ADVISE (deprecations.js not imported — correct by design). margo: APPROVE (ADVISE: comment-to-code ratio in deprecations.js).

### Phase 6: Tests
1449 passed, 2 skipped, 0 failed. All 56 test files pass. No regressions.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
8a assessment: all documentation items addressed by the phase itself (CHANGELOG.md, DEPRECATION-POLICY.md, openapi.yaml). 0 items requiring Phase 8b. Skipped 8b.

## Verification

Verification: code review passed (2 APPROVE, 1 ADVISE), all tests pass (1449), OpenAPI lint clean. (Docs: addressed in-phase.)

## Agent Contributions

<details>
<summary>Planning agents (Phase 2)</summary>

| Agent | Recommendation |
|-------|---------------|
| api-design-minion | WRL-API-Version via BUILD_VERSION, declarative deprecation config, 6-month/30-day policy |
| api-spec-minion | RFC 9745 correction, 57 response blocks (not 63), WRLAPIVersion component pattern |
| iac-minion | Version-sync before code-change gate, changelog warning non-blocking, minimal PR template |
| test-minion | Package.json import for version (not node:fs), BUILD_VERSION absent in tests |

</details>

<details>
<summary>Architecture reviewers (Phase 3.5)</summary>

| Reviewer | Verdict | Key point |
|----------|---------|-----------|
| security-minion | APPROVE | No new attack surface |
| test-minion | ADVISE | CI changelog warning should note non-blocking |
| ux-strategy-minion | APPROVE | No user-facing UX changes |
| lucy | ADVISE | ROUTE_KEYS and injection code ship zero callers |
| margo | BLOCK→APPROVE | ROUTE_KEYS and src/version.js are YAGNI |
| gru | APPROVE | RFC citations correct, standards alignment good |

</details>

## Execution

### Files changed (10)

| File | Action | Description |
|------|--------|-------------|
| openapi.yaml | Modified | 1.0.0 bump, 3 header components, 57 WRLAPIVersion refs, x-deprecation-policy |
| package.json | Modified | Version 0.1.0 → 1.0.0 |
| src/index.js | Modified | WRL-API-Version header in post-response block (+3 lines) |
| src/deprecations.js | Created | Empty deprecation registry with documented schema |
| CHANGELOG.md | Created | Retroactive changelog 0.1.0–1.0.0, Keep a Changelog format |
| DEPRECATION-POLICY.md | Created | 6-month notice, 30-day emergency, RFC 9745/8594 |
| test/security-headers.test.js | Modified | Renamed helper, 5 new tests |
| scripts/check-version-sync.sh | Created | Checks package.json == openapi.yaml version |
| .github/workflows/ci.yml | Modified | Version-sync + changelog warning steps |
| .github/pull_request_template.md | Created | 4-item checklist |

## Test Plan

- [x] All 56 test files pass (1449 tests, 2 skipped)
- [x] OpenAPI lint passes (12 pre-existing warnings)
- [x] Version-sync script passes locally
- [x] shellcheck clean on check-version-sync.sh

## Session Resources

<details>
<summary>Skills invoked</summary>

- `/nefario` — orchestration

</details>

<details>
<summary>Working files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-25-012628-api-versioning-stability-commitment/`

Files: phase1-metaplan-prompt.md, phase1-metaplan.md, phase1-metaplan-rerun-prompt.md, phase1-metaplan-rerun.md, phase2-api-design-minion-prompt.md, phase2-api-design-minion.md, phase2-api-spec-minion-prompt.md, phase2-api-spec-minion.md, phase2-iac-minion-prompt.md, phase2-iac-minion.md, phase2-test-minion-prompt.md, phase2-test-minion.md, phase3-synthesis-prompt.md, phase3-synthesis.md, phase3.5-*.md (7 reviewer files), phase4-*-prompt.md (5 task prompts), prompt.md

</details>
