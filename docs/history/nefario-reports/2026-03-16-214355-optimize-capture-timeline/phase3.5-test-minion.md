## Verdict: ADVISE

The test plan is sound. The consent error degradation tests and settle telemetry test cover the critical new paths. The "browser death errors re-throw" contract — which is the highest-risk part of Change 3 — is already exercised by the existing session lifecycle error tests (`Target closed`, `session has been closed`, `Protocol error`, `Connection refused`, `ECONNREFUSED`). Those tests confirm those paths crash the renderer as expected, so the new try/catch must not catch them.

### One gap worth plugging

The plan's consent error try/catch tests only use `consentErrorRenderer` (which never throws — it returns `{ status: 'error' }` directly). This leaves the actual catch branch untested: a renderer that throws a TypeError inside `dismissCookieConsent()` and has that error caught and converted to `{ status: 'error', cmp: null, durationMs: 0 }` by capture.js.

A fixture like this:
```js
export const consentThrowsRenderer = async () => ({
  screenshot: PNG_BYTES,
  screenshotBefore: null,
  html: TEST_HTML,
  partial: false,
  render: { ... },
  // no consent field -- capture.js will call dismissCookieConsent() and it throws
});
```
is not straightforward here because the consent call happens inside the real renderer, not the stub. The plan correctly avoids this — the stub architecture means the catch branch in capture.js is exercised when the stub's `consent` field carries `{ status: 'error' }`. The catch branch itself is integration-tested by the existing browser-death re-throw tests confirming those still propagate.

This gap is acceptable given the architecture. The four consent error degradation tests collectively verify the full degradation contract through the captureSettings mapping ternary — that is the observable outcome that matters.

### Two minor concerns to flag for the implementing agent

1. **`enrichedStubRenderer` settle fields**: The plan adds `settleMs: 500, settleReason: 'quiesce'` to the inline `enrichedStubRenderer` in `capture.test.js`. The settle telemetry test asserts `record.render.settleMs === 500` and `record.render.settleReason === 'quiesce'`. This only works if `performCapture` passes the render metadata from the renderer stub through to the KV record unchanged. Confirm `render` passthrough exists in `performCapture()` before assuming the test will pass.

2. **`partialRenderer` / `partialLoadRenderer` in `capture.test.js` are separate from the one in `fixtures.js`**: The plan says "do NOT change `partialRenderer` or `partialLoadRenderer`" referring to `fixtures.js`. There are also local copies in `capture.test.js` (lines 574–594). Those local copies currently have no settle fields and the plan does not mention them. That is correct — partial captures skip settle — but the implementing agent should not accidentally add settle fields to those local stubs either.

Neither concern warrants a BLOCK. The plan is precise, the test scope is appropriate, and the existing test suite provides a sufficient regression gate.
