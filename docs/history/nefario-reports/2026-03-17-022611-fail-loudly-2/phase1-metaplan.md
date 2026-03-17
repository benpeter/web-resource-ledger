# Meta-Plan: Eliminate Silent Catch Blocks

## Planning Consultations

#### Consultation 1: Catch Block Audit and Error Handling Patterns
- **Agent**: debugger-minion
- **Planning question**: Audit every `catch` block in `src/` (excluding `src/vendor/`) and classify each into one of three categories: (1) already handles correctly (logs error or handles a specific named error type), (2) silent swallow that needs fixing, (3) intentional degradation that just needs better status distinction. For each category-2 and category-3 block, recommend the specific fix -- what should be logged, what error information should be captured, and what status value should be returned. Pay special attention to the `log.js` file itself, which has a `.catch(() => {})` and a bare `catch { return; }` -- these are meta-logging failures and need careful treatment (infinite recursion risk if log() tries to log its own failures).
- **Context to provide**: All source files in `src/` (wacz.js, capture.js, consent.js, signing.js, cdxj.js, ip-hash.js, index.js, log.js, verify.js, verify-page.js, url-validation.js, kv.js). The CLAUDE.md "Fail loudly, degrade intentionally" principle. The context from issue #66 (TSA error was invisible). The existing `timestampStatus` values in wacz.js (`'present'`, `'error'`, `'absent'`).
- **Why this agent**: Root cause analysis and error classification is debugger-minion's core expertise. They can distinguish between catch blocks that are correctly handling specific error types vs. those that are silently swallowing unexpected failures. The log.js case requires understanding recursion risk.

#### Consultation 2: Observability for Error Paths
- **Agent**: observability-minion
- **Planning question**: For each catch block that currently swallows errors silently, what log event should be emitted? Define the event name, severity level (Coralogix 3=info, 4=warn, 5=error), subsystem, and structured fields. Also: should the existing `log.js` fire-and-forget pattern (`.catch(() => {})` on the fetch, and bare `catch { return; }` wrapping the whole function) be changed, given that logging failures are currently completely invisible? What are the tradeoffs of adding `console.error` as a fallback vs. the risk of noise in production?
- **Context to provide**: `src/log.js` (the logging module), existing log events in capture.js (e.g., `capture.tsa_fail`, `capture.wacz_fail`), the Coralogix severity scale, the project's use of Coralogix for structured logging.
- **Why this agent**: Observability-minion understands structured logging patterns and can design log events that are operationally useful -- not just "error happened" but events with enough context to diagnose the issue without code-reading.

#### Consultation 3: API Surface for timestampStatus
- **Agent**: api-design-minion
- **Planning question**: The `timestampStatus` field currently uses `'present'`/`'absent'` and will add `'error'`. Where should this three-way status surface in the API? Currently `timestampStatus` is stored in `record.wacz.timestampStatus` in KV but is NOT exposed in the verify API response (`handleVerifyCapture` in index.js) or the capture retrieval response (`handleGetCapture`). The verify response does expose `signing.timestamp` (present when TSA succeeded) and the timestamp check as `status: 'skip'` (when TSA was absent). Should `timestampStatus` be added as a field? Should the verify page's JavaScript distinguish between "TSA not configured" (skipped) and "TSA configured but failed" (error) visually? What is the minimal change that gives operators the signal they need?
- **Context to provide**: `src/index.js` (handleVerifyCapture and handleGetCapture), `src/verify-page.js` (the timestamp check rendering), `src/wacz.js` (timestampStatus semantics), KV record shape from `src/kv.js`.
- **Why this agent**: API-design-minion can determine the minimal, backward-compatible way to surface the three-way status without breaking existing consumers.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The catch block changes affect error handling paths that are currently untested (by definition -- silent swallowing means the test suite never asserts on error behavior). test-minion should identify which error paths need new test coverage and whether existing tests need updating for the `timestampStatus` rename from `'absent'` to `'skipped'`.
- **Security**: Exclude for planning. The changes are in error handling paths only -- no new attack surface, no auth changes, no user input handling changes. Security-minion will review in Phase 3.5 as a mandatory reviewer.
- **Usability -- Strategy**: Include (mandatory). The verify page needs to communicate the three-way timestamp status to end users. ux-strategy-minion should advise whether operators and end users need different signals (operators care about "error vs. skipped"; end users may only care about "present vs. not present"). However, this is a minor UI text change and can be folded into the api-design-minion consultation rather than a standalone consultation.
- **Usability -- Design**: Exclude for planning. The verify page changes are textual (check description and detail text), not visual/interaction design changes.
- **Documentation**: Include (mandatory). The `timestampStatus` semantics change (`'absent'` becomes `'skipped'`) is a behavioral contract change. software-docs-minion should note what documentation needs updating, but this is straightforward enough to handle in execution rather than needing a planning consultation.
- **Observability**: Include -- covered by Consultation 2 above.

### Anticipated Approval Gates

1. **Catch block classification and fix plan** (debugger-minion + observability-minion output combined): This is the key design decision -- which catch blocks get logging, which get status differentiation, which are left as-is. MUST-gate because all downstream implementation depends on getting this classification right, and misclassifying a catch block (e.g., adding logging to a hot-path catch that fires thousands of times) could cause operational issues.

No other gates anticipated -- once the classification is agreed, implementation is mechanical.

### Rationale

This task is primarily a code quality / operational observability improvement. The core challenge is not the implementation (adding `await log(env, ...)` calls is straightforward) but the **classification**: which catch blocks are genuinely silent-swallowing problems vs. which are intentional degradation that just needs better status values vs. which are correctly handling specific error types already. Getting this wrong means either (a) missing a silent swallow (the incident repeats) or (b) adding logging to a catch that fires legitimately on every request (noise).

The three specialists chosen cover the three dimensions of the problem:
- **debugger-minion**: Which catches are broken? (root cause)
- **observability-minion**: What should we log? (signal design)
- **api-design-minion**: How do we surface the status? (contract design)

### Scope

**In scope:**
- Audit and fix all `catch` blocks in `src/` (excluding `src/vendor/` -- third-party code)
- Add logging to catch blocks that currently swallow errors silently
- Change `timestampStatus` semantics: `'absent'` (no TSA_URL configured) becomes `'skipped'`, `'error'` (TSA configured but failed) is the new addition (already implemented in wacz.js), `'present'` (TSA succeeded) stays
- Surface three-way timestampStatus in API responses and verify page
- Add `console.error` or `console.warn` fallback to `log.js` catch blocks
- Update verify-page.js timestamp check rendering to distinguish skip vs. error

**Out of scope:**
- Changes to `src/vendor/` files (autoconsent is third-party)
- New retry logic or circuit breakers
- Alerting rules in Coralogix
- Changes to the capture pipeline flow
- Any changes to `src/consent.js` catch blocks inside `frame.evaluate()` -- these are browser-context code that runs inside the page, not server-side code, and the `.catch(() => {})` pattern is correct for detached-frame handling

### External Skill Integration

No external skills detected in project.
