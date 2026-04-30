# Features Research — Capture Quality Push

**Domain:** Evidence-grade web capture (subsequent milestone for WRL)
**Researched:** 2026-04-30

## Peer Landscape Summary

The evidence-grade web capture space spans a spectrum from mass-scale public archiving to court-ready forensic capture, with WRL positioned firmly in the latter camp.

**Internet Archive (Wayback Machine / Save Page Now)** is the mass-scale public archiving anchor. SPN2 added browser-based capture in 2019 with JS rendering and outlinks, but prioritizes breadth over per-page fidelity. No cryptographic signing; trust is institutional.

**Webrecorder (Browsertrix / ArchiveWeb.page / ReplayWeb.page)** is the OSS technical leader in browser-based high-fidelity archiving. Browsertrix uses a customized Chromium with "behaviors" (pluggable JS scripts for autoscroll, autoclick, site-specific interactions) and full WACZ packaging with all subresources for offline replay. The gold standard for WACZ completeness.

**Conifer** (formerly Webrecorder.io, by Rhizome) offered hosted interactive browser-based capture but announced sunset in late 2025, with Webrecorder recommending migration to Browsertrix/ArchiveWeb.page.

**Perma.cc / Scoop** (Harvard Library Innovation Lab) is WRL's closest analog — an evidence-grade single-page capture engine built for legal citation preservation. Scoop uses a custom HTTP proxy to intercept raw exchanges (the "no-alteration principle"), captures SSL certificates as provenance attachments, generates a provenance summary, and supports WACZ signing. Scoop integrates Browsertrix behaviors for autoscroll and site-specific interactions. Perma.cc is replacing its engine with Scoop.

**ArchiveBox** is a self-hosted personal archiving toolkit. Multi-extractor approach (Chrome screenshot, SingleFile HTML, wget WARC, PDF, readability text). No cryptographic signing or evidence-grade chain of custody. Covers breadth of output formats rather than depth of any single capture.

**Pagefreezer** is the commercial evidence-grade leader. 3rd-gen dynamic capture technology handles JS/AJAX frameworks, SPAs, password-protected sites, form flows, and personalized pages automatically. Produces tamper-proof records with digital signatures and cryptographic hashes. WARC (ISO 28500:2017) storage. Interactive replay of archived sites. Enterprise-focused with FINRA/SEC/FOIA compliance features.

**Hanzo** focuses on litigation-hold workflows for web and collaboration data. "Dynamic capture" preserves interactive content in native form. WARC-based with WORM-compatible storage. Emphasis on audit trails and chain of custody over raw capture fidelity.

**Page2PDF / PDFmyURL** are lightweight URL-to-PDF converters. JS rendering via headless browser, configurable page dimensions, but no WARC/WACZ, no cryptographic signing, no subresource bundling. Not in the evidence-grade category.

## Feature Matrix — by #257 Improvement Area

### Area 1 — Dynamic content handling

| Feature | Where seen | Category | WRL has it? | Complexity |
|---|---|---|---|---|
| Browser-based JS rendering (headless Chromium) | All serious peers (Browsertrix, Scoop, Pagefreezer, IA SPN2, ArchiveBox) | Table-stakes | Yes | — |
| Autoscroll to trigger lazy-loaded images | Browsertrix, Scoop, ArchiveBox (via SingleFile) | Table-stakes | Yes (scroll + force `loading="eager"`) | — |
| Infinite scroll cap / detection | Browsertrix (behavior timeout), Scoop (via `autoScroll` + timeout), WRL | Table-stakes | Yes (`MAX_SCROLL_HEIGHT` + growth threshold) | — |
| IntersectionObserver-based lazy load triggering | Browsertrix (via behaviors), Scoop (implicit via autoscroll) | Differentiator | Partial (scroll triggers IO, but no explicit IO polyfill/override) | S |
| SPA / client-rendered content wait | Browsertrix (page load delay + behavior timeout), Scoop (`networkIdleTimeout`), Pagefreezer (3rd gen dynamic capture) | Differentiator | Partial (`waitForSettle` tracks in-flight requests but no SPA-specific heuristics like hashchange/pushState detection) | M |
| Custom per-site behaviors (pluggable JS) | Browsertrix (browsertrix-behaviors repo), Scoop (`runSiteSpecificBehaviors`) | Differentiator | No | L |
| Web font load gating before screenshot | No peer explicitly documents this | Differentiator | No (settle heuristic may or may not wait for font loads) | S |
| Auto-play media / video extraction | Scoop (`captureVideoAsAttachment` via yt-dlp), Browsertrix (media behaviors) | Differentiator | No | L |
| Service worker interception | Browsertrix (intercepts SW), WRL (blocks SW via `serviceWorkers:'block'`) | Table-stakes | Yes (blocks, doesn't capture) | — |

### Area 2 — Cookie consent / overlays

| Feature | Where seen | Category | WRL has it? | Complexity |
|---|---|---|---|---|
| Autoconsent CMP dismissal (opt-out) | WRL, ArchiveBox (issue #175 discussion), Browsertrix (ad-blocking but not CMP) | Differentiator | Yes (DuckDuckGo autoconsent, opt-out action) | — |
| Multi-frame CMP injection (cross-origin iframes) | WRL, Scoop (does not specifically document this) | Differentiator | Yes (injects into up to 50 frames) | — |
| Dual screenshot (before + after consent) | WRL | Differentiator | Yes | — |
| Consent metadata in capture record | WRL (`captureSettings.consent`), Perma.cc/Scoop (provenance summary) | Differentiator | Yes (library, version, action, result, cmpDetected) | — |
| Enriched consent status (no CMP / no reject / opt-out failed) | No peer ships this granularity | Differentiator | Partial (distinguishes `dismissed`/`none`/`timeout`/`failed` but not "no reject option available") | S |
| Non-standard CMP handling (custom overlay selectors) | Pagefreezer (automated), no OSS peer documents this | Differentiator | No | M |
| Paywall / newsletter popup dismissal | Pagefreezer (password-protected sites), Browsertrix (via browser profiles with logged-in state) | Anti-feature (if bypassing) / Differentiator (if annotating) | No | M |
| Consent-O-Matic integration (alternative CMP lib) | Consent-O-Matic (Aarhus University, browser extension) | Differentiator | No (uses autoconsent only) | S |
| TCF/IAB consent string capture in metadata | No peer documents this | Differentiator | No | S |

### Area 3 — Screenshot quality / timing

| Feature | Where seen | Category | WRL has it? | Complexity |
|---|---|---|---|---|
| High-DPI screenshots (`deviceScaleFactor`) | WRL (4x), Scoop (default 1600×900, no DPI docs), Browsertrix (default browser DPI) | Differentiator (at 4x) | Yes (4x scale) | — |
| Full-page screenshot (not just viewport) | WRL (`fullPage: true`, capped at `MAX_PAGE_HEIGHT: 8000`), Scoop (screenshot), ArchiveBox | Table-stakes | Yes | — |
| Network-idle settle heuristic before screenshot | WRL (`waitForSettle`), Scoop (`networkIdleTimeout: 20s`), Browsertrix (page load delay) | Table-stakes | Yes (tracks in-flight requests, 500ms quiescence, 3s cap) | — |
| Font-load gating before screenshot | No peer explicitly implements this | Differentiator | No | S |
| Visual stability check (pixel-diff between successive screenshots) | Academic research (Webis group, 2021/2022), no production peer | Differentiator | No | M |
| Compositor re-rasterize pause after scroll-to-top | WRL (500ms pause for 4x scale repainting) | Differentiator | Yes | — |
| Configurable viewport dimensions | Scoop (`captureWindowX/Y`), Browsertrix (browser settings), Pagefreezer | Table-stakes | No (fixed 1280×720 implied by Playwright defaults) | S |
| PDF snapshot attachment | Scoop (`pdfSnapshot`), ArchiveBox (headless Chrome PDF) | Differentiator | No | M |

### Area 4 — WACZ subresource capture completeness

| Feature | Where seen | Category | WRL has it? | Complexity |
|---|---|---|---|---|
| HTML + screenshots in WARC records | WRL, Scoop, all WACZ producers | Table-stakes | Yes | — |
| Full subresource capture (CSS, JS, images, fonts) in WARC | Browsertrix, Scoop (via proxy interception of all network traffic), ArchiveWeb.page | Table-stakes for replay-capable archives | **No** (only HTML + screenshots + headers in WARC) | L |
| CDXJ index for replay lookup | All WACZ producers (spec requirement) | Table-stakes | Yes | — |
| HTTP response/request pairs (WARC response records) | Browsertrix, Scoop (proxy intercepts raw exchanges) | Table-stakes for replay | **No** (uses WARC `resource` records, not `response`+`request` pairs) | L |
| "Raw exchanges" preservation for reprocessing | Scoop (`wacz-with-raw` format) | Differentiator | No | L |
| SSL certificate capture as attachment | Scoop (`captureCertificatesAsAttachment`) | Differentiator | No (but TLS info is outside WACZ scope) | M |
| `captureSettings` / provenance metadata in WACZ | WRL (consent metadata), Scoop (provenance summary with system info, network info, blocklist hits) | Differentiator | Yes (consent metadata only) | — |
| DOM snapshot attachment | Scoop (`domSnapshot`) | Differentiator | No (rendered HTML is post-JS DOM, which serves a similar purpose) | S |
| Video extraction as WACZ attachment | Scoop (`captureVideoAsAttachment` via yt-dlp) | Differentiator | No | L |
| Subresource size/count limits | WRL (`MAX_SUBRESOURCES: 500`, `MAX_PAGE_BYTES: 50MB`), Scoop (`maxCaptureSize: 200MB`), Browsertrix (crawl size limit) | Table-stakes | Yes | — |

### Area 5 — Bot-protection annotation

| Feature | Where seen | Category | WRL has it? | Complexity |
|---|---|---|---|---|
| Detect browser error pages (ERR_*, chrome-error) | WRL (`detectRenderFailure`), Scoop (implicit — capture fails) | Table-stakes | Yes | — |
| Detect blank page (no meaningful content) | WRL (`detectRenderFailure`) | Table-stakes | Yes | — |
| Distinguish "slow site" from "no bytes received" | WRL (checks `readyState` + `totalBytes` after nav timeout) | Differentiator | Yes (basic: `totalBytes === 0` → "did not respond") | — |
| Bot-protection page detection (Cloudflare challenge, CAPTCHA, "Access Denied") | No peer ships automated detection (Scoop explicitly avoids it due to false-positive risk) | Differentiator | **No** (comment says "heuristics false-positive too easily") | M |
| Bot-protection metadata flag in capture record | No peer ships this | Differentiator | No | M |
| User-agent customization | Browsertrix (configurable), Scoop (`userAgentSuffix`), ArchiveBox (`CHROME_USER_AGENT`) | Table-stakes | No (uses default CF Playwright UA) | S |
| SSRF / IP blocklist | WRL (`url-validation.js`), Scoop (comprehensive private IP blocklist) | Table-stakes | Yes | — |
| Stealth / anti-detection plugins | Puppeteer-extra-stealth (scraping tools), Browsertrix (uses Brave UA) | **Anti-feature** | No (correctly) | — |
| Proxy / IP rotation | Browsertrix (crawler proxy server), commercial scrapers | **Anti-feature** for evidence-grade | No (correctly) | — |

### Area 6 — Render-failure resilience

| Feature | Where seen | Category | WRL has it? | Complexity |
|---|---|---|---|---|
| Partial capture on navigation timeout | WRL (120s budget after 20s nav timeout), Scoop (partial via configurable timeouts) | Differentiator | Yes | — |
| Partial capture metadata ("partial" flag) | WRL (`renderQuality: 'partial'`), Scoop (`PARTIAL` state) | Differentiator | Yes | — |
| Configurable navigation timeout | Scoop (`loadTimeout`, `captureTimeout`, `networkIdleTimeout`), Browsertrix (page load limit) | Table-stakes | Yes (fixed at 20s, not per-capture configurable) | S |
| Retry with backoff (queue-based) | WRL (3 retries via CF Queues), Pagefreezer (implied), Browsertrix (crawl retry logic) | Table-stakes | Yes | — |
| Dead-letter queue for exhausted retries | WRL (`CAPTURE_DLQ`) | Differentiator | Yes | — |
| Error categorization (retryable vs non-retryable) | WRL (`categorizeError`), Scoop (state machine: COMPLETE/PARTIAL/FAILED) | Differentiator | Yes | — |
| Capture-status distinction: slow / blocked / broken | WRL (partial — distinguishes "did not respond" from timeout) | Differentiator | Partial (no separate "blocked" status) | M |
| Graceful degradation when signing key absent | WRL (WACZ skipped, capture still completes) | Differentiator | Yes | — |
| Graceful degradation when header fetch fails | WRL (headers omitted, capture still completes) | Differentiator | Yes | — |
| Re-ingestion / reprocessing of past captures | Scoop (WACZ-with-raw import + reprocess) | Differentiator | No | L |

## Anti-Features (deliberately NOT to build)

### Bot-protection bypass / stealth measures

**Who avoids it:** Perma.cc/Scoop (explicitly does not alter exchanges — the "no-alteration principle"), WRL (current code comment: "NOT detected here — heuristics false-positive too easily"; PROJECT.md: "Annotation only, NOT bypass"). Internet Archive respects `robots.txt` by default. Browsertrix uses a Brave UA for privacy but does not deploy stealth plugins.

**Why:** Stealth measures (puppeteer-extra-plugin-stealth, randomized fingerprints, TLS fingerprint spoofing) fundamentally compromise the evidentiary value of the capture. If the capture tool alters its browser fingerprint or behavior to circumvent bot detection, the captured page may not match what a real user would see — which is the entire value proposition of evidence-grade capture. Additionally, CFAA and equivalent statutes in other jurisdictions create legal exposure when circumventing technical access controls.

**Risk if shipped:** A defense attorney could argue the capture tool manipulated the browsing environment, undermining the authenticity of the evidence. FRE 901(b)(9) (process or system) authentication requires showing the process produces an accurate result — stealth modifications make this harder to argue.

### Paywall circumvention

**Who avoids it:** Perma.cc (has a 200MB hard cap; does not bypass paywalls), Scoop (no paywall handling), Internet Archive (respects `robots.txt`; SPN captures what the public can see).

**Why:** Capturing content behind a paywall without authorization constitutes unauthorized access. For evidence-grade products, the relevant question is "what would a normal visitor see?" — and a normal visitor would see the paywall. Browsertrix supports browser profiles with logged-in sessions, but this is user-authenticated access, not circumvention.

**Risk if shipped:** Copyright infringement, ToS violation, CFAA exposure. Captures of paywalled content could be challenged as not representing the "public-facing" state of the page.

### ToS-violating behavior

**Who avoids it:** All evidence-grade products. ArchiveBox explicitly notes operators are responsible for legal compliance. Browsertrix docs discuss user-agent identification for website coordination.

**Why:** Violating a site's ToS (aggressive crawling, ignoring `robots.txt`, credential stuffing) creates legal risk and undermines the institutional credibility that evidence-grade products rely on.

**Risk if shipped:** Cease-and-desist from site operators, IP blocking that degrades service for all captures, reputational damage to the platform's credibility as a neutral evidence source.

### Silent error suppression masking failures

**Who avoids it:** WRL's own engineering philosophy ("Fail loudly, degrade intentionally — no silent catches"). Scoop distinguishes COMPLETE/PARTIAL/FAILED states. Perma.cc surfaces capture failures to users.

**Why:** Silent retries that eventually "succeed" with degraded content (e.g., a bot-protection page captured as if it were the real page) are worse than an honest failure. The user presents the capture as evidence without knowing it's a challenge page.

**Risk if shipped:** A capture that silently captured a Cloudflare challenge page instead of the actual content could be presented in court as evidence of what the site showed — which is both inaccurate and potentially discoverable as misleading. WRL's `detectRenderFailure` already guards against blank/error pages; the gap is bot-protection pages that have real DOM content.

### Automatic `robots.txt` override

**Who avoids it:** Internet Archive (respects `robots.txt` by default). Browsertrix has an explicit toggle "Skip Pages Disallowed By Robots.txt". Perma.cc captures single pages without crawling, so `robots.txt` is less relevant.

**Why:** While `robots.txt` is not legally binding in most jurisdictions, deliberately overriding it signals disregard for site operator preferences. For evidence-grade capture of single pages (WRL's use case), `robots.txt` is typically not an issue since single-page capture isn't "crawling." But advertising override capability would invite misuse.

**Risk if shipped:** Reputational risk. Sites may block WRL's IP ranges preemptively. Not a legal risk in most cases, but an unnecessary one for an evidence-grade product.

## Differentiator Opportunities

### 1. Bot-protection annotation (not bypass) — Medium difficulty, High evidence-grade leverage

No peer ships automated detection + metadata annotation of bot-protection pages. Scoop explicitly avoids it due to false-positive risk; WRL's code has the same comment. However, evidence-grade capture demands transparency about what was actually captured. A heuristic that flags *possible* bot-protection (Cloudflare challenge page patterns, "Access Denied" with specific DOM signatures, CAPTCHA elements) and records this in `captureSettings` metadata — without preventing the capture — would be unique in the market. The key is the metadata model: `botProtection: { detected: true, confidence: 'low'|'medium'|'high', signals: [...] }` lets the user decide, which is honest.

### 2. Enriched consent metadata — Small difficulty, High evidence-grade leverage

WRL already leads here with `captureSettings.consent`. Extending to capture the TCF/IAB consent string (`euconsent-v2` cookie), distinguish "CMP found but no reject option" from "CMP not found," and record whether the consent banner was still visible in the after-screenshot would be genuinely new. Perma.cc/Scoop's provenance summary is more general; WRL can be more specific about consent state because it's relevant to legal captures (GDPR-regulated content).

### 3. Font-load gating — Small difficulty, Medium evidence-grade leverage

No peer explicitly gates screenshots on font completion. Using `document.fonts.ready` before the before-screenshot is a one-line addition that eliminates FOIT/FOUT artifacts. Low-hanging fruit with visible quality improvement.

### 4. Provenance summary attachment — Medium difficulty, High evidence-grade leverage

Scoop's provenance summary (system info, network info, configuration, blocklist hits, IP address) is uniquely valuable for evidence-grade capture. WRL could produce an equivalent: capture environment (CF Worker region, browser version), configuration used, consent outcome, render failure checks run, timestamps for each pipeline stage. This strengthens FRE 902(13) authentication significantly.

### 5. Visual stability verification — Medium difficulty, Medium evidence-grade leverage

Taking two screenshots separated by a brief delay and computing a pixel-diff score would allow WRL to record whether the page was visually stable at capture time. No production peer does this. If the diff exceeds a threshold, metadata could flag `visualStability: 'unstable'` — honest about capture quality without preventing the capture.

### 6. Subresource capture for replay — Large difficulty, High archive-grade leverage (but questionable evidence-grade value)

Full subresource capture (CSS, JS, images, fonts into WARC response records) is table-stakes for replay-capable archives (Browsertrix, Scoop) but WRL deliberately omits it today. For evidence-grade single-page capture, the rendered HTML + screenshots + headers may be sufficient — the WACZ serves as a signed container rather than a replay-ready archive. Adding full subresource capture is architecturally significant (requires request/response interception, not just DOM extraction) and increases WACZ size substantially. The evidence-grade ROI should be evaluated against the audit results before committing.

## Open Questions

1. **Subresource capture ROI for evidence-grade vs. archive-grade:** WRL's WACZ currently bundles HTML + screenshots + headers. Is offline replay actually needed for legal evidence, or is the signed screenshot + rendered HTML sufficient? Perma.cc (the closest peer) relies on replay; most commercial evidence products (Pagefreezer, Hanzo) offer interactive replay. Need to interview target customers.

2. **Bot-protection detection false-positive rate:** The code comment says "heuristics false-positive too easily." What's the actual false-positive rate? The capture audit (Phase 1 of #257) should include a URL battery specifically targeting known bot-protection patterns (Cloudflare, Akamai, Imperva) to measure this empirically.

3. **Scoop's "no-alteration principle" applicability:** Scoop uses a custom HTTP proxy to capture raw exchanges unmodified. WRL uses Playwright's DOM extraction (rendered HTML, not raw HTTP responses). Are these philosophically different enough to matter for evidence? WRL's approach captures what the browser rendered (user-visible truth); Scoop captures what the server sent (network-level truth). Both are valid but serve different evidentiary purposes.

4. **Pagefreezer's SPA / dynamic capture capabilities:** Pagefreezer claims to handle SPAs, form flows, and personalized pages "without complicated scripting." Their 3rd-gen technology is proprietary with no public technical documentation. How it actually works (and whether it's genuinely better than Browsertrix behaviors + settle heuristics) is unknown.

5. **WACZ spec evolution:** WRL targets WACZ v1.1.1. The Webrecorder team continues to evolve the format. Are there draft changes that affect subresource expectations or signing requirements? The `wacz-auth` spec (0.1.0) that Scoop implements is still a recommendation, not finalized.

6. **Autoconsent coverage gaps:** WRL uses DuckDuckGo autoconsent v14.66.0. What percentage of CMPs encountered in the wild does it actually handle? The audit should measure this. Consent-O-Matic (Aarhus University) covers different CMPs — is there value in supporting both, or does autoconsent's coverage dominate?

7. **Cloudflare Browser Rendering constraints on interception:** WRL runs on CF Workers with the `BROWSER` binding. Can Playwright's `page.route()` be used to intercept and capture full HTTP response bodies for WARC `response` records, or does the CF environment restrict this? This is the technical gate for Area 4 subresource capture.
