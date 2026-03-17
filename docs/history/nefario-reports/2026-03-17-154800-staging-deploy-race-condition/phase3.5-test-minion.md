ADVISE

- [testing]: The CI workflow skips tests for docs-only changes, but this PR modifies a workflow YAML file — not application code and not `.md` or `docs/` — so the change-detection heuristic will classify it as a code change and run the full unit and integration test suite, which tests nothing about the workflow itself.
  SCOPE: `.github/workflows/ci.yml` change-detection step (lines 23-28, 51-57)
  CHANGE: The skip heuristic (`grep -qvE '\.md$|^docs/'`) does not account for `.github/workflows/` changes. This is not a bug to fix in this PR — it's a gap to document. Add an explicit comment in the CI workflow that workflow YAML changes always run the full test suite even though those tests don't validate workflow logic. This prevents a future contributor from adding `.github/workflows/` to the skip pattern, which would cause this PR's type of change to skip tests entirely.
  WHY: Low risk now, but the skip heuristic is already slightly wrong for this change class. Leaving it undocumented invites a future "optimization" that silently removes the only CI safety net (unit tests) from workflow-only PRs.
  TASK: Not a blocker. Optional improvement to CI documentation — could be a follow-up issue rather than in-scope for this PR.

- [testing]: The plan's post-merge verification (step 4: push-to-main test, step 5: staging failure test) has no tracking mechanism — if these are not done before closing the issue, the fix is unverified in production.
  SCOPE: Verification steps 4 and 5 in the delegation plan
  CHANGE: Add these two checks as explicit checklist items in the PR description or a GitHub issue comment so they are visible as required follow-up before closing issue #86. The approval gate on Task 1 covers pre-merge YAML review; the post-merge live test is the only real validation that the `workflow_run` trigger fires correctly. Without a tracking artifact, it's easy to close the issue after merge and before the first push confirms the chain works.
  WHY: `workflow_run` triggers have a known GitHub quirk: they only activate when the workflow file exists on the default branch. A branch-merged workflow change does not activate `workflow_run` until it lands on `main`. The first push to main after merge is the first real test. If that first push fails to chain (wrong workflow name, YAML syntax error that doesn't surface in review), the issue will appear fixed while the race condition remains.
  TASK: Task 1 (approval gate) and the post-merge verification steps.

The plan's decision to rely on YAML review plus live validation rather than automated workflow testing is correct given the lack of workflow-testing frameworks in this project. The five critical YAML correctness points (conclusion guard, head_sha ref, always() pattern, workflow name string match, concurrency group) are all explicitly called out in the Task 1 prompt — that is the right approach for this class of change. No additional automated tests are needed.

APPROVE on blocking grounds.
