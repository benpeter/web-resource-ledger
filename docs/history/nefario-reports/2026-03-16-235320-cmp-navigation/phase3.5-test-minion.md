## Verdict: APPROVE

### Assessment

The plan's decision to not add automated tests is correct and well-reasoned. My review confirms it.

**Why no unit test is appropriate here**

The changed logic lives inside `defaultRenderer` — the real Playwright-backed renderer. Every test in `capture.test.js` passes a `stubRenderer` (or similar test double) that bypasses `defaultRenderer` entirely. A unit test for the route handler narrowing would have to mock `route.request().frame()`, `page.mainFrame()`, and the surrounding Playwright context. That test would validate the mock wiring, not the actual behavior. The project CLAUDE.md explicitly warns against this: "Mocking out the browser is like testing an HTTP server without sending requests."

**Why the existing tests are adequate for regression detection**

The existing suite (`npx vitest run`) covers the orchestration layer around `defaultRenderer` — KV status transitions, artifact writing, error classification, partial captures, stage timings. None of those paths change in this PR. Running the full suite after the edit confirms no orchestration regression. That is the correct scope for what automated tests can verify here.

**Why the security boundary change is acceptably verified without automation**

The TOCTOU protection is preserved by construction: the new code only removes the block for non-main-frame navigations. The `isMainFrame` guard is only `true` when `page` is non-null and `frame() === page.mainFrame()`. All other paths (null page, frame() throws, iframe) fall through to `route.continue()`. The logic is simple enough that code review is a reliable verification method for correctness. The manual verification procedure (capture a CMP-iframe site, confirm consent iframe loads, confirm main-frame cross-domain is still blocked) directly exercises the boundary that automated tests cannot reach.

**One acknowledged gap**

The plan correctly logs this as risk #3 (LOW): no automated regression test means a future developer could remove the `isMainFrame` check silently. The mitigation — clear inline comments explaining why the check exists, plus a backlog item for an E2E staging test — is proportionate to the risk level for a single-tenant system where staging validation is part of the deployment process.

The backlog item for the E2E staging test should specify the test cases clearly: (1) cross-origin iframe loads successfully, (2) main-frame cross-domain navigation is blocked, (3) autoconsent detects and dismisses a CMP. This makes the future test well-defined.

**No changes requested.** The plan is sound.
