## Verdict: ADVISE

Both tasks have adequate test requirements and the plan references the right test files, helpers, and patterns. Two targeted warnings follow.

---

### Warning 1: Task 1 tests use wrong queue consumer path

**SCOPE**: `test/notification-triggers.test.js` — Task 1, test case 1 (short-circuit skips dispatch)

**CHANGE**: The plan instructs the agent to use `runConsumer()` with `makeCaptureMsg()` to verify the short-circuit. But the existing `runConsumer` helper (line 87-92) calls `worker.queue(batch, env, ctx)` — it uses the shared `env` object, not the `makeEmailEnv()` spy. This means the test cannot observe whether `dispatchNotification` was called via queue inspection, and `EMAIL_QUEUE.send` will not be captured by the spy.

**WHY**: The existing 3b tests that call `dispatchNotification` directly (lines 211-287) use `makeEmailEnv(sent)` to inject the spy. The `runConsumer` path does not pass a custom env — it passes the unmodified `env` from `cloudflare:test`. If the new test uses `runConsumer()` without wiring a custom env, the `sent` array will remain empty regardless of whether dispatch was called or skipped, making the test vacuously pass.

**TASK**: The implementing agent must either (a) inject the `makeEmailEnv` spy into the `runConsumer` call by patching `env.EMAIL_QUEUE` before calling `worker.queue`, or (b) use `vi.spyOn` on the `dispatchNotification` import to verify it was or was not called. Option (b) matches the existing pattern in other test files. The plan says "spy or check that no messages are enqueued to EMAIL_QUEUE" — the agent needs to pick one and implement it correctly, not assume `runConsumer` + `EMAIL_QUEUE` check works out of the box.

---

### Warning 2: Task 2 missing `screenshot-before` artifact test

**SCOPE**: `test/capture-retrieval.test.js` — Task 2 test suite

**CHANGE**: The plan specifies tests for `screenshot`, `wacz`, and `html` artifacts only. The `buildArtifactFilename` function has special handling for `screenshot-before` (adds a `-before` suffix, different mapping), but no test covers this artifact type. The fixture setup in `capture-retrieval.test.js` does not seed a `screenshot-before` R2 object.

**WHY**: This is a low-risk gap — the `screenshot-before` branch in the filename builder is straightforward and covered by the general sanitization logic. However, the `-before` suffix is the one behavioral difference specific to that artifact type, and omitting it means a regression there would go undetected. Since the success criteria explicitly includes "new tests cover happy path and at least screenshot + wacz artifacts", this is within stated scope — but the agent should be aware the `screenshot-before` path is untested.

**TASK**: This is advisory, not blocking. If the implementing agent adds `screenshot-before` as an artifact to the R2 seed in `beforeEach` and adds one test asserting the filename ends in `-before.png`, that would complete coverage. If not added, document the gap in a comment.
