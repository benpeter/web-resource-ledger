# Accessibility Review -- Self-Serve Signup via GitHub OAuth

**Verdict: ADVISE**

The plan has solid accessibility foundations in several areas but contains three specification gaps that will produce WCAG violations if not addressed before frontend-minion implements Task 7. These are fixable with prompt amendments; no architectural changes are required.

---

## What the Plan Gets Right

**Copy-to-clipboard pattern (welcome view and settings):** The plan specifies an `aria-live="polite"` region to announce copy actions. The `copyToClipboard` function in Task 7 correctly updates `aria-label` on the button to "Copied to clipboard" and reverts it after 2 seconds. This is the correct pattern.

**Error announcements:** The login screen error pattern uses `role="alert"` and `aria-live="polite"` consistent with the existing `renderAuthGate()` pattern in `ui-auth.js`. OAuth errors arriving as query params at boot also have defined messages and a "Try again" link.

**GitHub sign-in as `<a>` not `<button>`:** Correct call. A navigation link that initiates a server redirect should be an anchor element. Screen readers will announce it as a link, which accurately conveys the behavior (leaving the page). Using `<button>` here would be semantically wrong.

**ToS checkbox gating the Accept button:** Plan specifies the Accept button is disabled until the checkbox is checked. This is the correct pattern -- it avoids an error-after-submit cycle for a single required acknowledgment.

**Existing code baseline is strong:** `ui-auth.js` and `ui-submit.js` already demonstrate correct patterns: `role="alert"` + `aria-live` on error containers, `aria-label` on unlabeled inputs, landmark roles on nav, `h1.focus()` on view transitions, `aria-live="polite"` + `aria-atomic="true"` for status announcements. The new views should inherit these patterns.

---

## Issues Requiring Resolution

### Issue 1: Copy button has no accessible name when the key input is absent (WCAG 2.4.6, 4.1.2 -- Level AA)

**Where:** Task 7, `copyToClipboard()` function; welcome view and settings inline key display.

**Problem:** The `copyToClipboard` function's clipboard fallback path reads `button.previousElementSibling` to select the input text, but the button's accessible name is computed only from its `textContent` ("Copy"). That works while the text says "Copy" or "Copied!", but the plan's welcome view wraps the key in a read-only `<input type="text">`. A read-only input has no associated `<label>` in the spec -- only `aria-label` on the input. The Copy button's relationship to that specific input is conveyed only visually (adjacency). Screen readers will announce the button as "Copy, button" with no indication of what is being copied.

**Fix -- amend Task 7 prompt:** The Copy button must carry a descriptive `aria-label` at all times, not just during the "Copied!" state. Set `aria-label="Copy API key to clipboard"` on the button at creation time. Keep the 2-second state change to "Copied to clipboard". After revert, restore the original label. The pattern becomes:

```js
button.setAttribute('aria-label', 'Copy API key to clipboard');
// on success:
button.textContent = 'Copied!';
button.setAttribute('aria-label', 'Copied to clipboard');
// after timeout:
button.textContent = 'Copy';
button.setAttribute('aria-label', 'Copy API key to clipboard');
```

In the settings view where multiple keys may each have a Copy button, the label should include the key name: `'Copy key "' + keyName + '" to clipboard'`. This also disambiguates multiple "Copy" buttons for screen reader users navigating by button (WCAG 1.3.1, 2.4.6).

---

### Issue 2: Revoke confirmation inline pattern lacks focus management and announcement (WCAG 2.4.3, 4.1.3 -- Level AA)

**Where:** Task 7, `ui-settings.js` -- inline revocation confirmation ("Revoke 'my-key'? [Cancel] [Confirm]").

**Problem:** The plan specifies inline confirmation but does not specify:
1. Where focus goes when the confirmation UI is injected
2. Whether screen readers are informed that the confirmation appeared
3. Where focus returns after Cancel or Confirm

When the Revoke button is clicked and the inline confirmation replaces it (or appears adjacent), users relying on screen readers or keyboard navigation will not know the UI has changed unless focus is moved to it or the change is announced. The Cancel/Confirm buttons are unreachable unless the user happens to tab forward from the previous focused position.

**Fix -- amend Task 7 prompt:** After injecting the confirmation element:
- Move focus to the Confirm button (or a heading element within the confirmation if one exists)
- The confirmation container should include `role="group"` and `aria-labelledby` pointing to the confirmation text ("Revoke 'my-key'?")
- On Cancel: delete the confirmation element and return focus to the original Revoke button (store a ref before injection)
- On Confirm: after the revoke API call completes, move focus to the next logical element (the "Create new key" button, or the key count heading if no keys remain)
- Do NOT use `aria-live` alone as a substitute for focus management here -- this is an interactive confirmation flow, not a status announcement

---

### Issue 3: ToS gate has no page title update and missing focus management on Cancel (WCAG 2.4.2, 2.4.3 -- Level A/AA)

**Where:** Task 7, `ui-tos.js` -- ToS acceptance gate.

**Problem (a):** The plan does not specify updating `document.title` when the ToS gate renders. The existing codebase sets `document.title = 'Captures - Web Resource Ledger'` in `renderCaptures()`. The ToS gate is a full-screen blocking view; without a title update, the document title will remain whatever the previous view set, which disorients screen reader users who rely on the title to understand where they are.

**Problem (b):** When the user clicks Cancel, the plan specifies "POST /auth/logout, then returns to login screen." It does not specify focus placement after the view transition to the login screen. The existing `renderAuthGate()` pattern correctly calls `heading.focus()` -- the same must happen when rendering the login screen after logout.

**Fix -- amend Task 7 prompt:**
- In `renderTos()` / `mountTos()`: set `document.title = 'Terms of Service - Web Resource Ledger'` and move focus to the ToS gate heading (same `tabIndex = -1` + `.focus()` pattern used by `renderCaptures`)
- The Cancel handler already calls `renderLogin()` (or equivalent) -- ensure that function includes `heading.focus()` just as `renderAuthGate()` does. This is likely already handled if the login render follows the existing pattern, but the prompt should state it explicitly

---

## Lower-Priority Observations (ADVISE, not BLOCK)

**Last-key Revoke button tooltip:** The plan says "disable Revoke button with tooltip 'Cannot revoke your only key'". Tooltips shown only on hover are inaccessible to keyboard and screen reader users. The disabled state must communicate its reason to all users. Preferred pattern: add `aria-describedby` on the disabled button pointing to a visually-present hint text (can be `sr-only` if visual space is tight). Alternatively, show a static text note beneath the key row rather than a hover tooltip.

**Settings key table structure:** The plan uses `.table` component with name, created date, scopes badges, and Revoke button. If this renders as a CSS-styled `div` table (not `<table>`), ensure `role="table"`, `role="row"`, `role="columnheader"`, and `role="cell"` are applied. If these roles are omitted, screen reader users navigating by table will not identify the data structure. The spec does not clarify whether `.table` is a `<table>` element or a div-based layout -- frontend-minion should use `<table>` (native semantics are always preferred per ARIA Rule 1).

**Welcome view "Continue to Dashboard" button:** The plan does not specify what focus receives after this button triggers `POST .../ack` and navigates to `#/captures`. The existing `renderCaptures()` calls `h1.focus()` after rendering -- the router handling `#/captures` should ensure this path is taken. This is likely correct if the router reuses `renderCaptures()`, but worth confirming in the Task 7 prompt.

**Scope checkboxes in settings Create form:** The plan specifies "scope checkboxes (capture, read)". Checkboxes in a group must be wrapped in a `<fieldset>` with a `<legend>` ("Scopes") so screen readers announce the group context when entering the first checkbox. Without this, a screen reader user hears "Capture, checkbox" with no surrounding context.

**GitHub mark SVG in login button:** The plan specifies "GitHub mark SVG inlined (~200 bytes)". The SVG must include `aria-hidden="true"` so screen readers do not attempt to read the SVG path data. The accessible name of the link comes from its text content ("Sign in with GitHub"), not the icon. Missing `aria-hidden` on decorative SVG is a common WCAG 4.1.2 violation.

---

## Summary of Required Prompt Amendments (for frontend-minion Task 7)

1. **`copyToClipboard()` function:** Add persistent `aria-label="Copy API key to clipboard"` (or "Copy key '{name}' to clipboard" in settings) at construction time. Revert to the descriptive label (not remove it) after the 2-second "Copied!" state.

2. **Settings inline revocation confirmation:** Specify focus goes to the Confirm button on injection. Specify Cancel returns focus to the Revoke button. Specify Confirm success moves focus to a logical successor element. Wrap confirmation in `role="group"` with `aria-labelledby`.

3. **ToS gate:** Set `document.title = 'Terms of Service - Web Resource Ledger'`. Move focus to the gate heading on render using `tabIndex = -1` + `.focus()`.

None of these require architectural changes. They are implementation-level details that should be added to the Task 7 prompt before frontend-minion begins.
