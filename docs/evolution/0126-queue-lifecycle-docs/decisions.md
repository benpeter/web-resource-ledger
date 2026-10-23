# Decisions

- `docs/INTERNALS.md` already listed every queue, binding and setting, and matched `wrangler.toml`. What was missing was how a capture moves through the queue, which changed this week (failure reasons kept across retries, bot checks failing on the first attempt, usage counted once, the dead-letter alert).
- Added a "Capture message lifecycle" section with the six paths and a paragraph on how webhook and email deliveries differ: fixed 60/300/900 s schedule, no retry on permanent answers, and handlers that ack after the schedule so their DLQs mostly see crashed messages.
- Every statement was checked against `src/index.js`, `src/capture.js`, `src/webhook-dispatch.js` and `src/email-dispatch.js`.
