# Lucy Review: Web UI for Capture Submission and Browsing

## VERDICT: ADVISE

The implementation aligns well with GitHub Issue #47's intent (Web UI for capture submission and browsing). It is vanilla JS, no frameworks, uses the design system tokens, sessionStorage (not localStorage), and follows the modular file structure conventions of the project. There are a handful of issues worth addressing, two of which relate directly to CLAUDE.md mandates.

---

## Findings

### [ADVISE] CONVENTION src/ui/ui-poll.js:1 -- Missing `// tva` code signature

`ui-poll.js` is one of six new UI modules and contains core polling logic -- it qualifies as a significant module. The other four substantial modules (`ui-auth.js`, `ui-shell.js`, `ui-submit.js`, `ui-detail.js`) all have `// tva`. `ui-css.js` reasonably omits it (pure CSS string, not a logic module). `ui-poll.js` is logic, not style.

FIX: Add `// tva` as line 1 of `src/ui/ui-poll.js`.

---

### [ADVISE] COMPLIANCE src/ui/ui-submit.js:333-336 -- `loadMoreCaptures` catch silently discards the error

CLAUDE.md Engineering Philosophy: "silent `catch {}` blocks are forbidden. Every catch must either log the error or handle a specific, named error type." The `.catch(function() { ... })` in `loadMoreCaptures` resets button state but surfaces no error to the user. Contrast with `loadCaptures` (line 292-299) which correctly renders an error element.

The same pattern appears in `ui-poll.js` (lines 100, 110) and `ui-detail.js` (line 477, 517), but those all result in user-visible state changes (retry counts, error messages, or fallback renders). `loadMoreCaptures` is the only one that silently swallows the failure.

FIX: Add a brief error indicator after the "Load more" button or re-enable with an error message, e.g.:
```js
}).catch(function() {
  _moreBtn.disabled = false;
  _moreBtn.textContent = 'Load more';
  showGlobalError('Could not load more captures. Check your connection.');
});
```

---

### [NIT] src/ui/ui-shell.js:25-29 -- Inline styles in noscript block use hardcoded values

The `<noscript>` fallback uses inline `style=""` attributes with raw CSS values (`max-width:480px`, `font-size:1.25rem`, `font-family:sans-serif`). This is pragmatically acceptable since `<noscript>` renders before any CSS is available (the design system tokens are inside `<style>` which requires the browser to parse them). Flagging as NIT only -- the design system tokens are not available in a no-JS context, so hardcoding here is the correct tradeoff.

FIX: None required. If desired for consistency, move these to the `<style>` block as a `.noscript-fallback` class so tokens can be used, but this is cosmetic given the no-JS scenario.

---

### [NIT] src/ui/ui-submit.js:89-97 -- Dead conditional branch

Lines 93-97 check `if (!safe)` and re-set the `href` to the same value already set on line 86 (`'#/captures/' + capture.id`). The branch body is a no-op. This appears to be a leftover from a draft where the `href` might have been set to `capture.url` before the safe check.

FIX: Remove lines 93-97 (the `if (!safe) { ... }` block) since the href is already correctly set on line 86 regardless of URL safety.

---

### [NIT] src/ui/ui-css.js:1 -- Missing `// tva` code signature (marginal)

`ui-css.js` is a CSS-only export. Reasonable to omit the signature from a pure-style file, but including it would be consistent with the other modules. Lower priority than `ui-poll.js`.

FIX: Optionally add `// tva` as line 1.

---

## Alignment Summary

| Requirement (Issue #47) | Plan Element | Status |
|---|---|---|
| Submit captures via browser | `ui-submit.js` form + POST /v1/captures | Covered |
| Browse/list captures | `ui-submit.js` capture list + pagination | Covered |
| View capture detail | `ui-detail.js` complete/pending/failed views | Covered |
| Auth gate (API key) | `ui-auth.js` sessionStorage + apiFetch | Covered |
| Served from Worker (no external hosting) | `ui-shell.js` returns Response, route in index.js | Covered |
| No frameworks (vanilla JS) | All files use DOM APIs, no imports | Covered |
| Design system tokens | `ui-css.js` uses only `var(--*)` references | Covered |
| sessionStorage (not localStorage) | Verified: no localStorage usage found | Covered |
| CSP header | Tight policy in `ui-shell.js` | Covered |
| Tests | `ui-dashboard.test.js` covers headers, HTML structure, security, polling guards, integration | Covered |
| README update | Web UI section added | Covered |

No scope creep detected. No features beyond the stated requirement. The polling and optimistic UI update patterns are proportional to the problem (captures are async operations that take time).
