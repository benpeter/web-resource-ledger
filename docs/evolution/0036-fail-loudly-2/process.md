# Process: Eliminate Silent Catch Blocks

## TL;DR

A 4-specialist nefario orchestration audited 40+ catch blocks across the WRL codebase, fixed 14 silent catches in 8 files, renamed `timestampStatus: 'absent'` to `'skipped'`, and added `signing.key_unavailable` Coralogix events. All approval gates were deferred to gru and lucy (human requested autonomous execution). One team adjustment: lucy dropped api-design-minion for KISS. Phase 5 code review caught 2 consistency gaps (pre-existing catch blocks binding `err` without forwarding it). 510 tests pass.

## Specialists Consulted

### Phase 2: Planning (3 agents, parallel)

**debugger-minion** — Audited every catch block in `src/` and classified into three categories: already correct, silent swallow needing fix, and intentional degradation needing status distinction. Found 14 fixable catches across 7 files. Identified the `log.js` recursion risk as the key architectural constraint: meta-logging failures cannot use `log()`.

**observability-minion** — Designed log events for each silent catch. Recommended `console.error` for `log.js` (disagreed with debugger-minion's `console.warn`), structured Coralogix events for `signing.js` and `ip-hash.js`. Also identified that `consent.js:71` catch was swallowing the `_error` field that the upstream caller already knew how to handle.

**test-minion** — Reviewed all 23 test files. Found that most error paths were already covered. Identified 1 assertion needing update (`'absent'` → `'skipped'`), 4 new tests needed. Confirmed the rename was safe because `timestampStatus` is internal (not in API responses).

### Phase 3.5: Architecture Review (6 agents, parallel)

**Mandatory reviewers:**
- **security-minion** (ADVISE): Two findings — (1) cdxj.js should not log raw URL (attacker-influenced subresource paths), log scheme+length only; (2) signing.js OpenSSL error codes could leak DER format hints, truncate.
- **test-minion** (ADVISE): log.test.js describe blocks contradict new behavior, need renaming and console.warn spy assertions.
- **ux-strategy-minion** (APPROVE): Confirmed three-way status is operator-clear. Noted `capture.js:231` already used `'skipped'`, making the rename lower-risk.
- **lucy** (ADVISE): Evolution log incomplete; consent.js:235 and verify-page.js:310 bare catches need comments.
- **margo** (APPROVE): Tightly scoped, minimal complexity.

**Discretionary reviewer:**
- **observability-minion** (ADVISE): `signing.js` path can't distinguish absent vs misconfigured in Coralogix. Recommended `signing.key_unavailable` event at call sites.

## Conflict Resolutions

### console.warn vs console.error for log.js (debugger vs observability)
- debugger-minion: `console.warn` — telemetry degradation is not a system failure
- observability-minion: `console.error` — pipeline failure is an error
- **Resolution**: `console.warn`. The `wrl:` prefix ensures filterability. `console.error` would create false urgency when tailing logs during an otherwise successful capture.

### Structured Coralogix events vs console.warn for signing.js (observability vs debugger)
- observability-minion: add `log(env, 5, 'signing', ...)` structured event
- debugger-minion: `console.warn` only — misconfiguration fires once, not worth wiring complexity
- **Resolution**: `console.warn` for the catch block itself, BUT added `signing.key_unavailable` Coralogix events at the call sites (index.js verify and signing-key endpoints) per observability-minion's Phase 3.5 review. This gives the best of both: structured logging where `env` and `ctx` are available, console.warn where they aren't.

### capture.js:563 preserve vs replace error (debugger vs observability)
- debugger-minion: preserve via `{ cause: err }`
- observability-minion: already compliant (re-throws categorized error)
- **Resolution**: Preserve. The original error was discarded entirely. Zero-cost fix.

## Human Interventions

The human requested fully autonomous execution with all gates deferred to gru and lucy. Specific instructions:
- "skip all approval gates — defer decisions to gru and lucy"
- "skip compaction checkpoints"
- "auto-create the PR at wrap-up without halting"
- "when all is done, auto-merge the PR"

No mid-execution human interventions occurred.

## What Was Deliberately Left Alone

- **consent.js frame-level `.catch(() => {})`**: All three specialists agreed these are expected for cross-origin/detached frames. Logging would generate noise proportional to iframe count per page.
- **verify.js, rfc3161.js catch blocks**: Return structured failure results — they ARE the error handling.
- **url-validation.js catch blocks**: Input validation returns meaningful errors.
- **kv.js catch blocks**: Already use `console.warn` with error messages.
- **verify-page.js browser-side catches**: Client-side code can't reach Worker logging.

## Phase 5 Code Review Findings

Three reviewers (code-review-minion, lucy, margo) ran in parallel:
- **code-review-minion** (ADVISE): 2 consistency gaps — `capture.js:196` and `capture.js:208` had `err` bound but not forwarded to log payload. These were pre-existing catches, not introduced by this PR, but the code review correctly identified them as inconsistent with the pattern established by the other fixes. Fixed.
- **lucy** (ADVISE): Evolution log incomplete, 2 bare catches in browser-context code need comments. Fixed.
- **margo** (APPROVE): No complexity concerns.

All findings were auto-fixed in a second commit.

## Where to Read More

- Phase 2 specialist contributions: `docs/history/nefario-reports/` companion directory
- Catch block audit: `docs/evolution/0035-fail-loudly-2/decisions.md`
- Issue context: GitHub Issue #70, which references Issue #66 (the DigiCert TSA misconfiguration that motivated the "fail loudly" principle)
