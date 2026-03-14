# Meta-Plan: Static Verification Page (Issue #7)

## Scope

**In scope**: Browser-accessible verification page served by the existing Cloudflare Worker via content negotiation. Single self-contained HTML string with inlined CSS and vanilla JS. `<noscript>` fallback. No external dependencies, no frameworks, no build step.

**Out of scope**: Server-side rendering, separate static hosting, new API endpoints, changes to the verification API response shape, external stylesheets/scripts/fonts, any new npm dependencies.

## Planning Consultations

### Consultation 1: Content Negotiation and Worker Routing

- **Agent**: edge-minion
- **Planning question**: The `handleVerifyCapture` handler currently always returns JSON. What is the cleanest pattern for adding `Accept: text/html` content negotiation within this handler while preserving the existing JSON behavior as default? Should the HTML rendering be inline in `index.js`, extracted to a separate module (e.g., `src/verify-page.js`), or handled as a template string factory? Consider: the Worker already has a single-file routing pattern with handler functions; we want to avoid bloating `index.js` with a large HTML template string. Also consider security headers -- the HTML response needs different Content-Type and potentially different CSP headers than the JSON response.
- **Context to provide**: `src/index.js` (full file -- routing pattern, `handleVerifyCapture` function), `src/responses.js` (response helpers), `wrangler.toml` (Worker config)
- **Why this agent**: Edge worker development is edge-minion's domain. The content negotiation pattern, response header management, and Worker-specific constraints (memory, CPU time, bundle size) all benefit from edge expertise.

### Consultation 2: Verification Page UI Design

- **Agent**: ux-design-minion
- **Planning question**: Design the visual layout for a single-page verification result display. The page must show: URL, capture timestamp, SHA-256 bundle hash, a verified/unverified badge, a screenshot inline, and three individual check results (artifactHashes, bundleHash, signature). Constraints: (1) inlined CSS only -- no external stylesheets, (2) no framework -- vanilla HTML/CSS, (3) must work as a single HTML string returned by a Worker, (4) zero external HTTP requests (no CDN fonts, no icon libraries). Consider: What does a trustworthy verification page look like? How should the verified vs. unverified states differ visually? How should the three individual checks be presented -- expanded by default, collapsed, or summary-only? How should the screenshot be displayed (it's fetched from the artifacts API)?
- **Context to provide**: Verification API response shape (from `handleVerifyCapture` in `src/index.js` lines 273-284 and the capture metadata shape), existing project design philosophy (vanilla, no frameworks, KISS)
- **Why this agent**: UI/UX design for a trust-critical verification page requires visual hierarchy expertise. The verified/unverified badge must be immediately clear, the check details must be scannable, and the page must feel authoritative without external design dependencies.

### Consultation 3: Security Review of HTML-Serving Worker

- **Agent**: security-minion
- **Planning question**: What security concerns arise when a Cloudflare Worker that currently serves only JSON starts serving HTML with inline JavaScript? Specifically: (1) What Content-Security-Policy headers should the HTML response include given it has inline `<script>` and `<style>` tags? (2) The page will make a fetch call back to the same origin's JSON API (`/v1/verify/{id}`) -- any CORS or same-origin concerns? (3) The page displays user-originated data (URL, timestamps, hashes) -- what XSS vectors exist and how should they be sanitized? (4) The `<noscript>` fallback shows a capture ID and direct API link -- any information disclosure risk? (5) Should the HTML response have different Cache-Control headers than the JSON response? Consider the existing security posture: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, capture ID as access secret.
- **Context to provide**: `src/index.js` (full routing and security headers), `src/responses.js`, the verification response shape, the existing security patterns (no reflected user input in errors, capture ID as bearer token equivalent)
- **Why this agent**: Serving HTML from a JSON API worker introduces new attack surface (XSS, CSP bypass, content injection). Security review during planning prevents retrofitting defenses.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The content negotiation logic (Accept header parsing, HTML vs JSON branching) and the HTML page behavior (noscript fallback, JS fetch to API, rendering states) need test strategy designed before implementation. Questions: How do we test the HTML response in the existing vitest/cloudflare-test setup? Can we test the `<noscript>` fallback programmatically? Should we test the rendered page in a browser (e2e) or is unit-testing the HTML string sufficient for MVP?
- **Security**: YES -- included as Consultation 3 above. HTML serving from a JSON API worker is a significant security surface change.
- **Usability -- Strategy**: Include for planning. Question for ux-strategy-minion: This page is the first user-facing interface of the entire product (everything else is API-only). What is the user journey for a non-technical person who receives a verification URL? What do they need to understand, what can be hidden, and what builds trust? Should the page include any explanatory text about what verification means, or just show the result? How does the `<noscript>` fallback serve users with JS disabled -- is showing the capture ID and a JSON API link actually useful to a non-technical user, or should the fallback be different?
- **Usability -- Design**: YES -- included as Consultation 2 above. This is the first and only user-facing UI in the product.
- **Documentation**: Include software-docs-minion for planning. Question: The content negotiation pattern (same URL, different response based on Accept header) is an architectural decision that future developers need to understand. Should this be documented in the existing codebase patterns (inline comments, a new section in any architecture docs), or is the code self-documenting enough? Also: does the evolution log need any special treatment for this phase given it's the first UI work?
- **Observability**: Exclude. This is a static HTML page served from an existing Worker endpoint. No new runtime components, no new services, no new logging needs beyond what the existing Worker already provides. The verification endpoint already has rate limiting.

### Anticipated Approval Gates

1. **HTML page design and layout** (MUST gate) -- The visual design of the verification page is hard to reverse once implemented (CSS and HTML structure pervade the template) and has high blast radius (the page IS the deliverable). Multiple valid design approaches exist (minimal badge-only vs. detailed check breakdown, screenshot prominence, trust signals). User should approve the design direction before implementation.

2. **Content negotiation pattern** (OPTIONAL gate) -- How the Worker branches between JSON and HTML responses. Lower blast radius (contained to one handler function) and easy to reverse, but the pattern sets a precedent for any future HTML-serving endpoints.

### Rationale

This task is narrower than typical orchestrations -- it's a single HTML page served via content negotiation from an existing endpoint. The core challenges are:

1. **Security surface expansion**: Going from JSON-only to HTML+JS serving introduces XSS, CSP, and content injection concerns. Security-minion must weigh in during planning.
2. **First UI**: This is the product's first user-facing interface. Despite being simple, it must look trustworthy and be immediately comprehensible to non-technical users. Both ux-strategy-minion (what to show) and ux-design-minion (how it looks) are needed.
3. **Edge architecture**: The content negotiation pattern within a Cloudflare Worker has specific constraints (bundle size, response construction). Edge-minion should advise on the pattern.
4. **Test strategy**: Testing an HTML response from a Worker in vitest needs a deliberate approach. Test-minion should be consulted.

Software-docs-minion is included per the mandatory checklist -- this is an architectural pattern worth documenting.

## External Skill Integration

No external skills detected in project. Scanned `.claude/skills/` and `.skills/` relative to `/Users/ben/github/benpeter/web-resource-ledger/` -- no SKILL.md files found.
