ADVISE

---

[security]: page.evaluate() executes in the target page's browser context, which means a malicious page can attempt prototype pollution or throw unexpected exceptions from within the evaluated closure. The current plan mitigates this only with `.catch(() => 'unknown')`. This is sufficient to prevent hangs but does NOT sanitize the return value. If `document.readyState` is somehow tampered with by a service worker or page script to return a non-string value (e.g., an object), the `=== 'interactive'` and `=== 'complete'` comparisons still behave correctly in JavaScript (no match → re-throw navError). No code change needed here, but the behavior is correct for the right reason — the reviewer should be aware that the safety comes from strict equality, not from sanitization.

SCOPE: `src/capture.js` — partial path `readyState` check
CHANGE: No code change required. Confirm that `page.evaluate(() => document.readyState)` return value is only ever compared with `===` to trusted string literals, never used in string interpolation, HTML output, or further evaluated. The `.catch(() => 'unknown')` fallback ensures no hang.
WHY: page.evaluate() runs JavaScript in the renderer context; malicious pages could theoretically influence its return value. Strict equality comparison prevents exploitation.
TASK: Task 1 (iac-minion) — document in code comment that readyState is compared strictly, not used further.

---

[security]: The `categorizeError` new case checks `msg.includes('Deadline exceeded')`. This is a server-generated string (thrown by the renderer itself), so there is no external input injection risk here. However, confirm that no user-controlled input can reach `categorizeError` with a crafted message containing "Deadline exceeded" to force a misleading error classification. Tracing the call chain: `performCapture` catches the renderer's thrown error and passes it to `categorizeError` — the renderer is internal. No user input flows through. No change needed, but placement as the FIRST check in categorizeError is the correct defensive ordering (before the broad timeout catch).

SCOPE: `src/capture.js` — `categorizeError`
CHANGE: No code change needed. Confirm in review that the error passed to `categorizeError` originates only from the renderer (internal), not from any user-supplied value.
WHY: If a future code path passes user-derived strings through categorizeError, 'Deadline exceeded' matching could be gamed. Document the assumption.
TASK: Task 1 (iac-minion) — add a brief comment to categorizeError noting that error messages are expected to be renderer-internal strings, not user input.

---

[security]: The synthesis plan correctly states `renderQuality` is server-controlled. Confirmed: the field is set as `const renderQuality = partial ? 'partial' : 'full'` from the renderer's boolean `partial` flag, which is never derived from the captured URL or page content. No user input reaches this field. This is clean.

SCOPE: `src/capture.js` — `performCapture`
CHANGE: None required.
WHY: Confirming the claim in the synthesis plan is correct — no injection risk.
TASK: n/a

---

[security]: The `render.waitUntilReached` field returned in the API response is derived from `readyState` — a value that page.evaluate() returns from the renderer's browser context. As noted above, the comparison produces one of three hard-coded strings: `'load'`, `'domcontentloaded'`, or `'networkidle'`. The return value is therefore NOT the raw readyState string — it is a controlled value selected by the conditional expression:

```js
waitUntilReached: readyState === 'complete' ? 'load' : 'domcontentloaded'
```

No taint from page content reaches the API response. This is correct and safe.

SCOPE: `src/capture.js` — partial path return shape
CHANGE: None required. The ternary ensures only controlled string literals enter the KV record and API response.
WHY: LLM output (or externally-influenced data) flowing into API responses unsanitized is a known vector. This is handled correctly.
TASK: n/a

---

[security]: The partial capture path throws `new Error('Deadline exceeded before partial capture could complete')` for all sub-errors. This means if `page.content()` throws an error with an informative internal message (e.g., a Playwright CDP message with internal URL paths), that error is caught and REPLACED with the controlled string before re-throwing. This is the correct pattern and keeps categorizeError safe. Verify in Task 1 that the Promise.race rejection and screenshot timeout both result in the renderer's controlled throw, not a passthrough of the original Playwright error.

SCOPE: `src/capture.js` — partial path error handling
CHANGE: Verify (in implementation) that the catch block on the partial path wraps ALL sub-errors in the controlled message before re-throwing. Do not let `throw originalError` escape on the partial path.
WHY: Playwright errors can contain internal metadata that should not leak through categorizeError into the API response.
TASK: Task 1 (iac-minion) — ensure catch block re-throws with the controlled message string, not the original error.

---

Overall verdict: ADVISE. No blocking issues. The plan is correctly scoped and the existing security boundaries (context isolation, categorizeError, server-controlled renderQuality) are preserved. The advisories are confirmatory and one actionable implementation note (final item above: verify error wrapping on partial path sub-errors).
