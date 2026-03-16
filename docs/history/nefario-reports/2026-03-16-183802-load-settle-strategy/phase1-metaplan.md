# Meta-Plan: Switch navigation wait strategy from networkidle to load + settle delay

## Task Analysis

This is a focused, surgical change to the browser navigation strategy in `src/capture.js`. The core problem: `waitUntil: 'networkidle'` wastes 20s waiting for tracking scripts that never go quiet, leaving insufficient time budget for the rest of the capture pipeline. The fix: switch to `waitUntil: 'load'` with a ~3s post-load settle delay.

### Change surface

- **`src/capture.js`**: 3 touch points
  - Line 84: `NAV_TIMEOUT_MS` from 20000 to 25000
  - Line 403: `page.goto()` waitUntil from `'networkidle'` to `'load'`, plus a post-load `setTimeout` or `page.waitForTimeout` settle delay (~3s)
  - Line 482: `waitUntilReached: 'networkidle'` metadata updated to `'load'`
  - Line 400: Comment about timing budget needs updating
  - Line 508: `categorizeError` timeout message references "20 seconds", needs updating to match new timeout
- **`test/capture.test.js`**: Several test renderers and assertions reference `'networkidle'`
  - Line 601-605: `enrichedStubRenderer` returns `waitUntilReached: 'networkidle'`
  - Line 751: assertion `expect(record.render.waitUntilReached).toBe('networkidle')`
  - Lines 141, 290, 713: error message assertions reference "20 seconds"
- **`test/fixtures.js`**: Multiple renderer stubs return `waitUntilReached: 'networkidle'`
  - Lines 42, 55, 67: three renderer fixtures

### Constraints

- Must fit within 30s `ctx.waitUntil` hard limit: NAV_TIMEOUT_MS (25s) + settle (~3s) cuts into the consent (8s) + screenshot + WACZ budget. The settle delay must be inside the NAV_TIMEOUT_MS budget, not additive.
- Partial capture fallback (lines 404-452) must remain functional -- it catches `TimeoutError` when navigation exceeds the timeout.
- The settle delay occurs after the `load` event fires but before taking screenshots -- it gives late-rendering JS time to paint.

---

## Planning Consultations

### Consultation 1: Timing budget and settle delay implementation

- **Agent**: debugger-minion
- **Planning question**: Given the 30s `ctx.waitUntil` hard limit and the pipeline stages (navigation + settle, consent dismissal at 8s, screenshots, WACZ build, R2/KV writes), what is the optimal settle delay duration and where exactly should it be placed in `defaultRenderer()`? Should the settle delay use `page.waitForTimeout()`, `page.waitForLoadState('networkidle')` with a short timeout as a "best effort" settle, or a custom idle detection approach? What are the tradeoffs of each approach for ad-heavy sites like tagesschau.de and adobe.com?
- **Context to provide**: Full `defaultRenderer()` function (lines 343-495 of `src/capture.js`), the 30s budget breakdown (NAV + consent 8s + post-processing), the specific failure mode (tracking scripts keep connections alive indefinitely).
- **Why this agent**: debugger-minion has expertise in root cause analysis and performance profiling. The core question here is a runtime behavior problem -- understanding when "visually loaded" actually occurs for ad-heavy pages and choosing the right mechanism to detect it.

### Consultation 2: Test fixture and assertion updates

- **Agent**: test-minion
- **Planning question**: The change from `networkidle` to `load` affects render metadata values in test fixtures (`test/fixtures.js`) and several assertions in `test/capture.test.js`. Should the `enrichedStubRenderer` and consent renderers in fixtures.js simply change `waitUntilReached` from `'networkidle'` to `'load'`, or should we add a new renderer variant that reflects the settle-delay behavior? Are there any test gaps -- specifically, should we add a test that verifies the settle delay is applied (e.g., a renderer that simulates post-load settling)?
- **Context to provide**: `test/fixtures.js` (all renderers), `test/capture.test.js` (partial capture tests, full capture render metadata tests, error message assertions referencing "20 seconds").
- **Why this agent**: test-minion ensures the test changes are complete and don't introduce coverage gaps, and can identify whether the settle delay itself needs test coverage.

---

## Cross-Cutting Checklist

- **Testing**: Include test-minion for planning (Consultation 2 above). The change modifies test fixtures and assertions, and the settle delay mechanism may need its own test coverage.
- **Security**: Exclude security-minion from planning. This change does not alter attack surface, authentication, user input handling, or dependency chain. The cross-domain navigation block, scheme guard, and all security constraints remain untouched. Security review can be deferred to Phase 3.5 mandatory review.
- **Usability -- Strategy**: Exclude ux-strategy-minion from planning. This is a backend timing optimization with no user-facing interface change. The end result (faster, more reliable captures) is universally positive. UX review is better served at Phase 3.5 where it can confirm no user-visible behavior regression.
- **Usability -- Design**: Exclude. No UI components involved.
- **Documentation**: Exclude software-docs-minion and user-docs-minion from planning. The change is internal to one function. The file-level comment at the top of `capture.js` mentions the timing budget and will need a minor update, but that's execution work, not a planning question. Phase 8 post-execution can handle any doc needs.
- **Observability**: Exclude observability-minion from planning. The existing structured logging (`capture.success`, `capture.partial`, `capture.stage.fail`) already captures `durationMs` and `render` metadata. The `waitUntilReached` field in render metadata will naturally reflect the change. No new log fields or metrics are needed.

---

## Anticipated Approval Gates

**None.** This change has:

- **Low blast radius**: Only `defaultRenderer()` in `src/capture.js` is modified, plus test fixture alignment.
- **Easy to reverse**: Changing a constant and a `waitUntil` parameter back is trivial.
- **Clear best practice**: The `load` + settle pattern is well-established for ad-heavy sites; `networkidle` being unsuitable for pages with tracking scripts is a known Playwright limitation.
- **No downstream dependents**: No other tasks are gated on this decision.

The plan should proceed without blocking gates. Phase 3.5 architecture review (mandatory reviewers: security, test, ux-strategy, lucy, margo) provides the safety net.

---

## Rationale

This is a focused, well-scoped change with a clear root cause and a known solution pattern. Only two specialists are needed for planning:

1. **debugger-minion** brings the performance/runtime expertise to recommend the specific settle delay implementation -- the core technical question. There are multiple valid approaches (fixed timeout, best-effort networkidle with short timeout, requestAnimationFrame-based idle detection) and the right choice depends on understanding the actual behavior of ad-heavy pages on Cloudflare Workers.

2. **test-minion** ensures the test fixture changes are complete and identifies whether the settle mechanism itself warrants test coverage.

Other specialists (security, ux-strategy, docs, observability) will participate in Phase 3.5 review or Phase 5-8 post-execution. Including them in planning would not materially improve the plan for this narrowly-scoped change.

---

## Scope

**In scope:**
- `page.goto()` `waitUntil` parameter change from `'networkidle'` to `'load'`
- Post-load settle delay implementation (~3s, mechanism TBD based on debugger-minion input)
- `NAV_TIMEOUT_MS` value change (20000 -> 25000, or justified alternative)
- Timing budget comment updates in `defaultRenderer()`
- `categorizeError()` timeout message update if NAV_TIMEOUT_MS changes
- `waitUntilReached` metadata update in render result object
- All test fixture and assertion updates to reflect the new strategy
- File-level comment update for timing budget

**Out of scope:**
- Consent dismissal logic (`consent.js`)
- WACZ/signing pipeline
- Partial capture fallback rewrite (the existing fallback remains as safety net)
- General capture parameterization
- New logging fields or observability changes

---

## External Skill Integration

No external skills detected in project. The global `juli` skill is unrelated (personal conversations).
