# E2E Test Suite

End-to-end tests for the Web Resource Ledger API. These tests make real HTTP
requests against the staging Worker and exercise the full system: Cloudflare
Workers, D1 database, R2 storage, and the Browser Rendering service.

## How this differs from unit tests

The unit tests (in `test/`) use Miniflare bindings to run logic in-process
with mocked external services. The e2e tests hit the real staging Worker over
HTTP. A capture test actually invokes Cloudflare Browser Rendering, waits for
a WACZ file to land in R2, and downloads it. If the real integration is broken,
only the e2e suite will catch it.

## Prerequisites

### Node.js

Node.js 22 is recommended (see `.nvmrc`). The suite requires Node >= 20.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `E2E_BASE_URL` | No | Staging Worker URL. Defaults to `https://wrl-staging.benpeter.workers.dev` |
| `E2E_ADMIN_KEY` | Yes | Admin API key for staging. Used by global-setup to create test tenant. |

Get the admin key from 1Password:

```bash
eval $(op signin)
op item get "Staging" --vault WRL --reveal --fields ADMIN_KEY
```

### Playwright browsers

On first run, install the Chromium browser that Playwright requires:

```bash
npx playwright install chromium
```

## Running locally

Local runs target the same staging environment as CI -- there is no separate
local-only environment.

```bash
export E2E_BASE_URL=https://wrl-staging.benpeter.workers.dev
export E2E_ADMIN_KEY=<admin-key-from-1password>
npm run test:e2e
```

To view the HTML report after a run:

```bash
npx playwright show-report
```

## CI configuration

The e2e workflow triggers after a successful staging deploy and can also be
dispatched manually.

Required GitHub secret (staging environment): `WRL_STAGING_ADMIN_KEY`

Artifacts retained per run:
- HTML report: 14 days
- Traces (on failure only): 7 days

The suite runs with `retries: 1` in CI. A flake that passes on retry is
reported as flaky, not failed.

## Test structure

Tests run sequentially (`workers: 1`) because all specs share the same staging
environment and admin rate limit (5 req/60s).

### Global setup and teardown

`global-setup.js` runs once before any test. It checks `/health`, creates an
isolated test tenant via the admin API, and writes credentials to
`.auth-state.json`. The admin key is intentionally excluded from that file;
specs that need it must read `E2E_ADMIN_KEY` from the environment directly.

`global-teardown.js` runs once after all tests. It revokes the test tenant's
API key and deletes `.auth-state.json`. Cleanup failure is non-fatal -- a
warning is logged and the orphaned key expires naturally.

### Test files

**`capture-verify.spec.js`** (P0 -- golden path)

The core end-to-end journey: submit a capture, poll until complete, fetch the
detail record, and download the WACZ archive. Validates that Browser Rendering,
D1 persistence, and R2 storage all work together. Allows up to 60s for a single
browser render.

**`batch-capture.spec.js`** (P2)

Submits two URLs as a batch via `POST /v1/captures/batch`, expects a `207`
multi-status response, polls both captures to completion in parallel, then
verifies each via `GET /v1/verify/{id}`. Timeout is 180s to accommodate two
serial browser renders plus queue wait.

**`verify-page.spec.js`** (public evidence verification)

Validates `GET /v1/verify/{captureId}` from the perspective of an unauthenticated
third-party consumer. Three tests share one capture created in `beforeAll`:

- Browser rendering test (requires Chromium): navigates to the verify page,
  waits for the result to load, and asserts no JavaScript errors.
- JSON API test: verifies the response schema including the `verified` field,
  `checks` array, `signing.publicKey`, and the `Access-Control-Allow-Origin: *`
  CORS header.
- 404 test: confirms a syntactically valid but non-existent capture ID returns
  404 (not a generic router 404).

**`webhook-lifecycle.spec.js`** (P3)

Covers the full CRUD lifecycle for webhooks plus synchronous ping delivery.
Uses `httpbin.org/post` (returns 200) for the success case and
`httpbin.org/status/503` for the failure detection case. Asserts that the
webhook secret is returned on creation but never exposed in list responses.
HMAC signature verification is explicitly skipped with a comment explaining
why it cannot be tested through the ping API response alone.

**`key-rotation.spec.js`** (P2)

Exercises API key lifecycle via the admin API. Two serial tests:

1. Creates a second key for the test tenant, verifies it works, revokes it,
   then confirms both that the revoked key returns 401 and the original key
   still returns 200.
2. Creates a key with explicit `capture` and `read` scopes and asserts that
   both scopes work as expected before cleaning up.

Note: account-level key management (`/v1/account/keys`) requires session auth
(GitHub OAuth cookie) which is not available in the e2e suite. These tests use
the admin API as the available substitute.

## Adding new tests

**Use unique URLs per test.** Append a `?e2e={testId}` query parameter where
`testId` is derived from `Date.now()` and a random suffix. This keeps captures
identifiable in staging logs and prevents collisions between parallel CI runs
if workers are ever increased.

```js
const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const captureUrl = `https://example.com?e2e=${testId}`;
```

**Read auth state via the helper.**

```js
import { readAuthState, createAuthenticatedFetch } from './helpers/api-client.js';

const { apiKey, baseUrl } = readAuthState();
const apiFetch = createAuthenticatedFetch(baseUrl, apiKey);
```

**Keep the per-test timeout at 60s** unless the test involves capture
completion, in which case increase it explicitly with `test.setTimeout()`.

**Stay within the admin rate limit.** The admin API enforces 5 req/60s.
Plan admin calls per test upfront (as the existing spec file headers do) and
keep the total across all tests well below the limit for a single sequential
run. Prefer the shared test tenant from `readAuthState()` over creating new
tenants when possible.

**Isolate tests that need their own tenant.** If a test needs to exhaust a
quota or otherwise mutate tenant state, create a dedicated tenant in the test
itself and clean up in a `finally` block -- see `quota-enforcement.spec.js`
for the pattern.

## Troubleshooting

### Viewing reports and traces

After a run (local or downloaded from CI):

```bash
# Open the HTML report
npx playwright show-report

# Inspect a trace file
npx playwright show-trace path/to/trace.zip
```

Traces include network requests and browser screenshots at each step, which
makes failures in `verify-page.spec.js` much easier to diagnose.

### Common failures

**Staging is down or degraded**

Global setup checks `/health` first and aborts with a clear error if the
response is not `{ "status": "ok" }`. If tests never start, confirm staging
is reachable:

```bash
curl https://wrl-staging.benpeter.workers.dev/health
```

**Admin rate limited (429)**

If several test runs happened in quick succession, the admin API (5 req/60s)
may be temporarily exhausted. Wait 60s and re-run. The global setup makes 2
admin calls; key-rotation makes 4; quota-enforcement makes 3. Total: 9 admin
calls per full suite run, so back-to-back runs within the same 60s window can
hit the limit.

**Capture timeout**

If `pollUntilComplete` times out, it usually means Browser Rendering is slow
or the staging queue is backed up. Increase the poll timeout in the failing
test, or check staging Worker logs for the capture ID that timed out.

**`E2E_ADMIN_KEY` not set**

`key-rotation.spec.js` and `quota-enforcement.spec.js` read `E2E_ADMIN_KEY`
directly and throw immediately if it is missing. Global setup also requires it.
Confirm the variable is exported in your shell.

### Orphaned test tenants

Test tenants created by global-setup are prefixed `e2e-` (e.g.,
`e2e-1748291234567`). The quota-enforcement test creates tenants prefixed
`e2e-quota-`. If a run was interrupted and teardown did not complete, these
tenants can be cleaned up by revoking their keys via the admin API:

```bash
# Delete a key by its hash (get the hash from the key creation response or D1)
curl -X DELETE https://wrl-staging.benpeter.workers.dev/v1/admin/keys/{keyHash} \
  -H "Authorization: Bearer $E2E_ADMIN_KEY"
```

## Changes from original spec (issue #105)

The following items from the original e2e specification were excluded or
reframed during implementation:

- **Scheduled captures**: excluded -- the feature is not implemented.
- **OAuth signup**: excluded -- OAuth is unit-tested separately; the e2e suite
  uses API key auth throughout because session cookies are not available in
  Playwright's non-browser fetch context.
- **Share link**: reframed as public evidence verification using the existing
  `GET /v1/verify/{id}` endpoint rather than a separate share-link feature
  that was never built.
- **Webhook retry**: narrowed to ping-based failure detection. The full async
  retry loop (wait for capture, observe retry backoff, verify headers) exceeds
  the time budget for a synchronous test suite and depends on capture events
  that cannot be reliably triggered within a bounded timeout.
- **Key rotation via account API**: the `/v1/account/keys` endpoints require
  session auth (GitHub OAuth cookie); tests use the admin API as a substitute.
  Account-level key management (including the last-key guard) is tracked as a
  backlog item for when session auth support is added to the e2e suite.
