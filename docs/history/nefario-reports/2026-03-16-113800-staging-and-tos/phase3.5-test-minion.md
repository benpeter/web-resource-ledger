## Verdict: ADVISE

Two unit test gaps and one smoke test design issue.

---

- [testing]: The `log.test.js` fixture hardcodes `applicationName: 'wrl'` and will fail after Task 1b changes `log.js` to read `env.APPLICATION_NAME || 'wrl'`.
  SCOPE: `test/log.test.js` -- "sends correct POST with Content-Type, Authorization, and body shape" assertion at line 74
  CHANGE: The `mockEnv` fixture in `log.test.js` does not include `APPLICATION_NAME`. After the Task 1b change, `applicationName` will resolve to `undefined || 'wrl'` = `'wrl'` (test still passes). However, the test does not cover the non-default case. Add a second test variant: pass `{ ...mockEnv, APPLICATION_NAME: 'wrl-staging' }` and assert `applicationName` is `'wrl-staging'`. Without this, the parameterization change has no unit test coverage.
  WHY: The "Cross-Cutting Coverage" section of the plan states "Existing unit tests in `test/` will catch regressions from index.js and verify-page.js changes" -- the same confidence is claimed implicitly for log.js. Currently no test verifies the env-parameterized path. A future change that broke `env.APPLICATION_NAME` reading would not be caught.
  TASK: Task 1 (log.js parameterization)

- [testing]: The `health.test.js` and `security-headers.test.js` tests assert the existing health response shape and headers, but neither will assert the new `legal` field or the `Link` header added by Task 3. The plan's verification step 7 is a grep on source -- not a test assertion.
  SCOPE: `test/health.test.js` and `test/security-headers.test.js`
  CHANGE: Task 3 adds two observable behaviors: (1) `GET /health` response body gains a `legal` object with `terms` and `policy` URI fields; (2) every response gains a `Link` header with `rel="terms-of-service"`. Both should be asserted in existing test files -- `health.test.js` for the body shape, `security-headers.test.js` for the Link header (the `expectSecurityHeaders` helper is the right place). The task prompt instructs the agent to modify `src/index.js` but not the test files. This leaves two new behaviors unguarded.
  WHY: If the Link header `set()` call is accidentally placed inside a conditional block, or the health response merges incorrectly, no unit test catches it. The smoke test only runs against a live deployed environment, not in CI against PRs.
  TASK: Task 3 (index.js changes)

- [testing]: The smoke test check for `rel="terms-of-service"` in the `Link` header (Task 2b, check 2) is sequenced as a validation of the health response. The health response is fetched once in check 1 and the variable reused. The plan states "On the health response, verify these headers" -- this is correct, but it depends on Task 3 being deployed. If Task 3 is not yet deployed (e.g., a partial deploy scenario), check 2 will fail and the output will look like a security header misconfiguration rather than a missing feature. The script should emit a distinct FAIL message that names `Link: rel="terms-of-service"` explicitly so operators can distinguish "headers missing" from "ToS not deployed".
  SCOPE: `scripts/smoke-test.sh` -- check 2 failure message
  CHANGE: In the smoke script, when the Link header check fails, emit: `FAIL: Link header missing rel="terms-of-service" (ToS wiring not deployed?)` rather than a generic header-missing message. This is a message clarity issue, not a logic change -- no structural change to the check order needed.
  WHY: Staging is a new environment; the first several deploys are likely to be partial or incomplete. Ambiguous failure messages add operator debugging time, which defeats the purpose of a fast-feedback smoke test.
  TASK: Task 2 (smoke test script)
