# Process: API Versioning and Stability Commitment

## TL;DR

Five agents (api-spec-minion, api-design-minion, test-minion, iac-minion, plus nefario synthesis) delivered WRL's v1.0.0 stability commitment in three execution batches. The architecture review caught two YAGNI violations (ROUTE_KEYS map and src/version.js) that were removed before execution. The RFC citation in the original issue was corrected (Deprecation = RFC 9745, not 8594). All 1449 tests pass, OpenAPI lint clean, 10 files changed.

## Team composition

### Phase 2 planning specialists
- **api-design-minion** — designed WRL-API-Version header mechanism, deprecation lifecycle, DEPRECATION-POLICY.md structure
- **api-spec-minion** — analyzed OpenAPI spec structure, counted response headers blocks (corrected from 63 to 57), identified RFC 9745 for Deprecation header
- **iac-minion** — proposed CI version-sync check placement (before code-change gate), changelog warning (non-blocking), PR template
- **test-minion** — designed test strategy around BUILD_VERSION unavailability in vitest pool, proposed package.json import approach

### Phase 3.5 architecture reviewers
- **security-minion** — APPROVE
- **test-minion** — ADVISE (CI changelog warning should note it's non-blocking)
- **ux-strategy-minion** — APPROVE
- **lucy** — ADVISE (ROUTE_KEYS and deprecation injection code ship zero callers at v1.0.0; should defer)
- **margo** — BLOCK then APPROVE after revision (flagged ROUTE_KEYS, src/version.js as YAGNI; both removed in plan revision)

### Phase 5 code reviewers
- **code-review-minion** — APPROVE (ADVISE: version-sync grep could use yq instead)
- **lucy** — ADVISE (deprecations.js not imported in index.js — correct by design since injection deferred)
- **margo** — APPROVE (ADVISE: deprecations.js comment-to-code ratio 19:1, duplicate X-Frame-Options test)

## Key arguments and disagreements

### YAGNI debate: deprecation injection code

The original synthesis included a full deprecation mechanism: ROUTE_KEYS map (regex-to-route-key translation for all ~30 routes), matchedRouteKey threading through the routing loop, and Deprecation/Sunset/Link header injection code in the post-response block.

**lucy** argued this was YAGNI: zero deprecated endpoints at v1.0.0 means zero callers. The injection code would be dead on arrival.

**margo** independently flagged the same issue and escalated to BLOCK: "Shipping 30+ route key mappings and injection logic for a config that is empty is the definition of speculative infrastructure."

**Resolution**: Both items removed in plan revision. Only the empty DEPRECATIONS config with documented schema shipped. The comment in src/deprecations.js tells the future implementer exactly what to build when the first endpoint is deprecated.

### RFC correction

The original issue #113 attributed both Deprecation and Sunset headers to RFC 8594. **api-spec-minion** corrected this during Phase 2: RFC 9745 (published January 2025) governs the Deprecation header with Structured Field Date `@timestamp` format. RFC 8594 governs only the Sunset header with HTTP-date format. Different RFCs, different date formats.

This correction propagated through the entire plan: DEPRECATION-POLICY.md, src/deprecations.js schema comments, and the OpenAPI header component descriptions all cite both RFCs correctly.

### src/version.js removal

The synthesis included src/version.js exporting `API_VERSION = '1.0.0'` as a "single source of truth" for the runtime version string. **margo** flagged it as a third copy (alongside package.json and openapi.yaml) that adds sync risk for zero benefit. BUILD_VERSION is already injected from package.json at deploy time.

**Resolution**: src/version.js removed. Tests import version from package.json instead. CI enforces package.json == openapi.yaml, closing the sync loop.

### Response headers block count

The synthesis estimated 63 response-level headers blocks in openapi.yaml. **api-spec-minion** precisely counted 57 during Phase 3.5 review, identifying 6 false positives: the components/headers definition block itself, schema properties named `headers`, and URL strings containing `/artifacts/headers`.

### CHANGELOG forward-references

**lucy** flagged at Gate 2 that the CHANGELOG 1.0.0 section lists "CI enforcement of version sync" and "PR template with API changelog checklist" as Added items, but neither existed when the CHANGELOG was first committed (Task 3 ran before Task 5).

**Resolution**: Accepted as-is. All tasks complete within the same phase before the v1.0.0 tag is applied. The CHANGELOG describes the complete phase scope. The tag is created manually after merge, at which point everything listed exists.

## Execution structure

**Batch 1** (parallel): Task 1 (api-spec-minion: OpenAPI spec) + Task 2 (api-design-minion: Worker implementation) + Task 3 (api-design-minion: CHANGELOG + DEPRECATION-POLICY)
- Gate 1 after Task 1: approved (57 headers blocks, all referenced)
- Gate 2 after Task 3: approved with ADVISE (forward-references accepted)

**Batch 2** (sequential): Task 4 (test-minion: tests)
- 5 new tests added to security-headers.test.js, helper renamed
- All 1449 tests pass

**Batch 3** (sequential): Task 5 (iac-minion: CI + PR template)
- Version-sync script, two CI steps, PR template
- Agent wrote to main repo instead of worktree — files manually copied to correct location

## Human interventions

This was a fully autonomous run (no human at gates). Lucy agent made all gate decisions:
- **Gate 1**: APPROVE
- **Gate 2**: ADVISE (accepted as-is with documented rationale)
- **Post-exec**: "Run all" selected per autonomous protocol

The iac-minion writing to the main repo instead of the worktree was the only manual intervention — files were copied and the main repo was restored.

## Where to read more

- **Specialist discussions**: `docs/history/nefario-reports/` (companion directory for the execution report)
- **Full execution plan**: scratch directory `phase3-synthesis.md` (in companion directory)
- **Architecture review verdicts**: scratch directory `phase3.5-*.md` files
- **Issue**: GitHub #113
