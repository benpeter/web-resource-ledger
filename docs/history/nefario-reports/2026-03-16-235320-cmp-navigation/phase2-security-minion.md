## Domain Plan Contribution: security-minion

### Summary

The proposed fix -- narrowing the cross-domain navigation block from all
`isNavigationRequest()` to main-frame-only via
`route.request().frame() === page.mainFrame()` -- is **acceptable** given the
existing security model. The risk introduced is low and well-bounded.
The blanket block was over-broad for its stated purpose (TOCTOU mitigation)
and was collateral-damaging CMP functionality. Below is the full analysis.

---

### Recommendations

#### 1. The main-frame check is the correct fix

The TOCTOU threat is specifically about the target page redirecting the
**top-level navigation** to an attacker-controlled or internal destination
after URL validation. Iframe navigations within a BrowserContext do not
change the page's top-level origin and do not exfiltrate data back to the
attacker (browser same-origin policy enforces this at the Chromium level,
independent of Playwright route interception).

The existing accepted-gap documentation (lines 63-64 of capture.js) already
acknowledges this distinction:

> Cross-origin iframe sub-navigation: iframes can navigate internally within
> their own origin; only top-level cross-origin navigations are blocked.
> Acceptable for the current single-tenant use case.

The current code does **not** actually implement what the documentation claims.
`isNavigationRequest()` returns `true` for both main-frame and iframe
navigations ([confirmed by Playwright maintainers](https://github.com/microsoft/playwright/issues/11828)).
The fix aligns the code with the documented intent.

#### 2. No same-registrable-domain allowlisting needed for the BBC case

The BBC redirect (bbc.com -> bbc.co.uk) is a top-level navigation redirect
and **should** be blocked by the route handler. This is the TOCTOU
mitigation working as designed. The capture result will show the content at
the original `bbc.com` origin before the redirect fires, which is the
correct archival behavior -- WRL captures what was at the URL you submitted,
not where it eventually redirects.

Adding same-registrable-domain (eTLD+1) allowlisting would:
- Introduce complexity with no clear security benefit
- Require a public suffix list dependency (or hardcoded heuristics)
- Weaken the TOCTOU mitigation by allowing some cross-origin redirects
- Be a YAGNI violation -- the current behavior is correct for archival

If users want to capture bbc.co.uk, they should submit bbc.co.uk. The
capture system is not a redirect-follower; it is a point-in-time snapshot
of a specific URL.

#### 3. Iframe-based attacks the blanket block was implicitly preventing

The blanket block was incidentally preventing these iframe-based patterns,
none of which are material threats in WRL's architecture:

**a) Cross-origin iframe data exfiltration:**
A malicious page could embed an iframe pointing to an internal/sensitive
endpoint (e.g., `http://169.254.169.254/metadata`) hoping to read its
content. **Not exploitable** -- the browser's same-origin policy prevents the
parent page from reading cross-origin iframe content. The iframe content
would render in the browser but the parent page's JavaScript cannot access
it. The capture artifacts (screenshot, `page.content()`) only capture the
main frame's DOM and visible viewport, not the isolated iframe DOM.

**b) SSRF amplification via iframes:**
A malicious page could embed many iframes targeting internal services to
amplify SSRF impact. **Mitigated by existing controls** -- the
`MAX_SUBRESOURCES` limit (200) and `MAX_PAGE_BYTES` limit (50MB) already
cap the blast radius. The URL validation layer (`url-validation.js`)
validates the top-level URL but does not control subresource origins -- this
was already true before the blanket navigation block existed. Iframes
fetching subresources from internal IPs are a subresource-level concern,
not a navigation-level concern. The blanket navigation block was not
protecting against this because non-navigation subresources (XHR, fetch,
img, script) to internal IPs were never blocked.

**c) Clickjacking / UI redressing via iframes:**
Not relevant -- WRL takes automated screenshots; there is no human
interacting with the rendered page.

**d) Cross-origin iframe used to bypass CSP:**
Some CMPs use cross-origin iframes to inject consent UI that would be
blocked by the parent page's CSP. This is legitimate CMP behavior, not
an attack. Allowing it is the whole point of this fix.

#### 4. The `route.request().frame()` timing caveat

Playwright documentation notes that some navigation requests are issued
**before** the corresponding frame is created, in which case
`route.request().frame()` may return `null`. The implementation must handle
this:

```javascript
const frame = route.request().frame();
const isMainFrame = frame && frame === page.mainFrame();
```

If `frame` is `null`, this is a pre-frame navigation -- typically an iframe
being created. The safe default is to **allow** it (treat null-frame as
non-main-frame). The TOCTOU risk does not apply to pre-frame navigations
because:
- They cannot change the page's top-level URL
- They are bounded by the existing subresource limits
- Blocking them would break CMP iframes (defeating the purpose of this fix)

However, there is a subtle edge case: the very first navigation to the
target URL (the `page.goto()` call) also has `isNavigationRequest() === true`
and `frame() === page.mainFrame()`. The fix must not block this initial
navigation. This is naturally handled because the initial navigation's origin
matches `targetOrigin`.

#### 5. Update the accepted-gaps documentation

The existing comment (lines 63-64) was aspirational -- it described the
*intent* but the code did not match. After the fix, the comment accurately
describes reality. No change needed to the comment text, but the SECURITY
comment on line 368 should be updated to reflect the narrower scope:

```javascript
// SECURITY: Block cross-domain main-frame navigation (closes TOCTOU gap).
// Iframe navigations are allowed -- needed for CMP consent iframes and
// bounded by the browser's same-origin policy + subresource limits.
```

#### 6. The eval handler in consent.js is not affected by this change

The `eval` message type in the autoconsent binding (consent.js line 122)
executes code in the page's main world. This is not affected by allowing
cross-origin iframe navigations. The eval is capped at 2048 bytes and the
code comes from vendored autoconsent rules, not from page content. A
malicious page could call the `autoconsentSendMessage` binding with a crafted
`eval` message, but the 2048-byte cap limits blast radius and the code runs
in the page's own context (not with elevated privileges). This is an
existing accepted risk, unchanged by this fix.

---

### Proposed Tasks

1. **Narrow the route handler check to main-frame only** (the core fix):
   Change the condition from:
   ```javascript
   route.request().isNavigationRequest() &&
   new URL(route.request().url()).origin !== targetOrigin
   ```
   to:
   ```javascript
   route.request().isNavigationRequest() &&
   route.request().frame() === page.mainFrame() &&
   new URL(route.request().url()).origin !== targetOrigin
   ```
   Note: `page` must be created before the route handler is registered, OR
   the `page` reference must be available in the route handler's closure. The
   current code creates the page **after** `context.route()` -- this needs
   restructuring. Options:
   - Move `context.route()` after `context.newPage()` (simplest)
   - Use a `let page` variable and set it after creation, with a guard in the
     handler

2. **Handle null frame safely**: If `route.request().frame()` returns null,
   treat it as a non-main-frame request (allow it). The null case represents
   pre-frame iframe navigations.

3. **Update the SECURITY comment** on line 368 to reflect the narrower scope
   and rationale for allowing iframe navigations.

4. **Add an integration test** that verifies cross-origin iframe navigations
   are allowed while cross-origin main-frame navigations are still blocked.
   This should be a test of the route handler logic, not a full CMP test.

5. **Do NOT add same-registrable-domain allowlisting** for the BBC case.
   The current behavior (blocking the redirect) is correct for archival.

---

### Risks and Concerns

#### LOW: Pre-frame navigation edge case

If `route.request().frame()` returns `null` for the initial `page.goto()`
navigation (unlikely but theoretically possible if the page object is not
yet fully initialized), the main-frame check would fail and the navigation
would be allowed regardless of origin. This is low-risk because:
- The URL has already been validated by `url-validation.js`
- The initial navigation is always to `targetOrigin` (same origin check
  would pass anyway)
- This would only matter for a redirect chain, which fires as separate
  requests where `frame()` is populated

#### LOW: Subresource count inflation from CMP iframes

Allowing CMP iframe navigations means more subresources are loaded
(the iframe itself, plus its subresources). This could push pages closer
to the `MAX_SUBRESOURCES = 200` limit. For typical CMP iframes (Sourcepoint,
OneTrust), expect 5-15 additional subresources. This is within the existing
budget but worth monitoring. If CMP subresources consistently cause limit
breaches, consider either bumping the limit or excluding iframe navigations
from the counter.

#### INFORMATIONAL: No regression to SSRF posture

This fix does not change the SSRF attack surface. The URL validation layer
prevents malicious top-level URLs. Subresource requests to internal IPs were
never blocked by the route handler (only navigations were). Iframe
navigations to internal IPs are an existing exposure identical to img/script/
XHR subresources targeting internal IPs -- all bounded by Chromium's network
stack running inside Cloudflare's gVisor sandbox.

#### INFORMATIONAL: The fix is page-scoped, not context-scoped

The route handler is registered on `context.route()`, but `page.mainFrame()`
is page-scoped. If multiple pages were opened in the context, the check
would only compare against one page's main frame. This is not a concern
because WRL opens exactly one page per context (line 392), but it is worth
noting as an invariant to maintain.

---

### Additional Agents Needed

**test-minion** -- Needs to design the integration test for the narrowed
route handler. The test should verify: (a) cross-origin main-frame
navigation is still blocked, (b) cross-origin iframe navigation is allowed,
(c) same-origin navigation (both main-frame and iframe) is allowed, and
(d) null-frame navigations are allowed. This requires mocking Playwright's
`route.request().frame()` and `page.mainFrame()` in the unit test, plus
an integration test with a real page that embeds a cross-origin iframe.

No other additional agents needed. The fix is small and well-scoped.
