# Outcome: 0018-staging-and-tos

## What was built

### R9: Staging environment (#39)

- **wrangler.toml**: Full `[env.staging]` block with isolated R2 bucket (`wrl-captures-staging`), placeholder KV namespace ID, rate limiters (2001-2003 series), Browser Rendering binding, and Coralogix vars with `APPLICATION_NAME = "wrl-staging"`.
- **src/log.js**: Parameterized `applicationName` to read from `env.APPLICATION_NAME` with fallback to `'wrl'`. Staging logs are tagged `wrl-staging` in Coralogix.
- **.github/workflows/deploy-staging.yml**: Three-job workflow (test → deploy → smoke). Triggers on push to main and workflow_dispatch. Uses `cloudflare/wrangler-action` with staging secrets from GitHub environment.
- **scripts/smoke-test.sh**: Bash smoke test with 4 checks: health endpoint, security headers (including ToS Link header), signing key, and capture round-trip (accepts `failed` as passing).
- **package.json**: Added `"smoke"` script entry.

### R7: Content moderation policy and ToS (#37)

- **TERMS.md**: Terms of Service at repo root. 12 sections covering acceptance, permitted use, prohibited uses, operator rights, no warranty, data handling, copyright/takedown, governing law.
- **CONTENT-POLICY.md**: Content moderation policy at repo root. Abuse reporting via email (bp@ben-peter.com), response commitments (3 days acknowledge, 5 days substantive), prohibited content categories.
- **src/index.js**: `Link` header with `rel="terms-of-service"` on every response (universal header block). Health endpoint enriched with `legal` object containing terms and policy URLs.
- **src/verify-page.js**: Footer updated with Terms and Report Abuse links. Footer link CSS added.
- **openapi.yaml**: `info.termsOfService` field, staging server entry, `TermsLink` header component, health response schema with `legal` object.
- **README.md**: Legal section added before License.

### Tests

- **test/health.test.js**: Updated to assert `legal` object with terms and policy URLs.
- **test/security-headers.test.js**: Updated `expectSecurityHeaders` helper to assert Link header with `rel="terms-of-service"`.
- **test/log.test.js**: Added two tests for `APPLICATION_NAME` parameterization (custom value + fallback).

386 tests pass across 19 files.

## What deviated from the plan

1. **ci.yml workflow_call dropped**: lucy flagged that `workflow_call` would break ci.yml's change detection logic. margo agreed inlining was simpler. Test steps are inlined in deploy-staging.yml instead.
2. **No discretionary reviewers**: All 5 discretionary pool members (ux-design, accessibility, sitespeed, observability, user-docs) were excluded -- the changes are infrastructure config, shell scripts, and two footer links.

## Operator action required

Before the staging workflow can succeed, the operator must:

1. Create a KV namespace: `wrangler kv namespace create KV --env staging`
2. Update `wrangler.toml` with the returned KV namespace ID
3. Create an R2 bucket: `wrangler r2 bucket create wrl-captures-staging`
4. Set up a GitHub `staging` environment with these secrets:
   - `CLOUDFLARE_API_TOKEN` (scoped to `wrl-staging` only)
   - `WRL_STAGING_CAPTURE_API_KEY` (separate from production)
   - `WRL_STAGING_SIGNING_KEY` (separate Ed25519 key -- never share with production)
   - `WRL_STAGING_CORALOGIX_SEND_KEY`
5. Set the `WRL_STAGING_BASE_URL` variable in the staging environment

## Backlog changes

- ~~#37 **R7: Content moderation policy and ToS**~~ -- DONE
- ~~#39 **R9: Staging environment**~~ -- DONE
