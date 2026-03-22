# Decisions: npm Publish CI Automation (#98)

## D1: Automation Token vs OIDC Trusted Publishing

**Chosen**: Granular automation token with `--provenance` attestation
**Over**: OIDC Trusted Publishing (security-minion's strong recommendation)
**Why**: Issue #98 explicitly requires "a scoped automation token stored as a GitHub Actions secret." OIDC requires npm 11.5.1+ but Node 22 ships npm 10.x, meaning the workflow would need a fragile npm upgrade step. Provenance attestation works with tokens too (via `id-token: write`). Migration to OIDC is a one-line change when Node 24+ ships npm 11+.

**security-minion's argument for OIDC**: No secret to rotate/leak, per-package+per-repo+per-workflow scoping, automatic provenance, full OIDC audit trail. Classic tokens were revoked Dec 2025; only granular tokens remain with 90-day max lifetime. For a package verifying cryptographic integrity, publishing with OIDC would be "practicing what you preach."

**Resolution**: iac-minion's pragmatism won. The explicit success criteria anchored the decision. The migration path is documented.

## D2: Tag Prefix Convention

**Chosen**: `verify/v*` scoped tag prefix (e.g., `verify/v0.2.0`)
**Over**: Bare `v*` tags with in-workflow path check
**Why**: GitHub Actions `push.tags` triggers have no path context. Path filters only work on branch pushes. All three specialists agreed: scoped prefix is the standard monorepo convention (Go modules, Lerna, Changesets all use it). Bare `v*` with path check is fragile, wastes runner time on false triggers, and collides if more packages are added.

**Note**: Issue #98 says "triggers on `v*` tag push to the `verify/` directory" — this is impossible as stated. The `verify/v*` prefix is the correct adaptation.

## D3: Version Bump Mechanism

**Chosen**: `npm version` with `.npmrc` `tag-version-prefix = verify/v`
**Over**: Custom shell script that manually edits package.json and creates tags (iac-minion)
**Why**: `npm version patch|minor|major` already updates package.json, creates a commit, and creates a tag — all in one command. Writing a custom script reimplements built-in functionality. The `.npmrc` setting configures the monorepo prefix with zero code. KISS/YAGNI.

## D4: Changelog Tooling

**Chosen**: Shell script (`scripts/changelog-verify.sh`) parsing `git log`
**Over**: conventional-changelog-cli (npm dep), git-cliff (Rust binary), changelogen (npm dep)
**Why**: Zero new dependencies. ~88 lines of bash that groups commits by conventional commit type. The project has infrequent releases and a single maintainer. Matches existing scripting style. Graduate to a tool when scale warrants it.

## D5: Changelog and Version Bump Separation

**Chosen**: Separate tools with documented two-step process
**Over**: Combined bump+changelog script
**Why**: Separating preserves the human review step. Developer generates changelog, reviews/edits, then bumps version. Combining removes the ability to review before tagging.
