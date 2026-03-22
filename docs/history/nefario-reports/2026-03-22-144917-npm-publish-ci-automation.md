---
task: "npm publish CI automation for @w-r-l/verify"
date: 2026-03-22
source-issue: 98
mode: execution
task-count: 3
gate-count: 1
agents: iac-minion, devx-minion
reviewers: gru, security-minion, test-minion, lucy, margo
compaction-events: 0
---

## Summary

Automated npm publishing for `@w-r-l/verify`: GitHub Actions workflow triggers on `verify/v*` tag push, runs tests, verifies version-tag consistency, and publishes with provenance attestation using an automation token. Version bumps use built-in `npm version` with a `.npmrc` tag prefix. Changelog generation via a shell script groups conventional commits. All 136 tests pass; shellcheck clean.

## Original Prompt

The @w-r-l/verify npm package is published automatically via CI on tag push, with version bump tooling and changelog generation. Manual npm publish is no longer needed.

Success criteria: GHA workflow on v* tag push, runs tests and publishes to npm, scoped automation token, version bump script with git tag, changelog from conventional commits, graceful duplicate version handling, existing v0.1.0 unaffected.

## Key Design Decisions

1. **Automation token over OIDC Trusted Publishing** -- Issue explicitly requires token-based auth. OIDC needs npm 11.5.1+ (Node 22 ships 10.x), adding fragile CI maintenance. Provenance attestation works with tokens via `id-token: write`. Migration path to OIDC documented for when Node 24+ ships npm 11+.

2. **`verify/v*` tag prefix instead of bare `v*`** -- GitHub Actions tag triggers have no path context. Path filters don't work on tag events. Scoped prefix is the standard monorepo convention (Go modules, Lerna, Changesets). All three specialists agreed.

3. **`npm version` with `.npmrc` over custom bump script** -- Zero new code. `npm version` already updates package.json, creates commit, creates tag. The `.npmrc` `tag-version-prefix` setting handles monorepo scoping.

4. **Shell changelog over npm tools** -- Zero dependencies. ~88 lines of bash grouping by conventional commit type. Matches existing project scripting style. Graduate to a tool when scale warrants it.

5. **Separate changelog and version bump** -- Preserves human review step between generation and tagging.

## Execution

### Task 1: Publish workflow (iac-minion) -- GATE

Created `.github/workflows/publish-verify.yml` (79 lines):
- Trigger: `push.tags: ['verify/v*']`
- Steps: checkout → setup-node (with cache) → npm ci → npm test → NPM_TOKEN pre-flight → version-tag check → npm publish with provenance
- EPUBLISHCONFLICT handling exits cleanly
- Output captured in variable (not tee) to prevent token leakage

Gate approved: automation token approach matches explicit success criteria.

### Task 2: Version bump tooling (devx-minion)

- `packages/verify/.npmrc` (1 line) -- tag-version-prefix
- `scripts/changelog-verify.sh` (88 lines) -- groups commits by type, shellcheck clean
- `packages/verify/CHANGELOG.md` (11 lines) -- retroactive v0.1.0 entry dated 2026-03-17

### Task 3: Retroactive tag + docs (devx-minion)

- Git tag `verify/v0.1.0` on commit `fe1e2f5` (not pushed)
- Added "Releasing" section to `packages/verify/README.md`

## Verification

Verification: code review passed (2 findings auto-fixed), all 136 tests pass, shellcheck clean. Doc assessment: 0 MUST items.

Code review fixes applied:
- Added `cache-dependency-path` for correct npm cache key resolution
- Fixed changelog prepend logic to avoid accumulating blank lines

## Phases

### Phase 1-2: Planning

Three specialists consulted: iac-minion (workflow design), devx-minion (version tooling), security-minion (auth model). Key conflict: automation token vs OIDC resolved in favor of tokens per explicit success criteria.

### Phase 3: Synthesis

Consolidated into 3 tasks with 1 approval gate. Decisions documented in evolution log.

### Phase 3.5: Architecture Review

5 reviewers (gru, security-minion, test-minion, lucy, margo). Results: 2 APPROVE, 3 ADVISE, 0 BLOCK. 11 advisories incorporated into task prompts.

### Phase 4: Execution

Batch 1 (parallel): Tasks 1 + 2. Batch 2 (sequential): Task 3.

### Phase 5-8: Post-execution

Code review: 3 reviewers, 2 APPROVE + 1 ADVISE. Two fixes applied. Tests: 136 pass. Doc assessment: 0 MUST items.

## Agent Contributions

| Agent | Phase | Role | Verdict |
|-------|-------|------|---------|
| iac-minion | planning, execution | Workflow design and implementation | N/A |
| devx-minion | planning, execution | Version tooling, changelog, docs | N/A |
| security-minion | planning, review | Auth model, permission scoping | ADVISE |
| gru | review | Architecture assessment | APPROVE |
| test-minion | review | Test coverage review | ADVISE |
| lucy | review, code review | Convention compliance | APPROVE |
| margo | review, code review | Complexity check | ADVISE |
| code-review-minion | code review | Code quality | APPROVE |

## Manual Steps Required

1. Provision NPM_TOKEN: generate automation token on npmjs.com scoped to @w-r-l, add as GitHub Actions repository secret
2. Store token in 1Password WRL vault (Production item, field `NPM_PUBLISH_TOKEN`)
3. Push retroactive tag: `git push origin verify/v0.1.0`

## Working Files

[`docs/history/nefario-reports/2026-03-22-144917-npm-publish-ci-automation/`](./2026-03-22-144917-npm-publish-ci-automation/) (19 files)

## Session Resources

### Skills Invoked
- `/nefario` (this orchestration)

Compaction events: 0

Resolves #98
