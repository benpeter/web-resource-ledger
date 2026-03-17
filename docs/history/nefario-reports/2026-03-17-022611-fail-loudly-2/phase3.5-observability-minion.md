## Observability Review: fail-loudly-2

**Verdict: ADVISE**

The plan is sound in structure and achieves the core goal. Three issues are worth flagging before execution, one of which is a genuine gap.

---

### Issue 1: `index.js` list.error severity 3 -> 5 (CONFIRM -- plan is correct)

Current code at line 263 uses `log(env, 3, 'list', { event: 'list.error', ... })`. The plan correctly identifies this as wrong -- severity 3 is Coralogix "info" and this is a 500-path. Severity 5 (error) is the right fix. No issue here, just confirming the audit was correct.

---

### Issue 2: `capture.js:563` -- existing message loses original cause (MINOR GAP)

The current code at line 563 is `throw new Error('Deadline exceeded before partial capture could complete')`. The plan correctly adds `{ cause: err }` to preserve the root cause.

However: the outer `catch (err)` at `capture.js:256-258` logs `err?.constructor?.name` and `err?.message` from whatever lands there. With `{ cause: err }`, the outer log will capture the *wrapper* message ("Deadline exceeded...") but the cause chain is never serialized into the log payload. For production debugging, the cause's message and class are exactly what operators need.

**Recommendation**: In the `capture.fail` log at line 258, if `err.cause` exists, include `causeClass: err.cause?.constructor?.name` and `causeMessage: String(err.cause?.message ?? '').slice(0, 256)` in the log payload. This does not require changes to the delegation prompt's specific catch-block changes -- it's an addendum to the existing log call. Low urgency; the `cause` is present on the Error object for Node-compatible runtimes, but whether Cloudflare Workers surfaces it in traces is uncertain. Console-level visibility is already improved by the plan.

Do not block on this. Note it as a follow-up.

---

### Issue 3: `signing.js` -- "service unavailable" vs "misconfigured" still not distinguished (GENUINE GAP, ADVISE)

The original user request's top success criterion is: "Degraded features report distinct status values so operators can distinguish 'service unavailable' from 'misconfigured'."

The plan adds `console.warn('Signing key validation failed:', err?.message)` to `signing.js:83`. This surfaces the error message, which is progress. However, the *caller* path in `index.js` handles a null return from `getSigningKeys` with a bare `problemResponse(503, 'Verification service is not configured')` -- no log event is emitted for this condition.

There are two failure modes that produce the same 503 response and no Coralogix event:
1. `SIGNING_KEY` is not set at all (key absent -- expected in some environments)
2. `SIGNING_KEY` is set but malformed (key misconfigured -- operator error)

The `console.warn` in `signing.js` only fires in case 2. Case 1 returns early at the top of `getSigningKeys` without any logging. From Coralogix, both cases are invisible -- they produce only the 503 HTTP response (which is not logged by the verify handler either).

The plan explicitly says "Do NOT add new Coralogix log events for signing.js". The synthesis rationale is that `env` wiring complexity should be deferred. I accept that tradeoff for the hot-path ip-hash.js case. For signing.js, the concern is weaker: `getSigningKeys(env)` already receives `env`, and the verify handler has `ctx` available, so a `ctx.waitUntil(log(...))` call on a null return is straightforward.

**My recommendation**: Add a single `log()` call in `handleVerifyCapture` and `handleGetSigningKey` at the point where `getSigningKeys` returns null, distinguishing whether `env.SIGNING_KEY` is set. Something like:

```js
if (!publicKeyBytes) {
  const reason = env.SIGNING_KEY ? 'key_invalid' : 'key_absent';
  ctx.waitUntil(log(env, 5, 'security', { event: 'signing.key_unavailable', reason }) ?? Promise.resolve());
  return problemResponse(503, 'Verification service is not configured');
}
```

This directly addresses the original user request's stated goal. Without it, operators still cannot distinguish "SIGNING_KEY was never configured" from "SIGNING_KEY is set to garbage" using Coralogix -- which is the exact failure mode that prompted issue #66.

This is the one place the plan does not fully satisfy the brief. I advise adding this before execution rather than as a follow-up, because it is the direct analog of the wacz.js fix that motivated this entire phase.

---

### Everything Else

- `console.warn` for log.js meta-failures: correct. Recursion risk is real; telemetry degradation is not a system failure.
- `wrl:` prefix conventions on console.warn calls: consistent and filterable.
- consent.js frame-level catch blocks: leaving them silent with comments is correct. Logging iframe evaluate failures would generate noise proportional to ad frame count.
- `capture.cleanup_fail` as `console.warn`: appropriate. Cleanup runs in finally; logging infra may already be shutting down.
- `timestampStatus: 'absent' -> 'skipped'`: semantically correct and consistent with the three-way model.
- `capture.kv_create_fail` event with severity 5 and `captureId`/`tenantId`/`cip` fields: matches existing field conventions from the rest of index.js.

---

**Summary of required changes before execution:**

Add a `signing.key_unavailable` log event (severity 5, subsystem `'security'`) in `handleVerifyCapture` and `handleGetSigningKey` when `publicKeyBytes`/`keys` is null, with a `reason` field distinguishing `'key_absent'` from `'key_invalid'`. This is the direct observability fix for the "misconfigured vs unavailable" distinction that the user request mandates.

All other changes in the plan are approved as specified.
