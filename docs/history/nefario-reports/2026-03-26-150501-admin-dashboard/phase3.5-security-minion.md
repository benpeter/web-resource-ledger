ADVISE

The plan is structurally sound. The core security controls -- parameterized queries, `textContent` for rendering, `ADMIN_CACHE` headers, hardcoded ORDER BY, `verifyAdminKey` gate on all `/v1/admin/*` routes, no CORS on admin endpoints, CSP on the HTML shell -- are all correct. The concerns below are real but none block execution.

---

- [security]: The `/admin` route is served unauthenticated with no rate limiting, enabling an attacker to enumerate the admin login page and hammer the credential-validation endpoint (`GET /v1/admin/overview`) from the browser.
  SCOPE: `src/index.js` route registration; `src/admin/admin-auth.js` `adminFetch` helper
  CHANGE: Add client-side rate limiting in `ADMIN_AUTH_JS`: after 3 consecutive 401 responses on the login form, disable the submit button for 30 seconds and display a lockout message. This is purely frontend (the server rate limit already exists at 30/60s for `/v1/admin/*`), but it closes the UX loop and makes brute-force obvious to the operator.
  WHY: The admin key has high entropy so brute force is non-viable at scale, but without any client-side throttle the login form will silently hammer the validation endpoint until the server rate limit kicks in. An operator would have no feedback that something is wrong.
  TASK: Task 3

- [security]: `sessionStorage` is cleared on tab close but is readable by any same-origin JavaScript -- if the `/admin` CSP is ever loosened or a future XSS vector opens on the same origin, the admin key is trivially exfiltrated.
  SCOPE: `src/admin/admin-auth.js` -- `sessionStorage.getItem('wrl_admin_key')`
  CHANGE: The plan is acceptable for an internal operator tool, but document the deliberate tradeoff explicitly in a comment in `admin-auth.js`: "Admin key stored in sessionStorage (tab-scoped, cleared on close). This is intentional for a single-operator internal tool. Never deploy this pattern where the admin UI shares an origin with untrusted user-generated content." No code change required if this is acknowledged.
  WHY: `sessionStorage` is the right call here (cookies would require CSRF handling, IndexedDB is overkill for a single-operator tool), but the choice should be intentional and documented rather than implicit.
  TASK: Task 3

- [security]: The detail view renders tenant `config` as formatted JSON in a `<pre><code>` block -- the plan says "formatted JSON in a `<pre>` with `<code>`" but does not explicitly specify whether this uses `textContent` or `JSON.stringify` assigned to `innerHTML`.
  SCOPE: `src/admin/admin-detail.js` -- Tenant config section
  CHANGE: The implementation instruction must be explicit: use `element.textContent = JSON.stringify(parsedConfig, null, 2)` -- not `element.innerHTML`. The "What NOT to do" in Task 3 already prohibits `innerHTML` with variable data, but `<pre>` blocks are commonly the exception where developers reach for `innerHTML`. Add an explicit note: "Config `<pre>` must use `textContent`, not `innerHTML`."
  WHY: Tenant config values are operator-supplied strings (e.g., custom quota overrides). An attacker who controls a tenant could inject `<script>` tags via a malicious config field if `innerHTML` is used on the pre element.
  TASK: Task 3

- [security]: The `periods` query param on `GET /v1/admin/tenants/:id` is validated as "positive integer, max 24" but the plan does not specify what happens on non-integer or negative values -- whether the handler returns 400 or silently falls back to the default.
  SCOPE: `src/admin-dashboard.js` -- `handleAdminGetTenant` param parsing
  CHANGE: Specify the validation behavior explicitly in Task 2's prompt: "If `periods` is present but not a valid positive integer (1-24), return `problemResponse(400, 'Invalid periods parameter')`. Do not silently coerce." Fail loudly per the project's engineering philosophy.
  WHY: Silent coercion masks client bugs and misconfigurations. The existing engineering philosophy mandates failing loudly.
  TASK: Task 2

- [security]: The `stripeCustomerId` field is included in the `GET /v1/admin/tenants/:id` response shape verbatim. Stripe customer IDs are not secret (they are not payment credentials), but they are PII-adjacent identifiers that identify the operator's billing relationship.
  SCOPE: `src/admin-dashboard.js` -- `handleAdminGetTenant` response shape (line ~270 of synthesis)
  CHANGE: This is acceptable for an admin-only endpoint (the operator already has full access to the Stripe dashboard). No change required. Flag for awareness: if the response shape is ever reused on a non-admin endpoint, `stripeCustomerId` must be stripped.
  WHY: Informational only -- no action needed now.
  TASK: Task 2

---

Summary: One concrete code addition recommended (client-side login throttle, Task 3), one explicit comment required (sessionStorage tradeoff, Task 3), one wording sharpening required (config pre textContent, Task 3), one validation behavior clarification required (periods param, Task 2). No blocking issues.
