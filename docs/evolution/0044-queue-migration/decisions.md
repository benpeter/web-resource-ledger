# 0044 Queue Migration — Decisions

## performCapture refactoring approach

**Chosen**: Return a result object `{ ok, retryable?, error? }` with conditional KV writes (skip KV for retryable errors).

**Over**:
- Always ack after performCapture returns, since it writes KV internally (api-design-minion) — would write `failed` during retries, misleading status API consumers
- Let performCapture throw retryable errors (debugger-minion approach A) — fragile, requires determining which errors should escape the catch-all
- Consumer re-reads KV after performCapture to check retryable flag — wasteful extra KV read per attempt

**Why**: Minimal change that gives the consumer a structured signal while preserving performCapture's responsibility for terminal KV writes. The 40+ existing tests remain backwards-compatible (return value can be ignored).

## KV status during retries

**Chosen**: Keep `pending` status during retry window (no new states).

**Over**:
- Write `failed` on every attempt (current behavior) — misleads status API consumers who see `failed` while a retry is in-flight
- Add `retrying` or `queued` status — adds API surface complexity for no client benefit

**Why**: Clients already handle `pending` (they poll). The 24h TTL on pending records is the safety net.

## Batch endpoint enqueuing

**Chosen**: One message per URL via `sendBatch()` for atomic enqueue of all items.

**Over**: Single batch message containing all URLs — would lose per-URL retry isolation, DLQ granularity, and natural concurrency from the queue consumer.

**Why**: Each capture is an independent unit of work. Queue primitives (msg.ack/retry) operate per-message.

## Exponential backoff schedule

**Chosen**: 10s base, doubling per attempt (10s, 20s, 40s), capped at 300s.

**Over**: iac-minion's 30s base with jitter (30s, 60s, 120s) — more aggressive but session pool exhaustion typically clears within 10-20s.

**Why**: Session pool contention (most common retryable failure) resolves faster than 30s. Shorter initial delay means faster recovery.

## Queue timing: msg.timestamp vs enqueuedAt

**Chosen**: Use `msg.timestamp` (set by Cloudflare) for queue latency computation.

**Over**: Custom `enqueuedAt` field in the message body — redundant with platform-provided data.

**Why**: margo ADVISE. The platform timestamp is more reliable and doesn't bloat the message body unnecessarily. `enqueuedAt` is still in the message body for backwards compatibility but not used for timing.

## Batch sendBatch failure response

**Chosen**: Return 500 when `sendBatch()` fails (code review finding).

**Over**: Silent 207 response with stale success items in the response body.

**Why**: Callers would poll for captures that were never enqueued, finding them all `failed` with no indication from the API response. The single-capture path already returns 500 on queue send failure — batch should be consistent.

## Consumer URL validation (defense-in-depth)

**Chosen**: Call `validateUrl()` on URLs from queue messages before processing.

**Over**: Trust that HTTP ingress already validated the URL (original synthesis recommendation).

**Why**: security-minion ADVISE. Defense-in-depth against message tampering or future code paths that bypass HTTP validation.
