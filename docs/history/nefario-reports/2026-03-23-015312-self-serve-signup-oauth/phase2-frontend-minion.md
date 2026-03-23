# Domain Plan Contribution: frontend-minion

## Recommendations

### 1. Auth Model: Dual-Path Coexistence with Cookie Priority

The UI currently stores an API key in `sessionStorage` and attaches it as a `Bearer` header on every `apiFetch()` call. With OAuth, the session cookie becomes the primary auth mechanism for browser users, but the "paste API key" path must remain as a fallback for operator-provisioned tenants who may not have GitHub accounts.

**Recommended approach**: `apiFetch()` becomes cookie-aware by default. When a session cookie is present (set by the server after OAuth callback), `apiFetch()` sends requests with `credentials: 'same-origin'` and omits the `Authorization` header. The server reads the session cookie and resolves the tenant. When no session cookie is present AND a key exists in `sessionStorage`, `apiFetch()` falls back to the current Bearer header pattern.

This means `bootApp()` changes from:

```
1. Check sessionStorage for key -> if present, render app shell
2. Otherwise, render auth gate
```

To:

```
1. Call GET /v1/account/me (with credentials: 'same-origin')
2. If 200 -> user has active session -> render app shell (with user context)
3. If 401 -> check sessionStorage for key
   a. If key present -> validate with GET /v1/captures?limit=1 (current flow)
   b. If no key -> render login screen (not the old auth gate)
```

The `/v1/account/me` endpoint returns the user's tenant info, GitHub username, and whether ToS is accepted. This single call replaces the implicit "try a request and see if it works" pattern.

**Why dual-path**: Operator tenants (provisioned via admin API, no GitHub account) still need the API key auth gate. Removing it would break existing users. The login screen should present both options: "Sign in with GitHub" (prominent) and "Connect with API key" (secondary).

### 2. Login Screen Redesign

The current `renderAuthGate()` shows a single password input for the API key. The new login screen needs:

**Primary CTA**: "Sign in with GitHub" button. This is a standard `<a>` tag (not a `<button>`) pointing to `GET /auth/github`. It navigates the full page -- no AJAX, no JavaScript required for the redirect. The server handles setting the `state` cookie, generating the authorization URL, and redirecting to GitHub.

**Secondary path**: "Or connect with an API key" collapsible section containing the current API key input. This remains for operator-provisioned tenants.

**Design constraints**:
- The GitHub button should use the GitHub mark (SVG inlined in the template, not an external image -- CSP blocks external images). Keep the SVG minimal (the Octicon mark, ~200 bytes).
- Use the existing `.btn` and `.btn--primary` classes for the GitHub button, with a `.btn--github` modifier for the dark background (#24292e per GitHub brand guidelines).
- The API key section uses the existing `.auth-card` layout but is initially collapsed via a `<details>` element (the design system already has `.disclosure` styles).

### 3. OAuth Redirect Flow (UI Perspective)

The OAuth flow is entirely server-driven. The UI's role is minimal:

1. User clicks "Sign in with GitHub" link -> full-page navigation to `/auth/github`
2. Server redirects to GitHub authorization URL
3. GitHub redirects back to `/auth/github/callback?code=...&state=...`
4. Server exchanges code for token, resolves identity, creates session, and redirects

**Post-callback routing**: The server callback handler should redirect to `/ui#/welcome` for first-time users (new tenant) or `/ui#/captures` for returning users. The hash fragment survives the redirect and the UI router picks it up.

The `#/welcome` route is a new view that shows the first API key with copy-to-clipboard and "shown once" semantics (see section 4).

**Error handling**: If the OAuth callback fails (user denied, invalid state, GitHub error), the server should redirect to `/ui#/login-error?reason=...`. The UI router catches this and renders an error message with a "Try again" button pointing back to `/auth/github`.

### 4. First-Key Welcome View

After first-time signup, the server creates the tenant, generates the first API key, and stores the raw key in the session (encrypted, server-side) for one-time retrieval. The server redirects to `/ui#/welcome`.

The welcome view:
1. Calls `GET /v1/account/first-key` (session-authenticated). Returns the raw key if it hasn't been retrieved yet, or 404 if already consumed.
2. Displays the key in a read-only `<input>` (not `<pre>` -- inputs are easier to select-all) with a "Copy" button.
3. Shows a warning: "This key will not be shown again. Copy it now and store it securely."
4. Has a "Continue to Dashboard" button that navigates to `#/captures`.
5. On navigating away (or clicking Continue), the key is consumed server-side and cannot be retrieved again.

**Copy-to-clipboard**: Use `navigator.clipboard.writeText()` with a fallback to `document.execCommand('copy')` for older browsers. The button text changes to "Copied!" for 2 seconds, then reverts. Use `aria-live="polite"` to announce the copy action to screen readers.

**"Shown once" enforcement**: The raw key exists server-side only. The welcome view fetches it once. If the user refreshes, the view re-fetches (the endpoint is idempotent until the key is consumed). Consumption happens when the user navigates away OR when a separate `POST /v1/account/first-key/ack` is called. The endpoint returns the key until ack'd, so accidental tab closure doesn't lose it -- the user can re-navigate to `/ui#/welcome` and still see it.

This is better than the alternative of passing the key in the redirect URL (query param or fragment), which would expose it in browser history, referrer headers, and server logs.

### 5. ToS Acceptance Gate

If `GET /v1/account/me` returns `{ tosAccepted: false }` (or the equivalent), the UI must block all other views and render a ToS acceptance gate.

The gate is a full-screen modal-style view (like the current auth gate) that:
1. Shows the ToS text (or a link to `/TERMS.md` with a summary)
2. Has a checkbox: "I have read and agree to the Terms of Service"
3. Has an "Accept" button (disabled until checkbox is checked)
4. On acceptance, calls `POST /v1/account/tos` and then re-renders the app shell

**Implementation**: This gate is checked in `renderAppShell()` after the session check. If ToS is not accepted, render the gate instead of the nav + view container. This prevents any navigation to captures, settings, etc.

### 6. Account Settings View

New hash route: `#/settings`. Accessible from a nav link in the app bar (next to "Captures" and before "Disconnect"/"Logout").

The settings view has three sections:

**Account info** (read-only):
- GitHub username
- Tenant ID
- Member since (created_at)

**API Keys** (CRUD):
- Table/list showing active keys: name, creation date, last 4 characters of the key hash, scopes
- "Create new key" button (opens inline form: key name input + scope checkboxes + submit)
- Per-key "Revoke" button with confirmation dialog
- After creating a key, the raw key is shown inline with copy-to-clipboard (same "shown once" pattern as welcome view)
- Key limit enforcement: if at max keys, the "Create" button is disabled with a message

The key list should use the existing `.table` design system component (already in `design-system.js`). The confirmation dialog for revocation should be a simple inline expansion (not a modal) -- "Are you sure you want to revoke 'my-key'? This cannot be undone." with Confirm/Cancel buttons.

**API endpoints consumed**:
- `GET /v1/account/keys` -- list keys for the authenticated user's tenant
- `POST /v1/account/keys` -- create a new key
- `DELETE /v1/account/keys/:keyHash` -- revoke a key

These are session-authenticated (cookie), distinct from the admin API which uses the ADMIN_KEY infrastructure secret.

### 7. App Shell Navigation Changes

The current app nav has "Captures" link and "Disconnect" button. Post-OAuth:

For session-authenticated users:
- "Captures" link (`#/captures`)
- "Settings" link (`#/settings`)
- Username display (GitHub username, not a link)
- "Logout" button (calls `POST /auth/logout`, then redirects to login screen)

For API-key-authenticated users (legacy path):
- "Captures" link (`#/captures`)
- "Disconnect" button (clears sessionStorage, same as current)
- No "Settings" link (API key users don't have account management)

This is determined by the auth method stored in a module-level variable (`_authMethod = 'session' | 'apikey'`) set during `bootApp()`.

### 8. `apiFetch()` Refactoring

The current `apiFetch()` always adds `Authorization: Bearer <key>` from sessionStorage. The new version:

```javascript
function apiFetch(path, options) {
  var opts = Object.assign({}, options);
  opts.headers = Object.assign({}, opts.headers);

  if (_authMethod === 'session') {
    // Cookie is sent automatically; include credentials
    opts.credentials = 'same-origin';
    // CSRF token for mutating requests
    if (opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') {
      opts.headers['X-CSRF-Token'] = _csrfToken;
    }
  } else {
    // Legacy API key path
    var key = sessionStorage.getItem(AUTH_KEY);
    opts.headers['Authorization'] = 'Bearer ' + key;
  }

  // ... timeout and error handling unchanged
}
```

The CSRF token is retrieved from the `GET /v1/account/me` response and stored in a module-level variable. It's sent on all mutating requests (POST, DELETE) as a custom header. Custom headers cannot be set by cross-origin forms, so this provides CSRF protection alongside `SameSite=Lax` cookies.

The 401 handler in `apiFetch()` needs updating: for session auth, a 401 means the session expired, so redirect to the login screen. For API key auth, clear sessionStorage and render the auth gate (current behavior).

### 9. CSP Changes

The current CSP is:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'
```

This needs one change: `form-action 'none'` blocks form submissions. While the OAuth login is an `<a>` tag (not a form), the API key form uses `<form>` with `e.preventDefault()` -- so `form-action 'none'` is actually safe because the form never submits natively. No CSP changes needed.

However, if the GitHub SVG mark is inlined (as recommended), no `img-src` changes are needed either. The SVG is part of the HTML template, not an external resource.

### 10. Hash Router Extensions

New routes to add:

```javascript
if (path === '/welcome') {
  renderWelcome();
  mountWelcome();
  return;
}

if (path === '/settings') {
  renderSettings();
  mountSettings();
  return;
}

if (path.startsWith('/login-error')) {
  renderLoginError(path);
  return;
}
```

The router's default redirect (`location.replace('#/captures')`) should only apply for authenticated users. For unauthenticated users, the router doesn't run (the login screen has no router).

### 11. New File Organization

Following the existing pattern of one JS module per view:

- `src/ui/ui-login.js` -- login screen (GitHub button + API key fallback)
- `src/ui/ui-welcome.js` -- first-key display with copy-to-clipboard
- `src/ui/ui-settings.js` -- account settings and key management
- `src/ui/ui-tos.js` -- ToS acceptance gate

Each exports a string constant (e.g., `LOGIN_JS`) that gets inlined in `ui-shell.js`, following the exact same pattern as `AUTH_JS`, `SUBMIT_VIEW_JS`, etc.

The existing `ui-auth.js` stays but is refactored: the `renderAuthGate()` function becomes a wrapper that delegates to the new login screen logic. `bootApp()` moves to the new flow. `apiFetch()` gains the dual-auth logic.

## Proposed Tasks

### Task F1: Refactor `bootApp()` and `apiFetch()` for Dual-Auth

**What**: Modify `bootApp()` to check for session cookie via `GET /v1/account/me` before falling back to sessionStorage API key. Modify `apiFetch()` to support both cookie-based and Bearer-based auth. Add CSRF token handling for session-authenticated mutations.

**Dependencies**: Requires the `/v1/account/me` endpoint to exist (backend task). Can be stubbed initially.

**Files**: `src/ui/ui-auth.js`

**Estimate**: S (small) -- ~100 lines of JS changes

### Task F2: Build Login Screen with GitHub OAuth Button

**What**: Create `src/ui/ui-login.js` with the new login screen showing "Sign in with GitHub" as primary CTA and "Connect with API key" as secondary collapsible section. Inline GitHub SVG mark. Wire into the auth gate flow.

**Dependencies**: Requires `GET /auth/github` endpoint to exist (backend task) but can be built and tested with a placeholder URL.

**Files**: `src/ui/ui-login.js`, `src/ui/ui-auth.js` (wire in), `src/ui/ui-shell.js` (import), `src/ui/ui-css.js` (new styles)

**Estimate**: M (medium) -- new view with design, accessibility, responsive layout

### Task F3: Build Welcome/First-Key View

**What**: Create `src/ui/ui-welcome.js` with the first-key display. Copy-to-clipboard with fallback. "Shown once" warning. "Continue to Dashboard" navigation. Accessible announcements for copy action.

**Dependencies**: Requires `GET /v1/account/first-key` and `POST /v1/account/first-key/ack` endpoints.

**Files**: `src/ui/ui-welcome.js`, `src/ui/ui-shell.js` (import + route), `src/ui/ui-css.js` (new styles)

**Estimate**: M -- interactive view with clipboard API, accessible feedback

### Task F4: Build ToS Acceptance Gate

**What**: Create `src/ui/ui-tos.js` with the terms acceptance UI. Checkbox + accept button pattern. Calls `POST /v1/account/tos`. Blocks app shell rendering until accepted.

**Dependencies**: Requires `POST /v1/account/tos` endpoint and `tosAccepted` field in `/v1/account/me` response.

**Files**: `src/ui/ui-tos.js`, `src/ui/ui-auth.js` (gate check in renderAppShell), `src/ui/ui-shell.js` (import), `src/ui/ui-css.js`

**Estimate**: S -- straightforward gate with one form

### Task F5: Build Account Settings View

**What**: Create `src/ui/ui-settings.js` with account info display, API key list (table), key creation form, key revocation with inline confirmation. Copy-to-clipboard for newly created keys. Add `#/settings` route. Add "Settings" nav link for session-authenticated users.

**Dependencies**: Requires `GET/POST/DELETE /v1/account/keys` endpoints.

**Files**: `src/ui/ui-settings.js`, `src/ui/ui-shell.js` (import + route), `src/ui/ui-auth.js` (nav update), `src/ui/ui-css.js`

**Estimate**: L (large) -- most complex new view (table, inline form, confirmation flow, copy-to-clipboard)

### Task F6: Update App Shell Navigation

**What**: Modify `renderAppShell()` to show different nav items based on auth method. Add username display for session users. Replace "Disconnect" with "Logout" for session users. Wire logout to `POST /auth/logout`.

**Dependencies**: Requires `POST /auth/logout` endpoint. User info from `/v1/account/me`.

**Files**: `src/ui/ui-auth.js`

**Estimate**: S -- conditional rendering in existing function

### Task F7: Login Error View

**What**: Handle `#/login-error?reason=...` route. Display error message based on reason code. "Try again" button pointing to `/auth/github`. Covers OAuth denial, state mismatch, GitHub errors.

**Dependencies**: None (frontend-only error display).

**Files**: `src/ui/ui-login.js` (or separate), `src/ui/ui-shell.js` (route), `src/ui/ui-css.js`

**Estimate**: XS -- simple error display

### Task F8: CSS for New Views

**What**: Add styles for login screen (GitHub button, collapsible API key section), welcome view (key display box, copy button states), settings view (key table, inline forms, confirmation), ToS gate. All using design system tokens. Mobile-responsive. Reduced-motion safe.

**Dependencies**: None -- can be built alongside or ahead of JS.

**Files**: `src/ui/ui-css.js`

**Estimate**: M -- significant new CSS surface but all following established patterns

### Recommended Task Order

1. F1 (dual-auth refactor) -- foundation for everything else
2. F8 (CSS) -- can be done in parallel with F2-F7
3. F2 (login screen) -- first user-visible change
4. F7 (login error) -- completes the login flow
5. F4 (ToS gate) -- must work before welcome view
6. F3 (welcome/first-key) -- post-signup flow
7. F6 (nav update) -- glue between login and app
8. F5 (settings) -- most complex, depends on everything above

## Risks and Concerns

### Risk 1: Session Cookie + `apiFetch()` Race on Boot

When `bootApp()` calls `GET /v1/account/me` to check for a session, the browser sends the cookie automatically. But if the cookie has expired (or been revoked server-side), this returns 401 and the UI falls through to the API key check. This creates a brief flash where the login screen appears before the API key validation completes.

**Mitigation**: Show a loading spinner during `bootApp()` while the session/key checks are in flight. Only render the login screen or app shell after both checks complete. This is a ~10 line change.

### Risk 2: CSP `form-action 'none'` and Future Form Submissions

Currently `form-action 'none'` is safe because all forms use `e.preventDefault()`. But if any future form needs native submission (unlikely in this SPA-like UI), it will silently fail. This is a standing constraint to document, not a change to make.

### Risk 3: Copy-to-Clipboard Browser Support

`navigator.clipboard.writeText()` requires a secure context (HTTPS -- already in place) and a user gesture (button click -- present). The fallback via `document.execCommand('copy')` covers older browsers. The risk is that some browser/extension combinations block clipboard access silently.

**Mitigation**: Always show the raw key in a selectable input, so the user can manually Ctrl+C even if the Copy button fails. The "Copied!" feedback only appears on success.

### Risk 4: File Size Growth

Each new view (~100-300 lines of JS) is inlined into the HTML template. The current template is already ~600 lines of JS. Adding 4 new views could double the inline JS size. For a single-page inline app with no build step, this is acceptable at ~15-20KB total (well within the "no code splitting needed" range), but it's worth monitoring.

### Risk 5: "Shown Once" Key Recovery

If the user closes their browser before copying the first key, the key is lost. The `POST /v1/account/first-key/ack` pattern (key remains available until explicitly acknowledged) mitigates accidental tab closure, but a deliberate browser quit still risks key loss.

**Mitigation**: The settings view allows creating additional keys. If the first key is lost, the user can create a replacement. The welcome view should mention this: "You can create additional keys in Settings."

### Risk 6: Hash Router Doesn't Handle Server Redirects Well

After the OAuth callback, the server redirects to `/ui#/welcome`. The hash fragment in a `Location` header redirect is browser-dependent. Most modern browsers preserve the hash, but some edge cases exist.

**Mitigation**: If the server redirects to `/ui?flow=welcome`, the `bootApp()` function can read the query param and then `location.replace('#/welcome')` to normalize into the hash router. This is more reliable than relying on hash preservation in redirects.

### Risk 7: CSRF Token Storage

The CSRF token from `/v1/account/me` is stored in a module-level JavaScript variable. If the user has multiple tabs open, they all share the same session cookie but each tab gets its own CSRF token from its own `/v1/account/me` call. This is fine as long as the server validates any recent token for the session, not just the latest one issued.

**Dependency**: This is a server-side concern. The frontend just needs to store and send the token. But it should be confirmed with the security-minion and oauth-minion that the CSRF token validation strategy supports multiple concurrent tabs.

## Additional Agents Needed

### ux-design-minion

The login screen, welcome view, settings view, and ToS gate are all new UI surfaces. The frontend-minion can build them using the existing design system tokens and component patterns, but design review would ensure:
- Visual hierarchy of the "Sign in with GitHub" button vs "API key" fallback
- Layout of the first-key display (visual emphasis on the key, warning treatment)
- Settings page information architecture (account info vs keys vs future settings)
- ToS gate visual treatment (how much of the terms to show inline vs link)

### test-minion

The new views need component tests (Vitest). Key test scenarios:
- `bootApp()` with session cookie vs API key vs neither
- Login screen renders both GitHub and API key options
- Welcome view copy-to-clipboard interaction
- Settings view key CRUD flow (create, copy, revoke with confirmation)
- ToS gate blocks navigation until accepted
- `apiFetch()` dual-auth behavior (cookie vs Bearer)
- CSRF token inclusion on mutating requests
- 401 handling differences (session expiry vs invalid API key)

Testing the actual OAuth redirect is a backend concern (the frontend just navigates to `/auth/github`), but the post-redirect behavior (parsing query params, rendering welcome/error views) needs frontend tests.

### observability-minion

New client-side events worth tracking (via server-side log entries from the endpoints called):
- Login method chosen (GitHub vs API key)
- First-key copy button usage (did the user click Copy?)
- First-key acknowledgment (did the user proceed to dashboard?)
- Key creation and revocation from settings
- ToS acceptance
- Session expiry encounters (401 on `/v1/account/me`)

The frontend itself shouldn't send analytics (no external calls, CSP `connect-src 'self'`), but the server endpoints naturally log these events. The observability-minion should define the structured log schema for these new events.
