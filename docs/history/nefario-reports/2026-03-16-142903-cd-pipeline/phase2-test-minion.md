# Test Minion -- CD Pipeline Planning Contribution

## Planning Questions Addressed

1. Is the existing smoke test script sufficient for production post-deploy validation?
2. Should the production smoke test skip the capture round-trip?
3. How should the "staging must pass before production" gate be structured in CI?

---

## Analysis

### Current State of `scripts/smoke-test.sh`

The existing smoke test is well-designed for staging. It validates four concerns:

1. **Health endpoint** -- returns 200 with `status: ok` (fatal gate: remaining checks abort on failure)
2. **Security headers** -- validates Referrer-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, and the ToS Link header
3. **Signing key** -- validates `/.well-known/signing-key` returns Ed25519 key format
4. **Capture round-trip** -- submits a capture to `/v1/captures`, polls for status, verifies the Worker can actually process captures (optionally skippable via `SMOKE_SKIP_CAPTURE=1`)

The script is environment-agnostic: it relies entirely on `SMOKE_URL` and `SMOKE_API_KEY` env vars, with no staging-specific assumptions baked in. This is good -- the same script can target production with different env vars.

### What the Script Gets Right

- **Environment-agnostic design**: Parameterized via env vars, not hardcoded to staging
- **Fatal health gate**: Fails fast if the Worker is unreachable, avoiding cascading false failures
- **Header validation**: Checks the exact security headers that the production Worker must serve
- **Clean error reporting**: pass/fail counters with clear output, exit 1 on any failure
- **Arithmetic safety**: Uses `$((X + 1))` form, not `((X++))` -- safe under `set -e`

---

## Recommendations

### Question 1: Is the smoke test sufficient for production?

**The script is sufficient with minor additions.** No structural rewrite needed. Three small adjustments:

**1a. Add a version/commit check (strongly recommended).** After deploying to production, the smoke test should verify that the *correct version* is live, not just that *some* Worker is responding. Without this, a deploy that silently fails (Wrangler reports success but Cloudflare serves the old version) passes smoke tests because the old version is healthy.

Implementation: The health endpoint should return a build identifier (git SHA or deployment timestamp). The smoke test then verifies the expected value. This is the single most important production-specific enhancement because it guards against the "deploy succeeded but nothing changed" failure mode.

Approach: Add a `SMOKE_EXPECT_VERSION` env var. When set, the smoke test checks that `/health` returns a matching version field. When unset, the check is skipped (backward-compatible with staging as-is). The Worker's health handler would need to read a build-time variable (e.g., `env.DEPLOY_SHA` set via wrangler.toml `[vars]` or injected at deploy time via `--var DEPLOY_SHA:$GITHUB_SHA`).

**1b. Add response time assertion on health check (recommended).** The CLAUDE.md engineering philosophy mandates <300ms latency. The smoke test should enforce this for health at minimum. `curl -w '%{time_total}'` already provides the data; add a threshold check (e.g., 2 seconds for smoke, not the 300ms SLO -- the smoke test runs from GitHub Actions runners, not edge, so network latency adds ~100-500ms).

**1c. Add CORS header spot-check (nice-to-have, low priority).** If `CORS_ORIGINS` is configured in production, a preflight OPTIONS request could be validated. But since CORS_ORIGINS is currently commented out in wrangler.toml for both environments, this is premature. Skip for now.

### Question 2: Should production skip the capture round-trip?

**Yes. Set `SMOKE_SKIP_CAPTURE=1` for production smoke tests.** Three reasons:

1. **Side effects in production data.** Every capture round-trip creates a real R2 object, a real KV entry, and consumes a Browser Rendering session. Unlike staging where test artifacts are disposable, production captures are expected to be real evidence records. Smoke-test captures pollute the production ledger with junk data and there is currently no delete/cleanup API.

2. **Browser Rendering session cost.** Cloudflare Browser Rendering has usage limits. Each smoke-test capture burns a session. In a CD pipeline that deploys on every push to main, this adds up. Staging absorbs this cost intentionally; production should not.

3. **The other three checks provide sufficient confidence.** Health + security headers + signing key verifies that the Worker is alive, configured correctly, and has its crypto keys. The capture round-trip primarily validates the Browser Rendering binding and R2/KV write path -- these are infrastructure-level concerns that staging already validated on the same commit moments earlier. The staging-passes-before-production gate (Question 3) provides the capture round-trip coverage transitively.

**Counterargument considered and rejected:** "But what if production R2/KV bindings are misconfigured?" This is a valid concern, but it is better addressed by the version/commit check (Recommendation 1a) plus the signing-key check (which reads from KV). If the Worker is live, serving the correct version, returning the correct signing key from KV, and has all security headers, the remaining failure modes are narrow enough that staging coverage suffices.

**If capture round-trip is ever desired for production**, add a cleanup step: after verifying the capture resolved, DELETE the capture artifact. This requires implementing a delete endpoint first (currently not in the API), so it is not viable today.

### Question 3: Staging-must-pass-before-production gate

**Recommended approach: `workflow_run` trigger with explicit status check.**

The production deploy workflow should trigger on successful completion of the staging deploy workflow, not on `push` to `main` directly. This creates a strict sequential dependency: code lands on main -> staging deploys -> staging smoke passes -> production deploys -> production smoke passes.

**Structure:**

```yaml
# deploy-production.yml
name: Deploy to Production

on:
  workflow_run:
    workflows: ["Deploy to Staging"]
    types: [completed]
    branches: [main]

jobs:
  gate:
    runs-on: ubuntu-latest
    if: github.event.workflow_run.conclusion == 'success'
    steps:
      - run: echo "Staging deployment and smoke tests passed"

  deploy:
    needs: gate
    runs-on: ubuntu-latest
    environment: production  # <-- GitHub environment protection rules apply here
    steps:
      # ... checkout, npm ci, wrangler deploy (no --env flag = production)

  smoke:
    needs: deploy
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/smoke-test.sh
        env:
          SMOKE_URL: ${{ vars.WRL_PRODUCTION_BASE_URL }}
          SMOKE_API_KEY: ${{ secrets.WRL_PRODUCTION_CAPTURE_API_KEY }}
          SMOKE_SKIP_CAPTURE: "1"
```

**Why `workflow_run` over other approaches:**

| Approach | Pros | Cons |
|----------|------|------|
| `workflow_run` on staging success | Strict ordering; staging failure blocks production; clean separation of workflow files | Slightly harder to reason about triggering; `workflow_run` events have nuances (runs on default branch) |
| Same workflow file, sequential jobs | Simpler to read; single file | One massive workflow; staging and production environments blurred; harder to re-run production independently |
| `repository_dispatch` from staging | Maximum flexibility | Over-engineering for a two-stage pipeline |
| Manual approval only (no automation) | Simple | Defeats the purpose of CD; human becomes the bottleneck |

**The `workflow_run` approach wins** because it keeps staging and production as independent, auditable workflow files while enforcing the dependency. The `if: github.event.workflow_run.conclusion == 'success'` guard is the gate.

**Important nuance:** `workflow_run` triggers run using the workflow file from the default branch, not the triggering commit. This is fine because the production deploy workflow itself should be stable infrastructure. The code being deployed comes from `actions/checkout` which checks out the commit that triggered the staging workflow (available via `github.event.workflow_run.head_sha`).

**GitHub Environment Protection Rules** provide the second layer. The `production` environment should be configured with:

- Required reviewers (optional -- depends on whether Ben wants manual approval gate or fully automated CD)
- Wait timer (optional -- e.g., 5-minute delay to allow abort)
- Branch restriction to `main` only

These are configured in GitHub Settings, not in the workflow YAML.

---

## Proposed Tasks

### Task 1: Add build version to health endpoint and smoke test
**Size: S** | **Owner: implementer (nefario/code agent)**

- Modify `handleHealth()` in `src/index.js` to include a `version` field from `env.DEPLOY_SHA` (or similar), defaulting to `"dev"` when not set
- Add `SMOKE_EXPECT_VERSION` env var to `scripts/smoke-test.sh`: when set, assert `/health` response includes matching version
- Pass `--var DEPLOY_SHA:$GITHUB_SHA` in wrangler deploy steps in both staging and production workflows

### Task 2: Add response time check to smoke test
**Size: XS** | **Owner: implementer**

- Capture `time_total` from health check curl
- Warn (but don't fail) if >1s; fail if >5s
- Use generous thresholds -- this runs from GitHub Actions, not edge

### Task 3: Create `deploy-production.yml` workflow
**Size: M** | **Owner: implementer, with iac-minion input on environment configuration**

- `workflow_run` trigger on "Deploy to Staging" completion
- `gate` job with `if: conclusion == 'success'`
- `deploy` job with `environment: production`
- `smoke` job running smoke-test.sh with `SMOKE_SKIP_CAPTURE=1`
- Pass `SMOKE_EXPECT_VERSION` with the commit SHA
- Use `github.event.workflow_run.head_sha` for checkout ref

### Task 4: Configure GitHub `production` environment
**Size: XS** | **Owner: human (Ben) -- requires GitHub Settings access**

- Create `production` environment in repo settings
- Configure branch protection (restrict to `main`)
- Decide on required reviewers (yes/no) and wait timer
- Add secrets: `CLOUDFLARE_API_TOKEN`, `WRL_PRODUCTION_CAPTURE_API_KEY`, `WRL_PRODUCTION_SIGNING_KEY`, `WRL_PRODUCTION_CORALOGIX_SEND_KEY`, `WRL_PRODUCTION_IP_HASH_SEED`
- Add vars: `WRL_PRODUCTION_BASE_URL`

### Task 5: Add rollback smoke test failure handling
**Size: S** | **Owner: implementer, with ops/iac input**

- If production smoke test fails, the workflow should surface this clearly (it already fails the job, which is visible in GitHub)
- Consider: should a failed production smoke automatically trigger rollback? **Recommendation: no, not yet.** Wrangler rollback requires knowing the previous deployment ID. For MVP, fail loudly and let Ben roll back manually. Add automated rollback to backlog as a future enhancement.

---

## Risks and Concerns

### Risk 1: `workflow_run` checkout ref mismatch
**Severity: Medium** | **Mitigation: explicit**

`workflow_run` events run using the workflow file from the default branch HEAD, not the commit that triggered the upstream workflow. If the production workflow YAML changes in the same PR as application code, the *old* workflow file runs. This is actually fine for most cases (infrastructure-level workflow changes are rare and can be merged separately), but it must be documented. The *application code* checkout must use `github.event.workflow_run.head_sha` to deploy the correct commit.

### Risk 2: Production secrets not yet provisioned
**Severity: High** | **Mitigation: Task 4 must complete before first production deploy**

The staging workflow already has its secrets. Production needs its own set (`WRL_PRODUCTION_*` prefixed). If these are not set, the deploy job will fail with missing secret errors -- but wrangler may partially deploy before hitting the secret push step. The workflow should validate secrets are present before running `wrangler deploy`.

### Risk 3: Smoke test false confidence without version check
**Severity: Medium** | **Mitigation: Task 1**

Without the version/commit check, the smoke test validates that *a* Worker is live, not that *the deployed version* is live. This is the most common CD failure mode for Cloudflare Workers: deploy "succeeds" but the old version continues serving. Task 1 directly addresses this.

### Risk 4: No automated rollback on smoke failure
**Severity: Low for now** | **Mitigation: manual rollback + backlog item**

If production smoke fails, the broken version is live until Ben manually intervenes. For a single-operator project this is acceptable. For multi-user, automated rollback should be revisited. Add to backlog with activation trigger: "when first external user depends on production availability."

### Risk 5: Rate limiting on production smoke test
**Severity: Low** | **Mitigation: awareness**

The smoke test makes 3-4 HTTP requests. This is well within rate limits. But if the smoke test is ever extended to make many requests (e.g., testing multiple endpoints), it could hit the production rate limiter, causing false failures. The current scope is safe.

---

## Additional Agents Needed

### iac-minion
Needed for:
- Reviewing the `wrangler deploy` command for production (no `--env` flag, since production is the default environment in wrangler.toml)
- Confirming the GitHub environment protection rule configuration
- Advising on whether `wrangler.toml` needs a `[env.production]` block or if the top-level config is already the production config (current evidence says top-level = production)
- Input on the `--var DEPLOY_SHA:$GITHUB_SHA` injection approach vs. alternatives

### security-minion
Needed for (lightweight review, not full engagement):
- Confirming that the production secrets naming convention (`WRL_PRODUCTION_*`) aligns with security practices
- Reviewing whether the production API key used in smoke tests should be a dedicated "smoke" key with limited permissions, rather than the real capture API key (currently, staging uses the real staging key; production should consider a read-only smoke key if the API ever supports scoped keys)

No other specialists needed. The scope is well-contained: one new workflow file, minor smoke test enhancements, and GitHub environment configuration.
