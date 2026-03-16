## Code Review: r14-cd-pipeline

Reviewer: code-review-minion
Files reviewed: deploy-production.yml, OPERATIONS.md, README.md
Reference: deploy-staging.yml, wrangler.toml

---

VERDICT: APPROVE

FINDINGS:

- [NIT] deploy-production.yml:1 -- Top-of-file comment `# Rollback: see OPERATIONS.md` appears before the `name:` field. Valid YAML, but unconventional. The rollback pointer is more useful near the `workflow_dispatch` input block (around line 8-13) where readers will be when they want to run a rollback.
  FIX: Move comment to just above the `workflow_dispatch` inputs block, or drop it entirely since OPERATIONS.md is already linked from README.md.

- [NIT] deploy-production.yml:25-26 -- `staging-smoke` checkout has no `ref:` input. The deploy job (line 37-39) correctly pins to `${{ inputs.ref || github.sha }}` for rollback support. The staging-smoke job will always check out HEAD of the triggering sha, not the rollback ref. For most workflows this is acceptable (smoke-test.sh rarely changes and staging is being tested at its current deployed state, not the rollback ref), but the asymmetry is mildly surprising.
  FIX: Either document the intentional asymmetry with a comment on the staging-smoke checkout step, or accept as-is -- this is a design choice, not a bug.

---

### Checklist Results

**Action SHAs vs. deploy-staging.yml**
- checkout: `11bd71901bbe5b1630ceea73d27597364c9af683` -- matches staging. PASS
- setup-node: `49933ea5288caeca8642d1e84afbd3f7d6820020` -- matches staging. PASS
- wrangler-action: `da0e0edf58b41e3cd8317c1a9dbb2f0cd2791a54` -- matches staging. PASS

**3 jobs with correct needs chain**
- staging-smoke (no needs) -> deploy (needs: staging-smoke) -> smoke (needs: deploy). PASS

**environment: production on deploy job**
- Line 35: `environment: production`. PASS

**SMOKE_SKIP_CAPTURE: "1" on production smoke job**
- Line 70: `SMOKE_SKIP_CAPTURE: "1"`. PASS

**OPERATIONS.md rollback + secrets caveat**
- Rollback section present (lines 39-84).
- Secrets caveat present (lines 57-58): "Secrets are NOT rolled back with code. If secrets changed after the good commit, re-set the old values manually with `wrangler secret put`."
- Both rollback options (workflow_dispatch and emergency wrangler CLI) documented. PASS

**Security -- permission scope**
- `permissions: contents: read, deployments: write` -- minimal scope, matches staging. PASS

**Security -- secret handling**
- No hardcoded secrets. All values via `${{ secrets.* }}` and `${{ vars.* }}`. PASS
- wrangler-action `secrets:` block passes secrets as Worker secrets (encrypted), not env vars. PASS

**wrangler environment targeting**
- The production workflow omits `environment:` from wrangler-action (no `environment: production` input). This is CORRECT. wrangler.toml has no `[env.production]` section -- the top-level config IS production (name="wrl", APPLICATION_NAME="wrl"). Staging correctly passes `environment: staging` to select `[env.staging]`. Production correctly omits it to use the default top-level config. PASS

**OPERATIONS.md -- placeholder URLs**
- Lines 7-8: `<YOUR_PRODUCTION_URL>` / `<YOUR_STAGING_URL>` are intentional placeholders for operator configuration. Consistent with self-hosted single-operator deployment model. Not a defect.

---

### Summary

The workflow is correct and safe. The staging-smoke -> deploy -> smoke chain provides appropriate defense-in-depth for production: verify staging is healthy before deploying, then verify production is healthy after. The rollback design (workflow_dispatch with `ref` input, two rollback paths) is well-designed and the OPERATIONS.md documentation is thorough, specific, and accurately warns about the secrets-not-rolled-back caveat. Two nits only, neither blocking.
