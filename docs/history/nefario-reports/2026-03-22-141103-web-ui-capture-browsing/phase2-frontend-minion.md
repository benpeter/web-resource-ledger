## Domain Plan Contribution: frontend-minion

### Recommendations

#### (a) Hash-based routing, not path-based

Use hash-based routing (`#/captures`, `#/captures/:id`, `#/submit`). The reasoning:

1. **Zero Worker-side changes required.** The Worker already has a tight regex-based router for API routes (lines 22-39 of `index.js`). Adding a catch-all that serves the UI HTML for any unmatched path would collide with the existing `404` fallback behavior and the security comment on line 270: "SECURITY: Use static message -- never reflect request.method or url.pathname." A catch-all would mean the Worker must decide "is this an API route miss or a UI deep link?" -- a distinction that gets fragile fast.

2. **Single entry point.** The Worker serves one HTML page at a known path (e.g., `GET /ui` or `GET /app`). All navigation happens client-side via `hashchange`. The Worker only needs one new route entry, one new handler that returns the HTML shell.

3. **CSP compatibility.** The existing verify-page.js already uses `script-src 'unsafe-inline'; style-src 'unsafe-inline'` -- the UI page can follow the same pattern. Hash routing avoids the need for `navigate` API or `popstate` listeners that might interact poorly with the strict CSP.

4. **Simplicity.** Hash routing is the simplest client-side routing that works. No History API, no `pushState`, no server-side cooperation. Three views and an auth gate do not justify the complexity of path-based routing.

**Route map:**
- `#/` or empty hash -- redirect to `#/submit`
- `#/submit` -- capture submission form
- `#/captures` -- capture list (paginated)
- `#/captures/:id` -- capture detail view
- Auth gate is not a route -- it is a gating layer that shows/hides the app shell

#### (b) JS structure within Worker template strings

The verify-page.js at ~800 lines is already at the practical limit for a single template string module. Three views plus shared infrastructure (router, API client, auth, polling) would be 2000-3000 lines in one file -- unmaintainable.

**Recommended structure: one JS module per view, assembled by a shell module.**

```
src/
  ui/
    ui-shell.js        -- exports function that returns the full HTML Response
                          imports CSS + all view modules
                          contains: <style>, <body> shell with #app mount,
                          <script> with router + shared utilities
    ui-css.js           -- page-level CSS (layout, nav, view transitions)
                          design-system.css is imported from existing design-system.js
    ui-auth.js          -- auth gate logic (API key input, localStorage persistence,
                          exports functions as string constants for inline script)
    ui-submit.js        -- capture form view (render + event wiring)
    ui-list.js          -- capture list view (render, pagination, filtering)
    ui-detail.js        -- capture detail view (render, status display)
    ui-poll.js          -- status polling logic (shared by submit + detail views)
```

Each view module exports a JS string (the function source code) that gets concatenated into the `<script>` block of the shell. This matches the existing pattern where verify-page.js builds HTML as a template string with JS embedded.

**Key pattern: view functions, not components.**

Each view exports two things as string constants:
- A `renderXxx()` function that returns an HTML string for the view's DOM
- A `mountXxx()` function that wires up event listeners after the HTML is inserted

The router calls `renderXxx()` to get HTML, sets `innerHTML` on the mount point, then calls `mountXxx()` to attach listeners. This is exactly what verify-page.js does with `buildResult()` + `populate()`.

Example structure of a view module:

```js
// src/ui/ui-submit.js
export const SUBMIT_VIEW_JS = `
function renderSubmit() {
  return '<form id="capture-form" class="card" ...>' +
    '<label ...>URL</label>' +
    '<input class="input" id="capture-url" ...>' +
    // ...
    '</form>';
}

function mountSubmit() {
  var form = document.getElementById('capture-form');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    submitCapture();
  });
}
`;
```

The shell module concatenates all view JS into one `<script>` block:

```js
// src/ui/ui-shell.js
import { DESIGN_SYSTEM_CSS } from '../design-system.js';
import { UI_CSS } from './ui-css.js';
import { AUTH_JS } from './ui-auth.js';
import { SUBMIT_VIEW_JS } from './ui-submit.js';
import { LIST_VIEW_JS } from './ui-list.js';
import { DETAIL_VIEW_JS } from './ui-detail.js';
import { POLL_JS } from './ui-poll.js';

export function htmlDashboard() {
  return `<!DOCTYPE html>
<html lang="en">
<head>...</head>
<style>${DESIGN_SYSTEM_CSS}\n${UI_CSS}</style>
<body>
  <div id="app"></div>
  <script>
  (function() {
    'use strict';
    ${AUTH_JS}
    ${POLL_JS}
    ${SUBMIT_VIEW_JS}
    ${LIST_VIEW_JS}
    ${DETAIL_VIEW_JS}

    // Router
    function route() {
      var hash = location.hash.slice(1) || '/submit';
      var app = document.getElementById('app');
      // ... match hash, call render + mount
    }
    window.addEventListener('hashchange', route);
    route();
  }());
  </script>
</body></html>`;
}
```

**Why this works at scale:**
- Each view module is independently readable and editable (~200-400 lines each)
- No build step -- just JS module imports concatenated into template strings
- The pattern is identical to the existing verify-page.js, just factored across files
- Adding a new view means adding one new file and one import

#### (c) Progressive enhancement for status polling UX

The capture submission flow has three distinct states with a clear state machine:

```
[Form] --submit--> [Polling] --complete--> [Result]
                       |
                       +---failed----> [Error with retry option]
```

**Implementation approach:**

1. **Form submission.** The form POSTs to `/v1/captures` using `fetch()`. On success (201), extract the `captureId` from the response. Immediately transition the UI to the polling state. The form is replaced in-place (same container) with a progress indicator -- not a new route. This keeps the user on `#/submit` during polling, which is correct because they have not "navigated" anywhere.

2. **Polling.** Use the existing `GET /v1/captures/:id/status` endpoint. This endpoint already returns `Retry-After: 10` for pending captures -- the client should respect this header. Polling logic:
   - Start polling immediately after submission
   - Use `setTimeout` (not `setInterval`) for each poll cycle to avoid drift and pile-up
   - Read `Retry-After` from the response header, default to 5 seconds, cap at 30 seconds
   - Show elapsed time ("Capturing... 15s") so the user knows it is working
   - After 120 seconds with no resolution, show a "taking longer than expected" message with the capture ID so the user can check back later
   - On `status: 'complete'`: transition to result view, navigate to `#/captures/:id`
   - On `status: 'failed'`: show error with the `error` message from the response. If `retryable: true`, offer a "Try again" button that returns to the form pre-filled with the same URL

3. **Visual states during polling:**
   - Spinner (reuse the existing `.spinner` + `.loading-text` pattern from verify-page.js)
   - Progress text updates: "Submitting..." -> "Capturing page..." -> "Processing..." (keyed to elapsed time, not actual backend stages, since the status endpoint only returns pending/complete/failed)
   - The submit button becomes disabled with a loading state during the POST itself (prevents double-submit)
   - `aria-live="polite"` on the status container so screen readers announce state changes

4. **Noscript fallback.** The form includes a `<noscript>` block explaining that the UI requires JavaScript, with a link to the API documentation. This is the same pattern as verify-page.js line 299-310.

5. **Error handling.** Network failures during polling (fetch rejection, non-200 status) should not immediately show an error. Instead, increment a retry counter and only show a "connection lost" message after 3 consecutive failures. This prevents flashing errors on brief network interruptions.

**Auth gate design:**

The auth gate is not a view -- it is a wrapper around the entire app. On load:

1. Check `localStorage` for a stored API key
2. If present, render the app shell with navigation
3. If absent, render a simple card with an API key input field and "Connect" button
4. On key entry, make a lightweight validation call (e.g., `GET /v1/captures?limit=1`) to confirm the key works
5. On success, store the key and render the app
6. On failure (401/403), show an inline error, do not store

The API key is sent as `Authorization: Bearer <key>` on every fetch call. A simple `apiFetch(path, options)` wrapper handles this, adding the header and handling 401 responses (clear stored key, show auth gate again).

**Key stored in `sessionStorage` vs `localStorage`:** Use `localStorage` for persistence across tabs/sessions. The API key is already a bearer token that the user possesses -- storing it client-side is the expected model. Include a "Disconnect" button in the nav that clears the key and shows the auth gate.

### Proposed Tasks

**Task 1: Worker route + HTML shell**
- Add `GET /ui` route to `index.js` routes array
- Create `src/ui/ui-shell.js` that returns the full HTML page with empty app mount
- Wire up the hash router (hashchange listener, route matching)
- Include navigation bar (Submit / Captures links), footer
- Import and inline `DESIGN_SYSTEM_CSS` plus page-level layout CSS
- Deliverables: `src/ui/ui-shell.js`, `src/ui/ui-css.js`, route entry in `index.js`
- Dependencies: None (can start immediately)

**Task 2: Auth gate**
- Create `src/ui/ui-auth.js` with auth gate render + mount functions
- API key input form with validation call
- localStorage persistence of key
- `apiFetch()` wrapper that injects Authorization header
- 401 interception to re-show auth gate
- "Disconnect" button in nav
- Deliverables: `src/ui/ui-auth.js`
- Dependencies: Task 1 (needs the shell to mount into)

**Task 3: Capture submission form + polling**
- Create `src/ui/ui-submit.js` with form render + mount
- URL input with client-side validation (must be http/https, must be a valid URL)
- Form submission via `fetch()` to `POST /v1/captures`
- Create `src/ui/ui-poll.js` with polling logic
- Polling state UI (spinner, elapsed time, status text)
- Transition to detail view on completion
- Error display with retry option on failure
- Deliverables: `src/ui/ui-submit.js`, `src/ui/ui-poll.js`
- Dependencies: Task 1 (shell), Task 2 (auth/apiFetch)

**Task 4: Capture list view**
- Create `src/ui/ui-list.js` with list render + mount
- Paginated table/card list using existing `.table` and `.card` CSS components
- Status badges using existing `.badge--pass`, `.badge--fail`, `.badge--skip`
- Status filter (all/pending/complete/failed)
- Pagination controls (previous/next using offset + limit)
- Click-through to `#/captures/:id`
- Mobile-responsive: card layout on small screens, table on larger
- Deliverables: `src/ui/ui-list.js`
- Dependencies: Task 1 (shell), Task 2 (auth/apiFetch)

**Task 5: Capture detail view**
- Create `src/ui/ui-detail.js` with detail render + mount
- Data grid showing capture metadata (URL, timestamps, status, render quality)
- Screenshot display (reuse pattern from verify-page.js)
- Artifact links (screenshot, HTML, headers, WACZ)
- Link to verification page (`/v1/verify/:id`)
- Pending state: show polling UI (reuse from Task 3)
- Failed state: show error with retry suggestion
- Deliverables: `src/ui/ui-detail.js`
- Dependencies: Task 1 (shell), Task 2 (auth), Task 3 (polling logic)

**Task 6: CSP headers + security review**
- Set appropriate CSP for the UI page (same pattern as verify-page.js line 791)
- Ensure `connect-src 'self'` allows API calls to same origin
- Add `form-action 'self'` or `'none'` as appropriate
- Verify no XSS vectors in template string interpolation (all dynamic content set via `textContent`, never `innerHTML` with user data)
- Deliverables: CSP header in the UI response, security notes in decisions.md
- Dependencies: Tasks 1-5 (needs all views to audit)

**Task 7: CORS configuration for UI route**
- The UI is served from the same origin as the API, so CORS is not needed for API calls from the UI
- Verify that the existing CORS_ORIGINS configuration does not interfere
- Ensure the UI route response does not include CORS headers (it is same-origin HTML, not an API)
- Deliverables: Verification that same-origin API calls work without CORS issues
- Dependencies: Task 1

### Risks and Concerns

1. **Template string size.** Even split across files, the concatenated `<script>` block will be 1500+ lines. This is fine for the browser (it is just a string the Worker sends), but developer experience degrades when debugging inline scripts. Mitigation: each view module is its own file with clear boundaries. Source maps are not available (no build step), so error line numbers in the browser console will reference the concatenated output. Consider adding a `// === VIEW: SUBMIT ===` comment banner at each concatenation point so developers can orient themselves in browser DevTools.

2. **No hot reload.** Since the JS is served inline from the Worker, there is no HMR or fast refresh during development. The developer workflow is: edit view file -> `wrangler dev` auto-reloads -> refresh browser. This is acceptable for the scope (three views), but worth noting.

3. **localStorage API key security.** Storing the API key in `localStorage` means any XSS vulnerability exposes it. The CSP mitigates this (`script-src 'unsafe-inline'` with no external script sources), but it is a risk. The alternative (session-only, cookie-based auth) would require Worker-side session management, which is significantly more complex and not worth it for this scope. Document this trade-off.

4. **Polling battery/data impact on mobile.** Polling every 5-10 seconds is fine for short captures (typically <30s), but long-running captures could poll for minutes. Mitigation: respect `Retry-After`, cap total polling duration at 120s, then show a "check back later" message with the capture ID. Also consider using `document.visibilityState` to pause polling when the tab is backgrounded.

5. **The `ui` route is unauthenticated HTML.** The HTML shell itself does not require authentication -- the auth gate is client-side. This is correct (the API key is checked on every API call), but means anyone can load the UI page. This is by design (the page is useless without a valid API key), but should be documented.

6. **Design system coverage.** The existing `design-system.css` covers buttons, inputs, tables, cards, badges, alerts, and data grids -- enough for all three views. However, it lacks: navigation/header component, pagination controls, and form field groups (label + input + error). These will need small CSS additions in `ui-css.js`. These additions should follow the existing token and naming conventions exactly.

7. **Accessibility of hash routing.** Hash changes do not trigger focus management by default. The router must manually set focus to the main content area or the page heading after navigation, and update `document.title`. This is easy to miss and critical for screen reader users. The router's `route()` function should call `document.title = ...` and `document.getElementById('main-heading').focus()` after rendering each view.

### Additional Agents Needed

None. The current team is sufficient for this scope. The design system already exists with tokens and components, so no UX design input is needed for the implementation. The API endpoints are already built and documented in the code. Security review of CSP headers can be done as part of the implementation tasks.
