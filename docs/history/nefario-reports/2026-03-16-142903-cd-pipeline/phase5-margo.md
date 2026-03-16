# Margo Review: CD Pipeline (Phase 5)

## VERDICT: APPROVE

The implementation is lean, proportional, and well-aligned with the project's
existing patterns. Three jobs, 71 lines of YAML, zero new dependencies, reuses
the existing smoke test script. This is about as simple as a production CD
pipeline can get for a Cloudflare Worker.

---

## Findings

### deploy-production.yml

- **[NIT]** `.github/workflows/deploy-production.yml:20-29` -- The `staging-smoke`
  job checks out the full repo and runs the smoke test script just to validate
  staging health. This is correct and lightweight, but the `environment: staging`
  declaration on line 23 means this job has access to staging secrets -- which is
  good (it needs `SMOKE_API_KEY`), just noting the access scope is intentional
  and appropriate.

- **[NIT]** `.github/workflows/deploy-production.yml:1` -- The comment
  `# Rollback: see OPERATIONS.md` at line 1 is a nice touch for discoverability.
  No action needed.

### OPERATIONS.md

- **[ADVISE]** `OPERATIONS.md:7-8` -- Placeholder URLs (`<YOUR_PRODUCTION_URL>`,
  `<YOUR_STAGING_URL>`) appear in 7 places throughout the document. A runbook
  with placeholder URLs is a runbook that will be wrong when someone reaches for
  it at 2am. These should be filled in with actual URLs before merge, or at
  minimum the PR description should flag this as a required post-merge action.
  If the URLs are sensitive and should not be committed, say so explicitly in the
  document rather than using placeholder syntax that looks like a template that
  was never filled in.

- **[NIT]** `OPERATIONS.md:125-126` -- The capture round-trip test on staging
  (Check 4 in the smoke script) runs during `staging-smoke` in the production
  pipeline. This means every push to main creates a real capture on staging.
  This is fine for a low-traffic project and the smoke script already handles
  it well, but worth noting -- if staging capture volume ever becomes an issue,
  the `SMOKE_SKIP_CAPTURE` flag is already available. No action needed now.

### README.md

- **[NIT]** `README.md:200` -- The added line `See [OPERATIONS.md](OPERATIONS.md)
  for deployment, rollback, and environment setup.` is well-placed and
  appropriately scoped. No issue.

### Overall Complexity Assessment

| Dimension | Assessment |
|-----------|-----------|
| New dependencies | 0 (reuses existing wrangler-action, checkout, setup-node) |
| New abstractions | 0 |
| New services | 0 (uses existing GitHub Actions, Cloudflare Workers) |
| Lines of YAML | 71 -- proportional to a 3-job pipeline |
| Complexity budget spend | ~2 (managed service: CI/CD pipeline on GitHub Actions) |
| Infrastructure proportionality | Good -- pipeline is simpler than the app it deploys |

The pipeline follows the established pattern from `deploy-staging.yml` closely.
The production variant adds only what is different: the `ref` input for
rollbacks, `SMOKE_SKIP_CAPTURE` for production smoke tests (avoiding real
captures against prod), and the staging-smoke gate. No over-engineering detected.

The OPERATIONS.md runbook is thorough without being bloated. The decision tree
for rollbacks, the two rollback options (workflow_dispatch vs CLI), and the
secrets warning are all operationally relevant -- not speculative documentation.

### YAGNI Check: Passed

- No multi-environment matrix builds
- No approval bot integrations
- No Slack/PagerDuty notification hooks
- No canary/blue-green deployment machinery
- No rollback automation beyond `workflow_dispatch` with a ref input
- Rollback is manual and explicit, which is correct for a single-operator project

### Serverless-First Check: Passed

GitHub Actions is serverless CI/CD. Cloudflare Workers is serverless compute.
The deployment target and pipeline are both fully managed. No self-managed
infrastructure introduced.

---

## Summary

This is a textbook-proportional CD pipeline: reuses existing infrastructure
(smoke script, wrangler-action, GitHub environments), adds the minimum YAML
needed for a staging-gated production deploy with rollback capability, and
documents operations without over-documenting. The only actionable item is
filling in the placeholder URLs in OPERATIONS.md before this reaches main.
