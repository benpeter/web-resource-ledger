# Lucy Review: staging-deploy-race-condition (Phase 5 -- Post-Implementation)

## Original Request (Issue #86)

Eliminate the race condition where `deploy-production.yml`'s `staging-smoke` job can test a stale staging deployment because both workflows trigger on `push: branches: [main]` concurrently.

### Stated Requirements

1. `deploy-production.yml` only runs after the staging deploy for the same commit completes successfully
2. No change to the branching model (single-branch, push-to-main)
3. OPERATIONS.md updated if workflow triggers change
4. OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

### Stated Exclusions

- No staging branch or tag-based promotion
- No `SMOKE_SKIP_CAPTURE` changes
- No `/health` endpoint changes

---

## VERDICT: ADVISE

The implementation correctly solves the core race condition. The `workflow_run` trigger, `conclusion == 'success'` guard, conditional `staging-smoke` job, and `head_sha` ref resolution are all correct. Documentation updates in OPERATIONS.md and CONTRIBUTING.md accurately reflect the new behavior. Two items from the approved synthesis plan were dropped during implementation without explanation.

---

## Requirements Traceability

| Requirement | Implementation | Status |
|---|---|---|
| Production only runs after staging succeeds | `workflow_run` trigger with `conclusion == 'success'` guard | PASS |
| No branching model change | No changes to branch structure | PASS |
| OPERATIONS.md updated for new triggers | "Deploy to Staging" section added; "Deploy to Production" rewritten; rollback section updated; staging env protection note updated | PASS |
| `workflow_dispatch` on staging documented | OPERATIONS.md "Deploy to Staging" section covers manual trigger via UI and CLI | PASS |
| Correct SHA for checkout | `inputs.ref \|\| github.event.workflow_run.head_sha \|\| github.sha` | PASS |
| `staging-smoke` conditional on trigger type | `if: github.event_name == 'workflow_dispatch'` on line 25 | PASS |
| `deploy` handles skipped `staging-smoke` | `always() && (...)` pattern on lines 38-42 | PASS |
| CONTRIBUTING.md updated | Full two-stage pipeline description on lines 39-47 | PASS |
| Coupling comment | Lines 6-7 document workflow name coupling | PASS |

No unaddressed requirements from the issue.

---

## Findings

### ADVISE-1 [TRACE] `deploy-production.yml` -- Missing concurrency group

CHANGE: The synthesis plan (Task 1, item 2) explicitly required a top-level `concurrency` block:
```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```
This was proposed by iac-minion to serialize concurrent production deploys when rapid pushes trigger multiple staging completions. The synthesis plan incorporated it. The plan-phase lucy review (Phase 3.5) accepted it as proportional scope. The implementation does not include it.

WHY: Without a concurrency group, two rapid pushes to `main` can result in two staging completions firing two concurrent production deploys. While unlikely for a solo developer, this is the exact class of race condition the issue is about -- and the synthesis plan explicitly included it as a defensive measure. The concurrency block was approved through the gate; dropping it silently is a traceability gap.

AGENT: iac-minion (execution)
FIX: Add after `permissions:` in `deploy-production.yml`:
```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

### ADVISE-2 [TRACE] `deploy-production.yml` -- Missing traceability logging step

CHANGE: The synthesis plan (Task 1, item 6) explicitly required a "Log deploy context" step at the start of the `deploy` job (before checkout):
```yaml
- name: Log deploy context
  run: |
    echo "Trigger: ${{ github.event_name }}"
    echo "Deploy ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}"
    echo "Staging run: ${{ github.event.workflow_run.html_url || 'N/A (manual dispatch)' }}"
```
The synthesis plan listed this as item 6 in the task prompt and included it in the success criteria ("Traceability step logs trigger type, deploy ref, and staging run URL"). The implementation does not include it.

WHY: With the `workflow_run` trigger, production deploys appear as separate runs in GitHub Actions -- not grouped with the push. Without this logging step, an operator investigating a production deploy has to manually trace back to the triggering staging run. The iac-minion specifically flagged this as an operational concern (edge case table: "The production workflow appears as a separate run in GitHub Actions, not grouped with the push"). The step is three `echo` lines -- zero risk, non-trivial debuggability value.

AGENT: iac-minion (execution)
FIX: Add before the `actions/checkout` step in the `deploy` job:
```yaml
- name: Log deploy context
  run: |
    echo "Trigger: ${{ github.event_name }}"
    echo "Deploy ref: ${{ inputs.ref || github.event.workflow_run.head_sha || github.sha }}"
    echo "Staging run: ${{ github.event.workflow_run.html_url || 'N/A (manual dispatch)' }}"
```

---

## Items Verified Clean

- **No drift in core solution**: The `workflow_run` trigger, `conclusion == 'success'` guard, conditional `staging-smoke`, `always()` pattern, and `head_sha` ref chain all match the synthesis plan exactly.
- **No scope creep**: Implementation touches only the three files specified in scope. No application code, no health endpoint, no staging branch.
- **No feature substitution**: The plan specified `workflow_run` (Option 1). That is what was implemented.
- **Proportionality**: Two YAML changes and two markdown doc updates for a workflow trigger ordering fix. Proportional.
- **CLAUDE.md compliance**: YAGNI (no speculative features), KISS (platform-native fix), fail loudly (staging failures block production via explicit guard). Helix Manifesto principles respected.
- **Documentation accuracy**: OPERATIONS.md and CONTRIBUTING.md descriptions match the actual workflow behavior. The rollback warning about bypassing staging-first guarantee is documented. The staging env protection note correctly explains the `workflow_run` dependency.
- **Out-of-scope boundaries respected**: No staging branch, no tag-based promotion, no `SMOKE_SKIP_CAPTURE` changes, no `/health` endpoint changes.
- **Workflow name coupling**: Documented via comment on lines 6-7 of `deploy-production.yml` and in OPERATIONS.md staging env protection note.
