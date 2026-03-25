You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

The issue has 12 specific findings from live testing. Two require code changes:
1. capture.complete payload missing artifacts URLs (screenshot, html, headers)
2. Ping API response doesn't include signature headers sent to the target

The rest are documentation corrections to align docs with actual code behavior.

## Your Planning Question

How should artifact URLs be constructed in the `capture.complete` payload? The constraint is: use the same `base + /v1/captures/{id}/artifacts/{type}` pattern already shown in docs examples. The code currently explicitly says artifact paths are "NEVER included" (line 88 of webhook-dispatch.js) -- this needs to change per the issue requirements.

What shape should the ping response take to echo signature fields? Options:
- Flat fields alongside existing success/httpStatus/latencyMs
- Nested object (e.g., `signature: { header, timestamp }`)
- Considering the purpose: letting callers verify their verification logic end-to-end without a live event

## Context

Key files to read:
- src/webhook-dispatch.js (buildWebhookPayload function, lines 95-144)
- src/webhooks.js (handlePingWebhook function, lines 273-338)
- site/content/webhooks.md (current docs, especially payload examples)
- src/webhook-signing.js (SIGNATURE_HEADER, TIMESTAMP_HEADER constants)

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved, say so
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks with deliverables and dependencies>

### Risks and Concerns
<things that could go wrong>

### Additional Agents Needed
<any specialists not yet involved, or "None">

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-api-design-minion.md`
