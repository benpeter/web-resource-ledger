## Code Review: cmp-navigation -- cross-domain navigation block narrowed to main-frame

### Summary

The change relaxes the cross-origin navigation block from "all navigation requests"
to "main-frame navigation requests only". The motivation is CMP consent iframes that
navigate cross-origin. The implementation uses a closure-captured `page` variable
(initially `null`) to defer main-frame detection until after `context.newPage()`.

The change is logically sound but has one correctness gap and one test gap that
should be addressed before merge.

---

### Findings

- [ADVISE] src/capture.js:376-382 -- Silent `catch` on `frame()` swallows unexpected
  errors and makes debugging harder. The comment says "frame() throws for pre-creation
  requests" -- this is a real, named condition. The catch is intentional and bounded,
  but the project's engineering philosophy (CLAUDE.md: "Fail loudly, degrade
  intentionally -- silent `catch {}` blocks are forbidden. Every catch must either log
  the error or handle a specific, named error type") requires the error to be logged or
  the catch to name the specific error type it expects.

  FIX: Log the error at debug level, or add a comment naming the specific Playwright
  error type/message expected here so the intent is explicit and auditable. For example:

  ```js
  } catch (err) {
    // frame() throws with "Target closed" or similar for pre-creation requests
    // Treat as non-main-frame (safe: aborts only if main-frame, so false-negative is harmless)
    log('debug', { msg: 'frame() threw during route handler (pre-creation)', err: err.message });
  }
  ```

  The current handling is not dangerous -- the false-negative (treating a main-frame
  request as non-main-frame) means the TOCTOU block is skipped, not that a malicious
  request gets through. But the silent swallow is a project rule violation.

- [ADVISE] src/capture.js:376-382 -- The `page === null` guard (outer `if (page)`)
  means all cross-origin navigation requests that arrive before `context.newPage()`
  returns are silently allowed through, including main-frame navigations. In practice
  this window is tiny (the route handler is registered, then `newPage()` is called
  immediately), but it is a real gap: if a page can trigger a navigation request before
  the page reference is assigned, that request bypasses the block entirely.

  FIX: Confirm (in a code comment) whether Playwright can fire navigation requests on
  a context before `newPage()` returns. If not, document this assumption explicitly so
  future readers understand why the `page === null` case is safe. If uncertain, consider
  defaulting `isMainFrame = true` when `page === null` (blocking all cross-origin
  navigation until the page is created, which is the previous behavior for that window):

  ```js
  // page is null only in the brief window between route() and newPage().
  // Default to blocking (treat as main-frame) to preserve prior behavior
  // during that window.
  let isMainFrame = page === null ? true : false;
  if (page) {
    // ... frame() check
  }
  ```

- [ADVISE] test/capture.test.js -- No tests cover the cross-origin navigation block
  at all (neither the old behavior nor the new). The narrowing from "all frames" to
  "main-frame only" is a security-relevant behavioral change and the test suite has
  zero coverage for it. The security comment in the file correctly names this as a
  TOCTOU mitigation -- that makes test coverage more important, not less.

  FIX: Add unit tests for the route handler logic:
  1. Cross-origin navigation on main-frame: must be aborted.
  2. Cross-origin navigation on sub-frame (iframe): must be allowed.
  3. Same-origin navigation on main-frame: must not be aborted by this check.
  4. Cross-origin navigation before `page` is assigned (pre-creation window):
     verify expected behavior matches the documented intent.

  These can be tested with mocked Playwright `route` and `request` objects without
  a real browser.

---

### Security Assessment

The accepted-gap comment in the module header is accurate and honest:
iframe cross-origin navigation is now explicitly allowed and bounded by
same-origin policy and MAX_SUBRESOURCES. The change does not introduce new
injection vectors or weaken the main-frame TOCTOU guard in the steady state.
The `page === null` window described above is worth documenting but is not
an exploitable gap in practice given the synchronous setup sequence.

No hardcoded secrets. No injection vectors introduced.

---

VERDICT: ADVISE
FINDINGS:
- [ADVISE] src/capture.js:378-382 -- Silent catch swallows frame() errors without logging or naming the expected error type, violating the project's "fail loudly" rule.
  FIX: Log err.message at debug level inside the catch, or add a comment naming the specific Playwright error type expected.
- [ADVISE] src/capture.js:376-387 -- When page === null (pre-creation window), all cross-origin navigation is silently allowed, including potential main-frame navigations. Intent is undocumented.
  FIX: Either document why pre-creation navigation cannot be main-frame in Playwright, or default isMainFrame = true when page === null to preserve the previous blocking behavior during that window.
- [ADVISE] test/capture.test.js -- Zero test coverage for the cross-origin navigation block (old or new behavior). This is a security-relevant change with no regression protection.
  FIX: Add unit tests for main-frame block, sub-frame allow, same-origin allow, and pre-creation window behavior.
