# Outcome: npm Publish CI Automation (#98)

## What Was Built

Automated npm publishing pipeline for `@w-r-l/verify`:

1. **GitHub Actions workflow** (`.github/workflows/publish-verify.yml`, 79 lines)
   - Triggers on `verify/v*` tag push
   - Runs package tests, checks version-tag consistency
   - Publishes with `--provenance` attestation using NPM_TOKEN
   - Handles EPUBLISHCONFLICT gracefully (exit 0 with warning)
   - Pre-flight check for missing NPM_TOKEN (fail-loudly)
   - SHA-pinned actions, minimal permissions

2. **Version bump tooling**
   - `packages/verify/.npmrc` — `tag-version-prefix = verify/v` (1 line)
   - Enables `npm version patch|minor|major` to create `verify/v*` tags

3. **Changelog generation** (`scripts/changelog-verify.sh`, 88 lines)
   - Groups commits by conventional commit type
   - Scoped to `packages/verify/` changes since last `verify/v*` tag
   - Creates/updates `packages/verify/CHANGELOG.md`

4. **Documentation**
   - `packages/verify/CHANGELOG.md` — initial file with retroactive v0.1.0 entry
   - `packages/verify/README.md` — added "Releasing" section with step-by-step process

5. **Retroactive tag**
   - `verify/v0.1.0` on commit `fe1e2f5` (original package introduction)

## Manual Steps Required (Post-Merge)

1. **Provision NPM_TOKEN**: Generate automation token on npmjs.com scoped to @w-r-l, add as GitHub Actions repository secret
2. **Store in 1Password**: Add token to WRL vault Production item
3. **Push retroactive tag**: `git push origin verify/v0.1.0`

## What Deviated From the Plan

- **Tag commit**: Plan referenced `5c9b781`, actual tag landed on `fe1e2f5` (the correct commit where the verify package was scaffolded — agent found the right one via git log)
- **Changelog publish date**: Used `2026-03-17` from npm registry metadata (accurate)
- **Cache fix**: Added `cache-dependency-path` after code review caught that `cache: 'npm'` without it would key off the wrong lockfile

## Surprises

- The devx-minion wrote files to the main repo instead of the worktree. Required manual file copy to fix. Worktree path isolation for subagents is a recurring issue.

## Backlog Changes

- ~~[should] Publish @w-r-l/verify to npm~~ — **DONE** (CI automation in place; manual step needed for NPM_TOKEN)
- Added to parking lot: "OIDC Trusted Publishing migration when Node 24+ ships npm 11+" (deferred from security-minion recommendation)
