## Security Minion Review: cmp-navigation

**Verdict: APPROVE**

### Assessment

The plan correctly preserves the TOCTOU threat mitigation. The original security property -- preventing a compromised main-frame from navigating to an internal origin mid-session -- is maintained by the `isMainFrame` check. Iframe navigations have a meaningfully narrower blast radius: same-origin policy prevents an iframe from reading the parent frame's DOM or credentials, and the existing MAX_SUBRESOURCES cap limits the surface area for resource exhaustion or exfiltration via iframe flooding.

### Three questions the synthesis raised -- answered

**1. Does the `frame()` error handling introduce a security bypass?**

The catch branch defaults to `isMainFrame = false` (allow). This is the correct fail-open direction *for iframes*: the unknown requests are pre-creation or service-worker frames, not main-frame navigations. The main-frame case is always reachable by the time the user-submitted URL is navigated to -- the null-check and try/catch only fire during the brief window before `newPage()` completes, where there is no meaningful main-frame to protect anyway. Treating these early requests as non-main-frame and allowing them through is correct.

One nuance: if a malicious page somehow triggers a cross-domain navigation request *during* the `newPage()` call (before `page` is assigned), the request would be allowed through. In practice this is not exploitable because no JavaScript is executing yet at that point -- the page does not exist. The defensive coding pattern is sound.

**2. Does the null-check + try/catch correctly preserve TOCTOU protection?**

Yes. The TOCTOU window that matters is post-`newPage()`, when the page has a real mainFrame and is executing attacker-controlled JavaScript. After `newPage()`, `page` is non-null, `frame()` will not throw for ordinary navigation requests, and cross-domain main-frame navigations are blocked. The two exception paths (null `page`, throwing `frame()`) both correspond to pre-execution states where no TOCTOU threat exists.

**3. Are there injection or exfiltration vectors through allowed iframe navigations?**

The threat model for allowed CMP iframes is:
- **Data exfiltration**: A CMP iframe from a third-party domain (e.g., cdn.cookielaw.org) loads cross-origin. Same-origin policy prevents it from reading WRL internal state or the parent page's content. No exfiltration path exists beyond what a normal browser would permit on a public web page.
- **SSRF via iframe**: If an attacker-controlled page injects an iframe pointing to an internal IP, the iframe URL check (`origin !== targetOrigin`) still applies -- `isNavigationRequest()` returns true for iframe navigations too. The new code only allows them through if `isMainFrame` is false. So an iframe navigating to `http://169.254.169.254/` would be allowed. This is the expanded attack surface.

The SSRF-via-iframe concern is real but bounded: the Cloudflare Workers runtime's network isolation prevents the browser from reaching internal Cloudflare infrastructure, and metadata endpoints are not reachable from the browser sandbox. The existing documented accepted gap ("Cross-origin iframe sub-navigation: iframes can navigate internally within their own origin") was always aspirational -- the code now matches the documented intent, and the constraints that made it acceptable remain in place.

### Pre-existing gap: redirect bypass

The synthesis correctly flags that Playwright does not invoke route handlers for 301/302 redirect hops. This is unchanged by the PR and pre-dates it. It is documented and not actionable here.

### No new findings

No injection, no exfiltration path, no authentication bypass, no cryptographic concerns, no secret handling change. The plan is well-scoped and the security reasoning in the synthesis is accurate.
