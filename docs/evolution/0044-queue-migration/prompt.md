# Phase 0044: Queue Migration for Capture Processing

## Source

GitHub Issue #46: R16: Queue migration for capture processing

## Prompt

**Outcome**: Complex pages that exceed the current 30s processing hard limit can complete successfully, improving capture reliability for real-world pages.

**Success criteria**:
- Capture requests enqueued via Cloudflare Queue instead of ctx.waitUntil()
- Queue consumer handles browser rendering with 15-minute budget
- Retry policy with exponential backoff for transient failures
- Dead-letter queue for permanently failing captures
- Existing capture API contract unchanged (202 → poll for status)
- Capture success rate measurably improves for slow pages

**Scope**:
- In: Queue binding in wrangler.toml, producer/consumer split, retry policy, dead-letter handling, updated status tracking, tests
- Out: Priority queues, multi-region processing, worker autoscaling

**Constraints**:
- Data-driven trigger: implement when Coralogix shows timeout failures >5% or sustained traffic >200/min
- Current 30s budget (25s navigation + 5s headroom) is sufficient at present scale
