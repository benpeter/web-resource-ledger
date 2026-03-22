## Delegation Plan

**Team name**: web-ui-capture-browsing
**Description**: Build a browser-based Web UI for WRL capture submission and browsing, served from the existing Cloudflare Worker using vanilla HTML/JS/CSS. Covers auth gate, capture submission with polling, capture list, and capture detail views.

### Task 1: Worker route, HTML shell, auth gate, and CSS foundation
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This task establishes the routing architecture, file structure, auth model, and CSS foundation that all subsequent tasks build on. Hard to reverse (file structure and routing pattern propagate everywhere) with high blast radius (all other tasks depend on it).
- **Gate rationale**: |
    Chosen: Hash-based client-side routing with single `GET /ui` Worker route, sessionStorage for API key, modular file structure in `src/ui/`
    Over: (1) Path-based routing with server-side catch-all (rejected: collides with existing 404 behavior and regex router), (2) localStorage for key persistence (rejected: sessionStorage is better security posture for bearer tokens -- evaluators should not have persistent auth on shared machines), (3) Single monolithic file (rejected: verify-page.js at ~800 lines is already at practical limit; 3 views would be 2000+ lines)
    Why: Hash routing requires zero Worker-side changes beyond one route entry; sessionStorage matches the bearer-token security model (per-tab, cleared on close); modular files keep each view independently editable at 200-400 lines each.
- **Prompt**: |
    ## Task: Worker route, HTML shell, auth gate, and CSS foundation

    Build the foundation for the WRL Web UI: the Worker route, HTML shell with hash-based router, auth gate, shared CSS, and the `apiFetch` wrapper.

    ### Context

    WRL is a Cloudflare Worker that captures web pages with cryptographic verification. It has an existing HTML page (`src/verify-page.js`) that serves as the pattern to follow: it exports a function that returns a full HTML Response with inline CSS and JS.

    The new Web UI will let users submit captures and browse results via a browser interface, authenticated with their existing API key.

    ### What to build

    **1. Route entry in `src/index.js`**
    - Add `['GET', /^\/ui$/, handleDashboard]` to the routes array (after the health check, before API routes)
    - Import `{ htmlDashboard }` from `'./ui/ui-shell.js'`
    - The `handleDashboard` function returns the Response from `htmlDashboard()`
    - Also add a redirect: `['GET', /^\/$/, handleRootRedirect]` that returns a 302 to `/ui` -- only if there is no existing root handler (check first)

    **2. HTML shell (`src/ui/ui-shell.js`)**
    - Exports `htmlDashboard()` that returns a `new Response(html, { status: 200, headers: {...} })`
    - The HTML page structure:
      - `<!DOCTYPE html>`, `<html lang="en">`, proper `<head>` with charset, viewport, title "Web Resource Ledger"
      - Favicon using the existing `FAVICON_SVG` pattern from `src/favicon.js`
      - `<style>` block containing `DESIGN_SYSTEM_CSS` (imported from `src/design-system.js`) plus page-level CSS from `UI_CSS`
      - `<body>` with `<div id="app"></div>` mount point
      - Single `<script>` block wrapped in an IIFE containing all JS: auth, router, views, polling
      - `<noscript>` fallback explaining JS is required, with link to API docs
    - Response headers must include:
      - `Content-Type: text/html;charset=UTF-8`
      - `Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      - `Cache-Control: no-store` (the page contains auth state logic, should not be cached)
    - The shell imports and concatenates JS string constants from each view module

    **3. Hash router (inside the shell's `<script>` block)**
    - Route map:
      - `#/` or empty hash -> redirect to `#/captures` (the combined submit+list view)
      - `#/captures` -> combined submit form + capture list view
      - `#/captures/:id` -> capture detail view
    - On `hashchange` event and on initial load, call `route()`
    - `route()` parses the hash, matches the pattern, calls the appropriate `renderXxx()` function, sets `innerHTML` on `#app`, then calls `mountXxx()` to wire event listeners
    - After each view render: update `document.title` and set focus to the main heading for accessibility

    **4. Auth gate (`src/ui/ui-auth.js`)**
    - Exports `AUTH_JS` string constant containing the auth gate functions
    - Auth state stored in `sessionStorage` under key `'wrl_api_key'`
    - On app load: check sessionStorage. If no key, show auth gate. If key exists, show app.
    - Auth gate UI: centered card (use `.card` from design system) with:
      - WRL wordmark/title
      - One-line explanation: "Enter your API key to get started"
      - `<input type="password" autocomplete="off" placeholder="wrl_live_...">` -- must not block paste
      - "Connect" button (use `.btn .btn--primary`)
      - Error display area (use `.alert .alert--error`, hidden by default)
    - On Connect: validate key by calling `GET /v1/captures?limit=1` with the key as Bearer token
      - On success (200): store key in sessionStorage, render the app shell with navigation
      - On failure (401/403): show inline error "Invalid API key", do NOT store the key
      - On network error: show "Connection failed. Check your network and try again."
    - `apiFetch(path, options)` wrapper function:
      - Reads key from sessionStorage
      - Adds `Authorization: Bearer <key>` header
      - On 401 response: clears sessionStorage, re-renders auth gate
      - On 429 response: reads `Retry-After` header, shows user-friendly message "Too many requests. Please wait N seconds."
      - Returns the fetch Response
    - "Disconnect" button in the nav bar: clears sessionStorage, re-renders auth gate
    - Key never appears in URL, error messages, or DOM after entry

    **5. Page-level CSS (`src/ui/ui-css.js`)**
    - Exports `UI_CSS` string constant
    - Use design system tokens (CSS custom properties from `--color-*`, `--space-*`, `--radius-*`, `--text-*`) exclusively -- NO hardcoded hex values
    - Layout CSS: app shell layout, nav bar, view container, responsive breakpoints
    - Nav bar: simple horizontal bar with "Captures" link (hash link), "Disconnect" button right-aligned
    - Navigation component styles (not in the existing design system)
    - Responsive: mobile-first. Nav stacks vertically on small screens. Content area is full-width with max-width container.
    - Input fields: ensure `font-size: 1rem` (16px) on inputs to prevent iOS zoom on focus
    - Add `@media (prefers-reduced-motion: reduce)` to disable any transitions

    **6. Stub views for initial testing**
    - Create `src/ui/ui-submit.js` exporting `SUBMIT_VIEW_JS` with placeholder `renderSubmit()` and `mountSubmit()` functions that return a simple "Submit view" placeholder
    - Create `src/ui/ui-list.js` exporting `LIST_VIEW_JS` with placeholder `renderList()` and `mountList()` functions
    - Create `src/ui/ui-detail.js` exporting `DETAIL_VIEW_JS` with placeholder `renderDetail()` and `mountDetail()` functions
    - Create `src/ui/ui-poll.js` exporting `POLL_JS` with placeholder polling functions

    ### Patterns to follow

    - Study `src/verify-page.js` for the exact pattern: how it imports `DESIGN_SYSTEM_CSS`, builds HTML as template strings, sets response headers, handles CSP
    - Study `src/design-system.js` for available CSS tokens and components (`.btn`, `.input`, `.card`, `.alert`, `.badge`, `.table`, `.data-grid`)
    - Study `src/index.js` lines 22-39 for how routes are registered
    - The global security headers in `index.js` (X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy) are already set on ALL responses -- do not duplicate them. Only add CSP per-response.
    - Use `escapeHtml()` from `verify-page.js` if you need to escape any content embedded in template strings during server-side HTML generation

    ### What NOT to do

    - Do NOT use localStorage -- use sessionStorage only
    - Do NOT add any external script sources or CDN links
    - Do NOT use `innerHTML` with any user-provided or API-fetched data -- use `textContent` or `createElement` for dynamic content in client-side JS
    - Do NOT add CORS headers to the UI response
    - Do NOT modify any existing routes or handlers
    - Do NOT create a separate auth endpoint or session system on the backend
    - Do NOT use TypeScript, build steps, or any framework
    - Do NOT refactor or modify `verify-page.js` in this task
    - Do NOT create the combined submit+list view yet -- just stub views that prove the shell and router work

    ### Deliverables

    - `src/ui/ui-shell.js` -- HTML shell with router, imports all view modules
    - `src/ui/ui-css.js` -- page-level CSS
    - `src/ui/ui-auth.js` -- auth gate with sessionStorage and apiFetch wrapper
    - `src/ui/ui-submit.js` -- stub submit view
    - `src/ui/ui-list.js` -- stub list view
    - `src/ui/ui-detail.js` -- stub detail view
    - `src/ui/ui-poll.js` -- stub polling module
    - Modified `src/index.js` -- new route entry for `GET /ui`

    ### Success criteria

    - `GET /ui` returns 200 with HTML containing the app shell
    - CSP header is present and matches the specified policy
    - Hash router navigates between stub views without page reload
    - Auth gate shows when no key in sessionStorage
    - Auth gate validates key against API before storing
    - apiFetch adds Authorization header and handles 401 globally
    - "Disconnect" clears key and shows auth gate
    - All CSS uses design system tokens (no hardcoded colors, sizes)
    - The page is usable on a 375px viewport (mobile)
    - `<noscript>` fallback is present
    - Focus management: view changes set focus to main heading
    - `document.title` updates on navigation
- **Deliverables**: `src/ui/ui-shell.js`, `src/ui/ui-css.js`, `src/ui/ui-auth.js`, stub view files, route entry in `src/index.js`
- **Success criteria**: `GET /ui` serves HTML with working hash router, auth gate, CSP headers, mobile-responsive layout, and design system integration

### Task 2: Combined submit + list view
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Combined capture submit form + capture list view

    Build the main view of the WRL Web UI: a combined view where the capture submission form sits above the capture list. This is the primary screen users see after authenticating.

    ### Context

    Task 1 established the HTML shell, hash router, auth gate, and CSS foundation. The shell in `src/ui/ui-shell.js` imports view modules and concatenates their JS into a single `<script>` block. Each view module exports a JS string constant containing `renderXxx()` and `mountXxx()` functions.

    The `#/captures` hash route should show this combined view. The UX strategy recommendation is that the submit form and list are the SAME view, not separate pages -- submitting a URL adds an item to the list below the form, providing immediate feedback.

    ### What to build

    **1. Capture submit form (`src/ui/ui-submit.js`)**
    - Replace the stub with a real implementation
    - The submit form is part of the combined view (rendered at the top of `renderCaptures()`)
    - Form elements:
      - URL input: `<input type="url" class="input" placeholder="https://example.com" required>`
      - Submit button: `<button type="submit" class="btn btn--primary">Capture</button>`
      - Client-side validation: must be `http:` or `https:` protocol (use `new URL()` to parse)
      - On invalid URL: show inline error below the input (use `.alert .alert--error`)
    - On submit:
      - Disable the submit button, show loading state ("Capturing...")
      - Call `apiFetch('/v1/captures', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({url}) })`
      - On 201/202: extract `captureId` from response. Add a new pending item to the top of the list (optimistic UI -- don't wait for list refresh). Start polling for that capture's status.
      - On error (4xx/5xx): show the `detail` field from the Problem Details JSON response. Re-enable the submit button.
      - On network error: show "Connection failed" error. Re-enable the submit button.
    - After successful submission, clear the URL input but keep it focused for rapid multi-submission

    **2. Capture list (`src/ui/ui-list.js`)**
    - Replace the stub with a real implementation
    - The list is part of the combined view (rendered below the submit form)
    - Fetch captures from `apiFetch('/v1/captures?limit=20')`
    - Render as a responsive layout:
      - Desktop (>640px): use the `.table` component from the design system. Columns: URL (truncated, full in `title` attr), Time (relative, full ISO in `title`), Status (badge)
      - Mobile (<640px): use `.card` components stacked vertically. Each card shows URL (full width, word-break), status badge, relative time
    - Status badges using existing design system classes:
      - `complete` -> `.badge .badge--pass` with text "Complete"
      - `failed` -> `.badge .badge--fail` with text "Failed"
      - `pending` -> `.badge .badge--skip` with text "Pending"
    - Each row/card is clickable -> navigates to `#/captures/{id}`
    - Pagination: "Load more" button at the bottom when `hasMore` is true. Button fetches next page with `offset` parameter and appends to existing list.
    - Show total count: "Showing N of M captures"
    - Default sort: newest first (API default)

    **3. Empty state**
    - When the list returns zero items, show the submit form (always visible) with contextual guidance below it: "Submit a URL above to create your first capture. The page will be captured with a screenshot and cryptographic verification."
    - Do NOT show an illustration or mascot. Keep it professional.

    **4. Polling integration (`src/ui/ui-poll.js`)**
    - Replace the stub with real polling logic
    - `startPolling(captureId, onUpdate)` function:
      - Calls `apiFetch('/v1/captures/{id}/status')` using `setTimeout` (NOT `setInterval`)
      - Respects `Retry-After` header from response, defaults to 5 seconds, caps at 30 seconds
      - On `status: 'complete'`: call `onUpdate` with complete data, stop polling
      - On `status: 'failed'`: call `onUpdate` with failure data, stop polling
      - On network error: increment retry counter, only show error after 3 consecutive failures
      - After 120 seconds total: stop polling, show "Taking longer than expected. The capture ID is {id} -- check back later."
      - Pause polling when `document.visibilityState === 'hidden'` (save battery/data on mobile), resume on visible
    - When a pending capture completes: update its row in the list in-place (swap the pending badge for complete/failed badge, add timestamp)
    - Show elapsed time on pending items: "Capturing... 15s"

    **5. Combined render function**
    - The `renderCaptures()` function returns HTML containing both the form and the list
    - The `mountCaptures()` function wires up: form submit handler, list click handlers, pagination, and starts polling for any pending items in the list

    ### Security requirements

    - All dynamic content from API responses MUST use `textContent` or `createElement` -- NEVER `innerHTML` with API data
    - URLs displayed as links must be validated with `new URL()` to allow only `http:` and `https:` protocols (prevent `javascript:` URI injection). Use this pattern:
      ```
      function safeUrl(urlStr) {
        try { var u = new URL(urlStr); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null; }
        catch { return null; }
      }
      ```
    - Error messages from the API: display the `detail` field via `textContent`, never inject raw HTML

    ### Files to reference

    - `src/ui/ui-shell.js` -- the shell that imports your modules
    - `src/ui/ui-auth.js` -- provides `apiFetch()` for authenticated requests
    - `src/ui/ui-css.js` -- add any additional CSS needed for the list/form here
    - `src/design-system.js` -- available CSS components and tokens
    - `src/verify-page.js` -- reference for how data display works (textContent pattern, safeUrl pattern)
    - The API returns Problem Details JSON (RFC 9457) for errors -- parse `detail` field for user display

    ### What NOT to do

    - Do NOT create separate routes for submit and list -- they are ONE combined view at `#/captures`
    - Do NOT add sorting or filtering controls (MVP scope: newest-first only)
    - Do NOT add thumbnails/screenshots to the list view (defer to follow-up)
    - Do NOT modify any backend API endpoints
    - Do NOT use `innerHTML` with any data from API responses
    - Do NOT add `hasWacz` to the API response -- use existing response shape as-is

    ### Deliverables

    - Updated `src/ui/ui-submit.js` -- capture form with validation, submission, error handling
    - Updated `src/ui/ui-list.js` -- capture list with responsive layout, pagination, click-through
    - Updated `src/ui/ui-poll.js` -- polling logic with backoff, visibility pause, timeout
    - Updated `src/ui/ui-css.js` -- any additional CSS for list/form components
    - The combined view renders at `#/captures` within the existing shell

    ### Success criteria

    - Form submits a capture and shows the pending item immediately in the list
    - Polling updates the pending item to complete/failed
    - List shows captures with correct status badges
    - Click on a list item navigates to `#/captures/:id`
    - "Load more" pagination works
    - Empty state shows the form with guidance text
    - Mobile layout (375px) shows cards instead of table rows
    - All dynamic content uses textContent, not innerHTML
    - URLs in links are validated with safeUrl
    - 429 responses show user-friendly retry message
- **Deliverables**: Updated `src/ui/ui-submit.js`, `src/ui/ui-list.js`, `src/ui/ui-poll.js`, `src/ui/ui-css.js`
- **Success criteria**: Combined submit+list view works with real API, responsive layout, polling, pagination, and safe data rendering

### Task 3: Capture detail view
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Capture detail view

    Build the capture detail view for the WRL Web UI, displayed when a user clicks on a capture in the list or navigates to `#/captures/:id`.

    ### Context

    The Web UI shell (Task 1) and combined submit+list view (Task 2) are already built. The detail view is the third and final view. It shows the full metadata, status, screenshot, and artifact links for a single capture.

    The existing verification page (`src/verify-page.js`) displays similar information for public verification URLs. The detail view should present the same kind of data within the app shell, but it is NOT a refactoring of verify-page.js -- it is a new view that fetches and displays capture data using the authenticated API.

    ### What to build

    **1. Detail view (`src/ui/ui-detail.js`)**
    - Replace the stub with a real implementation
    - Fetch capture data from `apiFetch('/v1/captures/{id}')` on render
    - Show loading state while fetching (reuse the `.spinner` + `.loading-text` pattern from the design system)

    **2. Layout for complete captures**
    - "Back to captures" link at the top (navigates to `#/captures`)
    - Status banner: full-width bar at the top showing status. Use design system status colors:
      - Complete: success color (`--color-success`)
      - Failed: error color (`--color-error`)
      - Pending: muted/neutral
    - Metadata section using `.data-grid` component:
      - URL (as a clickable link, validated with `safeUrl()`)
      - Capture ID
      - Status
      - Created at (formatted datetime)
      - Completed at (formatted datetime, if available)
      - Render quality (full/partial, if available)
    - Screenshot section:
      - Display the screenshot image: `<img loading="lazy" src="/v1/captures/{id}/artifacts/screenshot" alt="Screenshot of {url}">`
      - If the capture has a before-screenshot, show both with labels ("Before consent" / "After consent")
      - Images should be responsive (max-width: 100%, auto height)
    - Artifact links section:
      - Screenshot (link to `/v1/captures/{id}/artifacts/screenshot`)
      - HTML snapshot (link to `/v1/captures/{id}/artifacts/html`)
      - HTTP headers (link to `/v1/captures/{id}/artifacts/headers`)
      - WACZ archive (link to `/v1/captures/{id}/artifacts/wacz`) -- only show if the capture data includes WACZ-related fields
    - Verification link: "Verify this capture" linking to `/v1/verify/{id}` (the public verification page, opens in new tab)

    **3. Layout for pending captures**
    - Show the metadata section with available fields (URL, capture ID, created at)
    - Show a polling status indicator: spinner with elapsed time ("Capturing... 15s")
    - Reuse the polling logic from `src/ui/ui-poll.js` (`startPolling()`)
    - When polling resolves to complete/failed: re-render the detail view with the full data

    **4. Layout for failed captures**
    - Show error information:
      - Error message from the API response
      - If `retryable: true`: show a "Try again" button that navigates to `#/captures` with the URL pre-filled in the submit form
    - Show whatever metadata is available (URL, capture ID, timestamps)

    **5. Error handling**
    - If the capture ID is not found (404): show "Capture not found" with a link back to the list
    - If the API returns an error: show the error detail using the `.alert .alert--error` component
    - If network fails: show "Connection failed" with a retry button

    ### Security requirements

    - All API data displayed via `textContent` or `createElement` -- NEVER `innerHTML` with API data
    - URLs displayed as links: validate with `safeUrl()` (http/https only)
    - Screenshot `<img>` src is constructed from the capture ID (which is already validated by the hash route regex), not from API response data
    - Artifact links are constructed from the capture ID, not from API data

    ### Files to reference

    - `src/ui/ui-shell.js` -- the shell that imports your module
    - `src/ui/ui-poll.js` -- provides `startPolling()` for pending captures
    - `src/ui/ui-auth.js` -- provides `apiFetch()` for authenticated requests
    - `src/ui/ui-css.js` -- add any additional CSS needed
    - `src/design-system.js` -- available CSS components (`.data-grid`, `.card`, `.badge`, `.alert`, `.btn`)
    - `src/verify-page.js` -- reference for how verification data is displayed (status banners, checks, screenshot). Do NOT import from it or modify it.

    ### What NOT to do

    - Do NOT refactor or modify `verify-page.js`
    - Do NOT duplicate the full verification page logic (crypto verification, check display) -- the detail view shows capture metadata and artifacts, not live verification. Link to the verification page instead.
    - Do NOT add edit/delete capabilities
    - Do NOT modify any backend API endpoints

    ### Deliverables

    - Updated `src/ui/ui-detail.js` -- complete detail view
    - Updated `src/ui/ui-css.js` -- any additional CSS for detail view components

    ### Success criteria

    - Detail view shows all metadata for a complete capture
    - Screenshot displays correctly (responsive, lazy-loaded)
    - Artifact links are constructed correctly and work
    - Pending captures show polling status and auto-update on completion
    - Failed captures show error and retry option
    - "Back to captures" navigation works
    - "Verify this capture" link opens the verification page
    - Mobile layout is usable (375px viewport)
    - All dynamic content uses textContent, not innerHTML
- **Deliverables**: Updated `src/ui/ui-detail.js`, updated `src/ui/ui-css.js`
- **Success criteria**: Detail view shows capture metadata, screenshot, artifacts, handles pending/failed states, links to verification page

### Task 4: Tests, documentation, and polish
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    ## Task: Tests, documentation, and polish

    Write Vitest worker tests for the Web UI, add README documentation, and polish any rough edges.

    ### Context

    The Web UI is functionally complete (Tasks 1-3). This task adds test coverage, documentation, and any final adjustments.

    ### What to build

    **1. Vitest worker tests (`test/ui-dashboard.test.js`)**

    Follow the exact pattern from `test/verify-page.test.js` and `test/verify-html.test.js`. Test the `htmlDashboard()` function and the `GET /ui` route.

    Tests to write:
    - **Response basics**: `GET /ui` returns 200, `Content-Type: text/html;charset=UTF-8`
    - **CSP header**: Response includes correct `Content-Security-Policy` header matching the specified policy
    - **Cache-Control**: Response includes `no-store`
    - **HTML structure**: Response body contains `<!DOCTYPE html>`, `<html lang="en">`, viewport meta, `<div id="app">`, `<noscript>` fallback
    - **Design system**: Response body includes design system CSS tokens (`--color-text`, `--color-primary`, etc.)
    - **No external resources**: HTML does not contain `<script src=`, `<link rel="stylesheet" href=`, or any external URL references
    - **Security**: HTML does not contain banned dynamic code patterns (the `Function` constructor, or DOM-replacing write methods)
    - **Auth gate markup**: HTML contains the auth gate elements (password input, connect button)
    - **View markup**: HTML contains the rendering functions for all three views

    For route-level tests using `SELF.fetch()`:
    - `GET /ui` returns 200 with HTML
    - Response has all expected security headers
    - Other HTTP methods on `/ui` return 405 or fall through to 404

    **2. README update**

    Add a "Web UI" section to `README.md`, positioned after the "MCP Server" section and before "Development". Follow the exact pattern of the MCP Server section (brief, with a link if needed). Content:

    ```
    ## Web UI

    WRL includes a browser-based interface for submitting captures and browsing
    results. Navigate to `/ui` on your WRL deployment to access it. Authentication
    requires a WRL API key with `capture` and `read` scopes.

    The UI is served directly from the Worker -- no separate hosting or CORS
    configuration required.
    ```

    **3. Polish items**
    - Review all views for consistent use of design system tokens (no hardcoded colors)
    - Verify mobile layout at 375px viewport width (all touch targets >= 44px)
    - Verify all `aria-live` regions are correct for status updates
    - Verify `document.title` updates on each view change
    - Add `// === VIEW: SUBMIT ===`, `// === VIEW: LIST ===`, `// === VIEW: DETAIL ===` comment banners at concatenation points in the shell's script block for DevTools orientation
    - Add a comment in `src/index.js` near the UI route noting that the UI depends on same-origin API access (no CORS needed)

    ### Files to reference

    - `test/verify-page.test.js` -- the test pattern to follow
    - `test/verify-html.test.js` -- another test pattern for HTML responses
    - `README.md` -- where to add the Web UI section
    - `src/ui/ui-shell.js` -- the function under test
    - `src/index.js` -- the route under test

    ### What NOT to do

    - Do NOT write E2E/Playwright browser tests -- those are deferred to a follow-up
    - Do NOT write a separate `docs/web-ui.md` guide -- the UI should be self-documenting
    - Do NOT modify the OpenAPI spec (`openapi.yaml`) -- no API changes were made
    - Do NOT add visual regression tests

    ### Deliverables

    - `test/ui-dashboard.test.js` -- Vitest worker tests for the UI
    - Updated `README.md` -- Web UI section added
    - Polish fixes across `src/ui/` files

    ### Success criteria

    - All new tests pass with `npm test`
    - Tests verify CSP, HTML structure, security patterns, and design system compliance
    - README includes the Web UI section
    - No hardcoded color values in any `src/ui/` file
    - Comment banners present in the assembled script block
- **Deliverables**: `test/ui-dashboard.test.js`, updated `README.md`, polish fixes
- **Success criteria**: Tests pass, README updated, all CSS uses design system tokens, accessibility basics verified

### Cross-Cutting Coverage

- **Testing**: Covered by Task 4 (Vitest worker tests for HTML generators and routes). E2E browser tests deferred to follow-up -- the client-side JS is thin vanilla code and the primary value of tests is verifying server-side HTML generation, CSP, and security headers, which Vitest handles well. Phase 6 will run the test suite.
- **Security**: Integrated throughout all tasks. Auth model: sessionStorage + Bearer header (no cookies, no CSRF). CSP specified explicitly in Task 1. XSS prevention via textContent-only rendering enforced in Tasks 2-3. safeUrl validation for all displayed links. Rate limit handling (429) in the apiFetch wrapper. Task 4 tests verify security properties. Phase 5 code review will audit the implementation.
- **Usability -- Strategy**: ux-strategy-minion's recommendations are embedded in the task designs: combined form+list view (no unnecessary navigation), inline auth gate (not a separate page), empty state IS the form with guidance, sessionStorage (not localStorage) for evaluator security posture, minimal views (submit, list, detail -- no settings, no filtering).
- **Usability -- Design**: Design system already exists with tokens and components. No new UI patterns beyond navigation bar. accessibility-minion review deferred to Phase 3.5 (architecture review). Mobile responsiveness specified in all tasks (375px viewport, 44px touch targets, card layout on mobile, 16px input font-size).
- **Documentation**: Covered by Task 4 (README section). Inline help text written as part of Tasks 1-2 (auth gate copy, empty state guidance, form labels/placeholders, error messages). No separate user guide -- the UI is self-documenting per software-docs-minion recommendation. Phase 8 will assess documentation completeness.
- **Observability**: Not needed. The UI introduces no new runtime components, background processes, or APIs. It consumes existing endpoints that already have logging, rate limiting, and error handling. All requests flow through the same Worker handler with existing Coralogix logging.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: The plan produces user-facing HTML with dynamic view switching, form inputs, and status polling updates -- all of which have WCAG implications (focus management, aria-live regions, keyboard navigation, color contrast).
    Review focus: Verify the plan includes adequate focus management after hash navigation, aria-live for polling updates, keyboard-accessible list items, and that the design system's contrast ratios are preserved.
- **Not selected**:
  - ux-design-minion: The design system already provides all needed visual components. No new visual patterns are being designed -- just assembled from existing tokens. The UI follows the verify-page.js visual language.
  - observability-minion: No new runtime services, APIs, or background processes. The UI consumes existing endpoints with existing logging.
  - sitespeed-minion: The page is a single Worker-served HTML response with inline CSS/JS. No external resources, no bundle optimization needed. Performance is bounded by the Worker's response time, which is already fast.
  - user-docs-minion: The UI is self-documenting with inline help. The README mention (Task 4) covers discovery. No user guide warranted for 3 views.

### Decisions

- **sessionStorage vs localStorage for API key**
  Chosen: sessionStorage (per-tab, cleared on tab close)
  Over: localStorage (persists across sessions and tabs), as recommended by frontend-minion
  Why: security-minion correctly identified that sessionStorage is the better security posture for bearer tokens. The target user is an evaluator, not a daily operator -- ephemeral storage is appropriate. Frontend-minion initially recommended localStorage but the security argument is stronger. If daily-operator use emerges, a "remember me" checkbox can be added later.

- **Combined form+list view vs separate submit page**
  Chosen: Single combined view at `#/captures` with form above list
  Over: Separate `#/submit` route for the form (frontend-minion's initial routing proposal)
  Why: ux-strategy-minion's analysis is convincing -- the combined view eliminates navigation, provides immediate feedback (pending item appears in list), and reduces the flow to paste-paste-wait-see. The form is always visible, which makes the empty state natural.

- **No verify-page.js refactoring for shared utilities**
  Chosen: Duplicate small utility functions (safeUrl, relative time) inline in the UI modules
  Over: Extracting shared rendering utilities from verify-page.js (ux-strategy-minion's suggestion)
  Why: ux-strategy-minion identified the risk correctly -- refactoring verify-page.js risks regressions on a public-facing trust surface. The duplicated functions are ~10 lines each. YAGNI: consolidate only if both evolve and diverge in ways that cause real maintenance pain.

- **No hasWacz API change**
  Chosen: Ship the UI with the existing API response shape
  Over: Adding `hasWacz` boolean to the list response (api-design-minion's suggestion)
  Why: The enhancement is sensible but out of scope for the UI task. The UI does not need to display WACZ status in the list view for MVP. If needed later, it is a one-line additive change that can be shipped independently.

- **E2E tests deferred**
  Chosen: Vitest worker tests for HTML generators and routes only
  Over: Including 3-4 Playwright E2E browser tests (test-minion's Tier 3)
  Why: test-minion identified a real risk -- `@cloudflare/playwright` is for browser rendering inside Workers, not test automation. Using standard `@playwright/test` requires a different CI setup. The client-side JS is thin enough that Vitest tests on the HTML output plus Phase 5 code review provide adequate coverage for MVP. E2E tests are a natural follow-up.

### Risks and Mitigations

1. **XSS leading to API key theft** (High impact, Low likelihood)
   Mitigation: Strict CSP (`default-src 'none'`), textContent-only rendering, safeUrl validation, no external scripts. Task 4 tests verify security patterns. Phase 5 code review will specifically audit for innerHTML usage with API data.

2. **Template string size degrades DevTools experience** (Low impact, Medium likelihood)
   Mitigation: Comment banners at concatenation points (`// === VIEW: SUBMIT ===`). Each source file is independently editable at 200-400 lines. Source maps are not available (no build step), so browser console line numbers reference the concatenated output -- this is an accepted trade-off.

3. **Polling battery/data impact on mobile** (Medium impact, Low likelihood)
   Mitigation: setTimeout (not setInterval), respect Retry-After, cap at 120s, pause when tab is backgrounded via visibilityState API.

4. **iOS input zoom** (Low impact, Medium likelihood)
   Mitigation: font-size 1rem (16px) on all input elements, specified in Task 1 CSS.

5. **API key scope mismatch** (Low impact, Low likelihood)
   The UI requires both `capture` and `read` scopes. Existing tenant keys may not have both. Mitigation: The auth gate validation call (`GET /v1/captures?limit=1`) will fail for capture-only keys, providing clear feedback. Documentation in the README mentions both scopes are required.

### Execution Order

```
Batch 1: Task 1 (shell, router, auth, CSS)
  |
  v
  APPROVAL GATE: Review shell architecture, auth model, file structure
  |
  v
Batch 2: Task 2 (combined submit + list view)
  |
  v
Batch 3: Task 3 (detail view)
  |
  v
Batch 4: Task 4 (tests, docs, polish)
```

All tasks are sequential because each builds on the previous. Task 1 is gated because it establishes the architecture. Tasks 2-4 do not need gates -- they are additive implementation within the architecture.

### Verification Steps

After all tasks complete:
1. `npm test` passes (including new UI tests)
2. `wrangler dev` serves the UI at `/ui` with working auth gate, form submission, list, and detail views
3. Mobile viewport (375px) is usable for all views
4. Browser DevTools shows no CSP violations, no console errors
5. No external resource loads (network tab shows only same-origin requests)
6. Auth gate correctly blocks access without a valid key
7. Disconnect clears the key and returns to auth gate
8. Capture submission creates a pending item, polling resolves it to complete/failed
