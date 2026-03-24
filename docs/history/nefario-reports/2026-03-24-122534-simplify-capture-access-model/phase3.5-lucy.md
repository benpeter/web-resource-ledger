# Lucy Review: simplify-capture-access

## Verdict: ADVISE

The plan is well-aligned with the user's intent and demonstrates disciplined scope containment. Two minor issues require attention before or during execution; neither is blocking.

---

## Requirements Traceability

| # | Requirement (from prompt.md) | Plan element | Status |
|---|------------------------------|--------------|--------|
| 1 | Auth gate only on `GET /v1/captures` (list) | Task 1, step 1 | Covered |
| 2 | Remove auth from individual capture access | Task 1, steps 1-2 | Covered |
| 3 | Remove share token system (endpoint, module, tests) | Task 1 steps 3-5, Task 2 step 1 | Covered |
| 4 | Remove share token cleanup from cron | Task 1, step 4 | Covered |
| 5 | Update SECURITY.md | Task 4, step 1 | Covered |
| 6 | Update OpenAPI spec | Task 4, step 3 | Covered |
| 7 | Fix verify-page.spec.js E2E test | **See finding 1** | Implicit only |
| -- | Subsumes #162 (WACZ public access) | Task 1 makes all artifacts public | Covered |
| -- | Partially addresses #167 (verify page rendering) | Cross-cutting notes acknowledge this | Covered |

## Findings

### Finding 1 -- TRACE: verify-page.spec.js E2E test not explicitly addressed

**Requirement:** Prompt item 7 says "Fix verify-page.spec.js E2E test -- currently failing because of this."

**Plan:** Task 2's "What NOT to do" says "Do NOT modify `test/e2e/` tests -- E2E tests are separate concern." No task explicitly addresses the E2E test.

**Assessment:** I verified the E2E test code (`test/e2e/verify-page.spec.js`). It tests `/v1/verify/{id}` (already public) and does not reference share tokens or auth-gated capture endpoints. The test's failure is likely caused by the verify page's runtime JavaScript failing to fetch capture data from auth-gated endpoints. Making those endpoints public (Task 1) would fix the page behavior, which fixes the E2E test transitively.

This is probably correct but it is an implicit fix, not an explicit one. The prompt explicitly lists it as a deliverable. The plan should acknowledge this: "verify-page.spec.js will pass without code changes because the verify page's JS fetches from `/v1/captures/{id}` which becomes public."

**Recommendation:** Add a sentence to the Cross-Cutting Coverage section or Task 1's verification steps confirming that the E2E test is expected to pass after the access model change, with no test code modifications. If the test is actually broken for a different reason, this will surface it during verification rather than silently dropping a stated requirement.

### Finding 2 -- COMPLIANCE: Evolution log not included in task list

**Directive:** CLAUDE.md "Evolution Log" section, rules 1-6. "Every significant development phase must be documented in `docs/evolution/`. This is non-negotiable."

**Plan:** No task creates the evolution log directory, `prompt.md`, `decisions.md`, or `outcome.md`. No task updates `docs/evolution/README.md` or `docs/backlog.md`.

**Assessment:** This is likely handled by the nefario orchestration framework in its wrap-up phase (phase 8+), not by the delegated tasks. The CLAUDE.md precedence section warns that "the skill didn't tell me to" is not a valid reason to skip a project requirement. The orchestration must ensure evolution log entries are created.

**Recommendation:** No change to the delegation plan itself -- but the orchestrator must confirm that evolution log creation (directory, prompt.md, decisions.md, outcome.md, README.md index update, backlog.md review) happens during wrap-up. This is a reminder, not a plan defect.

---

## Scope Assessment

The plan is a model of scope discipline. It explicitly defers rate limiting, `X-Robots-Tag`, error field auditing, and capture ID generation changes -- all of which were raised by the security assessment but are separate concerns. The "What NOT to do" sections in each task are thorough and correct.

Task count (4) is proportional to the problem: one for core code, one for tests, one for the verify CLI package, one for documentation. No task inflation.

## CLAUDE.md Compliance

| Directive | Status |
|-----------|--------|
| YAGNI | Compliant -- plan removes code, adds nothing speculative |
| KISS | Compliant -- the `env._captureAuth` null-check pattern is simpler than the alternative |
| Lean and Mean | Compliant -- net deletion of ~500+ lines of code and tests |
| Fail loudly | N/A -- no new error handling paths |
| Evolution log | See finding 2 -- orchestrator responsibility |
| Helix Manifesto | Aligned -- "more code, less blah blah" via deletion |

## Proportionality

Problem complexity: medium (auth model change across worker, CLI package, tests, docs).
Plan complexity: medium (4 tasks, clear boundaries, mechanical execution).
Proportional: yes.

---

**Summary:** Plan aligns with the user's stated intent. Scope is well-contained. Two minor issues: (1) the E2E test fix from prompt item 7 should be explicitly acknowledged as a transitive fix rather than silently dropped, and (2) the orchestrator must ensure evolution log entries are created during wrap-up per CLAUDE.md requirements.
