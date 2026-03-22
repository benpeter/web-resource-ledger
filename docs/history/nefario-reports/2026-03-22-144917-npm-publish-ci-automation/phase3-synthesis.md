# Phase 3: Synthesis -- npm Publish CI Automation

## Delegation Plan

**Team name**: npm-publish-pipeline
**Description**: Automated npm publishing for @w-r-l/verify via GitHub Actions on tag push, with version bump tooling and changelog generation.

---

### Conflict Resolution: Automation Token vs OIDC Trusted Publishing

**Chosen**: Automation token (granular access token with npm)
**Over**: OIDC Trusted Publishing (security-minion's recommendation)
**Why**:

1. The task's success criteria explicitly state: "npm publish uses a scoped automation token stored as a GitHub Actions secret." This is a clear requirement, not an assumption to override.
2. Node 22 ships npm 10.x. OIDC requires npm 11.5.1+, meaning the workflow must upgrade npm globally in CI -- adding a fragile step that pins to a specific npm version and must be maintained independently of the Node version.
3. security-minion's claim that "classic tokens no longer exist" requires verification. npm deprecated legacy auth tokens but granular access tokens (the replacement) are fully supported and do not have the 90-day limitation for automation tokens. The security benefits of OIDC are real but the practical risk of a well-scoped token for a single-maintainer project is low.
4. `--provenance` works with granular tokens too (requires `id-token: write`), so supply chain attestation is not lost.
5. Migration path is clear: when Node 24+ ships npm 11+, switching to OIDC is a minimal change (remove token, add trusted publisher config on npmjs.com).

security-minion's other recommendations are incorporated: SHA-pinned actions, minimal permissions, version-tag consistency check, EPUBLISHCONFLICT handling, no unnecessary permissions.

---

### Task 1: Create GitHub Actions publish workflow

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This workflow defines the publish trigger, auth model, and permission scope. All downstream tasks depend on its structure. Hard to reverse once tags are pushed against it.
- **Gate rationale**: |
    Chosen: Single-job workflow with automation token, `verify/v*` tag trigger, provenance attestation
    Over: OIDC Trusted Publishing (requires npm upgrade in CI), bare `v*` tags with path filtering (fragile)
    Why: Matches explicit success criteria; avoids npm version pinning complexity; provenance still works with tokens
- **Prompt**: |
    Create the file `.github/workflows/publish-verify.yml` -- a GitHub Actions workflow that publishes the `@w-r-l/verify` npm package when a tag matching `verify/v*` is pushed.

    ## Context

    - The verify package lives at `packages/verify/` in this monorepo
    - It has its own `package.json`, `package-lock.json`, and test suite (`node --test`)
    - The package is already published at v0.1.0 on npm
    - The repo uses Node 22 (`.nvmrc` contains `22`)
    - Existing workflows pin actions to full commit SHA with version comment

    ## Requirements

    **Trigger**: `push.tags: ['verify/v*']` -- only tag pushes matching this pattern.

    **Permissions** (workflow-level):
    ```yaml
    permissions:
      contents: read
      id-token: write
    ```
    `contents: read` for checkout. `id-token: write` for `--provenance` attestation. No other permissions.

    **Single job `publish`**:

    1. **Checkout**: Use `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`

    2. **Setup Node**: Use `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0` with:
       - `node-version-file: '.nvmrc'`
       - `registry-url: 'https://registry.npmjs.org'`
       (registry-url is required for setup-node to configure .npmrc with NODE_AUTH_TOKEN)

    3. **Install dependencies**: `cd packages/verify && npm ci`

    4. **Run tests**: `cd packages/verify && npm test`
       Run only the package's own tests, NOT root-level vitest. The package uses `node --test`.

    5. **Verify version matches tag**:
       ```bash
       TAG_VERSION="${GITHUB_REF_NAME#verify/v}"
       PKG_VERSION=$(node -p "require('./package.json').version")
       if [ "$TAG_VERSION" != "$PKG_VERSION" ]; then
         echo "::error::Tag version ($TAG_VERSION) does not match package.json version ($PKG_VERSION)"
         exit 1
       fi
       ```
       Use `working-directory: packages/verify` for this step.

    6. **Publish with provenance** and EPUBLISHCONFLICT handling:
       ```bash
       npm publish --provenance --access public 2>&1 | tee /tmp/npm-publish.log
       EXIT_CODE=${PIPESTATUS[0]}
       if [ $EXIT_CODE -ne 0 ]; then
         if grep -q 'EPUBLISHCONFLICT\|cannot publish over' /tmp/npm-publish.log; then
           echo "::warning::Version already published -- skipping"
           exit 0
         fi
         exit $EXIT_CODE
       fi
       ```
       Use `working-directory: packages/verify` and set env:
       ```yaml
       env:
         NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
       ```

    **Job settings**: `runs-on: ubuntu-latest`, `timeout-minutes: 10`

    **Style conventions** (match existing workflows):
    - All actions pinned to full commit SHA with `# vX.Y.Z` comment
    - Use `working-directory:` on steps rather than `cd` in `run:` blocks where possible
    - Steps have descriptive `name:` fields
    - Add a comment at the top of the file explaining what this workflow does

    ## What NOT to do
    - Do NOT add `packages: write` permission -- that is for GitHub Packages, not npmjs.com
    - Do NOT add `deployments: write` -- this is not a Cloudflare deployment
    - Do NOT install root-level dependencies or run root-level tests
    - Do NOT use `npm install -g npm@latest` or upgrade npm
    - Do NOT add a `paths:` filter -- path filters do not work on tag push events
    - Do NOT auto-push anything; the workflow only reacts to a pushed tag

- **Deliverables**: `.github/workflows/publish-verify.yml`
- **Success criteria**: Workflow YAML is valid; trigger matches `verify/v*` tags only; permissions are minimal; version-tag check prevents mismatches; EPUBLISHCONFLICT exits cleanly

---

### Task 2: Create version bump tooling and .npmrc tag prefix

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Create two files that together provide the version bump workflow for `@w-r-l/verify`:

    ## File 1: `packages/verify/.npmrc`

    One line:
    ```
    tag-version-prefix = verify/v
    ```

    This makes `npm version patch|minor|major` create monorepo-scoped tags like `verify/v0.2.0` instead of bare `v0.2.0`.

    ## File 2: `scripts/changelog-verify.sh`

    A shell script that generates/updates `packages/verify/CHANGELOG.md`.

    **Requirements**:
    - Accepts one argument: version bump type (`patch`, `minor`, `major`)
    - Calculates the next version from current `packages/verify/package.json` version
    - Finds the previous `verify/v*` tag using `git describe --tags --match 'verify/v*' --abbrev=0 2>/dev/null`
    - If no previous tag exists, uses all commits touching `packages/verify/`
    - Filters `git log --oneline <prev-tag>..HEAD -- packages/verify/` to get verify-scoped commits
    - Groups commits by conventional commit prefix (feat, fix, docs, chore, refactor, test, etc.) using simple grep/sed -- no external tools
    - Prepends a new section to `packages/verify/CHANGELOG.md` with format:
      ```
      ## v<next-version> (YYYY-MM-DD)

      ### Features
      - commit message

      ### Fixes
      - commit message
      ```
    - Creates the CHANGELOG.md file if it does not exist
    - Outputs a summary to stdout showing what was generated
    - Ends by printing the next steps:
      ```
      Next steps:
        1. Review and edit packages/verify/CHANGELOG.md
        2. cd packages/verify && npm version <type> -m "chore(verify): release %s"
        3. git push origin main --follow-tags
      ```

    **Style conventions** (match existing scripts like `scripts/smoke-test.sh`):
    - `#!/usr/bin/env bash` shebang
    - `set -euo pipefail`
    - Header comment block explaining purpose, usage, and prerequisites
    - Make it executable (`chmod +x`)
    - Keep it under 60 lines of bash
    - Use `node -p "require('./packages/verify/package.json').version"` to read the current version (the repo already uses Node; no need for jq)
    - Calculate next version with shell arithmetic on the semver components

    ## File 3: `packages/verify/CHANGELOG.md`

    Create the initial changelog with a retroactive v0.1.0 entry:

    ```markdown
    # Changelog

    ## v0.1.0 (2025-10-04)

    Initial release -- zero-install CLI tool for full cryptographic verification of WRL WACZ bundles.

    - Ed25519 signature verification
    - SHA-256 content hash validation
    - RFC 3161 timestamp verification with DigiCert TSA chain
    - CMS certificate chain validation
    - Human-readable and JSON output formats
    ```

    Use the date from the npm publish date of v0.1.0 (look it up with `npm view @w-r-l/verify time` if needed, or use the commit date of `5c9b781`).

    ## What NOT to do
    - Do NOT add any npm devDependencies for changelog generation
    - Do NOT create a combined bump+changelog script -- keep them separate so the developer can review the changelog before tagging
    - Do NOT add a root-level npm script -- the two-step process is simple enough to document
    - Do NOT auto-push in the changelog script

- **Deliverables**: `packages/verify/.npmrc`, `scripts/changelog-verify.sh`, `packages/verify/CHANGELOG.md`
- **Success criteria**: `npm version minor` in `packages/verify/` creates a `verify/v*` tag; changelog script generates grouped commit history; initial CHANGELOG has v0.1.0 entry

---

### Task 3: Create retroactive tag and document release process

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    Two deliverables:

    ## Deliverable 1: Create retroactive `verify/v0.1.0` tag

    Create an annotated git tag `verify/v0.1.0` on commit `5c9b781` (the commit that introduced the verify package). This tag is needed as a baseline for the changelog script and the CI workflow.

    ```bash
    git tag -a verify/v0.1.0 5c9b781 -m "chore(verify): retroactive tag for v0.1.0 release"
    ```

    Do NOT push the tag yet -- it will be pushed as part of the PR or post-merge.

    ## Deliverable 2: Add "Releasing" section to `packages/verify/README.md`

    Add a new section at the end of the existing README (before any license section if present) documenting the release process:

    ```markdown
    ## Releasing

    Releases are published to npm automatically when a `verify/v*` tag is pushed.

    **Steps:**

    1. Generate the changelog (review and edit before proceeding):
       ```bash
       ./scripts/changelog-verify.sh patch   # or minor, major
       ```

    2. Bump version, commit, and create tag:
       ```bash
       cd packages/verify && npm version patch -m "chore(verify): release %s"
       ```

    3. Push the commit and tag:
       ```bash
       git push origin main --follow-tags
       ```

    The CI workflow runs tests and publishes to npm with provenance attestation.
    If the version already exists on npm, the publish step exits cleanly.
    ```

    ## What NOT to do
    - Do NOT push the tag (the human decides when to push)
    - Do NOT modify any other section of the README
    - Do NOT add a root-level npm script for releasing

- **Deliverables**: Git tag `verify/v0.1.0` on commit `5c9b781`; updated `packages/verify/README.md` with Releasing section
- **Success criteria**: Tag exists locally on the correct commit; README documents the complete release flow

---

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test validation). The workflow itself runs package tests (`npm test`). No new test files to write -- the workflow's correctness is validated by the dry-run verification step described in the success criteria task briefing.
- **Security**: security-minion's recommendations incorporated directly into Task 1 prompt: minimal permissions, version-tag consistency check, EPUBLISHCONFLICT handling, SHA-pinned actions, no unnecessary secrets exposure. The automation token vs OIDC decision is documented in Conflict Resolution above.
- **Usability -- Strategy**: The release process is a developer-facing workflow. devx-minion designed it as a two-step process (changelog, then version bump) to preserve human review. This is the simplest flow that satisfies the requirements. No user journey concerns -- this is internal tooling.
- **Usability -- Design**: Not applicable. No user-facing UI produced.
- **Documentation**: Task 3 adds a Releasing section to the verify README. Phase 8 (post-execution documentation) handles any additional documentation needs.
- **Observability**: Not applicable. The workflow produces GitHub Actions logs natively. No runtime services, APIs, or background processes are introduced.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Rationale by reviewer:
- **Not selected**:
  - ux-design-minion: No UI components produced. All deliverables are CI config, shell scripts, and markdown.
  - accessibility-minion: No web-facing HTML or UI.
  - sitespeed-minion: No web-facing runtime code.
  - observability-minion: No runtime components. GitHub Actions provides native logging.
  - user-docs-minion: The README update in Task 3 covers developer documentation adequately. End users of the `@w-r-l/verify` CLI are not affected by the release process.

---

### Decisions

- **Tag prefix convention**
  Chosen: `verify/v*` scoped tag prefix (e.g., `verify/v0.2.0`)
  Over: Bare `v*` tags with in-workflow path check (iac-minion Option B)
  Why: All three specialists agreed on scoped prefixes. Bare `v*` tags with path filtering is fragile (path filters don't work on tag events), wastes runner time on false triggers, and collides if more packages are added.

- **Changelog tooling**
  Chosen: Shell script (`scripts/changelog-verify.sh`) parsing `git log`
  Over: conventional-changelog-cli (npm dependency), git-cliff (Rust binary), changelogen (npm dependency)
  Why: Zero new dependencies. The project has infrequent releases and a single maintainer. A 40-line shell script matches the existing scripting style (smoke-test.sh, provision-alerts.sh). Graduate to a tool when release frequency or team size warrants it.

- **Version bump mechanism**
  Chosen: `npm version` with `.npmrc` tag prefix (devx-minion)
  Over: Custom shell script that manually edits package.json and creates tags (iac-minion)
  Why: `npm version` already does exactly what's needed -- updates package.json, creates commit, creates tag. Writing a custom script reimplements built-in functionality, violating KISS/YAGNI. The `.npmrc` `tag-version-prefix` setting handles the monorepo prefix with zero code.

- **Changelog and version bump separation**
  Chosen: Separate tools with documented two-step process (devx-minion)
  Over: Combined bump+changelog script (iac-minion Task 4)
  Why: Separating them preserves the human review step. The developer generates the changelog, reviews/edits it, then bumps the version. Combining them removes the ability to review before tagging.

---

### Risks and Mitigations

1. **Tag-version mismatch** (HIGH, all specialists agree)
   Risk: Someone pushes a tag that doesn't match package.json version.
   Mitigation: Mandatory version-tag consistency check in the workflow (Task 1 step 5). The bump script (`npm version`) eliminates manual version editing, reducing mismatch probability.

2. **npm token scope and 2FA** (MEDIUM, iac-minion)
   Risk: If @w-r-l org has mandatory 2FA, only automation-scoped tokens work from CI.
   Mitigation: Use an automation-scoped granular access token. Test with `npm whoami` before first real publish. Store token in both GitHub Actions secrets and 1Password WRL vault.

3. **npm account compromise** (MEDIUM, security-minion)
   Risk: Compromised npm account could reconfigure publishing or push malicious versions.
   Mitigation: Ensure 2FA is enabled on the npm account, recovery codes stored in 1Password. `--provenance` attestation provides an audit trail linking published versions to specific commits.

4. **No existing tag for first changelog run** (LOW, devx-minion)
   Risk: Without a baseline tag, the changelog script would include all repo history.
   Mitigation: Task 3 creates a retroactive `verify/v0.1.0` tag on the original commit. The script also handles the no-tag fallback defensively.

5. **package-lock.json drift** (LOW, iac-minion)
   Risk: If dependencies are updated but lockfile isn't committed, `npm ci` in CI fails.
   Mitigation: This is actually desired -- it catches the problem early. The bump script checks for uncommitted changes before proceeding.

---

### Execution Order

```
Batch 1 (parallel):
  Task 1: publish-verify.yml      [iac-minion]     --> APPROVAL GATE
  Task 2: .npmrc + changelog + CHANGELOG.md  [devx-minion]

Batch 2 (sequential, after Batch 1):
  Task 3: retroactive tag + README docs  [devx-minion, blocked by Task 2]

Manual step (after PR merge):
  - Provision NPM_TOKEN as GitHub Actions secret (human, documented in Task 1 workflow comments)
  - Push retroactive tag: git push origin verify/v0.1.0
  - Configure npm account 2FA if not already enabled
```

Note: NPM_TOKEN provisioning is a manual step that cannot be automated by an agent. The workflow will fail gracefully if the secret is missing (npm publish will error with an auth failure, which is a clear signal). The workflow file should include a comment noting this prerequisite.

---

### Verification Steps

1. **Workflow syntax**: Run `actionlint` or push the workflow file and verify GitHub accepts it
2. **Version bump flow**: In `packages/verify/`, run `npm version patch --dry-run` to confirm the tag prefix works
3. **Changelog generation**: Run `./scripts/changelog-verify.sh patch` and verify the output groups commits correctly
4. **End-to-end**: After merging and provisioning NPM_TOKEN, bump to v0.1.1, push the tag, verify:
   - CI workflow triggers
   - Tests pass
   - Version-tag check passes
   - npm publish succeeds with provenance
   - Re-running against the same version exits cleanly (EPUBLISHCONFLICT handled)
5. **Existing package unaffected**: `npm view @w-r-l/verify@0.1.0` still returns the original package metadata
