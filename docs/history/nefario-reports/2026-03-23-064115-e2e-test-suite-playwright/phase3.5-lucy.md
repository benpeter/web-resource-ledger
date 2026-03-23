# Lucy Review: E2E Test Suite (Playwright)

## Verdict: ADVISE

The plan is well-aligned with the user's intent and makes sound scope decisions (rejecting admin sessions endpoint, skipping OAuth, choosing httpbin.org over a dedicated Worker). The conflict resolutions are justified by CLAUDE.md principles (YAGNI, lean and mean). Five warnings follow.

---

### Warnings

- [convention]: Test directory uses `tests/e2e/` but the project convention is `test/` (singular)
  SCOPE: All file paths in Tasks 1-9 (`tests/e2e/playwright.config.js`, `tests/e2e/*.spec.js`, etc.)
  CHANGE: Use `test/e2e/` instead of `tests/e2e/`. The existing project has `test/` (singular) with `test/integration/` as a subdirectory. Unit tests live in `test/*.test.js`, integration tests in `test/integration/*.test.js`. The e2e suite should follow: `test/e2e/*.spec.js`.
  WHY: Every existing test file and both vitest configs (`vitest.config.js` setupFiles `./test/apply-migrations.js`, `vitest.integration.config.js` include `test/integration/**/*.test.js`) use `test/` singular. Introducing `tests/` creates a split convention that will confuse contributors and complicate glob patterns in future tooling.
  TASK: Tasks 1-9 (all file paths, config references, .gitignore entries, npm script, CI workflow, README)

- [traceability]: Issue #105 success criterion "scheduled capture" has no test and no explicit acknowledgment of omission
  SCOPE: Prompt success criterion 4: "Test: scheduled capture creation -> cron trigger fires -> new capture appears in list"
  CHANGE: Add a brief note in the plan's "Decisions" section documenting that the scheduled capture test is omitted because the scheduled capture feature does not exist in the codebase (no cron handler, no `/v1/captures/schedule` endpoint). This is a correct omission but should be stated explicitly so the gap is traceable.
  WHY: The prompt lists 6 specific tests as success criteria. The plan delivers 6 tests but substitutes "Account Key Rotation" and "Public Evidence Verification" for "Scheduled Capture" and "Share Link" without explicitly noting that two of the original six criteria are unimplementable. Silent substitution looks like drift even when it is the right call. Making it explicit protects the plan from being flagged later as incomplete.
  TASK: N/A (plan-level documentation, not a task)

- [traceability]: Issue #105 success criterion "webhook retry on 5xx" is narrowed to ping-only without explicit acknowledgment
  SCOPE: Prompt success criterion 5: "Test: webhook delivery on capture completion -> retry on 5xx failure -> successful delivery on retry"
  CHANGE: The plan's Task 7 tests webhook CRUD and ping delivery (including failure detection at 503), but does not test the async retry-on-failure path (delivery on capture completion -> 5xx -> retry -> success). The "Important notes on HMAC verification" section partially addresses this but should be elevated to the Decisions section with a clear statement: async retry delivery is excluded because it requires either an inspectable webhook receiver or queue manipulation, and the ping endpoint covers the critical signing and delivery mechanics synchronously.
  WHY: Same reasoning as above -- the original request specifically asked for retry testing. Documenting the narrowing as a deliberate decision prevents it from appearing as an oversight.
  TASK: Task 7

- [convention]: `.gitignore` additions should match existing patterns
  SCOPE: Task 1, step 8: "Add to `.gitignore`: `tests/e2e/.auth-state.json` and `test-results/` and `playwright-report/`"
  CHANGE: Beyond the path rename (`test/e2e/` not `tests/e2e/`), verify that `test-results/` and `playwright-report/` are placed under the existing comment structure in `.gitignore`. The current `.gitignore` is organized by category (Dependencies, Wrangler, Secrets, OS, Editor, Docs, Logs, Environment). Playwright artifacts should get their own section or be placed under a logical grouping.
  WHY: Minor, but the existing `.gitignore` is well-organized. Appending three unrelated entries at the bottom without a comment degrades readability. Consistent with CLAUDE.md's "Intuitive, Simple & Consistent" principle.
  TASK: Task 1

- [scope]: Task 3 (Public Evidence Verification) partially duplicates Task 2 (Capture and Verify)
  SCOPE: `test/e2e/verify-page.spec.js` vs `test/e2e/capture-verify.spec.js`
  CHANGE: Task 2 already tests `GET /v1/verify/{id}` with both `Accept: application/json` and `Accept: text/html` (steps 6-7). Task 3 repeats the JSON verification test and adds a browser-based page load plus a 404 test. Consider having Task 3 reuse the capture created in Task 2's test (via shared state) rather than creating another capture, or document why the duplication is intentional (test independence vs. execution cost). At minimum, remove the duplicate JSON verification assertions from Task 3 since Task 2 already covers them -- Task 3 should focus exclusively on the browser rendering and the 404 case.
  WHY: Each capture takes 10-30s of real browser rendering time on staging. Creating a second capture just to test the same verify endpoint adds ~20s to the suite for no additional coverage. With a 5-minute budget this matters.
  TASK: Tasks 2, 3

---

### Alignment Summary

| Issue #105 Success Criterion | Plan Coverage | Status |
|------------------------------|---------------|--------|
| Signup via OAuth -> API key -> capture -> verify -> WACZ | Task 2: capture -> verify (OAuth correctly excluded; WACZ download not tested -- verify endpoint returns verification data, not WACZ) | Partial -- WACZ download gap |
| Batch capture -> 207 -> poll statuses | Task 5 | Covered |
| Scheduled capture -> cron -> new capture | Not tested -- feature does not exist | Correct omission, needs documentation |
| Webhook delivery -> retry on 5xx -> success on retry | Task 7: webhook CRUD + ping + failure detection | Narrowed -- async retry excluded, needs documentation |
| Quota enforcement -> 429 -> upgrade guidance | Task 6 | Covered |
| Share link -> public verification -> signature validates | Task 3: public verification page (reframed from "share link") | Covered via reframing |

### Convention Compliance

- YAGNI: Plan correctly rejects admin sessions endpoint and dedicated Worker for webhooks.
- KISS: Single Playwright project, sequential execution, httpbin.org instead of custom infrastructure.
- Lean and Mean: One new devDependency (`@playwright/test`). Justified -- Playwright is the test runner.
- Fail Loudly: Global setup aborts on health check failure. Good.
- Test Real Boundaries: The entire suite exercises real HTTP, queue processing, R2, and crypto. Aligned with CLAUDE.md.
- Evolution Log: Not mentioned in the plan. The CLAUDE.md requires evolution log entries for every significant development phase. Nefario's wrap-up should handle this, but flagging for awareness.
