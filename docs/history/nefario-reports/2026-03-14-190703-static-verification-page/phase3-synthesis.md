# Phase 3: Synthesis -- Static Verification Page

## Delegation Plan

**Team name**: static-verification-page
**Description**: Add content negotiation to the existing `/v1/verify/{id}` endpoint so browsers receive a self-contained HTML verification page with inlined CSS and vanilla JS. Non-technical users can open a verification link in a browser, see a verified/unverified badge and screenshot, and understand the result without using curl.

---

### Conflict Resolutions

#### Conflict 1: URL Privacy -- Server-side Rendering vs. Client-side Fetch

**The Issue Spec is Clear**: The issue says "This is NOT a server-side rendered page" and the JS "calls `GET /v1/verify/{id}` API, renders result." Multiple specialists (ux-design-minion, ux-strategy-minion) recommended server-side rendering, but the issue spec explicitly prescribes client-side fetching.

**Resolution**: Follow the issue spec. The HTML page contains a static template with inlined CSS and JS. The JS fetches the JSON verify endpoint (same URL, `Accept: application/json`) and renders the result client-side using `textContent` (never `innerHTML`).

**URL Availability**: The verify JSON response deliberately excludes `capture.url` (Decision 5 from Phase 0009 -- security rationale: public cached endpoint should not expose potentially sensitive URLs). The issue spec says "shows: URL" but the JSON API does not provide it. **We do NOT modify the JSON API contract.** Instead, the page constructs the capture URL from the ID pattern (`/v1/captures/{id}`) and fetches only the URL field from the retrieval endpoint. Wait -- the retrieval endpoint uses `private, no-store` specifically to protect URLs from public caching. If the verification page (which is publicly cached) fetches the retrieval endpoint client-side... the browser makes a private request that returns the URL, and the URL is displayed in the browser. This is actually fine: the retrieval endpoint requires the capture ID (which is the access secret), and the user already has it (it's in the verification URL they were given). The URL is fetched per-user from the browser, not embedded in a publicly cached response.

**Final decision**: The HTML page makes two client-side fetches:
1. `GET /v1/verify/{id}` with `Accept: application/json` -- for verification result
2. `GET /v1/captures/{id}` -- for `url` and `artifacts.screenshot` fields

This keeps the JSON API contract unchanged, preserves the security model (URL never in the publicly cached HTML payload), and satisfies the issue spec requirement to show the URL.

#### Conflict 2: Screenshot Delivery and "Zero External HTTP Requests"

**ux-design-minion** recommends `<img src="/v1/captures/{id}/artifacts/screenshot">` (same-origin request, not inlined base64). **security-minion** raises that this is a same-origin request and questions whether it violates the acceptance criterion.

**Resolution**: "Zero external HTTP requests" means no third-party requests (CDN fonts, analytics, trackers). Same-origin API calls to the Worker's own endpoints are not "external" -- they are the page fetching its own data. The `<img>` tag approach is correct: keeps HTML payload small, leverages existing artifact endpoint with immutable caching, loads progressively. The screenshot URL is constructed from the capture ID: `/v1/captures/{id}/artifacts/screenshot`.

#### Conflict 3: CSP -- Nonce vs. `'unsafe-inline'`

**security-minion** strongly recommends nonce-based CSP. **edge-minion** says `'unsafe-inline'` is sufficient for MVP since the page is entirely self-contained with no user input reflected into script/style blocks.

**Resolution**: Use `'unsafe-inline'` for MVP. The script and style blocks are static template strings -- no dynamic data is interpolated into them (all dynamic data is inserted via `textContent` in JS, not server-side into the `<script>` tag). A nonce adds per-request overhead and complexity for zero security benefit when the inline content is static. This matches edge-minion's analysis and is consistent with the project's KISS philosophy. If the template later needs dynamic server-side data inside script/style blocks, upgrade to nonce-based CSP at that point.

However, we DO still need `connect-src 'self'` in the CSP since the page makes fetch calls to the same origin. And `img-src 'self'` since the screenshot is loaded from a same-origin endpoint.

**Final CSP**: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`

#### Conflict 4: Server-side Rendering vs. Client-side Architecture

**ux-design-minion** explicitly states "The Worker should render the verification result directly into the HTML." **The issue spec** says "This is NOT a server-side rendered page" and "the `<noscript>` fallback (capture ID + API link) is the accessibility floor, not full SSR."

**Resolution**: Follow the issue spec. Client-side JS fetch and render. The Worker serves a static HTML shell with inlined CSS and JS. The JS fetches the verification data and renders it into the DOM using `textContent`. The `<noscript>` block shows capture ID and JSON API link only -- it is deliberately minimal per the issue spec.

This means ux-design-minion's recommendation for server-side data embedding is rejected. The trade-off is a brief loading state (the JS must fetch before displaying results), but this is acceptable for a single-fetch page that will complete in well under 300ms from the edge.

#### Conflict 5: HSTS Header

**security-minion** recommends adding HSTS now (Step 7) instead of waiting for Step 8.

**Resolution**: Defer to Step 8 as originally planned. Adding HSTS is a global decision affecting all responses, not scoped to the verification page. Adding it in a Step 7 PR that is supposed to be about HTML verification would be scope creep. Mark it as a note for the Step 8 implementation.

---

### Task 1: HTML Verification Page Module
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This is the primary deliverable -- the HTML template, CSS, and JS that define the user-facing verification experience. It establishes the client-side architecture (fetch pattern, DOM manipulation, error handling) that all other tasks depend on. Hard to reverse once downstream integration tests are written against the HTML structure.
- **Prompt**: |
    ## Task: Create `src/verify-page.js` -- HTML Verification Page Module

    Create a new module `src/verify-page.js` that exports a single function
    to generate the HTML verification page response. This is the core
    deliverable of MVP Step 7 (GitHub Issue #7).

    ### Architecture

    The function receives the capture ID and origin URL, and returns a
    `Response` object containing a self-contained HTML page. The HTML page
    uses client-side JavaScript to fetch verification data -- it is NOT
    server-side rendered.

    ```js
    // src/verify-page.js
    export function htmlVerifyResponse(captureId, origin, cacheControl) {
      // Returns a Response with Content-Type: text/html; charset=utf-8
      // The HTML is a static template string with captureId and origin
      // interpolated into the JS fetch URLs only
    }
    ```

    Parameters:
    - `captureId` (string): e.g., `cap_ffffffffffffffffffffffffffffffff`
        -- already regex-validated (`cap_[a-f0-9]{32}`), safe for HTML interpolation
    - `origin` (string): e.g., `https://wrl.example.com` -- the Worker's origin,
        used to construct absolute API URLs in the JS
    - `cacheControl` (string): The Cache-Control header value -- caller decides
        caching policy

    Why the function receives `captureId` and `origin` instead of the full
    verification result: the issue spec says "This is NOT a server-side
    rendered page." The page's JS fetches the data client-side.

    ### Client-side JS Behavior

    The inlined `<script>` makes two fetch calls on page load:

    1. `GET {origin}/v1/verify/{captureId}` with header `Accept: application/json`
       -- returns the verification result (verified, checks, signing, capture metadata)

    2. `GET {origin}/v1/captures/{captureId}` -- returns the retrieval response
       which includes `url` and `artifacts.screenshot` URL

    IMPORTANT: The verify JSON API deliberately excludes `capture.url` (security
    decision from Phase 0009). The URL comes from the retrieval endpoint. The
    retrieval endpoint also provides the screenshot artifact URL.

    After both fetches complete, render the data into the DOM using ONLY
    `textContent` or `setAttribute`. NEVER use `innerHTML`, `outerHTML`,
    `insertAdjacentHTML`, or `document.write` with any fetched data. This is
    the primary XSS defense.

    SECURITY: For the captured URL, if you create a clickable `<a>` link,
    validate the URL scheme before setting `href` -- only allow `http:` and
    `https:`. A captured URL could theoretically contain `javascript:`.

    SECURITY: The inline JS fetch to the verify endpoint MUST set
    `Accept: application/json` explicitly. Without this, the browser's
    default Accept header includes `text/html`, which would trigger content
    negotiation and return HTML instead of JSON (infinite loop).

    ### Data Shape (from existing verify endpoint -- DO NOT MODIFY)

    Verify response (`GET /v1/verify/{id}`):
    ```json
    {
      "verified": true,
      "capture": { "id": "cap_...", "createdAt": "...", "completedAt": "..." },
      "signing": { "bundleHash": "sha256:...", "signature": "...", "publicKey": "...", "signedAt": "..." },
      "checks": [
        { "name": "artifactHashes", "status": "pass" },
        { "name": "bundleHash", "status": "pass" },
        { "name": "signature", "status": "pass", "detail": "..." }
      ]
    }
    ```

    Retrieval response (`GET /v1/captures/{id}`):
    ```json
    {
      "id": "cap_...",
      "url": "https://example.com/page",
      "artifacts": { "screenshot": "https://wrl.example.com/v1/captures/cap_.../artifacts/screenshot" }
    }
    ```

    ### HTML Structure and Design

    This is a **trust document** -- a certificate verification page, not a
    dashboard. Design principles:
    - Single column, max-width 640px, centered
    - System font stack (zero external HTTP requests, including fonts)
    - Restrained palette: neutral grays with green for verified, red for unverified
    - Status uses icon + color + text (never color alone)

    #### Information Architecture (top to bottom):

    1. **Header** -- Text-only "Web Resource Ledger" wordmark. No logo image.

    2. **Status Banner** -- The single most important element. Verified or
       unverified, large and unambiguous. Must be visible within first viewport.
       - Verified: muted green background, checkmark icon (inline SVG), text "Verified"
       - Unverified: muted red background, X icon (inline SVG), text "Verification Failed"
       - Both states look "correct" -- the system is reporting a finding, not an error

    3. **Capture Metadata** -- URL and timestamp.
       - URL: displayed as text (with word-break for long URLs)
       - Timestamp: human-readable format using `Intl.DateTimeFormat` for the
         user's locale. Show both absolute and relative time.

    4. **Verification Checks** -- Always visible (not collapsed). Each check is a row:
       - Status icon: inline SVG (checkmark for pass, X for fail, dash for skip)
       - Human-readable label (NOT the API field name):
         * `artifactHashes` -> "File integrity"
         * `bundleHash` -> "Bundle integrity"
         * `signature` -> "Digital signature"
       - One-line description for each check explaining what it means in plain English
       - If a check has a `detail` field, show it as a second line in muted text

    5. **Screenshot** -- `<img>` tag pointing to the screenshot artifact URL
       from the retrieval response. NOT base64 inlined (screenshots can be 1MB+).
       - Default: max-height 480px with overflow hidden and gradient fade
       - "View full screenshot" button to expand (JS toggle, add/remove CSS class)
       - `onerror` handler shows "Screenshot not available" placeholder
       - Alt text: "Screenshot of {url} captured on {date}"

    6. **Cryptographic Details** -- Collapsed by default using `<details>/<summary>`.
       Works without JS. Shows: bundle hash (monospace), signing algorithm,
       signed timestamp.

    7. **Footer** -- Minimal: "Verified by Web Resource Ledger"

    #### Loading State

    Since the page fetches data client-side, show a brief loading state:
    - A centered, subtle loading indicator (CSS-only spinner or pulsing dots)
    - Replace with actual content once fetches complete
    - Keep it simple -- the fetch will be fast from the edge

    #### Error States (in the JS)

    Handle fetch failures gracefully:
    - 404: "No capture found with this ID."
    - 429: "Too many requests. Please try again in a moment."
    - 503: "Verification service temporarily unavailable."
    - Network error: "Could not connect to the verification service."
    - Each error state should feel designed, not like a crash

    If the retrieval fetch fails but verification succeeds, still show the
    verification result -- just without the URL and screenshot. Degrade
    gracefully.

    #### `<noscript>` Fallback

    Per the issue spec, the `<noscript>` block shows:
    - The capture ID (interpolated server-side -- safe because it is regex-validated
      hex characters only)
    - A direct link to the JSON API endpoint: `{origin}/v1/verify/{captureId}`
    - Brief text: "This page requires JavaScript to display the full verification
      result. You can access the raw verification data at the link above."
    - Do NOT include the captured URL in `<noscript>` (it would require
      server-side fetching and HTML escaping of user-controlled data)

    Apply `escapeHtml()` to the capture ID even though it is regex-safe
    (defense-in-depth):

    ```js
    function escapeHtml(str) {
      if (typeof str !== 'string') return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }
    ```

    ### CSS Specification

    All CSS inlined in a `<style>` tag. Use CSS custom properties for colors:

    ```
    --color-bg: #ffffff
    --color-text: #212121
    --color-text-muted: #757575
    --color-border: #e0e0e0
    --color-surface: #fafafa
    --color-pass: #2e7d32
    --color-pass-bg: #e8f5e9
    --color-fail: #c62828
    --color-fail-bg: #fce4ec
    --color-skip: #757575
    --color-link: #1565c0
    ```

    Typography:
    - System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
    - Monospace for hashes: `"SF Mono", "Fira Code", Menlo, Consolas, monospace`
    - Status text: 24px, font-weight 600
    - Body: 15px, line-height 1.5
    - Muted: 13px, color #757575

    Responsive: mobile-first, breakpoint at 640px.
    - Base: 16px padding, 20px status text, 320px screenshot max-height
    - 640px+: 40px padding, 24px status text, 480px screenshot max-height

    BEM-lite naming (`.status`, `.status--verified`, `.check`, `.check--pass`).

    Inline SVG icons for check/X/dash (use `currentColor` for fill, `aria-hidden="true"`).

    Focus indicators: use `:focus-visible` with 2px solid outline.

    `@media (prefers-reduced-motion: reduce)` -- disable any transitions.

    ### Accessibility

    - `<html lang="en">`
    - `<title>Verification: {captureId} - Web Resource Ledger</title>` (captureId only in title, not URL)
    - Semantic HTML: `<header>`, `<main>`, `<section aria-label="...">`, `<footer>`
    - Heading hierarchy: h1 (status), h2 (each section)
    - Screen reader: status text in h1 conveys result without visual context
    - Check status: include visually hidden text (`.sr-only`) for pass/fail/skip
      alongside icon
    - Image alt text: descriptive ("Screenshot of {url} captured on {date}")
    - Hash values: `aria-label` on container ("SHA-256 bundle hash")

    ### Response Headers

    The function returns a `Response` with these headers:

    ```
    Content-Type: text/html; charset=utf-8
    Cache-Control: {cacheControl parameter}
    Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
    X-Frame-Options: DENY
    Vary: Accept
    ```

    Note: `Referrer-Policy` and `X-Content-Type-Options` are already set
    globally in `index.js` (lines 47-48) and do not need to be set here.

    `Vary: Accept` MUST be set on this response. The caller (index.js) must
    also set `Vary: Accept` on the JSON response path.

    ### What NOT to Do

    - Do NOT modify `src/index.js` -- that is Task 2's responsibility
    - Do NOT modify any existing source files
    - Do NOT add any npm dependencies
    - Do NOT use any template engine or library
    - Do NOT use innerHTML with any fetched data
    - Do NOT server-side render the verification result into the HTML
    - Do NOT embed the screenshot as base64
    - Do NOT add `<link>`, `<script src>`, or any element that would trigger
      an external HTTP request
    - Do NOT use jQuery, React, or any framework
    - No dark mode (not in MVP scope)
    - No locale/i18n beyond Intl.DateTimeFormat for timestamps

    ### Deliverables

    Single file: `src/verify-page.js` exporting:
    - `htmlVerifyResponse(captureId, origin, cacheControl)` -- returns Response
    - `escapeHtml(str)` -- exported for testing (named export)

    Estimated size: ~200-300 lines (template string with CSS + JS + HTML).

    ### Engineering Philosophy (from CLAUDE.md)

    - YAGNI -- don't build it until you need it
    - KISS -- simple beats elegant
    - Lean and Mean -- minimize code actively
    - Vanilla JS/CSS/HTML -- no frameworks
    - <300ms response time (this is a static HTML string, should be sub-millisecond)

    Include `// tva` in the file where a comment looks natural.

- **Deliverables**: `src/verify-page.js` with `htmlVerifyResponse` and `escapeHtml` exports
- **Success criteria**: The function produces a valid HTML page with inlined CSS and JS that, when served by a browser, fetches verification data and renders it. The HTML contains no external resource references. The `<noscript>` block contains the capture ID and API link. All security headers are set on the Response.

---

### Task 2: Content Negotiation Integration in Worker
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Add Content Negotiation to `handleVerifyCapture` in `src/index.js`

    Add an `Accept` header check at the end of `handleVerifyCapture` in
    `src/index.js` to serve HTML when a browser requests the verification URL.

    ### What to Change

    **File: `src/index.js`**

    1. Add import at the top:
       ```js
       import { htmlVerifyResponse } from './verify-page.js';
       ```

    2. In `handleVerifyCapture`, after Step 7 (building the response body) and
       Step 8 (determining cacheControl), add the content negotiation check
       BEFORE the return statement:

       ```js
       // Step 9: Content negotiation -- serve HTML to browsers
       const accept = request.headers.get('Accept') || '';
       if (accept.includes('text/html')) {
         return htmlVerifyResponse(captureId, new URL(request.url).origin, cacheControl);
       }
       ```

    3. Add `Vary: Accept` to the JSON response (the existing return statement):
       ```js
       return jsonResponse(body, 200, {
         'Cache-Control': cacheControl,
         'Access-Control-Allow-Origin': '*',
         'Vary': 'Accept',
       });
       ```

    This adds approximately 5 lines to `index.js`.

    ### Content Negotiation Rules

    - If `Accept` header contains `text/html` -> serve HTML
    - Otherwise (including `*/*`, `application/json`, absent header) -> serve JSON
    - JSON is the default. This preserves backward compatibility.
    - `Accept: */*` (sent by curl) MUST return JSON, not HTML.
    - The `text/html` check is intentionally simple (no quality-value parsing).
      Full RFC 9110 conneg is YAGNI.

    ### Important Details

    - The HTML path passes `captureId` and `origin` to `htmlVerifyResponse`,
      NOT the verification result body. The HTML page fetches its own data
      client-side.
    - `Vary: Accept` must be on BOTH the JSON and HTML responses. The HTML
      response already has it (set in `verify-page.js`). You must add it to
      the JSON response path.
    - Error paths (429, 503, 404) do NOT need HTML variants. Keep `problemResponse`
      for all error cases. The `Accept` check only applies to the 200 success path.
      A browser hitting a 404 or 429 will display the JSON problem response --
      acceptable for MVP.
    - Do NOT add `Vary: Accept` to the global response handler (lines 47-48).
      Only the verify endpoint does content negotiation.

    ### What NOT to Change

    - Do NOT modify `src/verify-page.js` (Task 1 owns that)
    - Do NOT modify the verification logic (steps 1-7)
    - Do NOT modify the JSON response shape
    - Do NOT add HTML variants for error responses
    - Do NOT add routes -- content negotiation uses the existing route
    - Do NOT modify `src/responses.js`
    - Do NOT modify `wrangler.toml`
    - Do NOT add quality-value parsing for Accept headers

    ### Deliverables

    Modified file: `src/index.js` with:
    - Import of `htmlVerifyResponse`
    - Accept header check in `handleVerifyCapture`
    - `Vary: Accept` on the JSON response

- **Deliverables**: Modified `src/index.js` with content negotiation logic
- **Success criteria**: `Accept: text/html` returns HTML; default/absent/`*/*`/`application/json` returns JSON; `Vary: Accept` is present on both response types.

---

### Task 3: Unit Tests for HTML Generation
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Unit Tests for `src/verify-page.js`

    Create `test/verify-page.test.js` with unit tests for the HTML generation
    function. These tests exercise the pure function directly, without Worker
    infrastructure.

    ### Import

    ```js
    import { htmlVerifyResponse, escapeHtml } from '../src/verify-page.js';
    ```

    ### Function Signature

    ```js
    htmlVerifyResponse(captureId, origin, cacheControl) -> Response
    ```

    - `captureId`: string like `cap_ffffffffffffffffffffffffffffffff`
    - `origin`: string like `https://worker.test`
    - `cacheControl`: string like `public, max-age=86400, stale-while-revalidate=604800`

    ### Test Strategy

    Use string assertions on `await response.text()`. Do NOT use DOM parsing
    (no jsdom, linkedom, happy-dom). The project runs in workerd (Cloudflare's
    runtime), not Node.js. String matching via `toContain()` and `toMatch()` is
    correct for this environment.

    Do NOT use snapshot testing. Large HTML snapshots break constantly and get
    blindly updated.

    ### Test Cases

    **Response structure:**
    1. Returns a Response object with status 200
    2. Content-Type is `text/html; charset=utf-8`
    3. Cache-Control matches the provided parameter
    4. CSP header is present with `default-src 'none'`
    5. `X-Frame-Options: DENY` is present
    6. `Vary: Accept` is present

    **HTML content:**
    7. Contains `<!DOCTYPE html>` and `<html lang="en">`
    8. Contains the capture ID in the noscript block
    9. Contains a link to the JSON API endpoint in noscript: `/v1/verify/{captureId}`
    10. Contains `<noscript>` tag
    11. Contains the API fetch URL pattern with the captureId
    12. Does NOT contain the origin's raw URL in a way that suggests external requests
    13. Contains inline `<style>` and `<script>` tags (no external resources)
    14. Does NOT contain `<link rel="stylesheet"` or `<script src="`

    **escapeHtml function:**
    15. Escapes `<` to `&lt;`
    16. Escapes `>` to `&gt;`
    17. Escapes `&` to `&amp;`
    18. Escapes `"` to `&quot;`
    19. Escapes `'` to `&#x27;`
    20. Returns empty string for non-string input
    21. Returns the same string if no special characters

    **Security:**
    22. The capture ID in the HTML is escaped (even though hex-safe)
    23. The HTML does not contain `innerHTML` (verify the template string itself
        does not use innerHTML for dynamic data insertion -- search for the
        literal string in the JS portion of the template)

    ### Test File Pattern

    Follow the existing pattern in the project. Use vitest:

    ```js
    import { describe, it, expect } from 'vitest';
    ```

    Group tests with describe blocks: 'htmlVerifyResponse -- response headers',
    'htmlVerifyResponse -- HTML content', 'escapeHtml'.

    ### What NOT to Do

    - Do NOT import or use `SELF`, `env`, or `fetchMock` from `cloudflare:test`
      (those are for integration tests)
    - Do NOT add any npm dependencies
    - Do NOT test the content negotiation logic (that is Task 4's scope)
    - Do NOT parse the HTML with a DOM parser
    - Do NOT use snapshot testing

    ### Deliverables

    Single file: `test/verify-page.test.js`

    Estimated test count: 18-23 tests.

- **Deliverables**: `test/verify-page.test.js` with unit tests
- **Success criteria**: All tests pass. Tests cover response headers, HTML structure, noscript content, escapeHtml, and security assertions.

---

### Task 4: Integration Tests for Content Negotiation
- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Integration Tests for Content Negotiation

    Create `test/verify-html.test.js` with integration tests that exercise the
    full Worker content negotiation through `SELF.fetch()`. These tests verify
    that the Accept header correctly routes to HTML or JSON responses.

    ### Test Infrastructure

    Use the same pattern as `test/verify-integration.test.js`:

    ```js
    import { env, SELF, fetchMock } from 'cloudflare:test';
    import { describe, it, expect, beforeEach, afterEach } from 'vitest';
    import { performCapture } from '../src/capture.js';
    import { createCapture } from '../src/kv.js';
    ```

    The beforeEach/afterEach setup should mirror `verify-integration.test.js`:
    create a real capture with a signed WACZ using `performCapture`. This gives
    us a valid capture ID that the verify endpoint can process.

    ### Test Cases

    **Content negotiation -- Accept header routing:**
    1. `Accept: text/html` -> returns HTML (Content-Type: text/html)
    2. `Accept: application/json` -> returns JSON (Content-Type: application/json)
    3. No Accept header -> returns JSON (backward compatibility)
    4. `Accept: */*` -> returns JSON (curl default)
    5. `Accept: text/html, application/json` -> returns HTML (browser default)
    6. `Accept: text/html, */*` -> returns HTML
    7. `Accept: text/plain` -> returns JSON (unknown type fallback)
    8. `Accept: application/xml` -> returns JSON
    9. Empty Accept header -> returns JSON

    **HTML response correctness:**
    10. HTML response status is 200
    11. HTML response has `Content-Type: text/html; charset=utf-8`
    12. HTML response has `Content-Security-Policy` header with `default-src 'none'`
    13. HTML response has `X-Frame-Options: DENY`
    14. HTML response has `Vary: Accept`
    15. HTML response has `Referrer-Policy: no-referrer` (set globally)
    16. HTML response has `X-Content-Type-Options: nosniff` (set globally)

    **Vary header on JSON responses:**
    17. JSON response (default Accept) has `Vary: Accept`
    18. JSON response (`Accept: application/json`) has `Vary: Accept`

    **Cache-Control parity:**
    19. HTML response for verified capture has same Cache-Control as JSON
        (`public, max-age=...`)
    20. Both HTML and JSON 200 responses share the same cache strategy

    **JSON API regression guard:**
    21. JSON response shape is unchanged (has verified, capture, signing, checks)
    22. JSON Content-Type is still `application/json`
    23. `capture.url` is still absent from JSON verify response

    **Error paths stay JSON:**
    24. 404 error path returns `application/problem+json` even with `Accept: text/html`
    25. Rate limit (429) returns problem+json even with `Accept: text/html`

    ### Testing Notes

    - Use `await res.text()` for HTML responses, `await res.json()` for JSON
    - For HTML content assertions, use `toContain()` string checks
    - Do NOT add DOM parsing dependencies
    - To set Accept header: `new Request(url, { headers: { Accept: '...' } })`
      passed to `SELF.fetch()`
    - The existing beforeEach with `performCapture` creates a fully verified
      capture, so `Accept: text/html` on the verify endpoint should return HTML
      for a verified capture

    ### What NOT to Do

    - Do NOT modify existing test files
    - Do NOT modify source files
    - Do NOT add npm dependencies
    - Do NOT test the HTML template content in detail (Task 3 covers that)
    - Do NOT use snapshot testing

    ### Deliverables

    Single file: `test/verify-html.test.js`

    Estimated test count: 20-25 tests.

- **Deliverables**: `test/verify-html.test.js` with integration tests
- **Success criteria**: All tests pass. Content negotiation works correctly for all Accept header variations. JSON API behavior is unchanged. Security headers are present on HTML responses.

---

### Task 5: Evolution Log Documentation
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create Evolution Log for Phase 0010

    Create the evolution log directory and initial files for MVP Step 7:
    Static Verification Page.

    ### Directory: `docs/evolution/0010-static-verification-page/`

    Create three files:

    #### 1. `prompt.md`

    Reference GitHub Issue #7. Include the goal statement: "Browser-accessible
    verification page for non-technical users." Copy or reference the issue text.
    Include the content negotiation approach (Accept header check on existing
    verify endpoint, not a separate route). Note that this was a nefario
    orchestration.

    #### 2. `decisions.md`

    Document these decisions (pre-populate with the decisions that have already
    been made during planning, then note items to be filled in during
    implementation):

    **Decision 1: Content Negotiation on Existing Route**
    - Accept header check at end of `handleVerifyCapture`
    - Simple `text/html` substring match, no quality-value parsing
    - JSON is the default for `*/*`, absent header, and all non-`text/html` types
    - Alternatives rejected: separate URL (e.g., `/v1/verify/{id}/page`) -- would
      mean two cache keys, two rate-limit paths, inconsistent with HTTP semantics

    **Decision 2: Client-Side Fetch (Not Server-Side Rendering)**
    - Issue spec explicitly says "This is NOT a server-side rendered page"
    - HTML is a static shell with inlined JS that fetches from the verify and
      retrieval endpoints
    - UX specialists recommended SSR but issue spec takes precedence
    - Trade-off: brief loading state vs. simpler architecture and no server-side
      HTML escaping of user-controlled data

    **Decision 3: Two Client-Side Fetches**
    - Fetch 1: `GET /v1/verify/{id}` with `Accept: application/json` for
      verification result
    - Fetch 2: `GET /v1/captures/{id}` for URL and screenshot artifact URL
    - Rationale: verify response deliberately excludes `url` (Decision 5 from
      Phase 0009); retrieval endpoint has it but uses `private, no-store`
    - This preserves the security model: URL is never in a publicly cached response

    **Decision 4: `'unsafe-inline'` CSP (Not Nonce-Based)**
    - Script and style blocks are static template strings -- no dynamic data
      interpolated into them
    - Nonce adds per-request overhead for zero security benefit when inline
      content is static
    - security-minion recommended nonces; edge-minion recommended unsafe-inline;
      resolved in favor of simplicity (KISS)
    - Upgrade path clear: switch to nonce if template ever needs server-side
      dynamic data in script blocks

    **Decision 5: Error Paths Stay JSON**
    - 404, 429, 503 error responses remain `application/problem+json`
    - HTML error templates are YAGNI for MVP
    - UX specialist suggested HTML 404 page; deferred as non-essential

    **Decision 6: Screenshot via `<img>` Tag (Not Base64 Inline)**
    - Same-origin request to `/v1/captures/{id}/artifacts/screenshot`
    - "Zero external HTTP requests" means no third-party requests, not no
      same-origin requests
    - Keeps HTML payload ~5KB vs ~1.4MB with inline base64

    **Decision 7: Noscript Fallback Is Minimal**
    - Capture ID + JSON API link only
    - No verification result, no URL (would require SSR + HTML escaping)
    - Issue spec: "the `<noscript>` fallback is the accessibility floor, not full SSR"

    #### 3. `outcome.md`

    Write a placeholder noting it will be filled after implementation. Include
    sections for: Files Changed, Test Results, Deviations, Backlog Changes,
    Surprises.

    ### Also Update

    **`docs/evolution/README.md`**: Add row for Phase 0010:
    ```
    | [0010-static-verification-page](0010-static-verification-page/) | Static verification page with content negotiation (Issue #7) |
    ```

    ### What NOT to Do

    - Do NOT update `docs/backlog.md` yet (that happens in outcome.md after
      implementation)
    - Do NOT create ADR documents
    - Do NOT create C4 diagrams
    - Do NOT create a `process.md` yet (that is written after PR creation)

    ### Deliverables

    - `docs/evolution/0010-static-verification-page/prompt.md`
    - `docs/evolution/0010-static-verification-page/decisions.md`
    - `docs/evolution/0010-static-verification-page/outcome.md` (placeholder)
    - Updated `docs/evolution/README.md`

- **Deliverables**: Evolution log directory with prompt.md, decisions.md, outcome.md placeholder, and updated README.md index
- **Success criteria**: Directory exists with all three files. decisions.md captures the seven key decisions with alternatives and rationale. README.md index includes the new phase.

---

### Cross-Cutting Coverage

| Dimension | Coverage | Justification |
|-----------|----------|---------------|
| **Testing** | Task 3 (unit tests), Task 4 (integration tests) | Two-layer testing strategy: unit tests for HTML generation, integration tests for content negotiation. Phase 6 post-execution runs the full test suite. |
| **Security** | Security constraints embedded in Task 1 and Task 2 prompts | XSS prevention (textContent only, URL scheme validation, escapeHtml), CSP headers, Vary header for cache safety, X-Frame-Options. security-minion's recommendations are incorporated directly into the implementation prompts rather than as a separate task. |
| **Usability -- Strategy** | ux-strategy-minion recommendations incorporated in Task 1 | Two-layer progressive disclosure, human-readable check labels, trust interface design principles, error state handling. All embedded in the frontend-minion prompt. |
| **Usability -- Design** | ux-design-minion visual spec incorporated in Task 1 | Color palette, typography, responsive breakpoints, SVG icons, screenshot display pattern, BEM naming. All embedded in the frontend-minion prompt. |
| **Documentation** | Task 5 (evolution log) | Phase 0010 evolution log with decisions.md capturing all seven planning decisions. Phase 8 post-execution handles any documentation updates. |
| **Observability** | Not included | This task adds a static HTML response to an existing endpoint. No new runtime services, no background processes, no new logging requirements. The existing rate limiting and cache headers apply to HTML responses identically. |

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **accessibility-minion**: The plan produces a user-facing HTML page (Tasks 1, 2) -- the first UI in this project. WCAG compliance review of the HTML template structure, color contrast choices, and screen reader compatibility is warranted before implementation.
- **Not selected**: ux-design-minion (visual spec already fully incorporated in Task 1 prompt), sitespeed-minion (single static HTML page with no complex loading strategy; performance budget is implicitly met by the "zero external requests" constraint), observability-minion (no new runtime components), user-docs-minion (no end-user documentation needed -- the page IS the user interface)

---

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Content negotiation loop: page's JS fetch gets HTML instead of JSON | High | Inline JS MUST set `Accept: application/json` header on the verify fetch. Integration test case #8 in Task 4 verifies this. |
| Missing `Vary: Accept` causes cache poisoning (JSON served to browser or vice versa) | High | `Vary: Accept` set on both HTML and JSON responses. Integration tests #14, #17, #18 verify this. |
| XSS via captured URL rendered in page | High | `textContent` only for DOM insertion. URL scheme validation before setting `a.href`. URL never server-side rendered. |
| Two fetches add latency vs. single SSR | Low | Both fetches are to same-origin edge endpoints. Will complete in <100ms combined. Acceptable for MVP. |
| Retrieval endpoint 404 while verify succeeds (edge case: capture exists but is in weird state) | Low | JS handles retrieval failure gracefully -- shows verification result without URL/screenshot. |
| Large screenshot slows page load on poor connections | Low | Screenshot loads asynchronously via `<img>` tag. Critical content (verification status) renders immediately. `onerror` handler shows placeholder. Immutable cache headers mean second visit is instant. |

---

### Execution Order

```
Batch 1 (parallel, no dependencies):
  Task 1: HTML Verification Page Module [APPROVAL GATE]
  Task 5: Evolution Log Documentation

Batch 2 (blocked by Task 1):
  Task 2: Content Negotiation Integration [blocked by Task 1]
  Task 3: Unit Tests for HTML Generation [blocked by Task 1]

Batch 3 (blocked by Task 2):
  Task 4: Integration Tests for Content Negotiation [blocked by Task 2]

Gate positions:
  - After Task 1: User reviews the HTML template, CSS design, JS architecture
  - Phase 3.5 architecture review: Before Batch 1 begins
```

### Verification Steps

After all tasks complete:

1. **Run full test suite**: `npm test` -- all existing tests plus new tests in
   `test/verify-page.test.js` and `test/verify-html.test.js` must pass.

2. **Manual verification** (via `npx wrangler dev`):
   - Open `http://localhost:8787/v1/verify/{id}` in a browser -- should render
     HTML verification page with badge and screenshot
   - `curl http://localhost:8787/v1/verify/{id}` -- should return JSON (default)
   - `curl -H "Accept: text/html" http://localhost:8787/v1/verify/{id}` -- should
     return HTML
   - Check response headers for CSP, Vary, X-Frame-Options
   - Disable JS in browser -- `<noscript>` shows capture ID and API link

3. **Acceptance criteria from Issue #7**:
   - Open verification URL in a browser -- result renders with verified badge and screenshot
   - Disable JS in browser -- `<noscript>` fallback shows capture ID and a direct API link
   - Zero external HTTP requests from the page (verify via browser DevTools Network tab)
