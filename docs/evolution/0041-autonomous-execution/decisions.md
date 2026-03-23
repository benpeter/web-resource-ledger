# Decisions Log -- Phase 0041: Autonomous Execution

Running record of supervisor interventions and judgment calls during
the orchestrator run.

## 2026-03-22: Initial start

- Created evolution log directory and prompt.md
- Starting orchestrate.sh for the first time
- 28 phases planned across Acts 3-6
- Using opus model as configured
- Log directory: `scripts/autonomous/logs/20260322-001522`
- Phase 0042 (MCP server for web evidence) started at 00:15:22
- Worktree: `.claude/worktrees/snappy-bouncing-sloth` (branch: `nefario/mcp-server-web-evidence`)

### Phase numbering gap

The orchestrate.sh doesn't pass the manifest phase number (0042) to the
claude session. The session looks at the evolution log index, sees the
last entry is 0040, and creates `docs/evolution/0041-mcp-server/` instead
of `0042-mcp-server/`. This collides with `0041-autonomous-execution`
(this supervisor's log).

**Decision**: let the session continue -- it's 30+ minutes in. When the
PR arrives, renumber the evolution log from 0041 to 0042 before merging,
or accept the collision since the short names differ. Consider patching
the session prompt template to include the phase number for future phases.

### Resume bug fix (01:41)

The orchestrator creates a new `LOG_DIR` with a timestamp on every run,
so re-running `orchestrate.sh` starts all phases from scratch instead of
resuming. This contradicts the supervisor prompt's instruction to "just
run orchestrate.sh again" to resume.

**Fix**: added a `logs/current` symlink that `init_logging` checks on
startup. If it exists and points to a valid directory, the existing log
dir (with its status files) is reused. New runs create the symlink
pointing to their fresh directory. This lets the orchestrator skip
phases that already succeeded.

### Restarting orchestrator (01:42)

Previous run got phase 0042 to success (PR #118 merged), started 0043
but was interrupted (0 bytes output). Resuming from phase 0043 onwards.

### Phase 0044 CI failure -- queue consumer test crash (03:59)

The nefario session completed successfully (PR #120), but CI failed.
Root cause: `wrangler.toml` defines `[[queues.consumers]]` which causes
miniflare to auto-consume queue messages during tests. The consumer
calls `performCapture()` → browser binding, which crashes the workerd
runtime and corrupts vitest-pool-workers' isolated storage tracking.

Three fix attempts:
1. Remove `queueConsumers` from vitest miniflare config → helped
   (2 failures → 1) but wrangler.toml consumers still active
2. Set `queueConsumers: {}` → made it worse (3 failures), reverted
3. **Created `wrangler.test.toml`** without `[[queues.consumers]]` →
   all tests pass. This is the correct fix.

Also changed CORS tests to use invalid URLs (avoid queue dispatch),
which is better test hygiene regardless.

**Decision**: merged PR #120 manually and set phase status to success.
The orchestrator had already moved on after the CI failure.

### Phase 0045 CI timeout and merge conflicts (05:25)

Phase 0045 (per-tenant rate limiting, PR #121) completed its nefario
session but CI never triggered. Root cause: the PR branch was created
from an old base (pre-PR #120 merge) and had merge conflicts with main,
preventing GitHub from creating the merge commit needed for CI.

**Fix**: rebased the branch onto latest main, resolving 3 conflict zones
(imports, rate limit headers, batch queue messages). After rebase, CI
triggered but failed: batch-capture tests got 429 because the
`wrangler.test.toml` was generated from old wrangler.toml with
`CAPTURE_RATE_LIMITER limit=10` instead of the new 100. Regenerated
`wrangler.test.toml` → all tests pass.

**Systemic issue**: the orchestrator's `git checkout main && git pull`
fails silently when there are uncommitted changes on main (the smoke-test
and log.sh fixes). This caused worktrees to be based on stale commits.
Committed those fixes to main to prevent recurrence.

**Decision**: merged PR #121 manually and set phase status to success.

### Phase 0047 no PR created (07:53)

Phase 0047 (D1 migration) completed with empty result — 5 turns, $12.20
spent, no PR. The issue had a constraint: "Data-driven trigger: implement
when Coralogix shows timeout failures >5% or sustained traffic >200/min."
The nefario session likely determined this feature isn't needed yet.

**Decision**: accepted as `failed_no_pr`. Will revisit when data warrants.

### Pause requested after phase 0048 (07:53)

Ben requested pause after current phase to restart session with remote
control. Will kill orchestrator after 0048 completes.

### Phase 0043 complete (02:33)

Batch capture endpoint (PR #119) merged successfully. Session took ~44min.
All 4 evolution log files created. Smoke tests warned because the
orchestrator passes URL as `$1` but `smoke-test.sh` expected `SMOKE_URL`
env var. Also `SMOKE_API_KEY` was required even when `SMOKE_SKIP_CAPTURE=1`.

**Fix**: patched `smoke-test.sh` to accept URL from `$1` or env var, and
defer `SMOKE_API_KEY` validation until capture check actually runs.
Verified fix works (3/3 pass).
