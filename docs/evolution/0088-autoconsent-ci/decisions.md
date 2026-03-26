# Decisions: Automated Autoconsent Update Pipeline

## Node ESM vs Shell for Vendoring Script

**Chosen**: Node ESM script (`scripts/vendor-autoconsent.js`)
**Over**: Shell script
**Why**: `JSON.stringify()` handles all string escaping edge cases for the 170KB autoconsent bundle in one call. Shell escaping at this scale is fragile. The project already has Node scripts in `scripts/`.

## 3-Job vs Single-Job Workflow Structure

**Chosen**: 3 separate jobs (update-and-test, battery, open-pr)
**Over**: Single job with sequential steps; 4-job structure
**Why**: Battery needs different failure semantics (`continue-on-error`) and the `staging` environment for secrets. Single job would force unit tests into the staging environment unnecessarily. 4 jobs (separating version check from unit tests) adds unnecessary granularity since they share checkout/install.

## Secret Access: Staging Environment vs Repo-Level Secret

**Chosen**: Existing `staging` GitHub environment (`WRL_STAGING_CAPTURE_API_KEY`)
**Over**: New repo-level secret `WRL_STAGING_KEY`
**Why**: The secret already exists in the `staging` environment and is used by `deploy-staging.yml`. Adding a duplicate creates drift risk.

## Battery Failures: Advisory vs Blocking

**Chosen**: Battery failures are advisory (PR still opens, results in PR body)
**Over**: Battery failures block PR creation (literal reading of "No PR if tests fail")
**Why**: 21 external sites introduce unavoidable flakiness from CMP changes, rate limiting, and site outages. Strict blocking would cause the workflow to fail most weeks. Unit test failures still block PR creation, guarding against code-level regressions.

## PR Management: gh CLI vs Third-Party Action

**Chosen**: `gh pr create` / `gh pr close` / `gh pr list`
**Over**: `peter-evans/create-pull-request` action
**Why**: `gh` ships on all GitHub-hosted runners, zero supply-chain surface, simpler commit control, consistent with the repo's lean philosophy.

## Per-Job Permission Scoping

**Chosen**: `contents: read` at workflow level, `contents: write` + `pull-requests: write` only on `open-pr` job
**Over**: Workflow-level write permissions
**Why**: Security advisory — limits blast radius if npm package is compromised during `update-and-test` job.
