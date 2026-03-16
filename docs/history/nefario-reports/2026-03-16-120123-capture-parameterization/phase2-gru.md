## Domain Plan Contribution: gru

### TL;DR

Cookie consent handling is table-stakes for screenshot-focused services but operates in fundamental tension with WRL's evidence positioning. The competitive landscape splits cleanly: screenshot APIs (URLBox, ScreenshotOne) offer extensive parameterization because they are *rendering* tools; evidence/archival services (Wayback Machine, Page Vault, Pagefreezer) deliberately limit caller control because they are *attestation* tools. WRL should pursue a narrow, two-tier approach: (1) a server-controlled cookie consent dismissal feature (no caller injection) as a [should] parking lot item, and (2) defer general parameterization entirely. The investment priority is wrong for Act 1, manageable in Act 2, and the right time is only when a user reports cookie banners as a blocking problem.

---

### Recommendations

#### 1. Ring Classification: Capture Parameterization -- Hold

General capture parameterization (caller-provided cookies, custom JS injection, arbitrary headers, session state) is **Hold** for WRL.

**Rationale across the six hype filters:**

1. **Production usage**: No evidence-grade capture service offers caller-controlled JS injection or arbitrary cookie injection. Page Vault, Pagefreezer/WebPreserver, and forensic tools like FAW (Forensics Acquisition of Websites) deliberately operate with controlled browser state. The services that offer extensive parameterization (URLBox, ScreenshotOne, Scrnify) are screenshot/rendering APIs -- they compete on visual fidelity, not evidentiary integrity. They do not sign captures, do not provide verification endpoints, and do not claim legal admissibility.

2. **Community velocity**: No standard or protocol exists for "parameterized evidence capture." The web archiving community (IIPC, Webrecorder, WACZ spec) does not address parameterization because the standard assumption is that archival captures reflect the public-facing state of a URL.

3. **Second-order signals**: Job postings and conference tracks for "digital forensics" and "e-discovery" emphasize chain-of-custody and reproducibility -- not customization. The legal-tech market (which product-marketing-minion identified as WRL's strongest wedge) values attestation of what *was* publicly visible, not what *could be rendered* under specific conditions.

4. **Failure stories**: URLBox documents edge cases where cookie handling caused rendering errors (secure attribute cookies on non-secure sites). ScreenshotOne documents that `block_cookie_banners` uses CSS `display: none !important` -- a cosmetic hack that can break page layout. These are acceptable trade-offs for a screenshot API but unacceptable for an evidence tool where visual accuracy is the entire value proposition.

5. **Benchmark independence**: No benchmarks exist for parameterized capture quality. Each service defines its own success criteria.

6. **Revenue signal**: Screenshot APIs charge $0.01-0.05 per capture. Evidence-grade services (Page Vault, Pagefreezer) charge per-seat or enterprise pricing -- 10-100x higher. The value is in the attestation, not the rendering flexibility.

**The core tension**: Every parameter a caller controls is a parameter they could use to fabricate evidence. If a caller injects cookies to simulate a logged-in state, the capture no longer proves what was publicly visible -- it proves what was visible *under conditions the caller chose*. This is not inherently invalid (capturing a personalized view has legitimate uses), but it fundamentally changes the evidentiary claim. An evidence tool must be transparent about this distinction or it undermines its core positioning.

#### 2. Ring Classification: Server-Controlled Cookie Consent Dismissal -- Assess

A server-controlled (not caller-controlled) mechanism to dismiss cookie consent banners is **Assess** ring.

**Rationale:**

- Cookie consent banners are a genuine fidelity problem. The prompt correctly identifies this as the single biggest screenshot quality issue. Every capture of a European website (and increasingly, global sites) shows a consent overlay obscuring the actual content.
- The competitive landscape confirms this is a recognized problem. Stillio hides cookie banners by default. URLBox offers `hide_cookie_banners` and `click_accept`. ScreenshotOne offers `block_cookie_banners`. Even the Wayback Machine suffers from this (users report persistent consent popups on archived pages).
- Mature open-source tooling exists. DuckDuckGo's `autoconsent` library (MPLv2, 1,464 commits, active development) provides rule-based CMP detection and dismissal for 100+ consent management platforms including OneTrust, Cookiebot, TrustArc, and Quantcast. Apify has published `idcac-playwright`, a compiled version of "I Don't Care About Cookies" specifically for Playwright integration. Consent-O-Matic covers 200+ CMPs with auto-updating rule lists. The npm package `playwright-autoconsent` wraps DuckDuckGo's library for direct Playwright use.
- The critical distinction: server-controlled means WRL decides how to handle consent (dismiss/reject all, per its own policy) and **records** this action in the capture metadata. The caller does not choose. This preserves the attestation model -- WRL is saying "we captured this URL and we dismissed cookie consent banners using method X" -- not "the caller told us to click specific buttons."

#### 3. Strategic Assessment: Evidence Positioning Impact

Parameterization and evidence positioning are in tension, not alignment. The product-marketing-minion's recommendation to use "evidence" over "archival" is correct and should inform this decision:

**Strengthened by clean-slate default**: The fact that WRL captures with a fresh browser context, no prior state, no cookies, no login -- this is a *feature* for evidence. It means captures reflect the anonymous public view. This is what a neutral third party would see. This is what courts and regulators expect. Every evidence-grade capture tool (Page Vault, FAW, Forensic OSINT) operates this way.

**Weakened by caller-controlled parameters**: If WRL accepts caller-provided cookies, JS, or session state, captures become attestations of a *constructed* state. The verification endpoint can confirm the bundle was not tampered with, but it cannot confirm the captured content was what a neutral visitor would have seen. This opens the door to challenges: "The opposing party injected cookies to make the page show X, but a normal visitor would see Y."

**The metadata transparency approach**: If parameterization is ever added, every parameter must be recorded in the WACZ manifest and visible in the verification result. The verification page should display "This capture was made with custom cookies: [list]" or "Cookie consent was auto-dismissed using autoconsent v1.2.3." This preserves integrity by making the capture conditions explicit and verifiable.

#### 4. Competitive Landscape Analysis

| Service | Category | Cookie Handling | General Parameterization | Evidence Claims |
|---------|----------|----------------|-------------------------|-----------------|
| **Wayback Machine** | Archival | None (banners persist in archives) | None | None (no integrity proof) |
| **Page Vault** | Legal evidence | Not documented (captures "exactly as it appears") | Limited (capture what browser shows) | Strong (FRE 901(b)(9), digital signing, timestamping) |
| **Pagefreezer** | Compliance archival | Not documented | Limited | Strong (tamper-proof archives for compliance/eDiscovery) |
| **Stillio** | Monitoring screenshots | Hides banners by default; IP whitelisting option | Element hiding, wait conditions | Weak (screenshots, no cryptographic proof) |
| **URLBox** | Screenshot API | `hide_cookie_banners`, `click_accept`, custom cookies | Extensive (60+ options: JS, CSS, headers, proxy, geo, clicks) | None |
| **ScreenshotOne** | Screenshot API | `block_cookie_banners`, custom cookies | Extensive (JS, CSS, headers, selectors, proxy, geo) | None |
| **FAW** | Forensic capture | Captures as-is | Minimal | Strong (forensic acquisition with third-party validation) |
| **WRL (current)** | Evidence capture | None (banners appear) | None | Moderate (Ed25519 signing, WACZ, no TSA yet) |

**Key insight**: There is a clean market segmentation. Services that offer extensive parameterization do not make evidence claims. Services that make evidence claims offer minimal parameterization. WRL is positioned in the evidence category. Adding extensive parameterization would push it toward the screenshot API category where it cannot compete on features (URLBox has a decade head start and 60+ options) and would not need to compete (WRL's value is attestation, not rendering).

#### 5. Cookie Consent Technical Landscape

Three viable approaches exist for automated cookie consent handling:

**Approach A: CSS hiding (`display: none !important`)**
- Used by: ScreenshotOne (`block_cookie_banners`), Stillio
- Pro: Simple, no interaction with page logic
- Con: Hides but does not dismiss; consent state remains "undecided"; some CMPs overlay the entire page with a non-scrollable backdrop; page content may still be partially obscured; "I Don't Care About Cookies" notes it "mostly blocks or hides" banners
- Evidence impact: Screenshot shows content without banner, but the banner exists in the HTML capture. Inconsistency between artifacts.

**Approach B: CMP detection and click-to-dismiss**
- Used by: URLBox (`click_accept`), DuckDuckGo autoconsent, Consent-O-Matic
- Pro: Properly dismisses consent; page reaches its "after consent" state; 100-200+ CMPs supported
- Con: Requires maintaining CMP rule lists; "accept" vs. "reject" is a policy choice; some CMPs require multi-step interaction; iframe and shadow DOM piercing needed for some implementations
- Evidence impact: Capture shows the page in its post-consent state. This is what most human visitors see. Must be recorded in metadata.

**Approach C: Cookie injection (pre-set consent cookies)**
- Used by: Playwright `context.addCookies()` approach; documented at programmablebrowser.com
- Pro: Fastest; no page interaction; works for known CMPs
- Con: Cookie names and values are CMP-specific and change frequently; maintaining a cookie database is brittle; consent state may not match what the CMP would set via its own UI
- Evidence impact: Introduces caller-provided state into the browser context. Weakest from an evidence perspective.

**Recommendation**: Approach B (CMP detection and dismiss) is the right choice for WRL if this feature is ever built. It results in captures that show what a consenting visitor sees, the action is auditable and recordable in metadata, and mature open-source tooling (DuckDuckGo autoconsent) handles the CMP detection. The consent action should be "reject all" by default -- this minimizes tracking state and keeps the browser context closest to a neutral observer.

#### 6. Cloudflare Browser Rendering Constraints

Important platform constraints for any consent handling implementation:

- **30-second `ctx.waitUntil` budget**: Consent dismissal adds time. DuckDuckGo's autoconsent typically completes in 1-3 seconds but some CMPs require multiple interaction steps. With 25s already allocated to navigation (`NAV_TIMEOUT_MS`), adding consent handling eats into the 5s headroom. This may require reducing `NAV_TIMEOUT_MS` or waiting for the Queue migration (R16) to remove the 30s ceiling.
- **No persistent browser extensions**: Cloudflare Browser Rendering does not support loading browser extensions (no .crx files). Consent-O-Matic and "I Don't Care About Cookies" cannot be loaded as extensions. The autoconsent library must be injected via `page.evaluate()` or `context.addInitScript()`.
- **`serviceWorkers: 'block'`**: WRL already blocks service workers. This is correct and should remain -- some CMPs register service workers, and these would persist across contexts in a session-reused browser.
- **gVisor sandbox**: No filesystem access, no extension installation directory. All consent logic must be injectable JavaScript.

#### 7. What WRL Should Do

**Now (Act 1)**: Nothing. Finish the Solid Foundation items. Cookie consent is not blocking any current use case because there are no external users reporting it as a problem. YAGNI applies.

**Add to Parking Lot**: "Server-controlled cookie consent dismissal" with activation trigger: "When a user reports cookie consent banners as a blocking problem for capture quality, OR when the Web UI (R17) ships and screenshots are visible to non-technical users."

**When triggered, the implementation should**:
1. Integrate DuckDuckGo's `autoconsent` library via `context.addInitScript()` injection
2. Default behavior: reject-all (minimal tracking, closest to neutral observer)
3. Record the consent action in WACZ metadata: `captureOptions.consentHandling: "autoconsent-reject"` (or `"none"` for current default behavior)
4. Display consent handling status on the verification page: "Cookie consent banners were automatically dismissed (reject all) using autoconsent"
5. Make it a server-wide configuration (operator chooses the policy), not a per-request caller parameter
6. Scope: [S] to [M] -- autoconsent injection is ~50 lines; the metadata and verification UI changes are the bulk of the work

**Do not build**:
- Caller-provided cookie injection
- Caller-provided JavaScript injection (severe security risk: arbitrary code execution in the browser context)
- Caller-provided header overrides
- Viewport parameterization (the current 1280x720 is a reasonable default; make it a parking lot item with trigger "when a user reports viewport as a problem")
- Wait condition parameterization (current `networkidle` is the right default; parking lot with trigger "when a user reports incomplete renders")

---

### Proposed Tasks

No implementation tasks -- this is an advisory. Backlog items to create:

#### Backlog Item 1: Server-Controlled Cookie Consent Dismissal
**Where**: Parking Lot > Capture Fidelity
**Tier**: [should]
**Condition**: When a user reports cookie consent banners as a blocking problem for capture quality, OR when Web UI (R17) ships
**Scope**: S-M
**Dependencies**: None technically, but should wait for Act 1 completion
**Notes**: Use DuckDuckGo autoconsent via addInitScript(). Server policy (reject-all), not caller parameter. Record in WACZ metadata. Display on verification page.

#### Backlog Item 2: Viewport Parameterization
**Where**: Parking Lot > Capture Fidelity
**Tier**: [consider]
**Condition**: When a user reports viewport size as a problem
**Notes**: Current 1280x720 is reasonable. If added, offer presets (desktop/mobile/tablet), not arbitrary dimensions. Record viewport in WACZ metadata.

#### Backlog Item 3: Capture Options Metadata Schema
**Where**: Parking Lot > Capture Fidelity
**Tier**: [consider]
**Condition**: When any capture parameterization feature ships
**Notes**: Define a `captureOptions` object in the WACZ manifest that records all non-default capture conditions. This is prerequisite infrastructure for any parameterization. Must be visible in verification results.

---

### Risks and Concerns

1. **Cookie consent dismissal reliability is inherently fragile.** CMPs update their markup frequently. DuckDuckGo's autoconsent has 1,464 commits -- that is not a sign of stability; it is a sign of continuous adaptation to a moving target. Any consent handling in WRL will occasionally fail, producing captures with banners despite the feature being enabled. Mitigation: make consent handling best-effort, not guaranteed. Record whether consent dismissal succeeded or failed. Never block a capture because consent dismissal failed.

2. **"Reject all" vs. "Accept all" is a policy decision with legal implications.** Rejecting all cookies means the captured page may differ from what most visitors see (many visitors accept cookies). Accepting all cookies means the capture includes tracking state, which may be undesirable for an evidence tool. There is no neutral choice -- both are policy positions. Recommendation: default to reject-all (closest to minimal-state observer), but make it operator-configurable (reject-all / accept-all / off).

3. **Parameterization scope creep risk.** Once the door is opened to "the caller can control X," every user will request control over Y. The backlog already has "screenshot height cap configurability" and "wait-for-load" in the parking lot. Each parameter individually seems small, but collectively they transform WRL from an evidence service into a screenshot API. Mitigation: every parameterization request must pass the test: "Does this strengthen or weaken the evidence claim?" Server-controlled features that improve capture quality pass. Caller-controlled features that change capture content fail.

4. **Autoconsent library size and Workers bundle limits.** DuckDuckGo's autoconsent includes rules for 100+ CMPs. The compiled JavaScript may be significant. Cloudflare Workers have a 10MB script size limit (paid plan). The autoconsent library needs to be evaluated for bundle size impact. Mitigation: evaluate actual bundle size before committing. If too large, consider a curated subset of the most common CMPs (OneTrust, Cookiebot, TrustArc cover ~70% of sites).

5. **30-second budget pressure.** Adding consent handling to the existing 25s navigation + 5s headroom budget is tight. If a page takes 20s to load and consent dismissal takes 3s, the capture has 2s left for screenshot and HTML extraction. Mitigation: implement consent dismissal as a racing timeout -- if consent is not dismissed within 3s of page load, proceed without it. Do not let consent handling cause capture timeouts.

6. **Evidence claim transparency.** If WRL dismisses cookie consent silently and does not record it, the "evidence" claim is weaker -- the capture does not reflect what a first-time visitor actually saw (they would have seen the banner). If WRL records it, the verification page must explain it to non-technical verifiers. This adds UX complexity to the verification flow. Both paths have costs.

---

### Additional Agents Needed

- **security-minion**: Must review any consent handling implementation for injection risks. The `addInitScript()` path runs JavaScript in the page context -- if the autoconsent library is compromised (supply chain attack), it could exfiltrate page content or manipulate the DOM before capture. Needs lockfile pinning, integrity checking, or vendoring strategy.

- **api-design-minion**: If capture options metadata is added to the WACZ manifest and verification response, the API contract changes. The `captureOptions` schema needs design before implementation. The question of whether the POST /v1/captures request body should ever accept capture options (even if initially server-only) affects API versioning.

- **ux-strategy-minion**: The verification page needs to communicate capture conditions to non-technical users. "Cookie consent was automatically dismissed" must be understandable and not undermine confidence in the capture's authenticity. This is a UX design problem, not a technical one.

No additional agents beyond what is already in the team are required.

---

### Sources Consulted

- [URLBox Render Options](https://urlbox.com/docs/options) -- comprehensive parameterization reference
- [ScreenshotOne Options](https://screenshotone.com/docs/options/) -- block_cookie_banners and related options
- [DuckDuckGo autoconsent](https://github.com/duckduckgo/autoconsent) -- MPLv2, rule-based CMP handling for 100+ CMPs
- [Apify idcac-playwright](https://github.com/apify/idcac) -- compiled "I Don't Care About Cookies" for Playwright
- [Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic) -- 200+ CMPs, auto-updating rules
- [Stillio Cookie Handling](https://support.stillio.com/article/14-hide-cookie-alerts-modals-pop-ups) -- hides banners by default
- [Cloudflare Playwright docs](https://developers.cloudflare.com/browser-rendering/playwright/) -- @cloudflare/playwright v1.1.0 capabilities
- [Page Vault](https://www.page-vault.com/) -- legal evidence capture, FRE 901(b)(9) admissibility
- [Pagefreezer WebPreserver](https://www.pagefreezer.com/webpreserver/) -- compliance-grade web capture
- [Courtroom-Ready CIPA & GDPR Evidence Reports](https://www.auditzo.com/blog/courtroom-ready-cipa-gdpr-evidence-reports-2025/) -- HAR logs, evidence layers for legal admissibility
- [Forensic OSINT](https://www.forensicosint.com/) -- user-controlled forensic captures
- [Digital Evidence Preservation Toolkit](https://digitalevidencetoolkit.org/tools/webpage-archiving/) -- cryptographic proof for web archives
- [Screenshots as Evidence (Visualping)](https://visualping.io/blog/screenshots-as-evidence) -- legal documentation automation
- [Are Screenshots Admissible (Pagefreezer)](https://blog.pagefreezer.com/collecting-online-evidence-dont-let-screenshots-sink-your-case) -- evidence authentication best practices
