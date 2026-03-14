# Security Minion -- Phase 2 Contribution

## Domain

Application Security / Content Security / XSS Prevention

## Analysis

### Current Security Posture

The existing Worker has a strong security baseline:
- `X-Content-Type-Options: nosniff` on all responses (index.js:48)
- `Referrer-Policy: no-referrer` on all responses (index.js:47)
- Stored HTML artifacts deliberately served as `text/plain` with `Content-Disposition: attachment` to prevent XSS (index.js:195-196, comment: "CRITICAL: never text/html")
- Static error messages -- no reflected user input in error responses (index.js:42-43)
- Capture ID validated by regex before use: `cap_[a-f0-9]{32}` (index.js:20)
- Verification endpoint already rate-limited at 60 req/min/IP (wrangler.toml:23-26)
- `Access-Control-Allow-Origin: *` already on verification JSON responses (index.js:260, 292)

Introducing `text/html` responses is the first time this Worker serves executable content. This fundamentally changes the threat surface.

---

### (1) Content Security Policy for Inline Script and Style

**Risk: HIGH** -- Without CSP, any XSS in the HTML page (via data injection) can execute arbitrary JavaScript in the Worker's origin context.

**Recommendation: Nonce-based CSP.**

Use a per-request cryptographic nonce for both `<script>` and `<style>` elements. The Worker generates a nonce on each request and injects it into both the CSP header and the HTML elements.

```
Content-Security-Policy: default-src 'none'; script-src 'nonce-{random}'; style-src 'nonce-{random}'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

Directive rationale:
- **`default-src 'none'`** -- deny-by-default, each resource type must be explicitly allowed
- **`script-src 'nonce-{nonce}'`** -- only the Worker-generated inline script runs. No `'unsafe-inline'`, no `'unsafe-eval'`. A nonce is superior to a hash here because the HTML is a template string with dynamic data injected server-side -- the hash would change per response. If the team can guarantee the script block is truly static (no interpolated values inside `<script>`), then `script-src 'sha256-{hash}'` is acceptable and avoids nonce generation, but see XSS analysis in section (3) for why the script block should remain static.
- **`style-src 'nonce-{nonce}'`** -- same reasoning for `<style>`. If styles are truly static, `'sha256-{hash}'` works here too.
- **`img-src data:`** -- screenshot display may use `data:` URIs (inline base64). If screenshots are NOT inlined (per the "zero external HTTP requests" constraint, they must be either inlined as data URIs or omitted), add `data:`. If screenshots are omitted from the HTML page, tighten to `img-src 'none'`.
- **`connect-src 'self'`** -- the inline JS fetches the JSON verification endpoint on the same origin. No other XHR/fetch targets are needed.
- **`base-uri 'none'`** -- prevents `<base>` tag injection that redirects relative URLs
- **`form-action 'none'`** -- no forms on this page; prevents form-based data exfiltration
- **`frame-ancestors 'none'`** -- equivalent to `X-Frame-Options: DENY`; prevents clickjacking. Also add `X-Frame-Options: DENY` as a legacy header for older browsers.

**Nonce generation in Cloudflare Workers:**

```js
const nonce = btoa(crypto.getRandomValues(new Uint8Array(16)));
```

This produces 128 bits of cryptographic randomness, base64-encoded. Sufficient entropy to prevent nonce prediction.

**Implementation constraint:** The nonce must be injected into the HTML template string at response time. This means the HTML cannot be a static string constant -- it must be a template function that accepts the nonce. This is fine; the nonce insertion points are well-defined (`<script nonce="...">` and `<style nonce="...">`).

**Alternative considered: hash-based CSP.** If the `<script>` and `<style>` blocks contain zero interpolated data (all dynamic data is injected via DOM manipulation after fetch, not via server-side template interpolation), then static SHA-256 hashes work. This is simpler (no nonce generation) but fragile -- any future change to the script/style content requires updating the hash in the CSP header. The nonce approach is more maintainable.

**Decision for implementation team:** Choose nonce-based CSP. The overhead is one `crypto.getRandomValues()` call and two string replacements per request -- negligible for a Cloudflare Worker.

---

### (2) Same-Origin Fetch and CORS

**Risk: LOW** -- The HTML page and the JSON API are served from the same origin (same Worker, same domain). Same-origin requests do not trigger CORS preflight.

**Details:**

The page's inline JS will fetch `GET /v1/verify/{id}` (the JSON response for the same capture ID). Since the page is served from the same path on the same origin, this is a same-origin request. The browser will not send an `Origin` header, and CORS headers are irrelevant.

The existing `Access-Control-Allow-Origin: *` on the JSON verification response (index.js:260, 292) is already present for third-party consumers and does not interfere. It remains correct.

**One subtlety:** The `Accept` header content negotiation must be explicit. The inline JS fetch must set `Accept: application/json` to ensure it receives JSON, not HTML (which would cause infinite recursion or a parsing error). If the fetch omits the `Accept` header, browsers default to `*/*`, and the Worker's content negotiation logic could return HTML. This is a correctness issue, not a security issue, but it would break the page.

**Recommendation:** The content negotiation logic should check for `text/html` explicitly in the `Accept` header. The safest pattern:

```js
const wantsHtml = request.headers.get('Accept')?.includes('text/html');
```

If `text/html` is present, serve HTML. Otherwise, serve JSON. This is correct for browsers (which send `text/html` in their default Accept header) and API clients (which typically send `application/json` or omit Accept). The inline JS fetch should explicitly set `Accept: application/json` as defense-in-depth.

---

### (3) XSS Vectors and Sanitization

**Risk: HIGH** -- This is the most critical security concern. The HTML page displays user-originated data from the verification JSON response.

**Data fields displayed and their XSS risk:**

| Field | Source | Contains User Input? | XSS Risk |
|-------|--------|---------------------|-----------|
| `capture.id` | Server-generated | No -- `cap_[a-f0-9]{32}` regex-validated | **None** -- hex-only, no HTML metacharacters possible |
| `capture.createdAt` | Server-generated ISO 8601 | No | **None** -- timestamp format cannot contain HTML |
| `capture.completedAt` | Server-generated ISO 8601 | No | **None** |
| `verified` | Server-computed boolean | No | **None** |
| `checks[].name` | Server-defined enum | No | **None** -- always `artifactHashes`, `bundleHash`, or `signature` |
| `checks[].status` | Server-defined enum | No | **None** -- always `pass`, `fail`, or `skip` |
| `checks[].detail` | Server-generated strings | **Partially** -- some messages reference data from the WACZ bundle | **Low** -- current strings are static, but future changes could introduce attacker-controlled content |
| `signing.bundleHash` | From WACZ `signedData.hash` | **Yes** -- attacker-crafted WACZ could contain arbitrary string | **MEDIUM** -- if rendered unsanitized |
| `signing.signature` | From WACZ `signedData.signature` | **Yes** | **MEDIUM** |
| `signing.publicKey` | From WACZ `signedData.publicKey` | **Yes** | **MEDIUM** |
| `signing.signedAt` | From WACZ `signedData.created` | **Yes** | **MEDIUM** |
| `url` (original captured URL) | User-submitted at capture time | **Yes** -- fully user-controlled | **HIGH** -- URLs can contain `javascript:`, HTML entities, quote-breaking characters |

**The URL field is the primary XSS vector.** The original URL is submitted by the API user at capture time, validated for SSRF prevention, but NOT sanitized for HTML output. A URL like `https://example.com/<img src=x onerror=alert(1)>` is a valid HTTPS URL that passes SSRF validation but contains an XSS payload.

**The signing metadata fields (bundleHash, signature, publicKey, signedAt) are secondary vectors.** These come from the WACZ file's `datapackage-digest.json`, which is attacker-controlled content if someone submits a crafted URL that serves a malicious payload. However, the current system generates these server-side during capture, so the risk is lower -- an attacker would need to compromise the capture pipeline. Still, the verification endpoint's design (verify third-party bundles) means these fields MUST be treated as untrusted.

**Mandatory sanitization approach:**

**Option A (STRONGLY RECOMMENDED): Server-side rendering with HTML entity encoding.** When building the HTML string in the Worker, apply HTML entity encoding to ALL dynamic values before interpolation:

```js
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

**However**, reading the task description more carefully: the page uses inline JS to fetch the JSON API and render client-side. This means dynamic data is NOT server-side interpolated into the HTML template -- it is fetched via JS and inserted into the DOM.

**Option B (FOR CLIENT-SIDE RENDERING): Use `textContent`, never `innerHTML`.** All dynamic data from the JSON response must be inserted using `element.textContent = value`, which automatically escapes HTML. Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write` with any value from the JSON response.

For the URL field specifically:
- Display with `textContent` (safe)
- If creating a clickable link: set `a.href` only after validating the URL scheme is `http:` or `https:`. A `javascript:` URL in an `<a href>` is XSS even with `textContent` for the label. Use: `if (url.startsWith('https://') || url.startsWith('http://')) { a.href = url; }`
- Do NOT use `a.href = url` without scheme validation

**Recommendation for implementation:**

1. The HTML template string served by the Worker must contain ZERO interpolated dynamic data. All dynamic values come from the client-side JSON fetch.
2. The `<script>` block must use ONLY `textContent` for DOM insertion. Explicitly ban `innerHTML` in code review.
3. The `<noscript>` fallback (see section 4) is server-side rendered and MUST use `escapeHtml()` for any dynamic values.
4. Add a code comment: `// SECURITY: Never use innerHTML with verification data -- XSS via crafted URLs (CWE-79)`

---

### (4) Noscript Fallback -- Information Disclosure

**Risk: LOW** -- The `<noscript>` fallback shows the capture ID and a link to the JSON API endpoint. This is acceptable given the existing security model.

**Analysis:**

The capture ID (`cap_[a-f0-9]{32}`) already functions as the access secret (index.js:120-122 comment). Anyone who has the verification URL already has the capture ID -- it is in the URL path. The `<noscript>` fallback displaying it adds no new information.

The JSON API link (`/v1/verify/{captureId}`) is the same endpoint the user is already hitting, just requesting JSON format. Again, no new information.

**However, the `<noscript>` block IS server-side rendered** (it must be, since JS is disabled). If it includes the capture ID, the ID must be validated before interpolation. The existing regex validation (`cap_[a-f0-9]{32}`) already guarantees the ID contains only safe characters (lowercase hex + underscore), so HTML entity encoding is technically unnecessary but should still be applied as defense-in-depth.

**Recommendation:**
- The `<noscript>` content should be minimal: capture ID (already regex-safe) and a link to the JSON endpoint
- Apply `escapeHtml()` to the capture ID even though regex validation makes XSS impossible -- defense-in-depth
- Do NOT include the original URL in the `<noscript>` fallback. The URL is user-controlled and cannot be safely rendered without JS-based `textContent` insertion. If the user needs to see the URL, they should use the JSON API link.
- Do NOT include verification results in the `<noscript>` fallback -- that would require server-side rendering of all the WACZ-originated fields, expanding the XSS surface unnecessarily

---

### (5) Cache-Control for HTML vs. JSON

**Risk: MEDIUM** -- Incorrect caching of HTML responses could serve stale verification results or leak verification pages through shared caches.

**Current JSON caching (index.js:286-288):**
- Verified results: `public, max-age=86400, stale-while-revalidate=604800` (24h fresh, 7d stale)
- Non-verified results: `no-store`

**HTML response caching recommendation:**

The HTML page should mirror the JSON caching strategy with one modification:

- **Verified results (HTML):** `public, max-age=86400, stale-while-revalidate=604800` -- same as JSON. The HTML is a function of the verification result, which is immutable once verified (the underlying WACZ cannot change).
- **Non-verified results (HTML):** `no-store` -- same as JSON.
- **Add `Vary: Accept`** -- CRITICAL. Without this, a CDN or browser cache could serve a cached HTML response to a JSON API client, or vice versa. The `Vary: Accept` header tells caches that the response varies based on the `Accept` request header, so HTML and JSON responses are cached separately.

**Additional headers for HTML responses:**

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff    (already set globally)
Referrer-Policy: no-referrer       (already set globally)
Content-Security-Policy: ...       (see section 1)
```

The `X-Frame-Options: DENY` is new and needed for HTML responses specifically -- JSON responses don't need it because they can't be framed in a meaningful way. The CSP `frame-ancestors 'none'` directive provides the same protection but X-Frame-Options is needed for older browser coverage.

---

### Additional Security Concerns

**A. Content-Type correctness:**

The HTML response MUST set `Content-Type: text/html; charset=utf-8`. The existing `nosniff` header means the browser will not sniff the content type -- it will respect whatever is declared. If `Content-Type` is wrong (e.g., accidentally `application/json`), the browser will not render the HTML. This is a correctness issue, not a security issue, but it would break the page.

**B. Strict-Transport-Security:**

The MVP.md Step 8 plans to add HSTS. For HTML responses specifically, HSTS is more critical than for JSON API responses because browsers process HSTS headers from HTML page loads. If HSTS is not yet deployed, it should be prioritized for HTML responses.

**Recommendation:** Add `Strict-Transport-Security: max-age=63072000; includeSubDomains` to all responses now, not just in Step 8. There is no reason to delay this -- Cloudflare Workers are always served over HTTPS.

**C. No `eval()` or `Function()` in inline JS:**

The CSP (`script-src 'nonce-{nonce}'` without `'unsafe-eval'`) will block `eval()` and `new Function()`, but the implementation should also avoid these patterns in the source code. Code review must verify.

**D. The page must NOT fetch screenshots:**

The task says "zero external HTTP requests from the page." The MVP.md Step 7 description mentions rendering screenshots inline, which would require fetching `GET /v1/captures/{id}/artifacts/screenshot`. This is a same-origin request, not an external request, but it introduces complexity:

- The screenshot endpoint requires the capture ID (same as access secret)
- The screenshot is binary data (PNG) that must be converted to a data URI for inline display
- The screenshot content is attacker-controlled (it is a rendering of an attacker-chosen URL)
- The CSP `img-src data:` directive would need to be present

**Security recommendation on screenshots:** If screenshots are included, they should be fetched via the same-origin JSON API (using the inline JS), converted to a base64 data URI, and displayed via `img.src = 'data:image/png;base64,...'`. The CSP must include `img-src data:`. The screenshot fetch counts against `connect-src 'self'`. This is safe but adds attack surface (a crafted screenshot PNG could exploit image parser vulnerabilities, though this is a browser-engine concern, not a Worker concern). Clarify with the implementation team whether screenshots are in scope for Step 7.

**E. Subresource Integrity is not applicable:**

SRI is for external scripts/stylesheets loaded via `<script src>` or `<link href>`. Since everything is inlined, SRI does not apply.

---

## Requirements

1. **CSP header with per-request nonce** on all HTML responses: `default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
2. **`Vary: Accept` header** on the verify endpoint response (both HTML and JSON variants) to prevent cache poisoning
3. **`X-Frame-Options: DENY`** on HTML responses
4. **HTML entity escaping function** (`escapeHtml`) for any server-side interpolated values (capture ID in `<noscript>`, page title, etc.)
5. **Client-side rendering uses ONLY `textContent`** -- no `innerHTML`, no `insertAdjacentHTML`, no `document.write` with dynamic data
6. **URL scheme validation** before setting `a.href` -- only `http:` and `https:` allowed
7. **Original URL excluded from `<noscript>` fallback** -- only capture ID and JSON API link
8. **Inline JS fetch sets `Accept: application/json`** explicitly to avoid content negotiation loop
9. **HTML Cache-Control mirrors JSON** -- `public, max-age=86400, stale-while-revalidate=604800` for verified, `no-store` for non-verified
10. **HSTS header** on all responses: `Strict-Transport-Security: max-age=63072000; includeSubDomains`
11. **Nonce generation** uses `crypto.getRandomValues(new Uint8Array(16))` -- 128 bits of entropy

## Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| XSS via user-submitted URL rendered in HTML | HIGH | Medium -- URL is fully attacker-controlled, stored in KV, rendered on verification page | Use `textContent` only for client-side rendering; scheme-validate before `a.href`; exclude URL from `<noscript>` |
| XSS via WACZ-originated signing metadata (bundleHash, publicKey, etc.) | MEDIUM | Low -- fields are server-generated during capture, not directly user-controlled, but treat as untrusted | Use `textContent` for all DOM insertion of verification data |
| Cache poisoning: CDN serves HTML to JSON client or vice versa | MEDIUM | Medium -- Cloudflare's CDN caches by URL; without `Vary: Accept`, content negotiation breaks caching | Add `Vary: Accept` header to all verify endpoint responses |
| Missing CSP allows injected script execution | HIGH | Low -- requires XSS vulnerability to exploit, but CSP is the last line of defense | Nonce-based CSP on all HTML responses |
| `innerHTML` usage in implementation bypassing `textContent` safety | HIGH | Medium -- common developer mistake, especially for rendering structured data like check results | Code review gate; add security comment; CSP blocks eval but not DOM-based XSS |
| Content negotiation loop: inline JS fetch returns HTML instead of JSON | LOW | Medium -- if `Accept` header is not explicit, browser defaults may trigger HTML | Inline JS must set `Accept: application/json` on fetch |
| Clickjacking of verification page in iframe | LOW | Low -- verification page is informational, no state-changing actions | `frame-ancestors 'none'` in CSP + `X-Frame-Options: DENY` |

## Dependencies

- **No additional specialists needed.** The implementation is straightforward vanilla JS/HTML within an existing Worker. The security controls (CSP, escaping, `textContent`) are all implementable by the development team without specialist tooling.
- **Dependency on existing verify endpoint contract:** The HTML page depends on the JSON response shape from `handleVerifyCapture`. Any changes to that response shape affect the HTML page's rendering logic. The JSON contract should be treated as stable.
- **Testing dependency:** The test-minion should verify: (1) CSP header is present and correct on HTML responses, (2) `Vary: Accept` is present, (3) content negotiation returns correct format based on `Accept` header, (4) a capture with a URL containing HTML metacharacters renders safely (no XSS), (5) `<noscript>` fallback does not contain the original URL.

## Recommendations

### Priority 1 (Must have for this phase)

1. **Nonce-based CSP on all HTML responses.** This is the single most important defense. Without it, any XSS in the rendered data executes in the Worker's origin context with access to same-origin APIs (including fetching other captures if the attacker knows IDs).

2. **`textContent`-only rendering in inline JS.** Ban `innerHTML` for any value derived from the verification JSON response. This is the primary XSS defense at the application layer.

3. **`Vary: Accept` on verify endpoint.** Without this, cache poisoning is a real risk on Cloudflare's CDN. A cached JSON response served to a browser (or vice versa) breaks the feature and potentially exposes raw JSON to non-technical users, confusing them about verification status.

4. **URL scheme validation before `a.href` assignment.** The captured URL could theoretically be `javascript:alert(1)` if URL validation is bypassed or if the URL validation rules change in the future. The current SSRF validation only allows `http:` and `https:`, but the verification page should not rely on capture-time validation for XSS prevention -- it should validate at render time as defense-in-depth.

### Priority 2 (Should have)

5. **`X-Frame-Options: DENY` on HTML responses.** Low-risk issue but trivial to implement.

6. **HSTS on all responses.** Currently missing and planned for Step 8. Moving it to Step 7 costs nothing (one header) and benefits all HTML page loads.

7. **Explicit `Accept: application/json` in inline JS fetch.** Prevents content negotiation loop. Easy to miss, hard to debug.

### Priority 3 (Nice to have)

8. **`escapeHtml()` on capture ID in `<noscript>` even though regex-safe.** Pure defense-in-depth. The capture ID regex (`cap_[a-f0-9]{32}`) cannot produce HTML metacharacters, but encoding it anyway costs nothing and protects against future ID format changes.
