---
reviewer: test-minion
verdict: ADVISE
---

ADVISE

- [testing]: The changelog script prompt requires `set -euo pipefail` but uses arithmetic in a way that may silently exit when counters are zero -- the `$((...))` form is safe here, but if the agent reaches for `((var++))` (common when following bash counter patterns), `set -e` will kill the process the first time a variable is 0.
  SCOPE: `scripts/changelog-verify.sh`
  CHANGE: The prompt should explicitly specify `VAR=$((VAR + 1))` syntax (not `((VAR++))`) for any counters, OR note the known pitfall in the style guidance so the implementing agent avoids it.
  WHY: This is a silent failure: the script exits cleanly with code 0 when the counter expression evaluates to 0 under `set -e`, producing an empty or partial changelog with no error. The risk is low given the script is short, but it is non-obvious and has caused bugs in this repo's test scripts before.
  TASK: Task 2

- [testing]: The changelog script's correctness is verified only by manual inspection (`./scripts/changelog-verify.sh patch` and eyeballing output). The synthesis document defers "post-execution test validation" to Phase 6 but gives no specifics on what assertions Phase 6 would make.
  SCOPE: `scripts/changelog-verify.sh`, Verification Step 3
  CHANGE: Add at minimum two assertions to Verification Step 3: (a) the script exits 0 on a clean repo, and (b) the generated CHANGELOG.md prepends a new section (check that the first line matches `## v<next-version>`). These are fast, scriptable checks that catch the most common failure modes -- the script silently producing no output or appending instead of prepending.
  WHY: Without assertions, "run and eyeball" catches nothing in CI. The script's two most likely bugs (wrong insertion point, empty commit group silently omitted) both produce visually plausible but wrong output.
  TASK: Task 2

- [testing]: The workflow's `npm test` step runs the full `packages/verify` test suite. That suite currently includes `verify.test.js`, `cms-chain.test.js`, and `rfc3161.test.js`, which depend on real binary fixtures (`digicert-tsa-token.der`) and cryptographic operations. If any of these tests require network access or fixture regeneration, the CI publish step will be blocked. This is a pre-existing risk, not introduced by this plan, but the plan provides no verification that the test suite passes in a clean GitHub Actions runner.
  SCOPE: `.github/workflows/publish-verify.yml` step 4, `packages/verify/test/`
  CHANGE: Add a note to Verification Step 4 (or the Task 1 success criteria) that the test suite must be confirmed to pass in a GitHub Actions runner before the first real tag push -- either by pushing a `verify/v*` tag to a fork/test branch, or by reviewing whether any test depends on local filesystem state not present in the runner.
  WHY: The current test suite has not been run in GitHub Actions (the package was manually published). A silent test dependency on local filesystem state (e.g., cert paths relative to a developer machine) would fail publish on the first real release with no obvious cause.
  TASK: Task 1

- [testing]: The EPUBLISHCONFLICT handling uses `grep -q 'EPUBLISHCONFLICT\|cannot publish over'` on the npm output. This pattern is undocumented behavior -- npm error strings can change between npm versions, and the workflow uses `node-version-file: '.nvmrc'` (Node 22 / npm 10.x). There is no test or assertion that this grep pattern actually matches what npm 10.x emits on a version conflict.
  SCOPE: `.github/workflows/publish-verify.yml` publish step
  CHANGE: Add a verification note that the EPUBLISHCONFLICT error string was confirmed against npm 10.x output (or expand the grep pattern to also match the error code string `E409` which is the HTTP layer error). This is a one-time verification, not a recurring test, but it should be documented as done before the workflow is relied upon.
  WHY: If the grep pattern misses the actual npm 10.x error string, a re-push of the same version will fail the CI workflow with a non-zero exit, which is the opposite of the intended "exit cleanly" behavior. This failure would be hard to diagnose without knowing the actual npm error text.
  TASK: Task 1
