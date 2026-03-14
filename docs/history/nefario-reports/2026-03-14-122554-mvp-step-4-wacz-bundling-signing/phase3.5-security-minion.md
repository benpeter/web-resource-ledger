ADVISE

---

- [security]: Module-scoped key cache survives across requests in the same Worker isolate, which is the intended design, but the cache is never validated after initial import. If `env.SIGNING_KEY` changes between deployments (key rotation) while an isolate stays warm, the cached stale private key silently continues signing.
  SCOPE: `src/signing.js` -- `getSigningKeys(env)` caching logic
  CHANGE: Cache the base64 SIGNING_KEY string alongside the derived CryptoKey objects. On each call to `getSigningKeys(env)`, compare `env.SIGNING_KEY` to the cached string; if they differ, re-import and update both cached values. This handles key rotation without requiring an isolate restart.
  WHY: Cloudflare Workers isolates can live for minutes to hours. A key rotation (required after a compromise) may not take effect until every isolate is evicted. Without this guard, captures signed after rotation may still use the old compromised key, defeating the purpose of rotation.
  TASK: Task 3 (src/signing.js)

- [security]: The plan proposes signing the UTF-8 bytes of the hash string `"sha256:{hex}"` (a printable string), not the raw 32-byte hash digest. Signing a human-readable prefix + hex-encoded hash rather than raw digest bytes is unconventional and increases the input surface for a future re-implementation to get wrong. More critically, step 8 in Task 3's `buildWacz` flow says "sign the UTF-8 bytes of the hash string" but step 9's `datapackage-digest.json` says `signedData.hash` is "sha256 of canonical datapackage.json" -- this is ambiguous about whether the signature covers the hash string or the raw manifest bytes. Whatever is chosen must be unambiguous and tested end-to-end.
  SCOPE: `src/wacz.js` steps 7-9, `datapackage-digest.json` structure
  CHANGE: Clarify and standardize exactly what byte sequence is signed. Recommend signing the UTF-8 bytes of the canonical hash string (as written), and add an explicit comment in the code and a test assertion that shows the exact byte sequence being signed. The signing round-trip test (Task 4 test case 7) must verify this exact byte sequence, not a re-implementation of it.
  WHY: Ambiguity in "what was signed" is a classic verification bypass. If the verifier interprets the signed payload differently from the signer, signatures verify as false even for legitimate captures, or -- worse -- an attacker can construct a payload that verifies against the wrong interpretation.
  TASK: Task 3 (src/wacz.js, src/signing.js), Task 4 (test/wacz.test.js test case 7)

- [security]: The `getSigningKeys` note on public key derivation proposes using `node:crypto`'s `createPrivateKey` / `createPublicKey` and stripping the SPKI header with `.subarray(12)`. The magic offset `12` is fragile -- Ed25519 SPKI DER headers are 12 bytes, but if `nodejs_compat` ever returns an SPKI encoding with a different prefix (e.g., including optional parameters), the stripped bytes will be silently wrong, producing a corrupt public key that embeds into every signed WACZ.
  SCOPE: `src/signing.js` -- public key derivation via node:crypto SPKI stripping
  CHANGE: Add an assertion after the strip: verify the derived `publicKeyBytes` is exactly 32 bytes before caching it. If it is not 32 bytes, throw (which is caught by the outer null-return wrapper). Also add a comment documenting the expected SPKI prefix hex (`302a300506032b6570032100`) so the offset is traceable.
  WHY: A silently corrupt public key embeds into `datapackage-digest.json.signedData.publicKey` of every signed WACZ. Downstream verifiers will fail for all captures produced during that period, with no indication the signing key is misconfigured rather than the bundles being tampered.
  TASK: Task 3 (src/signing.js)

- [security]: The graceful-degradation catch block in Task 4's `capture.js` integration snippet uses a bare `catch {}` with no logging at all. The synthesis document says "the graceful degradation logs 'Signing key validation failed' only" -- but the Task 4 prompt's code snippet suppresses everything silently. A signing failure that is never surfaced means an operator cannot distinguish between "no SIGNING_KEY configured" and "signing is failing in production due to a bug or key corruption."
  SCOPE: `src/capture.js` -- WACZ bundling catch block (Task 4 Part A code snippet)
  CHANGE: Log a distinguishable message when WACZ bundling throws unexpectedly (i.e., when `buildWacz` rejects rather than returns null). Use a different message than the "Signing key not configured" path so operators can tell them apart. Example: `console.warn('WACZ bundling failed unexpectedly; capture completed without bundle')`. Never log the error object itself (it may contain key material details).
  WHY: Silent failure of the signing step is operationally indistinguishable from intentional degradation. An attacker who can trigger signing failures gets a silent downgrade to unsigned captures with no alerting. The operator has no visibility from KV status either, since the plan marks such captures `complete` (not `wacz.status: failed` as discussed in Conflict 4 -- the Task 4 code snippet doesn't include this).
  TASK: Task 4 (src/capture.js integration)

- [security]: Task 1's Part C asks to embed a fixed PKCS8 DER base64 test key directly in `vitest.config.js` as a committed constant. A private key committed to VCS -- even a test-only key -- trains developers to treat committed key material as normal. It also creates a long-lived test key that will never rotate.
  SCOPE: `vitest.config.js` -- SIGNING_KEY binding
  CHANGE: Generate the test key at `vitest.config.js` load time using `node:crypto`'s `generateKeyPairSync('ed25519')` and export the PKCS8 DER base64 inline (since vitest.config.js runs in Node.js, not Workers). This way no key material is ever committed, while tests still get a valid signing key each run. Add a comment explaining why the key is ephemeral.
  WHY: Committing private key material to VCS -- even test keys -- establishes a bad pattern and creates a key that will never rotate. The repository is public (or may become public), making committed test keys a minor but real credential-in-VCS finding. The fix is two lines of Node.js crypto and costs nothing.
  TASK: Task 1 (vitest.config.js, Part C)

- [security]: The `datapackage-digest.json` structure embeds `publicKey` as base64 in `signedData`. The plan includes no check that the embedded public key in a bundle matches the operator's known signing key at verification time. A verifier that just takes the embedded public key and verifies against it provides authenticity-of-signing-operation but not identity-of-signer. This is technically a design concern for the future verification endpoint (Step 5/6), not this MVP, but the format choice made here makes it easy or hard to add later.
  SCOPE: `datapackage-digest.json` structure (format decision in src/wacz.js)
  CHANGE: This is ADVISE-level because verification is deferred to Step 6. No format change needed now. However, add a comment in `src/wacz.js` and/or `datapackage-digest.json` generation code noting that `publicKey` in `signedData` is for convenience only -- verifiers MUST pin against an operator-published key, not trust the embedded key blindly. This guards against the format being misused in the Step 6 implementation.
  WHY: A "signed by someone" assertion is weaker than "signed by WRL operator key." If Step 6 verifies by trusting the embedded public key, any party can sign a bundle with their own key and it will verify. The comment costs nothing and prevents a future LLM agent (or human) from implementing Step 6 incorrectly.
  TASK: Task 3 (src/wacz.js), informational for Task roadmap
