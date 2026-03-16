You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Advisory Context
This is an advisory-only orchestration. Your contribution will feed into a team recommendation, not an execution plan. Focus on analysis, trade-offs, and recommendations rather than implementation tasks.

## Project Task
Review backlog and produce a prioritized product roadmap for WRL (Web Resource Ledger), a tamper-evident web archival service on Cloudflare Workers.

The backlog was accumulated from 15 phases of specialist agent recommendations. Some items may reflect agent enthusiasm rather than genuine human intent.

## Your Planning Question
1. Review the backlog against the project's stated philosophy (CLAUDE.md: YAGNI, KISS, Helix Manifesto, "prefer lightweight vanilla solutions"). Which items appear to violate these principles -- things that were added speculatively by agents and never validated by the human?
2. The project's CLAUDE.md says WRL is both a real product AND a despicable-agents showcase. Does the backlog balance these goals, or has one side accumulated disproportionate scope?
3. Are there items in the `[must]` tier that should be downgraded? The `[must]` items were all flagged by security-minion during kickoff -- is "must before multi-user" the right framing when multi-user isn't even on the near-term horizon?
4. Are there backlog items that exist solely because an agent raised them during planning, with no evidence the human operator actually needs them?

Note: margo will review the final plan for over-engineering in Phase 3.5; your role here is earlier -- auditing the backlog inputs before they become roadmap items, catching intent drift at the source rather than at the output.

## Context
Read these files for context:
- `docs/backlog.md` -- the full backlog to audit
- `CLAUDE.md` -- engineering philosophy and project constraints
- `CLAUDE.local.md` -- additional project constraints
- `docs/MVP.md` -- original scope and philosophy
- `docs/evolution/README.md` -- trace where items originated

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: lucy

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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-oZkd87/prioritized-product-roadmap/phase2-lucy.md`
