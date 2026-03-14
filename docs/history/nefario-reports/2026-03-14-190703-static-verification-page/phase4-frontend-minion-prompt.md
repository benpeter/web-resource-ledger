# Task 1: Create `src/verify-page.js` -- HTML Verification Page Module

Create a new module `src/verify-page.js` that exports a single function
to generate the HTML verification page response. This is the core
deliverable of MVP Step 7 (GitHub Issue #7).

## Architecture

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

## Client-side JS Behavior

The inlined `<script>` makes two fetch calls on page load:

1. `GET {origin}/v1/verify/{captureId}` with header `Accept: application/json`
   -- returns the verification result (verified, checks, signing, capture metadata)

2. `GET {origin}/v1/captures/{captureId}` -- returns the retrieval response
   which includes `url` and `artifacts.screenshot` URL

IMPORTANT: The verify JSON API deliberately excludes `capture.url` (security
decision from Phase 0009). The URL comes from the retrieval endpoint. The
retrieval endpoint also provides the screenshot artifact URL.

**IMPORTANT: Fire both fetches in parallel using `Promise.all` (or equivalent).
Do NOT await them sequentially. Sequential fetches double the perceived loading
time on a page whose primary job is to quickly convey a verification result.**

After both fetches complete, render the data into the DOM using ONLY
`textContent` or `setAttribute`. NEVER use `innerHTML`, `outerHTML`,
`insertAdjacentHTML`, or `document.write` with any fetched data. This is
the primary XSS defense.

SECURITY: For the captured URL, if you create a clickable `<a>` link,
validate the URL scheme before setting `href` -- only allow `http:` and
`https:`. A captured URL could theoretically contain `javascript:`.

SECURITY: Apply the same URL scheme validation before setting `img.src`
for the screenshot. The screenshot URL comes from fetched data and could
be attacker-controlled. Only allow `http:` and `https:` schemes.

SECURITY: The inline JS fetch to the verify endpoint MUST set
`Accept: application/json` explicitly. Without this, the browser's
default Accept header includes `text/html`, which would trigger content
negotiation and return HTML instead of JSON (infinite loop).

## Data Shape (from existing verify endpoint -- DO NOT MODIFY)

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

## HTML Structure and Design

This is a **trust document** -- a certificate verification page, not a
dashboard. Design principles:
- Single column, max-width 640px, centered
- System font stack (zero external HTTP requests, including fonts)
- Restrained palette: neutral grays with green for verified, red for unverified
- Status uses icon + color + text (never color alone)

### Information Architecture (top to bottom):

1. **Header** -- Text-only "Web Resource Ledger" wordmark. No logo image.

2. **Status Banner** -- The single most important element. Verified or
   unverified, large and unambiguous. Must be visible within first viewport.
   - Verified: muted green background, checkmark icon (inline SVG), text "Verified"
   - Unverified: muted red background, X icon (inline SVG), text "Verification Failed"
   - Both states look "correct" -- the system is reporting a finding, not an error

3. **Capture Metadata** -- URL and timestamp.
   - URL: displayed as text (with word-break for long URLs)
   - Timestamp: human-readable absolute format using `Intl.DateTimeFormat` for the
     user's locale. **Absolute time only -- do NOT include relative time ("3 days ago").**
     This is a certificate page, not a social feed.

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
   - **Show at full width (`max-width: 100%; height: auto`). No collapse, no
     expand button, no gradient fade, no JS toggle.** If the image is tall, the
     user scrolls -- standard web behavior.
   - `onerror` handler shows "Screenshot not available" placeholder
   - Alt text: "Screenshot of {url} captured on {date}"

6. **Cryptographic Details** -- Collapsed by default using `<details>/<summary>`.
   Works without JS. Shows: bundle hash (monospace), signing algorithm,
   signed timestamp.
   - **The `<summary>` label must be explicitly named: "Cryptographic details"**
   - Ensure `<summary>` is the first child of `<details>`

7. **Footer** -- Minimal: "Verified by Web Resource Ledger"

### Loading State

Since the page fetches data client-side, show a brief loading state:
- A centered, subtle loading indicator (CSS-only spinner or pulsing dots)
- The loading indicator element must have `role="status"` and
  `aria-label="Loading verification result"` so screen readers announce the wait state
- Replace with actual content once fetches complete
- **The h1 must be present in the initial HTML with static text (e.g., "Capture Verification")
  that JS updates once data arrives.** Screen reader users who read the page immediately
  on load will encounter an empty or missing h1 without this.
- **Add `aria-live="polite"` to the container element that transitions from loading state
  to result content**, so screen readers announce when verification results become available.
- Under `@media (prefers-reduced-motion: reduce)`, replace the animated spinner with
  a static "Loading..." text indicator.
- Keep it simple -- the fetch will be fast from the edge

### Error State (in the JS)

**Use a single generic error state** for all fetch failures:
"Could not load verification data. Try refreshing, or use the JSON API link below."
Include the JSON API link (`{origin}/v1/verify/{captureId}`) as a fallback.

Do NOT differentiate between 404, 429, 503, or network errors -- users cannot
take different action per error type, and four branches add code complexity
for no user benefit.

If the retrieval fetch fails but verification succeeds, still show the
verification result -- just without the URL and screenshot. Degrade
gracefully.

### `<noscript>` Fallback

Per the issue spec, the `<noscript>` block shows:
- The capture ID (interpolated server-side -- safe because it is regex-validated
  hex characters only)
- A direct link to the JSON API endpoint: `{origin}/v1/verify/{captureId}`
- Brief text: "This page requires JavaScript to display the full verification
  result. You can access the raw verification data at the link above."
- Do NOT include the captured URL in `<noscript>` (it would require
  server-side fetching and HTML escaping of user-controlled data)

Apply `escapeHtml()` to BOTH the capture ID AND the origin when interpolating
into the noscript block (defense-in-depth):

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

## CSS Specification

All CSS inlined in a `<style>` tag. Design intent:
- **Trust document aesthetic**: clean, restrained, professional
- Single column, max-width 640px, centered
- System font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
- Monospace for hashes: `"SF Mono", "Fira Code", Menlo, Consolas, monospace`
- Neutral grays with green (#2e7d32 range) for verified, red (#c62828 range) for unverified
- **Muted text color must be #6d6d6d or darker** (not #757575) to meet WCAG 1.4.3 AA
  contrast ratio of 4.5:1 against white backgrounds
- Mobile-first, responsive at 640px breakpoint

Use CSS custom properties if you find them helpful, but don't over-engineer --
this is a single self-contained page, not a design system. Keep the CSS minimal
and focused.

Inline SVG icons for check/X/dash (use `currentColor` for fill, `aria-hidden="true"`).

Focus indicators: use `:focus-visible` with 2px solid outline.

`@media (prefers-reduced-motion: reduce)` -- disable any transitions/animations.

## Accessibility

- `<html lang="en">`
- `<title>Verification: {captureId} - Web Resource Ledger</title>` (captureId only in title, not URL)
- Semantic HTML: `<header>`, `<main>`, `<section aria-label="...">`, `<footer>`
- Heading hierarchy: h1 (static "Capture Verification" during load, updated by JS), h2 (each section)
- Screen reader: status text in h1 conveys result without visual context
- Check status: include visually hidden text (`.sr-only`) for pass/fail/skip alongside icon
- Image alt text: descriptive ("Screenshot of {url} captured on {date}")
- Hash values: `aria-label` on container ("SHA-256 bundle hash")
- `aria-live="polite"` on the result container for loading-to-content transition
- `role="status"` on the loading spinner element

## Response Headers

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

## What NOT to Do

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

## Deliverables

Single file: `src/verify-page.js` exporting:
- `htmlVerifyResponse(captureId, origin, cacheControl)` -- returns Response
- `escapeHtml(str)` -- exported for testing (named export)

Estimated size: ~200-300 lines (template string with CSS + JS + HTML).

## Engineering Philosophy (from CLAUDE.md)

- YAGNI -- don't build it until you need it
- KISS -- simple beats elegant
- Lean and Mean -- minimize code actively
- Vanilla JS/CSS/HTML -- no frameworks
- <300ms response time (this is a static HTML string, should be sub-millisecond)

Include `// tva` in the file where a comment looks natural.

## Completion

When you finish, mark the task as completed with TaskUpdate and send a message
to the team lead with:
- File paths with change scope and line counts (e.g., "src/verify-page.js (new HTML verification page module, +N lines)")
- 1-2 sentence summary of what was produced
