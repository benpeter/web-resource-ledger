# DevX Minion -- Plan Contribution: npm Publish CI Automation

## Recommendations

### (a) Version Bump: Use `npm version` -- nothing else needed

`npm version patch|minor|major` already does exactly what this project needs in one command:

1. Updates `version` in `package.json` (and `package-lock.json` if present)
2. Creates a git commit with message `vX.Y.Z`
3. Creates an annotated git tag `vX.Y.Z`

No shell script, no wrapper, no additional tooling. This is the KISS answer. The only customization needed is a tag prefix so the tag reads `verify/v0.2.0` instead of `v0.2.0` (since this is a monorepo with potentially more packages later). This is configured with one line in `packages/verify/.npmrc`:

```
tag-version-prefix = verify/v
```

Then `cd packages/verify && npm version minor` produces commit `verify/v0.2.0` and tag `verify/v0.2.0`. Done.

**Why not a shell script?** It would reimplement what `npm version` already does. The project philosophy says "don't build it until you need it" and "fewer lines, fewer deps, fewer moving parts." `npm version` is zero new code.

**Why not an npm script wrapper?** Adding a `"release"` script to root `package.json` that calls `cd packages/verify && npm version $1` is tempting but adds indirection for a one-line command. If the team wants the convenience, a one-liner in root package.json is fine, but it is not necessary.

### (b) Changelog: Simple shell script parsing `git log`, not a tool

Given the current state of the project -- one verify-specific commit exists, conventional commits are in use but sparse for this package -- a full changelog tool is overkill:

- **conventional-changelog-cli** (3.7M weekly downloads, mature): Reasonable choice, but adds a devDependency for something that runs once per release. The project has zero devDeps in `packages/verify/` today.
- **git-cliff** (Rust binary, very capable): Excellent tool, but requires installing a Rust binary in CI. Heavier than warranted.
- **changelogen** (from the unjs ecosystem): Decent lightweight option, but still a dependency.
- **Shell script parsing `git log --oneline`**: 15 lines of bash, no dependencies, produces a perfectly adequate changelog for a small package with infrequent releases. This matches the project's existing scripting style (see `scripts/provision-alerts.sh`, `scripts/smoke-test.sh`).

**Recommended approach**: A `scripts/changelog-verify.sh` script that:

1. Finds the previous tag matching `verify/v*`
2. Runs `git log --oneline <prev-tag>..HEAD -- packages/verify/` to get verify-scoped commits
3. Groups by conventional commit type (feat, fix, etc.)
4. Prepends a new version section to `packages/verify/CHANGELOG.md`
5. If no previous tag exists, uses all commits touching `packages/verify/`

This is honest about the project's scale. When there are 50 contributors and weekly releases, graduate to conventional-changelog-cli. Until then, a shell script does the job.

**Alternative considered**: Generating changelog in CI from tag push (no local script). This is tempting but violates the principle that the changelog should be reviewable in the PR before the tag is pushed. The changelog should be committed, not generated ephemerally.

### (c) Script Location: `scripts/` at root

The existing project convention is clear: operational scripts live in `scripts/` at the repo root. Every existing script follows this pattern (`smoke-test.sh`, `provision-alerts.sh`, `generate-signing-key.js`, `generate-favicon.sh`, `migrate-kv-to-d1.js`).

Name it `scripts/changelog-verify.sh` to follow the `{action}-{target}` naming convention visible in `generate-signing-key.js` and `generate-favicon.sh`.

Do NOT put it in `packages/verify/`. That directory is what gets published to npm (scoped by the `files` field in package.json). Build/release tooling belongs at the repo level.

### (d) Version Bump and Changelog: Separate tools, documented sequence

Keep them separate. They are conceptually different operations:

1. **Changelog generation** is a pre-release step (author reviews and edits it)
2. **Version bump + tag** is the release trigger (kicks off CI publish)

The release workflow for developers should be documented as a two-step sequence:

```bash
# 1. Generate changelog (review + edit before committing)
./scripts/changelog-verify.sh minor    # or patch, major

# 2. Bump version, commit, and tag
cd packages/verify && npm version minor
```

Combining them into one script removes the review step. The changelog should be human-editable before it becomes part of the release commit. Keeping them separate respects the "intuitive, simple, consistent" priority order.

However, the changelog script should accept the version bump type as an argument so it can calculate and display the upcoming version number in the changelog header -- this avoids the user needing to figure out what version they are about to cut.

## Proposed Tasks

### Task 1: Create `packages/verify/.npmrc` with tag prefix

**Deliverable**: `.npmrc` file with `tag-version-prefix = verify/v`

**Dependencies**: None

**Effort**: Trivial (one file, one line)

**Details**: This ensures `npm version` creates monorepo-scoped tags like `verify/v0.2.0` instead of bare `v0.2.0`. The CI workflow will trigger on tags matching `verify/v*`.

### Task 2: Create `scripts/changelog-verify.sh`

**Deliverable**: Shell script that generates/updates `packages/verify/CHANGELOG.md`

**Dependencies**: None (only git)

**Effort**: Small (15-30 lines of bash)

**Details**:
- Accepts one argument: version bump type (`patch`, `minor`, `major`)
- Calculates the next version from current `package.json` version
- Finds previous `verify/v*` tag (or uses repo root if none)
- Filters `git log` to commits touching `packages/verify/`
- Groups by conventional commit prefix (feat, fix, docs, chore, etc.)
- Prepends new section to `packages/verify/CHANGELOG.md` (creates file if missing)
- Outputs what it did to stdout so the developer can review
- Uses `set -euo pipefail` and follows the existing script style (header comment block with usage, prerequisites)

### Task 3: Create initial `packages/verify/CHANGELOG.md`

**Deliverable**: Changelog with the v0.1.0 entry retroactively filled in

**Dependencies**: None

**Effort**: Trivial

**Details**: Since v0.1.0 was published manually without a changelog, create the initial file with a hand-written entry for v0.1.0 documenting the initial release. The changelog script will append to this going forward.

### Task 4: Create retroactive tag `verify/v0.1.0`

**Deliverable**: Git tag on the commit that represents the v0.1.0 release

**Dependencies**: Need to identify the correct commit (likely `5c9b781`)

**Effort**: Trivial

**Details**: The changelog script and CI workflow both need a baseline tag. Without it, the first changelog generation would include every commit in the repo's history. Tag the commit where the verify package was introduced (`5c9b781 feat(verify): zero-install CLI tool...`).

### Task 5: Add root npm script for release convenience (optional)

**Deliverable**: `"release:verify"` script in root `package.json`

**Dependencies**: Tasks 1, 2

**Effort**: Trivial

**Details**: One-liner convenience script:
```json
"release:verify": "echo 'Run: ./scripts/changelog-verify.sh <patch|minor|major> && cd packages/verify && npm version <same>'"
```

This is intentionally NOT automated end-to-end. It is a reminder of the two-step process. The developer should run each step manually so they can review the changelog before tagging. This could also just be documented in the README -- a script is not strictly necessary.

### Task 6: Document the release process

**Deliverable**: Release process section in `packages/verify/README.md`

**Dependencies**: Tasks 1-4

**Effort**: Small

**Details**: Add a "Releasing" section to the verify README documenting:
- Prerequisites (npm login, write access to @w-r-l org)
- The two-step process (changelog, then npm version)
- What happens after tagging (CI publishes automatically)
- How to verify the publish succeeded
- What to do if publish fails (the CI should handle graceful failure, but document manual recovery)

## Risks and Concerns

### Risk 1: `npm version` commit message may not match conventional commits

`npm version` creates a commit with message `vX.Y.Z` (or `verify/vX.Y.Z` with the tag prefix). This does not follow conventional commit format. Two options:

- **Accept it**: The version bump commit is a release artifact, not a feature commit. It is fine for it to have its own format. Many projects do this.
- **Override it**: Use `npm version minor -m "chore(verify): release %s"` to customize the commit message. This is cleaner for `git log` filtering.

Recommend the override approach -- it costs nothing and keeps the log consistent.

### Risk 2: No existing tag means first changelog run needs special handling

The script must handle the "no previous tag" case gracefully. Since Task 4 creates a retroactive tag, this is mitigated -- but the script should still handle it (defense in depth). Fallback: use `git log --oneline HEAD -- packages/verify/` (all commits).

### Risk 3: Monorepo tag namespace collision

If more packages are added later (e.g., `@w-r-l/capture`), their tags will need their own prefix (`capture/v*`). The `verify/v*` prefix convention established here should be documented as the pattern. This is a future concern, not a blocker -- YAGNI says don't build the multi-package release system now.

### Risk 4: Developer forgets to run changelog before npm version

If a developer runs `npm version` without generating the changelog first, the release will ship without changelog updates. This is a minor process risk, not a technical one. Mitigations:
- Document the process clearly (Task 6)
- Consider a git pre-tag hook that checks for changelog updates (but this is YAGNI territory -- skip it until it actually happens)

### Risk 5: `package-lock.json` in the verify package

The verify package has its own `package-lock.json`. `npm version` will update `package.json` but the lockfile version field may drift. Ensure the lockfile is either regenerated or updated as part of the version bump. `npm version` handles this automatically when run from the package directory.

## Additional Agents Needed

**None for the version bump + changelog tooling.** This is straightforward DevX work.

The CI workflow itself (GitHub Actions for tag-triggered publish) and npm token secrets management are handled by the iac-minion and security-minion respectively -- they are already part of this planning phase.
