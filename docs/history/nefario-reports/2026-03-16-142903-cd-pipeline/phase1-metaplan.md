## Meta-Plan

### Context Summary

WRL is a Cloudflare Workers project for tamper-evident web archival. The infrastructure already includes:

- **CI workflow** (`ci.yml`): tests + OpenAPI lint on PRs and pushes to main
- **Staging deploy** (`deploy-staging.yml`): test -> wrangler deploy --env staging -> smoke test, triggered on push to main
- **Smoke test script** (`scripts/smoke-test.sh`): health check, security headers, signing key validation, capture round-trip
- **wrangler.toml**: has `[env.staging]` with isolated KV, R2, rate limiters -- but NO production environment section (production deploys use the top-level config)

The task is R14: create a production CD pipeline with environment protection rules, post-deploy health checks, rollback capability, and a gate that requires staging smoke tests to pass before production deploy is permitted.

Key architectural facts:
- Production is the "default" wrangler environment (no `--env` flag)
- Cloudflare keeps previous Worker deployments, enabling `wrangler rollback`
- Production secrets (`CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`, `IP_HASH_SEED`) are already set via `wrangler secret put`
- `CLOUDFLARE_API_TOKEN` is already in GitHub secrets (used by staging)
- The existing smoke test accepts `SMOKE_URL` and `SMOKE_API_KEY` env vars -- it is environment-agnostic and reusable for production
- The iac-minion previously recommended: tag-triggered workflow, GitHub environment protection rules, post-deploy smoke test, `wrangler rollback` for rollback

### Planning Consultations

#### Consultation 1: Production Workflow Design
- **Agent**: iac-minion
- **Planning question**: Design the `deploy-production.yml` GitHub Actions workflow. Specifically: (1) What trigger strategy -- tag push (`v*`), `workflow_dispatch`, or both? (2) How should the workflow enforce "staging smoke tests pass first" -- call the staging deploy workflow, require it as a prerequisite via `workflow_run`, or a separate gate step? (3) Should production use a separate `CLOUDFLARE_API_TOKEN` scoped to the production environment, or share the existing token? (4) What GitHub environment protection rules should be configured (required reviewers, wait timers, deployment branches)? (5) How should the rollback workflow work -- `wrangler rollback` via `workflow_dispatch` with the deployment ID, or redeploy a previous tag? (6) Should `wrangler.toml` gain an explicit `[env.production]` section or continue using the top-level defaults?
- **Context to provide**: `deploy-staging.yml` (full file), `wrangler.toml` (full file), `scripts/smoke-test.sh` (full file), `ci.yml`, the iac-minion's prior CD recommendation from the roadmap phase
- **Why this agent**: iac-minion owns GitHub Actions workflow design, Cloudflare deployment configuration, and environment protection strategy. This is the core deliverable.

#### Consultation 2: Security Review of Deployment Pipeline
- **Agent**: security-minion
- **Planning question**: Review the production deployment pipeline from a security perspective. Specifically: (1) Should production secrets (`WRL_PROD_*`) be scoped to a GitHub `production` environment to prevent accidental use in other workflows? (2) Should the `CLOUDFLARE_API_TOKEN` for production be a separate token with tighter permissions than the staging token? (3) Are there risks with tag-based triggers (e.g., anyone with push access can create a tag and trigger a deploy)? (4) Should the workflow pin action versions by SHA (as staging already does) and are the current SHAs up to date? (5) Any concerns with `wrangler rollback` from a secrets perspective -- does it preserve the previous secrets or use current ones?
- **Context to provide**: `deploy-staging.yml`, `wrangler.toml`, existing secrets pattern (`CLOUDFLARE_API_TOKEN`, `WRL_STAGING_*`), GitHub repo permissions context (single developer, public repo)
- **Why this agent**: Security-minion ensures the deployment pipeline does not introduce privilege escalation paths, secret leakage, or unauthorized deployment vectors.

#### Consultation 3: Rollback Documentation and Operational Procedures
- **Agent**: user-docs-minion
- **Planning question**: What rollback documentation should be produced? Specifically: (1) Should rollback be documented in the README, a separate OPERATIONS.md, or inline in the workflow file? (2) What operational scenarios should be covered (failed deploy, degraded performance post-deploy, rollback of rollback)? (3) How detailed should the procedure be -- step-by-step commands or higher-level decision tree? (4) Should the documentation include a "deployment runbook" covering the full deploy-verify-rollback lifecycle?
- **Context to provide**: Current README structure, the existing smoke test script, the project's engineering philosophy (KISS, lean and mean), the fact that this is currently a single-developer project
- **Why this agent**: user-docs-minion owns operational documentation and runbook design. The rollback procedure is a documentation deliverable, not just a code artifact.

### Cross-Cutting Checklist

- **Testing** (test-minion): Include for planning. The smoke test is the primary quality gate for production deploys. test-minion should advise on: (1) whether the existing smoke test is sufficient for production or needs additional checks (e.g., version verification to confirm the new code is actually deployed), (2) whether the production smoke test should skip the capture round-trip (resource-intensive against production), and (3) how to structure the "staging must pass before production" gate.
- **Security** (security-minion): Include for planning -- covered in Consultation 2 above.
- **Usability -- Strategy** (ux-strategy-minion): ALWAYS include. Planning question: From a developer experience perspective, what is the ideal deploy-to-production journey? Should it be fully automated (tag -> staging -> approval -> production) or require manual steps? What is the right cognitive load for the single developer who is both the author and the approver?
- **Usability -- Design** (ux-design-minion / accessibility-minion): Exclude from planning. This task produces no user-facing interfaces -- it is entirely CI/CD infrastructure and operational documentation.
- **Documentation** (software-docs-minion and/or user-docs-minion): Include -- user-docs-minion covered in Consultation 3 above. software-docs-minion is not separately needed because there are no architectural changes (no new components, no changed data flows) -- this is operational tooling around existing infrastructure.
- **Observability** (observability-minion / sitespeed-minion): Exclude from planning. The deployment pipeline itself does not produce runtime components. The post-deploy smoke test validates observability (health endpoint). Deployment success/failure is visible in GitHub Actions UI. No custom logging, metrics, or tracing is needed for the workflow itself.

### Anticipated Approval Gates

1. **Production workflow design** (iac-minion output) -- MUST gate. This is the core deliverable with moderate blast radius: the workflow file, trigger strategy, environment protection rules, and secret scoping decisions constrain all subsequent deployment operations. Multiple valid approaches exist (tag-only vs. dispatch, separate tokens vs. shared). Hard to reverse once team muscle memory forms around a deployment process.

2. **Rollback procedure** -- No separate gate. The rollback documentation is low blast radius and easy to revise. It can be reviewed as part of the normal PR process.

### Rationale

This task is infrastructure-focused with a narrow scope: one new workflow file, possible minor `wrangler.toml` changes, operational documentation, and GitHub environment configuration. The existing staging pipeline provides a strong template -- the production pipeline is structurally similar with added gates.

Three planning consultations cover the essential domains:
- **iac-minion** provides the core workflow design (primary domain)
- **security-minion** reviews the trust boundaries of the deployment pipeline
- **test-minion** (via cross-cutting) advises on smoke test adequacy for production

ux-strategy-minion and user-docs-minion ensure the developer experience and documentation quality are addressed. The remaining cross-cutting concerns (ux-design, accessibility, sitespeed, observability) are genuinely not applicable -- this is CI/CD plumbing with no user-facing surfaces or runtime components.

### Scope

**In scope**:
- `deploy-production.yml` GitHub Actions workflow (tag trigger and/or workflow_dispatch)
- GitHub `production` environment protection rules (required reviewers, deployment branch restrictions)
- Production post-deploy smoke test (reusing existing `scripts/smoke-test.sh`)
- Staging-must-pass-first gate (ensuring staging smoke tests succeed before production deploy)
- Rollback procedure documentation
- Production secrets setup documentation (`WRL_PROD_*` GitHub secrets)
- Evolution log entry (0021-cd-pipeline)

**Out of scope**:
- Blue-green deployment, canary releases
- Infrastructure-as-code for environments (Terraform, Pulumi)
- Changes to the Worker application code
- Changes to the existing staging pipeline (beyond referencing it)
- Preview deployments on PRs
- Explicit `[env.production]` in wrangler.toml (unless iac-minion recommends it with strong rationale)

### External Skill Integration

No external skills detected in project.
