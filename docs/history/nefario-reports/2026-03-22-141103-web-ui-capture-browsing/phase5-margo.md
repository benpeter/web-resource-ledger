# Margo -- Complexity Review: Web UI

## VERDICT: ADVISE

The implementation is fundamentally sound. Vanilla JS, zero dependencies, no
frameworks, no build step, all DOM construction via `createElement`/`textContent`
(no XSS surface). The module decomposition (auth, poll, submit, detail, css,
shell) is clean and each module has a clear responsibility. The overall approach
-- exporting JS string constants inlined into a single HTML response -- is the
right architecture for a Cloudflare Worker UI with no external assets.

The findings below are non-blocking quality improvements. None require
architectural changes.

---

## FINDINGS

### [ADVISE] src/ui/ui-auth.js:130-137 -- Duplicate timeout/race logic in handleAuthSubmit

`handleAuthSubmit` duplicates the entire `Promise.race([fetch, timeout])` pattern
already implemented by `apiFetch`. The auth validation fetch (line 130-138)
manually constructs the same timeout race that `apiFetch` provides. The reason
for the duplication is that `handleAuthSubmit` runs *before* the key is stored in
sessionStorage, so `apiFetch` would send an empty Bearer token. However, the
current code manually sets the Authorization header anyway -- exactly what
`apiFetch` does.

**What is complex**: 14 lines of duplicated timeout+race logic.

**Why accidental**: The fetch with a manually-supplied header is identical to what
`apiFetch` would do if the key were passed as an option or temporarily stored.

**FIX**: Either (a) temporarily store the key in sessionStorage before the
validation fetch and remove it on failure, letting `apiFetch` handle the call,
or (b) extract the timeout race into a tiny `fetchWithTimeout(url, opts)` helper
used by both `apiFetch` and `handleAuthSubmit`. Option (a) is simplest -- it
eliminates 14 lines with zero new abstractions:

```js
sessionStorage.setItem(AUTH_KEY, key);
apiFetch('/v1/captures?limit=1').then(function(res) {
  if (res.ok) {
    renderAppShell();
  } else {
    sessionStorage.removeItem(AUTH_KEY);
    // show error...
  }
}).catch(function(err) {
  sessionStorage.removeItem(AUTH_KEY);
  // show error...
});
```

---

### [ADVISE] src/ui/ui-detail.js:456-567 -- fetchAndRenderDetail has high cognitive complexity

`fetchAndRenderDetail` is a single function spanning 110 lines with 5 levels of
nested `.then()` callbacks and 12 repetitions of the `getElementById('view') +
clear + render` pattern. The cyclomatic complexity is ~15 (multiple branches at
each nesting level), cognitive complexity is ~20+ (deep nesting penalized
heavily). This is the hardest function to read in the entire codebase.

**What is complex**: Deep callback nesting with repeated boilerplate at each
branch.

**Why accidental**: The branching is essential (must handle complete, pending,
failed, 404, network error), but the repetition of `getElementById + clear +
render` at every branch is mechanical duplication.

**FIX**: Extract a 3-line helper to reduce the 12 repetitions to single calls:

```js
function resetView(renderFn) {
  var v = document.getElementById('view');
  if (!v) return;
  v.textContent = '';
  renderFn(v);
}
```

Then each branch becomes `resetView(function(v) { renderDetailComplete(v, id, data); })`.
This removes ~30 lines and more importantly flattens the visual nesting, making
the state machine readable. The function itself could also be split into
`fetchComplete` and `fetchStatus` to make the two-phase fetch strategy explicit,
but the helper alone brings cognitive complexity under threshold.

---

### [ADVISE] src/ui/ui-submit.js:82,94-97 -- Dead code: redundant href assignment and unused variable

Lines 94-97 check `if (!safe)` and re-set the `href` attribute to the exact same
value already set on line 86. The `href` points to the internal hash route
`#/captures/{id}` regardless of whether the URL is "safe" -- the URL safety has
no bearing on the internal navigation link. The `safe` variable (line 82) is
computed but never used to alter behavior in this function.

**What is complex**: 4 lines (including comment) that do nothing, plus an
unused variable.

**Why accidental**: Looks like a leftover from an earlier iteration that
may have linked to the external URL.

**FIX**: Remove the `var safe = safeUrl(capture.url);` on line 82 and the
`if (!safe)` block on lines 94-97 entirely.

---

### [NIT] src/ui/ui-css.js:336,391 -- Overlapping media query breakpoints

There are three mobile breakpoints at 640px, 600px, and 420px. The 640px and
600px queries overlap (a 620px viewport triggers both). The 640px query handles
capture list stacking and the 600px query handles spacing reduction. These could
be a single breakpoint at 640px since the 40px gap between them creates no
meaningful design difference.

**FIX**: Merge the 600px rules into the 640px breakpoint. One fewer
`@media` block, no visual change.

---

### [NIT] src/ui/ui-detail.js:573-583 -- renderDetail immediately overwritten by mountDetail

The router calls `renderDetail(id)` then `mountDetail(id)`. `renderDetail` shows
a loading spinner. `mountDetail` immediately calls `fetchAndRenderDetail(id)`,
which on its first line clears the view and shows... a loading spinner. The
render/mount split adds one unnecessary clear-and-rebuild cycle.

**Why accidental**: The render/mount pattern makes sense for the captures view
(where `renderCaptures` builds static DOM and `mountCaptures` wires events +
loads data). For the detail view, there is no static DOM to build -- it is
entirely data-driven.

**FIX**: For detail, merge `renderDetail` and `mountDetail` into a single
`showDetail(id)` that just calls `fetchAndRenderDetail(id)`. The router would
call `showDetail(id)` instead of two separate functions. This removes 8 lines
and one unnecessary DOM cycle. If maintaining the render/mount convention for
consistency is preferred, that is acceptable -- this is a nit.

---

### [NIT] src/ui/ui-submit.js:39-47 -- Module-level mutable state

Seven module-level `var` declarations (`_captures`, `_totalCount`, `_hasMore`,
`_currentOffset`, `_listEl`, `_countEl`, `_moreBtn`, `_liveEl`,
`_elapsedTimers`) form the state for the captures view. This is fine for a
single-page vanilla app -- noting that `renderCaptures` correctly resets all
of them, which is the critical invariant. No action needed.

---

## Summary

| Severity | Count | Theme |
|----------|-------|-------|
| ADVISE | 3 | Duplicated timeout logic, high cognitive complexity in detail fetch, dead code |
| NIT | 3 | Overlapping breakpoints, redundant render/mount for detail, state convention |

No BLOCK issues. No unnecessary dependencies. No premature optimization. No
YAGNI violations (all features are in the approved scope). No framework or
library creep. The approach of using only `textContent` and `createElement` for
all user-visible content is well-enforced and verified by tests. The CSP is
appropriately restrictive. The polling module uses setTimeout (not setInterval),
respects Retry-After, pauses on hidden tabs, and has a timeout ceiling -- all
correct choices without over-engineering.

The three ADVISE items are worth addressing before merge for maintainability:
the duplicated timeout logic is the most impactful (eliminates a subtle
divergence risk), the `fetchAndRenderDetail` cognitive complexity is next (makes
the most complex function readable), and the dead code removal is trivial.
