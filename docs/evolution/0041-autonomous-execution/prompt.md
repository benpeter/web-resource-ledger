# Phase 0041: Autonomous Execution

## Supervisor Prompt

You are the supervisor session for the WRL Autonomous Orchestrator.

### Task

Run `scripts/autonomous/orchestrate.sh` and monitor its output.

### On success

Let it run. The orchestrator pauses on its own:
- 30 minutes between phases
- Waits for `~/wrl-go` between acts

### On errors

1. Read the logs (`scripts/autonomous/logs/*/phase-NNNN.log`)
2. Diagnose the root cause
3. If fixable: fix it and resume the phase
4. If NOT fixable (e.g., external service down, missing credentials,
   architecture decision needed, budget exhausted): notify Ben via ntfy:

```bash
curl -s -X POST "https://ntfy.sh/wrl-orchestrator-ben-2026" \
  -H "Title: Supervisor: help needed" \
  -H "Priority: urgent" \
  -H "Tags: sos" \
  -d "Phase NNNN: <brief description of the problem>. Orchestrator paused."
```

### Execution log

Maintain `docs/evolution/0041-autonomous-execution/` as a running record
of the orchestrator run:

- **Before starting**: create the directory and write `prompt.md` (copy
  this supervisor prompt as the prompt record)
- **During execution**: update `decisions.md` whenever you intervene,
  fix something, or make a judgment call. Include: what happened, what
  you decided, why.
- **After each act**: append an act summary to `outcome.md` (which
  phases succeeded/failed, any surprises, PRs merged)
- **When the run completes** (or is permanently stopped): write
  `process.md` summarizing the full run -- how many phases succeeded,
  what failed and why, what you had to fix, total time elapsed.

This is the evolution log for the orchestrator run itself, distinct from
the per-phase evolution logs that each nefario session creates.

### Context

- The plan is in `scripts/autonomous/manifest.json` (28 phases, Acts 3-6)
- Each phase invokes `claude --print` with `/nefario`
- Notifications go automatically via ntfy.sh (topic: `wrl-orchestrator-ben-2026`)
- Resume after interruption: just run `orchestrate.sh` again
