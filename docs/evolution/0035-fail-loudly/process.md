# Process: Fail Loudly (#70)

## TL;DR

Nefario orchestrated a focused two-specialist planning phase (observability-minion, test-minion) followed by direct execution. All 22 bare catch blocks in `src/` were eliminated in a single pass. The `timestampStatus` semantic change from `'absent'` to `'skipped'` required updating exactly one test assertion. A consent.js bug was discovered where the top-level catch swallowed error details needed by a downstream Coralogix logging path. Total: 12 files changed, 508 tests passing.

## Orchestration

The human requested all approval gates be skipped and decisions deferred to gru and lucy (cross-cutting reviewers). Compaction checkpoints were also skipped. This resulted in a fast, streamlined execution with no human interaction between task briefing and PR.

## Specialists consulted

### observability-minion
**Why consulted**: Needed domain expertise on which catch blocks should log to Coralogix vs. which should just name the error type. Not every catch block is equal -- URL parsing failures in cdxj.js fire for every malformed WARC record URL, while a KV write failure returning 500 with zero logging is an invisible outage.

**Key arguments**:
- Classified catch blocks into three tiers: Coralogix-logged (3 blocks), named+commented (most), and terminal/comment-only (2 blocks)
- Discovered the consent.js `_error` propagation bug: the top-level catch returned `{ status: 'failed' }` without `_error`, making capture.js's consent error logging path dead code
- Recommended against logging browser frame operations to Coralogix (consent.js `.catch()` fires dozens of times per capture for cross-origin frame injection)
- Proposed event naming convention: `*.fail` for fatal, `*._fail` for non-fatal degradations, `*.invalid` for config problems
- Recommended adding Coralogix logging to kv.js index writes (currently console.warn)

**What was adopted**: The three-tier classification and the consent.js bug fix. The index.js KV failure now logs to Coralogix.

**What was NOT adopted**: Upgrading kv.js console.warn to Coralogix logging (scope creep -- those are already non-silent). Adding Coralogix to signing.js (already has console.warn, would require adding `log` import).

### test-minion
**Why consulted**: Needed to know which tests would break from the semantic change and what new coverage to add.

**Key findings**:
- Exactly one test breaks: `wacz.test.js` line 270-279 asserts `'absent'`, needs `'skipped'`
- All catch block parameter naming changes are purely syntactic -- zero test breaks
- Recommended P1 tests for timestampStatus in KV record (not added this phase -- existing coverage validates the value at the buildWacz level)

**What was adopted**: The one test fix. The assessment that no other tests break was confirmed by running the full suite.

**What was NOT adopted**: New P1 tests for KV record timestampStatus flow (deferred -- the value is already tested at the WACZ layer where it's generated).

## Human interventions

**What was changed**: Nothing. The plan was executed as synthesized.

**What was deliberately left alone**:
- kv.js console.warn calls (already non-silent, not bare catch blocks)
- verify-page.js client-side catch blocks (browser JS, already handles timestamp `'skip'` status correctly)
- Existing `catch (err)` blocks that already log to Coralogix (wacz.js TSA catch, capture.js catch-all, etc.)

**Rationale**: The issue scope is "fix silent catch blocks and timestamp semantics." Code that already logs errors or already uses named error parameters is not broken. Adding Coralogix everywhere would be over-engineering.

## Where to find full discussions

- Specialist outputs: `docs/history/nefario-reports/` companion directory for this run
- The observability-minion produced a detailed classification of all catch blocks
- The test-minion audited all 25 test files for 'absent' references
