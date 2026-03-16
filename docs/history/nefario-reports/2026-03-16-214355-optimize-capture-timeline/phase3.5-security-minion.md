# Security Review: optimize-capture-timeline

## Verdict: APPROVE

The plan is sound from a security standpoint. Three concerns worth calling out for the implementer -- none are blockers.

---

### 1. Selective error propagation covers the right cases (confirmed)

The browser-death string list in the catch block is correct for Playwright/CF runtime:
`Target closed`, `page was closed`, `browser has been closed`, `Session expired`,
`session has been closed`, `Protocol error`, `Connection refused`, `ECONNREFUSED`.

One gap: `err?.message ?? ''` is safe, but if `dismissCookieConsent` throws a
non-Error value (e.g., a plain string), `err?.message` will be undefined and the
error silently degrades to `consent.status = 'error'` even when it might have been
a browser death string. The plan does not guard against this. The existing code in
`consent.js` uses `throw err` internally, so this is low-probability -- but
implementer should be aware.

Mitigation: add `String(err ?? '')` fallback before doing the `includes` checks:
```js
const msg = String(err?.message ?? err ?? '');
```

### 2. Evidence chain integrity with `'error'` consent status (no concern)

The plan preserves artifact completeness when consent throws: screenshot, HTML, and
WACZ are still written to R2. The `screenshotBefore` path correctly uses the single
screenshot when `consent.status !== 'dismissed'` (existing logic, unchanged). The
`'error'` status is surfaced in `captureSettings.consent.result` and logged at
warning level. Evidence chain is intact.

The plan also correctly notes `consent.js` header comment should document `'error'`
as produced by `capture.js`'s outer catch, not by `consent.js` -- this avoids future
confusion about where the value originates.

### 3. Settle tracking and the security content gate interact correctly (confirmed)

The plan explicitly preserves `context.route('**/*')` (line 389 of plan: "keep
settle tracking separate from security gate"). The existing `limitExceeded` re-check
at line 463 of `capture.js` runs after the current fixed settle delay and will
continue to run after the adaptive `waitForSettle()` completes. No bypass of the
byte-limit security gate.

The `waitForSettle` listener cleanup via `page.removeListener()` is correct -- no
lingering listener references that could interfere with subsequent page operations or
cause resource leaks in the CF Workers runtime.

---

No security blockers. Implementation may proceed.
