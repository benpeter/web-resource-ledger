## Accessibility Review: OpenAPI Spec and Security Hardening

**Verdict: ADVISE**

---

### Findings

- [accessibility]: The new public key anchor will be rendered inside `.crypto-value` but no `:focus-visible` rule is scoped to `.crypto-value a`, leaving it relying on the browser default outline.
  SCOPE: `src/verify-page.js` — CSS block, `.crypto-value` selector
  CHANGE: Add `.crypto-value a:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; border-radius: 2px; }` alongside the existing `.meta-url a:focus-visible` and `.error-link a:focus-visible` rules.
  WHY: Every other interactive link on the page has an explicit focus-visible rule. Without it the public key anchor falls back to browser-default focus styling, which varies across browsers and may not meet WCAG 2.2 SC 2.4.13 Focus Appearance (AA) — specifically the minimum area and contrast requirements. Inconsistency within a single page is also a confusing regression from the existing pattern.
  TASK: Task 3

- [accessibility]: The plan's Task 3 prompt states "link text should be the full URL" but does not specify an accessible name strategy if the URL is very long or ambiguous in screen reader context.
  SCOPE: `src/verify-page.js` — `populate` function, public key anchor construction
  CHANGE: No change required to the link text itself (a full absolute URL is a self-describing accessible name and is appropriate here). Confirm via implementation that `textContent` is set to the full URL — this is already specified in the plan and is correct. No additional aria-label is needed.
  WHY: Full URL as link text is acceptable per WCAG SC 2.4.6 Headings and Labels and SC 4.1.2 Name, Role, Value. The context (crypto details section, "Public key" label row) provides sufficient surrounding context. This is an informational note only — no change needed.
  TASK: Task 3

---

### Non-issues Verified

- **Keyboard navigability**: The anchor will be a native `<a>` element with an `href`, so it is natively focusable and keyboard-operable. No ARIA intervention required. WCAG SC 2.1.1 Keyboard satisfied.
- **`<details>` focus obscuring**: The crypto details section is a non-sticky inline element. When expanded, the public key row is fully visible in the scroll flow. WCAG 2.4.11 Focus Not Obscured (Minimum) is satisfied.
- **Accessible name computation**: The anchor's `textContent` is set to the full URL string via DOM manipulation (not innerHTML). This yields a non-empty accessible name. WCAG SC 4.1.2 satisfied.
- **DOM manipulation pattern**: The plan specifies `createElement` + `href` + `textContent` — this is consistent with the page's existing security pattern for constructing links from data. No XSS risk introduced.
- **Screen reader context**: The link lives inside a `<details>` element that is collapsed by default. Screen readers will announce the `<summary>` as a button-like control, and the content is only reachable after the user expands it. This is correct behavior and no additional ARIA is needed.

---

### Summary

One actionable change needed: add `.crypto-value a:focus-visible` to the CSS. This is a one-line addition to the existing pattern already used by `.meta-url a` and `.error-link a`. Task 3's implementor should add it alongside the link insertion.
