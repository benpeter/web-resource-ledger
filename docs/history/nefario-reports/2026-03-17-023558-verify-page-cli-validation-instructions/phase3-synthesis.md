## Advisory Report

**Question**: Should we update the verify page with CLI instructions for cryptographic validation?
**Confidence**: HIGH
**Recommendation**: Yes, publish CLI verification instructions -- but NOT on the verify page. Create a standalone `VERIFICATION.md` in the repo with a companion `scripts/verify.sh`, and add a single link inside the existing "Cryptographic details" disclosure on the verify page.

### Executive Summary

All three specialists agree that publishing the verification algorithm is the right move -- it strengthens the trust model rather than weakening it. The verification procedure relies entirely on public information (the public key, the WACZ contents, standard cryptographic primitives), so publishing the steps adds zero attack surface. An open-source project whose value proposition is verifiability should make independent verification as accessible as possible.

The key strategic decision is *where* to put the instructions. The verify page is a trust artifact optimized for a single job: confirming to visitors (mostly non-technical) that a capture is authentic. CLI verification instructions serve a fundamentally different job -- enabling technical users to reproduce the verification themselves. Mixing these jobs on one page would degrade both. The right approach is a standalone `VERIFICATION.md` in the repo, with a companion `verify.sh` script, and a single link from the "Cryptographic details" disclosure on the verify page pointing to the docs.

The implementation is achievable with standard tools (`curl`, `unzip`, `jq`, `openssl 3.x`), but four encoding pitfalls make raw CLI commands fragile enough that a self-contained verification script should be the primary offering. The raw commands should still be documented (they serve as executable documentation of the algorithm), but the script is what users should actually run.

### Team Consensus

1. **Publishing the algorithm is safe and necessary.** No secrets are involved in verification. Withholding the algorithm would be security-through-obscurity, which contradicts the project's trust model. All three specialists reached this conclusion independently.

2. **CLI instructions should NOT be added to `verify-page.js`.** The verify page is a trust UI, not a documentation page. Adding CLI instructions would violate progressive disclosure, increase cognitive load for the 90%+ of visitors who just want the green checkmark, and create an XSS surface if dynamic command templates were used. Static documentation in the repo is the correct home.

3. **A standalone verification script (`verify.sh`) is more valuable than raw CLI commands alone.** The encoding pitfalls (SPKI header construction, string-vs-bytes signed payload, canonical JSON, base64 signature decoding) make a chain of raw `openssl`/`jq` commands fragile and error-prone. Each pitfall is a potential false negative that would make the system appear broken. A script eliminates this entire class of user error.

4. **Checks 1-3 (artifactHashes, bundleHash, signature) are fully documentable today.** The toolchain is standard: `curl`, `unzip`, `jq`, `openssl 3.x`. DevX confirmed every command works on macOS with OpenSSL 3.6.1.

5. **Check 4 (RFC 3161 timestamp) should be a separate "advanced" section.** Full timestamp chain verification via `openssl ts -verify` is finicky, requires the correct DigiCert CA certificate, and has not been fully validated against a real WRL timestamp token. The instructions should honestly distinguish "messageImprint match" (what the server does) from "full TSA chain validation" (what `openssl ts -verify` provides).

6. **The timestamp limitation must be transparently communicated.** The verify page already says "not verified cryptographically" for timestamps. CLI docs should elaborate: the server confirms the hash inside the timestamp matches the bundle hash, but does NOT verify the TSA's cryptographic signature or certificate chain. `openssl ts -verify` closes this gap.

7. **A single link inside the "Cryptographic details" disclosure is the right verify-page touchpoint.** Users who have opened "Cryptographic details" have self-selected as technically curious -- they are exactly the audience for a verification guide link. No new UI sections, no new disclosure panels, no dynamic content.

### Dissenting Views

1. **Script language: bash vs. Node.js vs. Python**

   - **devx-minion** recommends `verify.sh` (bash) as the primary script, with an optional Node.js alternative for users without OpenSSL 3.x.
   - **security-minion** recommends Python or Node.js (~60 lines, no framework dependencies) as the *primary* script, with raw `openssl` commands as secondary documentation.

   Resolution: Both positions have merit. The bash script is closer to "standard tools" and avoids runtime dependencies beyond what's already required (`openssl`, `jq`). However, the Node.js path avoids the LibreSSL/macOS problem entirely (Node 18+ has native Ed25519 via `crypto.subtle`). **Recommendation: ship `verify.sh` as the primary artifact (it demonstrates the algorithm with standard tools), and note that the existing `src/verify.js` can serve as a Node.js reference implementation. A separate Node.js standalone script is YAGNI until the bash path proves insufficient.**

2. **PEM endpoint (`?format=pem`) for the signing key**

   - **security-minion** recommends adding a `/.well-known/signing-key?format=pem` endpoint to eliminate the SPKI header construction pitfall entirely.
   - **ux-strategy-minion** and **devx-minion** did not raise this.

   Resolution: unresolved -- presented for user judgment. The PEM endpoint would remove the hardest manual step (constructing the SPKI DER header) and eliminate the most common false-negative scenario. However, it's a server-side change for a documentation task, and the `verify.sh` script handles the conversion internally. If the goal is to make *raw CLI commands* usable without a script, the PEM endpoint has strong value. If the goal is "ship a script people actually run," the conversion is handled in the script and the endpoint is YAGNI.

3. **`jq -Sc` equivalence to `canonicalize()`**

   - **devx-minion** confirms `jq -Sc '.'` produces byte-identical output for the current WRL datapackage structure and recommends documenting this.
   - **security-minion** warns that the `canonicalize()` function is a custom implementation that is *not* labeled as JCS (RFC 8785) compliant, and that referencing JCS in docs could cause edge-case mismatches with strict JCS libraries.

   Resolution: consensus. Document the exact algorithm ("recursively sort all object keys alphabetically, use `JSON.stringify` for leaf values, no whitespace between tokens") rather than referencing RFC 8785. Note the `jq -Sc` equivalence with the caveat about floating-point numbers (none exist in the current schema). This matches security-minion's recommendation and is compatible with devx-minion's tested approach.

### Supporting Evidence

#### Security Domain

The security analysis identified four specific encoding pitfalls that would cause false negatives (valid commands producing "verification failed" on valid captures):

- **SPKI header**: OpenSSL expects PEM/DER SPKI format (44 bytes), not raw 32-byte keys. The `/.well-known/signing-key` endpoint serves raw bytes in base64. Conversion requires prepending the fixed 12-byte SPKI DER header `302a300506032b6570032100`.
- **String-not-bytes**: The signed payload is the UTF-8 string `"sha256:<64 hex chars>"` (71 bytes), not the raw 32-byte SHA-256 digest. This is confirmed in `verify.js:182`: `enc.encode(hashString)`.
- **Canonical JSON**: The WACZ stores pretty-printed `datapackage.json`; the hash is computed over the canonicalized (sorted keys, no whitespace) form.
- **Base64 signature**: The signature field is base64-encoded; `openssl pkeyutl -verify -sigfile` expects raw binary.

Each of these is a "works correctly or fails completely" boundary -- there is no partial failure mode. Any documentation that omits even one of these steps will produce 100% false negatives.

The trust model analysis is clear: the public key is served from the same server that produces captures. A compromised server could serve a different key matching a forged signature. This is inherent to self-hosted signing without third-party PKI. Documentation should acknowledge this honestly and suggest key pinning for high-assurance use cases.

#### UX Strategy Domain

The verify page currently has a tight visual hierarchy optimized for one job: "Is this capture trustworthy?" The page structure is: banner (primary signal) -> metadata (context) -> checks (detail) -> screenshot (evidence) -> two disclosure sections (deep detail). Each layer serves the same job. CLI instructions serve a different job entirely.

The Kano model analysis is persuasive: clean trust confirmation is a must-be feature; inline CLI instructions are a performance feature for a different audience. Mixing them degrades the must-be feature without materially improving the performance feature (developers will look at repo docs, not an inline tutorial).

Dynamic/pre-filled commands (template-substituting capture IDs into code blocks) are rejected on three grounds: XSS surface (the page carefully uses `textContent` for user-controlled data), false precision (pre-filled commands create an illusion of simplicity), and YAGNI.

#### Developer Experience Domain

DevX prototyped every command on macOS with OpenSSL 3.6.1 and confirmed the full chain works. The difficulty gradient is:

| Check | Difficulty | Key Challenge |
|-------|-----------|---------------|
| artifactHashes | Easy | None |
| bundleHash | Medium | Canonical JSON (`jq -Sc` equivalence) |
| signature | Hard | Raw-to-PEM key conversion, LibreSSL gap |
| timestamp | Very Hard | CA cert management, ASN.1 parsing, `openssl ts -verify` quirks |

The LibreSSL/macOS gap is the single biggest cross-platform concern. macOS ships LibreSSL, which does not support Ed25519 in `pkeyutl`. Users on macOS need Homebrew OpenSSL (`brew install openssl`) and must use `/opt/homebrew/bin/openssl` explicitly. This must be called out prominently in any documentation.

The `openssl base64 -d` idiom (instead of system `base64`) is recommended throughout to avoid the macOS `base64 -D` vs. GNU `base64 --decode` flag divergence.

### Risks and Caveats

1. **False negatives from encoding errors are worse than no CLI instructions.** If even one step in the documented procedure is wrong, users will conclude the capture is invalid when it is valid. This destroys the trust the verification system is designed to build. Every command must be tested against a real production WACZ before publication. The `verify.sh` script should be run in CI against a known-good capture as a regression test.

2. **LibreSSL on macOS will be the #1 source of user frustration.** Users will copy the commands, get a cryptic "unsupported algorithm" error, and give up. The prerequisite check in `verify.sh` must detect LibreSSL and print a clear message.

3. **`openssl ts -verify` has not been validated against a real WRL timestamp token.** DevX was unable to fully verify the RFC 3161 path without a production token. This step should be tested and documented iteratively -- ship checks 1-3 first, add timestamp verification after it has been validated end-to-end.

4. **Key rotation creates a verification window.** `/.well-known/signing-key` (singular) serves the *current* key. Older captures were signed with previous keys. CLI instructions must use `/.well-known/signing-keys` (plural) with `keyId` lookup, or users will get false negatives on any capture signed before the most recent key rotation.

5. **Documentation drift.** `VERIFICATION.md` will drift from the code as the algorithm evolves. Standard mitigation: update docs in the same PR as algorithm changes. The `verify.sh` script running in CI provides an automated canary -- if the algorithm changes in a way that breaks verification, CI fails.

6. **`jq -Sc` canonical JSON equivalence is empirically validated, not formally proven.** The only theoretical divergence is floating-point number serialization (`jq` might emit `1.0` where JS emits `1`). No floating-point values exist in the current datapackage schema, but a future field addition could break the equivalence silently.

### Next Steps

If the recommendation is adopted, the implementation path is:

1. **Create `VERIFICATION.md`** in the repo root, documenting the full offline verification procedure for checks 1-3 (artifactHashes, bundleHash, signature). Include the exact encoding details for each step, the `jq -Sc` equivalence caveat, the canonical JSON algorithm, the SPKI header construction, and the string-not-bytes clarification. Add a "Trust boundaries" section describing what verification proves and what it does not.

2. **Write `scripts/verify.sh`** -- a self-contained bash script that accepts a capture ID, downloads the WACZ, performs all four checks, and prints pass/fail results. Include prerequisite checks (OpenSSL version, `jq` installed, LibreSSL detection). Target ~80-100 lines.

3. **Add a single link inside the "Cryptographic details" disclosure** on the verify page: "Verify independently: CLI verification guide" pointing to the VERIFICATION.md on GitHub.

4. **Test against a real production WACZ.** Validate every command and the full script against at least one real capture before merging. Add the script to CI to catch regressions.

5. **Document RFC 3161 timestamp verification as an "Advanced" section** in VERIFICATION.md, with honest caveats about `openssl ts -verify` complexity and the DigiCert CA cert requirement. Validate this section against a real token before promoting it from "advanced" to standard.

6. **Decide on `?format=pem` endpoint** (optional). If raw CLI commands (without the script) are an important use case, adding a PEM format option to `/.well-known/signing-key` would eliminate the SPKI header construction step. If the script is the primary path, this is deferrable.

### Conflict Resolutions

**Script language**: security-minion recommended Python/Node.js as primary; devx-minion recommended bash. Resolved in favor of bash as primary (matches "standard tools" philosophy, avoids additional runtime dependency), with a note that Node.js is a viable alternative path via the existing `src/verify.js`.

**Canonical JSON approach**: security-minion warned against referencing RFC 8785/JCS; devx-minion confirmed `jq -Sc` works in practice. Resolved by documenting the exact custom algorithm rather than referencing an external spec, while noting `jq -Sc` equivalence with caveats. Both specialists' concerns are addressed.

No other conflicts arose. The three specialists' recommendations are complementary: security identified what to document and what pitfalls to avoid, UX strategy determined where to put it, and devx confirmed the technical feasibility of each step.
