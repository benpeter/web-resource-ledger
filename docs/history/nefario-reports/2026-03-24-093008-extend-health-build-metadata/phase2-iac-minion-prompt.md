You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Extend the existing /health endpoint with build identity metadata (commit SHA, version, deploy timestamp, environment) for CI deploy verification. Build metadata injected at deploy time via wrangler --define.

## Your Planning Question
What is the correct way to pass build-time constants (commit SHA, version, deploy timestamp, environment name) via `wrangler --define` in the context of `cloudflare/wrangler-action@v3.14.1`? Specifically:
(a) Should the `command:` input be overridden with a `deploy --define ...` string, or should the `[define]` stanza in `wrangler.toml` reference environment variables set in the workflow?
(b) For the production workflow, `ref` can be a tag or SHA -- how should `$GITHUB_SHA` be resolved correctly in both `workflow_run` and `workflow_dispatch` triggers?
(c) The staging workflow has no `command:` key today; what is the cleanest way to add `--define` flags without breaking the existing `environment: staging` pass-through?

## Context
Current deploy-staging.yml uses cloudflare/wrangler-action@v3.14.1 with `environment: staging` and no `command:` key.
Current deploy-production.yml uses the same action with no environment key (defaults to production).
Production checkout ref: `${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}`
wrangler.toml has no [define] stanza currently. The worker is a plain JS worker (src/index.js).
package.json version: "0.1.0"

## Instructions
1. Read the deploy workflow files and wrangler.toml to understand current setup
2. Research how wrangler --define works and how wrangler-action passes command args
3. Identify risks, dependencies, and requirements from your perspective
4. Return your contribution with recommendations, proposed tasks, and risks
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-iac-minion.md
