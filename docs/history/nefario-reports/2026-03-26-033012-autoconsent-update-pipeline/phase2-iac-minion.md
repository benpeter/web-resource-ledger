# Phase 2: iac-minion Contribution — Autoconsent Update Pipeline

## Recommendations

### Workflow Triggers

Use `schedule` with a weekly cron plus `workflow_dispatch` for manual runs. Monday morning (UTC) is a good cadence — gives the team a full work week to review the PR before the next check.

```yaml
on:
  schedule:
    - cron: '0 6 * * 1'  # Monday 06:00 UTC
  workflow_dispatch: {}
```

`workflow_dispatch` with no inputs is sufficient — the workflow always targets `@latest`. If the team later wants to pin to a specific version, add an optional `version` input.

### `gh pr create` over `peter-evans/create-pull-request`

Use `gh pr create` instead of `peter-evans/create-pull-request`. Reasons:

1. **No third-party action dependency.** `gh` ships pre-installed on all GitHub-hosted runners — zero supply-chain surface. `peter-evans/create-pull-request` is a third-party action that requires SHA pinning, version tracking, and trust in the maintainer's release process.
2. **Simpler commit control.** The workflow needs to commit specific files (`package.json`, `package-lock.json`, `src/vendor/autoconsent.playwright.js`, `src/vendor/autoconsent-script.js`, `src/consent.js`). With `gh`, we `git add` exactly those files and `git commit` normally. `peter-evans/create-pull-request` has its own staging/commit logic that can be surprising (it diffs the working tree, so stray files can leak in).
3. **PR comments are trivial.** `gh pr comment` handles posting the test battery results. No additional action needed.
4. **Consistent with the repo's lean philosophy.** Fewer external actions = fewer things to audit and pin.

The workflow must `git push` the branch before `gh pr create`. Use `git push -u origin <branch>` then `gh pr create --head <branch>`.

### Permissions

The workflow needs:

- **`contents: write`** — to push the update branch
- **`pull-requests: write`** — to create the PR and post comments

Set these explicitly at the workflow level. The default `GITHUB_TOKEN` is sufficient — no PAT needed. The `gh` CLI uses `GITHUB_TOKEN` automatically.

```yaml
permissions:
  contents: write
  pull-requests: write
```

### Secrets for Staging API Key

Store the staging API key as a **repository secret** named `WRL_STAGING_KEY`. Pass it to the test battery step as an env var:

```yaml
- name: Run test battery
  env:
    WRL_KEY: ${{ secrets.WRL_STAGING_KEY }}
  run: node scripts/test-battery.js
```

Repository-level secret (not environment-level) is appropriate here — this workflow only hits staging, and there is no approval gate needed for a staging API key. If the repo later adds environment protection rules, the secret can be moved to a `staging` environment.

### Pinned Action SHAs

The repo pins actions to full commit SHAs with a version comment. The workflow must follow this convention. Current SHAs from `ci.yml`:

- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)

These same SHAs should be reused in the new workflow.

### Version Comparison Logic

Compare installed vs. latest npm version using `npm view` and the installed version from `package.json`:

```bash
INSTALLED=$(node -p "require('./node_modules/@duckduckgo/autoconsent/package.json').version")
LATEST=$(npm view @duckduckgo/autoconsent version)
if [ "$INSTALLED" = "$LATEST" ]; then
  echo "Already on latest ($INSTALLED), skipping."
  exit 0
fi
```

This is more reliable than parsing `npm outdated` output. Exit 0 (not failure) when already current — the workflow should succeed silently, not show red.

### Vendoring Script

The repo currently has no vendoring script — the vendor files were created manually. The workflow needs a script (`scripts/vendor-autoconsent.sh`) that:

1. Copies `node_modules/@duckduckgo/autoconsent/dist/autoconsent.playwright.js` to `src/vendor/autoconsent.playwright.js`
2. Regenerates `src/vendor/autoconsent-script.js` — reads `autoconsent.playwright.js` and wraps it as a JS string export
3. Updates the `AUTOCONSENT_VERSION` constant in `src/consent.js` to match the installed version

This script is a prerequisite that must be created as part of this work. It should be idempotent and usable both locally and in CI.

### Branch Naming and Idempotency

Use a branch name that encodes the target version: `chore/autoconsent-<version>`. Before creating the branch, check if a PR already exists for that version:

```bash
EXISTING=$(gh pr list --search "autoconsent $LATEST" --state open --json number --jq '.[0].number')
if [ -n "$EXISTING" ]; then
  echo "PR #$EXISTING already open for $LATEST, skipping."
  exit 0
fi
```

This prevents duplicate PRs if the workflow runs multiple times before the PR is merged.

### Test Battery Timeout

The test battery polls staging captures with a 300-second timeout per capture and runs ~20 sites. Worst case is ~10 minutes. Set `timeout-minutes: 20` on the battery job/step. The overall workflow should have `timeout-minutes: 30`.

### PR Description Content

The PR should include:
- Version bump (`X.Y.Z` -> `A.B.C`)
- Link to the autoconsent changelog/releases
- Test battery results summary (pass/fail counts, not full table — that goes in a PR comment)

### Workflow Structure

Single job is sufficient — no parallelism needed since steps are sequential and the workflow is not latency-sensitive. Multiple jobs would add overhead for checkout/setup-node in each job.

```
Job: update-autoconsent
  1. Checkout
  2. Setup Node
  3. npm ci
  4. Check versions (exit early if current)
  5. Check for existing PR (exit early if open)
  6. npm install @duckduckgo/autoconsent@latest
  7. Run vendor script
  8. Run unit tests (npm test)
  9. Run test battery (npm run test:battery)
  10. Configure git user
  11. Commit, push branch
  12. Create PR
  13. Post test battery results as PR comment
```

### Git User Configuration

GitHub Actions needs a git identity for commits. Use the standard bot identity:

```yaml
- name: Configure git
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
```

## Proposed Tasks

### Task 1: Create vendoring script (`scripts/vendor-autoconsent.sh`)

**Deliverable:** Shell script that copies the autoconsent playwright file from `node_modules`, regenerates the string-export wrapper, and updates the `AUTOCONSENT_VERSION` constant in `src/consent.js`.

**Dependencies:** None

**Details:**
- Must be idempotent (running twice produces identical output)
- Should validate that `node_modules/@duckduckgo/autoconsent` exists before proceeding
- Add a `vendor:autoconsent` npm script to `package.json` for ergonomic local use
- Run `shellcheck` on the script before committing

### Task 2: Create GitHub Actions workflow (`.github/workflows/autoconsent-update.yml`)

**Deliverable:** Complete workflow file following the structure above.

**Dependencies:** Task 1 (vendor script must exist)

**Details:**
- Pin `actions/checkout` and `actions/setup-node` to the same SHAs used in `ci.yml`
- Use `gh pr create` and `gh pr comment` (no third-party actions)
- Pass `WRL_STAGING_KEY` secret as `WRL_KEY` env var to battery step
- Exit cleanly (code 0) when already on latest or PR already exists
- Set `timeout-minutes: 30` on the job
- Capture test battery stdout to a file, then post as PR comment with `gh pr comment --body-file`

### Task 3: Add repository secret `WRL_STAGING_KEY`

**Deliverable:** Document in the PR that the secret must be added manually to the repo settings.

**Dependencies:** None (secret value is in 1Password vault "WRL", item "Staging", field `CAPTURE_API_KEY`)

**Details:**
- Cannot be automated via workflow — requires repo admin to add via Settings > Secrets
- Add a note in the PR description and in the workflow file comments

### Task 4: Verify the full pipeline end-to-end

**Deliverable:** Successful manual dispatch of the workflow, producing a PR with test battery results.

**Dependencies:** Tasks 1-3

**Details:**
- After merging the workflow, trigger via `gh workflow run autoconsent-update.yml`
- Verify: version check, vendor regeneration, unit tests, battery, PR creation, PR comment

## Risks and Concerns

### R1: Test battery flakiness against staging

The test battery hits ~20 real websites through staging. Some sites (NYT, CNN, TradingView) are known to be flaky due to rate limiting, geo-restrictions, or aggressive bot detection. A single flaky site could block an otherwise valid update.

**Mitigation:** The test battery already exits with code 1 if any site fails. Consider adding a threshold (e.g., allow up to 3 failures) or separating "core CMP sites" (Guardian, Spiegel, BBC — the ones that motivated this automation) from "nice-to-have" sites. This is a refinement for after the initial pipeline ships — start strict, loosen if flakiness is a real problem.

### R2: Staging availability

If staging is down or deploying when the cron fires, the battery fails and no PR is created. Silent failure — the team won't know unless they check workflow runs.

**Mitigation:** The cron trigger means it will retry next week automatically. For visibility, consider a follow-up that posts to a notification channel on workflow failure. Not blocking for v1.

### R3: Vendored script wrapper generation

The `autoconsent-script.js` wrapper escapes the entire playwright script into a JS string. If the upstream script contains characters that break string escaping (backticks, `${` template literals, etc.), the wrapper could produce invalid JS. The current file is ~170KB of stringified JS.

**Mitigation:** The vendor script should use `JSON.stringify()` (via node) to safely escape the content rather than naive shell string manipulation. Unit tests (`npm test`) will catch broken imports — the consent module imports from the vendor wrapper, so a malformed wrapper fails immediately.

### R4: npm registry availability

The version check and install depend on the npm registry being reachable. Transient registry outages could cause the workflow to fail.

**Mitigation:** `npm install` already retries by default. If the registry is unreachable, the workflow fails with a clear error. Low risk — npm registry uptime is excellent.

### R5: Branch conflicts from stale PRs

If a PR is opened but not merged for multiple weeks, the next cron run might try to create a new branch for an even newer version while the old PR is still open. The idempotency check (looking for existing open PRs matching the version) only catches same-version duplicates.

**Mitigation:** When a newer version is available and an older autoconsent update PR is still open, the workflow should close the stale PR and open a new one for the latest version. Add this logic after the version check: search for any open PR with `autoconsent` in the title, close it with a comment explaining it's superseded, then proceed with the new version.

## Additional Agents Needed

None. This is a self-contained CI/CD task within the iac domain. The vendoring script and workflow are infrastructure concerns. The test-battery script already exists. The consent module's `AUTOCONSENT_VERSION` constant update is a one-line sed operation within the vendor script.
