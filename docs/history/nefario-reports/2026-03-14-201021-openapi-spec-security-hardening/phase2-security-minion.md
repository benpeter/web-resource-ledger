# Security Minion -- Planning Contribution

## Question 1: HSTS Parameters for Cloudflare Workers

### Recommendation

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Do NOT add `preload` yet.

### Rationale

**max-age=31536000 (1 year)**: Industry standard. Cloudflare Workers are HTTPS-only by default (the Workers runtime terminates TLS; there is no plaintext HTTP path). HSTS here is defense-in-depth -- it instructs browsers to never attempt HTTP for this origin, preventing downgrade attacks if the domain is later used in a non-Workers context or if a CDN layer is placed in front. One year is the minimum that browser preload lists accept, and is the standard recommendation from both OWASP and Mozilla Observatory.

**includeSubDomains: yes**: Prevents mixed-content attacks on subdomains of the Workers domain. If the service is deployed on a custom domain (e.g., `api.wrl.example`), this prevents an attacker from exploiting `foo.api.wrl.example` over HTTP to set cookies for the parent. Cost: if any subdomain legitimately serves HTTP, this breaks it. For a Workers-based API service, this is not a concern.

**preload: not yet**: Adding `preload` is a one-way door. Once submitted to hstspreload.org and propagated to browser preload lists, removal takes months. The domain must already serve the header correctly with `max-age >= 31536000` and `includeSubDomains` and `preload` for a sustained period before submission. Since the service is not yet in production at scale and the domain may change, adding `preload` now is premature. It should be a separate backlog item after the domain is finalized.

### Implementation

Add HSTS to the global header block in `src/index.js` at line 48-49, alongside the existing `Referrer-Policy` and `X-Content-Type-Options`:

```js
response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

This is a single-line addition. It applies to all responses (JSON API, HTML verification page, artifacts, health check, 404s). No endpoint needs to set it independently.

### Risk

Negligible. Workers are already HTTPS-only. The header cannot break anything in the current architecture. The only scenario where HSTS causes problems is if the same domain is later used for plaintext HTTP traffic, which would be a design error.

---

## Question 2: Consolidate Verify-Page Headers vs. Keep Separate

### Recommendation

**Keep them separate.** Move only `X-Frame-Options: DENY` to the global wrapper. Leave the CSP on the verify page.

### Rationale

There are two distinct concerns here:

**X-Frame-Options: DENY** -- This is universally appropriate. No endpoint in the WRL API should be frameable. JSON API responses, artifact downloads, health checks -- none of them should be embedded in iframes. Attackers can use framing for clickjacking, and for API responses, framing can be used in conjunction with other attacks (e.g., frame the verification page to phish trust). Moving this to the global wrapper in `index.js` is correct and simple.

**Content-Security-Policy** -- This must remain on the verify page only. The current CSP is:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

This CSP is specifically tuned for the verification HTML page. It permits `unsafe-inline` for scripts and styles (which the page needs, since it embeds both inline), `img-src 'self'` (for the screenshot), and `connect-src 'self'` (for the fetch calls). Applying this CSP globally would be wrong:

- **Artifact responses** (PNG, HTML-as-text, JSON) do not need or want a CSP that permits `script-src 'unsafe-inline'`. If a CSP is desired on those responses, it should be `default-src 'none'` with no relaxations.
- **JSON API responses** do not benefit from a CSP -- browsers do not render JSON as HTML. Adding one is harmless but pointless noise.
- A single global CSP would need to be the union of all endpoint needs, which is always less secure than per-endpoint policies.

Note: `frame-ancestors 'none'` in the CSP and `X-Frame-Options: DENY` are semantically equivalent. Modern browsers use `frame-ancestors`; older browsers (IE11) use `X-Frame-Options`. Setting both on the verify page is correct for maximum compatibility. The global `X-Frame-Options: DENY` provides the IE11 fallback for non-HTML responses.

### Implementation

In `src/index.js`, add to the global header block (lines 48-49):

```js
response.headers.set('X-Frame-Options', 'DENY');
```

No changes needed in `verify-page.js` -- the page's `X-Frame-Options: DENY` will be overwritten by the global one (same value), and its CSP remains page-specific.

### Resulting global header block (after both Q1 and Q2)

```js
response.headers.set('Referrer-Policy', 'no-referrer');
response.headers.set('X-Content-Type-Options', 'nosniff');
response.headers.set('X-Frame-Options', 'DENY');
response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
```

Four headers, all universal, all safe to apply globally.

---

## Question 3: DNS Pinning Enforcement / TOCTOU Gap

### Assessment

**This is fundamentally a documentation and test task, not an enforcement task.** Additional runtime enforcement beyond what exists is not achievable in the current architecture.

### The TOCTOU Gap Explained

The current flow:

1. `validateUrl()` resolves DNS and checks all returned IPs against the private range blocklist.
2. The validated URL (hostname, not IP) is passed to Browser Rendering (`puppeteer.launch()` -> `page.goto(url)`).
3. Cloudflare's Browser Rendering independently re-resolves DNS when Chromium connects.
4. `captureHeaders()` also re-resolves DNS via the Workers `fetch()` runtime.

Between step 1 and steps 3-4, DNS records can change (DNS rebinding attack). An attacker could:
- Serve a public IP on first lookup (passes validation)
- TTL expires or attacker controls DNS
- Serve a private/internal IP on second lookup (Browser Rendering connects to it)

### What Cannot Be Done

**Puppeteer IP pinning is not available in Cloudflare Browser Rendering.** In standard Puppeteer, you can use `--host-resolver-rules` to force hostname-to-IP mapping. Cloudflare's managed Chromium does not expose this flag. The Browser Rendering binding launches Chromium in Cloudflare's infrastructure -- you do not control its DNS resolution.

**Workers `fetch()` does not support IP pinning either.** You cannot pass a resolved IP and override the Host header -- Cloudflare's fetch runtime re-resolves DNS.

**Puppeteer request interception** (already in place for subresource counting in `capture.js`) could theoretically inspect the remote IP of each request, but the Puppeteer CDP `Network.requestWillBeSent` event does not include the resolved IP on Cloudflare's platform. The `Network.responseReceived` event has `remoteIPAddress`, but by then the connection is already made.

### What CAN Be Done

1. **Verify existing enforcement is correct** -- the pre-resolution IP check in `validateUrl()` is comprehensive and well-tested. The private IP blocklist covers all RFC 1918, RFC 6598 (CGNAT), loopback, link-local (including cloud metadata at 169.254.169.254), and reserved ranges. IPv4-mapped IPv6 bypass is handled. This is the primary defense layer.

2. **Post-capture IP verification** -- After `captureHeaders()` completes, the response headers include the resolved IP in some cases (via `CF-Connecting-IP` or similar response headers from the target). This is not reliable and not worth implementing.

3. **Document the accepted risk** -- The TOCTOU gap is already documented in `url-validation.js` (lines 17-21) and in `backlog.md`. The documentation should be expanded to quantify the risk:
   - The attacker must control DNS for the target domain (significant prerequisite)
   - The DNS TTL must expire between validation and rendering (narrow window, typically < 1 second)
   - Cloudflare's own DNS resolver has minimum TTL floors that make rapid rebinding harder
   - The blast radius is limited: the attacker gets Chromium to render an internal page, but the result goes to R2 storage, not back to the attacker directly. They would need access to the capture ID to retrieve the result.

4. **Test coverage** -- Add tests that verify:
   - `validateUrl()` blocks all private IP ranges (these tests already exist in `test/url-validation.test.js`)
   - The `isPrivateIP()` function fails closed on unrecognized formats (already tested)
   - Integration test documentation noting this is a known accepted risk

### Recommendation for This Step

Mark the "DNS pinning enforcement verified" work item as:

1. **Verify existing enforcement** -- review `url-validation.js` tests are comprehensive (they are).
2. **Document the accepted risk** -- update the existing TOCTOU comment in `url-validation.js` with the risk analysis above. Add a note in the WACZ signature metadata or capture record that the pre-resolution IP is informational and subject to TOCTOU.
3. **Do NOT attempt runtime IP pinning** -- it is not achievable on Cloudflare's platform. Attempting workarounds (e.g., `page.goto('http://<IP>')` with Host header override) would break TLS certificate validation and introduce new vulnerabilities.
4. **Keep the backlog item** -- the `[should]` items for Puppeteer request interception (cross-domain navigation blocking) and TOCTOU mitigation should remain. If Cloudflare later exposes `--host-resolver-rules` or IP pinning in Browser Rendering, those items become actionable.

---

## Additional Security Observations

While reviewing the codebase for this planning contribution, I identified several items that are relevant to "security hardening" but are not explicitly in the work items. The implementer should be aware:

### CORS Wildcard on API Responses

Lines 165, 217, 261, 299 of `index.js` set `Access-Control-Allow-Origin: *` on retrieval, artifact, and verification responses. This is intentional -- these are public read endpoints that rely on capture-ID-as-secret for access control. However:

- The capture POST endpoint (`handleCreateCapture`) does NOT set CORS headers and does NOT handle OPTIONS preflight. This means browser-based clients cannot create captures. If this is intentional (API-key-bearing server-to-server only), it is correct and should remain as-is.
- If a web UI is planned (backlog item), CORS on the POST endpoint will need careful scoping -- not wildcard, but origin-allowlisted.

No action needed in this step, but worth noting in the OpenAPI spec documentation.

### Missing `Permissions-Policy` Header

The `Permissions-Policy` header (formerly `Feature-Policy`) is not set. For an API service, this is low priority, but for the HTML verification page specifically, adding `Permissions-Policy: camera=(), microphone=(), geolocation=()` would tighten the sandbox. This is informational severity.

### `GET /.well-known/signing-key` Endpoint

The work items include implementing `GET /.well-known/signing-key`. Security considerations for this endpoint:

1. **Response format**: Return the raw 32-byte Ed25519 public key as base64, or as a JWK. JWK is more self-describing and interoperable. Either way, return only the public key -- never the private key.
2. **Cache-Control**: Public key should be cacheable. `Cache-Control: public, max-age=3600` is reasonable -- long enough to avoid hammering the endpoint, short enough to rotate within hours.
3. **No authentication**: This endpoint must be public. The whole point is independent verification.
4. **Rate limiting**: Apply the verify rate limiter (60/min/IP) or a separate, generous limiter. This endpoint is cheap (no R2 or KV reads -- the key is in memory), but still needs protection from abuse.
5. **CORS**: Set `Access-Control-Allow-Origin: *` -- browsers may need this for client-side verification.
6. **Content-Type**: `application/json` for JWK format, or `application/octet-stream` for raw bytes. JWK is recommended.
7. **Key rotation consideration**: When key versioning is implemented (backlog item), this endpoint should return the current key with a key ID. For now, a single key response is sufficient.

### No Additional Specialists Needed

The three questions are squarely in the security domain. No additional specialist input is required beyond what the planning process already includes.

---

## Summary of Recommendations

| Item | Action | Scope |
|------|--------|-------|
| HSTS | Add `max-age=31536000; includeSubDomains` globally | 1 line in `index.js` |
| `preload` | Do not add; create backlog item for post-domain-finalization | Backlog only |
| `X-Frame-Options` | Move to global wrapper | 1 line in `index.js`, no change in `verify-page.js` |
| CSP | Keep on verify page only | No change |
| DNS pinning enforcement | Document accepted risk; verify existing tests | Documentation + test review |
| `/.well-known/signing-key` | Public, cached, rate-limited, JWK format, no auth | New route + handler |
