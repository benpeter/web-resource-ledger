MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Two small backend improvements to the WRL capture worker:

1. **Skip approaching_limit dispatch when already sent (#187)**: Captures 161-200 for free-tier tenants currently call `dispatchNotification()` on every capture, which internally runs 2 D1 queries (load prefs + check dedup) before discovering the notification was already sent this period. Short-circuit at the call site to avoid these wasted round-trips.

2. **Descriptive Content-Disposition filenames (#181)**: Artifact download responses currently use generic filenames (`screenshot.png`, `bundle.wacz`, etc.). Include the captured domain and date in the filename (e.g., `capture-example.com-2026-03-24.wacz`).

## Constraints
- All existing tests must pass
- New behavior must have test coverage

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9QE2y7/backend-fixes-batch/phase2-api-design-minion.md

## Key consensus across specialists:
- api-design-minion: Call-site pre-check using existing `checkNotificationSent()` for #187 (1-query short-circuit); strip www, sanitize to ASCII, `capture-{domain}-{date}.{ext}` pattern for #181. 4 tasks proposed: extract period helper, add call-site dedup short-circuit, build filename helper, wire filenames into download handler. No risks beyond mitigated race condition and encoding edge cases.

## External Skills Context
1 external skill detected (ops-runbook) - not relevant to this task. No external skills to integrate.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills need integration for this task
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9QE2y7/backend-fixes-batch/phase3-synthesis.md

IMPORTANT: The task descriptions are small and well-scoped. Consider consolidating the 4 proposed tasks into 2 (one per issue) since each fix is small enough for a single agent. Each task prompt must be fully self-contained with file paths, line numbers, and exact instructions.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/jolly-cooking-dijkstra
