## Security Review: Web UI Capture Submission and Browsing

### Verdict: ADVISE

The plan has sound security foundations: `unsafe-inline` is an acceptable
trade-off for an inline-only page with no external scripts, textContent-only
rendering is correctly mandated throughout, safeUrl validation covers
javascript: URI injection, and sessionStorage is the right choice over
localStorage. Four targeted concerns remain.

---

- [security]: The CSP allows `img-src 'self' data:` but Task 3 renders
  screenshot images from artifact endpoints -- the path `/v1/captures/*/artifacts/screenshot`
  is same-origin, so `'self'` is correct; however `data:` in img-src is
  unnecessary and should be removed to eliminate a potential data-URI exfiltration
  channel via injected image content.
  SCOPE: `src/ui/ui-shell.js` -- CSP header, `Content-Security-Policy` value
  CHANGE: Remove `data:` from `img-src`. The favicon is served as an inline
  SVG data URI in the `<link rel="icon">` tag; that tag is not governed by
  `img-src` (it uses `default-src`). Verify that no `<img src="data:...">` is
  produced anywhere in the shell or view modules before removing. If the
  favicon `<link>` generates a CSP violation without it, move the favicon to
  a Worker-served route (`/favicon.ico` already exists) and use `<link
  rel="icon" href="/favicon.ico">` instead.
  WHY: `data:` in `img-src` permits in-page rendering of arbitrary data URIs.
  If a future code path accidentally assigns API-fetched content to an img src
  (e.g., a developer forgets the textContent-only rule), a stored XSS attacker
  could exfiltrate data by embedding it in a `data:` image that triggers a
  same-origin fetch. Defense-in-depth favors removing it; the feature set does
  not require it.
  TASK: Task 1

---

- [security]: The auth validation call (`GET /v1/captures?limit=1`) is made
  with the API key before it is stored, which is correct; however the plan does
  not specify a timeout or abort on the validation fetch. A slow or hung
  validation request (e.g., network congestion or a request racing against a
  Worker cold start) leaves the Connect button in a disabled/loading state
  indefinitely and can lock the user out of the UI with no recovery path.
  SCOPE: `src/ui/ui-auth.js` -- auth gate Connect handler, `apiFetch` wrapper
  CHANGE: Wrap the auth validation fetch in `Promise.race([fetch(...),
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')),
  10000))])`. On timeout, show "Connection timed out. Check your network and
  try again." and re-enable the Connect button. The same timeout pattern
  should apply to all `apiFetch` calls to prevent UI lockout on hung requests.
  WHY: A permanently disabled Connect button with no timeout is a
  self-inflicted denial-of-service. An attacker on a shared network could
  trigger this by delaying TCP responses. More likely, it happens naturally on
  mobile networks. The failure mode is indistinguishable from a server error
  and provides no recovery path.
  TASK: Task 1

---

- [security]: The safeUrl function specified in Task 2 validates the protocol
  of URLs before rendering them as `<a href>` links, which is correct. However
  the plan does not specify that the `href` attribute must be set via
  `element.setAttribute('href', safeUrl(url))` or equivalent DOM API -- it
  only prohibits `innerHTML` with API data. If an implementer uses a template
  string to build an anchor tag and passes it through `innerHTML` (a common
  mistake when building list rows), safeUrl provides no protection because
  `javascript:` can be encoded to bypass the `new URL()` check in some
  environments if the URL is not re-normalized before assignment.
  SCOPE: `src/ui/ui-list.js`, `src/ui/ui-detail.js` -- anchor construction
  for capture URLs
  CHANGE: Explicitly state in the Task 2 and Task 3 prompts that anchor `href`
  attributes for API-derived URLs MUST be set via `element.setAttribute('href',
  safeUrl(url))` or `a.href = safeUrl(url)` on a DOM element -- never via
  template string interpolation into `innerHTML`. Add a null-check: if
  `safeUrl()` returns null, render the URL as plain text via `textContent`
  rather than an anchor.
  WHY: The textContent-only rule and safeUrl are both specified, but the
  interaction between them for anchor construction is underspecified. Without
  an explicit DOM API requirement for `href` assignment, a developer
  implementing the list rows (which iterate over API data) may reach for
  template strings with innerHTML for the whole row, defeating both controls.
  The safeUrl pattern from verify-page.js should be the canonical reference
  here.
  TASK: Tasks 2 and 3

---

- [security]: The polling loop in Task 2 and the detail view in Task 3 display
  error messages sourced from the API's `detail` field (RFC 9457 Problem
  Details). The plan correctly requires `textContent` for these. However
  neither task specifies a maximum display length for the `detail` field before
  truncation. The API detail field can be up to several hundred characters; if
  the Worker ever surfaces an error that includes a URL or path fragment
  (e.g., "Capture of https://very-long-url..." failed), displaying it verbatim
  could leak information about internal processing in a multi-tenant context
  where UI output may be screen-shared or logged by the browser.
  SCOPE: `src/ui/ui-submit.js`, `src/ui/ui-poll.js`, `src/ui/ui-detail.js` --
  error message display
  CHANGE: Truncate API-sourced `detail` strings to a maximum of 200 characters
  before display: `detail.slice(0, 200) + (detail.length > 200 ? '...' : '')`.
  Apply to all three modules. This does not affect the textContent-only
  requirement; it is an additional bound.
  WHY: The WRL API already avoids reflecting raw input in error messages (see
  url-validation.js: "SECURITY: Do not reflect rawUrl in the error message").
  The UI should apply the same discipline: display enough to be actionable, not
  a verbatim relay of server-side detail that may include internal state.
  Low severity but consistent with the project's existing CWE-209 posture.
  TASK: Tasks 2 and 3
