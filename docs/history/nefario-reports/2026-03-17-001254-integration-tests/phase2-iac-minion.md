# Phase 2: iac-minion -- CI Integration for `test:integration`

## Summary

Design a new `test-integration` job in `.github/workflows/ci.yml` that runs
`npm run test:integration` as a separate, non-blocking job alongside the
existing `test` job. The integration tests use `@cloudflare/vitest-pool-workers`
with miniflare's local Browser Rendering support (wrangler 4.73.0 -- well above
the 4.26.0 minimum), which downloads and runs a real Chromium binary locally.
No system Chromium install is required; miniflare/wrangler handles the browser
lifecycle.

## Recommendations

### 1. Separate job, not a new step

Add a new `test-integration` job rather than appending steps to the existing
`test` job. Rationale:

- **Independent failure domains**: Unit tests and integration tests fail for
  different reasons. A flaky network or slow browser should not block the fast
  unit test signal.
- **Parallel execution**: GitHub Actions runs jobs in parallel by default.
  The existing `test` job (~1 minute) finishes independently while integration
  tests run (~2-5 minutes).
- **Different timeout profiles**: Unit tests have a 10-minute timeout.
  Integration tests need a higher budget (15 minutes) to accommodate browser
  download + multiple real navigations.

### 2. Do NOT make integration tests a merge gate (initially)

The new job should use `continue-on-error: true` at the job level. This makes
the overall workflow status green even if integration tests fail. Rationale:

- Real-URL tests (e.g., stable static site) depend on third-party availability.
  A third-party outage should not block merges.
- The miniflare browser binding for local Chromium is relatively new
  infrastructure. Until we have confidence in CI stability (2-4 weeks of green
  runs), treat the entire job as advisory.
- The team can promote it to a required check later by removing
  `continue-on-error` and adjusting branch protection rules.

### 3. Reuse the docs-only skip logic

The integration job should reuse the same `changes` step pattern as the
existing `test` job to skip on docs-only PRs. This avoids burning CI minutes
on markdown edits.

### 4. Cache strategy

- **npm cache**: Use `actions/setup-node` with `cache: 'npm'` (same as existing
  job). The npm cache key is derived from `package-lock.json`, shared across jobs.
- **Chromium binary cache**: Wrangler/miniflare downloads Chromium to a local
  cache directory on first run. On GitHub Actions ubuntu-latest, this is
  typically `~/.cache/puppeteer` or a wrangler-managed path. We should cache
  this directory explicitly to avoid a ~100MB download on every run.
  Recommended: use `actions/cache` with a key based on the wrangler version
  (since browser version is tied to wrangler version). The path to cache
  needs verification -- run `npm run test:integration` once on CI and inspect
  where the browser binary lands, then add the cache. This can be a fast-follow
  rather than a blocker.

### 5. Timeout configuration

- **Job-level timeout**: `timeout-minutes: 15`. The browser download takes
  ~30-60s, each real navigation takes 10-30s, and there are multiple test
  scenarios. 15 minutes provides headroom without allowing runaway jobs.
- **Test-level timeout**: The vitest integration config should set its own
  `testTimeout` (e.g., 60000ms per test). This is test-minion's domain but
  important for CI: a single hung browser should not consume the entire job
  timeout before other tests get a chance to run.

### 6. No secrets required

The integration tests run against a local test server and use miniflare's
local browser binding. No Cloudflare API token, no deployed worker. The
`TSA_URL` for DigiCert timestamp is a public HTTP endpoint -- no secret needed.
This means the integration job does not need environment-level secrets and
works identically for PRs from forks (public repo scenario).

## Proposed CI Configuration

```yaml
  test-integration:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    continue-on-error: true
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          fetch-depth: 0
      - name: Check for code changes
        id: changes
        run: |
          BASE_REF="${{ github.event.pull_request.base.sha || github.event.before }}"
          if git diff --name-only "$BASE_REF"...HEAD | grep -qvE '\.md$|^docs/'; then
            echo "code=true" >> "$GITHUB_OUTPUT"
          else
            echo "code=false" >> "$GITHUB_OUTPUT"
          fi
      - if: steps.changes.outputs.code == 'true'
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - if: steps.changes.outputs.code == 'true'
        run: npm ci
      - if: steps.changes.outputs.code == 'true'
        run: npm run test:integration
      - if: steps.changes.outputs.code == 'false'
        run: echo "Docs-only change -- skipping integration tests."
```

### Design decisions in this config

1. **Same action SHAs**: Pinned to the exact same commit SHAs as the existing
   `test` job (checkout `@11bd7...`, setup-node `@49933...`). No new
   supply-chain surface.

2. **No `needs: test`**: The integration job runs in parallel with the unit
   test job. There is no dependency -- if unit tests fail, integration tests
   still run (and vice versa). This maximizes signal: you see both results
   at once.

3. **`continue-on-error: true`**: Makes the job advisory. GitHub shows the
   job status (green/red) but the overall workflow check stays green. This
   is the correct pattern for "allowed-to-fail" jobs per the requirements.

4. **`fetch-depth: 0`**: Required for the `git diff` docs-only detection
   (same as existing job).

5. **No environment**: No `environment:` key -- integration tests don't
   need secrets. This means no approval gates, no deployment protection
   rules, and PRs from forks work fine.

## Proposed Tasks

### Task 1: Add `test-integration` job to ci.yml
- **Deliverable**: Updated `.github/workflows/ci.yml` with the new job as shown above
- **Dependencies**: `npm run test:integration` script must exist in package.json (test-minion's deliverable)
- **Effort**: Small (copy existing pattern, adjust timeout and add continue-on-error)

### Task 2: Add `test-integration` job to deploy-staging.yml
- **Deliverable**: The staging deployment workflow currently runs `npm test`
  before deploying. Add integration tests as a parallel quality gate (also
  with `continue-on-error: true`). The deploy should not depend on integration
  tests passing -- only on unit tests.
- **Dependencies**: Task 1
- **Effort**: Small

### Task 3 (fast-follow): Add Chromium binary caching
- **Deliverable**: An `actions/cache` step that caches the browser binary
  directory between runs. Key should include wrangler version from
  package-lock.json.
- **Dependencies**: Task 1 must be merged and run at least once to identify
  the actual cache path on ubuntu-latest.
- **Effort**: Small, but requires empirical data from a CI run

## Risks and Concerns

### Risk 1: Chromium download flakiness on CI
**Probability**: Low-Medium.
**Impact**: Integration test job fails before any tests run.
**Mitigation**: The `continue-on-error: true` means this does not block merges.
Task 3 (Chromium caching) eliminates the download after the first successful
run. As additional insurance, the test script itself can be wrapped to
distinguish "browser download failed" from "test failed" in the job summary.

### Risk 2: miniflare local browser binding not working in GitHub Actions
**Probability**: Low. Wrangler 4.73.0 is well past the 4.26.0 threshold where
local browser rendering was introduced. GitHub Actions ubuntu-latest has
the required system libraries for headless Chromium (it runs Playwright
and Puppeteer tests for thousands of projects).
**Impact**: All integration tests fail.
**Mitigation**: `continue-on-error: true` prevents blocking. If this happens,
the fallback is to add explicit Chromium system dependencies:
`apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1`
(the standard headless Chrome dependencies). However, this is unlikely to be
needed -- miniflare bundles its own Chromium.

### Risk 3: Test flakiness from real-URL tests
**Probability**: Medium-High. Any test hitting a real external URL will
eventually fail due to DNS, network, or target site issues.
**Impact**: Noisy CI -- red integration job when nothing is actually broken.
**Mitigation**: `continue-on-error: true` at the job level handles this.
Additionally, test-minion should structure the vitest config so real-URL
tests are in a separate describe block or file that can be isolated. If
flakiness becomes a problem, the CI job can be split further (controlled
scenarios vs. real-URL advisory tests).

### Risk 4: CI minutes consumption
**Probability**: Certain -- integration tests are slower by design.
**Impact**: Increased CI cost (GitHub Actions minutes).
**Mitigation**: The docs-only skip logic avoids burning minutes on markdown PRs.
The 15-minute timeout caps worst-case consumption. Integration tests only run
the scenarios needed (not a full browser test matrix). At WRL's current commit
frequency, this adds maybe 5-10 minutes of CI time per PR -- negligible.

### Risk 5: Duplicate code in the docs-only check logic
**Probability**: Certain -- the `Check for code changes` step is duplicated.
**Impact**: Maintenance burden -- changes to the skip logic need to be made
in two places.
**Mitigation**: This is a known trade-off. The alternative (a separate
reusable workflow for the skip check) adds complexity that is not justified
for two jobs. If a third job needs the same logic, refactor to a composite
action. For now, duplication is the simpler choice.

## What I did NOT address (out of scope)

- **Integration test architecture, vitest config, test scenarios**: test-minion's domain.
  I assume `npm run test:integration` will exist and use a separate vitest config.
- **What the test server serves or how scenarios are structured**: test-minion.
- **Whether to add integration tests to the production deploy workflow**: Not
  recommended. Production deploys gate on staging smoke tests, not local
  integration tests. The staging deploy is the right place.

## Additional Agents Needed

None. The CI integration is straightforward and follows existing patterns in
the repository. test-minion handles the test infrastructure; this plan handles
the pipeline wrapper.
