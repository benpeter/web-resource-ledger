# Lucy Review: RFC 3161 Timestamp Integration

**Verdict: ADVISE**

Minor process issues that should be addressed during execution. No goal drift. No scope creep. The plan is well-aligned with the user's original intent.

---

## Requirement Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|---|---|---|
| Capture pipeline requests RFC 3161 timestamp from a reliable TSA | Task 1 (`requestTimestamp`), Task 2 (pipeline integration) | Covered |
| Timestamp stored as `type: "rfc3161"` in signatures array | Task 2 (schema evolution) | Covered |
| Verification validates both self-signature and TSA timestamp | Task 3 (verify.js dual-format) | Covered |
| Verification page shows independent timestamp status | Task 5 (verify-page.js) | Covered |
| ASN.1 parsing handles TSA response format correctly | Task 1 (DER codec) | Covered |
| Graceful degradation if TSA unreachable | Task 2 (try/catch, omit entry) | Covered |
| Tests cover: successful timestamp, TSA timeout, verification, malformed response | Cross-Cutting Coverage (Phase 6) | Covered |
| Out of scope: eIDAS, multiple TSAs, WACZ-Auth full spec | Respected -- none present in plan | Covered |

No orphaned tasks. No unaddressed requirements. Bidirectional traceability is clean.

---

## Goal Drift Assessment

**No drift detected.** The plan does exactly what was asked: integrate RFC 3161 timestamping into the signing pipeline, evolve the schema, update verification, update the UI. No adjacent features, no gold-plating, no technology expansion.

The plan correctly defers certificate chain validation (CMS signature verification) -- this is appropriate given the Cloudflare Workers runtime constraint and the explicit out-of-scope declaration for WACZ-Auth full spec compliance.

---

## CLAUDE.md Compliance

### Engineering Philosophy

| Principle | Compliance |
|---|---|
| YAGNI | Pass -- no speculative features. Certificate chain validation deferred. No multiple-TSA support. No eIDAS. |
| KISS | Pass -- single file for DER codec (`rfc3161.js`), template-based encoding, tag-based navigation. |
| Lean and Mean | Pass -- zero new dependencies. Self-contained DER handling follows the `warc.js` / `signing.js` pattern. |
| No framework bias | Pass -- vanilla JS throughout. Verify page uses existing CSS classes. |
| Latency | Pass -- 3s TSA timeout within 30s budget; graceful degradation means capture latency is bounded. |

### Evolution Log

| Rule | Compliance | Finding |
|---|---|---|
| Create directory and `prompt.md` before starting | ADVISE | Task 6 creates `docs/evolution/0024-rfc3161-timestamps/prompt.md` but this happens in the LAST batch. CLAUDE.md Rule 1 says "Before starting a phase: create the directory and write `prompt.md`." The evolution log directory should be created BEFORE Task 1 executes, not after Task 5. |
| `decisions.md` during phase | Pass -- plan notes "decisions.md and outcome.md will be written later by the orchestration process." This is acceptable since the orchestration framework handles this. |
| Sequential numbering | Pass -- 0024 is the correct next number after 0023. |
| Process documentation | Pass -- original prompt explicitly requests `process.md` and the plan's post-execution Phase 8 covers this. |
| Backlog update | Pass -- Task 6 explicitly defers backlog update to post-merge, and `outcome.md` will record backlog changes. |

### Dependency Policy

Pass. Zero new npm dependencies. The `rfc3161.js` module is hand-built, consistent with `warc.js`, `cdxj.js`, and `signing.js`.

---

## Scope Containment

**No scope creep detected.** Task count (6) is proportional to the problem: DER codec, pipeline integration, verification backend, verification API, verification UI, documentation. Each task modifies only the files it needs to.

The plan's "What NOT to do" lists in each task prompt are unusually thorough and correctly prevent scope bleed between tasks. This is well-done.

---

## Specific Findings

### Finding 1 -- Evolution log timing (COMPLIANCE, severity: low)

**CHANGE**: Task 6 (last batch) creates `docs/evolution/0024-rfc3161-timestamps/prompt.md`.

**WHY**: CLAUDE.md Evolution Log Rule 1 requires the directory and `prompt.md` to exist "before starting a phase." Task 1 is the start of the phase, not Task 6.

**FIX**: Either (a) add a pre-execution step before Task 1 to create the evolution log directory and `prompt.md`, or (b) move the evolution log directory creation out of Task 6 and into the orchestration framework's Phase 4 (pre-execution) step. The rest of Task 6 (OpenAPI, README updates) correctly belongs in the final batch.

### Finding 2 -- `vitest.config.js` TSA_URL binding location (CONVENTION, severity: low)

**CHANGE**: Task 2 adds `TSA_URL` to the `bindings` object in `vitest.config.js`.

**WHY**: Looking at `vitest.config.js`, the `bindings` block is inside `miniflare` and contains secrets/credentials (`CAPTURE_API_KEY`, `SIGNING_KEY`, etc.). `TSA_URL` is a `[vars]` value in `wrangler.toml`, not a secret. Wrangler-based vitest config should inherit `[vars]` from `wrangler.toml` automatically (since `configPath: './wrangler.toml'` is set). Adding it to `bindings` may be redundant.

**FIX**: Verify during Task 2 execution whether `TSA_URL` from `wrangler.toml [vars]` is already available in the test environment via the wrangler config inheritance. If so, the explicit binding is unnecessary. If not (miniflare does not inherit vars), the binding is correct and this finding is moot.

### Finding 3 -- Approval gates vs. user directive (COMPLIANCE, severity: informational)

**CHANGE**: Tasks 2 and 5 have approval gates.

**WHY**: The original prompt explicitly says "skip all approval gates -- defer decisions to gru and lucy instead of halting for human input." The plan retains two approval gates despite this directive.

**FIX**: This is informational only -- the orchestration framework (nefario) should honor the user's directive and skip these gates at execution time. The plan documenting the gates is fine (they explain *why* these tasks are sensitive), but execution should not halt on them. If nefario is already configured to skip gates per the R11 directive, no action needed.

---

## Summary

The plan is tightly scoped, correctly traces to all stated requirements, follows the project's engineering philosophy, and introduces no unnecessary complexity. The only compliance concern is the evolution log timing (Finding 1), which is a process ordering issue that should be corrected before or during execution. Findings 2 and 3 are low-severity items to verify during execution.

**ADVISE** -- proceed with execution after addressing Finding 1 (create evolution log directory before Task 1, not in Task 6).
