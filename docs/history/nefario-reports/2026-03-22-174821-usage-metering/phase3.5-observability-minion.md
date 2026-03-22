# Observability Review: Usage Metering (Revision Round 1)

**Verdict: ADVISE**

---

## Prior Advisory Verification

All three items from the previous round are incorporated correctly:

- `usage.counter_fail` event is present in all counter increment catch blocks
  with appropriate context fields
- `usage.counter_incremented` success log is present in the queue consumer,
  including `captureId` as advised
- `captureId` is intentionally omitted from the API handler catch blocks, with
  an inline comment explaining why -- exactly as requested
- Counter drift reconciliation query is listed in the backlog
- The cross-cutting coverage section attributes both items to
  observability-minion advisory

Previous feedback is fully resolved.

---

## New Issues Found

### Issue 1 (ADVISE, HIGH) -- Success log fires unconditionally, decoupled from D1 write

**Location**: Task 2 prompt, queue consumer instrumentation block (lines 332-354)

**Problem**: The `usage.counter_incremented` log and the `incrementUsage` call
are dispatched in two separate, parallel `ctx.waitUntil()` calls. These run
concurrently with no ordering guarantee. The log will fire even when the D1
write fails -- both `counter_fail` and `counter_incremented` will appear in
Coralogix for the same capture.

```js
// Current plan -- two independent waitUntil calls:
ctx.waitUntil(
  incrementUsage(env.DB, tenantId, { ... }).catch((err) => {
    log(env, 4, 'usage', { event: 'usage.counter_fail', ... });
  })
);

// This fires regardless of whether incrementUsage succeeded:
ctx.waitUntil(log(env, 3, 'usage', {
  event: 'usage.counter_incremented',
  ...
}) ?? Promise.resolve());
```

**Why this matters**: The entire point of `counter_incremented` is to enable
reconciliation: compare Coralogix event counts against D1 totals to detect
counter drift. If the log fires even when the D1 write fails, the Coralogix
count will equal the capture count regardless of how many D1 writes failed.
The reconciliation query becomes useless -- it will always show zero drift,
masking the exact failures it was designed to detect.

**Fix**: Chain the success log inside `.then()` on the `incrementUsage` promise,
keeping both paths inside a single `ctx.waitUntil()`:

```js
ctx.waitUntil(
  incrementUsage(env.DB, tenantId, {
    captures: 1,
    storageBytes: result.storedBytes || 0,
  })
    .then(() => {
      return log(env, 3, 'usage', {
        event: 'usage.counter_incremented',
        tenantId,
        captureId,
        captures: 1,
        storageBytes: result.storedBytes || 0,
      });
    })
    .catch((err) => {
      log(env, 4, 'usage', {
        event: 'usage.counter_fail',
        tenantId,
        captureId,
        counters: 'captures,storageBytes',
        errorMessage: String(err?.message ?? '').slice(0, 256),
      });
    })
);
```

This ensures:
- `counter_incremented` fires only when the D1 write resolves successfully
- `counter_fail` fires only when the D1 write throws
- A single event per capture (never both simultaneously)
- Coralogix counts of `counter_incremented` are a trustworthy lower bound,
  making the reconciliation query meaningful
- Reduces two `ctx.waitUntil()` calls to one

**Required change**: Update the Task 2 prompt code block and the corresponding
success criterion from "Queue consumer logs `usage.counter_incremented` event
on success" to "Queue consumer logs `usage.counter_incremented` only when
`incrementUsage` resolves successfully (chained via `.then()`, not a parallel
`ctx.waitUntil()`)."

---

### Issue 2 (ADVISE, LOW) -- `storedBytes` snippet uses block-scoped variable

**Location**: Task 2 prompt, "Extend `performCapture()` return value" section,
summary code block at lines 294-301

**Problem**: The summary snippet shows:

```js
if (waczBytes) storedBytes += waczBytes.byteLength;
```

In the actual capture.js, `waczBytes` is declared on line 195 inside
`if (result) { }`, which is inside a `try` block, which is inside `if (!partial)`.
It is block-scoped and inaccessible after those blocks close. This line would
produce a ReferenceError at runtime, or cause the executing agent to introduce
a `var` declaration as a workaround.

The correct reference is `waczInfo.size`, which is set at line 212 as
`size: waczBytes.byteLength` and is scoped to the outer function body.

**Fix**: Correct the summary snippet to use `waczInfo`:

```js
// After the R2 Promise.all() at line 150-160:
let storedBytes = screenshot.byteLength;
if (screenshotBefore) storedBytes += screenshotBefore.byteLength;
storedBytes += new TextEncoder().encode(html).byteLength;
if (headers) storedBytes += new TextEncoder().encode(JSON.stringify(headers)).byteLength;
// waczBytes is block-scoped inside the WACZ try block -- use waczInfo instead:
// (add after the WACZ if block closes, around line 222)
if (waczInfo) storedBytes += waczInfo.size;
```

The prose already says "accumulate progressively" and "add waczBytes if WACZ
bundling succeeded," which points toward the right approach. But the snippet
contradicts the prose. An experienced agent may arrive at `waczInfo.size`
anyway, but the incorrect snippet raises the risk of a runtime error or a
non-idiomatic workaround slipping through code review.

---

## Summary

| # | Severity | Issue |
|---|----------|-------|
| 1 | HIGH | `counter_incremented` log is in a parallel `waitUntil`; fires even on D1 failure; invalidates reconciliation query |
| 2 | LOW | `waczBytes` in storedBytes snippet is block-scoped; correct reference is `waczInfo.size` |

Issue 1 requires a code block correction and success criterion update in the
Task 2 prompt. Issue 2 requires a snippet fix in the Task 2 prompt.

The overall observability design remains sound. Failure logging, severity
levels, event naming, the admin query audit log, and the reconciliation backlog
item are all correct. Once Issue 1 is fixed, the logging pattern will be
trustworthy for the reconciliation use case it was designed to support.
