# Domain Plan Contribution: iac-minion

## Recommendations

### 1. Node Version: Use 22, Not 18

**CRITICAL FINDING**: The plan specifies `.nvmrc` containing `18`, but **wrangler 4.73.0 requires Node >= 20.0.0** (declared in its `engines` field). Node 18 will fail at `npm ci` or at runtime. The locally installed Node is v24.11.1, confirming the project was never developed on Node 18.

**Recommendation**: Set `.nvmrc` to `22` (current LTS as of March 2026). Rationale:
- wrangler 4.73.0: requires `>=20.0.0`
- vitest 3.2.4: supports `^18.0.0 || ^20.0.0 || >=22.0.0`
- miniflare: supports `>=18.0.0`
- @redocly/cli: supports `>=18.17.0`
- Node 20 exits LTS maintenance in April 2026 (one month away). Node 22 is the active LTS until October 2027.

Node 22 satisfies all dependency requirements and is the correct LTS choice.

### 2. Runner Constraints for `@cloudflare/vitest-pool-workers`

**OS**: `ubuntu-latest` (currently `ubuntu-24.04`) works. The `workerd` package includes `@cloudflare/workerd-linux-64` (Linux x86_64) as an optional dependency, installed automatically via npm. No special OS or architecture configuration needed.

**Memory/CPU**: No special requirements for this test suite size (17 test files). The workerd process is a native binary spawned by Miniflare. Standard GitHub Actions runner (7 GB RAM, 2 vCPU) is sufficient. No `NODE_OPTIONS` flags needed (no `--max-old-space-size` or similar).

**Permissions**: The workflow only needs `contents: read` for checkout. No network access, no secrets, no deployment credentials. The tests run entirely locally using Miniflare's simulated Workers runtime (R2, KV, rate limiters are all in-memory/local-file simulations).

**Node flags**: None required. The `vitest.config.js` uses `node:crypto` for Ed25519 key generation, which is standard in Node 22. The `"type": "module"` in `package.json` handles ESM resolution.

### 3. `lint:api` (Redocly) CI Considerations

- `redocly lint openapi.yaml` is a pure static analysis step -- no network, no secrets, no side effects.
- The project has a `redocly.yaml` config file present; Redocly CLI will pick it up automatically.
- No CI-specific considerations. It runs identically locally and in CI.
- Suggestion: run `npm test` and `npm run lint:api` as separate steps (not combined) so failures are attributable. They have no dependency on each other so they could theoretically run in parallel jobs, but for a project this size that adds complexity without meaningful time savings. Sequential steps in one job is simpler.

### 4. Runner Image Pinning

**Recommendation**: Use `ubuntu-latest`, not a pinned version like `ubuntu-24.04`.

Rationale:
- This is a new open-source project. Reproducibility at the runner-image level is not a current concern -- the dependencies are already pinned via `package-lock.json` and exact versions in `package.json`.
- `ubuntu-latest` tracks the current stable runner, reducing maintenance burden (no manual bumps when GitHub rotates images).
- If the project later adds native dependencies or system library requirements, pinning can be reconsidered.
- GitHub's `ubuntu-latest` currently resolves to `ubuntu-24.04` anyway; pinning adds ceremony without value.

### 5. Timeout Adjustments

**Recommendation**: Set `timeout-minutes: 10` on the job.

- Miniflare startup involves spawning the `workerd` native binary and initializing simulated bindings (R2, KV, rate limiters, browser rendering binding). On a cold GitHub Actions runner, first-run startup can take 15-30 seconds.
- The 17 test files should complete in under 2 minutes total.
- `npm ci` for this dependency tree (wrangler, vitest, redocly, puppeteer) could take 1-3 minutes depending on npm cache state.
- Default GitHub Actions timeout is 360 minutes -- far too generous. Setting `timeout-minutes: 10` provides adequate headroom while preventing runaway jobs from burning minutes.

### 6. Workflow Structure

Recommended workflow shape:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@<pinned-sha>
      - uses: actions/setup-node@<pinned-sha>
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm test
      - run: npm run lint:api
```

Key design decisions:
- **Single job**: For a project this size, splitting into parallel jobs adds ~30s of overhead per job (checkout, setup, npm ci). Sequential steps in one job are faster and simpler.
- **`cache: 'npm'`**: The `actions/setup-node` action has built-in npm caching (keys on `package-lock.json` hash). No need for separate `actions/cache` step.
- **`permissions: contents: read`**: Principle of least privilege. This workflow reads code, runs tests, lints -- it needs nothing else.
- **Pin actions to SHA**: Per security best practices. Use full commit SHAs for `actions/checkout` and `actions/setup-node`.
- **No `concurrency` needed yet**: For a new project with low PR volume, concurrency groups add complexity without value. Can be added when needed.

### 7. What NOT to Include (Scope Boundary)

Per Margo-approved scope constraints, the CI workflow should NOT include:
- ESLint step
- Dependabot configuration
- CODEOWNERS file
- Release automation
- Issue/PR templates
- Deployment steps
- Secret injection
- Matrix builds (single Node version is correct for a Cloudflare Workers project)

## Proposed Tasks

### Task 1: Fix .nvmrc Version
- **Deliverable**: `.nvmrc` containing `22` (not `18`)
- **Dependencies**: None
- **Owner**: Whoever implements Step 4 of the plan
- **Risk if skipped**: CI will fail -- wrangler 4.73.0 will not install or run on Node 18

### Task 2: Create GitHub Actions CI Workflow
- **Deliverable**: `.github/workflows/ci.yml` per the structure above
- **Dependencies**: .nvmrc must exist with correct version
- **Owner**: Implementation agent
- **Notes**:
  - Pin `actions/checkout` and `actions/setup-node` to current commit SHAs (look up latest v4 SHAs at implementation time)
  - Single job, three steps after setup: `npm ci`, `npm test`, `npm run lint:api`
  - `timeout-minutes: 10`
  - Trigger on push to main and PRs targeting main

### Task 3: Validate CI Locally (Pre-PR Smoke Test)
- **Deliverable**: Confirmation that `npm ci && npm test && npm run lint:api` passes on Node 22
- **Dependencies**: Task 1
- **Owner**: Implementation agent
- **Notes**: Run the exact command sequence that CI will run, on Node 22, to catch any issues before the PR is opened

## Risks and Concerns

### Risk 1: Node 18 in .nvmrc (BLOCKING)
- **Severity**: High -- CI will fail on every run
- **Mitigation**: Change to `22` as recommended above
- **Evidence**: `wrangler@4.73.0` declares `"engines": {"node": ">=20.0.0"}` in its package.json

### Risk 2: workerd Binary Download on CI
- **Severity**: Low
- **Description**: `npm ci` downloads the platform-specific `workerd` binary (~50 MB) from npm. On rare occasions, npm registry throttling or CDN issues can cause this download to fail.
- **Mitigation**: The `cache: 'npm'` in `actions/setup-node` caches the npm global cache, which includes downloaded tarballs. After the first successful run, subsequent runs will use cached packages. The `timeout-minutes: 10` setting provides headroom for slow downloads.

### Risk 3: Miniflare Startup Race Conditions
- **Severity**: Very Low
- **Description**: In theory, Miniflare could fail to start on resource-constrained runners. In practice, GitHub Actions runners have sufficient resources and the `@cloudflare/vitest-pool-workers` pool handles startup/teardown lifecycle automatically.
- **Mitigation**: No special action needed. If flaky test failures appear later, investigate with `--reporter=verbose` and consider `retry: 1` in vitest config.

### Risk 4: `npm ci` Fails Due to Missing package-lock.json
- **Severity**: None (already mitigated)
- **Description**: `npm ci` requires `package-lock.json` to exist. The project already committed it in `d9bf489`.

## Additional Agents Needed

None. The CI workflow is straightforward and within iac-minion's domain. The other planned artifacts (CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, LICENSE, .gitignore, package.json metadata) are documentation/configuration tasks that don't require infrastructure expertise.
