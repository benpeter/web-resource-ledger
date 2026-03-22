# Outcome: R27 Webhooks / Outbound Callbacks

## What Was Built

Outbound webhook notifications for WRL. Tenants register callback URLs and
receive real-time HTTP POST notifications when captures complete or fail,
eliminating the need to poll the API.

### Deliverables

**Schema and data layer** (Task 1):
- `migrations/0002_webhooks.sql` — single `webhooks` table with composite index
- 7 data access functions in `src/db.js` (+145 lines)
- Test fixtures: `seedWebhook()`, `cleanDb()` webhook cleanup

**CRUD handlers, signing, and dispatch** (Task 2):
- `src/webhooks.js` — POST/GET/DELETE/ping handlers (339 lines)
- `src/webhook-signing.js` — HMAC-SHA256 with Stripe-model timestamp prefix (80 lines)
- `src/webhook-dispatch.js` — fan-out dispatch, queue consumer, DLQ handler (427 lines)
- `src/index.js` — route table + queue routing integration (+56 lines)
- `wrangler.toml` — dedicated `wrl-webhooks` queue with DLQ, production + staging

**Documentation** (Task 3):
- `openapi.yaml` — version 0.6.0, 8 schemas, 4 paths (+512 lines)
- `site/content/webhooks.md` — integration guide with signature verification examples (334 lines)
- Audit log schema, auth docs, site nav updates

**Tests** (Phase 6):
- `test/webhook-crud.test.js` — 29 integration tests
- `test/webhook-signing.test.js` — 6 unit tests
- `test/webhook-dispatch.test.js` — 33 unit tests
- Total: 68 new tests, full suite 823 pass / 0 fail

### Key Numbers

- 19 files changed, +2998/-6 lines
- 7 commits on feature branch
- 68 new tests (all passing)
- 823 total tests (no regressions)

## What Deviated From Plan

1. **classifyPingError duplication** — Task 2 created a duplicate error
   classification function in webhooks.js. Caught by margo in Phase 5,
   fixed by importing `classifyDeliveryError` from webhook-dispatch.js.

2. **JSON.parse in hot path** — Task 2 used `JSON.parse(payload).id` in the
   queue consumer to extract the delivery header. All three reviewers flagged
   this. Fixed by extracting `eventId` as a top-level queue message field at
   enqueue time.

3. **Silent catch blocks** — Task 2 initially had silent catch blocks in the
   dispatch integration (index.js). Lucy flagged this as a CLAUDE.md violation
   during the execution gate. Fixed by adding structured error logging.

## Backlog Changes

- Struck through `[consider] Webhooks / outbound callbacks` in API Enhancements
  parking lot (line 101 of backlog.md)
- Added `[consider] Webhook event replay/redelivery API` to parking lot
  (explicitly out of scope per issue #102)
- Added `[consider] PATCH /v1/webhooks/{id} for active toggle` to parking lot
  (schema supports it but API doesn't expose it; code-review-minion flagged)
- Added `[consider] Webhook delivery exhaustion Coralogix alert` to operations
  parking lot (observability-minion recommended during planning)

## Surprises

- `TEST_WEBHOOK_URL` (`hooks.example.com`) fails DNS validation in miniflare.
  Tests use IP-based URLs (`https://93.184.216.34/webhook`) for SELF.fetch tests.
  `seedWebhook` writes directly to D1 and bypasses validation.

- The `VERIFICATION_BASE_URL` env var has a hardcoded production fallback
  (`https://wrl.benpeter.workers.dev`). margo flagged this — acceptable for now
  since it only affects webhook payload URLs, not routing. Documented as
  tech debt.
