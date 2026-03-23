## Security Review: Self-Serve Signup via GitHub OAuth

**Verdict: ADVISE**

Three issues require attention before or during execution. None are blockers -- the core design is sound -- but each has a concrete exploitation path that must be closed.

---

### [security]: ToS gate is UI-only -- backend enforces nothing

**SCOPE**: Task 3 (`src/oauth.js`), Task 4 (`src/account.js`), Task 5 (`src/index.js`)

**CHANGE**: The synthesis decision on ToS timing says "The ToS gate in the UI is a soft block that the backend enforces via 403 on account endpoints when tosAcceptedAt is null." However, no task prompt actually implements that backend enforcement. Task 4's handlers receive `env._session` which contains `githubId`, but no handler checks `tosAcceptedAt`. Task 5's router auth gate checks session validity but not ToS status.

**WHY**: A user who can make direct HTTP requests (or modify the frontend) can access `/v1/account/keys` and create API keys without accepting ToS. The `github_users.tos_accepted_at` column exists but is never read in the request path.

**TASK**: Add a ToS enforcement check to the `/v1/account/*` auth gate in Task 5's router block. After session verification succeeds, check `session.tosAcceptedAt`. If null, return 403 with `{ type: 'tos_required', detail: 'You must accept the Terms of Service before using account endpoints.' }`. Exception: `POST /v1/account/tos` must remain accessible without prior ToS acceptance -- otherwise acceptance is impossible. The `verifySession()` return shape (Task 3) must include `tosAcceptedAt` from the `github_users` JOIN. This is the "backend enforces via 403" the synthesis describes but no task currently implements.

---

### [security]: OAuth error parameters reflected into UI -- XSS risk if encoding is not enforced

**SCOPE**: Task 7 (`src/ui/ui-auth.js`, `src/ui/ui-login.js`)

**CHANGE**: The callback handler redirects to `/ui?error=token_exchange_failed` etc. Task 7 says to parse `error` query params and show display strings. The safe path is an allowlist map (error code -> hardcoded string) with output set via `textContent`. The risk is if the implementation reads the raw param value and sets it via `element.textContent = rawValue` with an unintended path through dynamic HTML construction.

**WHY**: If any code path sets the error display via a property that parses HTML (rather than `textContent`), a crafted URL like `/ui?error=<crafted-content>` becomes an injection point. The callback handler only emits known error codes today, but the frontend code must enforce the allowlist unconditionally -- not rely on the backend only ever sending safe values.

**TASK**: Add an explicit requirement to Task 7's prompt: error params must be filtered through a closed allowlist constant (e.g., `{ denied: 'GitHub authorization was cancelled.', token_exchange_failed: 'Sign-in failed. Please try again.', ... }`) with a safe default for unknown codes. All display output must use `element.textContent` assignment, never dynamic HTML property assignment. Verify this at the Task 7 approval gate.

---

### [security]: First-key KV entry retained after read -- raw key persists up to 1 hour

**SCOPE**: Task 3 (`handleFirstKey` in `src/oauth.js`)

**CHANGE**: The spec says "Do NOT delete the KV entry on read -- it has a 1-hour TTL and the user may refresh." This means the raw API key remains in KV for up to 1 hour after the user copies it.

**WHY**: A compromised or hijacked session within that window can retrieve the first key even after the legitimate user has already saved it and moved on. The 1-hour retention is inconsistent with the "shown once" claim the UI makes to the user. The ack endpoint exists to close this window -- but only fires if the user clicks "Continue to Dashboard." A user who copies the key and closes the tab (common mobile behavior) leaves the raw key in KV for the full TTL.

**TASK**: Modify `handleFirstKey` in Task 3 to delete the KV entry on first successful read (read, return the value, then call `env.KV.delete()`). The separate ack endpoint can remain for UI flow signaling (navigation trigger) but should not be the only deletion path. The welcome screen copy should not promise re-fetchability on refresh -- update to: "Your API key will only be shown once. Copy it now." If the user needs a new key (e.g., they closed the tab), they create one via settings. This is already supported.

---

### Affirmed Design Decisions

The following choices are correct and should not be revisited:

- **PKCE required**: `code_verifier` stored in KV alongside state. Correct defense against authorization code interception on public clients.
- **State parameter single-use**: KV entry deleted on first read in callback. Correct.
- **GitHub token never persisted**: explicitly discarded in step 7 of callback spec. Correct.
- **`__Host-` cookie prefix**: enforces Secure, no Domain attribute, Path=/. Strictly stronger than `Secure` alone.
- **SameSite=Lax + custom header CSRF**: the CSRF analysis is sound. The custom header triggers CORS preflight for cross-origin requests; SameSite=Lax blocks the cookie on cross-site POST. Together they provide protection equivalent to a synchronizer token without server state.
- **Session ID hashed before D1 storage**: D1 breach does not yield usable session tokens.
- **Tenant ID as `gh-{numeric_id}`**: immutable GitHub numeric ID prevents username-recycling attacks on tenant namespaces.
- **Rate limiting on `/auth/*` routes**: 10 req/60s per IP is appropriate for OAuth initiation endpoints.
- **No admin scope in self-serve key creation**: correctly enforced at handler level with 403.
