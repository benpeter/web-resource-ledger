# 0044 Queue Migration — Outcome

## What was built

Queue-based capture processing pipeline replacing the `ctx.waitUntil(performCapture(...))` pattern with Cloudflare Queue producer/consumer architecture.

### Changes (9 files, +734/-117 lines)

**Infrastructure** (`wrangler.toml`):
- 4 queues: wrl-captures + DLQ for prod, wrl-captures-staging + DLQ for staging
- `max_batch_size=1`, `max_retries=3`, `max_concurrency=10` (prod) / `5` (staging)
- `cpu_ms=60000` for both environments

**Core pipeline** (`src/capture.js`, `src/index.js`, `src/mcp.js`):
- `performCapture()` returns `{ ok, retryable?, error? }` instead of void
- Retryable errors leave KV in `pending` (no terminal write), enabling queue retry
- Non-retryable errors still write terminal KV state immediately
- `categorizeError()` exported for consumer use
- `RENDER_DEADLINE_MS` raised from 27s to 600s (10 min)
- New `queue(batch, env, ctx)` handler with `handleCaptureMessage` and `handleDlqMessage`
- All 3 producer call sites (single, batch, MCP) migrated to `env.CAPTURE_QUEUE.send()`
- Exponential backoff: 10s, 20s, 40s (capped at 300s)
- Message validation, SSRF defense-in-depth, idempotency guard
- 6 new log events: `capture.enqueued`, `capture.dequeued`, `capture.retry`, `capture.dlq`, `capture.invalid_message`, `capture.enqueue_fail`
- `capture.queued` renamed to `capture.accepted`
- `Retry-After` updated from 5s to 10s

**Tests** (`vitest.config.js`, `test/capture.test.js`, `test/queue-consumer.test.js`, `test/capture-integration.test.js`):
- Queue producer/consumer bindings in vitest config
- Updated capture.test.js for return-value semantics (retryable errors leave KV pending)
- New queue-consumer.test.js with 11 tests (validation, idempotency, retry, DLQ)
- Updated Retry-After assertions

**Operations** (`scripts/smoke-test.sh`):
- Smoke test timeout increased from 60s to 90s

## What deviated from the plan

1. **Staging limits section**: Lucy's gate review caught missing `[env.staging.limits]` — added before Task 3 started
2. **Unused performCapture import in mcp.js**: Cleaned up dead import after Task 3
3. **Batch sendBatch failure**: Code review found the batch endpoint would return 207 with stale success items when sendBatch failed — fixed to return 500
4. **Validation control flow**: Code review found confusing inverted if-blocks — refactored for clarity
5. **CAPTURE_DLQ binding**: Declared but unused in code (DLQ is populated automatically by CF). Kept for potential future manual dead-letter injection

## Success criteria status

| Criterion | Status |
|-----------|--------|
| Capture requests enqueued via Cloudflare Queue | Done |
| Queue consumer handles browser rendering with 15-minute budget | Done (RENDER_DEADLINE_MS=600s within 15-min CF limit) |
| Retry policy with exponential backoff for transient failures | Done (10s/20s/40s, max 300s) |
| Dead-letter queue for permanently failing captures | Done (wrl-captures-dlq with KV failCapture) |
| Existing capture API contract unchanged (202 -> poll) | Done (Retry-After bumped 5->10s) |
| Capture success rate measurably improves for slow pages | Ready for deployment; measurement requires Coralogix data |

## Backlog changes

- ~~R16: Queue migration for capture processing~~ — done (this phase)
- Added to parking lot: Coralogix alert configuration for DLQ events (deferred to post-deployment)
- Added to parking lot: Documentation debt — architecture docs, log event taxonomy (4 SHOULD/COULD items, 0 MUST)
