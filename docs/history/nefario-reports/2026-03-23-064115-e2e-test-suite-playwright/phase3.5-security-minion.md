# Security Review: E2E Test Suite (Playwright)

## Verdict: ADVISE

The plan is well-structured from a security standpoint. The most important recommendations from previous security review were adopted: dynamic per-run tenants, no long-lived test credentials, no PR-triggered execution, HMAC independent verification, and admin key scoped to the GitHub staging environment. The following are refinements, not blockers.

---

- [security]: The `.auth-state.json` file written by global setup contains both the raw API key and the admin key; if a test crashes mid-run and the process emits a stack trace to stdout, the key values could appear in CI logs.
  SCOPE: `tests/e2e/global-setup.js`, `tests/e2e/global-teardown.js`, Task 1
  CHANGE: Store only the `keyHash` and `tenantId` in `.auth-state.json`. Pass the raw API key via a short-lived environment variable set within the same process rather than writing it to disk. If writing to disk is necessary for inter-process communication (teardown reads the file), ensure the API key field is named clearly and the file permissions are set to `0600` (`fs.chmodSync`). The teardown only needs `keyHash` to call `DELETE /v1/admin/keys/{keyHash}` -- it does not need the raw key.
  WHY: The state file persists on disk between setup and teardown, and the Playwright HTML report artifact upload step runs after teardown. If teardown fails (accepted risk per plan), the file may persist in the GitHub Actions workspace. Artifact uploads do not include arbitrary workspace files, but any step that echoes workspace contents (e.g., a debug `ls -la` added later) could expose the key. File permissions mitigate accidental exposure.
  TASK: Task 1

- [security]: The `E2E_ADMIN_KEY` is passed as a plain environment variable to the entire Playwright process; the plan instructs global-setup to also store it in the auth state file (`adminKey` field, per Task 4 context: "The admin API key is in the auth state file as `adminKey`").
  SCOPE: `tests/e2e/global-setup.js`, `tests/e2e/key-rotation.spec.js`, Task 1, Task 4
  CHANGE: Do not write `adminKey` to `.auth-state.json`. The admin key has broader permissions than a test tenant key (it can create and revoke keys for any tenant). Test files that need admin operations should read `process.env.E2E_ADMIN_KEY` directly -- Playwright test files have access to the process environment. Writing the admin key to a file that is gitignored but still on-disk and potentially readable by all test specs increases the blast radius if the file is accidentally logged or committed.
  WHY: The admin key controls the entire staging tenant key infrastructure. Scope it to the minimum surface: process environment only, not persisted to disk.
  TASK: Task 1, Task 4, Task 6

- [security]: The webhook test generates a 32-byte hex secret with `crypto.randomBytes(32).toString('hex')` and passes it to the WRL Worker, which then uses it to sign ping delivery. The plan notes that HMAC verification may not be possible if the ping response does not include the sent signature headers.
  SCOPE: `tests/e2e/helpers/hmac.js`, `tests/e2e/webhook-lifecycle.spec.js`, Task 7
  CHANGE: The independent HMAC verification in `hmac.js` is the right approach -- do not import from `src/webhook-signing.js`. However, the test must assert the HMAC result as `valid === true` and not silently skip it. If the ping response does not include the signature headers (the plan allows for this as a documented limitation), the test must explicitly `expect.fail()` or `test.skip()` with a clear message rather than silently passing. A passing test that did not verify HMAC is worse than a skipped test with an explanation.
  WHY: The HMAC verification is the security-critical assertion in the webhook test. A "soft" skip path where the test passes without actually verifying the signature would give false confidence in the signing implementation.
  TASK: Task 7

- [security]: The CI workflow is instructed to look up the `actions/upload-artifact` SHA independently ("look up the current v4 SHA -- verify against the tag before using"). This is the correct approach, but the instruction places SHA resolution responsibility on the iac-minion agent at task execution time.
  SCOPE: `.github/workflows/e2e-tests.yml`, Task 8
  CHANGE: The iac-minion should verify the SHA against the GitHub API or the action's release tag before writing it to the workflow file, not just use whatever SHA it has in training data. Concretely: `gh api repos/actions/upload-artifact/git/ref/tags/v4 --jq '.object.sha'` gives the tag's commit SHA. The workflow file comment must include the human-readable version tag alongside the SHA (matching the pattern in existing workflows, e.g., `# v4.x.x`).
  WHY: A wrong or stale SHA in a pinned action either breaks the workflow (if the SHA doesn't exist) or silently uses an unintended version (if SHAs were reused across tags, which GitHub does not do but tooling mistakes can). The explicit verification step closes the gap.
  TASK: Task 8

- [security]: The plan notes that orphaned test tenants (prefixed `e2e-`) are an accepted low-severity risk. This is reasonable, but the orphaned tenants have revoked API keys (teardown deletes the key), meaning the tenant record exists in D1 with no active key -- inert from an auth perspective.
  SCOPE: `tests/e2e/global-teardown.js`, Task 1
  CHANGE: No code change required. Confirm in the README (Task 9) that orphaned tenant records with no active keys pose no auth risk -- the tenant ID namespace is not a secret and the quota/config data is staging-only. The troubleshooting note about `e2e-` tenant cleanup is sufficient. This is informational only.
  WHY: Documenting the actual risk level prevents future over-engineering of cleanup logic.
  TASK: Task 9

---

## What the plan gets right

- Dynamic test tenant with automatic teardown -- no long-lived test credentials in CI.
- Admin key scoped to the GitHub `staging` environment with protection rules -- not available to PR workflows or non-main branches.
- No PR-triggered execution -- eliminates the attack surface where a PR could trigger tests with access to staging secrets.
- HMAC verification using an independent implementation -- correctly refuses to trust the production signing code to verify itself.
- `contents: read` only permission on the CI workflow -- minimal GitHub token scope.
- All existing actions SHA-pinned per project pattern.
- httpbin.org used only for ping endpoint (no sensitive data sent to third party).
