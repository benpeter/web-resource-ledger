You are updating `CONTRIBUTING.md` in the web-resource-ledger project to
cover the staging environment and complete the local dev setup instructions.

## Context

CONTRIBUTING.md currently tells contributors to set up `.dev.vars` with
only `SIGNING_KEY` and `CAPTURE_API_KEY`. The project now has additional
secrets (`IP_HASH_SEED`, `CORALOGIX_SEND_KEY`) and a full staging
environment with CI/CD pipeline and smoke tests.

## What to fix

**1. Update the "Full Local Development" section**

The `.dev.vars` list is incomplete. For full local dev with
observability and CORS, it should mention:
- `SIGNING_KEY` (existing)
- `CAPTURE_API_KEY` (existing)
- `IP_HASH_SEED` (new -- for privacy-safe IP hashing in logs)
- `CORALOGIX_SEND_KEY` (new -- for structured log ingestion; optional for
  local dev since logs go to console)
- `CORS_ORIGINS` (new -- optional, only needed when testing browser clients)

Mark which are required vs optional for local dev.

**2. Add staging environment and deploy pipeline subsection**

Add a "Staging & Deployment" subsection (or similar) explaining:
- Merging to `main` triggers: CI test -> staging deploy -> smoke test
  (the `deploy-staging.yml` workflow)
- How to deploy to staging manually: `wrangler deploy --env staging`
- Staging has its own secrets set via `wrangler secret put <NAME> --env staging`
- How to run smoke tests: `npm run smoke` with `SMOKE_URL` and
  `SMOKE_API_KEY` environment variables
- What the smoke test validates (health, security headers, signing key,
  capture round-trip)

Keep it contributor-focused: what do I need to know before I merge?

## Writing style

- Match the existing CONTRIBUTING.md voice: concise, practical, with
  specific gotchas called out
- The "Running Tests" section with its gotcha bullets is the model for
  tone and detail level

## What NOT to do

- Do NOT rewrite existing sections that are correct
- Do NOT add contributor workflow changes (branching strategy, PR process)
- Do NOT modify README.md or any other files
- Do NOT document the OpenAPI spec-first workflow in detail -- the existing
  `npm run lint:api` mention is sufficient

## Files to modify

- `CONTRIBUTING.md`

When you finish your task, mark it completed with TaskUpdate (taskId: "4") and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
