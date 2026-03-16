# Domain Plan Contribution: frontend-minion

## How Cookie Consent Management Platforms Work Technically

### The Major CMPs and Their DOM Footprint

**OneTrust** (market leader, ~30% of top sites using a CMP): Injects a banner container with ID `onetrust-banner-sdk` and a preference center with `onetrust-pc-sdk`. Accept button: `#onetrust-accept-btn-handler`. Reject: `#onetrust-reject-all-handler`. Consent state is stored in two cookies: `OptanonConsent` (contains category groups like `C0001:1,C0002:1`) and `OptanonAlertBoxClosed` (ISO date string). Also exposes `window.OneTrust` JS API and is TCF v2 compliant via `__tcfapi()`.

**Cookiebot (Usercentrics)**: Banner in `#CookieConsentDialog` or `#CybotCookiebotDialog`. Accept button: `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll` (this selector changes between versions). Consent stored in `CookieConsent` cookie (JSON-encoded, contains `stamp`, `necessary`, `preferences`, `statistics`, `marketing` booleans). TCF v2 compliant. Also exposes `window.Cookiebot` API.

**Didomi**: Banner container in `#didomi-host`, notice in `#didomi-notice`. Accept button: `#didomi-notice-agree-button`. Exposes `window.Didomi` API (`Didomi.setUserAgreeToAll()`). TCF v2 compliant via `__tcfapi()`. Consent stored in `didomi_token` cookie and `euconsent-v2` for TCF.

**TrustArc**: Banner in `#consent-banner` or `#truste-consent-content`. Cookie settings via `#teconsent`. Consent stored across multiple cookies: `TAconsentID`, `notice_preferences`, `cmapi_cookie_privacy`, `cmapi_gtm_bl`, `notice_gdpr_prefs`. Exposes `truste.eu` API. Less standardized than others.

**Quantcast Choice**: Banner in `#qc-cmp2-main` or `.qc-cmp2-container`. Consent in `euconsent_v2` cookie and `addtl_consent`. Multiple localStorage entries (`CMPList`, `noniabvendorconsent`, `_cmpRepromptHash`).

**Custom implementations**: Roughly 40-50% of cookie banners are bespoke, site-specific implementations with no standardized DOM structure, cookie names, or APIs. These are the hardest to handle generically.

### The TCF v2 Standard API

The IAB Transparency and Consent Framework v2 defines `window.__tcfapi()`, a standardized JavaScript API that all TCF-registered CMPs must expose. Key commands:
- `__tcfapi('getTCData', 2, callback)` -- read current consent state
- `__tcfapi('addEventListener', 2, callback)` -- listen for consent changes
- `__tcfapi('ping', 2, callback)` -- check CMP presence and loaded state

The `__tcfapi` is read-only by design. It does not expose a "set consent" or "accept all" command. CMPs expose their own proprietary APIs for programmatic consent (e.g., `OneTrust.AllowAll()`, `Didomi.setUserAgreeToAll()`, `Cookiebot.submitCustomConsent()`), but each is different.

---

## Evaluation of Each Approach

### Approach 1: CSS-Based Banner Hiding

**How it works**: After navigation, inject a stylesheet via `page.addStyleTag()` that hides known consent overlays with `display: none !important`. Target well-known selectors: `#onetrust-banner-sdk`, `#CybotCookiebotDialog`, `#didomi-notice`, `#consent-banner`, `#qc-cmp2-main`, plus common generic patterns like `[class*="cookie-consent"]`, `[class*="consent-banner"]`, `[id*="cookie"]`.

**Reliability estimate: 60-70% for known CMPs, 30-40% for custom banners**

**Strengths**:
- Trivially fast to execute (single `addStyleTag` call, <5ms)
- Zero risk of triggering unintended side effects on the page
- No JavaScript execution in the page context required
- Composable: easy to maintain a growing selector list
- Works within Cloudflare Workers constraints perfectly

**Weaknesses**:
- The banner is hidden but still in the DOM and still triggers layout effects. Many CMP banners use `position: fixed` with a full-viewport overlay (`pointer-events: all`) that blocks the page content. Hiding the banner visually does not remove the overlay, so screenshots may show content behind a transparent barrier that still receives pointer events. Some CMPs also add `overflow: hidden` to `<body>`, leaving the page content truncated.
- Consent has NOT been given. The page may be in a degraded state: third-party scripts (analytics, embeds, social widgets, video players) that are gated on consent will not load. The captured page may be missing substantial interactive content.
- Selector drift: CMP vendors change DOM IDs/classes between versions. A selector that works today may break silently in 3 months.
- Does not handle the growing pattern of "cookie walls" (content hidden behind a mandatory consent interaction).
- Custom banners (40-50% of all consent banners) have unpredictable DOM structure.

**Timing within 25s budget**: Trivially fits. Adding a stylesheet after `networkidle` takes <10ms.

**Verdict**: Good as a cosmetic quick-fix for screenshots specifically, but produces a misleading capture -- the page is not in the state a real user would see after interacting with consent. Not suitable as a primary strategy if capture fidelity matters.

### Approach 2: Click-Based Automation

**How it works**: After navigation and `networkidle`, detect which CMP is present by checking for known DOM elements, then click the appropriate accept/reject button using Playwright's `page.click()`.

**Reliability estimate: 70-80% for known CMPs, 15-25% for custom banners**

**Strengths**:
- Simulates real user behavior; consent IS actually granted
- Page enters its fully-consented state (all scripts fire, embeds load)
- Well-understood pattern -- projects like `@duckduckgo/autoconsent` and `Consent-O-Matic` maintain rulesets for 200+ CMPs
- The captured page represents what a consenting user would see

**Weaknesses**:
- Button selectors are fragile. CMP vendors change button text, IDs, and class names between minor versions. `#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll` is representative of how unstable these selectors are.
- Timing sensitivity: the banner may not be in DOM at `networkidle`. Many CMPs lazy-load their banner via a separate script, so there can be a 500ms-2s delay after initial page load. This requires `waitForSelector` with a timeout, adding to the 25s budget.
- Click may trigger animations (banner slide-out) that take 300-500ms before the page is "clean" for screenshot. Need to wait after clicking.
- iframes: some CMPs (TrustArc, some Quantcast configs) render in cross-origin iframes, making click targeting difficult or impossible via top-level `page.click()`.
- Regional variation: the same CMP may show different banners (or no banner) depending on the visitor's geolocation. Cloudflare Workers egress from specific regions, which may or may not trigger a banner.
- Multiple modals: some sites chain consent (first a cookie wall, then a newsletter popup, then a notification permission). Handling the full sequence is complex.
- Custom banners require site-specific selectors or heuristic text matching ("Accept", "I agree", "Got it").

**Timing within 25s budget**: Marginal. Assuming navigation takes 5-15s for a typical page, that leaves 10-20s. Banner detection (`waitForSelector` with 3-5s timeout) + click + post-click settle (500ms-1s) totals 4-6s, fitting within budget for most pages. For slow pages that approach the 25s navigation timeout, there is no headroom.

**Verdict**: Most accurate approach when it works, but maintenance burden is high. The existing open-source rulesets (`autoconsent`, `Consent-O-Matic`) are the only viable path -- building this from scratch would be prohibitive.

### Approach 3: CMP API Calls via `page.evaluate()`

**How it works**: After navigation, use `page.evaluate()` to call CMP-specific JavaScript APIs: `OneTrust.AllowAll()`, `Didomi.setUserAgreeToAll()`, `Cookiebot.submitCustomConsent(preferences, statistics, marketing)`, etc.

**Reliability estimate: 80-85% for TCF-compliant CMPs, 0% for custom banners**

**Strengths**:
- Most "correct" approach -- calls the CMP's own public API
- No DOM selector fragility; API methods are more stable than DOM IDs
- Consent is properly registered in the CMP's internal state
- Triggers all downstream effects (cookie setting, script unblocking)
- Fast execution (<50ms per API call)

**Weaknesses**:
- Every CMP has a different API. There is no universal "accept all" command.
- The `__tcfapi` standard is read-only. There is no TCF standard for *setting* consent -- each CMP implements its own proprietary method.
- CMP JavaScript may not be loaded at `networkidle`. Many CMPs load asynchronously and may need additional waiting.
- Race condition: calling `OneTrust.AllowAll()` before OneTrust's internal state is initialized can silently fail or throw.
- Zero coverage for custom banners (no JS API to call).
- API method names can change between CMP versions (though less frequently than DOM selectors).
- Need to detect WHICH CMP is present before knowing which API to call.

**Timing within 25s budget**: Fits well. API detection (check `window.OneTrust`, `window.Didomi`, etc.) is instant. API call is <50ms. Post-call page settle may take 500ms-1s as gated scripts fire.

**Verdict**: More reliable than click automation for the CMPs it covers, but requires maintaining a map of CMP-to-API-call. Combined with CMP detection, this is a strong approach for the major platforms.

### Approach 4: Pre-Injection of Consent Cookies

**How it works**: Before navigation, use `context.addCookies()` to set the cookies that each CMP checks on page load. If the consent cookies are already present and valid, the CMP reads them, skips showing the banner, and immediately unblocks gated scripts.

**Reliability estimate: 85-90% for known CMPs (when cookie format is correct), 0% for custom banners**

**Specific cookie requirements by CMP**:

| CMP | Cookies Required | Format Complexity |
|-----|------------------|-------------------|
| OneTrust | `OptanonConsent`, `OptanonAlertBoxClosed` | Medium: `groups=C0001:1,C0002:1,...` URL-encoded; date ISO string |
| Cookiebot | `CookieConsent` | Medium: JSON with `stamp`, `necessary`, `preferences`, `statistics`, `marketing` |
| TrustArc | `TAconsentID`, `notice_preferences`, `cmapi_cookie_privacy`, `cmapi_gtm_bl`, `notice_gdpr_prefs` | High: 5 cookies with interdependent values |
| Quantcast | `euconsent_v2`, `addtl_consent` + localStorage | High: TCF consent string encoding + localStorage entries |
| Didomi | `didomi_token`, `euconsent-v2` | High: proprietary token format + TCF string |

**Strengths**:
- Fastest approach: cookies are set before navigation, so the page loads in its fully-consented state from the start. No post-navigation interaction needed.
- No DOM interaction, no JavaScript execution in page context.
- The CMP never shows a banner, so there is zero visual artifact in screenshots.
- No timing issues -- consent is established before the CMP script even loads.
- Perfectly compatible with `context.addCookies()` in the existing pipeline.

**Weaknesses**:
- **Cookie format fragility is the critical risk.** Each CMP has its own cookie format, and these formats change between versions. OneTrust's `OptanonConsent` contains a versioned format with group IDs that are site-specific (the site owner configures which categories exist). A generic `C0001:1,C0002:1,C0003:1,C0004:1` works for most sites but not all.
- **Domain scoping**: `context.addCookies()` requires specifying the cookie domain. For the target URL this is straightforward, but some CMPs set cookies on a different subdomain or path.
- **localStorage requirements**: Quantcast Choice, LiveRamp, and Usercentrics v2/v3 store consent in localStorage, not cookies. `context.addCookies()` cannot set localStorage. Would need `page.evaluate()` + `page.goto('about:blank')` + set localStorage + navigate to URL, which adds complexity.
- **Site-specific category IDs**: OneTrust group codes are configured per-site. The "accept all" cookie value for Site A may not match Site B's category structure. A generic all-categories-accepted value works in ~90% of cases but not always.
- **TCF consent string**: For TCF v2 CMPs, the `euconsent-v2` cookie contains a Base64-encoded consent string with a specific binary format (vendor list version, purpose consents bitmap, vendor consents bitmap). Generating a valid TC string requires knowing the current Global Vendor List version. An outdated string may be rejected by the CMP, causing it to show the banner anyway.
- **Validation on load**: Some CMPs validate cookie freshness (timestamp, version hash). Stale or structurally invalid cookies trigger a re-prompt.
- Zero coverage for custom banners.

**Timing within 25s budget**: Best of all approaches. Zero additional time -- cookies are set before `page.goto()`, within the existing pipeline.

**Verdict**: Highest reliability for the specific CMPs it supports, but the maintenance burden of keeping cookie formats current is significant. Best suited for a curated, limited set of major CMPs rather than a comprehensive solution.

---

## Comparative Analysis

| Criterion | CSS Hiding | Click Automation | CMP API Calls | Cookie Pre-injection |
|-----------|-----------|------------------|---------------|---------------------|
| Known CMP reliability | 60-70% | 70-80% | 80-85% | 85-90% |
| Custom banner coverage | 30-40% | 15-25% | 0% | 0% |
| Consent actually granted | No | Yes | Yes | Yes |
| Page in consented state | No | Yes | Yes | Yes |
| Time within 25s budget | Trivial | Marginal | Good | Best |
| Selector/format fragility | Medium | High | Low-Medium | Medium-High |
| Maintenance burden | Low | High | Medium | Medium-High |
| Implementation complexity | Very Low | High | Medium | Medium |
| Open-source library support | Minimal | Strong (autoconsent) | Partial | Minimal |

---

## Recommendations

### 1. Do not build a general-purpose consent handler -- it is a maintenance trap

The fundamental tension: every approach that actually grants consent (and thus produces a faithful capture) requires CMP-specific knowledge that drifts over time. This is a maintenance treadmill, not a one-time implementation. The existing open-source projects (`@duckduckgo/autoconsent` with 200+ CMP rules, `Consent-O-Matic` with similar coverage) each have teams dedicated to keeping rulesets current. WRL should not compete with them.

### 2. Recommended architecture: layered, caller-controlled, opt-in

The question frames consent handling as a WRL responsibility. I recommend reframing it as a **caller-controlled capture parameter** instead. The API caller knows their target sites and can specify what consent strategy to apply:

**Layer 0 (default, current behavior)**: No consent handling. Capture the page as-is. Banner visible if present. This is the honest baseline and should remain the default -- it captures what an unauthenticated, first-visit user sees.

**Layer 1 (CSS cosmetic hiding)**: Caller sends `"consentHandling": "hide"`. WRL injects a stylesheet that hides known consent overlays via a curated selector list. Fast, safe, no side effects. The banner is hidden in the screenshot but consent is NOT granted. Appropriate when the caller wants a "clean" screenshot and does not care about consent state. Trivial to implement: ~20 lines of CSS, injected after `networkidle` via `page.addStyleTag()`.

**Layer 2 (caller-provided cookies)**: Caller sends `"cookies": [...]` with an array of cookie objects matching Playwright's `addCookies()` format. WRL sets them via `context.addCookies()` before navigation. The caller is responsible for knowing which cookies their target site needs. This is the most flexible and maintainable approach because it pushes site-specific knowledge to the caller, who already has it (they know which sites they're capturing).

**Layer 3 (future, not MVP)**: Integrate `@duckduckgo/autoconsent` or similar. This is the only way to get broad CMP coverage without caller-provided cookies. But it adds a dependency (~50-80KB), increases execution time, and requires ongoing maintenance. Evaluate only if Layer 2 proves insufficient.

### 3. For the capture pipeline specifically

The insertion point in `defaultRenderer()` is clean:

```javascript
// Before page.goto() -- for cookie pre-injection (Layer 2)
if (options.cookies?.length) {
  await context.addCookies(options.cookies);
}

await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });

// After goto, before screenshot -- for CSS hiding (Layer 1)
if (options.consentHandling === 'hide') {
  await page.addStyleTag({ content: CONSENT_HIDE_CSS });
}
```

This requires `defaultRenderer` to accept an `options` parameter, which means `performCapture` must thread options from the API request body through to the renderer. The renderer injection pattern already supports this -- it is just a function signature change.

### 4. CSS hiding selector list (for Layer 1)

A minimal, high-coverage selector list:

```css
/* OneTrust */
#onetrust-banner-sdk,
#onetrust-consent-sdk,
/* Cookiebot / Usercentrics */
#CybotCookiebotDialog,
#CookieConsentDialog,
/* Didomi */
#didomi-notice,
#didomi-notice-backdrop,
/* TrustArc */
#consent-banner,
#truste-consent-content,
#truste-consent-track,
/* Quantcast */
.qc-cmp2-container,
#qc-cmp2-main,
/* Osano */
.osano-cm-dialog,
/* Generic patterns */
[class*="cookie-consent"],
[class*="consent-banner"],
[class*="cookie-banner"],
[id*="cookie-consent"],
[id*="gdpr"],
/* Overlay backdrops */
.onetrust-pc-dark-filter,
#didomi-notice-backdrop {
  display: none !important;
  visibility: hidden !important;
}
/* Restore body scroll that CMPs often lock */
body.ot-overflow-hidden,
body[style*="overflow: hidden"] {
  overflow: auto !important;
}
```

This covers the top 5 CMPs (OneTrust, Cookiebot, Didomi, TrustArc, Quantcast) plus common generic patterns. Estimated coverage: 60-70% of cookie banners encountered in the wild.

---

## Proposed Tasks

1. **API schema extension** -- Add optional `consentHandling` enum (`"none"` | `"hide"`) and optional `cookies` array to the `POST /v1/captures` request body. Validate cookie objects against Playwright's schema (name, value, domain required; path, expires, httpOnly, secure, sameSite optional). Default: `"none"`.

2. **Capture pipeline plumbing** -- Thread the new options from `handleCreateCapture()` through `performCapture()` to `defaultRenderer()`. Modify `defaultRenderer` signature to accept an options object.

3. **CSS consent hiding** -- Create a `consent-hide.css` module exporting the curated selector string. Inject via `page.addStyleTag()` after `networkidle` when `consentHandling === 'hide'`.

4. **Cookie pre-injection** -- Call `context.addCookies()` before `page.goto()` when `cookies` array is provided. Validate cookie count and total size (prevent abuse).

5. **Documentation** -- Document the new parameters in the API spec with examples for OneTrust, Cookiebot, and Didomi cookie formats.

---

## Risks and Concerns

### Security: Caller-provided cookies require validation

Cookies are set in the browser context that navigates to the target URL. If a caller provides cookies with `domain: ".evil.com"` and the target URL is `example.com`, Playwright's `addCookies()` will set them -- but they will only be sent to `evil.com`, not `example.com`. This is browser-standard behavior and is not a security risk per se, but it could be confusing. Consider restricting cookie domains to match the target URL's domain.

More importantly: cookies with `httpOnly: false` could theoretically be read by page JavaScript, and if the target page is hostile, it could exfiltrate those cookie values. Since WRL already captures untrusted URLs, this is within the existing threat model, but document it.

### Cookie size and count limits

Set reasonable limits to prevent abuse: max 20 cookies, max 4KB per cookie value, max 50KB total cookie payload. These are well within Playwright's capabilities and prevent callers from using the cookie parameter as an arbitrary data channel.

### GDPR/legal implications of consent automation

Automatically accepting cookies on behalf of the API caller has legal implications. WRL is capturing a public web page -- it is not acting as a user who has rights under GDPR. But the page's behavior changes when consent is granted (tracking scripts fire, third-party beacons load). Document that cookie pre-injection and consent handling affect the capture's fidelity and legal character.

### `autoconsent` dependency risk (if Layer 3 is pursued)

`@duckduckgo/autoconsent` is designed for browser extensions, not Workers. It requires DOM access via content scripts. Using it with Playwright requires either:
- Injecting the autoconsent bundle into the page via `page.addScriptTag()` (works, but adds 50-80KB to every page load)
- Running autoconsent's detection logic on the Worker side and sending page.evaluate commands (requires significant adaptation)

Either path adds complexity and a dependency on a project with its own release cadence. Do not pursue for MVP.

---

## Additional Agents Needed

- **api-design-minion**: Design the request body schema for `consentHandling` and `cookies` parameters, including validation rules, error responses, and OpenAPI spec updates.
- **security-minion**: Review the threat model for caller-provided cookies being set in a browser context navigating to untrusted URLs. Evaluate cookie domain restriction policy.
- **data-minion**: If capture records should track which consent handling strategy was used (for auditability and fidelity metadata), advise on KV schema changes.
