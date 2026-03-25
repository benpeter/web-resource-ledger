# Decisions: API Versioning and Stability Commitment

## D1: RFC 9745 vs RFC 8594 for Deprecation header

- **Chosen**: RFC 9745 (Structured Field Date `@timestamp` format) for Deprecation header
- **Over**: RFC 8594 (which the original issue #113 cited for both headers)
- **Why**: api-spec-minion corrected the RFC reference during Phase 2 planning. RFC 9745 (published January 2025) is the specific standard for the Deprecation header. RFC 8594 governs only the Sunset header. Different RFCs, different date formats.
- **Impact**: DEPRECATION-POLICY.md cites both RFCs correctly. The schema in src/deprecations.js documents the distinction.

## D2: YAGNI — defer ROUTE_KEYS map and deprecation injection code

- **Chosen**: Ship only empty DEPRECATIONS config with documented schema; defer injection code
- **Over**: Building ROUTE_KEYS map (regex-to-human-readable route mapping) and full deprecation header injection in src/index.js
- **Who argued**: lucy and margo both flagged as YAGNI during Phase 3.5 review. Zero deprecated endpoints at v1.0.0 means zero callers for the injection code.
- **Why**: The schema documentation in src/deprecations.js establishes the pattern without shipping dead code. The injection mechanism will be built when the first endpoint is actually deprecated.

## D3: YAGNI — remove src/version.js

- **Chosen**: No src/version.js file; tests import version from package.json
- **Over**: Dedicated src/version.js exporting `API_VERSION = '1.0.0'`
- **Who argued**: margo flagged as third copy of version string (package.json, openapi.yaml, and proposed src/version.js)
- **Why**: CI enforces package.json == openapi.yaml. BUILD_VERSION is injected from package.json at deploy time. A third copy adds sync risk for zero benefit. Tests use `import pkg from '../package.json'` instead.

## D4: WRL-API-Version header via BUILD_VERSION with typeof guard

- **Chosen**: `typeof BUILD_VERSION !== 'undefined'` guard, header absent when undefined
- **Over**: Fallback value like `'dev'` or `'unknown'` when BUILD_VERSION is undefined
- **Why**: Same pattern as existing health endpoint. In tests and local dev, the header is simply absent. No misleading version strings. The typeof guard is the established pattern in the codebase.

## D5: Version-sync CI step runs unconditionally (before code-change gate)

- **Chosen**: Version-sync check runs on every PR, even docs-only changes
- **Over**: Gating version-sync behind the code-change filter
- **Why**: Version files are metadata that must always be consistent. A docs-only PR could accidentally modify package.json or openapi.yaml. The check takes <1 second and catches drift early.

## D6: Changelog warning is non-blocking (::warning:: not ::error::)

- **Chosen**: Non-blocking warning when API-affecting files change without CHANGELOG.md update
- **Over**: Hard failure that blocks PR merge
- **Why**: Not every src/ change is an API behavior change. Internal refactors, test-only changes, and performance improvements don't need changelog entries. A hard failure would create false positives and merge friction.

## D7: 6-month deprecation notice with 30-day emergency clause

- **Chosen**: 6-month minimum notice for normal deprecation, 30-day for security emergencies
- **Over**: 12-month notice period (GitHub's convention)
- **Why**: 12 months is too restrictive for a v1.0.0 API with a small user base. 6 months balances commitment with agility. The 30-day emergency clause is the safety valve for security vulnerabilities that require breaking changes.

## D8: Response headers block count — 57, not 63

- **Chosen**: 57 response-level headers blocks in openapi.yaml
- **Over**: Original synthesis estimate of 63
- **Why**: api-spec-minion during Phase 3.5 review counted precisely. 6 false positives: the components/headers definition block itself, schema properties named `headers`, and URL strings containing `/artifacts/headers`. Only actual response-level headers blocks get the WRLAPIVersion reference.

## D9: CHANGELOG 1.0.0 lists all phase items (including CI and PR template)

- **Chosen**: Keep all items in 1.0.0 section (CI check, PR template, version header, deprecation mechanism)
- **Over**: Moving CI check and PR template to [Unreleased] since they didn't exist when CHANGELOG was first written
- **Who argued**: Lucy flagged as ADVISE at Gate 2 — these items are listed as "Added" but didn't exist yet when the changelog was committed
- **Why**: All tasks complete within the same phase before the v1.0.0 tag is applied. The CHANGELOG describes the complete phase scope, and the tag is created after merge (when all items exist).
