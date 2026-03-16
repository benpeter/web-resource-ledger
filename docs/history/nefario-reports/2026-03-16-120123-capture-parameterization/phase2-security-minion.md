# Domain Plan Contribution: security-minion

## Recommendations

### Executive Summary

Capture parameterization is a controlled expansion of the attack surface. The
current architecture has strong isolation properties (BrowserContext per
capture, SSRF prevention, subresource/size limits, Set-Cookie redaction,
cross-domain navigation blocking). Parameterization is safe **if** every
parameter category is independently threat-modeled and constrained. The
biggest risk is not any single parameter -- it is the combinatorial explosion
of parameters interacting in ways that bypass individual constraints.

The fundamental tension: WRL is an **evidence** product. Every parameter the
caller controls is a parameter that makes the capture less "objective" and
more "caller-directed." Security constraints must protect not just against
exploitation, but against evidence fabrication -- a malicious caller
constructing a capture that shows content that never existed on the real site.

### Parameter-by-Parameter Threat Analysis

#### 1. Cookie / Session Injection

**Risk: CRITICAL in multi-tenant, HIGH in single-tenant**

Playwright's `browser.newContext({ storageState: { cookies: [...] } })` accepts
arbitrary cookies that get set before navigation. This is the most dangerous
parameter category because:

**Attack: Authenticated content exfiltration**
- Attacker obtains stolen session cookies (phishing, XSS on target site, etc.)
- Submits capture request with those cookies injected
- WRL faithfully captures the authenticated view (email inbox, bank account, admin panel)
- Attacker retrieves artifacts via capture ID
- WRL has now become a **proxy for unauthorized access**, with the added "bonus" of creating a signed, timestamped evidence record of the stolen content

**Attack: Session fixation via captured evidence**
- Attacker injects crafted cookies that alter content rendering (locale cookies, A/B test buckets, feature flags)
- Capture shows a version of the page that most users never see
- The "evidence" is technically accurate (the page did render that way) but misleading

**Attack: Cookie-based SSRF amplification**
- Some web applications redirect authenticated users to internal dashboards
- Cookie injection could cause the browser to follow an auth-gated redirect to an internal URL
- Current cross-domain navigation blocking mitigates this for top-level navigation, but same-origin redirects (e.g., `example.com/login` -> `example.com/internal-dashboard`) are not blocked

**Minimum constraints:**
1. **Cookies MUST be scoped to the target URL's domain.** Reject any cookie whose `domain` attribute does not match or is not a subdomain of the capture URL's hostname. This prevents cross-site cookie injection.
2. **Cookie names and values MUST be length-capped** (e.g., 4096 bytes per cookie, 20 cookies max). Prevents memory exhaustion and header overflow attacks.
3. **Cookie metadata MUST be logged** in the capture record: number of cookies injected, domains used. This creates an audit trail showing the capture was not "clean."
4. **Capture record MUST flag parameterized captures** with a `parameters` field that is visible in the capture metadata and embedded in the WACZ manifest. Consumers of WRL evidence must be able to distinguish "clean" from "parameterized" captures.
5. **In multi-tenant (R12):** consider requiring elevated permissions for cookie injection -- not every API key should be able to use this feature.
6. **HttpOnly, Secure, SameSite attributes on injected cookies** should be stripped/ignored -- the caller is not the origin server, so these attributes have no meaning and could confuse Playwright's behavior.

**What cannot be mitigated:** WRL cannot determine whether a session cookie is legitimately owned by the API caller. This is a fundamental limitation. The mitigation is transparency (flagging the capture as parameterized) and, in multi-tenant, per-tenant audit logging.

#### 2. JavaScript Execution via Wait Conditions

**Risk: HIGH**

Wait conditions are the second most dangerous parameter because they can be
a vector for arbitrary code execution within the browser context.

**Attack: Arbitrary JS via `page.waitForFunction()`**
- Playwright's `page.waitForFunction(expr)` evaluates arbitrary JavaScript in the page context
- If the API accepts a user-supplied expression like `waitFor: "document.querySelector('.loaded')"`, the caller controls code that runs inside the page
- This enables: DOM manipulation before screenshot (evidence fabrication), data exfiltration via injected fetch calls, cookie/storage theft from the target site

**Attack: CSS selector injection via `page.waitForSelector()`**
- Safer than `waitForFunction`, but complex CSS selectors can still cause performance issues (e.g., `*:has(*:has(*:has(*)))` creates exponential matching)
- Not a code execution vector, but a DoS vector

**Attack: Navigation-based wait bypass**
- A `waitFor` that triggers navigation (via injected JS) could bypass cross-domain blocking if timed to execute after the route interceptor considers the page "loaded"

**Minimum constraints:**
1. **NEVER expose `waitForFunction` or any mechanism that evaluates caller-supplied JavaScript.** This is the single most important constraint in the entire advisory. Arbitrary JS in the page context is game over for evidence integrity and site security.
2. **Use an enum of predefined wait strategies**, not caller-supplied expressions:
   - `networkidle` (current default)
   - `domcontentloaded`
   - `load`
   - `commit`
   These are Playwright's built-in `waitUntil` options. They are safe because they do not evaluate caller-supplied code.
3. **If `waitForSelector` is offered**, restrict to simple CSS selectors. Reject selectors containing `:has()`, `:not()` with complex arguments, or selectors exceeding 200 characters. Better yet: offer only a handful of preset selectors (e.g., `body`, `#content`, `[data-loaded]`) via an enum.
4. **Additional wait-after-load delay** (e.g., `waitMs: 2000`) is safe as a simple `setTimeout` wrapper, but MUST be capped (max 10000ms, since the total budget is ~25s for navigation + wait).
5. **Never use `page.evaluate()`, `page.addScriptTag()`, or `page.addInitScript()` with caller-supplied content.** These are all equivalent to `waitForFunction` in terms of code execution risk.

#### 3. CSS Injection / DOM Manipulation

**Risk: MEDIUM (with current architecture), HIGH (if JS execution is allowed)**

Without JavaScript execution, the caller cannot directly manipulate the DOM
or inject CSS. The risk exists only through indirect channels:

**Attack: Cookie-driven CSS/content changes**
- Many sites serve different CSS or content based on cookie values (themes, A/B tests, locale)
- Cookie injection indirectly enables CSS/content manipulation
- This is by design (the whole point of cookie injection) but creates evidence fabrication risk

**Attack: URL-parameter-driven content manipulation**
- The URL itself can contain query parameters that alter page content (e.g., `?debug=true`, `?theme=dark`, `?preview=1`)
- This is already possible today -- the caller controls the URL
- Parameterization does not change this risk, but it is worth noting as context

**Attack: If JavaScript execution is ever allowed (see section 2)**
- `page.addStyleTag()` with caller CSS could hide/show elements, change text colors to match backgrounds, overlay fake content
- This is why section 2's constraints are critical -- they are the firewall that prevents CSS/DOM manipulation

**Minimum constraints:**
1. **Do not offer `addStyleTag` or `addScriptTag` parameters.** There is no legitimate evidence use case for injecting custom CSS or JS.
2. **Record the full URL (including query parameters) in the capture manifest.** This is already done -- good.
3. **Flag cookie-injected captures** (see section 1, point 4). This alerts evidence consumers that content may differ from the "default" view.

#### 4. Resource Exhaustion via Viewport Parameters

**Risk: MEDIUM**

The current code hardcodes viewport at 1280x720 and caps screenshot height
at 8000px. Caller-controlled viewport opens resource exhaustion vectors.

**Attack: Memory exhaustion via oversized viewport**
- `viewport: { width: 10000, height: 10000 }` creates a 10000x10000 canvas
- PNG screenshot of a 10000x10000 viewport at 4 bytes/pixel = ~400MB uncompressed bitmap
- This exceeds the 50MB page size limit because the limit applies to downloaded content, not rendered bitmap size
- Cloudflare Workers have a 128MB memory limit; a single oversized screenshot could OOM the worker

**Attack: Pixel-count amplification with `fullPage: true`**
- Viewport width * page scroll height determines the screenshot bitmap size
- A 5000px-wide viewport on a page with 8000px scroll height = 160 million pixels = ~640MB bitmap
- Current `MAX_PAGE_HEIGHT` cap of 8000 helps, but only if viewport width is also capped

**Attack: Device scale factor multiplication**
- Playwright's `deviceScaleFactor` multiplies pixel dimensions
- `{ width: 3000, height: 3000, deviceScaleFactor: 3 }` = 9000x9000 effective pixels = ~324MB bitmap
- If `deviceScaleFactor` is exposed as a parameter, it must be capped

**Minimum constraints:**
1. **Cap viewport width**: 320 <= width <= 1920. No legitimate evidence use case requires wider than 1920.
2. **Cap viewport height**: 480 <= height <= 1080. Height above 1080 is redundant with `fullPage: true`.
3. **Cap device scale factor**: 1 <= deviceScaleFactor <= 2. Retina (2x) is legitimate; 3x is wasteful.
4. **Compute a pixel budget** before rendering: `width * min(pageHeight, MAX_PAGE_HEIGHT) * deviceScaleFactor^2 <= MAX_PIXELS`. A reasonable cap is 50 million pixels (equivalent to ~6250x8000 at 1x scale).
5. **Enforce the pixel budget after page load but before screenshot**, in the same location as the current `pageHeight > MAX_PAGE_HEIGHT` check. If the budget is exceeded, fail the capture rather than attempting the screenshot.
6. **Maintain the existing `MAX_PAGE_HEIGHT` cap** as defence-in-depth. Do not remove it when adding viewport parameters.

#### 5. Single-Tenant vs. Multi-Tenant Risk Differential

**Single-tenant (current):**
- The API caller is the service operator. They already have R2 access, KV access, and the signing key. Cookie injection does not give them access to anything they couldn't obtain by running Playwright directly.
- Evidence fabrication via parameterization is a risk to the *credibility* of WRL evidence, but not a security risk per se -- the operator is fabricating evidence against their own interests.
- Resource exhaustion is a self-inflicted DoS. Rate limiting already exists.
- **Risk level: LOW-MEDIUM.** The main value of constraints in single-tenant is defense-in-depth and establishing the correct patterns before multi-tenant arrives.

**Multi-tenant (R12, planned):**
- Tenant A can now capture authenticated views of Tenant B's sites using stolen cookies. WRL becomes a credentialed proxy.
- Tenant A can exhaust browser sessions, memory, or rate limit budgets that affect Tenant B's captures.
- Tenant A's parameterized captures are stored alongside Tenant B's "clean" captures in the same R2 bucket (with different prefixes, but shared physical infrastructure).
- Audit trails become critical: who injected what cookies, when, and what did they capture?
- **Risk level: HIGH.** Multi-tenant transforms every parameter into a potential cross-tenant attack vector.

**Key multi-tenant prerequisites for parameterization:**
1. Per-tenant rate limiting (separate from global rate limiting)
2. Per-tenant resource budgets (browser sessions, R2 storage, pixel budgets)
3. Per-tenant audit logging of all parameterized captures
4. Permission tiers: basic captures vs. parameterized captures as separately grantable capabilities
5. Tenant isolation verification: ensure Tenant A's cookies are not leaking into Tenant B's contexts (this is already guaranteed by BrowserContext isolation, but must be explicitly tested when parameterization is added)

### Minimum Security Constraints for Safe Parameterization

The following is the minimum set that makes parameterization safe. Removing
any one of these opens a concrete attack path.

| # | Constraint | Protects Against |
|---|-----------|-----------------|
| 1 | **No caller-supplied JavaScript execution** -- no `waitForFunction`, `evaluate`, `addScriptTag`, `addInitScript` with user content | Evidence fabrication, data exfiltration, arbitrary code execution in page context |
| 2 | **No caller-supplied CSS injection** -- no `addStyleTag` with user content | Evidence fabrication via visual manipulation |
| 3 | **Cookie domain scoping** -- injected cookies must match capture URL domain | Cross-site cookie injection, session hijacking of unrelated sites |
| 4 | **Cookie count and size limits** -- max 20 cookies, max 4096 bytes each | Memory exhaustion, header overflow |
| 5 | **Viewport dimension caps** -- width [320, 1920], height [480, 1080] | Memory exhaustion via oversized bitmap |
| 6 | **Pixel budget enforcement** -- max 50M pixels post-layout | OOM kills from fullPage screenshots |
| 7 | **Device scale factor cap** -- max 2x | Pixel budget bypass via scale multiplication |
| 8 | **Wait strategy enum** -- only Playwright built-in `waitUntil` values + optional capped delay | Code execution via expression evaluation |
| 9 | **Parameterization flag in capture metadata and WACZ manifest** -- visible, immutable | Evidence integrity: consumers can distinguish clean vs. parameterized captures |
| 10 | **Strict input validation on all parameter fields** -- JSON Schema with `additionalProperties: false`, type checks, range checks | Unexpected parameter injection, prototype pollution |
| 11 | **`serviceWorkers: 'block'` remains hardcoded** -- never caller-controllable | Route interception bypass |
| 12 | **Cross-domain navigation blocking remains hardcoded** -- never caller-controllable | SSRF via redirect chains |

### Architecture Recommendation

Do not implement parameterization as a passthrough to Playwright's
`newContext()` options. Instead, build a **parameter validation and
normalization layer** that:

1. Accepts a defined schema of WRL-specific parameters (not Playwright parameters)
2. Validates every field against explicit allowlists and ranges
3. Normalizes values (e.g., clamps viewport dimensions)
4. Produces a sanitized Playwright options object internally
5. Logs the full parameter set in the capture record

This insulates WRL from Playwright API changes (new options that might be
dangerous) and ensures the validation layer is the single source of truth for
what parameters are accepted.

---

## Proposed Tasks

These are not implementation tasks (this is advisory-only). They are
recommended backlog items.

1. **Define parameterization JSON Schema** -- strict schema with `additionalProperties: false` for the request body extension. Include viewport, waitStrategy, cookies, and locale. Exclude anything that evaluates caller-supplied code.

2. **Add `parameters` field to capture KV record and WACZ manifest** -- every capture records whether and how it was parameterized. This is prerequisite to any parameter support.

3. **Implement pixel budget enforcement** -- compute and enforce a pixel budget before calling `page.screenshot()`. This is valuable even without parameterization (a tall page at 1280px width can already approach limits).

4. **Cookie validation module** -- domain scoping, count limits, size limits, attribute stripping. Separate module with its own test suite, analogous to `url-validation.js`.

5. **Security tests for parameterization boundaries** -- test that oversized viewports are rejected, cross-domain cookies are rejected, JS-evaluating wait conditions are rejected. These tests should exist before the feature is implemented, as a safety net.

6. **Multi-tenant parameterization risk assessment** -- when R12 is planned, revisit this advisory with the specific multi-tenant architecture to evaluate cross-tenant attack paths.

---

## Risks and Concerns

### CRITICAL: Evidence Integrity vs. Feature Richness Trade-off

WRL's value proposition is **trustworthy evidence**. Every parameter the caller
controls weakens the objectivity claim. The WACZ manifest MUST distinguish
parameterized captures from clean captures, and the verification endpoint
MUST surface this distinction. If a verifier cannot tell whether cookies were
injected, WRL's evidence is no more trustworthy than a screenshot taken in a
regular browser.

**Recommendation:** Consider a two-tier evidence model:
- **Level 1 (Verified)**: Clean-slate capture, no parameters. Full evidence integrity claim.
- **Level 2 (Documented)**: Parameterized capture. Evidence shows what was captured with stated parameters. Integrity claim is limited to "this is what the page showed given these inputs."

Both levels are signed and timestamped. The distinction is in what the evidence *proves*.

### HIGH: Cookie Injection as a Credentialed Proxy

In multi-tenant, WRL with cookie injection is functionally a **credentialed web
scraping service**. This has legal, ethical, and abuse implications beyond
technical security. Consider whether Terms of Service should explicitly
address:
- Prohibition on injecting stolen/unauthorized session credentials
- Requirement that the API caller has legitimate authority to access the content being captured
- Indemnification clause for misuse

### MEDIUM: Playwright API Surface Drift

Playwright regularly adds new context options. If parameterization is
implemented as a passthrough to `newContext()`, any new Playwright option
becomes automatically available to API callers. The validation layer
(recommendation above) prevents this, but only if it uses an allowlist
approach -- validate known-good parameters and reject everything else.

### MEDIUM: Timeout Budget Erosion

Adding a `waitMs` delay eats into the 25s navigation timeout budget. If a
caller specifies `waitMs: 10000` and the page takes 20s to load, the capture
will time out. This is not a security risk but an operational concern that
will generate support tickets. Cap `waitMs` to `NAV_TIMEOUT_MS - 5000` (i.e.,
max 20s total for navigation + wait).

### LOW: Screenshot Height Cap Interaction

Current code caps `pageHeight` at 8000 after load. If viewport height is
caller-controlled, the interaction between initial viewport height, scroll
height, and the cap needs to be re-evaluated. The cap should apply to the
final screenshot dimensions regardless of how they were derived.

---

## Additional Agents Needed

1. **legal-minion** (if one exists or can be consulted) -- the cookie injection
   / credentialed proxy question has legal dimensions (CFAA in the US,
   Computer Misuse Act in the UK, GDPR right of access vs. unauthorized
   access) that go beyond technical security. At minimum, the Terms of
   Service implications should be reviewed by someone with legal domain
   knowledge.

2. **api-design-minion** -- the parameter schema design needs to balance
   expressiveness with safety. The security constraints above define the
   ceiling; API design determines the actual shape within that ceiling.
   Coordination is needed to ensure the API is usable without opening
   security holes.

3. **evidence-integrity-minion** or **domain expert for digital evidence** --
   the two-tier evidence model recommendation needs evaluation from someone
   who understands evidentiary standards (FRCP, eIDAS, chain of custody).
   The question "is a parameterized capture still evidence?" is not purely
   a security question.
