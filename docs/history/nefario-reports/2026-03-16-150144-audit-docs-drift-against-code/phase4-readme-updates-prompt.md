You are updating several sections of `README.md` in the web-resource-ledger
project to document features that shipped in recent PRs but were never
added to the README.

## Context

PRs #54-#57 added: IP hash seed for privacy logging, Coralogix
integration, CORS support, HSTS preload, X-RateLimit-Limit header, staging
environment, and smoke tests. The README Setup section only documents
`CAPTURE_API_KEY` and `SIGNING_KEY`. The README has no mention of staging,
CORS configuration, the health endpoint, or the new response headers.

Note: The Key Rotation, Public Key Endpoint, and Key Archive Endpoint
sections have ALREADY been updated in a prior task. Do NOT touch them.

## What to fix

**1. Add missing secrets to Setup section (after step 5, before step 6 "Deploy")**

Add documentation for these secrets/configuration following the existing
step-by-step pattern (match the style of steps 4 and 5):

- `IP_HASH_SEED` -- HMAC seed for privacy-safe IP hashing in logs
  (`src/ip-hash.js`). Recommended for abuse correlation. Generate with
  `openssl rand -hex 32`. Set via `wrangler secret put IP_HASH_SEED`.
  Without it, log entries have no IP correlation.

- `CORALOGIX_SEND_KEY` -- API key for structured log ingestion to Coralogix
  (`src/log.js:24`). Required for production observability. Set via
  `wrangler secret put CORALOGIX_SEND_KEY`. Without it, the worker
  produces no structured logs.

- `CORS_ORIGINS` -- Optional comma-separated list of allowed origins for
  CORS (`wrangler.toml`, `src/index.js:30-38`). Only needed if
  browser-based clients will call the API. Set as an environment variable
  in `wrangler.toml`, not a secret.

Follow the existing step pattern (prose steps, not a table). Mark which
are required vs recommended vs optional.

**2. Add staging environment documentation**

Add a brief "Staging" subsection under Development:
- `wrangler.toml` includes an `[env.staging]` configuration
- Deploy to staging: `wrangler deploy --env staging`
- Staging auto-deploys on merge to `main` via `deploy-staging.yml`
- Staging has its own R2 bucket (`wrl-captures-staging`) and KV namespace
- Secrets must be set separately: `wrangler secret put <NAME> --env staging`
- Smoke tests: `npm run smoke` (requires `SMOKE_URL` and `SMOKE_API_KEY`
  env vars)

Keep it brief -- 8-12 lines max. This is a signpost, not a tutorial.

**3. Add response headers documentation to Reference section**

Add a "Response Headers" subsection in the Reference section (after the
Key Archive Endpoint section, before Legal):
- `Link: <...TERMS.md>; rel="terms-of-service"` -- present on ALL
  responses (`src/index.js:107`)
- `X-RateLimit-Limit` -- present on responses from rate-limited endpoints
  (captures, verify, signing-key). Shows the per-minute limit.
- `Strict-Transport-Security` with `includeSubDomains; preload`
  (`src/index.js:105`). Note for deployers using a custom domain: submit
  to the HSTS preload list.

**4. Add health endpoint to Reference section**

Add a brief entry for `GET /health` (before Response Headers):
- Returns `{ status: "ok", legal: { terms: "...", policy: "..." } }`
- Useful for monitoring and health checks
- The `legal` URLs point to the Terms of Service and Content Moderation
  Policy

**5. Update Roadmap section**

Change "Solid Foundation (in progress)" to "(complete)" -- all Act 1 items
are done per `docs/backlog.md`.

## Writing style

- Match the existing README voice: direct, technical, scannable
- For the secrets, follow the existing step-by-step pattern (not a table)
- Keep staging docs minimal -- point to `wrangler.toml` and
  `deploy-staging.yml` for details
- Each new subsection should be 5-15 lines

## What NOT to do

- Do NOT modify the Key Rotation, Public Key Endpoint, or Key Archive
  Endpoint sections (those were handled in a prior task)
- Do NOT reorganize the README structure or add new top-level sections
- Do NOT add a separate "Deployer Guide" or "API Reference" document
- Do NOT modify openapi.yaml or any code files

## Files to modify

- `README.md`

When you finish your task, mark it completed with TaskUpdate (taskId: "3") and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
