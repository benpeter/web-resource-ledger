MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Problem

When a capture has a Qualified Timestamp (eIDAS) but no standard RFC3161 timestamp, both the CLI and the verify page show contradictory information:

**CLI:**
```
  Timestamp imprint     skip  No independent timestamp was obtained for this capture
  Qualified timestamp   pass
```

**Verify page:** Shows a dash icon with "No independent timestamp was obtained for this capture" directly above a green check for "Qualified timestamp (eIDAS)".

This is confusing because a Qualified Timestamp is a **strictly stronger** form of independent time verification. Showing "not present" for the weaker form when the stronger form exists is like showing "No driver's license" next to "Has pilot's license."

For the target audience (lawyers, compliance, archivists), this undermines trust in the verify page — the one place where trust matters most.

## Solution

Merge the two timestamp checks into a single **"Time verification"** row that displays the strongest available tier:

| State | Display |
|-------|---------|
| Qualified timestamp present | ✓ Time verification — Qualified electronic timestamp (eIDAS Art. 41) |
| Standard RFC3161 only | ✓ Time verification — Independent timestamp from [TSA name] |
| None | — Time verification — No independent timestamp was obtained |
| Both present | ✓ Time verification — Qualified electronic timestamp (eIDAS Art. 41) |

When both timestamps are present, show the strongest in the check row. Individual TSA details remain available in the expanded details section.

## Rationale

- **Cognitive load:** Users want one answer to "was the time independently verified?" — not two rows to synthesize
- **Trust:** A dash/skip icon on a verification page creates doubt, even when something better is present
- **Honesty:** Unlike a phantom-pass approach, this never fabricates a result — it shows what actually exists
- **Scalability:** If future verification tiers are added, this pattern trivially extends (show strongest)
- **Consistency:** Same label and logic in CLI and web page

## Scope

Presentation-layer only — the underlying verification logic and data model stay unchanged:

- `packages/verify/lib/format.js` — rename label, add pre-processing step to merge timestamp checks
- `src/verify-page.js` — same merge logic for web rendering
- Tests in `packages/verify/test/` — update assertions
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/imperative-jingling-muffin

## External Skill Discovery
Scan .claude/skills/ and .skills/ for SKILL.md files. One skill found in .skills/: ops-runbook (not relevant to this task).

## Instructions
1. Read relevant files to understand the codebase context
2. The external skill ops-runbook is not relevant to this presentation-layer task
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution — planning). These are agents whose domain expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-44IZ7o/merge-timestamp-checks/phase1-metaplan.md

## Codebase Context
This is a presentation-layer change affecting 3 files:

1. `packages/verify/lib/format.js` - CLI formatter with CHECK_LABELS and CHECK_ORDER arrays that control label display and ordering. Has `formatHuman()` and `formatJson()` functions. Currently has separate entries for 'timestamp' and 'qualifiedTimestamp'.

2. `src/verify-page.js` - Web verify page with similar CHECK_LABELS and CHECK_DESCS objects, plus a `renderChecks()` function and `buildResult()` function that renders the HTML. Also has separate timestamp entries.

3. `packages/verify/test/format.test.js` - Tests for the CLI formatter with makePassResult, makeFailResult, makeSkipResult factories and assertions about output format.

The task is to merge the two separate timestamp check rows into one "Time verification" row showing the strongest available tier. No data model or verification logic changes.
