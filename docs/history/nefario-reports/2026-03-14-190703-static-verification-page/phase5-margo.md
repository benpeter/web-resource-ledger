# Margo Review: Static Verification Page

## VERDICT: ADVISE

The implementation is fundamentally proportional to the problem. A single
exported function produces a self-contained HTML page with inline CSS and JS --
no build tooling, no framework, no external dependencies. Content negotiation
in index.js is three lines. This is a lean approach. The concerns below are
non-blocking but worth addressing before or shortly after merge.

---

## FINDINGS

### [ADVISE] src/verify-page.js:268 -- Unescaped captureId injected into JavaScript string literal

The `captureId` value is interpolated raw into the inline `<script>` block
at line 268:

```js
var captureId = '${captureId}';
```

`escapeHtml` is applied only to `safeId` / `safeOrigin` used in the HTML
template (noscript block, title). But inside a JS string literal, HTML
escaping is the wrong defense -- a captureId containing `'` or `\` would
break the JS string or allow injection. The route regex `cap_[a-f0-9]{32}`
prevents this in practice (only hex chars pass), but defense in depth says
the template should not rely on upstream validation for injection safety.
If the regex ever loosens, this becomes an XSS vector.

**FIX:** Inject the captureId and origin via a `<script type="application/json">`
data island and parse it with `JSON.parse` inside the IIFE. This is the
standard pattern for safely passing server data to inline scripts:

```html
<script id="page-data" type="application/json">${JSON.stringify({ captureId, origin })}</script>
<script>
(function () {
  var data = JSON.parse(document.getElementById('page-data').textContent);
  var captureId = data.captureId;
  var origin = data.origin;
  // ... rest of IIFE
}());
</script>
```

`JSON.stringify` handles all special characters correctly for both HTML and JS
contexts. Alternatively, at minimum apply a JS-string-safe escaper (replace
`\` `'` and `</` ) to both values at lines 268-269.

---

### [NIT] src/verify-page.js:104 -- Empty CSS rule `.status-text-wrap {}`

Line 104 declares `.status-text-wrap {}` with no properties. This is dead code
that adds noise.

**FIX:** Remove the empty rule. If it exists as a future placeholder, that is
exactly the kind of speculative code YAGNI targets -- add properties when you
need them.

---

### [NIT] src/verify-page.js:315-317 -- Dead HTML generation in renderChecks

Lines 315-317 create a `<p class="check-detail"></p>` element that is never
inserted into the returned HTML string. The actual detail element is generated
at line 322 via a separate conditional. The variable `detailHtml` is assigned
but never referenced.

```js
var detailHtml = c.detail
  ? '<p class="check-detail"></p>'
  : '';
```

**FIX:** Remove the `detailHtml` variable entirely (lines 315-317). It is
unused dead code.

---

### [ADVISE] test/verify-page.test.js -- Overlapping tests reduce signal density

The 24 unit tests include cases that test the same thing from slightly
different angles without adding coverage:

- "contains the capture ID in the noscript block" (line 59) and "contains a
  link to the JSON API endpoint in noscript" (line 69) both verify noscript
  content with the captureId -- the second subsumes the first.
- "contains a `<noscript>` tag" (line 78) is subsumed by the two tests above
  that already slice the noscript block (they would fail if noscript were
  absent).
- "contains the API fetch URL pattern with the captureId" (line 84) tests the
  same URL string as line 69, just without scoping to noscript.

This is not blocking -- 24 tests for a security-sensitive HTML template module
is not excessive. But 4-5 of these could be consolidated without losing
coverage.

**FIX:** Merge the noscript-content tests into one test that asserts: noscript
exists, contains the captureId, and contains the API link. Remove the
standalone "contains a `<noscript>` tag" test. This drops to ~20 unit tests
with identical coverage.

---

### [NIT] src/verify-page.js -- Line count assessment

537 lines for a module that contains CSS (~200 lines), HTML (~35 lines), and
client-side JS (~260 lines) -- all inline in a single template literal -- is
structurally appropriate. There is no way to decompose this without introducing
a build step or external file serving, both of which would add more complexity
than they remove. The inline approach is the simplest architecture for a
Cloudflare Worker that needs to serve a self-contained HTML page. No action
needed.

---

## Complexity Budget Tally

| Addition | Cost |
|---|---|
| verify-page.js (new module, single exported function) | 0 (no new abstraction layer, no new dependency) |
| Content negotiation in index.js (3 lines in existing handler) | 0 |
| **Total** | **0 new complexity budget spend** |

The implementation adds functionality without adding abstractions, layers,
dependencies, or services. This is how feature work should look.

## Summary

The code is well-structured and proportional. The captureId injection pattern
(ADVISE) is the only item with real-world risk, though mitigated today by the
route regex. The dead code items (two NITs) are trivial cleanup. Test count is
reasonable for a security-sensitive HTML module; minor consolidation would
improve signal density but is not required.
