You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet -- you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Fix webhook docs-vs-code discrepancies and add missing payload data (GitHub issue #212).

## Your Planning Question

Given existing test patterns in `test/webhook-dispatch.test.js` and `test/webhook-crud.test.js`, what test structure should be used for:
1. Verifying artifact URL inclusion in capture.complete payload (buildWebhookPayload)
2. Verifying ping response includes signature echo fields
3. Any regression tests needed to ensure existing behavior isn't broken

The success criteria explicitly require:
- All existing webhook tests pass
- New tests cover artifacts in payload and signature echo in ping response

## Context

Key files to read:
- test/webhook-dispatch.test.js (existing buildWebhookPayload tests, dispatchWebhooks tests)
- test/webhook-crud.test.js (existing ping endpoint tests)
- test/fixtures.js (test helpers like seedWebhook, TEST_WEBHOOK_URL, TEST_WEBHOOK_SECRET)

## Instructions
1. Read relevant files to understand the current test patterns
2. Apply your domain expertise to plan test coverage
3. Return your contribution in the structured format
4. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9i8mC8/webhook-docs-payload-fixes/phase2-test-minion.md`
