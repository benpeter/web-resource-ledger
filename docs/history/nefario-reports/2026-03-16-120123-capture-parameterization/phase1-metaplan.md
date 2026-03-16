# Meta-Plan: Capture Parameterization Advisory

## Task Summary

Evaluate whether WRL should support parameterized capture requests -- allowing API callers to control browser behavior (cookie consent handling, viewport size, session state injection, wait conditions, etc.) during web page capture. This is an advisory-only engagement: produce recommendations and backlog items, no implementation.

## Scope

**In scope**: Cookie consent handling approaches, session state injection, viewport/rendering parameters, evidence integrity implications, API design for parameters, security implications, YAGNI assessment.

**Out of scope**: Implementation, code changes, deployment. This is a planning advisory.

---

## Planning Consultations

### Consultation 1: Evidence Integrity and Capture Fidelity Strategy

- **Agent**: ux-strategy-minion
- **Planning question**: WRL positions itself as an "evidence" product. Cookie consent banners currently dominate every screenshot, degrading capture fidelity. How should we think about the tension between "clean slate = reproducible evidence" and "parameterized = higher fidelity but caller-influenced"? What user jobs-to-be-done does parameterization serve, and which parameter categories (cookie handling, viewport, wait conditions, session injection) have the highest impact on the core evidence use case? Should WRL distinguish between "neutral" parameters (viewport size) and "opinion" parameters (cookie consent choice) in how they affect the evidence claim?
- **Context to provide**: Current capture pipeline (`src/capture.js`) uses fixed 1280x720 viewport, no cookie handling, no session state. MVP.md positions WRL as "capture a URL, store it immutably, let a third party verify." Backlog parking lot has two capture fidelity items: "Screenshot timing / wait-for-load" and "Screenshot height cap configurability" -- both with demand-driven triggers. The 0017 prompt identifies cookie consent banners as "the single biggest fidelity issue for screenshots."
- **Why this agent**: UX strategy can map parameterization to real user needs vs. speculative features. The evidence-vs-fidelity tension is fundamentally a user journey question: what does the person receiving the evidence expect to see?

### Consultation 2: Security Attack Surface Analysis

- **Agent**: security-minion
- **Planning question**: What attack surface does capture parameterization open? Specifically evaluate: (1) Cookie/session injection as a vector for capturing authenticated content the API caller shouldn't access (e.g., injecting stolen session cookies). (2) Arbitrary JavaScript execution via wait-for conditions or page manipulation. (3) CSS injection or DOM manipulation to alter what the "evidence" shows. (4) Resource exhaustion via viewport size parameters (e.g., 10000x10000 viewport). (5) How do these risks differ between single-tenant (current) and multi-tenant (R12 planned) deployments? What's the minimum set of security constraints that would make parameterization safe?
- **Context to provide**: Current security model: SSRF prevention via URL validation (`src/url-validation.js`), BrowserContext isolation per capture, cross-domain navigation blocking, subresource limits (200), page size limits (50MB), Set-Cookie redaction in captured headers, service workers blocked. Auth is single API key (`src/auth.js`), multi-tenant planned as R12. Playwright BrowserContext accepts cookies, localStorage, viewport, and other options at creation time. The capture runs in `ctx.waitUntil()` with a ~30s budget.
- **Why this agent**: Parameterization directly expands the trust boundary -- callers move from providing only a URL to providing browser configuration. Security must evaluate whether this is a manageable expansion or a fundamental risk category change.

### Consultation 3: API Design for Capture Parameters

- **Agent**: api-design-minion
- **Planning question**: How should capture parameters be exposed in the API? Evaluate: (1) Request body extension (add fields alongside `url`) vs. named presets vs. a separate configuration resource. (2) Which parameters should be top-level fields vs. nested objects? (3) How should the API communicate what parameters were actually applied (for evidence provenance)? (4) Backward compatibility: the current API accepts only `{ url }` -- how do we extend without breaking existing callers? (5) Should parameterized captures be a separate endpoint or the same `POST /v1/captures`? Consider that capture metadata is stored in KV and parameters may need to be recorded for evidence integrity.
- **Context to provide**: Current API: `POST /v1/captures` accepts `{ url }` in JSON body, returns 202 with captureId. OpenAPI spec at `openapi.yaml`. KV stores capture metadata including url, status, timestamps, artifacts, wacz info. The `performCapture()` function signature is `(env, url, ip, captureId, tenantId, renderer)`. Relevant parking lot items: "Screenshot timing / wait-for-load" and "Screenshot height cap configurability."
- **Why this agent**: API design determines the long-term contract. Getting the parameter model right (or deciding not to have one) is a high-blast-radius, hard-to-reverse decision that affects every future feature.

### Consultation 4: Cookie Consent Technical Feasibility

- **Agent**: frontend-minion
- **Planning question**: How do the major cookie consent management platforms (OneTrust, Cookiebot, Didomi, TrustArc, custom implementations) work technically? Evaluate the feasibility and reliability of: (1) CSS-based banner hiding (inject stylesheet to `display:none` consent overlays). (2) Click-based automation (find and click accept/reject buttons via selectors). (3) CMP API calls (TCF v2 `__tcfapi()`, IAB GPP, direct CMP JavaScript APIs). (4) Pre-injection of consent cookies (set the appropriate cookies before navigation so the CMP never shows the banner). Which approach is most reliable across diverse sites? What's the failure rate for each? Can Playwright on Cloudflare Workers execute these approaches within the 25s navigation timeout?
- **Context to provide**: Capture runs in Playwright BrowserContext on Cloudflare Browser Rendering. Navigation timeout is 25s, waitUntil is 'networkidle'. Context is fresh per capture -- no prior state. Playwright supports `context.addCookies()`, `page.addStyleTag()`, `page.evaluate()`, and `page.click()`. The capture pipeline is in `src/capture.js` -- the `defaultRenderer()` function is where any consent handling would execute.
- **Why this agent**: Frontend expertise is needed to assess the technical landscape of cookie consent tools. This is a cross-browser, cross-CMP compatibility question that requires understanding the DOM manipulation and JavaScript API patterns these tools use.

### Consultation 5: Strategic Technology Assessment

- **Agent**: gru
- **Planning question**: Is capture parameterization the right investment for WRL's current stage? Consider: (1) The competitive landscape -- how do archive.org's Wayback Machine, Stillio, Pagefreezer, URLBox, and similar services handle cookie consent and parameterization? (2) Is the "evidence" positioning strengthened or weakened by allowing caller-controlled parameters? (3) Should WRL invest in cookie consent handling specifically, or in general parameterization, or neither? (4) Are there emerging standards or tools (e.g., consent-o-matic, I Don't Care About Cookies browser extension approaches) that could be leveraged? (5) What does the market signal say -- is cookie consent handling a table-stakes feature or a differentiator?
- **Context to provide**: WRL roadmap has three acts: "Solid Foundation" (near-term), "Evidence-Grade" (mid-term), "Infrastructure" (longer-horizon). Act 1 is still in progress (R2-R9 remaining). The product-marketing-minion previously recommended "evidence" over "archival" positioning. MCP server is in Act 3. Cookie consent is not currently in any backlog act. Cloudflare Browser Rendering provides Playwright API but runs in a Workers environment with constraints (30s budget, no persistent state, gVisor sandbox).
- **Why this agent**: Gru can assess whether this is a strategically sound investment vs. a premature feature, and how competitors handle the same problem. The YAGNI question is especially important given WRL's early stage.

### Consultation 6: Evidence Provenance and Metadata Architecture

- **Agent**: data-minion
- **Planning question**: If WRL supports parameterized captures, how should capture parameters be recorded for evidence provenance? Consider: (1) Should parameters be embedded in the WACZ bundle's `datapackage.json` manifest? (2) Should they be part of the KV capture record? (3) How does parameter recording interact with the Ed25519 signature -- should the signature cover the parameters to prove the capture was made with specific settings? (4) What's the schema for recording "this capture was made with viewport 1920x1080 and cookie consent auto-accepted"? (5) What's the KV storage impact if every capture record grows to include a parameter block?
- **Context to provide**: Current KV capture record includes: captureId, url, ip, tenantId, status, createdAt, completedAt/failedAt, artifacts (R2 keys), wacz (key, bundleHash, size). WACZ `datapackage.json` includes per-artifact SHA-256 hashes, bundleHash, and Ed25519 signature. The signature covers the bundleHash which covers the manifest. KV has a 25 MiB value limit but current records are <1 KB.
- **Why this agent**: Data architecture for parameter provenance is a hard-to-reverse decision. If parameters aren't recorded in the bundle, they can never be proven after the fact. If they are, the WACZ format and signing pipeline need to accommodate them.

---

## Cross-Cutting Checklist

- **Testing**: Not included for planning. This is an advisory (no code produced). If the advisory recommends implementation, test-minion would be included in the execution plan for that phase.
- **Security**: INCLUDED -- Consultation 2 (security-minion). Parameterization directly expands the trust boundary and attack surface. Security assessment is critical to the advisory recommendation.
- **Usability -- Strategy**: INCLUDED -- Consultation 1 (ux-strategy-minion). Every advisory needs the user journey perspective to evaluate whether the feature serves real needs.
- **Usability -- Design**: Not included for planning. No UI is being designed. If the advisory recommends a web UI for parameter configuration (unlikely at this stage), ux-design-minion would be relevant in execution.
- **Documentation**: Not included for planning. Advisory output is the documentation. If the advisory recommends implementation, software-docs-minion would document the API changes. The advisory itself will produce the documentation (backlog items, decisions).
- **Observability**: Not included for planning. No runtime components are being created. If parameterization is implemented, observability-minion would review logging of parameter usage.

---

## Anticipated Approval Gates

None. This is an advisory-only orchestration (`ADVISORY: true`). The output is a recommendation report, not an execution plan. No code is produced, no architecture decisions are locked in. The user decides whether to act on the recommendations.

---

## Rationale

Six specialists are consulted because capture parameterization spans multiple domains that rarely overlap:

1. **ux-strategy-minion** -- The fundamental question is whether parameterization serves the user's evidence needs or undermines them. This is a product strategy question before it's a technical one.

2. **security-minion** -- Moving from "caller provides URL" to "caller provides URL + browser configuration" is a category-level expansion of the trust boundary. The security assessment determines whether parameterization is safe at all.

3. **api-design-minion** -- The API contract for parameters is a high-blast-radius, hard-to-reverse decision. Getting it wrong means breaking changes later or living with a bad interface forever.

4. **frontend-minion** -- Cookie consent handling is the motivating use case, and it's a deeply technical frontend question. The feasibility assessment determines whether the most-wanted parameterization feature is even practical.

5. **gru** -- Strategic calibration: is this the right investment for WRL's current stage? Competitive analysis and YAGNI assessment prevent premature feature building.

6. **data-minion** -- Evidence provenance requires recording what parameters were used. The metadata/bundle schema decision is hard to reverse and affects the signing pipeline.

**Not included**: mcp-minion (MCP is Act 3, not relevant yet), iac-minion (no infrastructure changes in advisory), ai-modeling-minion (no agent/prompt work), observability-minion (no runtime components), accessibility-minion (no UI), edge-minion (no CDN/edge changes), test-minion (no code to test), software-docs-minion (advisory is self-documenting), user-docs-minion (no user-facing changes yet), product-marketing-minion (evidence positioning was already established in the roadmap advisory -- ux-strategy covers the user-facing angle here).

---

## External Skill Integration

No external skills detected in project.
