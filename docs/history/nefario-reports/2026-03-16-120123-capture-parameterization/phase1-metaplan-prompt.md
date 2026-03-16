MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

Evaluate whether WRL (Web Resource Ledger) should support parameterized capture requests — allowing API callers to control browser behavior during web page capture.

### Context

WRL is a web evidence/archival service running on Cloudflare Workers with Playwright-based browser rendering. It captures web pages (HTML + screenshot + metadata) and stores them in R2 with Ed25519 signatures for integrity. Currently, every capture starts with a completely blank browser session — no cookies, no localStorage, no prior state.

**The core problem**: Cookie consent banners (GDPR/ePrivacy) appear on virtually every capture because the browser has no prior consent state. This dominates screenshots and reduces capture fidelity. The question extends beyond cookies to broader capture parameterization.

### Key areas to evaluate

1. **Cookie consent handling**: Auto-accept, auto-reject, skip/dismiss cookie banners. Technical approaches (CSS hiding, click automation, consent management platform APIs). Reliability across different CMP implementations (OneTrust, Cookiebot, Didomi, custom).
2. **Session state injection**: Should callers be able to inject cookies, localStorage values, or other session state?
3. **Viewport and rendering parameters**: Device emulation, viewport size, wait-for conditions, JavaScript execution toggle, dark mode, etc.
4. **Evidence integrity implications**: How does parameterization interact with WRL's evidence/archival mission?
5. **API design**: How should parameters be passed? Request body fields vs query params vs presets.
6. **Security implications**: What attack surface does parameterization open?
7. **Complexity vs value tradeoff**: Is this worth building at all? YAGNI considerations.

### Technical constraints

- Runs on Cloudflare Workers with Browser Rendering (Playwright)
- Captures must complete within Workers CPU/wall-time limits
- Browser sessions are ephemeral (no session reuse between captures)
- Ed25519 signatures cover all capture artifacts
- Current API: POST /v1/captures with { url } body
- Single-tenant today, multi-tenant planned (R12)

### Current capture implementation

The capture pipeline (src/capture.js) creates a fresh BrowserContext per capture with:
- Fixed viewport: 1280x720
- Service workers blocked
- Cross-domain navigation blocked via route interception
- Subresource count limit (200) and page size limit (50MB)
- Navigation timeout: 25s
- Screenshot: full-page PNG, height capped at 8000px
- No cookie handling, no consent management, no session state injection

The API (src/index.js handleCreateCapture) accepts only `{ url }` in the request body.

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/capture-parameterization-advisory

## External Skill Discovery
No external skills found in .claude/skills/ or .skills/.

## Instructions
1. Read relevant files to understand the codebase context
2. Analyze the task against your delegation table
3. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
4. For each specialist, write a specific planning question that draws on their unique expertise.
5. Return the meta-plan in the structured format.
6. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-cfmjZO/capture-parameterization/phase1-metaplan.md
