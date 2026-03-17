# Meta-Plan: Fix autoconsent injection timing for late-loading CMP iframes

## Planning Consultations

### Consultation 1: Frame event listener design for late-loading iframe injection

- **Agent**: frontend-minion
- **Planning question**: What is the correct Playwright frame event pattern (`page.on('frameattached')` vs `page.on('framenavigated')` or both) for injecting autoconsent into CMP iframes that load after the initial `page.frames()` snapshot? The listener must be registered before `dismissCookieConsent()` is called but after `page.goto()` completes. Consider: (a) which event fires for dynamically-injected iframes (JS `document.createElement('iframe')`), (b) whether `frameattached` fires before the frame has a document context ready for `evaluate()`, (c) race conditions between the listener and the 8s consent timeout, (d) how to handle the same frame receiving injection from both the initial `page.frames()` loop and a late event. The implementation must work in both the `exposeBinding` path and the `polling` fallback path in `consent.js`.
- **Context to provide**: `src/consent.js` (full file -- lines 1-243), `src/capture.js` (lines 486-509 showing the settle/consent/screenshot sequence), the outcome.md from Phase 0033 documenting the NYT/OneTrust lazy-load gap.
- **Why this agent**: Frontend-minion has deep Playwright API knowledge and understands browser lifecycle events. The core implementation work is Playwright frame event wiring -- this is the primary execution agent.

### Consultation 2: Sourcepoint opt-out failure diagnosis

- **Agent**: debugger-minion
- **Planning question**: Guardian and Spiegel show `failed, cmp=Sourcepoint-frame` after PR #82's multi-frame injection. The CMP is detected but opt-out does not complete within 8s. What are the likely failure modes? Specifically: (a) Is this a timing issue where autoconsent's `optOut()` clicks a button before the Sourcepoint iframe's DOM is fully interactive? (b) Is it a selector mismatch in autoconsent's Sourcepoint-frame rules vs the current Sourcepoint SDK version? (c) Could the `eval` message routing (frame.evaluate for evalResp) be losing messages because the target frame navigated between eval request and response? (d) Is the `detectRetries: 5` config sufficient for iframe-based CMPs where the DOM loads incrementally? Outline a diagnostic approach that can be executed during implementation.
- **Context to provide**: `src/consent.js` (full file), the staging validation table from Phase 0033 outcome.md, the vendored autoconsent version (14.59.0).
- **Why this agent**: debugger-minion excels at root cause analysis and demonstrated value in Phase 0033 (correctly identified `frame()` throw behavior, Playwright redirect internals). The Sourcepoint failure requires systematic diagnosis, not guessing.

### Consultation 3: Edge runtime constraints for frame event listeners

- **Agent**: edge-minion
- **Planning question**: Are there Cloudflare Workers Browser Rendering constraints on Playwright frame events that differ from standard Playwright? Specifically: (a) Does `@cloudflare/playwright` support `page.on('frameattached')` and `page.on('framenavigated')`? (b) Are there timing differences in the Workers runtime vs local Playwright (e.g., event delivery latency, frame lifecycle differences in the gVisor sandbox)? (c) Could the 8s consent timeout interact badly with frame event delivery on the Workers platform (events arriving after timeout resolve)? (d) Is there any ctx.waitUntil budget concern -- the current budget is NAV_TIMEOUT_MS=20s + 3s settle + 8s consent + 2s post = ~33s worst-case against 30s limit. Adding frame event listeners shouldn't change this, but confirm.
- **Context to provide**: `src/capture.js` (constants and timing budget comments), `src/consent.js`, the project's Cloudflare Workers runtime context.
- **Why this agent**: edge-minion understands Cloudflare Workers runtime constraints and the `@cloudflare/playwright` binding. The frame event approach could behave differently on Workers than in local Playwright -- edge-minion can identify platform-specific gotchas before implementation.

### Consultation 4: Test strategy for frame event injection

- **Agent**: test-minion
- **Planning question**: Phase 0033 concluded that consent.js changes are untestable with mocked renderers (decision #4 in decisions.md). For this refinement, is there any testable surface area? Specifically: (a) Can we unit-test the frame event listener registration logic if we extract it as a function that takes a `page` mock with `on()` support? (b) The polling fallback path now needs to poll late-arriving frames -- can the polling loop behavior be tested with a mock frame array that grows mid-iteration? (c) Should we add a consent.test.js file (referenced in consent.js header but never created) for the non-Playwright logic (allowlist validation, eval cap, status mapping)? (d) What assertions should the staging validation cover for the expanded 14-site test set?
- **Context to provide**: `src/consent.js`, `test/capture.test.js` (fixture patterns), `test/fixtures.js`, Phase 0033 decision #4.
- **Why this agent**: test-minion determines what is testable and what requires manual staging validation. The "test the real boundaries" philosophy in CLAUDE.md constrains what mock-based tests are acceptable.

### Cross-Cutting Checklist

- **Testing**: INCLUDED (Consultation 4) -- test-minion evaluates testable surface area and staging validation strategy for the frame event changes and Sourcepoint diagnosis.
- **Security**: NOT INCLUDED for planning. The change is narrowly scoped to consent.js injection timing. No new attack surface: frame event listeners observe the same frames that already exist in the page, and the exposeBinding callback already handles arbitrary frames. The `eval` code cap (2048 bytes) and message type allowlist are unchanged. Security-minion reviews in Phase 3.5 as mandatory reviewer.
- **Usability -- Strategy**: NOT INCLUDED for planning (explicit justification). This is a backend bugfix to an existing feature (cookie consent dismissal). There is no user-facing API change, no new feature, no changed behavior visible to API consumers. The consent result changes from `notDetected` to `dismissed` or `failed` -- strictly more honest, not a UX decision. ux-strategy-minion reviews in Phase 3.5 as mandatory reviewer.
- **Usability -- Design**: NOT INCLUDED. No UI components, no user-facing interfaces. Pure backend Playwright instrumentation.
- **Documentation**: NOT INCLUDED for planning. The change is a bugfix to an existing internal module. No API surface changes, no new configuration, no user-facing behavior changes beyond more accurate consent detection. software-docs-minion handles post-execution documentation in Phase 8 if code comments or architecture docs need updating. The evolution log (required by CLAUDE.md) is handled by the calling session.
- **Observability**: NOT INCLUDED for planning. The existing consent logging in capture.js (`consentStatus`, `consentCmp` in the success log event) already captures the relevant telemetry. No new log fields or metrics are needed. If the implementation adds notable instrumentation, observability-minion reviews in Phase 3.5.

### Anticipated Approval Gates

1. **Frame event listener design** (MUST gate) -- The listener pattern (frameattached vs framenavigated vs both, registration timing, deduplication strategy) is hard to reverse once implemented and blocks all downstream tasks. Multiple valid approaches exist. Gate after frontend-minion produces the design.

This should be the only gate. The Sourcepoint diagnosis may produce findings but those are investigative (what we discover determines what we do), not a design decision requiring approval.

### Rationale

This is a focused refinement with two distinct problems:

1. **Late-loading iframe injection** (the primary deliverable): requires Playwright frame event expertise (frontend-minion) with edge runtime validation (edge-minion). The solution is straightforward in concept (listen for frame events, inject autoconsent) but the devil is in the details: which events, when to register, how to deduplicate, how both code paths (binding vs polling) handle it.

2. **Sourcepoint opt-out failure** (diagnostic work): requires root cause analysis (debugger-minion). This is investigative -- the fix may be in timing, configuration, or may require a backlog item for an autoconsent rule update.

Only four specialists are needed for planning. security-minion, ux-strategy-minion, lucy, and margo participate in Phase 3.5 architecture review as mandatory reviewers but don't need to contribute to the planning phase -- the task is too narrowly scoped for their planning input to materially improve the plan.

### Scope

**In scope:**
- `src/consent.js`: Add frame event listener(s) to inject autoconsent into CMP iframes that load after the initial `page.frames()` snapshot
- `src/consent.js`: Sourcepoint opt-out failure investigation and fix (if root cause is in injection timing or message routing)
- Tests: consent.test.js for non-Playwright logic if test-minion recommends it; staging validation against 14-site test set
- Evolution log: `docs/evolution/0034-late-cmp-injection/` (or whatever the next number is)

**Out of scope:**
- Vendored autoconsent script changes (`src/vendor/autoconsent-script.js`)
- New CMP provider rules
- `src/capture.js` route handler (already fixed in PR #82)
- Consent timeout changes (stays at 8s)
- Polling loops (event-driven only per constraints)

### External Skill Integration

No external skills detected in project.
