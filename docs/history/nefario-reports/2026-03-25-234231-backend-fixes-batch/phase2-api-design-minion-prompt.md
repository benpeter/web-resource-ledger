You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task

Two small backend improvements to the WRL capture worker:

1. **Skip approaching_limit dispatch when already sent (#187)**: Captures 161-200 for free-tier tenants currently call `dispatchNotification()` on every capture, which internally runs 2 D1 queries (load prefs + check dedup) before discovering the notification was already sent this period. Short-circuit at the call site to avoid these wasted round-trips.

2. **Descriptive Content-Disposition filenames (#181)**: Artifact download responses currently use generic filenames (`screenshot.png`, `bundle.wacz`, etc.). Include the captured domain and date in the filename (e.g., `capture-example.com-2026-03-24.wacz`).

## Constraints
- All existing tests must pass
- New behavior must have test coverage

## Your Planning Question

For issue #187, the current `dispatchNotification()` is called inside a `ctx.waitUntil()` block in the queue consumer (src/index.js ~lines 306-328). The dedup already happens inside `dispatchNotification()` via `checkNotificationSent()` in email-dispatch.js. Two options: (a) check dedup at the call site before calling `dispatchNotification()`, or (b) add an early-return cache/flag that avoids the D1 round-trips inside `dispatchNotification()`. Which approach keeps the API surface cleaner -- duplicating the dedup check at the call site, or adding a lightweight pre-check that `dispatchNotification()` callers can optionally use?

Also: for #181, the capture record has `url` and `createdAt` fields available in the artifact download handler. Should the filename use the full domain or strip `www.`? What about special characters in domains (IDN, ports)?

## Context
Read these files to understand current implementation:
- src/index.js lines 305-328 (call site for dispatchNotification)
- src/index.js lines 1721-1810 (artifact download handler)
- src/email-dispatch.js lines 149-301 (dispatchNotification function)
- src/db.js rowToCapture (capture record shape)

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/jolly-cooking-dijkstra

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: api-design-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-9QE2y7/backend-fixes-batch/phase2-api-design-minion.md
