# Process -- 0057 E2E Test Suite (Playwright)

## TL;DR

Five specialists planned, five reviewers reviewed, and nine execution tasks
produced 10 Playwright e2e tests across 6 spec files (1,789 lines added,
16 files). The biggest debate was webhook testing strategy (dedicated Worker
vs httpbin.org vs ping-only). The biggest runtime discovery was that
`/v1/account/keys` requires session auth, forcing key rotation tests to use
the admin API instead. Two code review BLOCKs caught real bugs (wrong field
name, misused Playwright API) before merge. Zero human intervention -- fully
autonomous run.

## Team Composition

### Planning Specialists (Phase 2)

| Agent | Planning Question | Key Contribution |
|-------|------------------|------------------|
| test-minion | Test architecture, fixture strategy, CI integration | Proposed 9-task breakdown with global setup/teardown pattern, sequential execution rationale |
| api-design-minion | API contract coverage, endpoint behavior validation | Identified webhook HMAC verification gap, recommended testing error responses not just happy paths |
| security-minion | Auth model testing, secret handling, tenant isolation | Flagged admin key should NOT go in state file (D7), proposed separate low-quota tenant for quota test |
| iac-minion | CI workflow design, artifact strategy, browser caching | Designed `workflow_run` trigger chained after staging deploy, SHA-pinned actions |
| devx-minion | Developer experience: local execution, README, troubleshooting | Recommended comprehensive README with env var table, common failure modes, spec divergence docs |

### Architecture Reviewers (Phase 3.5)

All 5 mandatory reviewers participated: security-minion, test-minion,
ux-strategy-minion, lucy, margo. No discretionary reviewers added (no UI
components, no web-facing runtime code produced).

## Key Conflicts and Resolutions

### Webhook Receiver Strategy (D1)

The central design debate. Three positions emerged:

- **api-design-minion** proposed a dedicated Cloudflare Worker webhook
  receiver that captures and stores signed payloads for later verification.
  Argument: enables full HMAC-SHA256 chain validation end-to-end.

- **test-minion** proposed using webhook.site as the test receiver.
  Argument: zero infrastructure, provides an API to retrieve delivered
  payloads including headers.

- **margo** argued both were over-engineering. The ping endpoint already
  validates webhook registration, HMAC signing mechanics, and delivery --
  synchronously. Adding infrastructure for marginal coverage contradicts
  "lean and mean."

**Resolution**: Margo's position won. The ping endpoint covers the critical
signing path without deploying a separate Worker or depending on a
third-party SaaS. The HMAC gap (ping doesn't echo the signature header) is
documented explicitly in the test rather than silently omitted. Queue-based
retry logic is already covered by unit tests.

### OAuth Testing Approach (D2)

- **security-minion** proposed `POST /v1/admin/sessions` to create test
  sessions without real OAuth, enabling the signup flow test.

- **margo** flagged this as putting test-only production code in `src/` --
  a YAGNI violation. OAuth is already unit-tested via `_githubFetch`
  injection.

**Resolution**: Skip OAuth entirely. Use API keys for all tests. The e2e
suite focuses on what unit tests cannot cover: real HTTP round-trips, queue
processing, R2 storage, and cryptographic verification. OAuth browser
automation is fragile and breaks on GitHub UI changes.

### Test Scope Adjustments (D3)

- **lucy** caught that the issue references features that don't exist
  (scheduled captures, share link generation API) and flagged `tests/e2e/`
  vs `test/e2e/` inconsistency.

- **test-minion** proposed replacing scheduled captures with key rotation
  testing -- a critical security workflow not covered elsewhere.

**Resolution**: Three replacements (scheduled -> key rotation, share link ->
public verification, OAuth signup -> admin API key lifecycle), two narrowings
(webhook retry -> ping failure detection, parallel -> sequential). All
documented in decisions.md D3.

## Runtime Discoveries

### Session Auth Blocker (Task 4)

The key rotation agent discovered during execution that `/v1/account/keys`
requires session authentication (an HTTP-only cookie set by the OAuth flow),
not API key auth. Reading the source code revealed the `requireSession`
middleware on account routes.

The agent adapted by reframing the test to use admin API endpoints
(`POST /v1/admin/keys`, `DELETE /v1/admin/keys/{hash}`) which accept
Bearer token auth. The last-key guard (preventing deletion of a tenant's
only key) is an account-level feature that can't be tested without session
auth -- this was noted as a limitation.

### Async Usage Increment (Task 6)

The quota enforcement agent discovered that `incrementUsage()` runs in
`waitUntil()` (deferred after response). A naive "submit capture, then
immediately submit second capture" test would race -- the first capture's
usage increment might not be committed before the second capture's quota
check.

Solution: the test waits for the first capture to complete (via
`pollUntilComplete`) before submitting the second, ensuring the usage
counter has been incremented.

### Webhook DELETE Returns 200 (Task 7)

The webhook agent read source code and found `handleDeleteWebhook` returns
`200 { deleted: true }`, not `204 No Content`. The test was written to
match actual behavior, not assumed REST convention.

## Code Review Findings

Phase 5 produced 2 BLOCK and 2 ADVISE findings:

### BLOCKs (fixed)

1. **verify-page.spec.js:43** -- `created.captureId` should be `created.id`.
   The capture creation API returns `{ id: "cap_..." }`, not `{ captureId }`.
   Using the wrong field would set `captureId = undefined`, causing all three
   verify tests to hit 404 with misleading error messages. Found by
   code-review-minion.

2. **webhook-lifecycle.spec.js:169** -- `test.skip('message')` called inside
   a running test body is undefined behavior in Playwright. `test.skip()`
   with a string argument is a top-level declaration API, not a mid-test
   control flow statement. Replaced with a comment block. Found by
   code-review-minion.

### ADVISEs (noted)

1. Default base URL hostname uses `wrl-staging.benpeter.workers.dev` instead
   of `api.webresourceledger.com`. Accepted: the staging environment still
   uses the workers.dev subdomain; the custom domain is production-only.

2. Assertion order in key-rotation.spec.js could use `toBeOneOf` for cleaner
   scope checking. Cosmetic -- not changed.

## Human Interventions

None. This was a fully autonomous run. All gate decisions were made by Lucy
agents per the autonomous mode protocol.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/` companion directory
- Synthesis plan: companion directory `phase3-synthesis.md`
- Architecture review verdicts: companion directory `phase3.5-*.md`
- Decisions with rationale: `docs/evolution/0057-e2e-test-suite-playwright/decisions.md`
