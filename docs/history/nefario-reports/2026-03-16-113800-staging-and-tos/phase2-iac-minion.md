## Domain Plan Contribution: iac-minion

### Summary

R9 is a clean serverless-first task -- no blocking concerns apply. The WRL project already runs on Cloudflare Workers. The staging environment is an isolated deployment of the same Worker with separate bindings. The implementation surface is: (1) `wrangler.toml` `[env.staging]` block, (2) a GitHub Actions deploy workflow, (3) a smoke test script, and (4) secrets management via `wrangler secret put` in CI.

---

### Recommendations

#### (a) wrangler.toml `[env.staging]` -- Binding Isolation

Cloudflare Workers environments create a separate Worker named `<name>-<env>` (in this case `wrl-staging`). **All bindings are non-inheritable** -- they must be redefined explicitly under `[env.staging]`. Only inheritable keys (name, main, compatibility_date, compatibility_flags) carry over from the top level.

The staging environment must redefine every binding the Worker uses:

```toml
[env.staging]
# Inheritable keys (name, main, compat) come from top level automatically.
# All bindings below are non-inheritable and MUST be redefined.

[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "wrl-captures-staging"

[[env.staging.kv_namespaces]]
binding = "KV"
id = "<STAGING_KV_NAMESPACE_ID>"

# Rate limiters: use the same limits but different namespace_ids to isolate
# counters between staging and production
[[env.staging.unsafe.bindings]]
name = "CAPTURE_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2001"
simple = { limit = 10, period = 60 }

[[env.staging.unsafe.bindings]]
name = "VERIFY_RATE_LIMITER"
type = "ratelimit"
namespace_id = "2002"
simple = { limit = 60, period = 60 }

[[env.staging.unsafe.bindings]]
name = "GLOBAL_CAPTURE_LIMITER"
type = "ratelimit"
namespace_id = "2003"
simple = { limit = 200, period = 60 }

[env.staging.browser]
binding = "BROWSER"

[env.staging.vars]
CORALOGIX_ENDPOINT = "https://ingress.eu2.coralogix.com/logs/v1/singles"
```

**Key decisions and rationale:**

1. **R2 bucket**: Create a separate `wrl-captures-staging` bucket. Staging captures must never pollute production storage. This also prevents accidental data deletion during testing from affecting production.

2. **KV namespace**: Create a new KV namespace for staging. The ID must be provisioned manually (`wrangler kv namespace create KV --env staging`) or via Terraform. The staging KV preview_id is unnecessary since staging IS the preview environment.

3. **Rate limiter namespace_ids**: Use a different numeric series (2001-2003 vs 1001-1003). Rate limiter namespace_ids are scoped per-worker, so since staging deploys as `wrl-staging` (a different Worker), technically the same IDs would be isolated. However, using different IDs is cheap insurance -- it makes the isolation explicit and prevents confusion if Cloudflare ever changes scoping behavior.

4. **Browser Rendering binding**: Must be redefined. The `[browser]` binding is non-inheritable. The binding name stays `BROWSER` -- Browser Rendering is a shared Cloudflare service, not a per-bucket resource, so there is no separate "staging browser instance."

5. **Coralogix vars**: Redefine the same endpoint. Staging logs should go to the same Coralogix ingestion endpoint but could use a different application name for filtering. However, since the `applicationName` is hardcoded as `'wrl'` in `src/log.js`, a clean approach is to add a `WRL_ENVIRONMENT` var and use it in log entries. This is a minor enhancement -- not blocking for R9 MVP.

**What NOT to put in wrangler.toml:**
- Secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`) are NEVER in wrangler.toml. They are set via `wrangler secret put --env staging`.

#### (b) GitHub Actions Deploy Workflow

Create `.github/workflows/deploy-staging.yml` as a **separate workflow** (not appended to ci.yml). Rationale: the CI workflow is a test-and-lint gate that runs on PRs and pushes. The deploy workflow is a different concern (deploy-on-merge) and should have different permissions, environment protection, and failure modes.

```yaml
name: Deploy Staging

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  deployments: write

jobs:
  test:
    # Reuse the CI workflow's test job to avoid duplication
    uses: ./.github/workflows/ci.yml

  deploy:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 5
    environment: staging
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      - name: Deploy to staging
        uses: cloudflare/wrangler-action@<PIN-TO-SHA>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          environment: staging
          secrets: |
            CAPTURE_API_KEY
            SIGNING_KEY
            CORALOGIX_SEND_KEY
        env:
          CAPTURE_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
          SIGNING_KEY: ${{ secrets.WRL_STAGING_SIGNING_KEY }}
          CORALOGIX_SEND_KEY: ${{ secrets.WRL_STAGING_CORALOGIX_SEND_KEY }}

  smoke:
    needs: deploy
    runs-on: ubuntu-latest
    timeout-minutes: 3
    environment: staging
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - name: Run smoke tests
        run: ./scripts/smoke-test.sh
        env:
          WRL_BASE_URL: ${{ vars.WRL_STAGING_BASE_URL }}
          WRL_API_KEY: ${{ secrets.WRL_STAGING_CAPTURE_API_KEY }}
```

**Design decisions:**

1. **Trigger**: `push: branches: [main]` + `workflow_dispatch` for manual redeploys. This means: PR merges to main trigger staging deploy. Production remains manual (R14 scope).

2. **Reuse CI checks**: The `test` job calls the existing CI workflow as a reusable workflow. This requires changing `ci.yml` to add `workflow_call` to its `on:` triggers. If that is too invasive, an alternative is to use the `needs` pattern differently -- but reuse is cleaner.

3. **Pin wrangler-action to SHA**: The cloudflare/wrangler-action must be pinned to a full commit SHA, not a tag. Before implementation, look up the latest stable SHA for v3.

4. **GitHub environment**: The `environment: staging` key on the deploy and smoke jobs enables:
   - Environment-scoped secrets (separate from repo-level secrets)
   - Deployment tracking in GitHub's Environments UI
   - Optional required reviewers (not needed for staging, but the mechanism is there)

5. **Secrets via wrangler-action's `secrets` input**: This is the cleanest approach. The action runs `wrangler secret put` for each listed secret before deploy. The secret values come from GitHub environment secrets mapped through the `env` block. This avoids manual `wrangler secret put` commands and ensures secrets are always current.

**CI workflow change needed**: Add `workflow_call:` to ci.yml's `on:` block so deploy-staging.yml can reuse it:

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_call:  # <-- add this
```

#### (c) Smoke Test: Separate Job, Not Post-Deploy Step

**Recommendation: Separate job.** Rationale:

1. **Isolation**: A failed smoke test should be clearly distinguishable from a failed deploy in the GitHub Actions UI. Separate jobs get separate status badges and can be independently retried.

2. **Timing**: Workers deployments are eventually consistent across edge locations. A brief propagation delay (seconds, not minutes) means a smoke test immediately after `wrangler deploy` might hit a stale version. A separate job provides a natural gap.

3. **Permissions**: The deploy job needs `CLOUDFLARE_API_TOKEN`. The smoke test only needs the staging API key and base URL. Separate jobs = separate permission scopes.

4. **Retryability**: If smoke fails due to transient issues (edge propagation), the operator can re-run just the smoke job without re-deploying.

**Smoke test script** (`scripts/smoke-test.sh`):

The script should be a standalone bash script (no Node.js dependency) that exercises the critical paths:

```
1. GET /health --> expect 200, {"status":"ok"}
2. POST /v1/captures with valid API key and a safe URL --> expect 202
3. GET /v1/captures/{id}/status --> expect 200 with status "pending" or "complete"
4. GET /.well-known/signing-key --> expect 200 with algorithm "Ed25519"
```

The capture round-trip test (step 2-3) validates auth, rate limiting, KV writes, and Browser Rendering all function. The full round-trip to "complete" takes 10-30 seconds (browser rendering + WACZ packaging), so the smoke test should poll status for up to 120 seconds.

Keep the script simple: `curl` + `jq` + `set -euo pipefail`. No npm dependencies for the smoke test itself.

#### (d) Staging Secrets Management

Three secrets are required for staging: `CAPTURE_API_KEY`, `SIGNING_KEY`, and `CORALOGIX_SEND_KEY`.

**Strategy:**

1. **Generate a separate CAPTURE_API_KEY for staging.** This is a simple random string. Generate with `openssl rand -base64 32`. This key is completely independent of the production key. Store it in a GitHub environment secret named `WRL_STAGING_CAPTURE_API_KEY`.

2. **Generate a separate SIGNING_KEY for staging.** Use the existing `scripts/generate-signing-key.js` to generate a new Ed25519 keypair. The staging signing key MUST be different from production -- captures signed in staging must not be verifiable against production's public key and vice versa. This prevents staging test data from being confused with production evidence. Store in GitHub environment secret `WRL_STAGING_SIGNING_KEY`.

3. **CORALOGIX_SEND_KEY**: Use the same Coralogix send key as production (both environments send to the same Coralogix account). The `applicationName: 'wrl'` in log.js means staging and production logs currently mix. This is acceptable for MVP -- a future enhancement can add an environment tag. Store in GitHub environment secret `WRL_STAGING_CORALOGIX_SEND_KEY`.

4. **CLOUDFLARE_API_TOKEN**: This is the Cloudflare API token that wrangler uses to deploy. It should have permissions scoped to the `wrl-staging` Worker (or at minimum, Workers Scripts:Edit on the account). Store as a GitHub environment secret `CLOUDFLARE_API_TOKEN` on the `staging` environment. If a single token manages both workers, it can be a repo-level secret instead.

**GitHub Environments setup:**
- Create a `staging` environment in the repo's Settings > Environments
- Add secrets: `WRL_STAGING_CAPTURE_API_KEY`, `WRL_STAGING_SIGNING_KEY`, `WRL_STAGING_CORALOGIX_SEND_KEY`, `CLOUDFLARE_API_TOKEN`
- Add variable: `WRL_STAGING_BASE_URL` (the staging Worker's URL, e.g., `https://wrl-staging.<account>.workers.dev`)
- No required reviewers for staging (this is a validation environment, not production)

**One-time manual setup before first deploy:**
The Cloudflare resources (KV namespace, R2 bucket) must exist before `wrangler deploy --env staging` succeeds. These can be created via:
```bash
# Create staging KV namespace
wrangler kv namespace create KV --env staging
# Output will give the namespace ID to put in wrangler.toml

# Create staging R2 bucket
wrangler r2 bucket create wrl-captures-staging
```

---

### Proposed Tasks

#### Task 1: Create Cloudflare Staging Resources
**What**: Provision the staging KV namespace and R2 bucket via wrangler CLI.
**Deliverables**:
- Staging KV namespace ID (to be placed in wrangler.toml)
- `wrl-captures-staging` R2 bucket created
- Generated staging CAPTURE_API_KEY and SIGNING_KEY values
**Dependencies**: Cloudflare account access, wrangler CLI authenticated.
**Note**: This is a manual/operator task, not a code task. The operator (Ben) runs these commands once.

#### Task 2: Add `[env.staging]` to wrangler.toml
**What**: Add the complete staging environment block with isolated bindings for KV, R2, rate limiters, Browser Rendering, and vars.
**Deliverables**: Updated `wrangler.toml` with `[env.staging]` block.
**Dependencies**: Task 1 (need the staging KV namespace ID).

#### Task 3: Update ci.yml for Reusable Workflow
**What**: Add `workflow_call:` to ci.yml's `on:` triggers so the deploy workflow can reuse it.
**Deliverables**: Updated `.github/workflows/ci.yml`.
**Dependencies**: None.

#### Task 4: Create deploy-staging.yml Workflow
**What**: New GitHub Actions workflow that runs tests (via ci.yml reuse), deploys to staging via wrangler-action, and runs smoke tests as a separate job.
**Deliverables**: `.github/workflows/deploy-staging.yml`
**Dependencies**: Task 2, Task 3.

#### Task 5: Write Smoke Test Script
**What**: Bash script that validates staging deployment via HTTP calls: health check, capture creation round-trip, signing key availability.
**Deliverables**: `scripts/smoke-test.sh` (executable, no npm dependencies).
**Dependencies**: None (can be developed in parallel with other tasks).

#### Task 6: Configure GitHub Environment and Secrets
**What**: Create `staging` environment in GitHub repo settings, add required secrets and variables.
**Deliverables**: GitHub `staging` environment with all secrets configured.
**Dependencies**: Task 1 (need generated key values).
**Note**: Manual/operator task.

#### Task 7: Verify First Staging Deploy
**What**: Push to main or trigger workflow_dispatch, confirm deploy + smoke tests pass.
**Deliverables**: Green workflow run, accessible staging Worker.
**Dependencies**: All previous tasks.

---

### Risks and Concerns

1. **Browser Rendering availability in staging**: Browser Rendering is a paid Cloudflare add-on. The staging Worker `wrl-staging` must have Browser Rendering enabled on the Cloudflare account. If it is only enabled for the production Worker, the staging environment will fail on capture creation. **Mitigation**: Verify Browser Rendering is account-level, not worker-level. If worker-level, enable it for `wrl-staging` in the Cloudflare dashboard.

2. **Rate limiter namespace_id scoping**: The `[[unsafe.bindings]]` rate limiter is a beta feature. Its scoping behavior across Worker environments is not fully documented. If namespace_ids 2001-2003 collide with anything, staging rate limiting could behave unexpectedly. **Mitigation**: Use the 2001-2003 series as proposed; if issues arise, the namespace_ids can be changed without code changes (wrangler.toml only).

3. **CI workflow reuse compatibility**: Making ci.yml a reusable workflow (adding `workflow_call:`) may require changes to how `github.event.pull_request.base.sha` is accessed, since reusable workflows receive different event contexts. The `changes` step in ci.yml computes `BASE_REF` from PR event data -- when called from deploy-staging.yml (a push event), this will still work via `github.event.before`, but testing is needed. **Mitigation**: Test the reusable workflow call path explicitly. If problematic, the simpler alternative is to duplicate the test steps in deploy-staging.yml (less DRY but zero coupling risk).

4. **wrangler-action secrets race condition**: The wrangler-action `secrets` input runs `wrangler secret put` for each secret before deploying. If this is the first deploy of `wrl-staging` and the Worker doesn't exist yet, `wrangler secret put` may fail. **Mitigation**: The wrangler-action handles this -- it deploys first, then sets secrets, then re-deploys if secrets changed. Verify this behavior with a test run. Alternatively, set secrets manually once with `wrangler secret put --env staging` before the first CI deploy.

5. **Staging URL exposure**: The staging Worker will be publicly accessible at `wrl-staging.<subdomain>.workers.dev`. Anyone who discovers the URL can hit the staging API (though they still need the staging API key for authenticated endpoints). The health and verify endpoints are public. **Mitigation**: This is acceptable for an internal staging environment. If needed later, a Cloudflare Access policy can gate the staging Worker.

6. **Coralogix log mixing**: Staging and production logs go to the same Coralogix endpoint with the same `applicationName: 'wrl'`. This makes it harder to filter. **Mitigation**: Accept for MVP. A future enhancement can add an `ENVIRONMENT` var to `[env.staging.vars]` and include it in log entries. This is not blocking for R9.

---

### Additional Agents Needed

**security-minion**: Should review the staging secrets isolation strategy -- specifically whether the staging SIGNING_KEY being different from production is sufficient to prevent staging/production confusion, and whether the staging Worker's public accessibility poses any risk to the production environment. The smoke test script will make HTTP requests with an API key -- the security-minion should verify the key is never logged or exposed in CI output.

No other additional agents are needed. The api-design-minion (already involved per the scratch directory) covers the R7 ToS endpoint design. The iac scope is fully covered by this contribution.
