# Decisions: R14 Production CD Pipeline

## Trigger strategy: push-to-main + workflow_dispatch (no tags)

**Chosen**: `push: branches: [main]` + `workflow_dispatch` with optional `ref` input.

**Rejected**: Tag-based triggers (`push: tags: ['v*']`).

**Rationale**: iac-minion argued for tags (versioning, auditability). ux-strategy-minion argued tags add cognitive load with no proportional benefit for a single developer — Cloudflare Workers have built-in version history. security-minion flagged tag-mutation and non-main-commit risks. Synthesis sided with ux-strategy-minion: tags solve a versioning problem WRL doesn't have.

**Note**: Issue #44 mentions "triggered by tag or manual dispatch." We deviated intentionally — push-to-main is simpler and enables automatic flow to the approval gate. workflow_dispatch covers the manual dispatch requirement. Tags are deferred to backlog with trigger "when external consumers need stable version references."

## Staging gate: self-contained in production workflow (not workflow_run)

**Chosen**: Job 1 (`staging-smoke`) in `deploy-production.yml` runs smoke tests against staging.

**Rejected**: `workflow_run` trigger from staging workflow.

**Rationale**: iac-minion favored self-contained (single Actions run, easier to observe). test-minion favored `workflow_run` (strict staging-passed-first ordering). Synthesis sided with iac-minion: single workflow run shows the full pipeline in one place. The `workflow_run` approach creates disconnected runs in the Actions UI and uses the workflow file from default branch HEAD (not the triggering commit), which is harder to reason about. Tradeoff: staging-smoke validates staging *health*, not code parity with the current deploy. Acceptable for a solo project with linear history.

## Smoke test changes: deferred (YAGNI)

**Chosen**: Reuse existing `smoke-test.sh` as-is with `SMOKE_SKIP_CAPTURE=1` for production.

**Rejected**: Version check (`SMOKE_EXPECT_VERSION`) and response time assertion.

**Rationale**: test-minion wanted both. Version check requires 3 coordinated changes (health endpoint, smoke script, deploy steps) for an unobserved failure mode. Response time assertion is meaningless from GitHub Actions runners (100-500ms network noise, not edge latency). Both deferred to backlog with concrete activation triggers.

## Operations doc: OPERATIONS.md (not README or full runbook)

**Chosen**: Separate `OPERATIONS.md` at repo root, ~120 lines, linked from README.

**Rejected**: Inline in README (too long), full incident runbook (YAGNI for single developer).

**Rationale**: user-docs-minion recommended a lean operational document written for "tired Ben at 2am" — decision tree for diagnosis, copy-pasteable commands, no explanations of what Wrangler is. ux-strategy-minion agreed. Three scenarios: failed deploy, degraded-after-deploy, normal re-forward.

## wrangler.toml: no `[env.production]` section

**Chosen**: Keep top-level config as production. Deploy without `--env` flag.

**Rejected**: Adding explicit `[env.production]` block.

**Rationale**: iac-minion correctly identified that adding `[env.production]` would change the Worker name (Wrangler appends env names: `wrl-production`), breaking the existing production Worker URL. The top-level config is already production.

## Secret scoping: environment-level, separate tokens

**Chosen**: Production secrets in GitHub `production` environment, staging in `staging`. Separate `CLOUDFLARE_API_TOKEN` per environment (same secret name, different values).

**Rationale**: security-minion requirement. A shared token means staging compromise escalates to production.
