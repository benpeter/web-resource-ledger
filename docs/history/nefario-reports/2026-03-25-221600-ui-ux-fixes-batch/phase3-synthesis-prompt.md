MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

UI/UX fixes batch (GitHub #213): 4 small fixes.
1. Fix low-contrast Sign In button (#211)
2. Billing section shows duplicate/conflicting status (#190)
3. Add documentation link to the logged-in application UI (#210)
4. Notify operator when new tenant API keys are created (#200)

Constraints: Match existing design system. All existing tests must pass.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-iac-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase2-test-minion.md

## Key consensus across specialists:

### frontend-minion
Contrast issue is in --color-text-muted (#6e6a66, ~3.4-3.9:1), not btn--github (10.5:1). Fix by darkening token to ~#5c5855. Remove status text from billing refresh row. Add docs link to nav bar with external icon. 3 tasks.

### iac-minion
Zero code changes for notification -- configure Coralogix alert rule on existing admin.key_create log event. Email pipeline is wrong tool (per-tenant, not operator). 1 task (dashboard config, no code).

### ux-strategy-minion
Docs link in nav-actions (right side, near user controls), not in primary nav-links. Both auth paths. "Docs" text + external-link icon. Contrast issue is --color-text-muted, not btn--github. 2 tasks.

### test-minion
5 new test cases across 3 existing files. No new test infrastructure. Structural/string assertions. Admin notification test should be structural (verify import), not behavioral. 5 tasks.

## External Skills Context
No external skills relevant to this task. ops-runbook discovered but not applicable.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-BgfDVA/ui-ux-fixes-batch/phase3-synthesis.md
