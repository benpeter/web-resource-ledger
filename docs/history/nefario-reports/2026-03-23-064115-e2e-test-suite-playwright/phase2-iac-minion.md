# Domain Plan Contribution: iac-minion

## Recommendations

### (a) Playwright Browser Binary Caching

**Recommendation: Do not cache browser binaries. Download on every run.**

Playwright's own CI documentation [explicitly advises against caching](https://playwright.dev/docs/ci): "The amount of time it takes to restore the cache is comparable to the time it takes to download the binaries." The Chromium binary is ~150MB compressed and downloads in under 30 seconds on GitHub-hosted runners. Caching adds complexity (cache key management, cache invalidation on Playwright version bumps, OS dependency drift) for negligible time savings.

The `npx playwright install --with-deps chromium` command installs both the browser binary AND the OS-level dependencies (libglib, libnss, etc.) that Ubuntu runners need. Using `--with-deps` is essential because a bare Ubuntu image lacks the shared libraries Chromium requires.

**Important note on browser selection**: The e2e tests hit a remote staging API -- they are not testing cross-browser rendering. Install only Chromium (not Firefox or WebKit) to keep install time under 30 seconds and avoid unnecessary resource consumption. There is zero value in running API-interaction tests against multiple browser engines.

### (b) Secrets Configuration

The following secrets are needed in the GitHub `staging` environment (not at repository level -- environment-scoped secrets limit blast radius):

| Secret Name | Source | Purpose |
|-------------|--------|---------|
| `WRL_STAGING_CAPTURE_API_KEY` | **Already exists** -- used by `deploy-staging.yml` smoke job | API key for test tenant capture operations |
| `WRL_STAGING_ADMIN_KEY` | 1Password WRL vault > Staging > `ADMIN_KEY` | Create/teardown test tenants, manage API keys during test setup |
| `WRL_STAGING_WEBHOOK_SECRET` | Generate new, store in 1Password | HMAC secret for webhook signature verification in tests |

**Environment variable (not secret):**

| Variable | Value | Purpose |
|----------|-------|---------|
| `WRL_STAGING_BASE_URL` | **Already exists** -- used by smoke test | Staging Worker URL |

**What is NOT needed:**
- `CLOUDFLARE_API_TOKEN` -- the e2e tests hit staging over HTTP, they do not deploy anything
- GitHub OAuth test credentials -- see security-minion's guidance, but my recommendation is to bypass OAuth for e2e tests entirely by using pre-provisioned API keys (the OAuth flow is a unit-testable concern, not an e2e staging concern)
- `WRL_STAGING_SIGNING_KEY` -- tests verify signatures using the public key endpoint (`/.well-known/signing-key`), they do not need the private key

The existing `staging` environment in GitHub Actions already has protection rules and the `WRL_STAGING_CAPTURE_API_KEY` and `WRL_STAGING_BASE_URL` from the smoke test job. The e2e workflow should reuse this same environment.

### (c) Deployment Dependency Strategy

**Recommendation: Chain e2e tests after successful staging deployment using `workflow_run`, plus manual dispatch.**

The existing deployment pipeline is:

```
push to main -> deploy-staging.yml (test -> deploy -> smoke)
             -> deploy-production.yml (triggered by deploy-staging completion)
```

The e2e workflow should trigger on `workflow_run` completion of "Deploy to Staging" (same pattern production uses), inserting itself between staging smoke and production deploy:

```
push to main -> deploy-staging.yml (test -> deploy -> smoke)
             -> e2e-tests.yml (triggered on staging deploy success)
             -> deploy-production.yml (triggered on staging deploy success)
```

This means e2e tests and production deploy run in parallel after staging succeeds. The e2e tests are NOT a gate for production deployment (the smoke test already gates production). This is the correct posture for now -- e2e tests are a signal, not a blocker. The `continue-on-error` pattern from `ci.yml`'s integration test job is a good precedent.

If the team later decides e2e tests should gate production, the production workflow can be modified to also depend on e2e success. But that is a separate decision with real trade-offs (increased deployment latency, flaky test risk blocking deploys).

**Manual dispatch** (`workflow_dispatch`) should also be supported with an optional `ref` input, matching the pattern in `deploy-production.yml`. This allows running e2e tests against any branch deployed to staging, and re-running after manual staging deployments.

**Do NOT trigger on PRs.** E2e tests run against deployed staging infrastructure. PR code is not deployed to staging, so running e2e on PR events would test the _previous_ staging deployment against the _current_ code -- misleading at best. PRs are covered by the existing `ci.yml` unit and integration tests.

### (d) Trigger Design

```yaml
on:
  workflow_run:
    workflows: ["Deploy to Staging"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to test (default: main)'
        required: false
        type: string
```

The `workflow_run` trigger only fires when "Deploy to Staging" completes successfully. The job-level `if` condition should verify `github.event.workflow_run.conclusion == 'success'` to avoid running e2e tests when staging deployment failed.

### (e) Test Artifacts (Screenshots, Traces)

**Upload strategy:**

```yaml
- uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
  if: ${{ !cancelled() }}
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 14

- uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
  if: ${{ failure() }}
  with:
    name: test-traces
    path: test-results/
    retention-days: 7
```

Key decisions:
- **Always upload the HTML report** (`if: !cancelled()`) so both passing and failing runs have a browsable report. 14-day retention balances debuggability with storage costs.
- **Only upload traces on failure** (`if: failure()`) to avoid storing large trace files for passing runs. Traces are the primary debugging tool -- they contain DOM snapshots, network logs, and screenshots at each step. 7-day retention is sufficient since failures should be investigated promptly.
- **Playwright config should enable traces on first retry**: `use: { trace: 'on-first-retry' }` captures traces only for flaky/failing tests without the overhead of tracing every test.
- **Screenshot on failure** should be configured in Playwright config: `use: { screenshot: 'only-on-failure' }`.

### (f) Sharding and Parallelism

**Recommendation: No sharding. Single worker. Sequential execution.**

Sharding is overkill for 6 tests. The overhead of spinning up multiple containers, merging reports, and managing shard coordination far exceeds any time savings from parallel execution. Playwright sharding is designed for suites of 100+ tests.

Beyond count, there is a functional reason for sequential execution: all 6 tests share a single staging environment with real D1/R2/KV state. Parallel tests that create captures, manage quotas, and register webhooks on the same staging tenant would cause race conditions and flaky failures. Sequential execution eliminates this category of flakiness.

Set `workers: 1` in the Playwright config (Playwright docs recommend this for CI). The 6 tests should complete well within the 5-minute budget with sequential execution.

### Complete Workflow Design

```yaml
name: E2E Tests

on:
  workflow_run:
    workflows: ["Deploy to Staging"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      ref:
        description: 'Git ref to test (default: main)'
        required: false
        type: string

permissions:
  contents: read

jobs:
  e2e:
    if: >
      github.event_name == 'workflow_dispatch' ||
      (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success')
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: staging
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run e2e tests
        run: npx playwright test --project=e2e
        env:
          WRL_STAGING_BASE_URL: ${{ vars.WRL_STAGING_BASE_URL }}
          WRL_STAGING_CAPTURE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
          WRL_STAGING_ADMIN_KEY: ${{ secrets.WRL_STAGING_ADMIN_KEY }}
          WRL_STAGING_WEBHOOK_SECRET: ${{ secrets.WRL_STAGING_WEBHOOK_SECRET }}

      - name: Upload HTML report
        uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

      - name: Upload traces (failures only)
        uses: actions/upload-artifact@65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08 # v4.6.0
        if: ${{ failure() }}
        with:
          name: test-traces
          path: test-results/
          retention-days: 7
```

**Design notes on the workflow:**

1. **Action pins**: All actions pinned to full SHA, matching the existing CI pattern. The `actions/upload-artifact` SHA above (`65c4c4a1...`) corresponds to v4.6.0 -- this must be verified at implementation time against the actual latest commit SHA.
2. **Timeout**: 10 minutes provides 2x headroom over the 5-minute test budget. Captures against staging involve real browser rendering via Cloudflare Browser Rendering, which has variable latency.
3. **Environment**: Uses the existing `staging` environment, reusing its protection rules and secrets.
4. **Node cache**: `npm ci` dependencies are cached via `actions/setup-node`'s built-in cache (keyed on `package-lock.json`), matching the pattern in all other workflows.
5. **Permissions**: Read-only `contents` -- no deployment, no write access.
6. **Ref handling**: Mirrors `deploy-production.yml` pattern -- uses the deployed commit SHA from the workflow_run event, or an explicit ref from manual dispatch.

### Package Dependency Note

The `package.json` currently lists `@cloudflare/playwright` as a production dependency. This is Cloudflare's Playwright fork for their Browser Rendering binding (used inside the Worker for captures). The e2e test suite needs the standard `@playwright/test` package as a **devDependency**. These are two different packages:

- `@cloudflare/playwright` -- used at runtime inside the Worker to drive Cloudflare's browser binding
- `@playwright/test` -- used in CI to run Playwright tests against staging from outside

The implementation phase must add `@playwright/test` to `devDependencies`. The two packages can coexist.

## Proposed Tasks

### Task 1: Add `@playwright/test` to devDependencies
- `npm install -D @playwright/test`
- Verify it coexists with `@cloudflare/playwright` without conflicts (different package names, no namespace collision expected but must verify)

### Task 2: Create `playwright.config.js`
- Configure `baseURL` from `WRL_STAGING_BASE_URL` env var
- Single project named `e2e` pointing at `tests/e2e/`
- `workers: 1` for sequential execution in CI
- `retries: 1` for flakiness resilience (staging has real network latency)
- `timeout: 60000` per test (captures involve browser rendering, 30s default is too tight)
- `use.trace: 'on-first-retry'`
- `use.screenshot: 'only-on-failure'`
- `reporter: [['html', { open: 'never' }]]` for CI artifact upload
- Only Chromium project

### Task 3: Create `.github/workflows/e2e-tests.yml`
- Implement the workflow design above
- Pin all action SHAs (verify current latest SHAs at implementation time)

### Task 4: Provision `WRL_STAGING_ADMIN_KEY` in GitHub staging environment
- Read from 1Password: `op item get "Staging" --vault WRL --reveal` (ADMIN_KEY field)
- Add to GitHub environment secrets via `gh secret set WRL_STAGING_ADMIN_KEY --env staging`
- This is a one-time manual setup step

### Task 5: Generate and provision `WRL_STAGING_WEBHOOK_SECRET`
- Generate: `openssl rand -hex 32`
- Store in 1Password: `op item edit "Staging" --vault WRL "WEBHOOK_TEST_SECRET=<value>"`
- Add to GitHub: `gh secret set WRL_STAGING_WEBHOOK_SECRET --env staging`
- This secret is used by the webhook test receiver to verify HMAC signatures

### Task 6: Verify upload-artifact SHA
- At implementation time, verify the `actions/upload-artifact` commit SHA. The SHA `65c4c4a1ddee5b72f698fdd19549f0f0fb45cf08` should be confirmed against the actual v4.6.0 tag (or whatever the latest stable is at that point). Use: `gh api repos/actions/upload-artifact/git/refs/tags/v4.6.0 --jq .object.sha` (note: may need to follow annotated tag to get commit SHA).

## Risks and Concerns

### Risk 1: Staging Environment Contention
**Severity: Medium.** E2e tests create real captures, tenants, and webhooks in staging D1/R2/KV. If someone is manually testing staging or if the smoke test and e2e tests run simultaneously (both triggered by deploy-staging completion), they could interfere with each other. **Mitigation**: The smoke test completes in under 90 seconds and the e2e tests begin after the full deploy-staging workflow completes (which includes smoke). The `workflow_run` trigger fires after the entire workflow finishes, so there is no overlap with smoke. For manual contention, test isolation via unique tenant IDs per test run is the primary defense (test-minion's domain).

### Risk 2: Staging Rate Limiters
**Severity: Medium.** Staging has rate limiters (100 req/min per tenant, 200 req/min global, 5 req/min admin). Six e2e tests that create tenants, make captures, register webhooks, and poll for status could hit these limits, especially the admin rate limiter (5/min). **Mitigation**: Sequential test execution helps. Tests should reuse a single test tenant where possible rather than creating one per test. The admin rate limit of 5/min is the tightest constraint -- if tests need more than 5 admin API calls, they will need to space them or the staging rate limit should be raised for the admin endpoint.

### Risk 3: Flaky Tests Blocking Perception
**Severity: Low (by design).** The workflow is designed as a signal, not a gate -- production deployment proceeds independently. However, persistently red e2e results will erode trust in the signal. **Mitigation**: `retries: 1` in Playwright config handles transient flakiness. The `continue-on-error` pattern from `ci.yml` integration tests could be applied if needed, but I recommend starting without it -- force the team to fix flaky tests rather than hiding them.

### Risk 4: `@playwright/test` and `@cloudflare/playwright` Conflict
**Severity: Low but must verify.** Both packages are Playwright forks/variants. There is a theoretical risk of conflicting global state, browser binary management, or peer dependency issues. **Mitigation**: Test locally that `npm install -D @playwright/test` succeeds alongside `@cloudflare/playwright` without dependency resolution errors. If there is a conflict, the `@playwright/test` install should use `--legacy-peer-deps` or the packages should be isolated (e.g., e2e tests in a separate `package.json` under `tests/e2e/`).

### Risk 5: Webhook Test Receiver Availability
**Severity: Depends on chosen strategy (api-design-minion's domain).** If the webhook test uses an external receiver (webhook.site, dedicated Worker), that receiver must be available when e2e tests run. Any external dependency adds a failure mode. **Mitigation**: The webhook test receiver strategy should favor a receiver that the team controls (a dedicated Cloudflare Worker) over a third-party SaaS. A Workers-based receiver deployed once to staging is more reliable than webhook.site and avoids rate limits or downtime from a free-tier SaaS.

### Risk 6: Capture Timeout in CI
**Severity: Medium.** WRL captures involve Cloudflare Browser Rendering, which has variable cold-start latency. The smoke test uses a 90-second timeout for a single capture. If e2e tests make multiple captures sequentially, they could approach the 5-minute budget. **Mitigation**: Use `https://example.com` or a similarly fast-loading target URL for captures in e2e tests (matching the smoke test pattern). Set per-test timeout to 60 seconds in Playwright config with a 10-minute overall workflow timeout.

## Additional Agents Needed

None beyond those already in the metaplan. The five-agent consultation set (test-minion, iac-minion, security-minion, api-design-minion, ux-strategy-minion) covers all planning dimensions. Implementation is standard GitHub Actions + Playwright work that does not require additional specialist input.
