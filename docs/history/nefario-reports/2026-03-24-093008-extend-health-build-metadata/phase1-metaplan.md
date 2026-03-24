# Meta-Plan: Extend /health with Build Identity Metadata

## Task Summary

Extend the existing `GET /health` endpoint to include build identity metadata
(commit SHA, version, environment, deploy timestamp) so CI pipelines can
confirm a specific commit is live and operators can see what's running. This
requires changes to the health handler, wrangler deploy configuration
(--define), both CI workflows, and the smoke-test script.

## Codebase Context

| File | Role |
|------|------|
| `src/index.js:578-586` | `handleHealth()` -- returns `{status, legal}`, no params, no I/O |
| `wrangler.toml` | No existing `[define]` stanza; `[vars]` used for runtime config |
| `.github/workflows/deploy-staging.yml` | Uses `cloudflare/wrangler-action@v3.14.1`, no `command:` override |
| `.github/workflows/deploy-production.yml` | Same action, supports `ref` input for rollbacks |
| `scripts/smoke-test.sh` | Checks `/health` for `status: "ok"`, no commit verification |
| `test/health.test.js` | Vitest unit tests for health endpoint (status, legal, trailing slash, POST 404) |
| `openapi.yaml:1615-1645` | OpenAPI spec for `/health` -- schema has `status` and `legal` only |
| `package.json` | `"version": "0.1.0"` |

## Planning Consultations

### Consultation 1: Build Metadata Injection via wrangler --define

- **Agent**: iac-minion
- **Planning question**: What is the correct way to pass build-time constants
  (commit SHA, version, deploy timestamp, environment name) via wrangler --define
  in the context of `cloudflare/wrangler-action@v3.14.1`? Specifically:
  (a) Should the `command:` input be overridden with a `deploy --define ...` string,
  or should the `[define]` stanza in `wrangler.toml` reference environment variables
  that are set in the workflow? (b) For the production workflow, `ref` can be a tag
  or SHA -- how should `$GITHUB_SHA` be resolved correctly in both `workflow_run`
  and `workflow_dispatch` triggers? (c) The staging workflow has no `command:` key
  today; what is the cleanest way to add `--define` flags without breaking the
  existing `environment: staging` pass-through?
- **Context to provide**: deploy-staging.yml, deploy-production.yml, wrangler.toml,
  wrangler-action docs
- **Why this agent**: CI/CD pipeline configuration, wrangler CLI flags, and GitHub
  Actions workflow design are squarely in iac-minion's domain. Getting the --define
  injection wrong would silently burn incorrect metadata into the bundle.

### Consultation 2: Smoke Test Commit Verification

- **Agent**: test-minion
- **Planning question**: The smoke test needs a new check that asserts the deployed
  commit matches `$GITHUB_SHA` (with a retry loop for global rollout lag). What
  retry strategy is appropriate for Cloudflare Workers global propagation? Should
  the retry loop be a separate check in `smoke-test.sh` or integrated into the
  existing health check (Check 1)? What's the right timeout/backoff given that
  Workers deploys typically propagate in seconds but can lag up to ~30s? Should
  the commit check be skippable (like `SMOKE_SKIP_CAPTURE`) for local/manual runs
  where `GITHUB_SHA` isn't set?
- **Context to provide**: scripts/smoke-test.sh, deploy-staging.yml (smoke job),
  deploy-production.yml (smoke job)
- **Why this agent**: Test strategy for CI smoke tests, retry logic design, and
  failure mode analysis. The retry loop needs to be robust without being slow.

### Consultation 3: Health Response Shape and API Contract

- **Agent**: api-design-minion
- **Planning question**: The health response will grow from `{status, legal}` to
  include `{commit, version, env, deployedAt}`. Should the new fields be at the
  top level alongside `status` and `legal`, or nested under a `build` object?
  What are the backward-compatibility implications? The issue says "no breaking
  changes" -- does adding new top-level fields count as breaking for a health
  endpoint? Should `Cache-Control: no-store` be added at the jsonResponse level
  or as a header override in handleHealth()? The OpenAPI spec needs updating too.
- **Context to provide**: Current handleHealth() at src/index.js:578-586,
  openapi.yaml /health section, jsonResponse helper in responses.js
- **Why this agent**: API contract design, backward compatibility assessment,
  response shape conventions. The health endpoint is a public API surface.

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning (see Consultation 2). The health
  endpoint has existing unit tests that must be updated, and the smoke test needs
  new commit verification logic. Both need planning input.
- **Security**: Exclude security-minion from planning. The issue explicitly
  constrains what's exposed (no dependency versions, no internal IDs, no infra
  details). Commit SHA and version are already public in the GitHub repo. No new
  auth surface, no user input, no secrets. The architecture review (Phase 3.5)
  will catch any security concerns.
- **Usability -- Strategy**: ALWAYS include -- but this is a machine-consumed
  endpoint (CI pipelines, operators). Planning question for ux-strategy-minion:
  Is the /health response shape intuitive for the two primary consumers (CI
  scripts parsing JSON with jq, and humans eyeballing curl output)? Any
  cognitive load concerns with flat vs. nested structure?
- **Usability -- Design**: Exclude. No user-facing interface changes. The health
  endpoint returns JSON consumed by scripts and operators.
- **Documentation**: Include software-docs-minion. The OpenAPI spec must be
  updated, and this changes the operational surface. Planning question: Beyond
  the OpenAPI spec update, does OPERATIONS.md or any other doc need updating to
  describe the new build identity fields and how to use them for deploy
  verification?
- **Observability**: Exclude. The health endpoint remains synchronous with zero
  I/O. No new runtime components, no logging changes, no metrics. The build
  metadata is burned into the bundle at deploy time.

## Notable Exclusions

- **security-minion**: Commit SHA and version are public info (visible in GitHub
  repo); no new auth, no secrets, no user input. Phase 3.5 review suffices.
- **observability-minion**: Zero-I/O endpoint with no runtime changes; build
  metadata is compile-time constants, not runtime telemetry.
- **frontend-minion**: No UI changes; health endpoint is JSON-only.

## Anticipated Approval Gates

1. **Health response shape** (api-design-minion output) -- This is a public API
   contract change with downstream dependents (smoke test, CI pipeline, OpenAPI
   spec all build on it). Low blast radius individually, but the response shape
   is the foundation for everything else. **Likely OPTIONAL gate** -- adding
   fields to a health endpoint is a well-understood pattern, but the flat vs.
   nested decision affects the smoke test and OpenAPI spec.

No other gates anticipated. The `--define` injection is a standard wrangler
pattern, and the smoke test retry logic is self-contained. Both are easy to
reverse (revert a workflow file).

## Rationale

This is a focused infrastructure task spanning four files across three domains:
API design (response shape + OpenAPI), CI/CD (wrangler --define in two
workflows), and testing (smoke test commit verification). The task is well-scoped
with clear success criteria, so only specialists with direct domain expertise
are consulted. The three planning consultations map directly to the three
non-trivial technical decisions: how to inject build metadata at deploy time,
how to verify it in CI, and what the response should look like.

ux-strategy-minion is included per mandatory checklist rules but the planning
question is lightweight -- this is a machine-consumed endpoint.

## Scope

**In scope**: handleHealth() response shape, wrangler.toml [define] or --define
flags, deploy-staging.yml and deploy-production.yml workflow changes, smoke-test.sh
commit verification with retry, health.test.js unit test updates, openapi.yaml
/health schema update.

**Out of scope**: Deep health checks (D1/KV/R2 reachability), separate readiness
endpoint, global version headers on all API responses, HTML/text format variants,
new routes.

## External Skill Integration

No external skills detected in project. The `.claude/skills/` and `.skills/`
directories do not exist in the working directory.
