---
task: "Add minimum viable observability with Coralogix integration"
source-issue: 17
date: 2026-03-15
mode: execution
task-count: 7
gate-count: 0
team-size: 6
reviewers: 6
verdict: 2 APPROVE, 4 ADVISE, 0 BLOCK
compaction-events: 0
---

## Summary

Added a 17-line fire-and-forget log() helper that ships structured JSON to Coralogix REST ingestion. Instrumented all capture pipeline outcomes (6 log calls in capture.js) and security rejection points (6 log calls in index.js). No new dependencies, no framework, no abstractions. All 335 tests pass across 18 test files.

## Original Prompt

Add minimum viable observability with Coralogix integration (Issue #17). Every capture pipeline failure, successful capture, and security event must be logged as structured JSON and shipped to Coralogix in real time. The log helper must be a single function under 30 lines with no external dependencies. Coralogix integration must ship with this work, not deferred.

## Key Design Decisions

1. **Skip IP logging for MVP** -- HMAC-SHA256 approach requires async crypto incompatible with synchronous log() design; added to backlog as [should]
2. **Log 6 security event types** (not 3 or 10) -- issue scope + rate limiter events; excluded input validation failures (high noise, low signal, 404 has no rate limiter)
3. **Never log target URLs** -- captureId is the correlation key; URLs may contain credentials
4. **No R2 try/catch granularity** -- YAGNI; catch-all with err.constructor.name sufficient
5. **log() returns fetch Promise** -- enables ctx.waitUntil() wrapping in synchronous request path
6. **try/catch around JSON.stringify** -- infallibility guarantee; added per 3-reviewer consensus
7. **Static reason code for scheme rejections** -- attacker-supplied protocol value stripped from SSRF logs
8. **EU2 region corrected** -- synthesis had EU1; caught by 4/6 reviewers before execution

## Phases

### Phase 1: Meta-Plan
Identified 3 planning specialists: observability-minion (log schema, Coralogix API), security-minion (event taxonomy, disclosure risks), debugger-minion (capture.js integration points). Excluded test-minion, ux-strategy-minion, margo from planning (handled at review).

### Phase 2: Specialist Planning (3 agents)
- **observability-minion**: 17-line log() with Coralogix native envelope; severity INFO=3/WARN=4/ERROR=5; return fetch Promise for ctx.waitUntil
- **security-minion**: Never log raw IPs, URLs, or API keys; SSRF logs use static reasons; 7 additional event types proposed; 404 rate limiter gap flagged
- **debugger-minion**: 5 error paths mapped with precise placement; log before KV for failures, after KV for success; log() must be infallible; header fetch failure gap found

### Phase 3: Synthesis
Resolved 8 conflicts. Produced 7-task plan with 4 parallel batches, 0 approval gates. Key resolution: 6 security events (compromise between 3 and 10), no IP logging, no URL logging.

### Phase 3.5: Architecture Review (6 reviewers)
- **security-minion**: ADVISE -- scheme rejection log injection; JSON.stringify infallibility
- **test-minion**: ADVISE -- fetchMock chain pattern; CORALOGIX_ENDPOINT present after wrangler.toml change
- **ux-strategy-minion**: APPROVE -- plan optimally scoped
- **lucy**: ADVISE -- EU1/EU2 mismatch; evolution log needed; rate limiter label
- **margo**: APPROVE -- proportional plan
- **observability-minion**: ADVISE -- EU1/EU2 mismatch; JSON.stringify gap

### Phase 4: Execution (7 tasks)
- **Task 1** (observability-minion): Created src/log.js -- 17 lines, infallible, fire-and-forget
- **Task 2** (test-minion): Created test/log.test.js -- 8 tests covering guards, payload, errors, circular refs
- **Task 3** (iac-minion): Added [vars] CORALOGIX_ENDPOINT to wrangler.toml (EU2/Stockholm)
- **Task 4** (debugger-minion): Instrumented capture.js -- 6 log calls at every pipeline outcome
- **Task 5** (security-minion): Instrumented index.js -- 6 security event log calls with ctx.waitUntil
- **Task 6** (software-docs-minion): Updated backlog -- 2 items done/partial, 7 new deferred items
- **Task 7** (test-minion): Full test suite -- 335 tests, 18 files, all passing

### Phase 5-8
Verification: all tests passed (335/335). Evolution log created. Backlog updated.

## Agent Contributions

### Planning (Phase 2)

| Agent | Role | Key Contribution |
|-------|------|------------------|
| observability-minion | Log schema architect | Coralogix envelope design, severity mapping, ctx.waitUntil pattern |
| security-minion | Security event taxonomy | IP/URL exclusion policy, SSRF log safety, event type selection |
| debugger-minion | Integration point analyst | Error path mapping, log ordering (before/after KV), infallibility requirement |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Scheme rejection log injection; JSON.stringify synchronous throw |
| test-minion | ADVISE | fetchMock chain pattern; env var presence after wrangler.toml change |
| ux-strategy-minion | APPROVE | Plan optimally scoped |
| lucy | ADVISE | EU1/EU2 region mismatch (critical); evolution log coverage |
| margo | APPROVE | Proportional implementation |
| observability-minion | ADVISE | EU1/EU2 region mismatch; JSON.stringify infallibility gap |

## Decisions

### Conflict Resolutions

1. **IP logging** -- security-minion wanted HMAC-SHA256, observability-minion silent → skipped for MVP (async crypto incompatible with synchronous design)
2. **Event count** -- issue says 3, security-minion says 10 → 6 (rate limiter events added, input validation excluded)
3. **URL logging** -- debugger-minion included URL, security-minion excluded → never log (information disclosure risk)
4. **R2 try/catch** -- observability + debugger wanted granularity → YAGNI (catch-all sufficient)
5. **JSON.stringify safety** -- 3 reviewers independently flagged → try/catch added

## Verification

Verification: all checks passed. 335 tests across 18 files, 0 failures, 0 regressions. 8 new tests in log.test.js.

## Test Plan

- [x] log() returns undefined when CORALOGIX_ENDPOINT missing
- [x] log() returns undefined when CORALOGIX_SEND_KEY missing
- [x] log() sends correct Coralogix payload structure (applicationName, subsystemName, severity, timestamp, text)
- [x] Severity levels 4 and 5 propagate correctly
- [x] log() swallows fetch errors silently (Promise resolves)
- [x] log() returns truthy Promise when env vars present
- [x] log() handles circular references gracefully (returns undefined)
- [x] All 327 existing tests pass (no regressions)

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- primary orchestration

</details>

<details>
<summary>Compaction</summary>

0 compaction events. Context pressure remained manageable throughout.

</details>

## Working Files

<details>
<summary>Companion directory: docs/history/nefario-reports/2026-03-15-020114-mvo-coralogix-integration/</summary>

- prompt.md -- original user request
- phase1-metaplan-prompt.md, phase1-metaplan.md -- meta-plan
- phase2-observability-minion-prompt.md, phase2-observability-minion.md
- phase2-security-minion-prompt.md, phase2-security-minion.md
- phase2-debugger-minion-prompt.md, phase2-debugger-minion.md
- phase3-synthesis-prompt.md, phase3-synthesis.md -- delegation plan
- phase3.5-security-minion-prompt.md, phase3.5-security-minion.md
- phase3.5-test-minion-prompt.md, phase3.5-test-minion.md
- phase3.5-ux-strategy-minion-prompt.md, phase3.5-ux-strategy-minion.md
- phase3.5-lucy-prompt.md, phase3.5-lucy.md
- phase3.5-margo-prompt.md, phase3.5-margo.md
- phase3.5-observability-minion-prompt.md, phase3.5-observability-minion.md

</details>
