# Domain Plan Contribution: security-minion

## Recommendations

### Auth Approach: Option (a) -- API Key in sessionStorage with Bearer Header via fetch()

After analyzing all three options against the current system architecture, **Option (a) is the correct choice**, with one refinement: use `sessionStorage` (not `localStorage`) and enforce a strict CSP.

Here is the full analysis:

---

#### Option (a): User pastes API key, stored in sessionStorage, sent as Bearer via fetch()

**Strengths:**

1. **Zero backend changes to auth.** The existing `verifyApiKey()` in `auth.js` already handles Bearer tokens perfectly. No new auth path, no new session state, no new database table. This is the YAGNI/KISS choice.

2. **No CSRF risk.** Bearer tokens sent via `Authorization` header in `fetch()` calls are immune to CSRF. Browsers never auto-attach custom headers to cross-origin requests. This is a categorical advantage over cookies.

3. **Same-origin means no CORS needed.** Since the UI is served from the same Worker origin as the API, all `fetch()` calls from the UI to `/v1/captures` are same-origin. No `Origin` header is sent, no CORS preflight occurs, no CORS configuration changes needed. The existing `CORS_ORIGINS` config should remain untouched -- it serves external integrations (browser extensions, third-party apps), not the first-party UI.

4. **sessionStorage scoping is correct.** `sessionStorage` is per-origin AND per-tab. Closing the tab clears the key. Opening a new tab requires re-entering the key. This is appropriate for an API key that grants capture+read privileges.

**Risks and mitigations:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| XSS reads sessionStorage | High | CSP blocks external scripts; no user-generated content in UI; input validation on all display data |
| Key visible in DevTools | Low (accepted) | Same exposure as any auth mechanism in DevTools; user already possesses the key |
| User accidentally pastes key into wrong field | Low | Label the field clearly; use `type="password"` input |

**XSS is the primary threat.** If an attacker achieves JavaScript execution on the page, they can read `sessionStorage` and exfiltrate the API key. The defense is layered:

1. **Content Security Policy (strict).** The UI pages must set a CSP that blocks all external script sources. The existing verify-page CSP is a good model: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. This blocks script-src from any external domain, which eliminates stored XSS via injected `<script src>` tags.

2. **No innerHTML with untrusted data.** The existing verify-page already demonstrates the correct pattern: build DOM structure with `innerHTML` for static markup, then populate dynamic values with `textContent` and `createElement`. The UI must follow this same pattern. All API response data displayed in the UI must use `textContent`, never `innerHTML`.

3. **No dynamic code execution.** `Function()` constructor and `document.write` are banned patterns for this UI.

4. **All fetch responses are JSON.** The UI makes `fetch()` calls to `/v1/captures` endpoints which return `application/json`. There is no HTML-in-JSON that could cause injection.

---

#### Option (b): Session cookie -- REJECTED

**Why not:**

1. **Introduces CSRF.** Cookies are auto-attached to every same-origin request. A CSRF attack could trigger `POST /v1/captures` from an attacker's page if the user has an active session. Mitigation (SameSite=Strict, CSRF tokens) adds complexity for no gain.

2. **Requires new backend code.** A session system needs: a session table in D1, a token-to-session lookup on every request, session expiry/renewal logic, a `/login` endpoint that exchanges API key for session, and cookie configuration (HttpOnly, Secure, SameSite, Path, Max-Age). This is a significant new auth surface.

3. **Breaks existing auth contract.** The Worker's auth model is stateless: hash the Bearer token, look it up. Adding stateful sessions creates a second auth path that must be maintained, tested, and secured independently.

4. **SameSite=Strict breaks legitimate flows.** If a user navigates to the UI from an external link (email, Slack), `SameSite=Strict` cookies are not sent on the initial navigation. The user sees an auth wall even though they have a valid session. `SameSite=Lax` would be needed, which weakens CSRF protection for GET requests.

5. **Session management is a vulnerability surface.** Session fixation, session hijacking, insufficient session expiry, session token entropy -- all new categories of vulnerability that do not exist with the current Bearer token model.

**The only advantage** of cookies is HttpOnly (JavaScript cannot read the session token). But this advantage is marginal when the CSP prevents external script execution and the UI has no user-generated content surface.

---

#### Option (c): OAuth -- DEFERRED (correct per backlog)

The backlog correctly parks OAuth with trigger "When R17 (web UI) is built and needs user auth." For R17 itself, OAuth is premature:

- No user identity system exists.
- No external identity provider is integrated.
- The current user base is a single operator who already has API keys.
- OAuth adds 500+ lines of code (PKCE flow, token refresh, callback handling) for a feature that currently has one user.

**When to revisit:** When WRL has multiple human users who should not handle raw API keys, or when a public-facing UI requires delegated authorization. Not now.

---

### CSP Specification for UI Pages

The UI must set these headers on all HTML responses:

```
Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

This is identical to the existing verify-page CSP (line 791 of `verify-page.js`). The global headers in `index.js` (lines 299-302) already set X-Frame-Options, HSTS, X-Content-Type-Options, and Referrer-Policy on ALL responses, so only CSP needs to be added per-HTML-response.

**Note on `script-src 'unsafe-inline'`:** Ideally we would use nonce-based CSP (`script-src 'nonce-xxx'`), but the backlog explicitly dropped this (see Dropped Items: "Nonce-based CSP -- Template doesn't use server-side dynamic data in scripts"). For an inline-only page with no external scripts and a `default-src 'none'` baseline, `unsafe-inline` is acceptable. The `default-src 'none'` ensures no external scripts can load regardless.

### CORS_ORIGINS: No Change Needed

The `CORS_ORIGINS` variable in `wrangler.toml` must NOT change for the UI. It is currently commented out in both production and staging:

```toml
# CORS_ORIGINS = "https://my-extension.example.com"
```

Same-origin requests from the UI do not trigger CORS. The UI's `fetch()` calls to `/v1/captures` will be same-origin (same scheme, host, port) and will not include an `Origin` header. The CORS mechanism is entirely bypassed.

`CORS_ORIGINS` exists for **external** browser clients (browser extensions, third-party frontends hosted on different domains). These are separate use cases. Conflating first-party UI and third-party CORS would be a design error.

### Auth Gate UX Security

The "auth gate" view (where the user enters their API key) has specific security requirements:

1. **Input type must be `password`** -- masks the key visually in the input field.
2. **No key echo in URL** -- the key must never appear in the URL, query parameters, or browser history.
3. **No key in error messages** -- if auth fails, say "Invalid API key", never echo back what was entered.
4. **Clear on navigation away** -- if the user navigates away from the UI entirely (not just between UI views), `sessionStorage` is already cleared by the browser when the tab closes. For explicit logout, provide a "Disconnect" button that calls `sessionStorage.removeItem()`.
5. **Paste-friendly** -- since the key is a high-entropy string like `wrl_live_...`, the input must not block paste events. No paste-blocking event handlers.
6. **No autocomplete** -- set `autocomplete="off"` on the API key input to prevent browsers from storing/suggesting it.
7. **Validate before storing** -- make a lightweight authenticated request (e.g., `GET /v1/captures?limit=1`) before storing the key in sessionStorage. If the key is invalid, do not store it.

### Data Display Security

The capture list and capture detail views will display data from API responses (URLs, timestamps, capture IDs, status values). Security requirements:

1. **All dynamic content via `textContent` or `createElement`** -- never `innerHTML` with API data.
2. **URL rendering** -- captured URLs must be validated with the same `safeUrl()` pattern used in `verify-page.js` (line 346): parse with `new URL()`, only allow `http:` or `https:` protocol, use the parsed `.href` for the link. This prevents `javascript:` URI injection.
3. **No server-side HTML templating with user data** -- the existing pattern of `JSON.stringify()` for embedding data into inline scripts (verify-page.js line 320) is safe for the captureId (validated by route regex) and origin (controlled by the Worker). New UI pages must not extend this pattern to untrusted data.

### Rate Limiting Interaction

The UI will consume the same rate limits as API clients. This is correct -- there should not be a separate, more permissive rate limit for UI requests. However, the UI should handle 429 responses gracefully:

1. Read the `Retry-After` header from 429 responses.
2. Display a user-friendly message ("Too many requests, please wait N seconds").
3. Disable the submit button during the cooldown period.
4. Do NOT auto-retry capture submissions on 429 -- this creates a feedback loop.

### Security Logging

The auth mechanism is unchanged (Bearer token via Authorization header), so all existing security logging (auth failures, rate limit hits, SSRF blocks) continues to work without modification. The UI does not introduce any new logging requirements because it uses the same API endpoints with the same auth.

---

## Proposed Tasks

### Task 1: Auth Gate Implementation
**What:** Build the API key entry form with `type="password"` input, validation against the API before storing in `sessionStorage`, and a "Disconnect" button that clears sessionStorage.
**Deliverables:** Auth gate HTML/JS, sessionStorage read/write logic, validation request on entry.
**Dependencies:** None (uses existing `GET /v1/captures?limit=1` for validation).
**Security acceptance criteria:**
- Key never appears in URL or browser history
- Key stored in `sessionStorage` only (not `localStorage`)
- `autocomplete="off"` on key input
- Invalid keys are never stored
- "Disconnect" clears sessionStorage and returns to auth gate

### Task 2: CSP Headers on All UI HTML Responses
**What:** Every HTML page served by the Worker for the UI must include the CSP header: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`.
**Deliverables:** CSP header added to UI response construction, matching the existing verify-page pattern.
**Dependencies:** Depends on the UI routing/response mechanism being designed.

### Task 3: Secure Data Display Patterns
**What:** Establish and enforce the rule that all API response data rendered in the UI uses `textContent` / `createElement`, never `innerHTML`. URLs rendered as links must pass through `safeUrl()` validation.
**Deliverables:** Shared `safeUrl()` utility (can be extracted from verify-page.js or duplicated inline), documented pattern for data display.
**Dependencies:** Task 1 (auth gate provides the token for API calls).

### Task 4: 429 Rate Limit Handling in UI
**What:** UI fetch wrapper must detect 429 responses, parse `Retry-After`, disable the capture submission form, and show a human-readable cooldown message.
**Deliverables:** Fetch wrapper or error handler that covers 429 for all authenticated endpoints.
**Dependencies:** Task 1 (auth gate), capture submission form implementation.

### Task 5: Security Review of Final Implementation
**What:** Post-implementation review of the complete UI: verify CSP is set on all HTML responses, verify no innerHTML with untrusted data, verify sessionStorage usage, verify no key leakage in logs or error messages, verify rate limit handling.
**Deliverables:** Security review checklist result.
**Dependencies:** All other UI tasks complete.

---

## Risks and Concerns

### RISK 1 (High): XSS Leading to API Key Theft
**Threat:** If an XSS vulnerability exists in the UI, an attacker can read the API key from `sessionStorage` and exfiltrate it.
**Likelihood:** Low (tight CSP, no user-generated content, no external scripts).
**Impact:** High (full tenant access -- capture and read).
**Mitigation:** Strict CSP, `textContent`-only data rendering, `safeUrl()` for links, no dynamic code execution. Code review specifically for innerHTML usage.
**Residual risk:** Accepted. The same risk exists with any browser-based auth mechanism except HttpOnly cookies, and cookies introduce CSRF which is a comparable risk.

### RISK 2 (Medium): API Key Exposure via Shoulder Surfing or Screen Sharing
**Threat:** User enters API key while sharing screen or in a public space.
**Likelihood:** Low-Medium (WRL is currently single-operator).
**Impact:** Medium (key compromise, but revocable via admin API).
**Mitigation:** `type="password"` input, no key echo in UI after entry. Consider showing only the key hash prefix (first 8 chars) as a "connected as" indicator rather than any part of the raw key.

### RISK 3 (Low): sessionStorage Survives Browser Crash
**Threat:** Some browsers restore `sessionStorage` after a crash or "restore tabs" operation, meaning the key persists longer than expected.
**Likelihood:** Low (requires browser crash + restore).
**Impact:** Low (key remains accessible only in the same browser on the same machine).
**Mitigation:** Accepted. This is a known browser behavior quirk. The key is already possessed by the user -- the risk is only relevant if someone else gains physical access to the machine after a crash, which is outside WRL's threat model.

### RISK 4 (Medium): UI Served on Same Origin Increases Attack Surface
**Threat:** The UI introduces new HTML pages served from the Worker origin. Any vulnerability in these pages (XSS, open redirect, etc.) now shares the origin with the API.
**Likelihood:** Low (vanilla JS, no user-generated content, strict CSP).
**Impact:** Medium (same-origin means any compromised UI page can make authenticated API calls if the user's key is in sessionStorage in another tab -- but actually sessionStorage is per-tab, so this requires XSS in the SAME tab).
**Mitigation:** CSP, code review, minimal UI surface. The sessionStorage per-tab isolation is actually a defense here -- an XSS in tab A cannot read sessionStorage from tab B even on the same origin.

### RISK 5 (Low): No Key Rotation UX
**Threat:** If a key is compromised, the user must use the admin API (curl + ADMIN_KEY) to revoke it and create a new one. There is no UI for key management.
**Likelihood:** Low (single operator with admin access).
**Impact:** Low (operational inconvenience, not a security gap -- the mechanism exists).
**Mitigation:** Accepted for R17 scope. Key management UI is a separate feature.

---

## Additional Agents Needed

None. The current team is sufficient for the security aspects of this task. The auth model requires no changes (no oauth-minion needed), no infrastructure changes (no iac-minion needed for auth), and the CSP/header configuration is straightforward Worker response header manipulation.

One note for the **implementation agent**: the `safeUrl()` function in `verify-page.js` (line 346-351) and the `escapeHtml()` function (line 5-13) should be considered for extraction into a shared utility if the UI duplicates their logic. However, given the project's KISS philosophy and the fact that these are ~10 lines each, inline duplication in the UI module is also acceptable. The implementing agent should make this call based on how the UI modules are structured.
