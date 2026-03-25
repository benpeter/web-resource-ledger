You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

10 documentation findings need correction in site/content/webhooks.md to align with actual code behavior.

## Your Planning Question

1. Should `capture.quarantined` get its own payload example section or just a mention? The event type is accepted by VALID_EVENTS but has no documentation. The code handles it (webhook-dispatch.js lines 133-136) with quarantineReason and quarantinedAt fields.

2. How to present conditional fields (`changeDetection`) without cluttering the primary example? changeDetection is only present when a previous capture exists for comparison.

3. What's the accurate label for the retry schedule (60/300/900s)? The docs currently say "exponential backoff" but the actual schedule is 60s, 300s, 900s -- which is not exponential (would be 60, 120, 240 or similar).

## Context

Key files to read:
- site/content/webhooks.md (current documentation)
- src/webhook-dispatch.js (buildWebhookPayload function for actual payload fields)
- src/webhooks.js (VALID_EVENTS array, handleListWebhooks for list response fields)

Specific doc-vs-code discrepancies:
- Docs show data.id; code sends data.captureId
- Docs show data.createdAt; code doesn't send it
- Docs show renderQuality; code doesn't send it
- Docs show verifyUrl; code sends verificationUrl
- verificationUrl on failed events not shown in docs
- updatedAt in list response not documented
- capture.quarantined undocumented
- changeDetection undocumented

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Return your contribution in the structured format
4. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-user-docs-minion.md`
