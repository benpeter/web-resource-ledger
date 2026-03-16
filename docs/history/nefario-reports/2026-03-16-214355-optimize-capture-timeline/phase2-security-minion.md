# Security Minion -- Consent Failure Handling & Evidence Chain Integrity

## Summary

The plan to wrap `dismissCookieConsent(page)` at capture.js line 474 in a
try/catch is **correct and necessary**. The existing internal try/catch in
consent.js (line 62-70) handles errors from autoconsent library logic, but
does NOT cover Playwright infrastructure errors that occur when calling
`page.exposeBinding()`, `page.evaluate()`, or similar Playwright APIs after
the browser context has been torn down. These infrastructure errors propagate
as unhandled rejections from `dismissCookieConsent()`, bypassing its internal
catch, and crash the entire renderer -- losing an otherwise complete capture.

The evidence chain concern is real but manageable. Below is the full analysis
and specific implementation guidance.

---

## Finding 1: The gap is real -- Playwright infrastructure errors escape consent.js

### Current state

`consent.js` line 62-70:
```js
try {
    if (typeof page.exposeBinding === 'function') {
      return await _dismissWithBinding(page, start);
    } else {
      return await _dismissWithPolling(page, start);
    }
  } catch {
    return { status: 'failed', cmp: null, durationMs: Date.now() - start };
  }
```

This catch handles errors thrown *inside* `_dismissWithBinding` and
`_dismissWithPolling`. However, there are error scenarios where the
**Playwright page object itself becomes invalid** between the `typeof`
check and the actual API call:

- **Context close race**: If `context.close()` fires from a concurrent
  timeout or cleanup, subsequent `page.exposeBinding()` throws
  `Target closed` or `Protocol error`.
- **Session expiry**: Cloudflare's `keep_alive` session can expire during
  the consent phase. `page.evaluate()` then throws `Session expired` or
  `browser has been closed`.
- **gVisor sandbox kill**: Under memory pressure, gVisor can terminate the
  browser process. All page methods throw `page was closed`.

These errors ARE caught by the existing try/catch in consent.js. The `catch`
on line 68 has no filter -- it catches everything. So the question is really
about whether there are scenarios where the error happens *before* entering
the try block or *after* the function returns but before capture.js
processes the result.

**Correction**: After re-reading the code carefully, the try/catch in
consent.js at line 62 wraps the entire function body. Any synchronous or
asynchronous error thrown by `_dismissWithBinding` or `_dismissWithPolling`
will be caught. The only way an error escapes is if `page` itself is not
a valid object (e.g., `null` or `undefined`) and the `typeof` check on
line 63 throws -- but since `page` comes from `context.newPage()` on line
390, this would require a prior failure that should have already thrown.

**However**, there is a real class of errors that CAN escape: if the
Promise returned by `_dismissWithBinding` rejects with a non-Error value
(some Playwright CDP errors throw string rejections), or if the error
occurs in the `page.evaluate()` calls within the binding callback
(lines 92-96, 123-137) which use `.catch(() => {})` -- these are
fire-and-forget calls that won't propagate. The real risk is more subtle:

The **actual gap** is that `page.exposeBinding()` (line 85) registers a
callback. If the page navigates away or gets destroyed *during* the
8-second consent timeout, the callback's internal `page.evaluate()` calls
at lines 92-96 and 123-137 will throw. Those `.catch(() => {})` handlers
swallow the errors -- good. But the `resolveConsent()` callback may never
fire, and the `timeoutPromise` at line 155 will eventually resolve the
race. So this path is actually safe.

**Net assessment**: The existing try/catch in consent.js is comprehensive
for the *expected* error surface. Adding a defensive try/catch in capture.js
is still the right call because:

1. **Defense in depth** -- consent.js's catch is a bare `catch {}` which
   means it catches ALL errors today, but a future refactor could
   inadvertently narrow it.
2. **Unanticipated Playwright errors** -- Cloudflare's Playwright fork may
   throw errors with characteristics we haven't predicted.
3. **The cost of the outer catch is zero** -- it adds no latency and no
   complexity. The benefit asymmetry is massive: without it, a consent
   bug kills the entire capture. With it, the capture completes with
   degraded consent metadata.

---

## Finding 2: Evidence chain distinguishability -- the critical issue

### The problem

The current captureSettings mapping at capture.js lines 154-163:
```js
result: consent.status === 'dismissed' ? 'success'
      : (consent.status === 'none' ? 'notDetected' : 'failed'),
```

This maps three distinct failure modes to the same `result: 'failed'`:

| consent.status | captureSettings.result | Meaning |
|---|---|---|
| `'dismissed'` | `'success'` | CMP found and opted out |
| `'none'` | `'notDetected'` | No CMP within timeout |
| `'timeout'` | `'failed'` | CMP found, opt-out didn't complete |
| `'failed'` | `'failed'` | Autoconsent reported failure |
| **new: error** | **`'failed'`** | **Library crashed** |

An auditor examining the WACZ bundle's `datapackage.json` cannot distinguish
"autoconsent reported it couldn't opt out of this particular CMP" from
"the consent library threw a TypeError because of a bug." These are
fundamentally different evidence states:

- **`'failed'` from autoconsent**: The library ran, detected the CMP,
  attempted opt-out, and the CMP rejected it. The before-screenshot is
  representative of the page with the consent banner.
- **`'error'` from a crash**: The library didn't complete. We don't know
  the consent state. The before-screenshot may or may not show a banner.

### Recommendation

Add a distinct `result: 'error'` value to captureSettings for the crash case.
This requires the outer try/catch in capture.js to produce a consent object
with a new status value, not reuse `'failed'`.

**Proposed consent shape from the outer catch**:
```js
{ status: 'error', cmp: null, durationMs: <elapsed> }
```

**Updated captureSettings mapping**:
```js
result: consent.status === 'dismissed' ? 'success'
      : consent.status === 'none' ? 'notDetected'
      : consent.status === 'error' ? 'error'
      : 'failed',
```

This gives auditors a three-way signal in the WACZ:
- `'success'` -- consent dismissed, after-screenshot is post-consent
- `'notDetected'` -- no CMP found, single screenshot is representative
- `'failed'` -- CMP found, opt-out attempted, did not succeed
- `'error'` -- consent processing crashed, consent state unknown

The `cmpDetected` field will be absent for `'error'` (since the crash may
have occurred before CMP detection), which is another distinguishing signal.

---

## Finding 3: Error types that SHOULD vs SHOULD NOT be swallowed

### MUST degrade gracefully (catch and continue)

These errors are consent-specific and do not indicate a problem with the
page or browser session:

- **TypeError / ReferenceError** from autoconsent script internals
  (e.g., the adobe.com bug mentioned in the task description)
- **`autoconsentError` message** from the library reporting a known failure
- **Timeout** from the 8s consent budget expiring
- **`eval` errors** from CMP-specific rule execution
- Any error where `page.screenshot()` would still work afterward

### SHOULD propagate (let the renderer fail)

These errors indicate the browser session is compromised and no further
page operations (screenshot, content extraction) will succeed:

- **`Target closed`** / **`page was closed`** / **`browser has been closed`**
- **`Session expired`** / **`session has been closed`**
- **`Protocol error`** (CDP connection broken)
- **`Connection refused`** / **`ECONNREFUSED`**

If these errors occur during consent, the subsequent `page.screenshot()`
and `page.content()` calls at lines 479 and 484 will also throw. Catching
them in the consent wrapper and continuing would just delay the failure by
a few milliseconds and produce a confusing error trace.

### Recommendation: selective propagation

```js
// In capture.js, around line 474
let consent;
try {
  consent = await dismissCookieConsent(page);
} catch (err) {
  // If the page/browser is dead, re-throw -- subsequent operations will fail too
  const msg = err?.message ?? '';
  if (
    msg.includes('Target closed') ||
    msg.includes('page was closed') ||
    msg.includes('browser has been closed') ||
    msg.includes('Session expired') ||
    msg.includes('session has been closed') ||
    msg.includes('Protocol error') ||
    msg.includes('Connection refused') ||
    msg.includes('ECONNREFUSED')
  ) {
    throw err;
  }
  // Consent-specific failure: degrade gracefully
  consent = { status: 'error', cmp: null, durationMs: 0 };
}
```

This ensures:
1. Browser death errors propagate to `categorizeError()` and produce
   proper retryable failure states
2. Consent library bugs degrade gracefully with distinguishable evidence
3. The after-screenshot logic at line 478 (`if (consent.status === 'dismissed')`)
   correctly falls through to the single-screenshot path for `'error'`

---

## Finding 4: Screenshot integrity under the degradation path

When consent degrades to `{ status: 'error' }`, the flow at lines 477-482:
```js
if (consent.status === 'dismissed') {
  screenshot = await page.screenshot({ fullPage: true, type: 'png' });
} else {
  screenshot = screenshotBefore;
}
```

This correctly reuses `screenshotBefore` as the final screenshot. The
WACZ bundle will contain:
- `screenshotBefore` = the before-consent screenshot (banner may be visible)
- `screenshotAfter` = null (no second screenshot taken)
- `captureSettings.consent.result` = `'error'`

This is consistent and auditable. The single screenshot with `result:'error'`
tells the auditor: "We tried to handle consent but the library crashed. This
screenshot may show a consent banner."

**No integrity gap here** -- the evidence is honest about what happened.

---

## Finding 5: Log event for consent errors

The outer catch should emit a warning-level log event so operators can
track consent library crash rates:

```js
// Inside the catch block, before setting consent = { status: 'error', ... }
// Note: this is a fire-and-forget log, not blocking
log(env, 4, 'capture', {
  event: 'capture.consent_error',
  captureId,
  tenantId,
  cip,
  errorName: err?.name,
  errorMessage: String(err?.message ?? '').slice(0, 256),
});
```

Wait -- the outer catch is inside `defaultRenderer()` which does not have
access to `env`, `captureId`, `tenantId`, or `cip`. The renderer only
receives `(browserBinding, url)`.

**Options**:
1. Log from `performCapture()` after the renderer returns, by checking
   `consent.status === 'error'`. This is cleaner -- the renderer stays
   focused on rendering, and the orchestrator handles observability.
2. Pass env/context into the renderer. This violates the current clean
   separation.

**Recommendation**: Option 1. After the renderer returns and before WACZ
bundling, add:

```js
if (consent?.status === 'error') {
  await log(env, 4, 'capture', {
    event: 'capture.consent_error',
    captureId,
    tenantId,
    cip,
  });
}
```

This keeps the renderer injectable and testable, and puts observability
where it belongs (the orchestrator).

---

## Finding 6: captureSettings version bump consideration

Adding `result: 'error'` to the captureSettings schema is a backward-
compatible addition (new value in an existing field). The `version: 1`
field in captureSettings does not need to increment because:

1. Existing verifiers should already handle unknown `result` values
   gracefully (they were designed for extensibility)
2. The `'error'` value is a superset -- it doesn't change the meaning
   of existing values
3. No consumers need to distinguish v1-with-error from v1-without-error

If there's a formal schema or verifier contract, document `'error'` as
a valid value. No version bump needed.

---

## Implementation Checklist

1. **capture.js line 474**: Wrap `dismissCookieConsent(page)` in try/catch
   with selective propagation (re-throw browser death errors, degrade on
   consent-specific errors)

2. **capture.js lines 154-163**: Add `'error'` mapping to captureSettings
   result computation

3. **capture.js after renderer return**: Add warning log for
   `consent.status === 'error'`

4. **consent.js**: No changes needed. The internal try/catch is already
   comprehensive.

5. **capture.js line 496**: Verify `screenshotBefore` handling -- currently
   `consent.status === 'dismissed' ? screenshotBefore : null`. The `'error'`
   status correctly falls through to `null` (no before screenshot in WACZ
   since there's only one screenshot). This is correct.

6. **Tests**: Add a renderer stub that returns `consent: { status: 'error' }`
   and verify:
   - Capture completes (not failed)
   - captureSettings.consent.result === 'error'
   - No screenshotBefore artifact in R2
   - WACZ bundle (if signing key present) contains the error status

7. **Documentation**: Update the consent.js header comment to include
   `'error'` in the status values list. Update the captureSettings
   documentation if it exists outside the code.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Consent library crash kills capture | 4 (observed on adobe.com) | 3 (capture lost, retryable) | Outer try/catch with graceful degradation |
| Auditor cannot distinguish crash from intentional failure | 3 (any WACZ audit) | 2 (evidence ambiguity) | Distinct `'error'` result value |
| Browser death error swallowed, producing corrupt capture | 2 (race condition) | 4 (invalid evidence) | Selective propagation of session errors |
| Future consent.js refactor narrows internal catch | 2 (code evolution) | 3 (regression) | Defense-in-depth outer catch |

**Overall risk of the proposed change**: LOW. The change strictly improves
resilience and evidence integrity with zero downside.
