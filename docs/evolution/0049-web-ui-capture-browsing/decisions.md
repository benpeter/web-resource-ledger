# Decisions: 0049 — Web UI for Capture Submission and Browsing

## D1: Hash-based routing with single Worker route

**Chosen**: Hash-based client-side routing (`#/captures`, `#/captures/:id`) with a single `GET /ui` Worker route.

**Over**: Path-based routing with server-side catch-all (frontend-minion initially proposed). Rejected because it collides with the existing regex router and 404 behavior in `src/index.js`.

**Why**: Hash routing requires zero Worker-side changes beyond one route entry. The regex router in index.js matches literal paths — a catch-all for `/ui/*` would need special-casing.

## D2: sessionStorage over localStorage

**Chosen**: `sessionStorage` under key `wrl_api_key`.

**Over**: `localStorage` (frontend-minion's initial recommendation).

**Why**: security-minion argued that bearer tokens should not persist across sessions. sessionStorage clears on tab close — appropriate for evaluators who may be on shared machines. The evaluator persona doesn't need cross-session persistence.

## D3: Combined submit+list view

**Chosen**: Single combined view at `#/captures` with submit form above the capture list.

**Over**: Separate routes for submit (`#/submit`) and list (`#/captures`) as frontend-minion initially proposed.

**Why**: ux-strategy-minion's "inbox pattern" — submitting a URL immediately shows it in the list below, providing instant feedback. Reduces navigation friction for the primary workflow (submit → watch → verify).

## D4: Single responsive DOM structure

**Chosen**: Single CSS grid structure that adapts via media queries.

**Over**: Dual DOM (separate `<table>` for desktop + `<div>` cards for mobile) — margo flagged this during Phase 3.5 review.

**Why**: Single DOM means one set of event handlers, one data structure, one update path. The dual-DOM approach doubles wiring complexity for a purely visual difference.

## D5: Favicon via /favicon.ico instead of data: URI

**Chosen**: `<link rel="icon" href="/favicon.ico">` referencing the existing Worker route.

**Over**: Inline `data:image/svg+xml` URI (which was the verify-page.js pattern).

**Why**: CSP `img-src 'self'` blocks data: URIs. Lucy caught this during Task 1 gate review. The existing `/favicon.ico` Worker route serves the same SVG — no CSP change needed.

## D6: No root redirect

**Chosen**: No `GET / → 302 /ui` redirect.

**Over**: Root redirect (was in the synthesis plan initially).

**Why**: Lucy flagged it as outside the stated scope of Issue #47. The issue says "navigate to /ui" — adding a root redirect could break existing integrations expecting 404 at root.

## D7: No "Try again" prefill for failed captures

**Chosen**: Simple "Back to captures" link on failed capture detail view.

**Over**: URL prefill feature that would carry the failed URL back to the submit form.

**Why**: ux-strategy-minion advised against cross-view state coordination for MVP. The prefill requires either URL params or a shared state store — complexity that's not justified for the "re-submit a failed URL" use case.

## D8: autocomplete="current-password" on API key input

**Chosen**: `autocomplete="current-password"` on the API key password input.

**Over**: `autocomplete="off"` (initial default).

**Why**: accessibility-minion flagged WCAG 2.2 SC 3.3.8 violation. `autocomplete="off"` blocks password managers, which is an accessibility barrier. `current-password` allows password managers while keeping the input masked.

## D9: textContent-only rendering (no innerHTML with API data)

**Chosen**: All dynamic content from API responses rendered via `textContent` or `createElement`. `innerHTML` only used with empty string (`= ''`) to clear containers.

**Over**: Template-string based innerHTML for convenience.

**Why**: security-minion's non-negotiable requirement. With `script-src 'unsafe-inline'` in CSP, an XSS via innerHTML could execute arbitrary code. textContent-only rendering eliminates this vector entirely.

## D10: Polling via setTimeout (not setInterval)

**Chosen**: `setTimeout` with dynamic interval from Retry-After header.

**Over**: `setInterval` with fixed interval.

**Why**: test-minion and frontend-minion both recommended setTimeout for control over timing. setInterval can stack requests if the server is slow. setTimeout with Retry-After lets the server throttle clients naturally.
