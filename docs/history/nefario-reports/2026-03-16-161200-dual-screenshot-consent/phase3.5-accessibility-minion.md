## accessibility-minion verdict: ADVISE

The plan is largely sound for accessibility. The existing verify-page.js already handles focus styles correctly (`focus-visible` outlines on all interactive elements), uses `aria-hidden="true"` on decorative SVGs, and follows safe DOM patterns. The new elements are well-specified. Two issues need explicit guidance in Task 3 to avoid common implementation mistakes.

---

### Issue 1: `<details>` inside `<section>` needs explicit focus style

**Risk**: Medium

The Task 3 prompt places a `<details><summary>` element inside the screenshot `<section>`. The existing CSS rule for `summary:focus-visible` is scoped to the top-level `details { padding: 1.5rem 2rem; border-top: 1px solid #e8e8e8; }` pattern. A nested `<details>` inside a `<section>` will inherit the `summary:focus-visible` rule, so focus styling should carry over correctly. However, the prompt notes "maybe no extra padding, inherit from section" for inner details padding -- frontend-minion should confirm the nested details does not inadvertently suppress the `border-top: 1px solid #e8e8e8` from the outer `details` selector, and that the `summary:focus-visible { outline: 2px solid #1a1a1a }` rule still applies (it will, as it is not element-scoped). **No code change needed, but frontend-minion should verify the nested selector behavior during implementation.**

---

### Issue 2: `<details>` summary text for before-screenshot disclosure must be descriptive

**Risk**: Medium

The plan specifies the `<summary>` text as "Before consent dismissal". For screen reader users who navigate by interactive elements or use the accessibility tree, the summary must be unique and descriptive enough to understand without surrounding context. "Before consent dismissal" is acceptable but could be clearer.

**Recommendation**: Use "Show screenshot before consent dismissal" as the summary text. This follows the convention that `<summary>` should describe the action of expanding, not just label the content, and it is unambiguous when encountered in isolation by a screen reader.

WCAG reference: SC 2.4.6 Headings and Labels (AA) -- labels describe topic or purpose.

---

### Issue 3: Consent check `detail` field population

**Risk**: Low

The existing `renderChecks()` in verify-page.js emits `<div class="check-detail" data-check-detail="{name}"></div>` and then populates it in `populate()` via:

```js
checks.forEach(function (c) {
  if (c.detail) {
    var detailEl = document.querySelector('[data-check-detail="' + c.name + '"]');
    if (detailEl) detailEl.textContent = c.detail;
  }
});
```

The new consent check is appended to `checks` inside `buildResult()` -- but `populate()` runs its `checks.forEach` loop over `verifyData.checks`, not the augmented array. The `consentHandling` detail (`'Detected: Cookiebot'` or `'A consent banner was detected but could not be dismissed.'`) will never be populated because the `querySelector('[data-check-detail="consentHandling"]')` call happens, but the `checks.forEach` only iterates the original `verifyData.checks` array, not the extended one that includes the consent check.

**Fix**: In `populate()`, derive the full checks array the same way `buildResult()` does (or pass the augmented array through). The simplest approach is to build the augmented checks array once in a shared helper and use it in both `buildResult()` and the populate loop:

```js
function buildChecks(verifyData) {
  var checks = verifyData.checks || [];
  var captureSettings = verifyData.captureSettings;
  if (captureSettings && captureSettings.consent) {
    var consentResult = captureSettings.consent.result;
    if (consentResult === 'success') {
      checks = checks.concat([{ name: 'consentHandling', status: 'pass',
        detail: captureSettings.consent.cmpDetected ? 'Detected: ' + captureSettings.consent.cmpDetected : null }]);
    } else if (consentResult === 'failed') {
      checks = checks.concat([{ name: 'consentHandling', status: 'skip',
        detail: 'A consent banner was detected but could not be dismissed.' }]);
    }
  }
  return checks;
}
```

Without this fix, the CMP name detail ("Detected: Cookiebot") would silently not render, making the check row less informative for all users including screen reader users reading the `.check-detail` text.

WCAG reference: SC 1.3.1 Info and Relationships (A) -- information conveyed visually must be programmatically determinable. The detail text is an intended visual element; if it silently fails to populate, it violates this criterion.

---

### Confirmed correct in the plan

- **Alt text differentiation** (Issue 4 in scope): The plan's alt text scheme is correct. "Screenshot of {url} captured on {date}, after cookie consent dismissal" for the primary and "...showing original cookie consent banner" for the before-screenshot accurately distinguish the two images for screen readers. This is proper use of WCAG SC 1.1.1 (A).
- **aria-hidden on SVG icons**: Existing pattern is correct and should be maintained for the new check row.
- **`.sr-only` for check status**: Existing `<span class="sr-only">{status}:</span>` pattern in `renderChecks()` correctly announces pass/skip/fail state to screen readers before the label. The consent check uses the same code path, so this is automatically correct.
- **`<details>/<summary>` semantics**: Native HTML disclosure widgets are keyboard accessible (Enter/Space to toggle) and announced correctly by all major screen readers. No ARIA enhancement needed -- this is the right call per ARIA rule 1.
- **`aria-live="polite"` on result container**: The existing `<div id="result" aria-live="polite">` will announce the new content (including consent check and screenshot sections) when `populate()` fires. No additional live region needed.
- **Focus not obscured (WCAG 2.4.11/2.4.12)**: The page has no sticky headers or overlapping author-created content that would obscure focus.

---

### Summary

Three items require frontend-minion attention:

1. **Verify** nested `<details>` inherits `summary:focus-visible` correctly (low implementation risk, verify during implementation).
2. **Change** summary text to "Show screenshot before consent dismissal" for clearer out-of-context announcement.
3. **Fix** `populate()` to iterate the augmented checks array (not just `verifyData.checks`) so the CMP name detail renders correctly.

None of these block the approach -- they are implementation-level corrections to embed in the Task 3 prompt or catch in Phase 5 review.
