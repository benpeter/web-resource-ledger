ADVISE

- [testing]: `npm run lint:api` uses Redocly's default ruleset with 2 problems already suppressed; there is no `.redocly.yaml` config file, so the rule set is not pinned and future Redocly updates could silently change what passes.
  SCOPE: `openapi.yaml` / `npm run lint:api`
  CHANGE: The task prompt says "run `npm run lint:api` to validate the spec" as if it is a contract test. It is only a linter. It will not catch semantic drift between the spec and the code (e.g. a wrong status code example string, a missing 503 on the right endpoint). Document this limitation in the verification plan (Phase 6 step 1) so the reviewer knows what "lint passes" does and does not guarantee.
  WHY: Redocly linting validates OpenAPI structural correctness -- not that the spec matches the implementation. The 13 drift items being fixed in Task 1 were all invisible to the linter (the spec was already passing before this PR). Treating a lint pass as "spec is accurate" gives false confidence. The approval gate reviewer needs to know they must also cross-check the specific code paths listed in the task prompt.
  TASK: Task 1, Phase 6 step 1

- [testing]: There are no tests that will catch if the Link header is missing from a response definition after this change -- spec changes are invisible to the existing Vitest suite.
  SCOPE: `openapi.yaml` -- Link header propagation to ~25 response definitions (Task 1, item 5)
  CHANGE: The verification plan (Phase 6 step 2) runs `npm test` as a regression check, but the existing tests do not validate spec conformance. This is fine for this PR (it is documentation-only), but the Phase 6 post-execution checklist should explicitly state that `npm test` catches code regressions, not spec accuracy. The manual review step (Phase 6 step 3) is the actual verification mechanism for the Link header propagation.
  WHY: The existing Vitest suite (`test/security-headers.test.js`) validates that the Link header is present on live responses, but it does not parse or validate the OpenAPI spec. If Task 1 adds the Link header to 20 of 25 response definitions and misses 5, `npm test` will pass regardless. This is a known limitation, not a blocker -- just needs to be called out explicitly so the approval gate reviewer does a manual count of response definitions.
  TASK: Task 1 (approval gate review)

- [testing]: The README verification instruction in Task 2 ("read the code at src/signing.js:73-74...") is a manual spot-check, not a machine-verifiable step, and the specific line numbers may have drifted from the actual code since the audit.
  SCOPE: `README.md` -- Key Rotation section (Task 2)
  CHANGE: The approval gate reviewer for Task 2 should be directed to verify claims against file content, not line numbers. Instruct the executing agent to confirm line references are still correct before writing documentation. This is already partially mitigated by the approval gate, but noting the line-number fragility helps the gate reviewer know what to spot-check.
  WHY: Line numbers embedded in prompts become stale immediately if any other PR touches the source files. The claims about behavior (keyId computation, archive lookup, fallback) are what matter; the line number references are navigation hints only. The gate reviewer needs to validate behavior claims, not line numbers.
  TASK: Task 2 (approval gate)

- [testing]: No test covers the `archivedAt` field format in the signing-keys endpoint response (`test/signing-key.test.js:156` checks `keyId`, `algorithm`, and `publicKey` but not `archivedAt`), yet the README Task 3 documentation will describe the response shape as `{ keys: [{ keyId, algorithm, publicKey, archivedAt }] }`.
  SCOPE: `test/signing-key.test.js` / `GET /.well-known/signing-keys` response shape
  CHANGE: This is a pre-existing test gap, not introduced by this PR. No change needed for this documentation-only PR. Flag as a backlog item if the new README documentation ever needs to be treated as an authoritative contract.
  WHY: The documentation task (Task 2) will explicitly document `archivedAt` as part of the response shape. If the field is later removed or renamed from the actual endpoint, no test will catch the drift until a user notices. Low risk for now since key rotation tests (`test/key-rotation.test.js:88`) do verify `archivedAt` exists on the raw KV record. Not a blocker.
  TASK: Task 2 (informational only, consider backlog)
