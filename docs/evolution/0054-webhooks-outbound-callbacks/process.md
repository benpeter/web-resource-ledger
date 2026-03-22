# Process: R27 Webhooks / Outbound Callbacks

## TL;DR

Seven specialists planned the webhook feature across API design, data, infra,
security, testing, observability, and documentation. The synthesis resolved one
meaningful conflict (secret encryption: plaintext won over AES-GCM) and
consolidated a 3-task execution plan. Architecture review by 5 mandatory
reviewers produced 0 BLOCKs and several ADVISE items (redundant index, port
restriction YAGNI). Execution produced 3 tasks in sequence with one mid-gate
fix (silent catch blocks). Post-execution code review found 3 fixable issues
(duplicate error classifier, JSON.parse in hot path, string replace vs slice).
68 new tests, 823 total pass. ~3000 lines across 19 files.

## Phase 1: Meta-Plan

Nefario identified 7 specialists for planning:
- **api-design-minion** — endpoint design, request/response shapes, error semantics
- **data-minion** — D1 schema, data access layer, query patterns
- **iac-minion** — Cloudflare Queue architecture, wrangler config, retry mechanism
- **security-minion** — HMAC signing scheme, SSRF protection, secret handling
- **test-minion** — test file structure, coverage strategy, mock patterns
- **observability-minion** — Coralogix event taxonomy, severity mapping, alerting
- **software-docs-minion** — OpenAPI additions, integration guide, version bump

Lucy approved the team via autonomous gate. No adjustments needed.

## Phase 2: Specialist Planning

All 7 specialists ran in parallel. Key contributions:

**api-design-minion** proposed POST/GET/DELETE plus a /ping endpoint, `whk_`
ID format, `whsec_` secrets with show-once semantics, and recommended AES-GCM
encryption for secrets at rest.

**security-minion** pushed back on encryption: D1's access model (only the bound
Worker can query it) makes encryption "theater" — the encryption key would need
to be stored in the same Worker environment, providing no real protection. They
recommended the Stripe-model timestamp-prefixed signing scheme for replay attack
prevention.

**data-minion** designed a single `webhooks` table and proposed two indexes.
**margo** and **lucy** later flagged the second index as redundant in Phase 3.5.

**iac-minion** specified the dedicated `wrl-webhooks` queue with fan-out pattern
(one message per webhook-capture pair) and `msg.retry({ delaySeconds })` for the
exponential backoff schedule.

**test-minion** proposed 3 test files (CRUD, signing, dispatch) with fetchMock
for delivery simulation. The actual implementation used a simpler approach: spy
objects for queue mocking, no fetchMock needed.

**observability-minion** defined 8 Coralogix events for the webhook subsystem
with severity 3/4/5 mapping and recommended a delivery exhaustion alert.

## Phase 3: Synthesis

The synthesis resolved one key conflict:

**Secret encryption (plaintext vs AES-GCM)**: api-design-minion recommended
encryption; security-minion and data-minion both said plaintext is acceptable.
The synthesis sided with plaintext — the schema is encryption-agnostic and can
be upgraded later without migration.

The plan consolidated into 3 sequential tasks:
1. D1 schema + data access (data-minion, ~200 lines)
2. CRUD handlers + signing + dispatch (iac-minion, ~900 lines)
3. Documentation (software-docs-minion, ~800 lines)

Task 2 had an approval gate because it's the largest deliverable and contains
the security-critical signing implementation.

## Phase 3.5: Architecture Review

5 mandatory reviewers (security, test, ux-strategy, lucy, margo). No
discretionary reviewers selected — the feature has no UI components, no
accessibility surface, no performance-sensitive web pages.

Results:
- **security-minion**: APPROVE
- **test-minion**: APPROVE (with ADVISE on extracting retry schedule as constant)
- **ux-strategy-minion**: APPROVE (webhook management is API-only, no UX concerns)
- **lucy**: ADVISE — drop redundant `idx_webhooks_tenant_active` index, one index
  is sufficient for max 5 rows per tenant
- **margo**: ADVISE — drop port restriction on webhook URLs (YAGNI), the HTTPS-only
  check is sufficient

Both ADVISE items were incorporated into the task prompts before execution.

## Phase 4: Execution

### Task 1: D1 Schema + Data Access (data-minion)

Produced `migrations/0002_webhooks.sql` and 7 functions in `src/db.js`. Lucy
ADVISE during gate review caught a missing tenant upsert guard in
`createWebhook` — the existing `createCapture` pattern uses `db.batch()` with
`INSERT OR IGNORE INTO tenants` as the first statement. Fixed in a follow-up
commit.

### Task 2: CRUD + Signing + Dispatch (iac-minion)

The largest deliverable: 3 new files (`webhooks.js`, `webhook-signing.js`,
`webhook-dispatch.js`) plus integration in `index.js` and `wrangler.toml`.

Gate review found silent catch blocks in the dispatch integration points in
`index.js`. Lucy flagged this as a CLAUDE.md "fail loudly" violation. Fixed
by adding structured error logging to all 3 catch blocks.

### Task 3: Documentation (software-docs-minion)

OpenAPI spec bumped to 0.6.0 with 8 schemas and 4 paths. Integration guide
written at `site/content/webhooks.md` with Node.js and Python signature
verification examples. Validated: Redocly lint 0 errors, 11ty build passes.

## Phase 5: Code Review

Three parallel reviewers:

**code-review-minion** found the most issues:
- `JSON.parse(payload).id` in the queue consumer hot path — unguarded and
  unnecessary (eventId could be a top-level queue message field)
- `active` column with no PATCH endpoint (design decision, not a bug — issue
  scope is POST/GET/DELETE only)
- `capture` scope for webhook routes (intentional per plan)

**margo** flagged:
- Duplicate `classifyPingError` function (near-identical to `classifyDeliveryError`)
- Same JSON.parse issue (consensus across reviewers)
- Hardcoded `VERIFICATION_BASE_URL` fallback

**lucy** flagged:
- Evolution log incomplete (expected — wrap-up phase handles this)
- Same JSON.parse issue

All three agreed on the JSON.parse fix. Applied 3 changes:
1. Extract `eventId` as top-level queue message field
2. Delete `classifyPingError`, import `classifyDeliveryError`
3. Use `slice(6)` instead of `replace('whsec_', '')` for prefix stripping

## Phase 6: Test Execution

test-minion wrote 68 tests across 3 files:
- `webhook-crud.test.js` (29 tests) — integration tests using SELF.fetch
- `webhook-signing.test.js` (6 tests) — pure unit tests for HMAC signing
- `webhook-dispatch.test.js` (33 tests) — unit tests for helpers + queue mocking

Discovery: `TEST_WEBHOOK_URL` fails DNS validation in miniflare. Tests use
IP-based URLs for SELF.fetch, seedWebhook writes directly to D1.

Full suite: 823 pass, 0 fail, no regressions.

## Human Interventions

This was an autonomous orchestration — all gate decisions were made by Lucy
agent per the autonomous execution protocol. No human intervention during
execution.

Key Lucy decisions:
- Team: approved as-is (7 specialists)
- Reviewers: approved 5 mandatory, 0 discretionary
- Execution plan: approved 3-task plan
- Task 1 gate: approved after tenant upsert fix
- Task 2 gate: approved after silent-catch-block fix
- Post-execution: "Run all" (code review + tests + docs)

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/` companion directory
- Synthesis plan: scratch files (copied to companion directory)
- Code review findings: Phase 5 scratch files
- Test results: 68 tests in `test/webhook-*.test.js`
