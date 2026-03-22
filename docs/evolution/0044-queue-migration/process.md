# 0044 Queue Migration — Process

## TL;DR

Six specialist agents (iac, api-design, debugger, observability, test, security) planned the queue migration, producing a 4-task execution plan. Six Phase 3.5 reviewers (security, test, ux-strategy, lucy, margo, observability) reviewed the plan, returning 4 APPROVE and 2 ADVISE verdicts. Execution completed in 2 batches across 4 tasks with 1 mid-execution gate (Batch 1: wrangler.toml + capture.js refactor, Batch 2: queue consumer/producer wiring + tests). Code review found 3 important issues that were auto-fixed. All 617 tests pass. Total: 9 files changed, +734/-117 lines.

## Planning phase

### Specialists consulted

1. **iac-minion**: Queue topology design. Recommended `max_batch_size=1` for failure isolation, `max_concurrency=10`, and non-inheritable staging config. Proposed 30s backoff base (later overridden by debugger-minion's 10s analysis).

2. **api-design-minion**: API contract preservation. Argued for always-ack after performCapture since it writes KV internally. This was rejected in synthesis — it would write `failed` to KV during retries, misleading status API consumers. api-design-minion's batch analysis (one message per URL via sendBatch for per-URL retry isolation) was adopted.

3. **debugger-minion**: performCapture refactoring. Proposed three approaches: (A) throw retryable errors, (B) return result object, (C) add KV `retrying` state. Approach B was adopted as the consensus — clean separation of concerns without API surface changes.

4. **observability-minion**: Log event taxonomy. Defined 6 new events (enqueued, dequeued, retry, dlq, invalid_message, enqueue_fail) and recommended threading `attempt` into existing capture.start/fail logs.

5. **test-minion**: Test strategy. Identified miniflare's `createMessageBatch`/`getQueueResult` APIs for consumer testing. Flagged that existing tests checking KV transitions after POST would need updating for async queue dispatch.

6. **security-minion**: Message validation and SSRF. Recommended re-validating URLs in the consumer (defense-in-depth), captureId/tenantId format validation, and no secrets in queue messages.

### Key conflict: performCapture refactoring

The central disagreement was between api-design-minion (always ack, trust performCapture's internal KV writes) and debugger-minion (return a result object to let the consumer decide). The synthesis sided with debugger-minion's approach B but refined the KV ownership: retryable errors skip KV write entirely (stays pending), non-retryable errors still write terminal KV state. This gives the consumer a clean signal without requiring it to understand KV internals.

## Architecture review (Phase 3.5)

Six reviewers, all in parallel:

- **security-minion**: ADVISE — add `validateUrl()` in consumer for defense-in-depth. Incorporated into Task 3 prompt.
- **test-minion**: APPROVE
- **ux-strategy-minion**: APPROVE — noted API contract is unchanged, Retry-After increase is appropriate
- **lucy**: ADVISE — update header comment in capture.js to reflect new KV ownership contract, ensure attempt param is threaded into logs. Both incorporated into Task 2 prompt.
- **margo**: ADVISE — use `msg.timestamp` instead of custom `enqueuedAt` for queue latency. Incorporated into Task 3 prompt. Also flagged unused CAPTURE_DLQ binding — accepted as minor.
- **observability-minion**: ADVISE — thread attempt param into capture.start/fail logs for cross-retry correlation. Incorporated into Task 2 prompt.

No BLOCKs. 10 total advisories incorporated into task prompts.

## Execution

### Batch 1 (parallel): Tasks 1 + 2

**Task 1** (iac-minion): wrangler.toml queue bindings. Straightforward config addition. Lucy's gate review caught missing `[env.staging.limits]` section — `cpu_ms=60000` only applied to production because `[limits]` is non-inheritable in wrangler environments. Fixed before proceeding.

**Task 2** (debugger-minion): performCapture refactor. Clean implementation of the result object pattern. Key behavioral change: the catch-all now returns `{ ok: false, retryable: true }` instead of calling `failCapture()` — correct for queue semantics but creates a transitional risk where captures hitting catch-all would be stuck in `pending` until the queue consumer is wired up. Acceptable because the branch won't merge until all tasks complete.

Both gates approved by Lucy (autonomous mode). No human intervention needed.

### Batch 2 (sequential): Tasks 3 + 4

**Task 3** (iac-minion): Core queue consumer + producer wiring. Largest task — 192 lines added/changed in index.js, 26 in mcp.js. The consumer implementation followed the synthesis spec closely. Unused `performCapture` import in mcp.js cleaned up after task completion.

**Task 4** (test-minion): Test updates. 11 new consumer tests, ~80 lines updated in capture.test.js for return-value semantics. Miniflare's `createMessageBatch`/`getQueueResult` APIs worked as documented. The test agent ran the full suite and confirmed pre-existing isolated storage flakiness is unrelated.

### Code review findings

The code-reviewer agent (Phase 5) returned ADVISE with 3 important findings:

1. **Inverted validation control flow** in handleCaptureMessage — two separate `if(valid)`/`if(!valid)` blocks were confusing. Refactored to early-return `if (!valid)` then proceed with URL check.

2. **Batch sendBatch failure returned 207** — the items array was built with success entries before sendBatch, so a sendBatch failure would return a 207 "success" response with stale items. Fixed to return 500 (matching single-capture path behavior).

3. **Magic number 4** for retry threshold — `msg.attempts >= 4` had no visible connection to `max_retries=3` in wrangler.toml. Added explanatory comment.

All three fixed in a dedicated commit.

## Where to read more

- Full specialist discussions: `docs/history/nefario-reports/` (companion directory for this run)
- Evolution log: `docs/evolution/0044-queue-migration/`
- Synthesis plan: scratch directory (ephemeral, copied to companion directory)
