# UX Design Minion -- Static Verification Page

## Domain Assessment

This page is a **trust document** -- its primary job is to communicate
verification status to a non-technical person who was sent a link. The
design must convey authority, clarity, and completeness without relying on
external resources, frameworks, or JavaScript for critical information
display.

The closest real-world analog is a **certificate verification page** (like
SSL certificate details or a notary seal). The design language should borrow
from that domain: restrained palette, clear hierarchy, unambiguous status
indicators, and visible cryptographic metadata for those who want it.

---

## Visual Design Specification

### Overall Layout

Single-column, centered layout. Max-width 640px, generous horizontal
padding (24px mobile, 40px desktop). The page reads top-to-bottom as a
linear narrative: "Here is what was captured, here is whether it checks
out."

```
+----------------------------------------------+
|  [WRL wordmark]                              |
+----------------------------------------------+
|                                              |
|  [VERIFIED badge / UNVERIFIED badge]         |
|                                              |
|  Captured URL                                |
|  https://example.com/page                    |
|                                              |
|  Capture timestamp                           |
|  2025-01-15 at 14:32:07 UTC                  |
|                                              |
+----------------------------------------------+
|                                              |
|  Verification Checks                         |
|  [v] Artifact hashes match                   |
|  [v] Bundle hash verified                    |
|  [v] Digital signature valid                 |
|                                              |
+----------------------------------------------+
|                                              |
|  Screenshot Preview                          |
|  +----------------------------------------+  |
|  | [captured screenshot, max-height 480px] |  |
|  | [click/tap to expand]                   |  |
|  +----------------------------------------+  |
|                                              |
+----------------------------------------------+
|                                              |
|  Cryptographic Details (collapsed)           |
|  > Bundle hash: sha256:abcdef...            |
|  > Signing algorithm: Ed25519               |
|  > Public key: base64...                    |
|                                              |
+----------------------------------------------+
|  <noscript> fallback area                    |
+----------------------------------------------+
```

### Information Architecture

The page has five semantic sections, in reading order:

1. **Header** -- Minimal brand mark. Not a full navigation bar. Just
   enough to establish provenance. Text-only "WRL" or "Web Resource Ledger"
   is fine -- no logo image (violates zero-external-requests constraint,
   and an inline SVG logo is unnecessary complexity for MVP).

2. **Status Banner** -- The single most important element. Verified or
   unverified, visible within the first viewport without scrolling.

3. **Capture Metadata** -- URL and timestamp. Two facts that answer "what
   was captured and when."

4. **Verification Checks** -- Three checks with pass/fail/skip indicators.
   Always visible, not collapsed. These are the evidence supporting the
   badge.

5. **Screenshot Preview** -- The captured page, shown at a constrained
   height with expand-to-full capability.

6. **Cryptographic Details** -- SHA-256 hash, algorithm, public key.
   Collapsed by default (using `<details>`/`<summary>` -- works without
   JS). Non-technical users don't need this; technical verifiers do.

### Verified vs. Unverified States

These two states must be **instantly distinguishable** without reading any
text. The differentiation uses shape, color, text, and icon -- never color
alone.

**Verified state:**
- Status banner background: muted green (`#e8f5e9` or similar light green).
  Border-left: 4px solid darker green (`#2e7d32`).
- Icon: checkmark in a circle (inline SVG, no external request).
- Text: "Verified" in large (24px), semi-bold weight.
- Subtext: "All integrity checks passed" in smaller (14px), muted color.
- Overall page tone: neutral/calm. The green banner is the only colored
  element -- everything else is grayscale/neutral.

**Unverified state:**
- Status banner background: muted amber/red (`#fff3e0` for warnings,
  `#fce4ec` for failures).  Border-left: 4px solid darker tone (`#e65100`
  or `#c62828`).
- Icon: X in a circle or warning triangle (inline SVG).
- Text: "Unverified" or "Verification Failed" in large (24px), semi-bold.
- Subtext: "One or more integrity checks did not pass" in smaller, muted.
- The failing checks in the checklist below use red/amber indicators.
- No alarmist design (flashing, excessive red). This is a factual
  statement, not a panic screen. Calm authority, not anxiety.

**Key design principle:** The unverified state does NOT look "broken." It
looks like the system is working correctly and reporting a factual finding.
A broken page would undermine trust in the verification system itself.

### Three Checks Presentation

Each check is a row in a simple list. Each row has:
- **Status icon** (left): Inline SVG circle with checkmark (pass), X
  (fail), or dash (skip). Colors: green (#2e7d32) for pass, red (#c62828)
  for fail, gray (#757575) for skip.
- **Check name** (center): Human-readable label, not the technical key.
  Map: `artifactHashes` -> "Artifact integrity", `bundleHash` -> "Bundle
  hash", `signature` -> "Digital signature".
- **Status text** (right, optional): Only shown for fail/skip, in muted
  smaller text. For pass, the green icon is sufficient.

```
  [green check]  Artifact integrity
  [green check]  Bundle hash
  [red X]        Digital signature          Failed
```

The checks section has a subtle border (1px solid #e0e0e0) and light
background (#fafafa) to visually group them as a unit. No heavy card
shadow -- this is a document, not a dashboard.

If a check has a `detail` string (present on failures), show it as a
second line under the check name in smaller, muted text. This gives
technical users diagnostic information without cluttering the primary
display.

```
  [red X]  Digital signature                       Failed
           Ed25519 signature verification failed
```

### Screenshot Display

The screenshot is the visual proof -- users want to see what was captured.
But full-page screenshots (like the tagesschau.de example in the repo) can
be extremely tall (5000px+). The design must handle this gracefully.

**Default view:** Show the screenshot in a bordered container with
`max-height: 480px` and `overflow: hidden`. A subtle gradient overlay at
the bottom (white to transparent, 60px tall) indicates there is more
content below. Below the gradient, a centered text link: "View full
screenshot."

**Expanded view:** Clicking "View full screenshot" removes the max-height
constraint and hides the gradient. The link text changes to "Collapse
screenshot." This toggle is handled with vanilla JS (add/remove a CSS
class). The `<noscript>` version shows the screenshot at full height with
no toggle -- acceptable since it is a fallback.

**Image source:** The screenshot is NOT embedded as base64 in the HTML
payload. That would double the page weight for large screenshots. Instead,
the Worker renders the page with a `<img>` tag pointing to the existing
artifact endpoint: `/v1/captures/{id}/artifacts/screenshot`. This is a
same-origin request, not an external HTTP request, and the artifact
endpoint already serves the PNG with correct Content-Type and CORS headers.
The image loads naturally after the HTML renders.

**If screenshot is unavailable** (API error, missing artifact): Show a
placeholder box with an icon and text: "Screenshot not available." Same
bordered container, 120px height, centered content, light gray background.
Do not break the page layout.

**Accessibility:** `alt` text on the screenshot image:
`"Screenshot of {url} captured on {date}"`. This is meaningful alt text,
not decorative.

### Typography

System font stack only. Zero external HTTP requests means no Google Fonts,
no CDN fonts.

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

Type scale (using a ~1.25 ratio, conservative for a document page):
- Page title / status text: 24px, font-weight 600
- Section headings: 16px, font-weight 600, uppercase tracking (letter-spacing: 0.05em)
- Body text / labels: 15px, font-weight 400
- Metadata values (URL, hash, timestamp): 15px, font-weight 400, monospace
  for hashes
- Small / muted text: 13px, font-weight 400, color #757575

Monospace stack for cryptographic values:
```css
font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas,
             "DejaVu Sans Mono", monospace;
```

Line-height: 1.5 for body text, 1.3 for headings.

### Color Palette

Minimal. This is a trust document, not a marketing page. The palette is
almost entirely neutral, with color used only for status indication.

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#ffffff` | Page background |
| `--color-text` | `#212121` | Primary text |
| `--color-text-muted` | `#757575` | Secondary text, labels |
| `--color-border` | `#e0e0e0` | Section borders, containers |
| `--color-surface` | `#fafafa` | Checks section bg, details bg |
| `--color-pass` | `#2e7d32` | Pass icon, verified banner border |
| `--color-pass-bg` | `#e8f5e9` | Verified banner background |
| `--color-fail` | `#c62828` | Fail icon, unverified banner border |
| `--color-fail-bg` | `#fce4ec` | Unverified banner background |
| `--color-skip` | `#757575` | Skip icon |
| `--color-skip-bg` | `#f5f5f5` | Skip row background |
| `--color-link` | `#1565c0` | Link text |

These are defined as CSS custom properties at `:root` for easy theming
later (dark mode is not in MVP scope but the token architecture makes it
trivial to add).

APCA contrast check (approximate):
- `#212121` on `#ffffff` = ~Lc 89 (excellent for body text)
- `#757575` on `#ffffff` = ~Lc 52 (adequate for secondary/muted text at 13-15px)
- `#2e7d32` on `#e8f5e9` = ~Lc 48 (adequate for large status text at 24px)
- `#c62828` on `#fce4ec` = ~Lc 52 (adequate for large status text at 24px)
- Status is always conveyed by icon + text + color, never color alone.

### Responsive Behavior

Two breakpoints, mobile-first:

**Base (< 640px):**
- Padding: 16px horizontal
- Status text: 20px (slightly reduced)
- Screenshot container: full width, max-height 320px
- Cryptographic hash values: truncated with ellipsis + "Copy" button,
  shown in full inside `<details>` element
- URL: word-break for long URLs (`overflow-wrap: anywhere`)

**640px+ (tablet/desktop):**
- Max-width: 640px, centered with `margin: 0 auto`
- Padding: 40px horizontal
- Status text: 24px
- Screenshot container: max-height 480px
- Hash values shown in full (they fit at this width)

No horizontal scroll at any viewport width. Long values (URLs, hashes)
must break or truncate gracefully.

### CSS Architecture

All CSS inlined in a `<style>` tag in `<head>`. No external stylesheet.
Estimated CSS size: ~3-4KB unminified. Structure:

```css
/* Reset & base */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; /* ... */ }

/* Tokens */
:root { --color-bg: #ffffff; /* ... */ }

/* Layout */
.page { max-width: 640px; margin: 0 auto; padding: 40px; }

/* Status banner */
.status { /* ... */ }
.status--verified { /* green variant */ }
.status--unverified { /* red variant */ }

/* Checks list */
.checks { /* ... */ }
.check { /* ... */ }
.check--pass { /* ... */ }
.check--fail { /* ... */ }
.check--skip { /* ... */ }

/* Screenshot */
.screenshot { /* ... */ }
.screenshot--expanded { /* remove max-height */ }
.screenshot__fade { /* gradient overlay */ }

/* Crypto details */
.details { /* <details> styling */ }

/* Noscript fallback */
.noscript { /* ... */ }
```

BEM-lite naming. No nesting deeper than two levels. No `!important`. No
`@import`. No `@font-face`.

### Inline SVG Icons

Three icons needed, all inline SVG. Keep them small (16x16 viewBox) and
use `currentColor` for fill so they inherit the CSS color.

**Checkmark (pass):**
```html
<svg width="20" height="20" viewBox="0 0 16 16" fill="none"
     aria-hidden="true">
  <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"
          fill="none"/>
  <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**X mark (fail):**
```html
<svg width="20" height="20" viewBox="0 0 16 16" fill="none"
     aria-hidden="true">
  <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"
          fill="none"/>
  <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

**Dash (skip):**
```html
<svg width="20" height="20" viewBox="0 0 16 16" fill="none"
     aria-hidden="true">
  <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"
          fill="none"/>
  <path d="M5 8h6" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round"/>
</svg>
```

All icons are `aria-hidden="true"` because the adjacent text label conveys
the same information. The status is also communicated via text ("Passed",
"Failed", "Skipped") for screen readers.

### Larger Verified/Unverified Badge Icon

For the main status banner, a larger version (32x32) of the checkmark or
X-mark icon. Same stroke style, scaled up. Placed to the left of the
status text, vertically centered.

---

## Accessibility Specification

### Semantic Structure

```
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verification: {url} - Web Resource Ledger</title>
    <style>/* all CSS */</style>
  </head>
  <body>
    <header role="banner">
      <!-- WRL wordmark -->
    </header>
    <main>
      <section aria-label="Verification status">
        <!-- Status banner with h1 -->
        <h1>Verified / Unverified</h1>
      </section>
      <section aria-label="Capture details">
        <h2>Capture Details</h2>
        <!-- URL, timestamp -->
      </section>
      <section aria-label="Verification checks">
        <h2>Verification Checks</h2>
        <!-- Check list -->
      </section>
      <section aria-label="Screenshot">
        <h2>Screenshot</h2>
        <!-- Screenshot image -->
      </section>
      <details>
        <summary><h2>Cryptographic Details</h2></summary>
        <!-- Hash, algorithm, key -->
      </details>
    </main>
    <footer>
      <!-- Minimal: "Verified by Web Resource Ledger" -->
    </footer>
    <noscript>
      <!-- Fallback content -->
    </noscript>
  </body>
</html>
```

Heading hierarchy: h1 (status), h2 (each section). No skipped levels.

### Keyboard Navigation

- Tab order follows visual order (no `tabindex` manipulation needed).
- Screenshot expand/collapse: use a `<button>` element (keyboard-operable
  by default).
- Cryptographic details: `<details>`/`<summary>` is keyboard-operable
  natively (Enter/Space to toggle).
- No custom keyboard shortcuts needed -- this is a read-only page.

### Screen Reader Considerations

- The `<title>` includes the verified/unverified status and the URL so
  screen reader users know what the page is about immediately.
- Status banner: the h1 text reads "Verified" or "Verification Failed" --
  clear without visual context.
- Check list items: each check reads as "[icon hidden] Artifact integrity
  -- Passed" (use an `<span class="sr-only">` for the status text if it
  is only conveyed visually via icon color).
- Screenshot alt text is descriptive (URL + date).
- Monospace hash values: consider `aria-label` on the hash container to
  read "SHA-256 hash" rather than forcing screen readers to spell out the
  hex string character by character. Or use
  `aria-describedby` linking to a visible label.

### Focus Indicators

Default browser focus ring is acceptable for MVP. If overriding, use:
```css
:focus-visible {
  outline: 2px solid #1565c0;
  outline-offset: 2px;
}
```

Ensure the focus ring is visible on both white and light-colored
backgrounds (the green/red banner backgrounds).

### Reduced Motion

The only motion on this page is the screenshot expand/collapse, which is
a layout change (no animation). If any `transition` is added for polish,
wrap it:
```css
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; }
}
```

---

## Noscript Fallback

The `<noscript>` block should contain:
- Capture ID displayed prominently
- Direct link to the JSON API endpoint:
  `GET /v1/verify/{captureId}` -- the Worker knows its own origin, so the
  link is absolute.
- Brief text: "Enable JavaScript to see the full verification result, or
  use the API link above."

This is a progressive enhancement approach. The Worker renders the full
HTML server-side with all verification data already in the page -- it does
NOT require a client-side fetch. The JS only adds interactivity
(screenshot expand, copy-to-clipboard for hashes). The core content is
static HTML rendered by the Worker.

**Critical architecture point:** The Worker should render the verification
result directly into the HTML. The page should NOT make a client-side
`fetch()` to the verify API. The Worker already has the verification data
(it runs the verify logic server-side before rendering the page). This
means:
- No loading spinner needed
- No error state for "API unreachable"
- The page works without JavaScript for all essential information
- JS only enhances: screenshot expand/collapse, hash copy-to-clipboard
- The `<noscript>` fallback is minimal because the page already works
  without JS

This is the correct architecture for a Worker-rendered page. Client-side
fetching would add latency, complexity, and a loading state -- all
unnecessary when the Worker has the data at render time.

---

## Screenshot Loading Strategy

**Recommendation:** The Worker should NOT inline the screenshot as base64
in the HTML. A full-page PNG screenshot can be 500KB-2MB+. Base64 encoding
adds ~33% overhead. A 1MB screenshot would become ~1.3MB of inline data,
making the HTML payload 1.4MB+ total. This hurts time-to-first-paint.

**Instead:** Use an `<img src="/v1/captures/{id}/artifacts/screenshot">`
tag. This is a same-origin request to the existing artifact endpoint. The
browser loads it asynchronously after the HTML renders, which means:
- The verification status, URL, timestamp, and checks render instantly
- The screenshot loads progressively
- The existing artifact endpoint handles caching (`immutable, max-age=31536000`)
- No duplication of screenshot bytes in the HTML payload

The Worker needs to emit the correct capture ID in the `src` attribute,
which it has from the verify logic.

**Fallback for image load failure:** Add an `onerror` handler on the
`<img>` that shows the "Screenshot not available" placeholder. In the
`<noscript>` version, the `<img>` tag still works -- browsers load images
without JS.

---

## Edge Cases and Error States

### Capture Not Found (404)

The Worker returns the problem+json 404. If HTML is requested (Accept
header), render a simple page:
- Same layout/header as the verification page
- Status area shows: "Capture Not Found"
- Body text: "The capture ID in this URL does not exist or has not
  completed processing. If the capture was recently submitted, try again
  in a few seconds."
- No checks section, no screenshot, no crypto details.

### Verification Service Unavailable (503)

Similar to 404 but with message: "The verification service is temporarily
unavailable. Please try again later."

### Rate Limited (429)

Message: "Too many verification requests. Please wait a minute and try
again." Include a simple auto-retry? No -- KISS. Just the message.

### Partial Check Results

The checks array always has three entries (the verify.js code guarantees
this). But a check can have status "skip" -- the design handles this with
the gray dash icon and muted text. No special layout changes needed.

### Very Long URLs

URLs can be 2048 characters. The URL display must handle this:
```css
.capture-url {
  word-break: break-all;
  overflow-wrap: anywhere;
  font-family: monospace;
}
```

Consider truncating to first 120 characters with "..." and a "Show full
URL" toggle for extremely long URLs. But for MVP, `word-break: break-all`
is sufficient.

---

## Risks and Dependencies

### Risk 1: Screenshot Size Affects Page Load
**Risk:** Large screenshots (1MB+) slow down the page even when loaded
via `<img>` tag.
**Mitigation:** The existing artifact endpoint serves with `immutable`
cache headers, so subsequent loads are instant. First load may be slow on
poor connections. Acceptable for MVP. Future optimization: thumbnail
generation at capture time.

### Risk 2: Content-Negotiation Complexity
**Risk:** The Worker must detect `Accept: text/html` and render HTML
instead of JSON for the same `/v1/verify/{id}` route.
**Mitigation:** This is standard content negotiation. Check
`request.headers.get('Accept')` for `text/html`. If present, render HTML.
Otherwise, return JSON as today. The JSON behavior must not change.

### Risk 3: HTML String Generation in Worker
**Risk:** Building a large HTML string in Worker code is error-prone
(escaping, XSS from URL values embedded in HTML).
**Mitigation:** All user-controlled values (URL, capture ID, timestamps)
must be HTML-escaped before interpolation. The URL comes from the KV
record (already validated at capture time), but defense-in-depth requires
escaping. A simple `escapeHtml()` utility (escapes `<>&"'`) is sufficient.
**Security-minion should review the escaping implementation.**

### Risk 4: CSP Headers for Inline Styles
**Risk:** If a Content-Security-Policy header is added later (Step 8),
inline `<style>` tags require `'unsafe-inline'` or a nonce/hash.
**Mitigation:** For MVP, no CSP is set on this page. When CSP is added,
use a hash-based allowlist for the inline style block rather than
`'unsafe-inline'`. Document this as a consideration for Step 8.

### Risk 5: URL Privacy in HTML Page
**Risk:** The verify JSON endpoint deliberately omits `url` from the
response (Decision 5 in 0009-verification-endpoint). But the verification
page is supposed to show the URL.
**Mitigation:** This is an important architectural question. The Worker
renders the page server-side and has access to the KV record which
contains the URL. The URL is embedded in the HTML but never in the
cached JSON response. Since the HTML page is served with appropriate
Cache-Control headers (matching the JSON endpoint -- `public, max-age=86400`
for verified, `no-store` for unverified), the URL exposure is controlled.
However, **this means the HTML page reveals more information than the JSON
API**. The team should explicitly decide whether this is acceptable. If
not, the URL can be omitted from the HTML page too, but that significantly
reduces the page's value for non-technical users.

---

## Additional Specialist Input Needed

- **security-minion**: Must review HTML escaping strategy for
  user-controlled values (URL, timestamps) interpolated into the HTML
  string. Must also evaluate the URL privacy implication (Risk 5) and
  Cache-Control alignment between JSON and HTML responses.
- **api-design-minion**: Should weigh in on content negotiation approach
  (same route with Accept header vs. separate route like `/v1/verify/{id}/page`).

---

## Implementation Notes for Frontend-Minion

The Worker needs a function like `renderVerificationPage(verifyResult, record)`
that returns an HTML string. Inputs:
- `verifyResult` -- the output of `verifyWacz()` (verified, checks, capture)
- `record` -- the KV record (captureId, url, createdAt, completedAt)
- `origin` -- the Worker's origin for constructing the screenshot URL

The function does string interpolation with HTML escaping. No template
engine. Estimated size: ~150 lines of JS for the render function, ~100
lines of CSS inlined in the output.

The render function should be in its own module (`src/render-verify.js`)
for testability -- unit tests can assert the HTML output contains expected
elements for verified/unverified states without needing a full Worker
environment.

---

## Summary of Key Design Decisions

1. **Server-rendered, not client-fetched.** The Worker has the data; render
   it directly into HTML. JS only adds interactivity (expand screenshot,
   copy hash).

2. **Screenshot via `<img>` tag, not base64 inline.** Keeps HTML payload
   small (~5KB without screenshot vs ~1.4MB with inline base64).

3. **Verified/unverified differentiation uses icon + color + text + border.**
   Never color alone. Both states look "correct" -- the system is reporting
   a finding, not displaying an error.

4. **Three checks always visible, not collapsed.** They are the evidence.
   Cryptographic details are collapsed (technical audience only).

5. **System fonts only.** Zero external HTTP requests, including fonts.

6. **Progressive enhancement.** Page works without JS. JS adds: screenshot
   expand/collapse, hash copy-to-clipboard. `<noscript>` shows capture ID
   and API link as minimal fallback.

7. **640px max-width, single column.** Trust documents are narrow --
   wide layouts look like marketing. This is a certificate, not a landing
   page.

8. **URL privacy requires explicit team decision.** The HTML page shows
   the captured URL (from KV record), but the JSON API deliberately omits
   it. This discrepancy needs a conscious choice, not an accident.
