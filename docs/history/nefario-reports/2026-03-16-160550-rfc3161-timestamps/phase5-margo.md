# Margo Review: RFC 3161 Timestamp Integration

**Verdict: BLOCK**

Two blocking issues must be resolved before merge: (1) existing tests will break because wacz.test.js still references the old v0.1.0 digest format while wacz.js now emits v0.2.0, and (2) the rfc3161.js module has zero unit tests for 543 lines of DER codec logic. Three additional advisory findings follow.

---

## BLOCK-1: Broken Tests -- wacz.test.js references stale v0.1.0 digest format

**File:** `test/wacz.test.js`, lines 168-220

**What is complex / wrong:** The `buildWacz()` function in `src/wacz.js` now emits v0.2.0 format where `signature`, `publicKey`, and `keyId` are nested inside `signedData.signatures[0]` (not at the `signedData` top level). Three existing tests still destructure from the old flat location:

- Line 180: `digest.signedData.keyId` -- now `undefined` (keyId is at `signedData.signatures[0].keyId`)
- Line 208: `const { hash, signature, publicKey } = digest.signedData` -- `signature` and `publicKey` are `undefined` (they live in `signedData.signatures[0]`)
- Line 211/215: `atob(undefined)` will throw

These tests will either fail or throw at runtime. This is not a complexity concern -- it is a correctness defect that blocks merge.

**Simpler alternative:** Update the three test assertions to navigate the v0.2.0 `signatures` array. No structural change needed -- just fix the property paths.

---

## BLOCK-2: Zero test coverage for rfc3161.js (543 lines of DER codec)

**File:** `src/rfc3161.js` (543 lines)

**What is complex:** A hand-rolled DER encoder/decoder with ASN.1 structure navigation. This is the most bug-prone code in the change -- binary format parsing with offset arithmetic, sign-extension handling, nonce comparison with leading-zero stripping, CMS/SignedData tree traversal. It has zero dedicated unit tests.

The only paths that exercise this code are: (a) wacz.test.js integration tests (which will break per BLOCK-1), (b) verify.test.js (which only tests the v0.1.0 path and never calls `verifyTimestamp`), and (c) the live TSA call in vitest.config.js bindings (which is a live endpoint, not a hermetic test).

**Why it appears accidental:** The plan called for ~250 lines. The delivered 543 lines are reasonable given the ASN.1 structure depth, but zero test coverage is not reasonable for any hand-rolled binary codec, regardless of size. Without tests, bugs in `readTLV`, `childAt`, `extractTSTInfo`, or `parseTSTInfo` will surface in production against real TSA responses.

**Simpler alternative:** Add a focused test file (`test/rfc3161.test.js`) covering at minimum:
1. `buildTimeStampReq` output structure (encode a known hash+nonce, verify the DER bytes match expected structure)
2. `verifyTimestamp` with a valid pre-captured token (golden file test)
3. `verifyTimestamp` with a tampered token returns `{ valid: false }`
4. `parseGeneralizedTime` edge cases (with/without fractional seconds)
5. `readTLV` / `readLength` boundary conditions (truncated buffers, invalid lengths)

This does not require mocking a TSA. Capture one real TSA response as a base64 fixture and test against it.

---

## ADVISE-1: rfc3161.js is 2.2x the planned size -- justified but monitor

**File:** `src/rfc3161.js` (543 lines vs. ~250 planned)

**What is complex:** The file header says "minimal DER encoder/decoder" but at 543 lines it is the largest single module in the project. The overshoot comes from:
- DER primitives (writeLength, writeTLV, readLength, readTLV, childAt, concat, encodeUnsignedInteger): ~110 lines
- TimeStampReq builder: ~20 lines
- TimeStampResp parser + validator: ~60 lines
- extractTSTInfo (CMS SignedData tree traversal): ~50 lines
- parseTSTInfo: ~55 lines
- parseGeneralizedTime: ~15 lines
- JSDoc comments: ~120 lines
- Public API (requestTimestamp, verifyTimestamp): ~70 lines

**Assessment:** The size is justified given the CMS/SignedData structure depth (ContentInfo -> [0] -> SignedData -> EncapContentInfo -> [0] -> OCTET STRING -> TSTInfo). The JSDoc comments are substantial but appropriate for a binary protocol module. The code is linear and readable -- cognitive complexity per function is reasonable (no deep nesting, clear control flow). Each function does one thing.

**Why this is advisory, not blocking:** The 543 lines are essential complexity driven by the RFC 3161 / CMS structure. There are no unnecessary abstractions, no configurable options, no generic ASN.1 library being built. It is purpose-built as advertised. But the size means this module carries proportionally more risk, reinforcing the need for tests (BLOCK-2).

---

## ADVISE-2: Digest format version bump (v0.1.0 -> v0.2.0) is a breaking change with no migration path

**File:** `src/wacz.js` (line 129), `src/verify.js` (lines 116, 171-173)

**What is complex:** The digest format changed from flat `signedData.{signature, publicKey, keyId}` (v0.1.0) to `signedData.signatures[]` array (v0.2.0). The verifier handles both formats, which is correct. But there is no documentation of the format change in the evolution log, no schema definition of v0.2.0, and existing captures in production are v0.1.0 while new captures will be v0.2.0.

**Why this matters:** This is a schema migration. The dual-format verifier adds ongoing code complexity. If v0.2.0 is the path forward, the v0.1.0 code path in `verify.js` (lines 171-173) is technical debt that should be tracked in the backlog with a clear removal timeline.

**Simpler alternative:** Document the v0.2.0 schema in the evolution log decisions.md. Add a backlog item for v0.1.0 deprecation. Both are documentation tasks, not code changes.

---

## ADVISE-3: verify-page.js timestamp display -- caveat wording

**File:** `src/verify-page.js`, line 291

**What is complex:** The timestamp check description says "Time was recorded by an independent authority (not verified cryptographically)." This is accurate -- the verifier does not validate the TSA's CMS signature chain (deferred per the backlog). The parenthetical is important for trust clarity.

However, the check label says "Independent time verification" (line 284) which could be read as claiming full cryptographic verification. The mismatch between the label's implication and the description's caveat may confuse users.

**Simpler alternative:** Change the label to "Independent timestamp" or "TSA timestamp" to avoid implying verification that does not occur. Minor wording change, no structural impact.

---

## Summary

| # | Type | File | Issue |
|---|------|------|-------|
| BLOCK-1 | Correctness | test/wacz.test.js | Tests reference v0.1.0 digest format; wacz.js emits v0.2.0 |
| BLOCK-2 | Test gap | src/rfc3161.js | 543-line DER codec with zero unit tests |
| ADVISE-1 | Size | src/rfc3161.js | 2.2x planned size; justified but risk-proportional tests needed |
| ADVISE-2 | Schema | src/wacz.js, src/verify.js | v0.1.0->v0.2.0 breaking change needs documentation and backlog tracking |
| ADVISE-3 | UX | src/verify-page.js | Check label implies full verification; description correctly caveats |

**Complexity budget tally:** The rfc3161.js module adds 1 new dependency (none -- it is zero-dependency, which is good) and 0 new abstraction layers. The integration into wacz.js and verify.js is clean -- single function calls with graceful degradation. The `signatures` array in the digest format is a reasonable structural change for extensibility. Overall complexity cost is proportional to the feature. The blocking issues are about correctness and test coverage, not over-engineering.

**What is NOT flagged:** The DER codec approach (hand-rolled instead of importing an ASN.1 library) is the correct YAGNI/KISS choice. A general-purpose ASN.1 library would add a large dependency for a narrow use case. The purpose-built codec, while requiring more code, avoids dependency risk and is exactly scoped to the need. The graceful degradation pattern (TSA failure does not block capture) is well-implemented. The `verifyTimestamp` function correctly returns `{ valid: false }` on error rather than throwing. The wrangler.toml TSA_URL configuration is appropriate -- no unnecessary configurability.
