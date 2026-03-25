Fix webhook docs-vs-code discrepancies and add missing payload data.

**Outcome**: Webhook documentation accurately reflects the actual API behavior, the `capture.complete` payload includes artifact URLs so consumers can act on webhooks without a follow-up API call, and the ping endpoint response includes signature headers so callers can verify their verification logic end-to-end.

**Success criteria**:
- `capture.complete` webhook payload includes `artifacts` object with screenshot, html, and headers URLs
- Ping endpoint API response includes the signature headers sent to the target (or equivalent fields)
- Docs show `data.captureId` (not `data.id`) matching actual code
- Docs show actual `capture.complete` payload fields: `captureId`, `status`, `url`, `verificationUrl`, `completedAt`, `changeDetection` (optional)
- Docs show actual `capture.failed` payload fields including `verificationUrl`, without `data.createdAt`
- `capture.quarantined` event type is either documented or removed from `VALID_EVENTS`
- `updatedAt` field in list response is documented
- "Exponential backoff" label corrected to match actual schedule description
- All existing webhook tests pass
- New tests cover artifacts in payload and signature echo in ping response

**Scope**:
- In: `webhook-dispatch.js` (payload construction), `webhooks.js` (ping handler), `site/content/webhooks.md`, related tests
- Out: Webhook delivery/retry logic, queue infrastructure, SSRF validation, Stripe webhooks

Source: GitHub issue #212
