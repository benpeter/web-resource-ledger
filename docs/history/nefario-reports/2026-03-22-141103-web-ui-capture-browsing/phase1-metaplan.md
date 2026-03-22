# Meta-Plan: Web UI for Capture Submission and Browsing (R17)

## Planning Consultations

### Consultation 1: Frontend Architecture and Routing Strategy
- **Agent**: frontend-minion
- **Planning question**: This UI will be served inline from a Cloudflare Worker (template strings in JS modules, same pattern as `verify-page.js` at ~800 lines). The design system already exists (`design-system.css` with tokens, buttons, inputs, cards, tables, badges, alerts, disclosure, data-grid). The constraint is vanilla HTML/JS/CSS -- no frameworks, no build step. Given that we need three views (capture form, capture list, capture detail) plus an auth gate, what is the right client-side routing approach? Specifically: (a) Should we use hash-based routing (`#/captures`, `#/captures/:id`) or path-based routing with Worker-side catch-all? (b) How should the JS be structured within Worker template strings to keep each "page" maintainable at scale? (c) What is the right progressive enhancement strategy for the status polling UX (capture submission -> poll status -> show result)?
- **Context to provide**: `src/verify-page.js` (the existing 800-line HTML-in-JS pattern), `src/design-system.css` (full component library), `src/index.js` routes array, wrangler.toml (Cloudflare Worker config). The worker serves all routes from a single `fetch()` handler.
- **Why this agent**: Frontend-minion has expertise in component architecture and vanilla JS patterns. The key planning decision is how to structure a multi-view SPA without a framework, keeping code maintainable within the Worker's inline template pattern.

### Consultation 2: Auth UX for Browser-Based Access
- **Agent**: security-minion
- **Planning question**: The current auth model is Bearer token API keys (SHA-256 hashed, stored in D1). The UI needs browser-based access to authenticated endpoints (POST /v1/captures, GET /v1/captures). Three options: (a) User pastes API key into a form, stored in localStorage/sessionStorage, sent as Bearer header via fetch(). (b) Session-based auth -- exchange API key for a short-lived session cookie. (c) Something else. What are the security implications of each approach? Consider: XSS risk with localStorage keys, CSRF with cookies, the fact that `GET /v1/captures/:id` is already unauthenticated (ID-as-secret), the existing CSP policy (`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`). Also: how should the CORS configuration change? Currently CORS is only enabled for POST /v1/captures. The UI will need GET /v1/captures and GET /v1/captures/:id/status to work from the browser. If the UI is served from the same origin as the API, is CORS even relevant?
- **Context to provide**: `src/auth.js` (full auth module), `src/index.js` (CORS handling at lines 216-228, 277-284), existing CSP headers on verify-page, the parking lot item "[consider] OAuth for web UI".
- **Why this agent**: Security-minion needs to evaluate the auth model for browser exposure. The choice between localStorage API key vs session cookies vs same-origin fetch has significant security implications that affect the architecture.

### Consultation 3: API Surface for UI Consumption
- **Agent**: api-design-minion
- **Planning question**: The UI needs to consume these endpoints: POST /v1/captures (authenticated), GET /v1/captures (authenticated, paginated), GET /v1/captures/:id (unauthenticated), GET /v1/captures/:id/status (unauthenticated), GET /v1/captures/:id/artifacts/screenshot (unauthenticated). Two planning questions: (1) If the UI is served from the same Worker origin, do we need any CORS changes at all? Same-origin fetch() requests bypass CORS entirely. (2) The list endpoint currently returns a minimal shape. Should the UI have a different response shape or should we serve the same JSON? The existing list response includes: `{ items: [...], pagination: { offset, limit, total } }` with items having `{ id, status, url, createdAt, completedAt }`. Is this sufficient for a useful list view, or does the UI need additional fields (e.g., thumbnail URL, verification status)?
- **Context to provide**: `handleListCaptures` (lines 754-980 in index.js), `handleGetCapture` (lines 984-1038), the list response shape, verify-page.js (which already fetches both verify and capture endpoints).
- **Why this agent**: API-design-minion can identify whether the existing API surface is sufficient for the UI or if we need to extend it, and can advise on the same-origin vs CORS question.

### Consultation 4: UX Strategy -- Journey Design and Simplification
- **Agent**: ux-strategy-minion
- **Planning question**: This is the first user-facing interface for WRL (beyond the verification page, which is a read-only report). The target user is an evaluator who wants to try WRL without using a terminal. Design the user journey: (a) What is the minimum viable flow from "I have an API key" to "I can see my captured page with verification status"? (b) How should the auth gate work from a UX perspective -- separate login page, inline auth prompt, or persistent sidebar? (c) For the capture list view, what information density is appropriate? The list could be a simple table, a card grid, or a timeline. (d) The capture detail view already exists as the verification page (`/v1/verify/:id`). Should the UI's detail view reuse that design or be a distinct view with editing capabilities? (e) What is the error/empty state strategy? First-time users will have zero captures.
- **Context to provide**: The verify-page.js (existing detail view pattern), design-system.css (available components: table, card, badge, alert, banner, input, btn, data-grid), the three target views, mobile requirement.
- **Why this agent**: ux-strategy-minion always participates. This is the first real product UI, so journey coherence and cognitive load are critical planning inputs. The "zero captures" empty state and first-run experience need early design attention.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The verify-page.js already has `test/verify-page.test.js` and `test/verify-html.test.js` establishing the HTML testing pattern. Test-minion should advise on how to test a multi-view vanilla JS UI served from a Worker -- specifically whether to use the existing Vitest pattern (unit tests on the HTML generator functions) or add browser-based tests via Playwright.
- **Security**: Include security-minion for planning (Consultation 2). The auth model for browser access is a primary planning decision. XSS via localStorage, CSP policy for the UI pages, and same-origin API access all need security review before architecture decisions.
- **Usability -- Strategy**: ALWAYS include (Consultation 4). What is the right first-run experience for an evaluator? How should the three views connect? What is the appropriate information density for each view?
- **Usability -- Design**: Do not include for planning. The design system already exists with a comprehensive component library (buttons, inputs, cards, tables, badges, alerts). Design review will happen at Phase 3.5 (architecture review) when the execution plan is concrete. UX design decisions at the component level are implementation concerns.
- **Documentation**: Include software-docs-minion for planning. The UI introduces a new surface area that needs documentation: how to access the UI, what the auth flow looks like, and any changes to the existing API documentation. The question: should the UI be documented in the existing README/API docs, or does it warrant a separate user guide?
- **Observability**: Do not include for planning. The UI is a frontend served from the existing Worker -- all API calls already have structured logging and metrics. No new runtime components are introduced. The existing Coralogix integration covers all request paths the UI will use.

### Notable Exclusions

- **accessibility-minion**: Excluded from planning because the design system already includes `.sr-only`, focus-visible styles, `aria-label`/`aria-live` patterns (established in verify-page.js). Accessibility review will run at Phase 3.5 as a mandatory discretionary reviewer when the plan includes UI tasks. The existing patterns provide a strong foundation -- the risk is in implementation, not architecture.
- **edge-minion**: The UI is served inline from the existing Worker. No CDN configuration, edge workers, or caching strategy changes needed. The Worker already handles Cache-Control headers.
- **iac-minion**: No infrastructure changes. The UI is served from the same Worker, same D1/R2/KV bindings. No new deployments, no new services. CORS_ORIGINS may need updating in wrangler.toml but that is a one-line config change, not an infrastructure decision.

### Anticipated Approval Gates

1. **Auth model for browser access** (MUST gate): The choice between localStorage API key, session cookies, or same-origin-only determines the security model, CSP policy, CORS requirements, and the shape of every UI component. Hard to reverse (baked into every fetch call and the server-side auth path). High blast radius (all three views depend on it). Multiple valid approaches exist.

2. **Client-side routing and file architecture** (MUST gate): Whether to use hash routing vs path routing, and how to structure multi-view HTML within Worker template strings. This determines the Worker route patterns, the CSP policy (hash routing needs no server changes; path routing needs catch-all routes), and how maintainable the code is. Hard to reverse once all views are built against it.

3. **UX flow and view structure** (OPTIONAL gate): The three-view structure (form, list, detail) is fairly standard, but the auth gate UX and the relationship between the new list/detail views and the existing verification page could go multiple ways. Gate if the UX strategy consultation surfaces significant ambiguity.

### Rationale

This task is primarily a **frontend architecture + security + UX** problem. The backend API already exists and is well-tested. The design system exists. The key planning decisions are:

1. **How to authenticate browser users** -- this is the hardest decision because the current auth model (Bearer tokens) was designed for API clients, not browsers. The security implications of exposing API keys in browser storage need expert evaluation.

2. **How to structure a multi-view UI within a Cloudflare Worker** -- there is no build step, no bundler, no framework. The existing pattern (verify-page.js) works for a single page but scaling to three interconnected views within template strings is a non-trivial architecture decision.

3. **What the user journey should look like** -- this is the first time WRL presents a product experience (not just an API). The empty-state, first-run, and polling UX need intentional design.

API-design-minion is included to confirm whether the existing API surface is sufficient or needs extension. Frontend-minion tackles the vanilla JS architecture. Security-minion evaluates the auth model. UX-strategy-minion designs the journey. Software-docs-minion considers documentation impact.

Test-minion is included for planning because the test strategy for UI code in a Worker context is non-obvious -- the existing verify-page tests provide a pattern, but multi-view JS testing may need a different approach.

### Scope

**In scope**:
- Browser-based capture submission form (URL input, submit, poll status, show result)
- Capture list view with pagination, status badges, and links to detail
- Capture detail view with verification status, screenshot, metadata
- Auth flow for browser access (API key input, persistent session)
- Responsive design for mobile browsers
- Vanilla HTML/JS/CSS (no frameworks)
- Worker-served pages (same pattern as verify-page.js)
- Tests for the new UI code

**Out of scope**:
- Admin dashboard / user management UI
- Advanced search beyond existing API filters (status, url prefix, date range)
- Offline support / service worker
- OAuth or social login (parked in backlog)
- New API endpoints (unless the planning consultations identify a gap)
- Changes to the existing verification page design

### External Skill Integration

No external skills detected in project.
