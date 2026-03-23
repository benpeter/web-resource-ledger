You are frontend-minion. Implement the new frontend views and auth refactoring for WRL self-serve OAuth.

## Context
Read ALL existing UI files to understand patterns:
- `src/ui/ui-shell.js` -- HTML template assembly, how JS/CSS modules are inlined
- `src/ui/ui-auth.js` -- current auth gate, `bootApp()`, `apiFetch()`, `renderAuthGate()`, `renderAppShell()`
- `src/ui/ui-css.js` -- CSS module
- `src/ui/ui-submit.js` -- submit view pattern (render + mount)
- `src/ui/ui-detail.js` -- detail view pattern
- `src/ui/ui-poll.js` -- polling pattern
- `src/design-system.js` -- design system tokens (IMPORTANT: use these tokens for all colors)

The UI is vanilla JS with no framework. Each view exports a JS string constant that gets inlined into the HTML template. Views use a DOM construction pattern with render (return HTML string) and mount (attach event listeners) phases.

## New Files to Create

**`src/ui/ui-login.js`** -- Login screen:
- Exports `LOGIN_JS` string constant
- "Sign in with GitHub" as `<a href="/auth/login">` (not a button -- it navigates)
- GitHub mark SVG inlined (the Octicon mark, minimal ~200 bytes)
- `.btn--github` styling: use design system tokens, NOT hardcoded hex like #24292e. Use `var(--color-text-inverse)` for text, `var(--color-bg-inverse)` for background (or similar tokens from design-system.js).
- "Already have an API key?" section visible (not collapsed), visually subordinate
- The API key input reuses the current `renderAuthGate` pattern (password input + Connect button)
- Functions: `renderLogin()`, `mountLogin()`

**`src/ui/ui-welcome.js`** -- First-key display:
- Exports `WELCOME_JS` string constant
- Calls `GET /v1/account/first-key` on mount
- Displays key in read-only `<input type="text">` (easier to select than `<pre>`)
- "Copy" button using `navigator.clipboard.writeText()` with fallback to `document.execCommand('copy')`
- Copy button: use a persistent `aria-label="Copy API key"` at all times. When copied, change text to "Copied!" and update aria-label to "Copied to clipboard". After 2 seconds, revert text but keep the base aria-label.
- `aria-live="polite"` region announces copy action to screen readers
- Warning styled as caution alert using design system `--color-warning-bg` token
- Warning text: "Your API key will only be shown once. Copy it now."
- "Continue to Dashboard" button calls `POST /v1/account/first-key/ack` then navigates to `#/captures`
- No navigation chrome on this screen -- full focus on the key
- If first-key endpoint returns 404, show message: "No pending key. You can create new keys in Account settings." with link to #/settings
- Functions: `renderWelcome()`, `mountWelcome()`
- Set `document.title = 'Your API Key — WRL'` on mount

**`src/ui/ui-tos.js`** -- ToS acceptance gate:
- Exports `TOS_JS` string constant
- Shown when `GET /auth/session` returns `tosAcceptedAt: null`
- Checkbox (unchecked by default): "I agree to the Terms of Service and Content Policy"
- "Terms of Service" and "Content Policy" are links opening in new tabs
- "Accept" button: use `aria-disabled="true"` (NOT the HTML `disabled` attribute) when checkbox is unchecked. This allows screen readers to discover the button and understand why it's inactive. Set `tabindex="0"` so it remains keyboard-focusable.
- "Cancel" button clears session (POST /auth/logout) and returns to login
- On accept: POST /v1/account/tos with tosVersion "2026-03-23", then check for `?flow=welcome` and redirect accordingly
- Focus management: after mount, move focus to the checkbox so keyboard users immediately know what action is needed
- Set `document.title = 'Terms of Service — WRL'` on mount
- Functions: `renderTos()`, `mountTos()`

**`src/ui/ui-settings.js`** -- Account settings (API key management):
- Exports `SETTINGS_JS` string constant
- Section: Account info (read-only): GitHub username, tenant ID, member since
- Section: API Keys with limit indicator ("2 of 5 keys")
- Key list using `.table` component: name, created date, scopes badges, [Revoke] button
- "Create new key" button opens inline form: name input + scope checkboxes (capture, read) + Create button
- After creating: show raw key inline with copy-to-clipboard (same pattern as welcome)
- Revoke: inline confirmation ("Revoke 'my-key'? This cannot be undone. [Cancel] [Confirm]")
- Last-key guard: if only 1 key, use `aria-disabled="true"` on Revoke button (NOT HTML `disabled`) with tooltip "Cannot revoke your only key". Keep button focusable for screen readers.
- Focus management: after revoke confirmation appears, move focus to the Cancel button. After key creation, move focus to the copy button.
- Functions: `renderSettings()`, `mountSettings()`

## Modifications to Existing Files

**`src/ui/ui-auth.js`** -- Major refactor:

1. `bootApp()` changes:
   - Show a loading indicator immediately (prevent flash of wrong content)
   - Call `GET /auth/session` (with `credentials: 'same-origin'`)
   - If `{ authenticated: true }`: set `_authMethod = 'session'`, store user context
     - If `tosAcceptedAt` is null: render ToS gate
     - If URL has `?flow=welcome`: render welcome view
     - Else: render app shell
   - If `{ authenticated: false }`: check sessionStorage for API key
     - If key present: validate with existing flow, set `_authMethod = 'apikey'`
     - If no key: render login screen (not old auth gate)
   - The loading state should be brief -- just a spinner or "Loading..." text

2. `apiFetch()` changes:
   - If `_authMethod === 'session'`:
     - Set `credentials: 'same-origin'` (sends cookie automatically)
     - Do NOT add Authorization header
     - Add `X-WRL-CSRF: 1` header on POST and DELETE requests
   - If `_authMethod === 'apikey'`:
     - Current behavior (Bearer header from sessionStorage)
   - On 401 response:
     - Session auth: redirect to login screen (session expired)
     - API key auth: clear sessionStorage, render auth gate (current behavior)

3. `renderAppShell()` changes:
   - Session auth users: nav shows "Captures | Settings | {username} | Sign out"
   - API key auth users: nav shows "Captures | Disconnect" (unchanged)
   - "Sign out" calls POST /auth/logout (with X-WRL-CSRF header), then renders login screen

4. Hash router additions:
   - `#/settings` -> renderSettings() + mountSettings()
   - Handle `?flow=welcome` query param on initial boot

**`src/ui/ui-shell.js`** -- Import new JS modules:
- Import `LOGIN_JS`, `WELCOME_JS`, `TOS_JS`, `SETTINGS_JS`
- Inline them in the HTML template (same pattern as existing modules)

**`src/ui/ui-css.js`** -- New styles:
- `.btn--github` -- use design system tokens for colors (NOT hardcoded hex values)
- `.login-divider` -- "Already have an API key?" separator
- `.welcome-key` -- monospace key display, high visual weight
- `.welcome-warning` -- caution alert styling (uses `--color-warning-bg` token)
- `.tos-gate` -- full-screen gate layout
- `.settings-keys` -- key list table styles
- `.settings-create` -- inline create form styles
- `.settings-confirm` -- inline revocation confirmation
- `.copied-feedback` -- "Copied!" button state
- `.scope-badge` -- small badge for scope display
- `.loading-spinner` -- boot loading indicator
- All responsive, all using design system tokens (not hardcoded hex), all reduced-motion safe

## Copy-to-Clipboard Pattern
Create a reusable function:
```js
function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(function() {
    var original = button.textContent;
    button.textContent = 'Copied!';
    button.setAttribute('aria-label', 'Copied to clipboard');
    setTimeout(function() {
      button.textContent = original;
      button.setAttribute('aria-label', 'Copy API key');
    }, 2000);
  }).catch(function() {
    // Fallback: select the input text
    var input = button.previousElementSibling;
    if (input && input.select) { input.select(); }
  });
}
```

## Error Handling
- OAuth errors arrive as query params: `/ui?error=...`
- Parse on boot: if `error` param present, show error message on login screen
- Error messages MUST use a closed allowlist constant -- never display raw query param values:
  ```js
  var ERROR_MESSAGES = {
    denied: 'GitHub authorization was cancelled.',
    missing_params: 'Sign-in failed. Please try again.',
    invalid_state: 'Sign-in failed. Please try again.',
    token_exchange_failed: 'Sign-in failed. Please try again.',
    github_api_error: 'Connection to GitHub failed. Please try again.'
  };
  ```
- Unknown error codes get a safe default: 'Something went wrong. Please try again.'
- All error display MUST use `element.textContent = msg` (never innerHTML or dynamic HTML property)
- Every error shows a "Try again" link pointing to `/auth/login`

## Key Constraints
- Vanilla JS only -- no frameworks, no build step
- All JS is inlined in the HTML template (string constants)
- Follow existing DOM construction patterns exactly
- CSP is `script-src 'unsafe-inline'` -- inline JS works
- The "Sign in with GitHub" button is an `<a>` tag, not a form (CSP `form-action 'none'` is set)
- `credentials: 'same-origin'` for cookie-based requests (same origin)
- Use design system tokens for ALL colors -- never hardcode hex values

## Deliverables
- `src/ui/ui-login.js` (new)
- `src/ui/ui-welcome.js` (new)
- `src/ui/ui-tos.js` (new)
- `src/ui/ui-settings.js` (new)
- `src/ui/ui-auth.js` (modified)
- `src/ui/ui-shell.js` (modified)
- `src/ui/ui-css.js` (modified)

## What NOT to do
- Do NOT use any framework or library
- Do NOT use localStorage or persist raw keys
- Do NOT modify the CSP
- Do NOT add landing page CTAs (deferred)
- Do NOT create a full profile editing page (settings is keys only)
- Do NOT use a modal for revocation confirmation (use inline)
- Do NOT remove the existing API key auth path (it must continue working)
- Do NOT use hardcoded hex color values -- always use design system tokens
- Do NOT use HTML `disabled` attribute on interactive elements that should be discoverable by screen readers -- use `aria-disabled="true"` instead
