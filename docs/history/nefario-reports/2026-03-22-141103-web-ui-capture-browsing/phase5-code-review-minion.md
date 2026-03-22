# Code Review: Web UI (capture submission + browsing)

Reviewed files:
- src/index.js (route addition)
- src/ui/ui-shell.js
- src/ui/ui-auth.js
- src/ui/ui-css.js
- src/ui/ui-submit.js
- src/ui/ui-detail.js
- src/ui/ui-poll.js
- test/ui-dashboard.test.js

---

## VERDICT: ADVISE

No blocking security bugs or correctness failures. Two ADVISE-level issues (one logic
gap, one missing error handling). Several nits.

---

## FINDINGS

### [ADVISE] ui-auth.js:130-158 -- Auth validation fetch has no timeout abort; race condition on 401 redirect

The `handleAuthSubmit` function races a fetch against a manual timeout promise but
does not abort the underlying fetch. The timer fires and the button re-enables, but
the original fetch is still in flight. If the server returns 401 after the timeout
wins, `renderAuthGate()` will be called a second time while the user is already
looking at the auth gate -- benign but sloppy. More critically, the code path does
not call `renderAuthGate()` on the 401 path in `handleAuthSubmit` (line 145 handles
it for `apiFetch` callers, but this is a raw `fetch`). A 401 response during the
initial validation will show "Invalid API key" -- which is correct. The race with
the timeout just leaves the fetch dangling.

The real issue: if the network resolves *after* the timeout rejects, the `.then`
handler on line 139 still executes because `Promise.race` resolves the winner but
does not cancel the loser. The button (`btn`) will fire `btn.disabled = false` and
`btn.textContent = 'Connect'` a second time from the late-resolving fetch, after
the user has already re-enabled the button and possibly typed a new key. This is a
state corruption window.

FIX: Use `AbortController` to cancel the validation fetch when the timeout fires.

```js
var controller = new AbortController();
var fetchPromise = fetch('/v1/captures?limit=1', {
  headers: { 'Authorization': 'Bearer ' + key },
  signal: controller.signal,
});
var timeoutPromise = new Promise(function(_, reject) {
  setTimeout(function() {
    controller.abort();
    reject(new TypeError('fetch_timeout'));
  }, FETCH_TIMEOUT_MS);
});
```

The same pattern is missing in `apiFetch` (line 24-29 of ui-auth.js), but that
function races `fetch` vs. `setTimeout` without aborting. The `apiFetch` path is
lower-risk because it is used for data fetches where a late response is silently
discarded, but the auth validation path has UI state mutation on both resolution
paths.

---

### [ADVISE] ui-submit.js:269-298 -- loadCaptures silently swallows apiFetch 401

In `loadCaptures`, when `apiFetch` handles a 401, it calls `renderAuthGate()` and
returns `res` (not rejected). The `.then(function(res) { if (!res.ok) return; })`
chain on line 270 will skip the `.then(function(body) {...})` step as expected. But
the empty `.catch` on lines 292-298 swallows *all* errors from `apiFetch` itself.
This means a fetch_timeout rejection will produce "Could not load captures. Check
your connection." -- which is correct -- but also means there is no way to
distinguish a transient network error from a permanent auth failure. The auth gate
will render behind the captures list if 401 fires and `renderAuthGate()` replaces
the DOM, but no error is shown to the user in the captures list before the auth gate
takes over. This is acceptable behavior given `renderAuthGate` replaces the whole
app, but the empty catch on line 297 violates the project's "fail loudly" rule
(CLAUDE.md: "Every catch must either log the error or handle a specific, named error
type").

FIX: Add a named check inside the catch. At minimum, log the error rather than
swallowing it silently. The same pattern appears in `loadMoreCaptures` catch on
lines 333-336.

```js
}).catch(function(err) {
  var isTimeout = err && err.message === 'fetch_timeout';
  if (_listEl) {
    var errEl = document.createElement('p');
    errEl.className = 'capture-load-error';
    errEl.textContent = isTimeout
      ? 'Connection timed out. Check your network.'
      : 'Could not load captures. Check your connection.';
    _listEl.appendChild(errEl);
  }
});
```

---

### [ADVISE] ui-detail.js:421 -- Retry button re-parses hash with escaped regex

The regex inside `renderDetailError`'s retry handler is:

```js
var idMatch = location.hash.match(/^#\\/captures\\/(cap_[a-f0-9]{32})$/);
```

This is inside a JS template literal string (exported as `DETAIL_VIEW_JS`), so the
`\\/` sequences are correct escaping for the string -- they produce `\/` at runtime,
which in a regex is just `/`. This is functionally correct but visually confusing.
More importantly, the retry handler reaches outside its own module scope to call
`renderDetail` and `mountDetail` -- functions defined in ui-shell.js's IIFE scope.
This will work because all modules are concatenated into the same IIFE, but it is a
hidden coupling that makes the detail module non-portable and untestable in
isolation. The test suite does not cover the retry path at all.

FIX (design improvement): Pass the ID into `renderDetailError` and close over it in
the retry handler, rather than re-parsing the hash. This eliminates the coupling and
the parsing:

```js
function renderDetailError(view, message, captureId) {
  // ...
  retryBtn.addEventListener('click', function() {
    if (captureId) {
      renderDetail(captureId);
      mountDetail(captureId);
    }
  });
}
```

---

### [NIT] ui-submit.js:95-97 -- Dead code block: redundant href assignment after URL validation

Lines 94-97:
```js
if (!safe) {
  // Prevent navigation to unsafe protocol links
  item.setAttribute('href', '#/captures/' + capture.id);
}
```

The `href` on line 86 already sets `'#/captures/' + capture.id`. This block
re-sets the same value when `safe` is falsy. It does nothing. The comment implies
the original intent was to strip the href entirely or use a `<span>` instead of
`<a>`, but neither happens. This is dead code.

FIX: Remove lines 94-97. The href is already correct. If the intent was to prevent
the URL cell from being a link for malformed URLs, that requires a different
approach (render a `<span>` inside the item, not an `<a>` for the item itself, or
remove the href attribute).

---

### [NIT] ui-detail.js:158-209 -- `screenshotBefore` presence check does not match artifact path

The before-screenshot conditional checks `data.artifacts && data.artifacts.screenshotBefore`
(line 158), but the artifact URL path used at line 174 is
`/v1/captures/' + id + '/artifacts/screenshot-before`. The check and the path use
different naming (`screenshotBefore` camelCase vs `screenshot-before` kebab). This
is consistent with the artifacts shape returned by the API (camelCase field), but
it's worth confirming the API does not return `screenshot_before` or `screenshotBefore`
inconsistently. If the field is absent in a complete capture, the `else` branch
renders only the after screenshot -- which is correct degraded behavior. Not a bug,
but worth a cross-check against the API contract.

---

### [NIT] ui-poll.js:85 -- parseInt result for Retry-After can produce NaN path

```js
var nextMs = retryAfterRaw
  ? Math.min(parseInt(retryAfterRaw, 10) * 1000 || POLL_DEFAULT_MS, POLL_MAX_MS)
  : POLL_DEFAULT_MS;
```

If `retryAfterRaw` is a non-numeric string (e.g. a date string per RFC 7231),
`parseInt` returns `NaN`, then `NaN * 1000` is `NaN`, then `NaN || POLL_DEFAULT_MS`
correctly falls back to `POLL_DEFAULT_MS`. The `|| POLL_DEFAULT_MS` guard handles
this. However, `Math.min(NaN, POLL_MAX_MS)` is `NaN` -- this is avoided only because
the `||` fires before `Math.min` sees `NaN`. The operator precedence is:
`Math.min((parseInt(...) * 1000 || POLL_DEFAULT_MS), POLL_MAX_MS)` -- the `||` binds
tighter than `Math.min`, so the fallback fires before `Math.min`. Functionally
correct, but the intent is unclear without a comment. Add a note or rewrite for
clarity:

```js
var parsed = parseInt(retryAfterRaw, 10);
var nextMs = retryAfterRaw && !isNaN(parsed)
  ? Math.min(parsed * 1000, POLL_MAX_MS)
  : POLL_DEFAULT_MS;
```

---

### [NIT] test/ui-dashboard.test.js:183-185 -- innerHTML security test regex is too permissive

The test checks that all `innerHTML` assignments are assigned `''` or `""`:

```js
expect(rhs).toMatch(/^''|^""/);
```

This regex matches any string starting with `''` or any string starting with `""`
-- the `^` anchors only apply to the start of each alternative, not to the full
match. So `'' + someVar` would pass. This is a logic error in the test. The correct
check requires that the full RHS is exactly `''` or `""`:

```js
expect(rhs).toMatch(/^(?:''|"")$/);
```

In practice the assignments are all simple `''` clears, so this does not cause a
false negative today. But the guard can be fooled by concatenations, which defeats
the purpose of the test.

---

## Summary

| Finding | File | Severity |
|---------|------|----------|
| Auth validation fetch not aborted on timeout -- late response corrupts button state | ui-auth.js:130-158 | ADVISE |
| Empty catches swallow all errors, including non-timeout failures | ui-submit.js:292-298, 333-336 | ADVISE |
| Retry handler re-parses hash instead of closing over id; hidden cross-module coupling | ui-detail.js:421 | ADVISE |
| Dead code: redundant href assignment that does nothing | ui-submit.js:94-97 | NIT |
| `screenshotBefore` field name vs artifact path -- worth verifying API contract | ui-detail.js:158 | NIT |
| Retry-After parseInt NaN path -- functionally correct, but intent unclear | ui-poll.js:85 | NIT |
| innerHTML security test regex misses concatenation patterns | test/ui-dashboard.test.js:183-185 | NIT |

No XSS vectors found. `safeUrl` correctly validates protocol before rendering links.
All user-supplied data is assigned via `textContent` or `createElement`. The
`connect-src 'self'` CSP is correct for same-origin API calls. `script-src
'unsafe-inline'` is acceptable given no external scripts are loaded and the
inline script is worker-generated (no injection vector). Auth token is stored in
`sessionStorage` (not `localStorage`), which is correct for tab-scoped auth. The
capture ID regex `CAPTURE_RE` matches the route validation in index.js exactly.
