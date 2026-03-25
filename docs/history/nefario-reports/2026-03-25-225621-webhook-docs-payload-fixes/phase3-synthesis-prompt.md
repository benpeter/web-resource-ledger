MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

**Outcome**: Webhook documentation accurately reflects the actual API behavior, the capture.complete payload includes artifact URLs so consumers can act on webhooks without a follow-up API call, and the ping endpoint response includes signature headers so callers can verify their verification logic end-to-end.

**Scope**: webhook-dispatch.js (payload construction), webhooks.js (ping handler), site/content/webhooks.md, related tests.
**Out of scope**: Webhook delivery/retry logic, queue infrastructure, SSRF validation, Stripe webhooks.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-api-design-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-test-minion.md

## Key consensus across specialists:

- api-design-minion: Add artifacts object (screenshot/html/headers URLs) to capture.complete payload; echo signature as FLAT fields in ping response; sentPayload must be raw string
- user-docs-minion: Document quarantined as brief subsection; show changeDetection as separate annotated example; fix retry label to "increasing delays"; comprehensive docs corrections needed
- ux-strategy-minion: Echo signature fields NESTED under `signature` object; include raw payload as string; fix X-WRL-Delivery null on pings
- test-minion: Artifact URL tests in webhook-dispatch.test.js; ping echo test in webhook-crud.test.js; no new regression tests needed

KEY CONFLICT: api-design-minion wants flat signature fields, ux-strategy-minion wants nested `signature` object. Need to resolve.

## External Skills Context
One skill discovered: ops-runbook (LEAF, operational procedures). Not relevant to this task.

## Instructions
1. Review all specialist contributions
2. Resolve the flat-vs-nested conflict for ping signature echo
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase3-synthesis.md`
