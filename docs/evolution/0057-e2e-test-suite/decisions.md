# Phase 0057: Decisions

## Test runner: Playwright (not Vitest)

E2E tests use Playwright's own test runner, not Vitest. Playwright requires
`node:child_process` to spawn browsers, which is unavailable in Vitest's
workerd pool. The E2E specs are excluded from `vitest.config.js` and run
in a separate CI workflow.

## Isolated test tenants

Each test run creates fresh tenants via the admin API during global-setup.
This avoids collisions between parallel runs and keeps the staging environment
clean. Tenants are cleaned up in global-teardown.

## CI trigger: post-staging-deploy

The E2E workflow triggers as a `workflow_run` after the staging deploy
workflow completes. This ensures tests always run against the latest code
without manual dispatch.

## Response format alignment (supervisor fix)

The initial PR (PR #146) had test assertions written against assumed API
response formats. Three mismatches were discovered during CI:

1. **Batch capture**: API expects `{ urls: [{ url: "..." }] }` not plain
   string arrays
2. **Quota enforcement**: API returns RFC 7807 Problem Details (`status`,
   `title`, `limitType`) not `body.error.code`
3. **Capture detail**: API returns `verifyUrl` (call separately) and
   `wacz.url` (not `wacz.key`); URL normalization adds trailing slash

All three were fixed by the supervisor session after the phase runner exited.

## WACZ content type

The API returns `application/wacz+zip` for WACZ downloads. The test was
updated to accept this in addition to `application/wacz` and
`application/octet-stream`.
