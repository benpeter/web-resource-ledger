ADVISE

---

- [testing]: The 8-test suite has no coverage for the `GET /v1/captures/{id}/artifacts/{name}` route — only the metadata endpoint is tested.
  SCOPE: `test/capture-retrieval.test.js` — artifact-serving route (`handleGetCaptureArtifact`)
  CHANGE: Add at minimum three artifact tests: (1) `artifacts/html` returns `Content-Type: text/plain` and `Content-Disposition: attachment` (the XSS-critical assertion); (2) `artifacts/screenshot` returns `Content-Type: image/png`; (3) `artifacts/wacz` returns 404 when wacz key is absent from the KV record (the optional-WACZ path). These are distinct from the metadata tests and belong in the same file or a named describe block.
  WHY: The plan identifies stored-XSS via `text/html` as a HIGH risk (Risk #1) and spends two tasks on it (Task 1 + Task 2). The only test that would catch a regression in the `Content-Type` override is a direct GET of the artifact route. The metadata endpoint tests (tests 1–8) never exercise `handleGetCaptureArtifact` at all. If the dispatch table is wrong or the html branch is removed, no test fails.
  TASK: Task 4

---

- [testing]: The artifact test for `headers` conditionality is noted as "belt-and-suspenders but not added" — but the plan does not explain what covers the case where `headers` key is absent from artifacts and the caller requests `artifacts/headers`.
  SCOPE: `test/capture-retrieval.test.js` — 404 for absent optional artifact
  CHANGE: Add one test: seed a KV record without a `headers` key in `artifacts`, then `GET /artifacts/headers`, assert 404 with RFC 9457 shape. This is the only way to verify the `record.artifacts?.[name]` undefined check in Task 2 actually returns 404 rather than throwing or returning a 500.
  WHY: Risk #4 in the plan acknowledges this path. The plan accepts skipping it "to avoid over-testing at MVP." That framing misunderstands the risk: this is not an edge case, it is a documented optional field. A crash or 500 here would be a visible production regression. The test is three lines.
  TASK: Task 4

---

- [testing]: The lifecycle smoke test appends `afterEach(() => fetchMock.deactivate())` but the smoke test describe block does not have a corresponding `afterEach` import — `afterEach` is not in the existing `capture-integration.test.js` imports.
  SCOPE: `test/capture-integration.test.js` — lifecycle smoke test describe block
  CHANGE: The Task 4 prompt instructs adding `afterEach` to the lifecycle smoke test but does not instruct adding `afterEach` to the vitest import line at the top of the file. Verify that `afterEach` is already imported; if not, the implementing agent must add it. The plan should make this explicit rather than leaving it as an inference.
  WHY: `capture-integration.test.js` currently imports `{ describe, it, expect, beforeEach, afterEach }` — afterEach IS present (line 2). However, the Task 4 prompt only says "add `env` to the cloudflare:test import if not already present" and "add `completeCapture` to kv imports." It does not mention that `afterEach` must be verified. A careful agent will catch this; an inattentive one will not. Adding an explicit check instruction costs nothing.
  TASK: Task 4

---

- [testing]: The `beforeEach` in `capture-retrieval.test.js` seeds SEED_ID as complete with WACZ present on every test. Test 6 (RFC 9457 404 for unknown ID) fetches a different ID (`cap_bbbb...`), so no WACZ interaction. But the test for "pending capture returns 404" is missing — the plan specifies this behavior in the handler (404 for `status !== 'complete'`) and in the verification steps, but there is no test that seeds a pending capture and asserts 404 from the retrieval endpoint.
  SCOPE: `test/capture-retrieval.test.js` — pending/failed capture returns static 404
  CHANGE: Add a ninth test (or expand the describe block to include it): seed SEED_ID as pending only (call `createCapture` but not `completeCapture`), then `GET /v1/captures/{SEED_ID}`, assert 404 with RFC 9457 shape and `Content-Type: application/problem+json`. This directly exercises the `record.status !== 'complete'` branch in `handleGetCapture`.
  WHY: The `status !== 'complete'` branch is the only non-trivial conditional in `handleGetCapture`. The verification steps list this as step 2 (manual check), but there is no automated test for it. The 404 behavior for pending captures is a design decision (ux-strategy-minion vs api-spec-minion conflict resolution) — it should have a test that would catch a regression if someone later changes the branch condition.
  TASK: Task 4

---

- [testing]: The `beforeEach` in the retrieval test file calls `env.KV.delete(...)` then re-seeds SEED_ID. With `isolatedStorage: false`, any test that modifies the SEED_ID key mid-test (none currently planned, but the smoke test in capture-integration could race) will corrupt state for subsequent retrieval tests if test files run in the same worker thread. This is a known caveat documented in the plan. The concern is that the plan does not instruct the implementing agent to add an `afterEach` cleanup to the retrieval tests — only `beforeEach`. If a test fails partway through and leaves unexpected state, the next test's `beforeEach` handles cleanup, which is acceptable. No change needed, but the implementing agent should be aware: the `beforeEach` delete-then-seed is the correct pattern and is consistent with `kv.test.js`. This is an APPROVE-level observation — confirming the plan's approach is sound.
  SCOPE: `test/capture-retrieval.test.js` — state isolation
  CHANGE: No change needed. Document as confirmed-correct pattern.
  WHY: Consistency with existing test patterns (`kv.test.js` uses the same beforeEach-delete approach). The plan's note about `isolatedStorage: false` is accurate.
  TASK: Task 4 (informational — no action required)
