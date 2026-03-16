# Process: Key Versioning (R2)

TL;DR: Single-session nefario orchestration implemented key versioning across 6
source files with 13 new tests in ~15 minutes wall-clock. Security-minion's input
on trust model was the key design driver — two of three major architecture
decisions came from security review rather than the original plan. All 409 tests
pass, OpenAPI spec updated, evolution log complete.

## How the team worked through this

### Phase 1: Meta-Plan

Nefario identified two specialists for planning: security-minion and test-minion.
The task was well-scoped (6 source files, clear success criteria, explicit
out-of-scope items), so the team was deliberately small.

Specialists NOT selected and why: frontend-minion (no UI), observability-minion
(no new metrics), ux-design-minion (API-only), api-design-minion (one simple
endpoint), data-minion (KV is already established). The human directive was to
skip all approval gates and defer to gru/lucy instead.

### Phase 2: Specialist Planning

**security-minion** (the heavyweight input):
- Identified the critical constraint: `verifyWacz()` currently enforces that the
  public key comes from the server, never from the WACZ. The issue's wording
  ("verification endpoint reads keyId from WACZ") would break this invariant.
- Recommended: key resolution stays in the handler. WACZ-embedded keyId is for
  offline verifiers only. Server reads keyId from the KV capture record.
- Recommended 16 hex chars for keyId (rejected — see decisions.md D1)
- Flagged "try all archived keys" as a trust model weakness
- Recommended 32-byte validation on archiveSigningKey() (adopted)

**test-minion**:
- Identified the multi-key test setup challenge (vitest.config.js generates one
  keypair). Recommended TEST_ARCHIVED_KEY binding for the second key.
- Flagged that keyId derivation must be deterministic for test setup (adopted)
- Identified 5 test gaps: fallback failure, legacy with wrong key, ordering
  assertion, rate limit testing, computeKeyId unit tests

### Phase 3: Synthesis

The synthesis resolved security-minion vs issue-spec tensions:
- Issue said "keyId from WACZ" → plan said "keyId from KV record" (security-minion's
  recommendation wins on trust model)
- Issue said "8 hex chars" → plan kept 8 (issue spec wins; security-minion's 16-char
  recommendation rejected because keyId is a lookup index, not a security primitive)
- Issue implied iterating all keys → plan said "current key fallback only" (security-
  minion wins on KISS; margo concurred during review)

### Phase 3.5: Architecture Review

Five reviewers ran in parallel (lucy, margo, security-minion, test-minion,
ux-strategy-minion):

- **ux-strategy-minion**: APPROVE. No concerns. Validated API naming coherence.
- **security-minion**: ADVISE. Two findings: (1) ensure handleVerifyCapture never
  reads keyId from WACZ content, (2) validate 32-byte key length in archive. Both
  adopted.
- **test-minion**: ADVISE. Identified test gaps (fallback failure path, archive
  ordering). Key gaps addressed in implementation.
- **lucy**: ADVISE. Four findings: keyId length (not adopted), remove "try all
  archived keys" (already done in implementation), apply hardening to signing-keys
  endpoint (rate limiting already done), evolution log (handled by nefario wrap-up).
- **margo**: ADVISE. Three findings aligned with security-minion: list endpoint may
  be YAGNI (kept per issue requirements), remove "try all" fallback (already done),
  listArchivedSigningKeys coupled to list endpoint (kept per issue requirements).

Consensus: all reviewers approved the core approach. Disagreements were on
peripheral details (keyId length, list endpoint necessity), not the architecture.

### Phase 4: Execution

Single-pass implementation because the changes are tightly coupled:
1. `signing.js` → `kv.js` → `wacz.js` → `capture.js` → `index.js` (source chain)
2. `vitest.config.js` → `test/key-rotation.test.js` + updates to existing tests
3. `openapi.yaml` → `docs/` (documentation)

First test run: 3 failures — capture IDs in key-rotation.test.js didn't match the
route regex `cap_[a-f0-9]{32}`. Fixed by using proper hex IDs. Second run: 409/409
pass.

## What the human changed

The human directive was "skip all approval gates — defer decisions to gru and lucy."
This meant:
- Team approval gate: auto-approved
- Reviewer approval gate: auto-approved (but reviewers still ran and their input was
  incorporated)
- Execution plan gate: auto-approved
- Post-execution gates: auto-approved
- Compaction checkpoints: skipped
- PR creation: automatic

The human did NOT intervene on any specific design decision. All decisions were
resolved by the agent team (primarily security-minion vs synthesis plan).

## What the human chose NOT to intervene on

- **8 vs 16 hex chars**: The issue specified 8, security-minion recommended 16,
  lucy echoed security-minion. The orchestrator kept 8 because it's the issue spec
  and the security argument doesn't hold for a lookup index.
- **List endpoint vs point-lookup**: Margo recommended deferring the list endpoint.
  The orchestrator kept it because the issue success criteria explicitly require it.
- **"Try all archived keys" removal**: Security-minion and margo both recommended
  against it. The orchestrator agreed and the implementation never included it,
  despite the synthesis plan mentioning it.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/` (report companion directory)
- Security analysis: Phase 2 security-minion contribution
- Test strategy: Phase 2 test-minion contribution
- Architecture review verdicts: Phase 3.5 scratch files
- Design decisions with rationale: `docs/evolution/0017-key-versioning/decisions.md`
