# Lucy Review: R2 Key Versioning Execution Plan

**Verdict: ADVISE**

The plan is well-aligned with the user's stated intent. Two findings require adjustment before execution; the remainder are advisory observations.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|-------------|--------|
| Every WACZ signature includes keyId (SHA-256, 8 hex chars) | Task 1: computeKeyId in signing.js, embed in signedData in wacz.js | COVERED |
| /.well-known/signing-keys endpoint serves historical keys | Task 1: handleGetSigningKeys in index.js | COVERED |
| Verification endpoint reads keyId and selects correct historical key | Task 1: handleVerifyCapture update in index.js | COVERED |
| Key rotation: generate new key, deploy, old key auto-archived in KV | Task 1: archiveSigningKey in kv.js, called before completeCapture | COVERED |
| All existing captures remain verifiable after rotation | Task 1: legacy fallback (no keyId -> try current key) | COVERED |
| Tests: signing with new key, verifying with old key, archive retrieval | Task 2: wacz.test.js, verify-integration.test.js, kv.test.js, signing-key.test.js | COVERED |

No requirement is unaddressed. No plan element lacks a requirement trace.

---

## Findings

### 1. [COMPLIANCE] keyId truncation: plan says 8 hex chars, security-minion recommends 16

**CHANGE**: The synthesis plan (Decision 1) specifies "first 8 hex chars of SHA-256" and "first 4 bytes (8 hex chars)" in the signing.js task.

**CONFLICT**: The security-minion analysis (Recommendation 1) explicitly recommends 16 hex chars (64 bits) because 8 hex chars (32 bits) is susceptible to preimage attacks in ~2^32 SHA-256 evaluations -- feasible in minutes on modern hardware. The synthesis appears to have dropped this recommendation without documenting why.

**WHY THIS MATTERS**: The prompt.md success criteria say "SHA-256 fingerprint, truncated to 8 hex chars" -- so the plan follows the prompt literally. However, the security-minion's analysis is sound: the cost difference between 8 and 16 hex chars is zero (same computation, longer substring), and the security margin is meaningful. This is not scope creep; it is a correction to a stated parameter.

**RECOMMENDATION**: Adopt the security-minion's recommendation of 16 hex chars. The prompt's "8 hex chars" was a specification detail, not a product requirement -- the actual requirement is "a keyId field that identifies the signing key." Update Decision 1 and the signing.js task description.

**Severity**: MEDIUM. The 8-char version works but has a known weakness that costs nothing to fix.

### 2. [DRIFT] Plan proposes `listArchivedSigningKeys(kv)` with KV prefix scan, but security-minion flagged this as deferrable

**CHANGE**: Task 1 in kv.js includes `listArchivedSigningKeys(kv) -> array of all archived keys`. The /.well-known/signing-keys endpoint uses this to enumerate all keys.

**CONFLICT**: The security-minion (Recommendation 5, Task T7) explicitly marked the list endpoint as "optional, deferrable" and recommended considering a point-lookup endpoint (`/.well-known/signing-keys/{keyId}`) instead. The rationale: KV list operations are more expensive than point gets, the list reveals rotation cadence (reputational risk for evidence admissibility), and the endpoint is not needed for server-side verification.

**WHY THIS MATTERS**: The prompt's success criteria say "/.well-known/signing-keys endpoint serves historical public keys" -- the list endpoint is explicitly requested. However, the prompt also scopes out automated scheduling, HSM, and multi-tenant management, suggesting the bar is "minimum viable key versioning." The list endpoint adds attack surface (DoS via KV list, information disclosure of rotation timing) without serving the core use case (server-side verification of existing captures).

**RECOMMENDATION**: Keep the endpoint since it is in the success criteria, but: (a) omit `archivedAt` from the response as the security-minion recommends, (b) cap results at 50 entries, (c) apply VERIFY_RATE_LIMITER. If the implementation agent asks whether to build it, the answer is yes -- it is in scope. But apply the security-minion's hardening constraints.

**Severity**: LOW. The endpoint is requested; the concern is about hardening details the synthesis omitted.

### 3. [SCOPE] Plan says verifyWacz() unchanged but also says handler tries "all archived keys" as fallback

**CHANGE**: Decision 6 says: "Legacy fallback: no keyId in KV record -> try current key first, then all archived keys."

**CONFLICT**: The security-minion (Recommendation 4) explicitly warns against a "try all keys" fallback. The correct behavior for legacy records (no keyId in KV) is: try the current key only. After a rotation, legacy bundles signed with the old key are honestly unverifiable -- they should return `verified: false` with an appropriate detail message. Trying all archived keys is a silent fallback that weakens the trust model (it makes key resolution WACZ-driven by elimination rather than server-directed).

**WHY THIS MATTERS**: Single-digit key counts make the "try all" approach seem harmless operationally, but it violates the security invariant that key resolution is server-controlled. The KV record's keyId (or absence thereof) should be the sole authority.

**RECOMMENDATION**: Remove "then all archived keys" from the legacy fallback. The fallback should be: no keyId in KV record -> use current key. If current key fails, return `verified: false` with detail "signing key for this capture is no longer available." This matches the security-minion's prescription.

**Severity**: MEDIUM. This is a trust model weakening that the security-minion explicitly flagged.

### 4. [CONVENTION] Evolution log and backlog not mentioned in the execution plan

**CHANGE**: The plan contains only Task 1 (implementation) and Task 2 (tests). No task covers evolution log creation or backlog update.

**CONVENTION**: CLAUDE.md requires: (a) evolution log directory `docs/evolution/0017-key-versioning/` with prompt.md, decisions.md, outcome.md, and process.md; (b) backlog update in `docs/backlog.md` (mark R2 done, note any deferrals); (c) evolution index update in `docs/evolution/README.md`.

**WHY THIS MATTERS**: The prompt.md additional context says "IMPORTANT: write process.md in the evolution log directory -- this is a project requirement" and specifies evolution directory 0017. The plan omits these as tasks, though they may be handled by nefario's wrap-up sequence.

**RECOMMENDATION**: If nefario's wrap-up handles evolution log and backlog updates, no change needed. If execution agents are expected to produce the full deliverable, add a Task 3 for documentation. Per CLAUDE.md Precedence: "If a skill's wrap-up sequence doesn't include a step that this file mandates, the calling session must add that step."

**Severity**: LOW (assuming nefario wrap-up handles it; flag if not).

### 5. [SCOPE] Auto-archive placement: plan says synchronous before completeCapture, security-minion agrees

**OBSERVATION**: Decision 5 says "Archive BEFORE completeCapture() -- no race window." The security-minion (Risk R2) concurs: synchronous before completeCapture, not fire-and-forget. This is well-aligned. No finding here -- noting it as a positive design choice that correctly incorporates the security review.

### 6. [SCOPE] Backward compat for existing /.well-known/signing-key (singular) endpoint

**OBSERVATION**: Decision 7 says "Keep old /.well-known/signing-key for backward compat." The plan's index.js changes add a new route without removing the old one. This is correct and proportional -- no scope concern.

---

## Summary

The plan aligns well with the user's intent. The two task structure (implementation + tests) is proportional to the problem. No scope creep detected -- all plan elements trace to stated requirements.

Three adjustments needed before execution:
1. **Use 16 hex chars for keyId** (zero-cost security improvement the synthesis dropped)
2. **Remove "try all archived keys" from legacy fallback** (trust model weakening the security-minion explicitly warned against)
3. **Apply security-minion hardening to /.well-known/signing-keys** (no archivedAt, cap at 50, rate-limited)

One process item to confirm:
4. **Evolution log and backlog tasks** -- confirm nefario wrap-up handles these, or add them to the plan.
