# Margo Review: E2E Test Suite (Playwright)

## Verdict: ADVISE

The plan is well-scoped overall. Good decisions were made on webhook receiver strategy (httpbin.org over a dedicated Worker), skipping the admin sessions endpoint (no production code for tests), and sequential execution (eliminates flakiness for negligible time cost). The conflict resolutions demonstrate genuine YAGNI discipline. The single new dependency (`@playwright/test`) is justified.

Three concerns, all non-blocking:

---

- [simplicity]: Task 2 and Task 3 overlap significantly on verification endpoint testing
  SCOPE: `tests/e2e/capture-verify.spec.js` (Task 2, steps 6-7) and `tests/e2e/verify-page.spec.js` (Task 3)
  CHANGE: Task 2 steps 6 and 7 already test `GET /v1/verify/{id}` for both JSON and HTML responses. Task 3 re-tests the same JSON endpoint (with near-identical assertions: `verified: true`, `checks` non-empty, `signing` object) and re-tests the HTML page in a browser. Remove the JSON verification from Task 2 entirely (keep it only in Task 3), and remove the HTML page navigation from Task 2 (Task 3 owns browser testing). Task 2 should end at step 5 -- verifying the capture record itself. This eliminates duplicate assertions and gives each test file a single responsibility.
  WHY: Duplicate assertions across test files increase maintenance cost without improving coverage. When the verify endpoint changes, two test files break instead of one. The plan already acknowledges "the browser-based verification page test is its own file because it requires Chromium" -- follow that logic and let Task 3 own all verification-endpoint testing.
  TASK: Tasks 2 and 3

---

- [simplicity]: `helpers/hmac.js` may be dead code depending on ping response shape
  SCOPE: `tests/e2e/helpers/hmac.js` (Task 1)
  CHANGE: Task 7 prompt (line 487) explicitly acknowledges that the ping response may NOT include raw signature headers, in which case "the HMAC test may need to be limited to verifying ping success/failure rather than signature validation." If the ping response does not expose the signed payload and headers, `helpers/hmac.js` will be written, shipped, and never called. The Task 1 implementer should check the `handlePingWebhook` response shape in `src/webhooks.js` before creating this helper. If the ping response does not include signing details, skip the helper file entirely and document the limitation in Task 7 instead.
  WHY: Writing a helper that is unused is accidental complexity -- dead code that must be maintained and that confuses future readers who expect it to be exercised. Better to check first and create on demand.
  TASK: Tasks 1 and 7

---

- [simplicity]: Test list diverges from the original issue in two ways that should be explicitly acknowledged
  SCOPE: Final Test List (plan lines 43-53) vs. original prompt (lines 3-8)
  CHANGE: (1) "Scheduled capture" (original test 3) was dropped because the feature does not exist in the codebase -- correct decision, no action needed, but the plan should state this explicitly so the reader does not wonder if it was forgotten. (2) "Account Key Rotation" (Task 4) was added, replacing a test that was in the original spec. The justification (it exercises a critical security workflow via API key auth) is reasonable, but it should be called out as a substitution rather than discovered by diffing. Add a brief "Changes from Original Spec" section to the plan documenting both the drop and the addition with rationale.
  WHY: Traceability. When the plan diverges from the spec, silent divergence looks like oversight. Explicit divergence looks like a considered decision. This is documentation, not a code change.
  TASK: Plan-level (no task number)

---

## What the plan gets right

- **Webhook receiver**: httpbin.org + ping endpoint over a dedicated Worker is the correct call. Avoids a new Worker project, KV namespace, deployment pipeline, and secrets -- significant operational burden for testing one feature.
- **No production code for tests**: Rejecting `POST /v1/admin/sessions` is textbook YAGNI.
- **Sequential execution**: `workers: 1` eliminates flakiness from rate limit contention and shared state for ~60 seconds of additional wall time. Good tradeoff.
- **Single dependency**: `@playwright/test` is the only addition. No test frameworks, assertion libraries, or helper packages beyond what Playwright provides.
- **Task count proportionality**: 9 tasks for 6 tests + config + CI + docs is proportional. No bloated task decomposition.
- **Complexity budget**: One new devDependency (cost: 1), no new services, no new abstraction layers. Total budget spend is minimal.
