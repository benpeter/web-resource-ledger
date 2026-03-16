# Meta-Plan: Staged Fallback for Capture Timeout (#53)

## Context

This task implements partial capture recovery for Cloudflare Workers browser rendering. When a page fails to reach `networkidle` within the 25s `NAV_TIMEOUT_MS`, instead of failing entirely, the system should capture whatever rendered after `DOMContentLoaded` and mark the capture as `status: 'complete'` with `renderQuality: 'partial'`. This already went through an advisory phase with 4 specialists (iac-minion, security-minion, api-design-minion, ux-strategy-minion) who reached unanimous consensus on the approach.

The implementation touches 7 files across capture pipeline, data layer, API surface, WACZ bundling, verification UI, and OpenAPI spec. The total scope is well-defined -- the advisory phase produced a concrete file-by-file implementation plan. The remaining planning question is: how to decompose this into agent tasks with correct file ownership, sequencing, and testing strategy.

## Planning Consultations

### Consultation 1: Capture Pipeline Design
- **Agent**: iac-minion
- **Planning question**: Given the 30s `ctx.waitUntil` hard limit, how should the timeout fallback in `defaultRenderer()` be structured? Specifically: (a) What timeout values for `page.screenshot()` and `page.content()` on the partial path (advisory suggests 1.5s each)? (b) Should the deadline tracking use a simple `Date.now()` comparison or an `AbortController` pattern? (c) How should we handle the case where `document.readyState` is NOT `complete` or `interactive` (i.e., DOMContentLoaded hasn't fired) -- the advisory says still fail, but should we also capture what we can for debugging? (d) How does the partial path interact with the existing `limitExceeded` check? Context files: `src/capture.js` (lines 287-365), `src/kv.js` `completeCapture()`.
- **Context to provide**: The full `defaultRenderer()` function, the `performCapture()` orchestration, and the Cloudflare Workers 30s budget constraint.
- **Why this agent**: iac-minion understands Cloudflare Workers runtime constraints, ctx.waitUntil budgets, and the operational implications of tight timing in edge compute.

### Consultation 2: API Contract Extension
- **Agent**: api-spec-minion
- **Planning question**: The advisory defines adding `RenderInfo` schema, extending `CaptureRecord`, `CaptureSummary`, and `VerificationCapture` in openapi.yaml with `renderQuality` and `render` metadata. (a) Should `renderQuality` be a top-level field on `CaptureRecord`/`CaptureSummary` or nested under a `render` object? (b) What is the minimal schema for `RenderInfo` -- the advisory suggests `{ quality: 'full'|'partial', note?: string }`. Is `note` the right name, or should it be `detail`? (c) Should the version bump be 0.3.0 (already set) or 0.3.1? (d) How should the `VerificationCapture` in the verify endpoint surface `renderQuality`? Context: the openapi.yaml schemas for `CaptureRecord` (line 204), `CaptureSummary` (line 258), and `VerificationCapture` (need to locate).
- **Context to provide**: Current openapi.yaml schema definitions, the advisory's RenderInfo recommendation, existing API response shapes in `src/index.js`.
- **Why this agent**: api-spec-minion is the specialist for OpenAPI schema design, versioning decisions, and ensuring contract consistency across endpoints.

### Consultation 3: Test Strategy
- **Agent**: test-minion
- **Planning question**: The existing tests use injectable renderers (`stubRenderer`, `timeoutRenderer`) to test capture outcomes. For partial capture testing: (a) What shape should the "partial timeout renderer" have -- a renderer that throws `TimeoutError` but returns a `page` object with `evaluate()`, `screenshot()`, and `content()` available? The current renderer interface returns `{ screenshot, html }` on success or throws on failure -- partial capture changes this contract. (b) Do we need a new integration test file (`test/partial-capture.test.js`) or extend `test/capture.test.js`? (c) What test scenarios are essential: timeout + DOMContentLoaded passed, timeout + DOMContentLoaded NOT passed, timeout + screenshot fails on partial path, timeout + html capture fails on partial path, partial capture KV record shape, partial capture in list/get/verify endpoints? (d) How do we test the 28s deadline enforcement without actually waiting 28s?
- **Context to provide**: `test/capture.test.js` (the injectable renderer pattern), `test/kv.test.js`, `test/capture-retrieval.test.js`, the new renderer contract needed for partial capture.
- **Why this agent**: test-minion designs test strategies that cover edge cases without over-testing. The renderer interface change is the hardest design decision -- it affects how all capture tests work.

## Cross-Cutting Checklist

- **Testing**: INCLUDE -- test-minion is Consultation 3 above. The renderer interface change and new test scenarios are critical planning inputs.
- **Security**: EXCLUDE from planning. The advisory already had security-minion review the approach (unanimous approve). No new attack surface: `renderQuality` is server-set (never from client input), `page.evaluate()` runs a simple `document.readyState` check, and the `categorizeError` change removes the `retryable` flag for timeout errors that become partial captures. Security review happens at Phase 3.5 as always.
- **Usability -- Strategy**: EXCLUDE from planning. The advisory already had ux-strategy-minion review the approach (unanimous approve). Key decision: verification page stays green, render quality is informational not a finding. No new planning question remains. ux-strategy-minion participates at Phase 3.5.
- **Usability -- Design**: EXCLUDE from planning. The only UI change is a single "Capture note" line on the verification page. No visual hierarchy, interaction design, or component design questions. Verify at Phase 3.5.
- **Documentation**: INCLUDE at Phase 8 (post-execution), not planning. The advisory captures the rationale. software-docs-minion and user-docs-minion document at execution time.
- **Observability**: INCLUDE as part of Consultation 1 (iac-minion). The advisory specifies logging timeout rate, renderQuality, and time budget distribution. This is operational concern tightly coupled to the capture pipeline, not a separate planning question.

## Anticipated Approval Gates

1. **API schema design (RenderInfo schema + field placement)** -- MUST gate. The `renderQuality`/`render` field placement in `CaptureRecord`, `CaptureSummary`, and `VerificationCapture` is a contract decision that affects all downstream tasks (KV layer, HTTP handlers, verification page, tests). Hard to reverse once consumers depend on the shape. High blast radius (4+ tasks depend on it).

2. **Renderer interface change for partial capture** -- This is embedded in the capture.js implementation. The advisory already locked the approach (catch TimeoutError, check readyState, capture with short timeouts). This is a standard engineering decision, not a gate -- the advisory served as the gate.

3. **No gate on WACZ/verify-page changes** -- These are additive, low blast radius, and easy to reverse.

## Rationale

Three specialists are consulted for planning because this task has three distinct design decisions that benefit from domain expertise:

1. **iac-minion**: The timing constraints of the Cloudflare Workers 30s budget make the capture pipeline design operationally critical. Getting the timeout values and deadline tracking right is the difference between partial captures working reliably and causing more failures than they prevent.

2. **api-spec-minion**: The field placement in the OpenAPI schema is a contract decision that locks in the API shape. The advisory recommended an approach but left some flexibility in naming and nesting. Getting this right before implementation prevents breaking changes.

3. **test-minion**: The injectable renderer pattern must change to support partial capture testing. This is a cross-cutting concern that affects test architecture, not just test cases.

Other specialists are excluded from planning because the advisory phase already resolved their concerns. Security, UX strategy, and observability all contributed to the advisory and reached consensus. Their concerns are incorporated into the implementation spec. They participate in Phase 3.5 architecture review as always.

## Scope

**In scope**:
- `src/capture.js`: TimeoutError catch, readyState check, partial screenshot/HTML capture, WACZ skip, deadline tracking
- `src/kv.js`: `completeCapture()` extension for `renderQuality` and `render` metadata
- `src/index.js`: Surface `renderQuality`/`render` in `handleGetCapture`, `handleListCaptures`, `handleVerifyCapture`
- `src/wacz.js`: Add `captureQuality` to `datapackage.json` for full captures
- `src/verify-page.js`: "Capture note" line for partial captures
- `openapi.yaml`: `RenderInfo` schema, extend `CaptureRecord`, `CaptureSummary`, `VerificationCapture`
- Tests for all new paths
- Observability: structured log entries for timeout rate, renderQuality, time budget

**Out of scope**:
- Retry logic for partial captures
- Queue-based capture processing (R16 in backlog)
- Configurable timeout values
- Any changes to the `DOMContentLoaded` threshold
- Changes to the happy path (full capture flow)

## External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/` directories found in the project. No user-global skills found at `~/.claude/skills/`.
