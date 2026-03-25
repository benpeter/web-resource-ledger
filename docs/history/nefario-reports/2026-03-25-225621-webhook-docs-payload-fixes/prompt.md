Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

Outcome: Webhook documentation accurately reflects the actual API behavior, the capture.complete payload includes artifact URLs so consumers can act on webhooks without a follow-up API call, and the ping endpoint response includes signature headers so callers can verify their verification logic end-to-end.

Scope: webhook-dispatch.js (payload construction), webhooks.js (ping handler), site/content/webhooks.md, related tests

12 specific findings from live testing need to be addressed.
