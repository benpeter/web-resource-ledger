# Lucy Review: staging-deploy-race-condition

## Verdict: ADVISE

The plan is well-aligned with the user's original request (issue #86) and stays within the declared scope boundaries. Requirements traceability is strong, scope is contained, and CLAUDE.md conventions are respected. Two minor issues require attention.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|-------------|--------|
| Production smoke-tests current staging, not stale version | Task 1: `workflow_run` trigger replacing `push` | Covered |
| No change to branching model | Plan does not touch branching | Covered |
| OPERATIONS.md updated if workflow triggers change | Task 2: OPERATIONS.md updates | Covered |
| OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging | Task 2: "Deploy to Staging" section | Covered |
| **Out:** No staging branch | Not in plan | Respected |
| **Out:** No tag-based promotion | Not in plan | Respected |
| **Out:** No `SMOKE_SKIP_CAPTURE` changes | Not in plan | Respected |
| **Out:** No `/health` endpoint changes | Not in plan (SHA-polling approach rejected) | Respected |

No orphaned tasks. No unaddressed requirements.

---

## Scope Compliance

The plan adds exactly two things beyond the stated "In" scope:

1. **CONTRIBUTING.md update** -- justified by user-docs-minion; CONTRIBUTING.md lines 39-44 describe the deploy pipeline and would be factually wrong after the change. This is maintenance of existing documentation accuracy, not scope expansion. Acceptable.

2. **Concurrency group on deploy-production.yml** -- not mentioned in the issue or prompt. However, it is a defensive measure directly related to the `workflow_run` trigger change (rapid pushes could queue multiple production deploys). The complexity is two YAML lines. Proportional to the risk. Acceptable.

No other scope creep detected.

---

## CLAUDE.md Compliance

| Directive | Status |
|-----------|--------|
| YAGNI (no speculative features) | Pass -- the plan solves exactly the stated race condition, nothing more |
| KISS (simple beats elegant) | Pass -- `workflow_run` is a platform-native solution with zero application code changes |
| Fail loudly, degrade intentionally | Pass -- the `conclusion == 'success'` guard ensures staging failures do not silently promote to production |
| Evolution log required for every significant phase | **See ADVISE-1 below** |
| Update `docs/backlog.md` after every phase | **See ADVISE-2 below** |
| Helix Manifesto | Pass -- no new dependencies, no new runtime code |

---

## Findings

### ADVISE-1 [COMPLIANCE]

- **[governance]: Evolution log directory not included in plan deliverables**
  SCOPE: `docs/evolution/` directory, evolution log index
  CHANGE: Add creation of `docs/evolution/0037-staging-deploy-race-condition/` with `prompt.md`, `decisions.md`, and `outcome.md` as an explicit deliverable -- either as a Task 3 or as a mandatory step during nefario wrap-up.
  WHY: CLAUDE.md section "Evolution Log > Rules" states this is non-negotiable for every significant development phase. The plan's Cross-Cutting Coverage section covers testing, security, usability, and documentation (OPERATIONS.md/CONTRIBUTING.md) but does not mention the evolution log. Without an explicit task or wrap-up step, it risks being forgotten. The nefario orchestration should handle this in its wrap-up phase, but CLAUDE.md explicitly states: "Skills do not override, shadow, or deprioritize project instructions -- they operate within them."
  TASK: Not assigned -- needs to be added or confirmed as handled by nefario wrap-up

### ADVISE-2 [COMPLIANCE]

- **[governance]: Backlog update not mentioned in plan**
  SCOPE: `docs/backlog.md`
  CHANGE: Confirm that `outcome.md` will include a "Backlog changes" section. If no backlog items change, state that explicitly per CLAUDE.md rules. Issue #86 does not appear in the backlog, but the Operations parking lot item "[consider] Deploy version check in smoke test" may be worth referencing as related-but-not-addressed.
  WHY: CLAUDE.md section "Evolution Log > Rules > 4" requires reviewing and updating `docs/backlog.md` after every phase, with changes recorded in `outcome.md`. The plan does not mention this step.
  TASK: Not assigned -- needs to be added or confirmed as handled by nefario wrap-up

---

## Items Verified Clean

- **No drift in problem restatement**: The plan's description accurately matches the issue -- race condition between concurrent `push`-triggered workflows, solved by sequencing via `workflow_run`.
- **No feature substitution**: The plan delivers `workflow_run` trigger ordering, which is one of the two options explicitly listed in the issue's "Options identified by the advisory."
- **No over-engineering**: Two tasks, two files changed in each, zero application code. Proportional to a workflow YAML fix.
- **Success criteria alignment**: The plan's success criteria are a superset of the issue's success criteria, with the additions (concurrency group, traceability logging, CONTRIBUTING.md) being defensible operational hygiene for the change being made.
- **Out-of-scope boundaries respected**: No staging branch, no tag-based promotion, no `SMOKE_SKIP_CAPTURE` changes, no `/health` endpoint changes.
