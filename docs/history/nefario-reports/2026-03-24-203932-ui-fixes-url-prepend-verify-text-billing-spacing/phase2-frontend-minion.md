## Domain Plan Contribution: frontend-minion

### Recommendations

#### Fix 1: URL auto-prepend (`safeUrl()` in `ui-submit.js`)

**Modify `safeUrl()` inline rather than adding a separate `normalizeUrl()`.** Rationale:

1. `safeUrl()` is a 7-line function with a single caller in `handleSubmit()`. Adding a separate normalization step before calling it creates two functions that must stay coordinated. The logic is simple enough to inline: try parsing, and if the URL constructor throws, try again with `https://` prepended.

2. A separate `normalizeUrl()` in `handleSubmit()` would mean the error message path (`'Enter a valid http:// or https:// URL.'`) triggers only after normalization already failed -- the message would need updating anyway. Keeping it in one place is cleaner.

**Proposed implementation for `safeUrl()`:**

```js
function safeUrl(urlStr) {
  try {
    var u = new URL(urlStr);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch (e) {
    // Bare hostname? Try prepending https://
    if (urlStr && !urlStr.includes('://')) {
      try {
        var u2 = new URL('https://' + urlStr);
        if (u2.protocol === 'https:') return u2.href;
      } catch (e2) {
        // Still invalid -- fall through to return null
      }
    }
  }
  return null;
}
```

**Key design decisions:**

- **Guard with `!urlStr.includes('://')`.** This prevents "fixing" partial schemes like `htt://foo.com` (which would become `https://htt://foo.com` -- nonsensical). If the input already has `://` in it, the user intended a scheme and got it wrong; we should not silently rewrite that. Only truly bare hostnames (like `example.com`, `example.com/page`) get the prepend.

- **The input field should visually update** to show the normalized URL. After `safeUrl()` returns a non-null value, `handleSubmit()` should set `urlInput.value = safe;` before clearing it on success. This provides immediate feedback -- the user sees what was actually submitted. If we normalize silently, the user types `example.com`, the input clears, and they see "Capturing..." on `https://example.com/` in the list. That is acceptable too, but showing the corrected URL briefly in the input before clearing is slightly better UX. However, since the input is cleared immediately on success (line 397), the visual update would be near-instantaneous. **Recommendation: update the input value to the normalized URL before submission, so the user can see what they're submitting.** This is a single line: `urlInput.value = safe;` inserted between the validation check and the `submitBtn.disabled = true` line.

- **Update the error message** from `'Enter a valid http:// or https:// URL.'` to something like `'Enter a valid URL (e.g. example.com or https://example.com).'` to reflect that bare hostnames are now accepted.

- **The `safeUrl()` in `ui-detail.js`** (line ~90) should NOT be changed. That function validates URLs from the server response for rendering links -- those URLs already have schemes. Changing it would mask bad data from the API.

- **The `safeUrl()` in `verify-page.js`** (line ~348) is also a display-only validator and should NOT be changed. It validates URLs embedded in capture metadata.

**Server-side compatibility:** The server's `validateUrl()` in `url-validation.js` expects a full URL with scheme (line 331: the URL constructor would throw on `example.com`). Client-side normalization in `safeUrl()` ensures the POST body always contains `https://example.com/...`, so no server changes are needed.

#### Fix 2: Verify page text (`verify-page.js` line 344)

Single string replacement: `'eIDAS Art. 41'` to `'eIDAS Article 41'`. No other files reference `Art. 41`. The CLI formatter `format.js` uses `'Qualified timestamp'` without any eIDAS reference -- no change needed.

No tests currently assert on this exact string (confirmed via grep), so the change is purely cosmetic with zero test impact.

#### Fix 3: Billing page spacing (`ui-css.js` ~line 1504)

The `.billing-stat` rule (line 1504-1506) only sets `text-align: center`. The value span (`.billing-stat-value`) and label span (`.billing-stat-label`) are stacked as block-level elements but the `.billing-stat` container has no `display` property. Since `<div>` defaults to `display: block`, the children stack vertically by default -- but there is no explicit gap or padding between the value and label.

Looking at `buildStatCell()` in `ui-billing.js` (line 324-338): it creates a `div.billing-stat` containing a `span.billing-stat-value` followed by a `span.billing-stat-label`. Spans are inline by default. The `.billing-stat-label` already has `margin-top: var(--space-1)` but since spans are inline, `margin-top` has no effect on inline elements in standard flow.

**Fix:** The `.billing-stat-value` and `.billing-stat-label` should be `display: block` (or the parent should use flex column). The simplest fix is adding `display: block` to both `.billing-stat-value` and `.billing-stat-label`. This makes the spans render as blocks, allowing the existing `margin-top: var(--space-1)` on `.billing-stat-label` to create visible spacing.

Alternatively, make `.billing-stat` a flex column container, which also gives block formatting to children:

```css
.billing-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
```

**Recommendation: use `display: block` on the two child spans.** It is the minimal change and makes the existing `margin-top` work as intended. Adding flexbox to the parent is overkill for two stacked elements.

### Proposed Tasks

#### Task 1: URL auto-prepend in `safeUrl()`

**What to do:**
1. Modify `safeUrl()` in `src/ui/ui-submit.js` to try prepending `https://` when no `://` is present in input and initial URL parse throws
2. Add `urlInput.value = safe;` in `handleSubmit()` after validation succeeds (before disabling the button) so the input briefly reflects the normalized URL
3. Update the error message to `'Enter a valid URL (e.g. example.com or https://example.com).'`

**Deliverables:** Modified `src/ui/ui-submit.js`

**Dependencies:** None

#### Task 2: Tests for URL auto-prepend

**What to do:**
Add tests for the `safeUrl()` function. The project uses an `evalFromSource()` pattern (seen in `test/ui-billing.test.js`) to extract functions from the JS string constants and test them in isolation. Create `test/ui-submit.test.js` following the same pattern:

- `safeUrl('https://example.com')` returns `'https://example.com/'`
- `safeUrl('http://example.com')` returns `'http://example.com/'`
- `safeUrl('example.com')` returns `'https://example.com/'` (auto-prepend)
- `safeUrl('example.com/page?q=1')` returns `'https://example.com/page?q=1'`
- `safeUrl('htt://example.com')` returns `null` (has `://`, don't fix)
- `safeUrl('ftp://example.com')` returns `null` (wrong scheme)
- `safeUrl('javascript:alert(1)')` returns `null`
- `safeUrl('')` returns `null`
- `safeUrl('not a url at all')` returns `null` (even with prepend, `https://not a url at all` is invalid)

**Deliverables:** New `test/ui-submit.test.js`

**Dependencies:** Task 1 (needs the modified `safeUrl`)

#### Task 3: Verify page text fix

**What to do:**
In `src/verify-page.js` line 344, replace `'eIDAS Art. 41'` with `'eIDAS Article 41'`.

**Deliverables:** Modified `src/verify-page.js` (single line change)

**Dependencies:** None

#### Task 4: Billing stat spacing fix

**What to do:**
In `src/ui/ui-css.js`, add `display: block;` to both `.billing-stat-value` and `.billing-stat-label` rules. This makes the spans render as blocks, allowing the existing `margin-top: var(--space-1)` on `.billing-stat-label` to create visible spacing.

**Deliverables:** Modified `src/ui/ui-css.js` (two lines added)

**Dependencies:** None

### Risks and Concerns

1. **Auto-prepend could mask user errors.** If a user types `example` intending to type `example.com`, `safeUrl('example')` with prepend would try `https://example` -- which is a valid URL per the WHATWG spec (no TLD required). The server's SSRF validation will catch nonsensical hostnames that don't resolve, but the client will silently submit. This is acceptable: the server is the real validation boundary, and the UX improvement for the common case (bare hostnames) outweighs the edge case. The form error is for obvious syntax issues, not hostname validity.

2. **`safeUrl()` exists in three files with slightly different behavior.** The change MUST be scoped to `ui-submit.js` only. The `safeUrl()` in `ui-detail.js` and `verify-page.js` are display validators for server-provided URLs (which always have schemes). Changing those would hide API bugs. The issue ticket (#179) correctly scopes this to the capture form only.

3. **The billing spacing fix relies on spans defaulting to inline.** Verified: `buildStatCell()` creates `<span>` elements. Adding `display: block` is correct. If someone later changes these to `<div>`, the `display: block` becomes redundant but harmless.

4. **No existing test file for `ui-submit.js` helpers.** A new test file needs to be created, following the `evalFromSource()` pattern from `test/ui-billing.test.js`. The `SUBMIT_VIEW_JS` is a template literal string constant (not a module with imports), so function extraction via the same technique works correctly.

5. **The `handleSubmit` function trims input** (`urlInput.value.trim()` on line 364) before passing to `safeUrl()`. This means leading/trailing whitespace is already handled -- `safeUrl()` does not need to trim.

### Additional Agents Needed

None. All three fixes are straightforward frontend changes within the existing codebase patterns. The test-minion may want to review the `ui-submit.test.js` scope, but the frontend-minion can write these tests directly following the established `evalFromSource()` pattern.
