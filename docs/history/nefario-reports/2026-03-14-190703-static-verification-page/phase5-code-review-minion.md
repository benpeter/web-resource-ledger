---
reviewer: code-review-minion
phase: MVP Step 7 -- Static Verification Page
date: 2026-03-14
---

## VERDICT: ADVISE

The implementation is structurally sound and the primary security controls are
correctly applied. The noscript block is escaped, textContent is used for all
user-controlled API data, safeUrl validates URL schemes before setting href and
src, Accept: application/json is present on the verify fetch, the CSP is
correct, and Vary: Accept appears on both response branches. No hardcoded
secrets, no SQL injection surface, no CVEs introduced. The issues below are
real but none rise to BLOCK level.

---

## FINDINGS

### [ADVISE] verify-page.js:268-269 -- Raw interpolation of origin into script block JS string literal

```js
var captureId = '${captureId}';
var origin    = '${origin}';
```

AGENT: nefario / frontend specialist

The noscript block correctly uses `safeId`/`safeOrigin` (HTML-escaped). The
script block uses raw template interpolation into single-quoted JS string
literals without escaping for a JS context. This relies on two implicit
guarantees: (a) the regex `cap_[a-f0-9]{32}` ensures `captureId` can never
contain a quote or backslash; (b) `new URL(request.url).origin` produces a
string the URL spec guarantees cannot contain a single quote. Both guarantees
currently hold. The risk is that a future refactor loosens either constraint
without realising the script block depends on it.

FIX: Apply a minimal JS-string-literal escape before interpolation (at minimum,
escape `\`, `'`, and newlines). A one-liner in the server module is sufficient:

```js
function escapeJsString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]/g, '');
}
```

Then use `${escapeJsString(captureId)}` and `${escapeJsString(origin)}` on
lines 268-269. This makes the safety property explicit and local rather than
dependent on call-site contracts.

---

### [ADVISE] verify-page.js:310-325 -- c.name used unescaped in innerHTML concatenation and as querySelector argument

In `renderChecks`, `c.name` is embedded directly into an HTML string for the
`data-check-label` and `data-check-detail` attribute values (lines 320, 322),
and later used as a selector argument in `querySelector` (line 439):

```js
document.querySelector('[data-check-detail="' + c.name + '"]')
```

AGENT: nefario / frontend specialist

Today `c.name` is always one of three fixed strings from `verifyWacz`
(`artifactHashes`, `bundleHash`, `signature`), so there is no practical risk.
However, the pattern is unsafe by construction: if the JSON API ever returns a
`name` containing `"` or `]`, the querySelector call produces a malformed
selector (throwing or matching incorrectly), and the innerHTML concatenation
inserts unescaped content into attribute context.

FIX: Two options, pick one:
1. Use a whitelist lookup before setting the attribute:
   `var safeCheckName = CHECK_LABELS[c.name] ? c.name : '';`
   Use `safeCheckName` for both the attribute value and the selector.
2. Apply CSS.escape() for the querySelector call:
   `document.querySelector('[data-check-detail="' + CSS.escape(c.name) + '"]')`
   and escapeHtml (or attribute-safe encoding) before innerHTML insertion.

---

### [ADVISE] verify-page.js:510 -- retrievalUrl fetch missing Accept: application/json

```js
fetch(retrievalUrl).then(function (r) { return r.ok ? r.json() : null; })
```

AGENT: nefario / frontend specialist

The verify fetch on line 509 correctly sets `Accept: application/json` to
prevent a content-negotiation loop. The retrieval fetch on line 510 omits it.
The GET /v1/captures/{id} endpoint currently does not do content negotiation
(always returns JSON), so this is not a functional bug today. But the omission
is an inconsistency: if content negotiation is ever added to that endpoint (a
natural extension), the page will silently receive its own HTML instead of
JSON, and the populate() call will fail without a useful error.

FIX: Add the Accept header to the retrieval fetch for defensive consistency:
```js
fetch(retrievalUrl, { headers: { 'Accept': 'application/json' } })
  .then(function (r) { return r.ok ? r.json() : null; })
  .catch(function () { return null; })
```

---

### [NIT] verify-page.js:315-317 -- Dead code: detailHtml variable assigned but never used

```js
var detailHtml = c.detail
  ? '<p class="check-detail"></p>'
  : '';
```

AGENT: nefario / frontend specialist

`detailHtml` is computed but never referenced. The actual detail element is
emitted inline on line 322. This is dead code. The empty `<p>` it would have
produced is also structurally different from the `<div>` actually emitted, so
it looks like a draft that was superseded during implementation.

FIX: Delete lines 315-317.

---

### [NIT] verify-page.js:293 -- Content negotiation uses substring match rather than proper Accept parsing

```js
const accept = request.headers.get('Accept') || '';
if (accept.includes('text/html')) {
```

AGENT: nefario (index.js, step 9)

`includes('text/html')` is a substring check. It correctly handles the common
browser case (`text/html,application/xhtml+xml,...`) and the test cases
present. It would also match a hypothetical `Accept: text/html-custom` header,
though this is not a realistic concern. More importantly, it does not respect
quality values (`q=0`): a client sending `Accept: text/html;q=0` explicitly
opts out of HTML but would receive HTML anyway.

This is acceptable for MVP given that the client population is browsers and
the `q=0` case is exotic. Flag for post-MVP if the endpoint is ever used by
programmatic clients with explicit HTML rejection.

FIX (post-MVP): Replace with a proper Accept header parser or at minimum check
for `text/html` as a comma-delimited token rather than a raw substring.

---

### [NIT] test/verify-page.test.js -- No test for c.name injection path in renderChecks

The security test suite covers noscript injection (captureId and origin) and
escapeHtml exhaustively, but does not include a test verifying that a
`c.name` value containing `"` in the JSON API response does not produce
malformed HTML or an unexpected querySelector match.

AGENT: nefario / test specialist

FIX: Add a unit test that calls `renderChecks` with a check whose `name`
contains `"` and `]` and asserts the output is either escaped or the name is
treated as unknown.

---

### [NIT] test/verify-html.test.js:14 -- TEST_ORIGIN shadows TEST_URL fixture

```js
const TEST_URL    = 'https://example.com';
const TEST_IP     = '93.184.216.34';
const TEST_ORIGIN = 'https://example.com';
```

AGENT: nefario / test specialist

`TEST_URL` and `TEST_ORIGIN` are identical. `TEST_ORIGIN` is the value used
for request origin assertions; `TEST_URL` is the captured URL. The coincidence
means tests cannot catch a bug where the captured URL is incorrectly substituted
for the origin. Consider using distinct values (e.g.
`TEST_URL = 'https://example.com/path'`) to ensure the two concepts are
independently testable.

FIX: Use `const TEST_URL = 'https://example.com/path?q=1';` or any value
distinct from `TEST_ORIGIN`.

---

## SUMMARY

| Severity | Count |
|----------|-------|
| BLOCK    | 0     |
| ADVISE   | 3     |
| NIT      | 3     |

The three ADVISE findings are patterns that are safe today due to call-site
contracts, but would become bugs if those contracts are relaxed. The escapeJs
fix (finding 1) is the highest-priority of the three: it is a one-liner and
makes the page's correctness self-evident rather than dependent on a regex
constraint in a different file.
