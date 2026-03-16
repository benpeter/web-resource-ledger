# Margo Review -- docs-drift-audit

## Verdict: ADVISE

The plan is well-scoped to the original request (fix documentation drift against PRs #54-57). Task count (5) is proportional to the problem. Conflict resolutions are sensible -- the "keep in place with status headers" decision is the KISS choice. The "What NOT to do" guardrails in each prompt are a good anti-scope-creep mechanism. Two approval gates for the OpenAPI spec and the security-relevant key rotation rewrite are justified.

Three concerns, all non-blocking:

---

- [simplicity]: Task 3 and Task 4 have an unnecessary sequential dependency
  SCOPE: Task 3 (README secrets/staging/headers) and Task 4 (CONTRIBUTING.md)
  CHANGE: Task 4 says it is blocked by Task 3 because it "should align with README staging docs." These tasks modify different files. The Task 4 prompt already contains all the information the agent needs -- it does not reference README.md output. Run Task 4 in parallel with Task 3 (Batch 2), eliminating Batch 3 entirely. This saves one full execution round.
  WHY: The dependency is justified as "should align" but the CONTRIBUTING.md prompt is self-contained. If alignment matters, the Phase 5 code review catches inconsistencies. Artificial sequencing adds wall-clock time for no risk reduction.
  TASK: Task 4

- [simplicity]: Link header repetition across ~25 response definitions is accidental complexity in the spec
  SCOPE: openapi.yaml -- Task 1, item 5 (TermsLink header on all responses)
  CHANGE: Consider whether a single `x-headers` or description-level note ("All responses include the Link header") is sufficient rather than mechanically adding the header to every response definition. If tooling (Prism, Schemathesis) requires it on each definition to validate, then the repetition is essential and should proceed as planned. If tooling does not require it, a single note reduces maintenance surface.
  WHY: Risk 2 in the plan already identifies this as tedious and error-prone. 25 identical header entries will drift again on the next response addition. If a spec-level annotation achieves the same tooling outcome, prefer that.
  TASK: Task 1

- [simplicity]: Task 5 could be absorbed into Task 2 or Task 3 since it is a 4-line change across two files
  SCOPE: PRODUCT.md and docs/MVP.md status headers
  CHANGE: Adding a blockquote to two files is a 2-minute edit. A dedicated task with its own agent delegation, prompt, and deliverables section is overhead disproportionate to the change size. Consider folding it into Task 3 (which already touches documentation files and has no approval gate) or even making it a manual edit during the verification phase.
  WHY: The complexity budget of a separate agent delegation (prompt construction, context loading, output review) exceeds the complexity of the change itself. Five tasks where four would suffice.
  TASK: Task 5
