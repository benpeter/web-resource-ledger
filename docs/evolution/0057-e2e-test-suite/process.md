# Phase 0057: Process

## TL;DR

Nefario orchestrated 6 Playwright E2E specs in a single session (38 turns,
~$40). The phase runner created PR #146, but CI failed because the E2E
specs were picked up by the vitest/workerd runner (which lacks
`node:child_process`). The supervisor session fixed this and three
additional assertion mismatches in 4 follow-up commits directly to main.
All 10 E2E tests now pass in CI.

## How it went

### Phase runner session

The nefario session produced a solid test infrastructure and 6 well-structured
test specs. It created a global-setup/teardown pattern for isolated test
tenants and a helper module for authenticated API calls with polling.

The session also added a dedicated E2E CI workflow that triggers after
staging deploys — a clean separation from the unit test pipeline.

### Supervisor intervention

The phase runner exited with `failed_ci` because all 6 E2E specs failed
with `No such module "node:child_process"`. Playwright needs Node.js
child processes to spawn browsers, but vitest runs tests inside Cloudflare's
workerd runtime.

**Fix 1**: Added `test/e2e/**` to the vitest exclude list. This was a
one-line change that the phase session should have caught — the vitest
config already excluded `test/integration/**` for the same reason.

After the unit tests passed, the E2E workflow ran but all 6 E2E specs
failed because `E2E_ADMIN_KEY` was not set as a GitHub Actions secret.

**Fix 2**: Retrieved the staging admin key from 1Password and set it as
`WRL_STAGING_ADMIN_KEY` in the staging GitHub environment.

With the secret set, 7/10 tests passed. Three specs had assertion
mismatches:

**Fix 3** (batch-capture): The test sent `{ urls: ["..."] }` but the API
expects `{ urls: [{ url: "..." }] }`. The spec was written against an
assumed format without checking the actual API code.

**Fix 4** (quota-enforcement): The test expected `body.error.code` but
the API returns RFC 7807 Problem Details format with `body.status`,
`body.title`, `body.limitType`.

**Fix 5** (capture-verify): Three sub-issues:
- URL normalization: `https://example.com?e2e=...` becomes
  `https://example.com/?e2e=...` in the API response
- The capture detail endpoint returns `verifyUrl` (call separately)
  not an inline `verification` object
- The WACZ object has `url` not `key`
- Content type is `application/wacz+zip` not `application/wacz`

### Key observation

All five supervisor fixes were about **test assertions not matching the
actual API**. The nefario session wrote tests against an assumed API
contract rather than checking the actual implementation. This is a
recurring pattern in autonomous sessions — the agent builds a mental model
of the API from docs/issues rather than reading the source code. Future
E2E phases should explicitly instruct the agent to verify response shapes
against the actual handlers before writing assertions.

## Where to read more

- Nefario report: `docs/history/nefario-reports/2026-03-23-064115-e2e-test-suite-playwright.md`
- PR #146: initial E2E test suite
- Supervisor commits on main: vitest exclude, assertion fixes
