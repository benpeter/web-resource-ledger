# Code Review: MVP Step 4 — WACZ Bundling and Signing

Reviewed files: src/signing.js, src/warc.js, src/cdxj.js, src/wacz.js, src/canonical-json.js,
src/capture.js (modified), src/kv.js (modified), test/signing.test.js, test/canonical-json.test.js,
test/wacz.test.js, scripts/generate-signing-key.js, vitest.config.js, README.md, package.json.

---

VERDICT: ADVISE

---

FINDINGS:

- [ADVISE] src/warc.js:189 -- WARC digest format uses lowercase hex but WARC/1.1 spec (and pywb/Webrecorder tooling) expect base32-encoded SHA-1 or SHA-256 in the `WARC-Block-Digest` header (format: `sha256:<base32>`). The current digest is not written to the record header at all — it is only recorded in `recordMeta` and flows into CDXJ and datapackage.json. If downstream tooling (e.g., webrecorder-components, pywb) validates block digests against the WARC headers, this will silently fail because no `WARC-Block-Digest` header is emitted. The CDXJ and datapackage digests use `sha256:{hex}` which is valid for those purposes but the WARC records themselves have no digest header.
  AGENT: Producing agent (warc.js author)
  FIX: Either add a `WARC-Block-Digest: sha256:<base32-encoded-hash>` header to each record using `buildRecord`, or document explicitly that block-level digest verification via WARC headers is out of scope for this MVP. If the latter, leave an inline comment in `buildRecord` so future maintainers don't assume the existing `sha256Warc` output is written into WARC headers.

- [ADVISE] src/warc.js:61-83 -- `sha256Warc(htmlBytes)` is computed but the resulting `htmlDigest` value is never used in the WARC record itself (it goes into `recordMeta`). The same is true for `headersDigest` (line 86) and `screenshotDigest` (line 112). All three digest computations are async calls that add latency but their results never appear in the WARC byte stream. This is not a correctness bug for the MVP but represents wasted work if WARC headers are the intended destination.
  AGENT: Producing agent (warc.js author)
  FIX: If digests are intentionally only for CDXJ/datapackage, rename `sha256Warc` to plain `sha256` to remove the implication it writes WARC headers, and add a comment explaining the digests go to CDXJ/datapackage only, not into the WARC block headers.

- [ADVISE] src/signing.js:61 -- SPKI header offset is hardcoded as 12 bytes (`byteOffset + 12`). The comment documents this correctly ("Expected SPKI prefix for Ed25519 public key: 302a300506032b6570032100 -- 12-byte header"). However, if the DER encoding ever differs (e.g., a future Node.js update, a non-standard key), the code silently reads 32 bytes from the wrong offset and the assertion on line 64 catches only length errors, not content errors. The 32-byte assertion is necessary but insufficient — a wrong-offset slice still yields exactly 32 bytes.
  AGENT: Producing agent (signing.js author)
  FIX: Assert the 12-byte SPKI prefix bytes match the known Ed25519 OID (`302a300506032b6570032100`) before slicing. This prevents silent misreads if the DER structure ever deviates. Example: `const expected = [0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]; if (!expected.every((b,i) => spkiDer[i] === b)) throw new Error('Unexpected Ed25519 SPKI prefix');`

- [ADVISE] src/signing.js:74-77 -- The catch block swallows all errors from key import/derivation with only a `console.warn('Signing key validation failed')` and returns null. If a malformed key is set (e.g., wrong base64, wrong algorithm), the caller (`buildWacz`) silently produces no WACZ bundle and the operator has no actionable diagnostic. This degrades gracefully but silently.
  AGENT: Producing agent (signing.js author)
  FIX: Log the error type or message (without exposing key material) so operators can distinguish a misconfigured key from a missing key. Example: `console.warn('Signing key validation failed:', err.name, err.message.slice(0, 80));`

- [ADVISE] src/wacz.js:96 -- `bundleHash` is computed as `sha256(enc.encode(canonicalize(datapackage)))`. The `datapackage` object at this point already has `dpBytes` (`JSON.stringify(datapackage, null, 2)`) computed on line 93. The canonical JSON used for signing differs from the pretty-printed JSON stored in the ZIP as `datapackage.json`. Verifiers reading the spec must know to re-canonicalize rather than hash `datapackage.json` directly. This is a protocol design decision that is correct for signing integrity, but the divergence between the stored representation and the signed representation is a source of confusion and potential verifier bugs.
  AGENT: Producing agent (wacz.js author)
  FIX: Add an inline comment at line 96 explicitly stating that the signed payload is canonical JSON of the datapackage object (not the stored pretty-printed form), and that verifiers must re-canonicalize to validate the signature. This prevents future maintainers from assuming `hash(datapackage.json file bytes)` validates the signature.

- [ADVISE] src/cdxj.js:87-98 -- `toTimestamp14` in cdxj.js is a verbatim duplicate of `toTimestamp14` in warc.js:198-208. Both modules are independent and the function is small, but DRY violations compound over time.
  AGENT: Producing agent (cdxj.js / warc.js author)
  FIX: Extract `toTimestamp14` to a shared location (e.g., inline in `wacz.js` as a single call site, or as a named export from `warc.js` imported by `cdxj.js`). Given the YAGNI/KISS philosophy of this project, the simplest fix is to export it from `warc.js` and import it in `cdxj.js` — both modules are already tightly coupled through `wacz.js`.

- [NIT] src/signing.js:89 -- `btoa(String.fromCharCode(...new Uint8Array(sig)))` uses spread-into-apply. For Ed25519, signatures are always 64 bytes, so this is safe. But the same pattern in `wacz.js:103` (publicKeyBytes, 32 bytes) and test files is fine. No risk here given fixed small sizes, but if this pattern were applied to arbitrary-length data (e.g., WARC bytes), it would throw a stack overflow. Not a bug in the current code, but worth a comment to avoid accidental copy-paste to large buffers.
  AGENT: Producing agent (signing.js author)
  FIX: Add a comment like `// safe: Ed25519 signatures are always 64 bytes` to document the size assumption.

- [NIT] test/wacz.test.js:168-192 -- The signature verification test imports the public key from the embedded `signedData.publicKey` field in `datapackage-digest.json`. This is correct for confirming the signing pipeline works end-to-end, but it does not test that the embedded key matches a known/pinned operator key. This is intentional (there is no pinned key in test), but leaving a comment noting this distinction would help future test authors who might assume this test validates the trust chain.
  AGENT: Producing agent (test/wacz.test.js author)
  FIX: Add a comment above the test: `// Verifies signing pipeline only -- does not validate against a pinned operator key`.

- [NIT] src/warc.js:43 -- `warcinfoBody` encodes `software: WRL/0.1\r\nformat: WARC/1.1\r\n`. The `format` field is non-standard in WARC/1.1 warcinfo records. Standard fields include `software`, `hostname`, `operator`, `isPartOf`, `description`. The `format: WARC/1.1` line is redundant (already implied by the WARC-Type header) and may confuse strict parsers. No functional impact for this MVP.
  AGENT: Producing agent (warc.js author)
  FIX: Consider removing `format: WARC/1.1` from the warcinfo body, or replacing it with a comment explaining why it was included.

- [NIT] scripts/generate-signing-key.js:10 -- `publicRaw.slice(-32)` extracts the last 32 bytes of the SPKI DER to get the raw public key. The comment in signing.js:61 documents the 12-byte prefix approach (`byteOffset + 12`), while this script uses `slice(-32)`. Both are correct for a 44-byte Ed25519 SPKI DER (12 + 32 = 44, so last 32 and offset 12 are identical), but the two approaches are expressed differently and could diverge if key formats change. Cosmetic inconsistency only.
  AGENT: Producing agent (scripts/generate-signing-key.js author)
  FIX: Use `publicRaw.subarray(12)` or add a comment cross-referencing the SPKI prefix length constant in signing.js to make the equivalence explicit.

---

## Summary

The implementation is sound and well-structured. The crypto primitives (Ed25519, SHA-256, PKCS8 import, SPKI extraction) are used correctly. The graceful degradation path (no signing key → no WACZ, capture still completes) is correctly implemented and tested. The signing pipeline (canonicalize → hash → sign → embed) is correct and the test at wacz.test.js:168 closes the loop end-to-end.

The two ADVISE items to address before merging are:
1. The missing `WARC-Block-Digest` header in WARC records (warc.js:189) — either add it or document its absence explicitly.
2. The silent error swallowing in signing.js catch block (signing.js:74-77) — add minimal diagnostic logging.

The remaining ADVISE items (SPKI prefix assertion, bundleHash comment, toTimestamp14 duplication) are low-risk but will prevent subtle future bugs or protocol confusion.
