# Security Review — homepage-pricing-screenshot-quality

**Verdict: APPROVE**

## Assessment

Both changes are outside the security perimeter that warrants concern.

**Fix 1 (pricing HTML/CSS):** Static content replacement. No user input handling, no server-side rendering, no template interpolation, no JavaScript added. The new pricing tables are hardcoded HTML — there is no injection surface. The `€` symbol is a safe Unicode literal in UTF-8 HTML, not dynamic content. XSS is not applicable here. The plan explicitly prohibits adding JavaScript, which is correct.

**Fix 2 (deviceScaleFactor 2→4):** A hardcoded integer constant in server-side capture code. The value is not user-controllable — it lives inside `browser.newContext()` in `src/capture.js` alongside other fixed viewport settings. No input validation surface is affected. The synthesis correctly notes the existing `MAX_PAGE_HEIGHT` cap bounds worst-case resource consumption. The memory concern raised (655MB worst-case bitmap) is an operational risk, not a security risk — it does not expand the attack surface.

**No findings in scope:**
- No new API surface created
- No auth/authz paths touched
- No secrets referenced or added
- No CSRF surface (no new forms or state-changing requests)
- No XSS vector (pure static HTML with no dynamic content)
- No SSRF expansion (the capture URL is still user-supplied but that code is unchanged)
- No supply chain changes (no new dependencies)
