# Code Review: stage-level-timings

Reviewed files: src/capture.js, openapi.yaml, test/capture-retrieval.test.js, test/kv.test.js

---

## Summary

This is a clean instrumentation-only change. The timing logic is correct, the
guard patterns (`render?.stages ?? {}`) handle legacy and custom-renderer paths
safely, and the OpenAPI spec additions are valid OAS 3.1.0. One log field rename
is a breaking observability change that may affect existing Coralogix queries.
No security issues. No behavioral changes to capture logic.

---

## Findings

### ADVISE: src/capture.js:232-235 -- `consentDurationMs` silently renamed to `consentMs` in `capture.success` log event

The `capture.success` log event previously emitted `consentDurationMs:
consent?.durationMs ?? null` (line removed in diff). This field is now gone.
The spread `...(render?.stages ?? {})` brings in `consentMs` instead, which
measures the same period (the `dismissCookieConsent` call). This is a
**silent log field rename** -- any Coralogix saved searches, dashboards, or
alerts keyed on `consentDurationMs` will silently stop matching without error.

FIX: Either document this rename explicitly in the evolution log / Coralogix
runbook and update any saved queries, or add a transitional alias by keeping
`consentDurationMs: render?.stages?.consentMs ?? null` in the success log for
one release cycle before dropping it.

---

### ADVISE: No new tests assert stages shape or presence in API responses

The `toEqual` -> `toMatchObject` changes in test/capture-retrieval.test.js:137
and test/kv.test.js:318 are the right accommodation -- they allow `stages` to be
present without breaking existing assertions. However, there are zero new test
assertions that verify:

- `render.stages` is present on instrumented captures
- All seven stage keys are present with non-negative integer or null values
- The `stages` object is absent (or not) on legacy captures without instrumentation

The PARTIAL_RENDER fixture (capture-retrieval.test.js:9-13) does not include
`stages`, so the retrieval test cannot catch a regression where stages is
accidentally stripped during KV round-trip.

FIX: Add at least one test case with a `stages`-bearing render fixture that
asserts `body.render.stages` has the expected shape (all seven keys, correct
null pattern for partial captures). Delegate to test-minion for implementation.

---

### NIT: src/capture.js:488-500 -- `screenshotMs` understates cost when consent banner absent

In the success path:

```
screenshotBefore = await page.screenshot(...)   // before tConsent
const consent = await dismissCookieConsent(...)
const tConsent = Date.now()                      // checkpoint
if (dismissed) { screenshot = await page.screenshot(...) }
else           { screenshot = screenshotBefore }  // no I/O
const tScreenshot = Date.now()
```

`screenshotMs = tScreenshot - tConsent` measures only the conditional
after-consent screenshot. When no banner is found (the majority case),
`screenshot = screenshotBefore` is assignment-only and `screenshotMs` is
approximately 0ms. The actual screenshot cost is folded into `consentMs`.

This is not a runtime bug and the spec comment ("sum of non-null stages
approximates but does not exactly equal render.durationMs") provides partial
cover, but `screenshotMs: 0` in the no-banner case is misleading for
performance analysis.

FIX: Move the `screenshotBefore` capture to after the consent call, or
introduce a separate `screenshotBeforeMs` stage. Alternatively add a code
comment noting this known measurement artifact. No change required to ship.

---

## Security

No issues found. No new user-controlled input paths. No hardcoded secrets. No
injection vectors. All new code is `Date.now()` calls and object spreading over
data already in scope.

---

VERDICT: ADVISE
FINDINGS:
- [ADVISE] src/capture.js:232-235 -- `consentDurationMs` silently renamed to `consentMs` in `capture.success` log event; Coralogix queries keyed on the old name will silently break
  FIX: Document the rename and update Coralogix saved searches, or emit both fields for one release cycle
- [ADVISE] test/capture-retrieval.test.js:137, test/kv.test.js:318 -- no new tests assert stages shape or presence; toMatchObject changes are correct but stages is entirely untested
  FIX: Add a stages-bearing fixture and assert all seven keys are present with correct null pattern for partial vs full captures
- [NIT] src/capture.js:488-500 -- screenshotMs is ~0ms in the no-banner case because screenshotBefore cost is folded into consentMs; misleading for perf analysis
  FIX: Add a code comment noting this measurement artifact, or restructure screenshot timing to include screenshotBefore in screenshotMs
