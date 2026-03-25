You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

## Your Planning Question

What's the minimal information a developer needs from a ping response to debug signature verification failures without a follow-up call?

Currently the ping endpoint (POST /v1/webhooks/:id/ping) returns only:
```json
{"success": true, "httpStatus": 200, "latencyMs": 142}
```

The issue requests echoing signature headers so callers can verify their verification logic end-to-end. The ping sends these headers to the target:
- X-WRL-Signature-256: t={timestamp},v1={hex_signature}
- X-WRL-Timestamp: {unix_timestamp}
- X-WRL-Event: ping
- X-WRL-Delivery: evt_00000000000000000000000000000000

The ping payload sent to the target is:
```json
{"id": "evt_00000000000000000000000000000000", "type": "ping", "createdAt": "...", "data": {"webhookId": "whk_..."}}
```

Consider: A developer who just registered a webhook wants to test that their signature verification code works. They call ping, their endpoint receives the event, but verification fails. What information in the ping API response helps them debug without looking at their server logs?

## Context

Key files to read:
- src/webhooks.js (handlePingWebhook function, lines 273-338)
- site/content/webhooks.md (signature verification section)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Return your contribution in the structured format
4. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-ux-strategy-minion.md`
