You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
Extend the existing /health endpoint with build identity metadata (commit SHA, version, deploy timestamp, environment) for CI deploy verification.

## Your Planning Question
The smoke test needs a new check that asserts the deployed commit matches `$GITHUB_SHA` with a retry loop for global rollout lag. What retry strategy is appropriate for Cloudflare Workers propagation? Should the retry be a separate check in `smoke-test.sh` or integrated into existing Check 1? What timeout/backoff given Workers typically propagate in seconds but can lag ~30s? Should the commit check be skippable (like `SMOKE_SKIP_CAPTURE`) for local/manual runs where `GITHUB_SHA` isn't set?

Also: the existing unit tests (test/health.test.js using vitest + cloudflare:test) assert the current response shape {status, legal}. How should these be updated for the new build metadata fields, given that --define values won't be available in the test environment?

## Context
Current smoke-test.sh has 4 checks: health, security headers, signing key, capture round-trip.
Current health.test.js uses cloudflare:test SELF.fetch and asserts {status: 'ok', legal: {...}}.
The vitest config uses @cloudflare/vitest-pool-workers.

## Instructions
1. Read scripts/smoke-test.sh and test/health.test.js
2. Design the retry strategy for commit verification
3. Plan how unit tests should handle --define globals
4. Identify risks and propose specific tasks
5. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-8ffwn7/extend-health-build-metadata/phase2-test-minion.md
