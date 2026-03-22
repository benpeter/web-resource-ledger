## Task: Worker route, HTML shell, auth gate, and CSS foundation

Build the foundation for the WRL Web UI: the Worker route, HTML shell with hash-based router, auth gate, shared CSS, and the apiFetch wrapper.

### Context

WRL is a Cloudflare Worker that captures web pages with cryptographic verification. It has an existing HTML page (src/verify-page.js) that serves as the pattern to follow: it exports a function that returns a full HTML Response with inline CSS and JS.

The new Web UI will let users submit captures and browse results via a browser interface, authenticated with their existing API key.

### What to build

**1. Route entry in src/index.js**
- Add `['GET', /^\/ui$/, handleDashboard]` to the routes array (after the health check, before API routes)
- Import `{ htmlDashboard }` from `'./ui/ui-shell.js'`
- The handleDashboard function returns the Response from htmlDashboard()
- Add a comment near the route noting the UI depends on same-origin API access (no CORS needed)
- Do NOT add a root redirect (GET / -> /ui). This is out of scope.

**2. HTML shell (src/ui/ui-shell.js)**
- Exports htmlDashboard() that returns a new Response(html, { status: 200, headers: {...} })
- The HTML page structure:
  - `<!DOCTYPE html>`, `<html lang="en">`, proper `<head>` with charset, viewport, title "Web Resource Ledger"
  - Favicon using the existing FAVICON_SVG pattern from src/favicon.js
  - `<style>` block containing DESIGN_SYSTEM_CSS (imported from src/design-system.js) plus page-level CSS from UI_CSS
  - `<body>` with `<div id="app"></div>` mount point
  - Single `<script>` block wrapped in an IIFE containing all JS: auth, router, views, polling
  - `<noscript>` fallback explaining JS is required, with link to API docs
- Response headers must include:
  - Content-Type: text/html;charset=UTF-8
  - Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
    NOTE: Do NOT include `data:` in img-src — the favicon uses a link tag governed by default-src, not img-src. Screenshots are served from same origin.
  - Cache-Control: no-store
- The shell imports and concatenates JS string constants from each view module

**3. Hash router (inside the shell's script block)**
- Route map:
  - `#/` or empty hash -> redirect to `#/captures` (the combined submit+list view)
  - `#/captures` -> combined submit form + capture list view
  - `#/captures/:id` -> capture detail view
- On hashchange event and on initial load, call route()
- route() parses the hash, matches the pattern, calls the appropriate renderXxx() function, sets innerHTML on #app, then calls mountXxx() to wire event listeners
- After each view render: update document.title and set focus to the main heading for accessibility (use a `<h1>` with tabindex="-1" so it can receive programmatic focus)

**4. Auth gate (src/ui/ui-auth.js)**
- Exports AUTH_JS string constant containing the auth gate functions
- Auth state stored in sessionStorage under key 'wrl_api_key'
- On app load: check sessionStorage. If no key, show auth gate. If key exists, show app.
- Auth gate UI: centered card (use .card from design system) with:
  - WRL wordmark/title
  - One-line explanation: "Enter your API key to get started"
  - `<input type="password" autocomplete="current-password" placeholder="wrl_live_...">` — must not block paste
    NOTE: Use autocomplete="current-password" (NOT "off") per WCAG 2.2 SC 3.3.8 — allows password managers
  - "Connect" button (use .btn .btn--primary)
  - Error display area (use .alert .alert--error, hidden by default)
- On Connect: validate key by calling GET /v1/captures?limit=1 with the key as Bearer token
  - Add a 10-second timeout using Promise.race — if the fetch doesn't resolve in 10s, show "Connection timed out. Check your network and try again."
  - On success (200): store key in sessionStorage, render the app shell with navigation
  - On failure (401/403): show inline error "Invalid API key", do NOT store the key
  - On network error: show "Connection failed. Check your network and try again."
- apiFetch(path, options) wrapper function:
  - Reads key from sessionStorage
  - Adds Authorization: Bearer <key> header
  - Wraps every fetch in a 10-second Promise.race timeout
  - On 401 response: clears sessionStorage, re-renders auth gate
  - On 429 response: reads Retry-After header, shows user-friendly "Too many requests. Please wait N seconds."
  - On timeout: returns a synthetic error response or throws with clear message
  - Returns the fetch Response
- "Disconnect" button in the nav bar: clears sessionStorage, re-renders auth gate
- Key never appears in URL, error messages, or DOM after entry

**5. Page-level CSS (src/ui/ui-css.js)**
- Exports UI_CSS string constant
- Use design system tokens (CSS custom properties from --color-*, --space-*, --radius-*, --text-*) exclusively — NO hardcoded hex values
- Layout CSS: app shell layout, nav bar, view container, responsive breakpoints
- Nav bar: simple horizontal bar with "Captures" link (hash link), "Disconnect" button right-aligned
- Navigation component styles
- Responsive: mobile-first. Nav stacks vertically on small screens. Content area is full-width with max-width container.
- Input fields: ensure font-size: 1rem (16px) on inputs to prevent iOS zoom on focus
- Add @media (prefers-reduced-motion: reduce) to disable any transitions

**6. Stub views for initial testing**
- Create src/ui/ui-submit.js exporting SUBMIT_VIEW_JS with placeholder renderCaptures() and mountCaptures() functions that return a simple "Captures" placeholder with a heading
- Create src/ui/ui-detail.js exporting DETAIL_VIEW_JS with placeholder renderDetail(id) and mountDetail(id) functions
- Create src/ui/ui-poll.js exporting POLL_JS with placeholder polling functions

### Patterns to follow

- Study src/verify-page.js for the exact pattern: how it imports DESIGN_SYSTEM_CSS, builds HTML as template strings, sets response headers, handles CSP
- Study src/design-system.js for available CSS tokens and components (.btn, .input, .card, .alert, .badge, .table, .data-grid)
- Study src/index.js lines 22-39 for how routes are registered
- The global security headers in index.js (X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy) are already set on ALL responses — do not duplicate them. Only add CSP per-response.
- Use escapeHtml() from verify-page.js if you need to escape content in template strings during server-side HTML generation

### What NOT to do

- Do NOT use localStorage — use sessionStorage only
- Do NOT add any external script sources or CDN links
- Do NOT use innerHTML with any user-provided or API-fetched data — use textContent or createElement for dynamic content in client-side JS
- Do NOT add CORS headers to the UI response
- Do NOT modify any existing routes or handlers
- Do NOT create a separate auth endpoint or session system on the backend
- Do NOT use TypeScript, build steps, or any framework
- Do NOT refactor or modify verify-page.js in this task
- Do NOT add a root redirect (GET / -> /ui)
- Do NOT create the combined submit+list view yet — just stub views that prove the shell and router work
- Do NOT include `data:` in the CSP img-src directive
- Do NOT use autocomplete="off" on the API key input

### Deliverables

- src/ui/ui-shell.js — HTML shell with router, imports all view modules
- src/ui/ui-css.js — page-level CSS
- src/ui/ui-auth.js — auth gate with sessionStorage and apiFetch wrapper
- src/ui/ui-submit.js — stub submit view
- src/ui/ui-detail.js — stub detail view
- src/ui/ui-poll.js — stub polling module
- Modified src/index.js — new route entry for GET /ui

### Success criteria

- GET /ui returns 200 with HTML containing the app shell
- CSP header is present and matches the EXACT specified policy (all directives)
- Cache-Control: no-store header is present
- Hash router navigates between stub views without page reload
- Auth gate shows when no key in sessionStorage
- Auth gate validates key against API before storing (with 10s timeout)
- apiFetch adds Authorization header and handles 401 globally (with 10s timeout)
- "Disconnect" clears key and shows auth gate
- All CSS uses design system tokens (no hardcoded colors, sizes)
- The page is usable on a 375px viewport (mobile)
- noscript fallback is present
- Focus management: view changes set focus to main heading
- document.title updates on navigation
- API key input uses autocomplete="current-password"
