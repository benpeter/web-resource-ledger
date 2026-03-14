# Outcome: Static Verification Page

Browser-accessible verification page for non-technical users. Content
negotiation on the existing `/v1/verify/{id}` endpoint serves HTML when
`Accept: text/html` is present, JSON otherwise.

## Files Changed

| File | Action | Lines | Description |
|------|--------|-------|-------------|
| `src/verify-page.js` | created | +533 | HTML verification page module with inlined CSS + vanilla JS |
| `src/index.js` | modified | +8 | Content negotiation (Accept check) and Vary: Accept on JSON path |
| `test/verify-page.test.js` | created | +182 | 24 unit tests for htmlVerifyResponse and escapeHtml |
| `test/verify-html.test.js` | created | +216 | 15 integration tests for content negotiation routing |
| `docs/evolution/0010-*/prompt.md` | created | +44 | Phase prompt documentation |
| `docs/evolution/0010-*/decisions.md` | created | +100 | 7 planning decisions with rationale |
| `docs/evolution/README.md` | modified | +1 | Index entry for phase 0010 |

Total: 8 files, +1111 lines

## Test Results

- All 304 tests passing (15 test files)
- New tests added: 39 (24 unit + 15 integration)
- Key coverage: Accept header routing (5 variations), response headers (CSP,
  Vary, X-Frame-Options), HTML content structure, escapeHtml, security controls
  (URL scheme validation, Accept header on fetch, noscript escaping), error
  paths stay JSON, cache parity between HTML and JSON

## Deviations from Issue Spec

- **Screenshot display**: Issue spec described expand/collapse toggle; simplified
  to full-width image with natural scroll per margo advisory (YAGNI — trust
  document, user wants to see the screenshot)
- **Error states**: Issue spec implied status-specific messages (404, 429, 503);
  simplified to single generic error with JSON API fallback link per margo
  advisory (users can't act differently per error type)
- **Relative time**: Dropped "3 days ago" display; absolute timestamp only via
  Intl.DateTimeFormat per margo advisory (certificate page, not social feed)
- **CSS custom properties**: Used direct values instead of 12 CSS custom
  properties per margo advisory (single-use indirection without reuse benefit)

## Backlog Changes

- Added: HSTS header (deferred from Step 7 to Step 8 — global decision, not
  scoped to verification page)
- Added: HTML error pages for 404/429/503 (YAGNI for MVP — browsers display
  JSON problem responses)
- Added: Nonce-based CSP upgrade path (if template ever needs server-side
  dynamic data in script blocks)

## Surprises

- **verify-page.js larger than estimated**: 533 lines vs estimated 200-300.
  The inline CSS (~230 lines) and JS (~260 lines) are both substantial but
  justified — this is a complete self-contained page.
- **innerHTML used for structural rendering**: The implementation uses innerHTML
  for pre-built structural HTML (SVG icons, CSS class containers) while using
  textContent for all user-controlled data. Code reviewers flagged but accepted
  this pattern — the innerHTML content is hardcoded string literals, not fetched data.
- **JSON.stringify for JS interpolation**: Code review identified that
  captureId/origin were interpolated with single quotes in JS context. Fixed to
  use JSON.stringify for proper JS-string escaping (defense-in-depth).
