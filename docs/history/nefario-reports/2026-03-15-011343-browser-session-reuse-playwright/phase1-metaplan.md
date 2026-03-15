# Meta-Plan: Browser Session Reuse with Playwright Migration

## Planning Consultations

### Consultation 1: Cloudflare Browser Rendering Session Lifecycle

- **Agent**: edge-minion
- **Planning question**: What is the correct session reuse pattern for Cloudflare Browser Rendering with Playwright? Specifically: (a) How does `browser.disconnect()` vs `browser.close()` work in `@cloudflare/playwright`? (b) What are the semantics of `keep_alive` on browser launch? (c) How does session discovery work -- what API does Cloudflare expose to list active/idle sessions, and how should a Worker reconnect to an existing session? (d) What happens when multiple Workers race for the same free session (contention)? (e) What are the practical limits -- the 30-session cap, session timeout behavior, and how `keep_alive` interacts with Cloudflare's session garbage collection?
- **Context to provide**: Current `src/capture.js` (uses `puppeteer.launch()` / `browser.close()`), `wrangler.toml` (has `[browser]` binding), the 30-session Browser Rendering limit, the goal of ~300 captures/min throughput.
- **Why this agent**: Edge-minion owns CDN/edge platform expertise. Cloudflare Browser Rendering is an edge compute service with platform-specific session management semantics. Getting the session lifecycle wrong means either session leaks (hitting the 30-session cap) or contention failures. This is the foundation the entire implementation depends on.

### Consultation 2: Playwright API Migration Surface

- **Agent**: frontend-minion
- **Planning question**: What are the concrete API differences between `@cloudflare/puppeteer` and `@cloudflare/playwright` that affect `src/capture.js`? Specifically: (a) How does `page.route()` replace `page.setRequestInterception(true)` + the `request` event listener pattern? (b) What is the Playwright equivalent of `req.abort('blockedbyclient')` and `req.continue()`? (c) How does `page.goto()` differ -- does Playwright use `waitUntil: 'networkidle'` instead of `networkidle2`? (d) Are there differences in `page.screenshot()`, `page.content()`, `page.setViewport()` (or `page.setViewportSize()`)? (e) How does BrowserContext creation and isolation differ? (f) Does Playwright's `page.route()` provide full cross-domain navigation blocking that closes the TOCTOU gap in the backlog?
- **Context to provide**: Current `defaultRenderer()` function in `src/capture.js` (lines 183-233), the request interception pattern for subresource counting and size limiting, the TOCTOU backlog items.
- **Why this agent**: Frontend-minion owns browser API expertise. The Puppeteer-to-Playwright migration is a browser automation API translation task -- getting the route/interception semantics wrong could break subresource limiting, size guards, or the TOCTOU mitigation. Frontend-minion can identify gotchas in the API surface mapping.

### Consultation 3: Session Contention and Concurrency Safety

- **Agent**: security-minion
- **Planning question**: What are the security implications of browser session reuse? Specifically: (a) Is BrowserContext isolation sufficient to prevent cross-capture data leakage (cookies, localStorage, cache), or does browser-level state persist between contexts? (b) What is the threat model for session contention -- if two Workers both try to connect to the same idle session, what happens and what can go wrong? (c) Does `browser.disconnect()` (keeping the browser alive) create any risk of state leakage between captures that `browser.close()` would prevent? (d) The issue mentions documenting "why BrowserContext isolation is sufficient" -- what specific threats should that threat model address? (e) Does the Playwright migration change the TOCTOU threat landscape -- does `page.route()` close the cross-domain navigation gap?
- **Context to provide**: Current security constraints documented in the `src/capture.js` header comment, the TOCTOU backlog items, the BrowserContext usage pattern (context created per capture, closed in `finally`).
- **Why this agent**: Security-minion must validate the isolation model. The fundamental shift from browser-per-capture to shared-browser-with-context-isolation is a security architecture decision. If BrowserContext isolation has gaps (e.g., shared DNS cache, shared certificate state), the session reuse pattern could leak cross-capture data. This needs expert analysis before implementation, not after.

### Consultation 4: Test Strategy for Session Reuse

- **Agent**: test-minion
- **Planning question**: How should the test suite be adapted for the Playwright migration and session reuse pattern? Specifically: (a) The current tests use a `stubRenderer` injection pattern -- does this pattern survive the Playwright migration, or do tests need to mock Playwright's API differently? (b) The `vitest.config.js` uses `miniflare` with `browserRendering: { binding: 'BROWSER' }` -- does miniflare support `@cloudflare/playwright`, or does the test infrastructure need changes? (c) How should session reuse behavior be tested -- session discovery, reconnection, contention handling, `disconnect()` vs `close()`? (d) Can the `@cloudflare/vitest-pool-workers` test pool simulate concurrent captures to verify throughput improvement? (e) Should the `categorizeError()` function be updated for Playwright-specific error messages (different from Puppeteer's)?
- **Context to provide**: `test/capture.test.js`, `test/capture-integration.test.js`, `vitest.config.js`, the `stubRenderer` injection pattern in `performCapture()`.
- **Why this agent**: Test-minion needs to assess whether the existing test infrastructure supports the migration and identify what new test scenarios are needed. The test pool uses Cloudflare-specific tooling that may or may not support Playwright, and this constraint could significantly affect the implementation approach.

### Cross-Cutting Checklist

- **Testing**: INCLUDE (test-minion, Consultation 4 above) -- This task produces significant code changes in `src/capture.js` and `package.json`. The existing test suite must be validated against the new API and new test scenarios are needed for session lifecycle.
- **Security**: INCLUDE (security-minion, Consultation 3 above) -- The shift from browser-per-capture to shared-browser is a security architecture decision involving isolation boundaries and data leakage risk. The issue explicitly calls for threat model documentation.
- **Usability -- Strategy**: INCLUDE -- The throughput improvement (30 to ~300 captures/min) changes the capacity model. ux-strategy-minion should assess whether the improved throughput changes any user-facing behavior (e.g., faster status transitions, capacity limits communicated to users) or error scenarios (e.g., new failure modes from session contention that need user-safe error messages).
  - **Planning question for ux-strategy-minion**: Does the 10x throughput improvement change any user-facing behavior or error scenarios? Specifically: (a) Are there new failure modes (session contention, no idle sessions available) that need user-safe error messages in `categorizeError()`? (b) Should the `Retry-After: 5` header on 202 responses be adjusted given faster capture completion? (c) Does the capacity change affect any documented limitations?
- **Usability -- Design**: EXCLUDE -- No user-facing interface changes. This is a backend infrastructure optimization.
- **Documentation**: INCLUDE -- The issue explicitly requires: (a) header comment documenting BrowserContext isolation threat model reasoning, (b) scaling path added to `docs/backlog.md`. software-docs-minion should be included for execution but does not need to participate in planning -- the documentation scope is well-defined in the issue.
- **Observability**: EXCLUDE -- No new runtime services or endpoints are being created. The existing capture pipeline's logging is unchanged. Structured logging is already a backlog item. Adding observability for session pool metrics would be scope creep.

### Anticipated Approval Gates

1. **Session lifecycle design** (MUST gate) -- The session reuse architecture (discover idle -> reconnect -> keep_alive -> disconnect) is hard to reverse once implemented and has 3+ downstream dependents (test changes, Playwright migration code, backlog updates). Multiple valid approaches exist (e.g., eager vs lazy session acquisition, retry-on-contention vs queue-on-contention). This gate presents the session management design for approval before implementation.

2. **BrowserContext isolation threat model** (MUST gate) -- The security analysis of whether BrowserContext isolation is sufficient. This is a security architecture decision that gets baked into a code comment and drives the implementation approach. If the threat model reveals gaps, the entire session reuse approach may need revision.

### Rationale

This task has two interleaved concerns: (1) a library migration (Puppeteer to Playwright) and (2) an architecture change (browser-per-capture to session reuse). The library migration is mechanical but has API surface gotchas that frontend-minion can identify. The architecture change is where the real risk lives -- session lifecycle semantics are Cloudflare-platform-specific (edge-minion), the isolation model has security implications (security-minion), and the test infrastructure may not support the new setup (test-minion).

Four specialists are consulted for planning because each covers a distinct risk domain:
- **edge-minion**: Platform-specific session semantics (the "how" of session reuse on Cloudflare)
- **frontend-minion**: Browser API translation (the "how" of Puppeteer-to-Playwright mapping)
- **security-minion**: Isolation model validation (the "is it safe" question)
- **test-minion**: Test infrastructure compatibility (the "can we verify it" question)

ux-strategy-minion is included per the mandatory checklist to assess user-facing impact of the throughput change and new error scenarios.

### Scope

**What the task is trying to achieve**: Increase capture throughput from ~30 to ~300 captures/min by reusing browser sessions (disconnect instead of close), while simultaneously migrating from Puppeteer to Playwright. The net result is a single file (`src/capture.js`) that uses `@cloudflare/playwright`, discovers and reconnects to idle sessions, and properly manages the session lifecycle within the 30-session Browser Rendering limit.

**In scope**:
- `src/capture.js` session lifecycle refactor (launch -> discover/reconnect, close -> disconnect)
- Puppeteer to Playwright API migration in `src/capture.js`
- `package.json` dependency swap (`@cloudflare/puppeteer` -> `@cloudflare/playwright`)
- `wrangler.toml` changes if needed for Playwright compatibility
- Test suite adaptation for Playwright API
- BrowserContext isolation threat model documentation (code comment)
- Scaling path documentation in `docs/backlog.md`
- TOCTOU backlog entries marked as DONE
- Evolution log entries (per CLAUDE.md requirement)

**Out of scope** (per issue):
- Queue-based backpressure
- Durable Object session coordination
- Cloudflare Containers
- Infrastructure changes
- New endpoints or API surface changes

### External Skill Integration

No external skills detected in project. The `.claude/skills/` and `.skills/` directories do not exist in the working directory. The user-global `juli` skill is a personal conversation tool, not relevant to this task domain.
