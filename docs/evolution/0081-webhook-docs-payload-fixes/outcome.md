# Outcome — Phase 0081: Webhook Docs & Payload Fixes

## What Was Produced

### Code Changes

1. **`src/webhook-dispatch.js`** — Added `data.artifacts` object to `capture.complete`
   payload in `buildWebhookPayload()`. Three artifact URLs (screenshot, html, headers)
   are always included using the same base URL pattern as `verificationUrl`.

2. **`src/webhooks.js`** — Two changes to `handlePingWebhook()`:
   - Set `X-WRL-Delivery` header to the fixed ping event ID instead of `null`
   - Added `signatureHeader`, `timestampHeader`, `sentPayload` to both success
     and failure response paths. `sentPayload` is the raw string variable, not
     re-serialized.

3. **`openapi.yaml`** — Updated `PingResponse` schema with 3 new required fields
   (`signatureHeader`, `timestampHeader`, `sentPayload`). Fixed `WebhookEventPayload`
   examples: `data.id` → `data.captureId`, removed `data.createdAt`/`renderQuality`,
   `verifyUrl` → `verificationUrl`, added `capture.quarantined` example, updated
   `data` description to cover all event types.

### Documentation Changes

4. **`site/content/webhooks.md`** — 9 fixes:
   - `capture.complete` example: correct field names, added `artifacts` object
   - Added `changeDetection` conditional subsection with annotated example
   - `capture.failed` example: correct field names, added `verificationUrl`
   - Added `capture.quarantined` section with payload example
   - "exponential backoff" → "fixed schedule of increasing delays"
   - Added `updatedAt` to list response example
   - Ping response shows signature echo fields with debugging guidance
   - Added signature debugging troubleshooting entry
   - Registration example includes `capture.quarantined` in events

### Tests

5. **`test/webhook-dispatch.test.js`** — 4 new tests:
   - Artifact URLs present in complete payload
   - Artifact URLs use VERIFICATION_BASE_URL when set
   - Failed payload excludes artifacts
   - Quarantined payload excludes artifacts

6. **`test/webhook-crud.test.js`** — 1 new test:
   - Ping response includes signatureHeader, timestampHeader, sentPayload

## Test Results

All 1524 tests pass across 60 test files (2 pre-existing skips).

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | Updated: PingResponse schema, WebhookEventPayload examples, ping response examples, data field description |
| Docs site | Updated: webhooks.md with 9 fixes (all discrepancies resolved) |
| Landing page | No update needed: no pricing/tier changes or new headline capabilities |
| MCP server | No update needed: webhook endpoints not exposed as MCP tools |
| Legal pages | No update needed: no new data collection or third-party services |

## Backlog Changes

No new backlog items. The two non-blocking code review findings (duplicate ping
event ID string literal, error field format in docs example) are minor and don't
warrant backlog entries. Issue #212 is fully resolved.

## What Deviated From Plan

- Lucy caught an incorrect `diffUrl` pattern in the changeDetection docs example
  during Task 3 approval gate review. Fixed before commit.
- The synthesis plan called for 3 tasks but Tasks 1+2 (code changes) were
  combined into a single execution agent, and Task 3 (docs) was a separate agent.
  The OpenAPI spec updates were done post-execution in Phase 8b rather than in
  Task 3, since the checklist identified them as a separate surface requiring updates.
