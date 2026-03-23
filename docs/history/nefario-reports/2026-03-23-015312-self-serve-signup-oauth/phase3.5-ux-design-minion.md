# UX Design Review: Self-Serve Signup via GitHub OAuth

**Verdict: ADVISE**

The plan is structurally sound and well-considered. The core approach -- GitHub OAuth as primary CTA, dedicated welcome screen for first-key display, inline confirmation for revocation, ToS gate -- is the right set of decisions. Several issues need addressing before frontend-minion executes, and one point needs a spec clarification added to Task 7.

---

## What the plan gets right

**Dual-path login layout.** Making "Sign in with GitHub" the primary CTA while keeping the API key input visible (not collapsed) is the correct call. Operator users should not need to discover a hidden path. Visual subordination via layout hierarchy is the right technique -- the plan specifies this without prescribing the exact visual treatment, which is correct.

**First-key as a dedicated screen.** Passing the raw key in a redirect URL is correctly rejected. The KV-backed `/v1/account/first-key` pattern with the 1-hour TTL and explicit ack call gives the user multiple opportunities to copy without exposing the key in browser history or server logs. The `read-only <input type="text">` is better than `<pre>` for clipboard selection -- good call.

**Inline revocation confirmation.** The plan explicitly prohibits a modal for revocation confirmation ("Do NOT use a modal for revocation confirmation -- use inline"). This is correct. Modals interrupt focus flow and require return-focus management; inline confirmation keeps the user's attention on the row they're acting on.

**No-nav-chrome on the welcome screen.** Full focus on key copy before any navigation distraction is the right approach for a "shown once" credential.

**ToS gate architecture.** Creating the `github_users` record with `tos_accepted_at = NULL` and blocking access in the UI (rather than passing ghid in the URL) avoids exposing GitHub identity in browser history. The single checkbox with an enabled-on-check "Accept" button is minimal friction while being explicit consent.

**`aria-live="polite"` for clipboard feedback.** This is called out in the spec. Screen readers will announce "Copied!" without jarring the user mid-context.

---

## Issues requiring spec changes in Task 7

### 1. `.btn--github` hardcodes a hex value -- violates the CSS conventions file

**In the plan (ui-css.js section):**
> `.btn--github` -- dark background (#24292e), white text, GitHub mark alignment

**In the existing `ui-css.js` file header (line 2):**
> "Uses design system tokens exclusively -- no hardcoded hex values."

The plan must add a design token for the GitHub button color. The correct approach is to add `--color-github-bg: #24292e` and `--color-github-text: #ffffff` to the `:root` block in `design-system.js`/`design-system.css`, then reference them in `.btn--github`. This keeps the "no hardcoded hex in ui-css.js" invariant intact.

**Required addition to Task 7 prompt:** Add to the ui-css.js instructions: "Add `--color-github-bg: #24292e` and `--color-github-text: #ffffff` to the design system token block in design-system.js. Reference these tokens in `.btn--github` -- do not hardcode the hex value directly in ui-css.js."

---

### 2. `aria-label` churn on the copy button creates a screen reader announcement conflict

**In the plan (copyToClipboard function):**
```js
button.setAttribute('aria-label', 'Copied to clipboard');
setTimeout(function() {
  button.textContent = original;
  button.removeAttribute('aria-label');
}, 2000);
```

Setting `aria-label` while also changing `textContent` means the button's accessible name changes twice in 2 seconds. Most screen readers will not announce `aria-label` changes on a button unless focus is on it; the `aria-live` region is what actually announces the action to users not focused on the button. The `aria-label` change is therefore redundant and potentially noisy. Drop it -- keep only the `textContent` change and the `aria-live` region announcement.

**Required change to Task 7 prompt:** Remove the `button.setAttribute('aria-label', 'Copied to clipboard')` and `button.removeAttribute('aria-label')` lines from the `copyToClipboard` function spec. The `aria-live="polite"` region already handles screen reader announcement. If the frontend-minion wants a visually hidden announcement, it belongs in the `aria-live` region, not on the button's `aria-label`.

---

### 3. Disabled "Revoke" button for the last key needs a keyboard-accessible alternative

**In the plan:**
> Last-key guard: if only 1 key, disable Revoke button with tooltip "Cannot revoke your only key"

A `disabled` attribute makes the button unfocusable. A tooltip on a disabled element is not keyboard-reachable. Screen reader users and keyboard-only users will not know why they cannot revoke. The existing design system has no tooltip component.

**Required change to Task 7 prompt:** Replace the disabled+tooltip approach with: render the Revoke button as `aria-disabled="true"` (not `disabled`), keep it focusable, and on click/Enter show an inline message (using the `.alert--warning` pattern already in the design system): "This is your only API key. Create a new key before revoking this one." This is consistent with the 409 error the API returns and does not require a tooltip component.

---

### 4. The `input` for the account info section needs explicit label associations

**In the plan (ui-settings.js section):**
> Section: Account info (read-only): GitHub username, tenant ID, member since

The plan describes these as read-only display fields but does not specify the markup pattern. If these are rendered as plain `<input readonly>` elements (reasonable for copy-ability of tenant ID), each needs an explicit associated `<label>` element, not just `aria-label` or placeholder text. The existing `ui-auth.js` uses `aria-label` on the password input (line 84), which is acceptable for a single isolated input but not for a form section with multiple fields.

**Required clarification to Task 7 prompt:** For the account info section, specify: "Use a `<dl>` (definition list) with `<dt>` for labels and `<dd>` for values. For any copyable value (e.g., tenant ID), render it as plain text inside `<dd>` alongside a copy icon button with `aria-label='Copy tenant ID'`. Do not use `<input readonly>` for display-only values unless the user needs to select and copy them -- in that case use `role='textbox' aria-readonly='true'` or a proper labeled input."

---

### 5. Boot loading state needs a concrete implementation note

**In the plan (ui-auth.js section):**
> Show a loading state during boot checks (prevent flash)

The plan identifies the problem (FOUC when `bootApp()` calls `GET /auth/session` before deciding which view to render) but does not specify the implementation. The existing `bootApp()` currently checks `sessionStorage` synchronously -- no loading state needed. The new flow makes an async API call. Without a concrete spec, the frontend-minion might render nothing, flash a blank screen, or show the old auth gate briefly.

**Required addition to Task 7 prompt:** "During boot, before the `GET /auth/session` call resolves, render a minimal loading state: clear `#app`, append a `<div class='auth-gate'><p class='text-muted' aria-live='polite'>Loading...</p></div>`. This prevents FOUC without requiring a skeleton screen component. Replace it with the appropriate view once the session check resolves."

---

## Minor observations (no spec changes required)

**Error message mapping.** The plan maps `error=denied` to "GitHub authorization was cancelled." This is good -- plain language, no technical codes. The generic fallback "Sign-in failed. Please try again." is correct. One addition worth noting: if the frontend-minion doesn't handle an unknown `error` param value, it should fall through to the generic message, not silently ignore the param. The spec implies this but does not state it explicitly.

**Nav username display.** The plan specifies: "nav shows 'Captures | Settings | {username} | Sign out'" for session-auth users. The `{username}` should be rendered as plain text (not a link) since there is no profile page (out of scope). The frontend-minion should not improvise a link here.

**`.scope-badge` vs existing `.badge`.** The design system already has `.badge`, `.badge--pass`, `.badge--fail`, `.badge--skip`. The plan introduces `.scope-badge` as a new class. The frontend-minion should use `.badge` with a neutral variant rather than introducing a new class. If a neutral/default badge variant is needed, add `.badge--neutral` to the design system rather than a parallel `.scope-badge` class. This avoids token drift.

---

## Summary for Task 7 prompt additions

Four concrete changes needed before execution:

1. Add `--color-github-bg` and `--color-github-text` tokens to design-system.js; reference them in `.btn--github` instead of hardcoding hex.
2. Remove `aria-label` manipulation from `copyToClipboard` -- rely on `aria-live` region only.
3. Replace disabled+tooltip on last-key Revoke button with `aria-disabled="true"` plus inline `.alert--warning` message.
4. Add a concrete boot loading state spec (render minimal auth-gate loading placeholder before session check resolves).

These are spec additions to Task 7, not blockers to Tasks 1-6. Execution can proceed in parallel; Task 7 should incorporate these changes before frontend-minion begins.
