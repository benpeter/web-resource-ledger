# Advisory Report

**Question**: Should WRL support parameterized capture requests -- allowing API callers to control browser behavior (viewport, wait conditions, cookies, consent handling) during web page capture? How should cookie consent banners be addressed?

**Confidence**: HIGH

**Recommendation**: Do not build general capture parameterization now. Address cookie consent banners through a server-controlled dismissal mechanism as a [should] parking lot item. When parameterization eventually ships, adopt a narrow, metadata-transparent design where every setting is recorded immutably in the WACZ bundle and visible to verifiers.

## Executive Summary

Six specialists evaluated capture parameterization across security, API design, UX strategy, frontend engineering, data architecture, and technology landscape. The team reached strong consensus on the core question: WRL is an evidence service, not a screenshot API, and this identity should govern every parameterization decision.

The biggest pain point -- cookie consent banners obscuring page content -- is real and universally acknowledged. But the team diverges on *how* to solve it. The strongest YAGNI voice (gru) argues for deferring entirely until a user reports it, then implementing a server-controlled solution using an open-source library (autoconsent). The UX strategy perspective argues cookie consent handling should be a default behavior (dismiss without accepting), not an opt-in parameter. The frontend analysis provides detailed technical feasibility for four approaches, ranking cookie pre-injection highest for reliability (85-90%) but recommending a layered caller-controlled architecture. The resolution: server-controlled consent dismissal is the right first step, with caller-provided cookies as a future escape hatch for edge cases -- but neither belongs in Act 1.

On general parameterization (viewport, wait conditions, screenshot height), consensus is clear: defer until demand materializes. The current defaults (1280x720 viewport, networkidle wait, 8000px screenshot cap) are reasonable. When parameterization does ship, the data architecture is ready -- adding a `captureSettings` block to `datapackage.json` flows through the existing Ed25519 signature chain automatically, requiring zero changes to the signing code.

The security analysis identifies cookie injection as the highest-risk parameter category (CRITICAL in multi-tenant), establishes 12 minimum security constraints for safe parameterization, and recommends a two-tier evidence model distinguishing "verified" (clean-slate) from "documented" (parameterized) captures. This distinction should be visible to verifiers and is the most important design principle for whenever parameterization ships.

## Team Consensus

1. **WRL is an evidence service, not a screenshot API.** Every specialist independently arrived at this conclusion. The competitive landscape splits cleanly: screenshot APIs (URLBox, ScreenshotOne) compete on parameterization breadth; evidence services (Page Vault, Pagefreezer) deliberately limit caller control. WRL should stay in the evidence lane.

2. **Cookie consent banners are a real fidelity problem.** The current clean-slate capture systematically produces screenshots dominated by consent overlays on European and increasingly global sites. This degrades the core value proposition -- users want evidence of page content, not evidence of a cookie banner.

3. **Every parameter must be recorded immutably in the WACZ bundle.** The `captureSettings` block in `datapackage.json` is automatically covered by the existing Ed25519 signature chain. No signing code changes needed. The data architecture is ready whenever parameterization ships.

4. **No caller-supplied JavaScript execution, ever.** This is the single hardest security constraint. `waitForFunction`, `evaluate`, `addScriptTag`, and `addInitScript` with user content are all vectors for evidence fabrication and data exfiltration. The team unanimously agrees this is a non-negotiable red line.

5. **Parameters should be visible to verifiers.** Whether through `appliedParams` in API responses, `captureSettings` in WACZ metadata, or provenance labels on a verification page, the conditions under which a capture was produced must be transparent to anyone evaluating the evidence.

6. **General parameterization should not ship in Act 1.** YAGNI applies. No external user has reported cookie banners, viewport size, or wait conditions as blocking problems. The current Act 1 backlog (CORS, HSTS, hashed IP logging, remaining hardening) is the right priority.

7. **The API extension design is straightforward when the time comes.** Extend `POST /v1/captures` with optional fields alongside `url`. No separate endpoint, no presets system, no new resource lifecycle. Backward compatible. The schema, validation approach, and response shape are well-defined.

## Dissenting Views

### Cookie consent: server-controlled vs. caller-controlled

**gru** recommends server-controlled only: WRL decides the consent policy (reject-all via autoconsent), applies it uniformly, and records the action. The caller has no control. This maximizes evidence integrity -- the capture reflects WRL's documented policy, not the caller's preference.

**frontend-minion** recommends a layered, caller-controlled architecture: Layer 0 (no handling), Layer 1 (CSS hiding via caller opt-in), Layer 2 (caller-provided cookies). This pushes site-specific knowledge to the caller, who already knows their target sites.

**ux-strategy-minion** recommends server-controlled default dismissal (not acceptance) with a `cookieConsent: "none"` override for callers who specifically want the banner. The default should be "dismiss without accepting or rejecting" to remain maximally neutral.

**Resolution**: Start with server-controlled. gru's argument is most aligned with the evidence positioning: a server-controlled policy is an attestable, documented behavior that WRL can explain to verifiers. Caller-controlled consent handling can be added later as an escape hatch (Layer 2 cookie injection), but only after the server-controlled default proves insufficient. The specific consent action (dismiss vs. reject-all vs. accept-all) is a policy decision that should be deferred to implementation time -- both "dismiss without choosing" (ux-strategy) and "reject all" (gru) have merit, and the choice depends on technical feasibility with the selected library.

### Consent handling: "dismiss" vs. "reject all"

**ux-strategy-minion** argues for "dismiss without accepting or rejecting" -- removing the overlay without making a consent choice. This is the most neutral action because it does not change what tracking/personalization the page performs.

**gru** argues for "reject all" -- actively declining consent. This minimizes tracking state and keeps the browser context closest to a neutral observer.

**Resolution**: Unresolved -- presented for user judgment. Both positions have merit. "Dismiss" is more neutral but technically harder (not all CMPs have a dismiss/close button; some are cookie walls). "Reject all" is cleaner from a state perspective but is an active choice that changes page behavior (some consent-gated content may not load). The implementation team should evaluate which action the selected library (autoconsent or equivalent) supports more reliably and choose based on technical feasibility. The chosen action must be recorded in capture metadata regardless.

### Timing: now vs. parking lot

**gru** is the strongest YAGNI voice: do nothing now, add to parking lot, build only when triggered by user demand.

**ux-strategy-minion** considers cookie consent handling a "must-fix" that addresses a broken must-be quality: "users expect the screenshot to show the page, not an overlay."

**Resolution**: Parking lot wins. The project philosophy (Helix Manifesto, YAGNI) is clear: don't build until needed. No external user has reported this as a problem. However, the parking lot item should be [should] tier (not [consider]) reflecting the team's consensus that this is a real problem that will need solving. Activation trigger: when a user reports cookie consent banners as a blocking problem for capture quality, OR when the Web UI (R17) ships and screenshots become visible to non-technical users.

## Supporting Evidence

### Technology Landscape (gru)

The competitive analysis reveals a clean market segmentation. Screenshot APIs (URLBox with 60+ options, ScreenshotOne) compete on rendering flexibility. Evidence services (Page Vault at FRE 901(b)(9) admissibility, Pagefreezer for compliance) deliberately limit caller control. No evidence-grade service offers caller-controlled JS injection or arbitrary cookie injection. Revenue signals confirm the positioning: evidence services charge 10-100x more per capture than screenshot APIs. The value is in attestation, not rendering flexibility.

Mature open-source tooling exists for consent handling: DuckDuckGo autoconsent (MPL-2.0, 1,464 commits, 100+ CMPs), Consent-O-Matic (200+ CMPs), Apify's idcac-playwright. None are designed for Cloudflare Workers -- they require injection via `addInitScript()` or `addScriptTag()`.

### Security (security-minion)

Cookie injection is the highest-risk parameter category. In the current single-tenant deployment, the API caller is the operator -- cookie injection does not grant access to anything they could not obtain by running Playwright directly. In multi-tenant (R12), cookie injection transforms WRL into a credentialed proxy: an attacker with stolen session cookies could capture authenticated views of victim sites, creating signed evidence records of unauthorized access.

Twelve minimum security constraints are defined for safe parameterization. The most critical: no caller-supplied JavaScript execution (constraint #1), cookie domain scoping (constraint #3), pixel budget enforcement (constraint #6), and parameterization flags in capture metadata (constraint #9). The recommended architecture is a parameter validation and normalization layer that accepts WRL-specific parameters, validates against allowlists, and produces sanitized Playwright options internally -- never a passthrough to `newContext()`.

The two-tier evidence model (Level 1: Verified clean-slate, Level 2: Documented parameterized) is the strongest framework for preserving evidence integrity while enabling parameterization.

### API Design (api-design-minion)

The recommended approach is extending `POST /v1/captures` with optional fields -- not presets, not a separate endpoint. Six initial parameters: `viewport`, `waitUntil`, `maxWaitMs`, `cookies`, `screenshotMaxHeight`. An `appliedParams` object in responses shows actual values used (reflecting clamping, not just requested values). Cookie values are never echoed (count only). The `ignoredFields` array in 202 responses catches typos without rejecting requests. This is fully backward compatible -- existing `{ url }` requests work unchanged.

### Frontend / Consent Engineering (frontend-minion)

Four consent handling approaches evaluated with reliability estimates: CSS hiding (60-70% known CMPs), click automation (70-80%), CMP API calls (80-85%), cookie pre-injection (85-90%). All approaches have 0% coverage for custom banners (~40-50% of all consent banners). Cookie pre-injection is fastest (zero added time to capture budget) and most reliable for known CMPs, but has high format fragility -- each CMP's cookie format changes between versions. The autoconsent library (click automation approach) has the broadest coverage through maintained rulesets but adds 1-3 seconds to the capture budget and requires injection as JavaScript.

Key constraint: Cloudflare Browser Rendering does not support browser extensions. All consent logic must be injectable JavaScript via `addInitScript()` or `addScriptTag()`. The 30-second `ctx.waitUntil` budget is tight -- consent handling must be racing-timeout guarded.

### Data Architecture (data-minion)

Parameters belong in both `datapackage.json` (dense, full resolved settings) and KV (sparse, caller overrides only). The `captureSettings` block with `settingsVersion: 1` is the proposed schema. The Ed25519 signature chain automatically covers parameters through `canonicalize(datapackage)` -- no signing changes needed. Backward compatibility is clean: pre-parameterization WACZs simply lack `captureSettings`; verifiers treat absence as "captured before parameterization existed."

KV impact is negligible: ~200-500 bytes per record, well within the 25 MiB value limit.

### UX Strategy (ux-strategy-minion)

Three user jobs identified: (A) capture what the page looks like to the public (primary, currently broken by banners), (B) capture in a specific context (emerging, defer), (C) capture without thinking about browser details (implicit, must remain effortless). The neutral/opinion parameter taxonomy is the most important UX insight: viewport is neutral (changes observation angle), cookie consent is opinion (changes page behavior). This distinction should be visible to verifiers.

The evidence claim mental model shifts from "what a fresh browser saw" to "what a browser saw under declared conditions" -- this is more honest but requires that conditions are immutably recorded, presented in human-readable terms, and clearly distinguished from URL and timestamp.

## Risks and Caveats

1. **Consent handling is inherently fragile.** CMPs update their markup frequently. Autoconsent's 1,464 commits reflect continuous adaptation, not stability. Any consent handler will occasionally fail. WRL must treat consent handling as best-effort, record success/failure in metadata, and never block a capture because consent dismissal failed.

2. **Cookie injection in multi-tenant is a credentialed proxy risk.** When R12 (per-tenant keys) ships, cookie injection must be gated behind elevated permissions with per-tenant audit logging. Terms of Service should address prohibition on injecting stolen credentials. This is a legal and ethical concern beyond technical security.

3. **Scope creep from parameterization to "headless browser as a service."** Each parameter individually seems small. Collectively, they transform WRL from an evidence service into a screenshot API competing with URLBox and ScreenshotOne on features where WRL cannot win. Every parameterization request should pass the test: "Does this strengthen or weaken the evidence claim?"

4. **The neutral/opinion boundary is contested.** Viewport seems clearly neutral. Session injection seems clearly opinion. Cookie consent dismissal is a gray zone -- it is an intervention that changes what the page shows, even if the intent is to reveal content behind an overlay. WRL should be transparent about this rather than pretending any intervention is neutral.

5. **30-second budget pressure.** The Cloudflare Workers `ctx.waitUntil` budget is 30 seconds. Navigation already takes up to 25 seconds. Consent handling adds 1-3 seconds. This leaves minimal headroom for screenshot and HTML extraction. The Queue migration (R16) would remove this ceiling, but R16 is Act 3.

6. **Autoconsent bundle size is unknown.** The library needs evaluation for Cloudflare Workers compatibility. The 10MB script size limit (paid plan) may be a constraint. A curated subset of the top CMPs (OneTrust, Cookiebot, TrustArc, Didomi, Quantcast -- covering ~60-70% of sites) may be necessary if the full library is too large.

7. **"Reject all" may hide consent-gated content.** If WRL rejects all cookies, some sites may withhold content that loads only after consent. The capture would show a page that no real visitor ever sees (neither the banner view nor the consented view). This is a fidelity risk that should be evaluated during implementation.

## Next Steps

If the recommendation is adopted, the implementation path is:

### Immediate (this session)

1. **Update `docs/backlog.md`** -- Add three items to the Parking Lot under "Capture Fidelity":
   - [should] Server-controlled cookie consent dismissal (trigger: user reports banners as blocking, OR R17 ships)
   - [consider] Viewport parameterization (trigger: user reports viewport as a problem)
   - [consider] Capture options metadata schema (trigger: when any capture parameterization ships)

2. **Create evolution log entry** for this advisory phase.

### When triggered (future phase)

3. **Evaluate autoconsent bundle size** and Cloudflare Workers compatibility. Determine whether the full library or a curated subset is viable within the 10MB script limit and 30-second execution budget.

4. **Design `captureSettings` schema** (Tier 1: viewport, waitUntil, maxScreenshotHeight, settingsVersion). Keep it minimal -- four fields that already exist as hardcoded constants.

5. **Implement server-controlled consent dismissal** with autoconsent via `addInitScript()`. Record the action in `captureSettings.consentHandling` in the WACZ manifest.

6. **Extend verification to report settings** -- display capture conditions on the verification endpoint so verifiers can see what parameters were asserted.

### When multi-tenant (R12) ships

7. **Revisit parameterization threat model** with the specific multi-tenant architecture. Cookie injection requires elevated permissions, per-tenant audit logging, and Terms of Service updates.

8. **Consider caller-provided cookies** as an escape hatch for edge cases the server-controlled consent handler cannot cover. Apply all 12 security constraints from the security analysis.

## Conflict Resolutions

### Server-controlled vs. caller-controlled consent (gru vs. frontend-minion)

gru argues consent handling must be server-controlled to preserve the attestation model. frontend-minion argues for a layered, caller-controlled approach because the caller knows their target sites best. **Resolution**: server-controlled first, with the door open for caller-controlled cookie injection as a future layer. The evidence positioning argument (gru) is stronger for the initial implementation. Caller control can be added when specific edge cases demonstrate its necessity.

### Do nothing now vs. fix a broken must-be (gru vs. ux-strategy-minion)

gru applies YAGNI strictly: no user has reported this. ux-strategy-minion considers the consent banner problem a must-fix for the core value proposition. **Resolution**: parking lot at [should] tier -- a compromise that respects YAGNI (don't build yet) while acknowledging the problem is real and well-understood (not [consider] tier). The activation trigger is concrete and user-driven.

### Consent action: dismiss vs. reject-all (ux-strategy-minion vs. gru)

ux-strategy-minion argues "dismiss without choosing" is maximally neutral. gru argues "reject all" minimizes tracking state. **Resolution**: deferred to implementation time. Both have merit; the choice depends on which action the selected consent library supports more reliably. The chosen action must be recorded in metadata regardless.

### Cookie injection scope: 20 cookies (security) vs. 50 cookies (API design)

security-minion recommends max 20 cookies. api-design-minion proposes maxItems: 50. **Resolution**: adopt 20 (security recommendation). The evidence use case for cookie injection is narrow -- consent state and locale preferences. 20 cookies is generous for this purpose and limits the abuse surface. If a legitimate use case for more emerges, the limit can be raised.

### Viewport caps: 1920 max (security) vs. 3840 max (API design)

security-minion recommends capping viewport width at 1920. api-design-minion proposes up to 3840 to support 4K displays. **Resolution**: adopt 1920 initially (security recommendation). The pixel budget constraint (50M pixels max) provides defense-in-depth regardless of the viewport cap. A 4K viewport with fullPage: true could exceed the pixel budget, so the effective constraint is the budget, not the cap. Starting conservative is safer; the cap can be raised if demand materializes.
