## Task: Capture Request Parameterization Advisory

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture.

### Context

WRL is a web evidence/archival service running on Cloudflare Workers with Playwright-based browser rendering. It captures web pages (HTML + screenshot + metadata) and stores them in R2 with Ed25519 signatures for integrity. Currently, every capture starts with a completely blank browser session — no cookies, no localStorage, no prior state.

**The core problem**: Cookie consent banners (GDPR/ePrivacy) appear on virtually every capture because the browser has no prior consent state. This dominates screenshots and reduces capture fidelity. The question extends beyond cookies to broader capture parameterization.

### Key areas to evaluate

1. **Cookie consent handling**: Auto-accept, auto-reject, skip/dismiss cookie banners. Technical approaches (CSS hiding, click automation, consent management platform APIs). Reliability across different CMP implementations (OneTrust, Cookiebot, Didomi, custom).

2. **Session state injection**: Should callers be able to inject cookies, localStorage values, or other session state? Use cases: capturing personalized views, authenticated pages, A/B test variants.

3. **Viewport and rendering parameters**: Device emulation, viewport size, wait-for conditions, JavaScript execution toggle, dark mode, etc.

4. **Evidence integrity implications**: How does parameterization interact with WRL's evidence/archival mission? If someone injects cookies or dismisses consent banners, is the result still valid evidence? Should parameters be recorded in capture metadata?

5. **API design**: How should parameters be passed? Request body fields vs query params vs presets. Versioning. Backward compatibility with existing captures.

6. **Security implications**: What attack surface does parameterization open? Cookie injection, JavaScript execution, SSRF via session state, resource exhaustion via complex parameters.

7. **Complexity vs value tradeoff**: Is this worth building at all? YAGNI considerations. Could a simpler approach (e.g., just CSS-hiding cookie banners) solve 80% of the problem?

### Technical constraints

- Runs on Cloudflare Workers with Browser Rendering (Playwright)
- Captures must complete within Workers CPU/wall-time limits
- Browser sessions are ephemeral (no session reuse between captures)
- Ed25519 signatures cover all capture artifacts
- Current API: POST /v1/captures with { url } body
- Single-tenant today, multi-tenant planned (R12)

### What I want from the advisory

- Clear recommendation on whether to pursue parameterization
- If yes: phased approach with priority ordering
- Cookie consent handling as a specific deep-dive (biggest pain point)
- Security model for accepting browser-controlling parameters
- Backlog items with sizing and dependencies
- Honest assessment of complexity vs value
