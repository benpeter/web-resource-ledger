Run the autonomous orchestrator for WRL:

```
bash scripts/autonomous/orchestrate.sh
```

Monitor its progress. The orchestrator handles everything automatically:

- **30-min pauses** between phases
- **Deploy verification** with auto-fix for missing Cloudflare resources
  (queues, D1 databases, KV namespaces)
- **Act gates** that wait for `~/wrl-go` signal at act boundaries
- **`~/wrl-pause`** to halt orchestration (created automatically on
  unrecoverable deploy failures, or manually by the operator)
- **`~/wrl-inbox`** for async messages — write a text file and the
  orchestrator processes it with a sonnet session between phases

## How to interact

**During a phase** (orchestrator is running a claude session):
- If I type something, note it and write it to `~/wrl-inbox` so the
  orchestrator picks it up between phases.
- If I ask you to do something directly (check status, kill a process,
  look at logs), do it immediately without waiting for the orchestrator.

**Between phases** (orchestrator is pausing or waiting):
- I can write to `~/wrl-inbox` from this session or another terminal.
- I can `touch ~/wrl-pause` to halt before the next phase.
- I can `touch ~/wrl-go` to release an act gate.

## Key paths

| Path | Purpose |
|------|---------|
| `scripts/autonomous/orchestrate.sh` | Main orchestrator loop |
| `scripts/autonomous/manifest.json` | Phase definitions and dependencies |
| `scripts/autonomous/logs/` | Session outputs, logs, status files |
| `~/wrl-inbox` | Async message file (processed between phases) |
| `~/wrl-pause` | Pause signal (halts orchestrator) |
| `~/wrl-go` | Resume signal (releases act gates and pauses) |
| `~/.wrlprofile` | Sets `CLAUDE_CONFIG_DIR=~/.claude-alt` for isolated auth |

## Recovery

If the orchestrator dies or is killed:
1. Check phase status files in `scripts/autonomous/logs/<timestamp>/`
2. Reset any `in_progress` phases to `pending`
3. Clean up worktrees: `git worktree list` then `git worktree remove <path> --force`
4. Restart: `bash scripts/autonomous/orchestrate.sh`

The orchestrator resumes from the first non-`success` phase automatically.

## Current state

Check phase status files to see what's done:

```bash
for f in scripts/autonomous/logs/current/phase-*.status; do
  echo "$(basename "$f" .status): $(cat "$f")"
done
```

