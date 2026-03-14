---
task: "MVP Step 4: WACZ Bundling and Signing"
date: 2026-03-14
slug: mvp-step-4-wacz-bundling-signing
mode: execution
source-issue: 4
task-count: 5
gate-count: 2
compaction-events: 3
---

## Summary

Built the WACZ bundling and Ed25519 signing pipeline for the Web Resource Ledger Cloudflare Worker. Produced 5 new source modules (signing.js, warc.js, cdxj.js, wacz.js, canonical-json.js), 3 new test files (24 new tests, 215 total passing across 10 files), a key generation script, and README documentation. The pipeline constructs WARC/1.1 records manually (~195 lines), generates CDXJ indexes with SURT transforms, assembles signed manifests per WACZ-Auth 0.1.0 spec, and bundles into ZIP via fflate (STORE mode). Ed25519 signing uses standard Web Crypto API with PKCS8 key import -- spike test confirmed workerd support on first try. Graceful degradation: captures complete without WACZ when signing key is absent. One new runtime dependency added (fflate). Code review found 2 helper duplications, fixed in follow-up commit.

## Original Prompt

GitHub Issue #4: MVP Step 4 -- WACZ Bundling and Signing

Signed WACZ bundles stored in R2, verifiable via signing round-trip test. Package capture artifacts into standards-based WACZ bundle, compute integrity hashes, sign with Ed25519, and write to R2.

## Key Design Decisions

1. **warcio.js rejected** -- Incompatible dependencies (hash-wasm, tempy, pako) block usage in Cloudflare Workers. Manual WARC/1.1 construction (~195 lines) is simpler and has zero dependencies.

2. **Signatures in datapackage-digest.json** -- Per WACZ-Auth 0.1.0 spec, not in a signatures array in datapackage.json as the issue originally specified. Preserves RFC 3161 extensibility through the signedData object.

3. **Uncompressed WARC and CDXJ** -- No gzip anywhere in the pipeline. WACZ spec allows both. Eliminates an entire class of gzip determinism bugs. ZIP uses STORE mode (no compression).

4. **Graceful degradation** -- Missing SIGNING_KEY produces a complete capture without WACZ, not a failure. YAGNI over strict enforcement -- verification endpoint (Step 6) will naturally handle unsigned captures.

5. **PKCS8 DER key format** -- 48-byte PKCS8 DER (not raw 32 bytes as issue specified). Web Crypto only supports `importKey('pkcs8', ...)` for Ed25519 private keys.

6. **Ed25519 via standard Web Crypto** -- Standard `'Ed25519'` algorithm name works in workerd. No NODE-ED25519 fallback or node:crypto signing needed. Spike test confirmed all operations (sign, verify, PKCS8 import, raw export).

7. **fflate for ZIP construction** -- Single new dependency (~29KB, zero transitive deps). Manual ZIP writer possible but fragile. fflate justifies itself per Helix Manifesto criteria.

## Phases

### Phase 1: Meta-Plan
Identified 4 specialists: security-minion (Ed25519 key management, signing protocol), data-minion (WACZ spec, WARC format, manifest structure), test-minion (crypto testing in workerd, test fixtures), edge-minion (Workers constraints, bundling performance, fflate).

### Phase 2: Specialist Planning
All 4 specialists contributed. Key consensus: PKCS8 key format, spike test first, fflate over alternatives, lazy key caching. Key conflict: warcio.js feasibility (resolved: incompatible deps, build manually). Ed25519 API approach had 4-way input (resolved: standard Web Crypto with spike).

### Phase 3: Synthesis
Produced 5-task plan with 2 approval gates, 5 conflict resolutions, 6 identified risks. Tasks organized in 3 batches: parallel spike+canonical (Batch 1), sequential WACZ pipeline (Batch 2), parallel integration+README (Batch 3).

### Phase 3.5: Architecture Review
5 mandatory reviewers, all returned ADVISE (0 BLOCKs). 20 advisory items collected and incorporated into task prompts. Key cross-cutting findings: key rotation detection needed in warm isolates, ZIP determinism vs crypto.randomUUID() in WARC records, graceful degradation test coverage gap, evolution log documentation requirements.

### Phase 4: Execution
5 tasks executed across 3 batches with 2 approval gates.

**Batch 1** (parallel): Ed25519 spike confirmed standard Web Crypto API. Canonical JSON module: 5-line implementation, 6 proportionate tests.

**Gate 1**: Ed25519 API confirmed -- proceed with Web Crypto `'Ed25519'`, no fallback needed.

**Batch 2**: WACZ construction pipeline -- 4 source modules (signing, warc, cdxj, wacz), fflate dependency. All security advisories implemented: key rotation cache, 32-byte public key assertion, signed payload documentation, publicKey trust caveat.

**Gate 2**: WACZ pipeline approved -- core format decisions locked in.

**Batch 3** (parallel): Pipeline integration (capture.js, kv.js modifications, 12 integration tests) and README documentation.

### Phases 5-8
Verification: 2 code review findings auto-fixed (deduplicated sha256 and toTimestamp14 helpers), all 215 tests pass, evolution log created (0006-wacz-bundling-signing).

## Execution

| Task | Agent | Deliverables | Status |
|------|-------|-------------|--------|
| 1. Ed25519 spike + key gen + vitest config | edge-minion | test/signing.test.js, scripts/generate-signing-key.js, vitest.config.js | Complete |
| 2. Canonical JSON module + tests | edge-minion | src/canonical-json.js, test/canonical-json.test.js | Complete |
| 3. WACZ construction pipeline | edge-minion | src/signing.js, src/warc.js, src/cdxj.js, src/wacz.js, package.json | Complete |
| 4. Pipeline integration + tests | edge-minion | src/capture.js, src/kv.js, test/wacz.test.js | Complete |
| 5. README key gen docs | edge-minion | README.md | Complete |

## Decisions

### Gate 1: Ed25519 API Confirmation
- **Decision**: Standard Web Crypto `'Ed25519'` works in workerd for all operations
- **Confidence**: HIGH
- **Outcome**: Approved -- no fallback paths needed, simplifies all downstream signing code
- **Rejected**: NODE-ED25519 fallback (unnecessary), node:crypto signing fallback (unnecessary), @noble/ed25519 (unnecessary)

### Gate 2: WACZ Pipeline Implementation
- **Decision**: Core pipeline correct -- WARC format, CDXJ indexing, manifest assembly, ZIP bundling all verified
- **Confidence**: HIGH
- **Outcome**: Approved -- format decisions locked in, unblocked integration
- **Rejected**: warcio.js (dep conflicts), separate hash.js module (unnecessary per margo), jszip/archiver (heavy)

## Verification

Code review: 3 reviewers (code-review-minion, lucy, margo), all ADVISE. 2 findings auto-fixed (helper deduplication). Remaining ADVISE items are NITs (non-blocking).

Tests: 215/215 pass across 10 test files. All acceptance criteria verified:
- Signing round-trip test passes
- Canonical JSON stability test passes
- WACZ written to R2 after capture
- README documents key generation

Documentation: Evolution log 0006-wacz-bundling-signing created with prompt.md, decisions.md, outcome.md. Evolution README updated.

## Test Plan

- [x] Ed25519 spike tests (6 tests) -- keygen, sign, verify, tamper, PKCS8 round-trip, raw pubkey round-trip
- [x] Canonical JSON tests (6 tests) -- key sorting, nested sorting, determinism, array order, object-in-array, round-trip
- [x] WACZ integration tests (12 tests) -- WACZ in R2, ZIP contents, manifest structure, hash verification, signature verification, KV metadata, signing round-trip, canonical JSON stability, graceful degradation, WARC structure, CDXJ SURT transform
- [x] Existing capture tests (17 tests) -- no regressions
- [x] All other existing tests -- no regressions (215 total)

## Agent Contributions

### Planning (Phase 2)

| Agent | Role | Key Contribution |
|-------|------|-----------------|
| security-minion | Ed25519 key management | PKCS8 format, lazy caching, strict validation, spike-first approach |
| data-minion | WACZ spec expertise | Rejected warcio.js, manual WARC, datapackage-digest.json per WACZ-Auth |
| test-minion | Crypto testing strategy | Confirmed Ed25519 works in workerd, fixture design, test structure |
| edge-minion | Workers constraints | Bundling feasibility (~80-260ms), fflate recommendation, STORE mode |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|------------|
| security-minion | ADVISE | Key rotation cache, signed payload clarity, SPKI assertion, publicKey trust |
| test-minion | ADVISE | R2 cleanup for .wacz, graceful degradation test, WARC unit assertions |
| ux-strategy-minion | ADVISE | Key gen script output order (actionable first) |
| lucy | ADVISE | Document warcio.js rejection and signature format deviation in evolution log |
| margo | ADVISE | Inline hash.js, reduce canonical JSON tests, trim Task 3 prompt |

### Code Review (Phase 5)

| Agent | Verdict | Key Finding |
|-------|---------|------------|
| code-review-minion | ADVISE | WARC-Block-Digest header absent, catch block diagnostics, SPKI prefix validation |
| lucy | ADVISE | Duplicate toTimestamp14 and sha256 helpers |
| margo | ADVISE | Same deduplication, proportional complexity confirmed |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- /nefario -- full orchestration workflow

</details>

<details>
<summary>Context</summary>

Compaction events: 3 (after Phase 3, after Phase 3.5, before Phase 4 execution plan gate)

</details>

## Working Files

Working files from this orchestration are in the companion directory:
[2026-03-14-122554-mvp-step-4-wacz-bundling-signing/](2026-03-14-122554-mvp-step-4-wacz-bundling-signing/)
