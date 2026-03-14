# Outcome: WACZ Bundling and Signing

## What was built

A complete WACZ bundling and Ed25519 signing pipeline integrated into the
existing capture workflow. After a capture completes, the pipeline:

1. Constructs WARC/1.1 records from in-memory artifacts (HTML, headers, screenshot)
2. Generates a CDXJ index with SURT-transformed URLs
3. Assembles a `datapackage.json` manifest with SHA-256 hashes per artifact
4. Computes a `bundleHash` over the canonical JSON of the manifest
5. Signs the `bundleHash` with Ed25519 via Web Crypto
6. Writes a signed `datapackage-digest.json` per WACZ-Auth 0.1.0 spec
7. Bundles everything into a WACZ ZIP (fflate, STORE mode)
8. Stores the WACZ at `captures/{sha256}.wacz` in R2
9. Updates KV metadata with WACZ info (key, bundleHash, size)

The pipeline degrades gracefully: if `SIGNING_KEY` is absent, captures
complete normally without WACZ bundles.

## New files

| File | Lines | Purpose |
|------|-------|---------|
| `src/signing.js` | ~111 | Ed25519 key import, sign, verify with rotation detection |
| `src/warc.js` | ~195 | WARC/1.1 record construction (4 record types) |
| `src/cdxj.js` | ~99 | CDXJ index generation with SURT transform |
| `src/wacz.js` | ~130 | WACZ assembly orchestrator |
| `src/canonical-json.js` | ~7 | Deterministic JSON serialization |
| `test/signing.test.js` | ~84 | Ed25519 spike tests (6 tests) |
| `test/canonical-json.test.js` | ~40 | Canonical JSON tests (6 tests) |
| `test/wacz.test.js` | ~195 | WACZ integration tests (12 tests) |
| `scripts/generate-signing-key.js` | ~25 | Operator key generation script |

## Modified files

| File | Change |
|------|--------|
| `src/capture.js` | WACZ bundling step after artifact storage |
| `src/kv.js` | `completeCapture` accepts optional `wacz` parameter |
| `vitest.config.js` | Ephemeral `SIGNING_KEY` binding (generated at load time) |
| `package.json` | Added `fflate` dependency |
| `README.md` | New file with signing key setup docs |

## Test results

215 tests pass across 10 test files. All acceptance criteria met:
- Signing round-trip test passes (sign -> verify = true, tamper = false)
- Canonical JSON stability test passes (different insertion order = identical output)
- WACZ written to R2 after capture (verified via integration test)
- README documents key generation procedure

## Key findings

- **Ed25519 standard API works in workerd**: The standard `'Ed25519'`
  algorithm name works for all Web Crypto operations. No `NODE-ED25519`
  fallback needed.
- **PKCS8 import confirmed**: `importKey('pkcs8', ...)` works in workerd
  for Ed25519 private keys.
- **Public key derivation requires node:crypto**: Web Crypto cannot derive
  a public key from a private key directly. Used `node:crypto`
  `createPrivateKey` -> `createPublicKey` -> SPKI export -> strip 12-byte
  header to get raw 32-byte public key.

## Deviations from issue #4

1. **warcio.js rejected** -- incompatible dependencies; manual WARC
   construction used instead (see decisions.md #1)
2. **Signatures in separate file** -- `datapackage-digest.json` per
   WACZ-Auth spec, not signatures array in `datapackage.json`
   (see decisions.md #2)
3. **PKCS8 key format** -- 48-byte PKCS8 DER, not raw 32 bytes
   (see decisions.md #5)

## Backlog changes

- **No new items added** -- all signing-related items already exist in the
  backlog from phase 0001 (RFC 3161, key versioning, key archiving).
- **No items resolved** -- the existing signing backlog items (RFC 3161,
  key rotation, key versioning) remain post-MVP as designed.
- **Updated context**: The "WACZ-Auth signing spec" consider item now has
  a partial implementation -- the `datapackage-digest.json` structure
  follows WACZ-Auth 0.1.0. Full WACZ-Auth (domain-ownership certificates,
  TSA integration) remains deferred.

## What surprised us

- Ed25519 support in workerd was more complete than expected. The spike
  test (Task 1) passed on the first try with the standard algorithm name.
  No fallback paths were needed.
- The code review found two helper function duplications (sha256,
  toTimestamp14) across modules built by the same agent in the same task.
  Fixed by deduplication in a follow-up commit.
