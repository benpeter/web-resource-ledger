MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Merge two separate timestamp check rows (timestamp + qualifiedTimestamp) into a single "Time verification" row in both the CLI formatter and web verify page. Presentation-layer only change. Source: GitHub Issue #167.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-44IZ7o/merge-timestamp-checks/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-44IZ7o/merge-timestamp-checks/phase2-frontend-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-44IZ7o/merge-timestamp-checks/phase2-test-minion.md

## Key consensus across specialists:

1. ux-strategy-minion: "Time verification" is the right label. Dynamic descriptions per state needed. Keep JSON API unchanged. Watch for orphaned timestampChain check.

2. frontend-minion: Pre-process checks array with mergeTimestampChecks() function before rendering. Duplicate in verify-page.js (browser can't import). JSON output stays raw. Main risk: verdict counts change.

3. test-minion: 4 timestamp states need coverage. makeSkipResult needs updating. buildVerdict() must count merged checks. formatJson stays raw. Existing verdict count assertions will break.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-44IZ7o/merge-timestamp-checks/phase3-synthesis.md

## Key Design Decisions (pre-resolved for synthesis)
- JSON output (formatJson) stays unchanged — no breaking change for machine consumers
- Pre-process pattern: mergeTimestampChecks() transforms checks array before rendering
- The function must be duplicated in verify-page.js (inline script can't import from packages/)
- timestampChain check: keep as-is, it validates the certificate chain which is independent of the display merge
- Verdict counts in buildVerdict() must operate on the merged array, not the raw array

## Execution Constraints
- This is a 3-file change (format.js, verify-page.js, format.test.js) — keep the plan proportional
- No approval gates needed — low risk, easy to reverse
- Single execution agent (frontend-minion) can handle all 3 files
- Model: sonnet for execution (straightforward implementation)
- Mode: bypassPermissions (file edits only, no destructive operations)
