# Outcome: R14 Production CD Pipeline

## What was built

Three files that implement a complete production CD pipeline for WRL:

1. **`.github/workflows/deploy-production.yml`** (71 lines) — Three-job sequential pipeline:
   - `staging-smoke`: validates staging health before allowing production deploy
   - `deploy`: deploys to production via wrangler-action with `environment: production` (triggers GitHub environment protection approval gate)
   - `smoke`: runs read-only smoke tests against production with `SMOKE_SKIP_CAPTURE=1`
   - Triggers: `push: branches: [main]` + `workflow_dispatch` with optional `ref` input for rollbacks

2. **`OPERATIONS.md`** (150 lines) — Lean operational runbook for a single developer:
   - Environment table, monitoring endpoints
   - Deploy-to-production flow (automatic + manual trigger)
   - Rollback decision tree with two paths: workflow_dispatch (preferred) and wrangler CLI (emergency)
   - Secrets-not-rolled-back caveat, rollback-is-temporary warning
   - GitHub environment setup reference (all secrets, vars, protection rules)

3. **`README.md`** — One-line addition linking to OPERATIONS.md in the Development section

## What changed in the codebase

- No application code changes
- No changes to existing workflows, smoke test, or wrangler.toml
- Backlog updated: R14 marked done, 4 deferred items added to Operations parking lot

## Deviations from issue spec

- **Tag triggers dropped**: Issue #44 mentions "triggered by tag or manual dispatch." The plan intentionally dropped tags in favor of `push: branches: [main]` + `workflow_dispatch`. Rationale: tags add cognitive load and security surface for a solo developer; Cloudflare Workers have built-in version history. `workflow_dispatch` with a `ref` input covers the manual dispatch and rollback use cases. See decisions.md Conflict 2.

- **OPERATIONS.md is 150 lines** (target was 80-120): The GitHub Environment Setup tables expanded the document. All content is operationally relevant; nothing speculative.

## Issues and surprises

- **Race condition between staging and production workflows**: Both trigger on push to main. The production workflow's `staging-smoke` job validates staging health, not code parity with the current deploy. For a solo project with linear history, this is acceptable — staging always runs the same or newer code. Would need `workflow_run` trigger if strict ordering becomes important.

- **Placeholder URLs**: OPERATIONS.md uses `<YOUR_PRODUCTION_URL>` and `<YOUR_STAGING_URL>` angle-bracket placeholders. These must be filled in after the GitHub environments are configured.

## Backlog changes

**Added to Operations parking lot:**
- `[consider] Deploy version check in smoke test` — trigger: when a deploy silently fails to update the Worker
- `[consider] Smoke test response time assertion` — trigger: when Coralogix/RUM shows latency regression
- `[consider] Automatic rollback on smoke failure` — trigger: when deploy frequency >1/day or team size >1
- `[consider] Tag-based release versioning` — trigger: when external consumers need stable version references

**Marked done:**
- R14: Production CD pipeline — moved to Done section

## Verification

- Code review: 3 APPROVE (code-review-minion, lucy, margo), 0 BLOCK
- Tests: 449/449 pass, no regressions
- lint:api not run (no API spec changes)
