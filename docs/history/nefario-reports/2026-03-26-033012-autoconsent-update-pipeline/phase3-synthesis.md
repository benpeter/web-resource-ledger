# Phase 3: Synthesis -- Autoconsent Update Pipeline

## Delegation Plan

**Team name**: autoconsent-update-pipeline
**Description**: Automate vendored autoconsent update via GitHub Action -- weekly cron + manual dispatch, version check, npm update, regenerate vendor script, run tests + battery, open PR if tests pass.

### Task 1: Create vendoring script and npm script entry

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Create a Node ESM script `scripts/vendor-autoconsent.js` that regenerates the vendored autoconsent files. This script must be idempotent, work both locally and in CI, and use zero external dependencies (only Node built-ins: `fs`, `path`).

    ## What to do

    The script performs three operations:

    1. **Copy the autoconsent playwright bundle**: Read `node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js` and wrap it as a JS string export. Use `JSON.stringify()` to safely escape all content (handles backticks, template literals, control chars, etc.).

    2. **Write `src/vendor/autoconsent-script.js`**: The output format is:
       ```js
       // Auto-generated wrapper -- exports autoconsent script as a string
       // Do not edit; regenerate from autoconsent.playwright.js (NOT content.bundle.js)
       export default <JSON.stringify(content)>;
       ```
       This matches the current file format exactly. The two-line header comment must be part of the generated output (not preserved from existing content).

    3. **Update `AUTOCONSENT_VERSION` in `src/consent.js`**: Find the line `export const AUTOCONSENT_VERSION = '...';` and replace the version string with the installed version from `node_modules/@duckduckgo/autoconsent/package.json`. Use a regex replace -- the pattern is unambiguous.

    ## Error handling

    Fail loudly with actionable messages and exit code 1:
    - Missing `node_modules/@duckduckgo/autoconsent`: "autoconsent not installed. Run `npm install` first."
    - Missing `dist/autoconsent.playwright.js`: "autoconsent dist layout changed -- expected dist/autoconsent.playwright.js. Check if the package structure has changed in the new version."
    - `AUTOCONSENT_VERSION` line not found in consent.js: "Could not find AUTOCONSENT_VERSION export in src/consent.js. The line format may have changed."

    ## Output

    Print what was done to stdout:
    ```
    vendored autoconsent X.Y.Z -> src/vendor/autoconsent-script.js (NNNNN bytes)
    updated AUTOCONSENT_VERSION in src/consent.js to X.Y.Z
    ```

    ## npm script

    Add `"vendor:autoconsent": "node scripts/vendor-autoconsent.js"` to the `scripts` section of `package.json`.

    ## What NOT to do

    - Do not add any npm dependencies
    - Do not add a `--quiet` flag or any CLI argument parsing -- keep it simple
    - Do not touch `src/vendor/autoconsent.playwright.js` (that file is NOT used -- only `autoconsent-script.js` is the vendored artifact)
    - Do not modify any test files
    - Do not create a shell script -- this must be Node ESM (`.js` with `import` syntax, matching the project's `"type": "module"`)

    ## Context

    - The project uses `"type": "module"` in package.json (ESM throughout)
    - Existing scripts in `scripts/` are Node ESM (e.g., `test-battery.js`, `generate-signing-key.js`)
    - Current `AUTOCONSENT_VERSION` line in `src/consent.js` (line 30): `export const AUTOCONSENT_VERSION = '14.63.0';`
    - Current vendor file header is exactly the two-line comment shown above

    ## Verification

    After creating the script, run it once to confirm it produces identical output to the current vendor file (since no version change has occurred). Use `git diff --stat` to verify no unintended changes.

- **Deliverables**: `scripts/vendor-autoconsent.js`, updated `package.json` (new npm script entry)
- **Success criteria**: Running `node scripts/vendor-autoconsent.js` is idempotent (no git diff when run against current version). Running it after `npm update @duckduckgo/autoconsent` updates both the vendor file and the version constant. Missing node_modules produces a clear error.

### Task 2: Create GitHub Actions workflow

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: The workflow is the core deliverable and defines CI behavior (permissions, job structure, secret usage, PR creation logic). It has high blast radius -- once merged, it runs weekly and creates PRs automatically. Reviewing it before execution prevents rework.
- **Gate rationale**: |
    Chosen: Single-workflow with 3 jobs (update-and-test, battery, open-pr) using `gh pr create` and the `staging` environment for secrets
    Over: (1) Single-job approach (rejected: different failure semantics for unit vs battery require separate jobs), (2) `peter-evans/create-pull-request` action (rejected: third-party supply chain risk, surprising staging behavior)
    Why: Matches repo conventions (SHA-pinned actions, lean philosophy), separates blocking tests from advisory battery, reuses existing `staging` environment secrets
- **Prompt**: |
    Create `.github/workflows/autoconsent-update.yml` -- a GitHub Actions workflow that automatically checks for autoconsent updates, regenerates vendor files, runs tests, and opens a PR.

    ## Workflow triggers

    ```yaml
    on:
      schedule:
        - cron: '0 6 * * 1'  # Monday 06:00 UTC
      workflow_dispatch: {}
    ```

    ## Permissions

    ```yaml
    permissions:
      contents: write
      pull-requests: write
    ```

    ## Job structure

    Three jobs:

    ### Job 1: `update-and-test`
    - `runs-on: ubuntu-latest`
    - `timeout-minutes: 12`
    - Steps:
      1. Checkout (SHA-pinned: `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`)
      2. Setup Node (SHA-pinned: `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0`) with `node-version-file: '.nvmrc'` and `cache: 'npm'`
      3. `npm ci`
      4. **Version check** -- compare installed vs latest:
         ```bash
         INSTALLED=$(node -p "require('./node_modules/@duckduckgo/autoconsent/package.json').version")
         LATEST=$(npm view @duckduckgo/autoconsent version)
         if [ "$INSTALLED" = "$LATEST" ]; then
           echo "Already on latest ($INSTALLED), skipping."
           echo "skip=true" >> "$GITHUB_OUTPUT"
           exit 0
         fi
         echo "new_version=$LATEST" >> "$GITHUB_OUTPUT"
         echo "old_version=$INSTALLED" >> "$GITHUB_OUTPUT"
         ```
      5. **Check for existing PR** (skip if one already open for this version):
         ```bash
         EXISTING=$(gh pr list --search "autoconsent $LATEST in:title" --state open --json number --jq '.[0].number')
         if [ -n "$EXISTING" ]; then
           echo "PR #$EXISTING already open for $LATEST, skipping."
           echo "skip=true" >> "$GITHUB_OUTPUT"
           exit 0
         fi
         ```
      6. **Close stale autoconsent PRs** (if an older version's PR is still open):
         ```bash
         gh pr list --search "chore: update autoconsent in:title" --state open --json number,title --jq '.[].number' | while read -r pr; do
           gh pr close "$pr" --comment "Superseded by update to $LATEST"
         done
         ```
      7. `npm install @duckduckgo/autoconsent@latest`
      8. `npm run vendor:autoconsent`
      9. `npm test` (unit tests -- must pass)
      10. `npm run test:sync` (sync tests -- must pass)
      11. Set output `skip=false` (for downstream jobs)
    - Outputs: `skip`, `new_version`, `old_version`

    ### Job 2: `battery`
    - `needs: update-and-test`
    - `if: needs.update-and-test.outputs.skip != 'true'`
    - `runs-on: ubuntu-latest`
    - `timeout-minutes: 15`
    - `continue-on-error: true` (battery failures are advisory, not blocking)
    - `environment: staging`
    - Steps:
      1. Checkout
      2. Setup Node (same SHA-pinned versions)
      3. `npm ci`
      4. `npm install @duckduckgo/autoconsent@latest` (re-install since this is a fresh checkout)
      5. `npm run vendor:autoconsent` (regenerate since fresh checkout)
      6. Run battery with output capture:
         ```yaml
         - name: Run test battery
           id: battery
           continue-on-error: true
           run: npm run test:battery 2>&1 | tee battery-output.txt
           env:
             WRL_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
         ```
      7. Upload `battery-output.txt` as artifact:
         ```yaml
         - uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
           if: always()
           with:
             name: battery-results
             path: battery-output.txt
         ```
    - Outputs: `outcome` (from the battery step)

    ### Job 3: `open-pr`
    - `needs: [update-and-test, battery]`
    - `if: always() && needs.update-and-test.result == 'success' && needs.update-and-test.outputs.skip != 'true'`
    - `runs-on: ubuntu-latest`
    - `timeout-minutes: 5`
    - Steps:
      1. Checkout
      2. Setup Node (same SHA-pinned versions)
      3. `npm ci`
      4. `npm install @duckduckgo/autoconsent@latest`
      5. `npm run vendor:autoconsent`
      6. Configure git identity:
         ```bash
         git config user.name "github-actions[bot]"
         git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
         ```
      7. Create branch and commit:
         ```bash
         VERSION="${{ needs.update-and-test.outputs.new_version }}"
         OLD="${{ needs.update-and-test.outputs.old_version }}"
         BRANCH="chore/autoconsent-${VERSION}"
         git checkout -b "$BRANCH"
         git add package.json package-lock.json src/vendor/autoconsent-script.js src/consent.js
         git commit -m "chore: update autoconsent ${OLD} -> ${VERSION}"
         git push -u origin "$BRANCH"
         ```
      8. Download battery artifact (if available):
         ```yaml
         - uses: actions/download-artifact@fa0a91b85d4f404e444e00e005971372dc801d16 # v4.1.8
           continue-on-error: true
           with:
             name: battery-results
             path: .
         ```
      9. Create PR with battery results in body:
         ```bash
         BATTERY_STATUS="did not run"
         if [ -f battery-output.txt ]; then
           if [ "${{ needs.battery.result }}" = "success" ]; then
             BATTERY_STATUS="passed"
           else
             BATTERY_STATUS="failed (see details below)"
           fi
         fi

         body_file=$(mktemp)
         cat > "$body_file" <<PREOF
         ## Autoconsent update: ${OLD} -> ${VERSION}

         Automated update of \`@duckduckgo/autoconsent\` to ${VERSION}.

         - [Autoconsent releases](https://github.com/nicedigital/nicedigital-autoconsent/releases)
         - Unit tests: passed
         - Battery tests: ${BATTERY_STATUS}

         <details>
         <summary>Battery test output</summary>

         \`\`\`
         $(cat battery-output.txt 2>/dev/null || echo "No battery output available")
         \`\`\`

         </details>

         > **Note**: The \`WRL_STAGING_CAPTURE_API_KEY\` secret must be configured in the \`staging\` GitHub environment for battery tests to run.
         PREOF

         gh pr create \
           --title "chore: update autoconsent ${OLD} -> ${VERSION}" \
           --body-file "$body_file" \
           --base main \
           --head "$BRANCH"

         rm -f "$body_file"
         ```

    ## Important conventions

    - **Pin all actions to full commit SHAs** with a version comment (e.g., `# v4.2.2`). Match the existing `ci.yml` convention.
    - **Use `gh` CLI** for all GitHub API interactions (PR create, PR close, PR list). No third-party actions for PR management.
    - **Use the `staging` environment** for the battery job to access `WRL_STAGING_CAPTURE_API_KEY`. This secret already exists in the `staging` environment (used by `deploy-staging.yml` smoke tests).
    - **Exit 0** (not failure) when already on latest version or PR already exists. The workflow should succeed silently.
    - **Use `body-file`** pattern for PR creation (write to temp file, pass with `--body-file`). Never pipe heredocs to `--body-file -`.
    - **Close stale PRs**: When creating a PR for a newer version, close any existing open autoconsent update PRs with a comment explaining they are superseded.

    ## What NOT to do

    - Do not use `peter-evans/create-pull-request` or any third-party PR action
    - Do not use repo-level secrets -- use the `staging` environment
    - Do not make battery failures block PR creation
    - Do not add `workflow_dispatch` inputs (always targets `@latest`)
    - Do not modify existing workflow files
    - Do not add environment protection rules or approval requirements

    ## Context

    - Existing workflows pin actions: `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2`, `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0`
    - The `staging` environment already has `WRL_STAGING_CAPTURE_API_KEY` (used in `deploy-staging.yml` line 71)
    - `test-battery.js` reads the API key from `WRL_KEY` env var (see `scripts/test-battery.js` line 66)
    - The project uses `.nvmrc` for Node version
    - PR body pattern: use temp file + `--body-file` (per `.claude/rules/gh-cli-body-file.md`)
    - Look up the SHA for `actions/upload-artifact` v4 and `actions/download-artifact` v4 from the existing workflows or verify the correct pinned SHAs

- **Deliverables**: `.github/workflows/autoconsent-update.yml`
- **Success criteria**: Workflow file passes `actionlint` (if available). Manual `workflow_dispatch` trigger produces a PR with test results when an update is available. When already on latest, workflow succeeds silently with no PR.

### Cross-Cutting Coverage

- **Testing**: Covered within the workflow itself -- Task 2 runs `npm test`, `npm run test:sync`, and `npm run test:battery` as workflow steps. No separate test task needed; Phase 6 will run existing tests on the PR.
- **Security**: No new attack surface. The workflow uses `GITHUB_TOKEN` (automatic) and an existing environment secret. No PATs, no third-party actions with write access. No new security review needed.
- **Usability -- Strategy**: Not applicable. This is a CI/CD automation task with no user-facing interface. The PR description serves as the user interface, and its content is defined in Task 2.
- **Usability -- Design**: Not applicable. No UI components produced.
- **Documentation**: Phase 8 will handle. The PR description documents the workflow purpose and the `WRL_STAGING_CAPTURE_API_KEY` requirement. A brief note in the evolution log covers the decision rationale.
- **Observability**: Not applicable. The workflow produces GitHub Actions logs and PR comments -- standard CI observability. No runtime services created.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This task produces a CI workflow and a build script -- no UI, no runtime components, no coordinated services, no user-facing docs changes.
- **Not selected**:
  - ux-design-minion: No UI components produced
  - accessibility-minion: No web-facing HTML/UI produced
  - sitespeed-minion: No web-facing runtime code produced
  - observability-minion: No runtime components requiring coordinated logging/metrics
  - user-docs-minion: No end-user-facing behavior changes

### Decisions

- **Node script vs shell script for vendoring**
  Chosen: Node ESM script (`scripts/vendor-autoconsent.js`)
  Over: Shell script (`scripts/vendor-autoconsent.sh`) as iac-minion initially suggested
  Why: devx-minion's argument is compelling -- `JSON.stringify()` handles all string escaping edge cases in one call, while shell escaping at 170KB scale is fragile. The project already has Node scripts in `scripts/`. iac-minion's core concern (idempotent, works in CI) is satisfied by either approach.

- **Job structure: 3 jobs vs single job**
  Chosen: 3 separate jobs (update-and-test, battery, open-pr)
  Over: Single job with sequential steps (iac-minion's recommendation) and 4-job structure (test-minion's update-check + unit-tests + battery + open-pr)
  Why: test-minion correctly identified that battery needs different failure semantics (`continue-on-error`) and the `staging` environment for secrets. Single job would force unit tests into the staging environment unnecessarily. Collapsed to 3 jobs (merging update-check into update-and-test) because the version check and unit tests share the same checkout/install and don't benefit from separation.

- **Secret access: staging environment vs repo-level secret**
  Chosen: `staging` GitHub environment (existing `WRL_STAGING_CAPTURE_API_KEY`)
  Over: New repo-level secret `WRL_STAGING_KEY` (iac-minion's suggestion)
  Why: The secret already exists in the `staging` environment and is used by `deploy-staging.yml` and `deploy-production.yml`. Adding a duplicate repo-level secret creates drift risk. test-minion correctly identified the existing secret.

### Risks and Mitigations

1. **Battery test flakiness** (all specialists raised this): The battery tests 21 external sites that can fail due to rate limiting, geo-restrictions, or CMP changes. Mitigation: battery failures are advisory (`continue-on-error: true`), reported in PR body but not blocking PR creation.

2. **Autoconsent dist layout change** (devx-minion): If DuckDuckGo restructures the package, the vendor script breaks. Mitigation: clear error message naming the expected path. Weekly CI catches this quickly.

3. **Stale PRs accumulating** (iac-minion): If PRs aren't merged promptly, newer versions could create duplicates. Mitigation: workflow closes existing autoconsent PRs before opening a new one for a newer version.

4. **String escaping edge cases** (devx-minion, iac-minion): `JSON.stringify()` handles standard escaping. Any issues would surface as unit test failures since the consent module imports from the vendor wrapper.

5. **Staging availability** (iac-minion): If staging is down when cron fires, battery fails but PR still opens (advisory). Next week's run retries automatically.

6. **3-job checkout redundancy**: Each job does a fresh checkout + npm ci + npm install + vendor. This adds ~2-3 minutes total but is necessary because GitHub Actions jobs don't share filesystems. The workflow is not latency-sensitive (runs weekly), so this overhead is acceptable.

### Execution Order

```
Batch 1 (parallel: none, sequential):
  Task 1: Create vendoring script (devx-minion)

  [No gate -- script is straightforward, tested by running it]

Batch 2 (blocked by Task 1):
  Task 2: Create GitHub Actions workflow (iac-minion)

  [APPROVAL GATE: Review workflow before merge]
```

### Verification Steps

1. Run `node scripts/vendor-autoconsent.js` locally -- should produce identical output (no git diff)
2. Run `npm run vendor:autoconsent` -- should work as npm script alias
3. Review `.github/workflows/autoconsent-update.yml` for correct SHA pins, permissions, job structure
4. After merge: trigger `gh workflow run autoconsent-update.yml` and verify it either skips (already on latest) or creates a PR with battery results
