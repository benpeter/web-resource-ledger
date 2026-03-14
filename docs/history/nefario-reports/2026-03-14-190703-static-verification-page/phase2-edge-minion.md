# Edge Minion -- Planning Contribution

## Domain

Edge computing, CDN caching, content negotiation, security headers, Cloudflare Workers.

## Analysis

### Current State

`handleVerifyCapture` in `src/index.js` (lines 222-294) is a 72-line handler that:

1. Rate-limits by IP
2. Checks signing key availability
3. Loads capture record from KV
4. Fetches WACZ from R2
5. Runs verification via `verifyWacz()`
6. Returns JSON with cache-aware headers (`public, max-age=86400, stale-while-revalidate=604800` for verified; `no-store` for unverified/errors)

The handler already does all the data fetching and verification work. The HTML response is purely a rendering concern layered on top of the existing verification result object.

### Content Negotiation Pattern

**Recommendation: `Accept` header check at the end of `handleVerifyCapture`, with HTML rendering extracted to `src/verify-page.js`.**

Here is the specific approach, step by step:

#### 1. Negotiate after verification, not before

The verification logic (steps 1-7) is identical for both JSON and HTML consumers. The only divergence point is step 8: building the response. Content negotiation should happen at the response-building boundary, not at route dispatch.

Do NOT split this into two routes. A single resource (`/v1/verify/{id}`) with multiple representations is textbook HTTP content negotiation (RFC 9110 Section 12.5.1). Two routes would mean two cache keys, two rate-limit paths, and two code paths to maintain for identical verification logic.

Pattern inside `handleVerifyCapture`:

```js
// After step 7 (body is built, cacheControl is determined)...

const wantsHtml = /text\/html/.test(request.headers.get('Accept') || '');

if (wantsHtml) {
  return htmlVerifyResponse(body, cacheControl);
}

return jsonResponse(body, 200, {
  'Cache-Control': cacheControl,
  'Access-Control-Allow-Origin': '*',
});
```

This adds exactly 4 lines to `index.js`. The `htmlVerifyResponse` function lives in the new module.

#### 2. Extract HTML rendering to `src/verify-page.js`

This module exports a single function: `htmlVerifyResponse(verifyResult, cacheControl)`. It returns a `Response` object with the correct Content-Type and security headers.

Why a separate module:

- The HTML template string will be 80-150 lines of markup+CSS+JS. Inlining that in `index.js` would double the handler's length and bury the routing logic.
- The existing codebase has one module per concern: `responses.js` for response helpers, `verify.js` for verification logic, `signing.js` for crypto. A rendering module fits this pattern.
- It keeps `index.js` as a thin routing/orchestration layer -- consistent with the current architecture.

Why NOT a template factory or template literal helper:

- Template factories add indirection for no benefit when there is exactly one template. A single exported function that returns a `Response` is the simplest thing that works.
- No templating library needed. A tagged template literal or string concatenation with the verification result object is sufficient.

#### 3. Early-exit paths need HTML variants too

The handler has three early-exit points before step 7:

- **Rate limit exceeded (429)**: Currently returns `problemResponse(429, ...)`. For HTML consumers, this should still return the problem JSON or a minimal HTML error page. Recommendation: keep the `problemResponse` for error cases. The `Accept` check only applies to the 200 response path. Rationale: error pages are transient, the user will retry, and building HTML error variants for every status code is YAGNI.
- **Signing keys unavailable (503)**: Same -- keep `problemResponse`.
- **Capture not found (404)**: Same -- keep `problemResponse`.

This means the `Accept` check only needs to exist at the single success path (step 8), which keeps the change minimal.

**Alternative considered and rejected**: Wrapping all responses (including errors) in HTML when the client accepts `text/html`. This would require HTML error templates, add complexity for cases the user will rarely see, and make error handling inconsistent with the rest of the API. A browser hitting a 404 or 429 will display the JSON problem response legibly enough.

### Caching Implications

#### Cache key must include `Accept` header -- use `Vary: Accept`

This is the most critical edge concern. Without `Vary: Accept`, a CDN or browser cache could serve a JSON response to an HTML request (or vice versa). The `handleVerifyCapture` handler already sets conditional `Cache-Control` headers. Adding `Vary: Accept` ensures correct cache keying.

```
Vary: Accept
```

**Risk**: `Vary: Accept` fragments the cache. The `Accept` header has many possible values (`text/html`, `text/html,application/xhtml+xml,...`, `application/json`, `*/*`, etc.). In practice, there are exactly two meaningful variants: "includes text/html" and "does not include text/html". This is acceptable cache fragmentation -- two variants per URL, not dozens.

**Implementation detail**: The `Vary` header must be set on BOTH the JSON and HTML responses for the verify endpoint. If only set on one, the other variant can poison the cache.

**Where to set it**: In `handleVerifyCapture` itself, not in the global response handler (lines 47-49 of `index.js`). The global handler should not add `Vary: Accept` to every route -- only the verify endpoint does content negotiation. Set it alongside `Cache-Control` in the response headers.

#### Cache-Control values stay the same

The existing cache strategy is correct for both representations:

- Verified: `public, max-age=86400, stale-while-revalidate=604800` -- 1 day fresh, 7 days stale-while-revalidate. Good. The verification result is immutable (a WACZ that verifies today will verify identically tomorrow). The stale-while-revalidate window is generous, which is appropriate.
- Unverified/errors: `no-store` -- correct. Failed verifications should never be cached because the failure might be transient (R2 issue, corrupted re-upload, etc.).

No changes needed to TTL strategy.

### Security Headers

The HTML response needs different headers than the JSON response. Here is the complete set:

#### Content-Type

```
Content-Type: text/html; charset=utf-8
```

Must include `charset=utf-8` to prevent encoding-based XSS (CWE-116). The JSON responses use `application/json` which is safe by default, but `text/html` without explicit charset can be exploited via content sniffing.

#### Content-Security-Policy

The HTML page must have a strict CSP since it is self-contained with no external dependencies:

```
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Breakdown:

- `default-src 'none'` -- blocks all resource loading by default (no external HTTP requests requirement satisfied at the CSP level, defense-in-depth)
- `style-src 'unsafe-inline'` -- allows inlined `<style>` block (required since CSS is inlined)
- `script-src 'unsafe-inline'` -- allows inlined `<script>` block (required since JS is inlined). If nonce-based CSP is desired later, the nonce can be generated per-request at the edge with `crypto.randomUUID()` and injected into both the CSP header and the `<script nonce="...">` attribute. But for MVP, `'unsafe-inline'` is sufficient given the page is entirely server-rendered with no user input reflected into the DOM.
- `img-src data:` -- allows data URIs for any inline images (checkmarks, icons as SVG data URIs). If no images are used, tighten to `img-src 'none'`.
- `base-uri 'none'` -- prevents `<base>` tag injection
- `form-action 'none'` -- prevents form submission (no forms on this page)
- `frame-ancestors 'none'` -- equivalent to `X-Frame-Options: DENY`, prevents clickjacking

#### X-Frame-Options

```
X-Frame-Options: DENY
```

Belt-and-suspenders with `frame-ancestors 'none'` in CSP. Some older browsers only respect `X-Frame-Options`.

#### Existing global headers (already applied)

These are set in `index.js` lines 47-48 on every response, including the HTML response:

- `Referrer-Policy: no-referrer` -- good, prevents leaking the verify URL in referrer headers
- `X-Content-Type-Options: nosniff` -- critical for HTML responses, prevents MIME type sniffing

No additional security headers needed. The page serves no external resources, accepts no input, and submits no forms.

### `<noscript>` Considerations

The task requires a `<noscript>` fallback. From an edge/caching perspective, the key constraint is: the HTML response must be identical regardless of whether the client has JavaScript enabled. The verification result is server-rendered into the HTML at the edge. The `<noscript>` fallback should show the same data, just with less visual polish (no animated transitions, no collapsible sections, etc.).

This means: **one cache entry serves both JS-enabled and JS-disabled clients**. No `Vary` on any JavaScript capability signal. The HTML is fully self-contained and pre-rendered. Good.

### Response Size and Worker Limits

Cloudflare Workers have a script size limit (10 MB compressed for paid plans, 1 MB for free). The HTML template will be a string in the Worker source. A 150-line HTML template with inlined CSS and JS will add roughly 5-10 KB to the script -- negligible.

The response body (HTML page) will be under 15 KB including inlined CSS/JS. This is well within Worker response limits and fast to deliver from the edge.

### Error Path HTML -- Reconsidered for 404

One exception to the "keep `problemResponse` for errors" recommendation above: the 404 case. A non-technical user visiting `/v1/verify/cap_invalidid` in a browser will see raw JSON. Consider returning a minimal HTML 404 page when `Accept: text/html` for ONLY the 404 case (not 429 or 503). This is a small addition (10 lines) and significantly improves the non-technical user experience. But this is a UX judgment call, not an edge concern -- flagging it for the frontend specialist to decide.

## Recommendations

1. **Add `Accept` header check at the end of `handleVerifyCapture`**, after verification is complete. Branch to `htmlVerifyResponse()` from a new `src/verify-page.js` module. Four lines added to `index.js`.

2. **Create `src/verify-page.js`** exporting `htmlVerifyResponse(verifyResult, cacheControl)`. Returns a `Response` with `text/html; charset=utf-8` Content-Type and full CSP headers. Contains the HTML template as a template literal.

3. **Set `Vary: Accept` on all verify endpoint responses** (both JSON and HTML paths). This ensures correct CDN and browser cache keying for the content-negotiated resource.

4. **Apply strict CSP**: `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` plus `X-Frame-Options: DENY` on the HTML response only.

5. **Do not add HTML variants for error responses** (429, 503, 404). Keep `problemResponse` for all error paths. The `Accept` check only applies to the 200 success path. Exception: 404 might warrant a minimal HTML page for UX reasons -- defer to frontend specialist.

6. **Keep existing Cache-Control strategy unchanged**. The current TTLs and stale-while-revalidate values are correct for both JSON and HTML representations.

7. **Add a `htmlResponse` helper to `src/responses.js`** if there is any chance of other endpoints doing content negotiation in the future. Otherwise, keep the response construction in `verify-page.js` -- no need to generalize prematurely (YAGNI).

## Risks and Concerns

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missing `Vary: Accept` causes cached JSON served to browsers | High | Explicit `Vary: Accept` on all verify responses. Test with curl and browser. |
| HTML template injects user-controlled data unsafely (XSS) | High | The verification result contains only server-generated data (capture ID, timestamps, check statuses). No user input is reflected. But the `detail` field in check results could theoretically contain attacker-influenced strings if a WACZ is crafted maliciously. **All values interpolated into HTML must be entity-escaped.** Provide an `escapeHtml()` utility in `verify-page.js`. |
| CSP too restrictive breaks legitimate rendering | Low | Test with `<noscript>` path. The CSP is permissive enough for inline styles and scripts. |
| `Accept` header parsing edge cases (`*/*`, quality values) | Low | Simple regex `/text\/html/` test is sufficient. `*/*` should fall through to JSON (API clients send `*/*`, browsers send `text/html` first). This is intentional -- JSON is the default, HTML is opt-in. |
| Cache fragmentation from `Vary: Accept` | Low | Only two effective variants. Acceptable trade-off. |

## Dependencies and Interactions

- **Frontend specialist**: Owns the HTML template content, CSS, JS, `<noscript>` fallback, and UX decisions. Edge minion provides the response wrapper, headers, and caching strategy.
- **Security specialist**: Should review the CSP policy, the `escapeHtml()` implementation, and confirm no reflected input reaches the HTML.
- **No new Worker bindings or wrangler.toml changes needed.** The HTML rendering uses only the existing verification result object -- no new KV, R2, or rate limiter bindings.
- **No new routes needed.** Content negotiation on the existing route is the correct HTTP pattern.
- **Tests**: The existing `verify-integration.test.js` tests should be extended with `Accept: text/html` variants. At minimum: (a) verify that `Accept: text/html` returns HTML with correct Content-Type, (b) verify that `Vary: Accept` is present on both JSON and HTML responses, (c) verify CSP header is present on HTML response, (d) verify JSON is still the default when no `Accept` header is sent.
