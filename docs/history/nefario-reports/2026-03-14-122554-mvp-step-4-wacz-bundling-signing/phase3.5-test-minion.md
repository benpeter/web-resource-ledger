ADVISE

- [test-minion]: The global SIGNING_KEY binding in vitest.config.js will cause WACZ bundling to silently run during all 17 existing capture tests, but those tests' beforeEach only cleans up the fixed per-test-ID R2 prefix — not content-addressed .wacz objects at `captures/{sha256}.wacz`.
  SCOPE: `test/capture.test.js` beforeEach cleanup and `vitest.config.js` SIGNING_KEY binding
  CHANGE: Either (a) extend the existing capture test beforeEach to also delete any .wacz objects by listing objects with prefix `captures/` and filtering for `.wacz` suffix, or (b) use a test-scoped SIGNING_KEY that produces a deterministic waczHash so the cleanup path is predictable. Without this, .wacz objects accumulate across tests and can pollute R2 state for subsequent tests since `isolatedStorage: false`.
  WHY: `isolatedStorage: false` means R2 state is shared between all tests in a run. Content-addressed .wacz keys (`captures/{sha256}.wacz`) are unpredictable and the existing cleanup loop only targets three fixed paths. Accumulated .wacz objects do not break existing assertions (the existing tests do not assert absence of .wacz), but they create state bleed that will interact with Task 4's wacz tests — particularly the "WACZ written to R2" test that lists `captures/*.wacz` objects.
  TASK: Task 4 (pipeline integration) and Task 1 (vitest.config.js SIGNING_KEY)

- [test-minion]: The ZIP determinism golden test is listed as a risk mitigation ("build WACZ from same artifacts twice, assert identical bytes") but is not included in any task's test case list.
  SCOPE: `test/wacz.test.js` test case list in Task 4
  CHANGE: Add an explicit test case: call `buildWacz` twice with identical inputs (same url, same captureDate fixed string, same artifact bytes), assert the returned `waczBytes` are byte-identical. This validates the determinism guarantee that the content-addressed R2 key depends on.
  WHY: fflate's zipSync is documented as deterministic with fixed entry order and level 0, but the WARC records use `crypto.randomUUID()` for WARC-Record-ID, which means consecutive calls to `buildWarc` will produce different bytes. The WACZ bytes will NOT be deterministic across calls. The risk table acknowledges this but the test case list omits the golden test — so the implementation will go unverified. Either the WARC UUIDs must be seeded/fixed for a given capture (use captureDate-derived deterministic IDs) or the golden test must be dropped from the risk mitigation table with an explanation.
  TASK: Task 3 (WARC construction) and Task 4 (integration tests)

- [test-minion]: The graceful degradation path (SIGNING_KEY absent -> WACZ skipped) is not tested in `test/wacz.test.js`.
  SCOPE: `test/wacz.test.js` test case list in Task 4
  CHANGE: Add one test case that calls `performCapture` (or `buildWacz` directly) in an env where SIGNING_KEY is absent or invalid, and asserts that (a) the capture still completes with status `complete`, (b) no .wacz object exists in R2, and (c) the KV record has no `wacz` field. This is the primary resilience guarantee of the graceful degradation decision.
  WHY: Conflict 4 resolution specifically chose graceful degradation over hard failure because "a misconfigured secret should not prevent all captures." Without a test that validates this path, a future refactor could accidentally make WACZ mandatory and no existing test would catch the regression. The acceptance criteria do not cover this path, but it is explicitly load-bearing for the production deployment model.
  TASK: Task 4 (pipeline integration and WACZ integration tests)

- [test-minion]: Task 3 has no test file — the WARC, CDXJ, and signing modules are constructed and validated only indirectly through the integration test in Task 4.
  SCOPE: `src/warc.js`, `src/cdxj.js`, `src/wacz.js` — no unit tests specified
  CHANGE: This is an advisory, not a blocker. The integration tests in Task 4 will exercise these modules through a full `performCapture` call. However, if the integration test fails, diagnosing whether the fault is in WARC construction, CDXJ indexing, ZIP assembly, or signing will be difficult. Consider adding at minimum a few unit-level assertions in `test/wacz.test.js` that test `buildWarc` and `buildCdxj` directly (WARC header format, SURT transform correctness, line count in CDXJ output). Given the WACZ spec correctness risk in the risk table, direct unit tests for WARC record structure would significantly reduce debugging cost.
  WHY: Manual WARC construction is flagged as "MEDIUM" risk in the plan ("WARC format incorrectness"). The only verification is through integration test unzip inspection. A malformed WARC-Record-ID format or missing `\r\n` between records will produce a WACZ that passes the "contains expected files" test but fails spec validation.
  TASK: Task 3 (WACZ construction pipeline) and Task 4 (integration tests)
