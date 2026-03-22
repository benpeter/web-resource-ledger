# Lucy Code Review: npm Publish CI Automation

## VERDICT: APPROVE

All five changed files align with the approved synthesis plan, comply with CLAUDE.md conventions, and introduce no scope drift. The implementation is clean, proportional, and addresses security review advisories where appropriate. Two minor observations noted below; neither warrants blocking or requires changes before merge.

---

## Requirement Traceability (Code vs Plan)

| # | Requirement | Implementation | Status |
|---|-------------|----------------|--------|
| R1 | `verify/v*` tag trigger | `publish-verify.yml` line 15-16 | PASS |
| R2 | Tests run before publish | `publish-verify.yml` lines 41-43 | PASS |
| R3 | `NPM_TOKEN` automation token via secret | `publish-verify.yml` lines 46-52, 67 | PASS |
| R4 | Version bump via `npm version` + `.npmrc` prefix | `packages/verify/.npmrc` line 1 | PASS |
| R5 | Changelog generation from conventional commits | `scripts/changelog-verify.sh` | PASS |
| R6 | EPUBLISHCONFLICT graceful handling | `publish-verify.yml` lines 69-78 | PASS |
| R7 | Version-tag consistency check | `publish-verify.yml` lines 57-62 | PASS |
| R8 | SHA-pinned actions with version comments | `publish-verify.yml` lines 28, 31 | PASS |
| R9 | Minimal permissions (`contents: read`, `id-token: write`) | `publish-verify.yml` lines 18-20 | PASS |
| R10 | Provenance attestation (`--provenance`) | `publish-verify.yml` line 69 | PASS |
| R11 | Initial CHANGELOG.md with v0.1.0 entry | `packages/verify/CHANGELOG.md` | PASS |
| R12 | Releasing section in README | `packages/verify/README.md` lines 124-147 | PASS |
| R13 | NPM_TOKEN pre-flight check (security advisory) | `publish-verify.yml` lines 45-52 | PASS |

No stated requirements are missing. No code elements lack traceability to a requirement.

---

## Findings

### Convention Compliance

- **SHA-pinned actions**: `checkout@11bd71901...` and `setup-node@49933ea52...` match the exact SHAs used in `ci.yml` and `deploy-production.yml`. COMPLIANT.
- **`runs-on: ubuntu-latest`**: Matches all existing workflows (`ci.yml`, `deploy-staging.yml`, `deploy-production.yml`, `vibe-coded-badge.yml`). The security review's advisory to pin `ubuntu-24.04` was not adopted; this is the correct decision for convention consistency. COMPLIANT.
- **`working-directory` over `cd`**: Steps use `working-directory: packages/verify` instead of inline `cd`. Matches the style convention called out in the synthesis. COMPLIANT.
- **Script style**: `changelog-verify.sh` uses `#!/usr/bin/env bash`, `set -euo pipefail`, descriptive header comment block, and `# tva` signature. Matches `smoke-test.sh` conventions exactly. COMPLIANT.
- **Fail loudly**: NPM_TOKEN check (line 49) uses `::error::` annotation and `exit 1`. EPUBLISHCONFLICT uses `::warning::` to distinguish "already published" from "publish failed." Both satisfy the "fail loudly, degrade intentionally" principle. COMPLIANT.

### CLAUDE.md Compliance

- **YAGNI**: No speculative features. No GitHub Releases, no pre-release channels, no monorepo publish orchestration -- all correctly excluded per scope definition.
- **KISS**: Three files + one modified README. The changelog script uses shell builtins and `git log` -- zero new dependencies.
- **Lean and Mean**: No new npm devDependencies added anywhere.

### Security Advisory Incorporation

The implementation adopted two of the security review's advisories:
1. **NPM_TOKEN pre-flight check**: Implemented as a dedicated step (lines 45-52). Clean diagnostic with `::error::` annotation.
2. **Commit message injection safety note**: Added as a header comment in `changelog-verify.sh` (lines 12-13): "commit messages flow through grep/sed pipelines and are only ever written to CHANGELOG.md -- never eval'd or executed."

The implementation did NOT adopt:
- `.npmignore` for belt-and-suspenders `.npmrc` exclusion (the `files` whitelist in `package.json` already covers this -- the security review rated this LOW severity)
- `ubuntu-24.04` pinning (inconsistent with all other workflows)

Both omissions are defensible.

### Plan Deviation: Publish Step Pattern

The plan specified `tee /tmp/npm-publish.log` + `PIPESTATUS[0]`. The implementation uses `OUTPUT=$(npm publish ... 2>&1) || { ... }` instead. This is a superior approach: it avoids writing a temp file (addressing the security review's token leakage concern), avoids `PIPESTATUS` bash-specific semantics, and is more readable. The security review's concern about npm echoing tokens to a world-readable log file is eliminated entirely. This is a positive deviation.

---

## Observations (not blocking)

- [NIT] `scripts/changelog-verify.sh`:53 -- The `OTHER` category grep uses `grep -vE` to match commits that don't have a conventional prefix. If `$LOG` is empty (no commits since last tag), `grep -vE` on an empty string produces an empty line that could appear as a blank bullet in the CHANGELOG. The `|| true` prevents the script from failing, but the empty-log edge case could produce a malformed section header with no entries under it (the `NEW_SECTION` variable would contain `## vX.Y.Z (date)\n\n### Other\n- \n`). This is low-impact since the script's instructions tell the developer to "review and edit" the CHANGELOG before tagging.
  FIX: Add `[ -z "$LOG" ] && { echo "No commits found since ${PREV_TAG:-initial}"; exit 0; }` after the "Gather commits" block.

- [NIT] `publish-verify.yml`:35 -- The `cache: 'npm'` option on `setup-node` computes its cache key from the root `package-lock.json` by default, but `npm ci` runs in `packages/verify/`. The cache will store/restore based on the root lockfile's hash, which may not reflect `packages/verify/package-lock.json` changes. This is a cache efficiency concern, not a correctness concern.
  FIX: Add `cache-dependency-path: packages/verify/package-lock.json` to the `setup-node` step's `with` block.

---

## Scope Assessment

The implementation contains exactly what was planned: one workflow, one shell script, one `.npmrc`, one CHANGELOG, one README update. No scope creep, no gold-plating, no adjacent features. The plan-to-code mapping is 1:1.
