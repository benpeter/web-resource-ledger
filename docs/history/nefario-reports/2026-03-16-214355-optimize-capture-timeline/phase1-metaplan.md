## Meta-Plan

### Planning Consultations

#### Consultation 1: Adaptive settle delay design
- **Agent**: debugger-minion
- **Planning question**: Given the current `defaultRenderer()` in `src/capture.js` (lines 457-459: fixed 3s `SETTLE_DELAY_MS` via `setTimeout`), what is the best approach to make the settle delay adaptive based on actual network activity? Specifically: (a) What Playwright APIs are available for monitoring in-flight requests on `@cloudflare/playwright` (which is a subset of upstream Playwright)? (b) Should we poll `page.evaluate()` for pending network requests, use Playwright's `waitForLoadState('networkidle')` with a cap, or monitor the `response` event stream for quiet periods? (c) What are the edge cases -- pages with persistent connections (analytics beacons, websockets, ad trackers) that would prevent network idle from ever resolving? The goal is a 3s cap where pages that settle faster proceed earlier, without ever exceeding the current 3s worst case.
- **Context to provide**: `src/capture.js` (full file, especially lines 344-504 `defaultRenderer()`), the comment on line 401 explaining why `networkidle` was rejected for navigation, the response monitoring on lines 393-399
- **Why this agent**: Root cause analysis and Playwright runtime expertise. The debugger-minion understands the behavioral nuances of browser APIs and can identify which approach will work reliably on Cloudflare's constrained Playwright fork without introducing flaky timeouts.

#### Consultation 2: Error handling pattern for consent failures
- **Agent**: security-minion
- **Planning question**: The task requires wrapping `dismissCookieConsent(page)` in `defaultRenderer()` (line 474) with try/catch so that autoconsent bugs (like the TypeError on adobe.com) degrade to `consentStatus: 'failed'` instead of crashing the entire renderer. Currently, `dismissCookieConsent()` already has an internal try/catch (consent.js lines 62-70), but the adobe.com crash suggests the error originates before or after that boundary (possibly in `page.exposeBinding()` or during script injection). Two security questions: (1) Does wrapping consent in try/catch inside the renderer create any risk of masking errors that should legitimately abort the capture (e.g., page crash, context closed)? (2) Should the `consentStatus: 'failed'` path be distinguishable from `consentStatus: 'none'` in the WACZ evidence chain and `captureSettings`, so that an auditor can tell "consent was attempted but the library crashed" vs "no CMP was present"?
- **Context to provide**: `src/consent.js` (full file), `src/capture.js` lines 471-497 (consent call and screenshot logic), the OpenAPI `ConsentHandling` schema (openapi.yaml lines 84-105), the existing `captureSettings` builder (capture.js lines 154-163)
- **Why this agent**: The consent failure handling touches the evidence chain (WACZ, captureSettings) and error categorization. Security-minion ensures the degradation path doesn't silently swallow errors that should be visible, and that the audit trail remains trustworthy.

### Cross-Cutting Checklist

- **Testing**: Not needed for planning. The test changes are mechanical -- update `CONSENT_TIMEOUT_MS` expectations in fixtures, add a new test case for consent crash degradation, test adaptive settle with mock timing. Phase 6 (post-execution test execution) covers this. The execution agent can handle test updates directly.
- **Security**: INCLUDED as Consultation 2 above. The consent failure handling touches the WACZ evidence chain and error categorization.
- **Usability -- Strategy**: Not needed for planning. This task is a backend pipeline optimization with no user-facing UX changes. The API contract is unchanged (same fields, same semantics). The only observable difference is faster captures and a new `consentStatus: 'failed'` value that already exists in the schema. ux-strategy review of the plan in Phase 3.5 is sufficient.
- **Usability -- Design**: Not applicable. No UI changes.
- **Documentation**: Not needed for planning consultation. The OpenAPI spec update is mechanical (adding the `'failed'` consent result variant if not already present -- it already is in the enum). The evolution log is a post-execution deliverable. Phase 8 documentation covers this.
- **Observability**: Not needed for planning. No new log events or metrics are being added -- the existing `consentStatus`, `consentDurationMs` fields already capture what we need. The adaptive settle will use the existing `render.durationMs` and stage timing fields.

### Anticipated Approval Gates

**Zero approval gates expected.** This task has all three characteristics of a no-gate plan:

1. **Easy to reverse**: All changes are additive code modifications to two files (`consent.js` constant, `capture.js` try/catch + settle logic). A revert is one `git revert`.
2. **Low blast radius**: No downstream schema migrations, no API contract changes, no new endpoints. The OpenAPI enum already includes `failed`.
3. **Clear best practice**: The consent timeout value (2s) is backed by empirical data (slashdot.org CMP at 1.8s was the slowest observed; 6/7 sites had no CMP). The try/catch pattern is standard defensive programming. The adaptive settle approach has a hard cap at the existing 3s.

The execution plan may introduce an OPTIONAL gate if the debugger-minion's adaptive settle recommendation involves a novel approach, but given the constrained scope (3s cap, network quiet heuristic), this is unlikely.

### Rationale

This is a tightly scoped performance optimization with clear empirical backing. Only two specialists are needed for planning:

- **debugger-minion** is essential because the adaptive settle implementation requires knowledge of Playwright's network monitoring APIs on Cloudflare's runtime, and the wrong approach could introduce flakiness or exceed the `ctx.waitUntil` budget.
- **security-minion** is essential because the consent failure path touches the WACZ evidence chain -- a silent degradation that confuses "library crashed" with "no CMP detected" would undermine the product's core value proposition (trustworthy web evidence).

Other agents (test-minion, software-docs-minion, ux-strategy-minion) will participate in Phase 3.5 architecture review and post-execution phases, but their planning input would not improve the execution plan for this well-defined task.

### Scope

**In scope:**
- Reduce `CONSENT_TIMEOUT_MS` from 8000 to 2000 in `src/consent.js`
- Add try/catch around `dismissCookieConsent(page)` in `defaultRenderer()` so autoconsent crashes degrade to `consentStatus: 'failed'` with capture completing
- Replace fixed `SETTLE_DELAY_MS` with adaptive settle that monitors network activity, capped at 3s
- Update OpenAPI descriptions if the `failed` consent result semantics change
- Update tests in `test/capture.test.js` and `test/fixtures.js`

**Out of scope:**
- Per-request consent opt-in parameter
- Screenshot format changes (WebP)
- Session pool optimization
- Coralogix alerting rules
- Stage-level timing instrumentation (separate issue #75)

### External Skill Integration

No external skills detected in project.
