# Outcome: API Versioning and Stability Commitment

## What was produced

WRL's API is formally versioned at 1.0.0 with a complete stability contract.

### Files created
- **CHANGELOG.md** — retroactive changelog from 0.1.0 (2026-03-13) through 1.0.0 (2026-03-25), Keep a Changelog 1.1.0 format, with PR references and categorized entries
- **DEPRECATION-POLICY.md** — 6-month minimum deprecation notice, 30-day emergency clause, breaking/non-breaking change definitions, RFC 9745 (Deprecation) and RFC 8594 (Sunset) header standards
- **src/deprecations.js** — empty declarative deprecation registry with documented schema for future use
- **scripts/check-version-sync.sh** — CI script ensuring package.json and openapi.yaml versions match
- **.github/pull_request_template.md** — 4-item checklist (tests, API spec, changelog, version bump)

### Files modified
- **openapi.yaml** — version bumped to 1.0.0; three new header components (WRLAPIVersion, Deprecation, Sunset) added to components/headers; WRLAPIVersion referenced from all 57 response-level headers blocks; x-deprecation-policy extension in info block; health endpoint example updated
- **package.json** — version bumped from 0.1.0 to 1.0.0
- **src/index.js** — WRL-API-Version response header added to post-response block using BUILD_VERSION with typeof guard (+3 lines)
- **test/security-headers.test.js** — helper renamed from expectSecurityHeaders to expectGlobalHeaders; 5 new tests added (semver format, header absence in test env, deprecation header absence, empty DEPRECATIONS config)
- **.github/workflows/ci.yml** — version-sync step (unconditional, before code-change gate) and changelog warning step (non-blocking ::warning::) added

## Success criteria status

| Criterion | Status |
|-----------|--------|
| openapi.yaml version set to 1.0.0 | Done |
| CHANGELOG.md with retroactive history | Done |
| Deprecation policy with 6-month notice | Done |
| Deprecation/Sunset headers per RFC 9745/8594 | Schema defined, injection deferred (YAGNI) |
| WRL-API-Version on all responses | Done (via BUILD_VERSION) |
| CI enforces version sync | Done |
| PR template with changelog checklist | Done |
| Worker releases tagged with semver | Pending — manual v1.0.0 tag after merge |

## What deviated from plan

1. **ROUTE_KEYS map and deprecation injection code removed** — lucy and margo flagged as YAGNI during Phase 3.5. Zero deprecated endpoints at v1.0.0 means zero callers. Only the empty config + schema documentation shipped.

2. **src/version.js removed** — margo flagged as redundant third copy of version string. Tests import from package.json instead.

3. **Response headers block count: 57, not 63** — api-spec-minion precisely counted during review. Original synthesis overestimated by 6 (false positives from component definition, schema properties, URL strings).

4. **RFC correction** — original issue #113 attributed both Deprecation and Sunset to RFC 8594. Corrected: Deprecation = RFC 9745 (January 2025), Sunset = RFC 8594.

5. **CI changelog check uses env: for BASE_SHA** — iac-minion proactively avoided inline `${{ }}` expression injection in the `run:` block per GitHub Actions security best practices.

## Backlog changes

- ~~R34: API versioning and stability commitment~~ — **Done** (this phase)
- **Added**: Create annotated v1.0.0 tag after PR merge (HUMAN_ACTION_REQUIRED)
- **No items deferred** — all in-scope items delivered

## What's next

- **Manual step**: Create annotated git tag `v1.0.0` after PR merges to main
  ```bash
  git tag -a v1.0.0 -m "WRL API v1.0.0 — stability commitment"
  git push origin v1.0.0
  ```
- Pre-1.0 retroactive tags (v0.1.0–v0.8.0) are optional — the CHANGELOG comparison links will 404 for those versions, which is acceptable
