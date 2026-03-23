# Outcome -- 0057 E2E Test Suite (Playwright)

## What was built

A Playwright-based end-to-end test suite with 10 tests across 6 spec files,
targeting the WRL staging environment. Tests run sequentially against shared
staging infrastructure using a dynamically provisioned test tenant.

### Deliverables

| File | Purpose |
|------|---------|
| `test/e2e/playwright.config.js` | Playwright config: sequential, 60s timeout, Chromium only |
| `test/e2e/global-setup.js` | Creates test tenant via admin API, sets quotas, writes state file |
| `test/e2e/global-teardown.js` | Revokes test API key, deletes state file |
| `test/e2e/helpers/api-client.js` | Authenticated fetch wrapper, poll helper, state reader |
| `test/e2e/helpers/hmac.js` | Independent HMAC-SHA256 verification (not imported from src/) |
| `test/e2e/capture-verify.spec.js` | Golden path: capture -> poll -> verify metadata -> WACZ download |
| `test/e2e/batch-capture.spec.js` | Batch capture: 2-URL batch -> 207 -> parallel poll -> both complete |
| `test/e2e/quota-enforcement.spec.js` | Quota: separate low-quota tenant -> first capture OK -> second rejected 429 |
| `test/e2e/verify-page.spec.js` | Public verify: HTML page (Chromium), JSON API, CORS header, 404 handling |
| `test/e2e/key-rotation.spec.js` | Key lifecycle: create/revoke via admin API, scope inheritance |
| `test/e2e/webhook-lifecycle.spec.js` | Webhook CRUD: register -> list -> ping (success + failure) -> delete |
| `test/e2e/README.md` | Full documentation: prerequisites, local/CI execution, troubleshooting |
| `.github/workflows/e2e-tests.yml` | CI workflow: triggered after staging deploy success + manual dispatch |
| `package.json` | Added `@playwright/test` devDep, `test:e2e` script |
| `.gitignore` | Added auth state file, test-results/, playwright-report/ |

### Test inventory

```
[e2e] capture-verify.spec.js:19:1    captures a URL and verifies the result
[e2e] batch-capture.spec.js:26:1     submits a batch of URLs and all complete
[e2e] quota-enforcement.spec.js:25:1 enforces capture quota limits
[e2e] verify-page.spec.js:61:1       serves public verification page without authentication
[e2e] verify-page.spec.js:110:1      returns JSON verification without authentication
[e2e] verify-page.spec.js:143:1      returns 404 for nonexistent capture
[e2e] key-rotation.spec.js:25:1      creates and revokes API keys via admin API
[e2e] key-rotation.spec.js:124:1     new key inherits correct scopes
[e2e] webhook-lifecycle.spec.js:81:1  registers a webhook and validates ping delivery
[e2e] webhook-lifecycle.spec.js:193:1 ping detects delivery failure
```

## Deviations from the issue

The original issue (#105) specified 6 tests. Three were replaced or reframed
based on what actually exists in the codebase:

1. **OAuth signup test dropped** -- `/v1/account/keys` requires session auth
   (cookie from OAuth flow), not API key auth. Adding test-only admin session
   endpoints would be YAGNI. OAuth is already unit-tested via `_githubFetch`
   injection. Replaced with key rotation via admin API.

2. **Scheduled captures dropped** -- No cron trigger in wrangler.toml, no
   scheduling API in routes, no schedule code in src/. Feature is in parking
   lot with `[consider]` status.

3. **Share link reframed as public verification** -- No "share link generation
   API" exists. The public `/v1/verify/{id}` endpoint already serves the user
   job (share proof with a third party).

4. **Webhook retry narrowed** -- Original asked for "retry on 5xx -> successful
   on retry." Async retry via Cloudflare Queue has 60s+300s+900s backoff,
   exceeding the 5-minute test budget. Tested failure detection via ping instead.

5. **Directory: `test/e2e/` not `tests/e2e/`** -- Existing test suite uses
   singular `test/`. Lucy caught the inconsistency during architecture review.

6. **Sequential execution** -- Issue says "can run in parallel." With shared
   staging state and 5 req/60s admin rate limit, parallel risks flakiness.
   Sequential adds ~1 minute for negligible flakiness risk.

## Code review findings

Two BLOCK findings fixed in post-execution:

1. `verify-page.spec.js:43` -- `created.captureId` changed to `created.id`
   (API returns `id`, not `captureId`; wrong field caused undefined, all
   verify tests would fail with misleading 404)

2. `webhook-lifecycle.spec.js:169` -- `test.skip(string)` inside test body
   is undefined behavior in Playwright. Replaced with a comment documenting
   the HMAC gap (ping response doesn't expose signature headers).

## Backlog changes

- No new items added to backlog
- No items removed from backlog
- Existing `[consider] E2E Playwright browser tests for Web UI` and
  `[consider] E2E Playwright browser tests for OAuth flow` remain -- those
  cover UI-specific browser tests, distinct from this API-focused suite
- `[consider] E2E staging test for CMP iframe consent detection` remains --
  capture fidelity testing is distinct from user journey e2e
