# Lucy Review -- MVP Step 4: WACZ Bundling & Ed25519 Signing

## VERDICT: ADVISE

Plan aligns with the stated intent of Issue #4 (WACZ bundling and Ed25519 signing for the capture pipeline). No goal drift detected -- all new modules are traceable to the WACZ/signing requirement. Scope is contained. Two convention issues warrant attention before merge.

---

## Findings

### [ADVISE] src/warc.js:198-208 + src/cdxj.js:87-98 -- Duplicate `toTimestamp14` function

CHANGE: Two identical `toTimestamp14(isoDate)` functions exist -- one private in `warc.js` (line 198) and one exported in `cdxj.js` (line 87). Both convert ISO 8601 to 14-digit compact timestamp using identical logic.

WHY: The CLAUDE.md Engineering Philosophy mandates "Lean and Mean -- minimize code and dependencies actively. Fewer lines, fewer deps, fewer moving parts." Duplicate internal helpers violate this. The `warc.js` copy is private (not exported), so it could be replaced with an import from `cdxj.js` which already exports it.

AGENT: Implementation minion (WARC module)
FIX: Remove the private `toTimestamp14` from `warc.js` and import it from `cdxj.js`: `import { toTimestamp14 } from './cdxj.js';`. Alternatively, if the coupling feels wrong (warc importing from cdxj), extract to a tiny shared utility -- but given the project's anti-abstraction stance, a direct import is simpler.

---

### [ADVISE] src/warc.js:187-189 + src/wacz.js:30-32 -- Duplicate `sha256` helper

CHANGE: Two identical SHA-256 helper functions exist -- `sha256Warc(data)` in `warc.js` (line 187) and `sha256(data)` in `wacz.js` (line 30). Both compute `sha256:{hex}` digest strings using identical `crypto.subtle.digest` + hex encoding logic.

WHY: Same "Lean and Mean" principle as above. The `wacz.js` file even contains a comment "advisory from margo: do NOT create a separate module for a 3-line function" -- which is fair advice against premature abstraction, but the function now exists in two modules with identical implementations. Two copies of a 3-line function is still duplication. One module should own it and the other should import.

AGENT: Implementation minion (WACZ module)
FIX: Keep `sha256` in one location (either `warc.js` or `wacz.js`) and export it. The other module imports it. Given `wacz.js` imports from `warc.js` already, having `warc.js` export `sha256Warc` (renamed to `sha256` or kept as-is) and `wacz.js` import it would follow the existing dependency direction.

---

### [NIT] src/signing.js:15 -- `node:crypto` import in a Cloudflare Worker module

CHANGE: `signing.js` imports `createPrivateKey` and `createPublicKey` from `node:crypto` to derive public key bytes from a PKCS8 private key via SPKI DER export.

WHY: This works because `nodejs_compat` is enabled in `wrangler.toml`. The approach is valid and the comment on line 55 documents the dependency. No action required -- noting for awareness that this is the only `src/` module with a `node:crypto` dependency, which creates a tighter coupling to the `nodejs_compat` flag than the rest of the codebase.

AGENT: Implementation minion (signing module)
FIX: None required. Documenting for visibility.

---

### [NIT] src/capture.js:91 -- WACZ timestamp uses `new Date().toISOString()` instead of capture-start timestamp

CHANGE: The WACZ build call at line 91 creates a fresh `new Date().toISOString()` for the capture date. This timestamp will differ from the `createdAt` timestamp recorded in the KV pending record (written before browser rendering starts).

WHY: The time drift between `createCapture` and the WACZ `buildWacz` call could be several seconds (browser rendering takes time). The WACZ bundle's `created` field and WARC `WARC-Date` will reflect completion time, not initiation time. This may or may not be intentional -- the WACZ spec doesn't mandate which timestamp to use, and "time of capture completion" is defensible. Flagging for awareness only.

AGENT: Implementation minion (capture integration)
FIX: None required if "time of archival bundling" is the intended semantics. If "time capture was initiated" is preferred, pass `record.createdAt` through to `buildWacz`.

---

## Traceability

| Requirement (Issue #4) | Plan Element | Status |
|---|---|---|
| Ed25519 signing | `src/signing.js`, `test/signing.test.js`, `scripts/generate-signing-key.js` | Covered |
| WARC record construction | `src/warc.js` | Covered |
| CDXJ index generation | `src/cdxj.js` | Covered |
| WACZ assembly (ZIP) | `src/wacz.js` | Covered |
| Canonical JSON for deterministic hashing | `src/canonical-json.js`, `test/canonical-json.test.js` | Covered |
| Pipeline integration | `src/capture.js` modifications | Covered |
| KV status includes WACZ info | `src/kv.js` `wacz` parameter | Covered |
| Graceful degradation (no key) | `buildWacz` returns null, capture proceeds | Covered |
| Integration tests | `test/wacz.test.js` | Covered |
| Key generation tooling | `scripts/generate-signing-key.js` | Covered |
| Operator documentation | `README.md` signing key section | Covered |
| fflate dependency | `package.json` | Covered |
| Test key provisioning | `vitest.config.js` ephemeral key | Covered |

No orphaned tasks (all code traces to a requirement). No unaddressed requirements detected.

## CLAUDE.md Compliance

- **Language**: All artifacts in English. PASS.
- **JS over TS**: All new code is JavaScript. PASS.
- **Lean and Mean**: Two duplicate helpers (sha256, toTimestamp14). ADVISE -- see findings.
- **YAGNI**: No speculative features detected. PASS.
- **KISS**: Module decomposition is straightforward. PASS.
- **Vanilla solutions**: `fflate` is the only new dependency, justified by ZIP assembly requirement (no vanilla alternative in Workers). PASS.
- **`// tva` signature**: Present in all new entry/core files. PASS.
- **Evolution log**: Phase 0006 directory not yet created. This is expected if the orchestration creates it during wrap-up, but CLAUDE.md rule 1 says "Before starting a phase: create the directory and write prompt.md." The phase is clearly underway without its evolution log directory. This may be handled by nefario's wrap-up sequence -- flagging for the orchestrator's attention, not blocking.
