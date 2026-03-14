# Lucy Review: Verification Endpoint Plan

## Verdict: ADVISE

The plan is well-aligned with the original request and project conventions. Four findings below -- two DRIFT items where the plan intentionally deviates from the issue spec (with defensible rationale, but the human should acknowledge the delta), one TRACE gap, and one CONVENTION note.

---

### Finding 1: Cache-Control diverges from issue acceptance criteria

- **[DRIFT]**: Plan uses `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` for verified:true responses; issue explicitly requires `Cache-Control: public, immutable, max-age=31536000`
  SCOPE: Task 2 -- Cache-Control header on 200 verified:true responses
  CHANGE: The conflict resolution documents the rationale (key compromise propagation), but the issue acceptance criteria state verbatim: "Response is cached with `Cache-Control: public, immutable, max-age=31536000`". The plan should explicitly acknowledge this is a deliberate deviation from the stated acceptance criteria and why, so the human approver can confirm the override. If the human agrees, update the issue to match.
  WHY: The issue's technical notes argue immutable is safe because "the capture ID is content-addressed -- if the capture exists and is verified, that fact never changes." The security-minion's counter-argument (verification judgment depends on a mutable trust anchor) is sound, but this is a spec change, not a clarification. Undocumented spec changes are a drift vector.
  TASK: 2

### Finding 2: Response shape diverges from issue specification

- **[DRIFT]**: Issue specifies `{ "verified": true|false, "capture": { ... }, "artifacts": { ... } }`; plan uses `{ verified, capture, wacz, checks }` -- `artifacts` replaced with `wacz` and `checks` added
  SCOPE: Task 2 -- response body shape
  CHANGE: The checks array and the wacz-instead-of-artifacts naming are improvements, but the issue's response shape is an explicit work item. The synthesis should note the shape change as a deliberate deviation. This is minor -- the plan's shape is strictly more useful -- but the delta should be visible so the human does not expect the issue's shape.
  WHY: When the issue says one shape and the implementation delivers another, anyone reading the issue after the fact will be confused. Documenting the deviation prevents that.
  TASK: 2

### Finding 3: Issue mentions `signatures` array; plan uses `signedData` object

- **[TRACE]**: The issue says "Verify Ed25519 signature in `signatures` array against stored public key." The actual WACZ structure uses `signedData` (a single object in `datapackage-digest.json`), not a `signatures` array. The plan correctly implements against the actual code, not the issue text.
  SCOPE: Task 1 -- signature verification logic
  CHANGE: No code change needed. The plan is correct. But the issue text references a structure (`signatures` array) that does not exist in the codebase. A comment in the evolution log `decisions.md` should note this discrepancy so future readers understand the issue spec was written before the WACZ implementation settled the structure.
  WHY: Traceability. Someone reading the issue later will wonder why the endpoint does not iterate a `signatures` array.
  TASK: 1

### Finding 4: Evolution log directory not created pre-execution

- **[CONVENTION]**: CLAUDE.md rule 1 states "Before starting a phase: create the directory and write `prompt.md`." The plan's Phase 8 (post-execution) handles evolution log, backlog update, and process.md. The `prompt.md` should be written *before* execution begins, not after.
  SCOPE: `docs/evolution/0009-verification-endpoint/prompt.md` (next sequential number)
  CHANGE: Add a Phase 0 or pre-execution step that creates `docs/evolution/0009-verification-endpoint/` and writes `prompt.md` with the issue content before Task 1 begins. The `decisions.md` file should also be started during execution (CLAUDE.md rule 2: "capture decisions as they happen").
  WHY: CLAUDE.md is explicit that `prompt.md` comes before work starts. The evolution log exists to document the process in real-time, not retroactively.
  TASK: (cross-cutting, pre-execution)

---

## Traceability Matrix

| Issue Requirement | Plan Coverage | Status |
|---|---|---|
| `GET /v1/verify/{id}` no auth required | Task 2: public endpoint, no auth check | OK |
| Recompute SHA-256 of all stored artifacts | Task 1: `artifactHashes` check | OK |
| Recompute `bundleHash` from canonical JSON | Task 1: `bundleHash` check | OK |
| Verify Ed25519 signature against stored public key | Task 1: `signature` check (server key) | OK |
| Response shape `{ verified, capture, artifacts }` | Task 2: `{ verified, capture, wacz, checks }` | DRIFT (Finding 2) |
| Rate limiting ~60 req/min per IP | Task 2: rate limiter binding 60/60 | OK |
| `Cache-Control: public, immutable, max-age=31536000` | Task 2: `max-age=86400` for true, `no-store` for false | DRIFT (Finding 1) |
| E2E integration test: POST -> poll -> verify -> true | Task 4: not exactly POST->poll->verify (uses `performCapture` directly) | OK (functionally equivalent) |
| Test: tamper -> verify -> false | Task 3 (unit) + Task 4 (integration) | OK |
| Evolution log documentation | Phase 8 (post-execution) | CONVENTION (Finding 4: prompt.md timing) |
| Backlog update | Phase 8 | OK |

## Scope Assessment

No scope creep detected. The plan adds nothing beyond what the issue requests. The three-check decomposition, server-key-only trust model, and conditional cache headers are refinements of the stated requirements, not additions. The `verifyUrl` in the retrieval response is a reasonable journey-coherence addition consistent with the existing `statusUrl` and `captureUrl` patterns.

## CLAUDE.md Compliance

- Engineering philosophy (YAGNI, KISS, Lean): Plan is proportional. One new file (`verify.js`), additions to one existing file (`index.js`), one config change (`wrangler.toml`). No new dependencies.
- Evolution log: Planned for Phase 8, but timing of `prompt.md` violates rule 1 (Finding 4).
- Process documentation: Planned for post-PR, which is correct per CLAUDE.md.
- No framework additions, no unnecessary dependencies. Consistent with technology preferences.
