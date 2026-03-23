ADVISE

- [testing]: `openapi.yaml` has 4 additional old URL occurrences in response schema examples (lines 1028-1031) that the plan does not instruct the agent to replace.
  SCOPE: `openapi.yaml` lines 1028-1031 (artifact URL examples in response schema)
  CHANGE: The task instruction for `openapi.yaml` must explicitly cover replacing the old URL in the response example block (`artifacts.screenshot`, `artifacts.html`, `artifacts.headers`, `verifyUrl`), not just removing the server entry at lines 16-17. Without this, the grep verification step will return 4 matches and the agent will correctly fail — but it will have no instruction for how to fix them.
  WHY: The grep verification command uses `--include='*.yaml'` and will catch these lines. The agent will hit an unresolvable failure because the task instructions only describe the server entry removal. The example values are cosmetically important (they appear in generated API reference docs) and should use the canonical production URL.
  TASK: Task 1

- [testing]: `isWrlCaptureUrl` in key-resolver.test.js tests path pattern matching only (not hostname), so replacing the host in those test inputs is a cosmetic update that does not break test semantics — but it is still the right change for consistency and to clear the grep check.
  SCOPE: `packages/verify/test/key-resolver.test.js` lines 46, 50, 64, 69, 81, 82
  CHANGE: No change needed to the plan itself — the replacements are correct and safe. This is a confirmation that the test logic does not depend on the specific hostname, so the replacements will not alter test behavior.
  WHY: Documenting this so the executing agent is not surprised that `isWrlCaptureUrl` passes with any hostname — the function tests URL path structure, not domain ownership.
  TASK: Task 1
