# Security Minion: Domain Plan Contribution

## Planning Question
Is it safe to publish the exact verification algorithm? How do we communicate the timestamp limitation (TSA cert chain is NOT verified)? Are there key-format pitfalls that could cause false negatives and erode trust?

---

## Recommendations

### 1. Publishing the verification algorithm is not just safe -- it is required

The algorithm relies on no secrets. Ed25519 verification uses only the public key (already served at `/.well-known/signing-key`), the WACZ contents (downloadable), and standard cryptographic primitives (SHA-256, Ed25519). Publishing the steps adds zero attack surface. The only secret -- the signing private key -- is never involved in verification.

Withholding the algorithm would be security-through-obscurity, which actively harms trust for a system whose entire value proposition is verifiability. An open-source (Apache-2.0) project with a public verification endpoint already implies anyone can read the code. CLI instructions just lower the barrier.

**Recommendation: Publish the full algorithm. Frame it as "how to verify without trusting our server."**

### 2. Timestamp limitation disclosure must be precise and prominent

The current verify page already states: "Time was recorded by an independent authority (not verified cryptographically)." This is accurate but could be more actionable in CLI instructions. The specific limitation chain is:

1. Server-side `verifyTimestamp()` (rfc3161.js:234) only checks that the messageImprint hash inside the DER-encoded TSTInfo matches the bundleHash. It does NOT verify the CMS signature on the timestamp token. It does NOT validate the TSA's X.509 certificate chain.
2. This means the server confirms "the timestamp refers to this bundle" but not "DigiCert actually issued this timestamp."
3. The reason (documented in rfc3161.js line 12-13) is that X.509 chain validation is not feasible in Cloudflare Workers -- there is no built-in certificate store or chain-building API.

For CLI instructions, the recommended framing:

- **What the timestamp proves today:** The timestamp token contains a hash that matches the bundle hash, and it was returned by the configured TSA endpoint at capture time. The server verified this match and the nonce at capture time (requestTimestamp validates nonce, messageImprint, and PKIStatus=0 on the live TSA response).
- **What the timestamp does NOT prove without additional tooling:** That the TSA's cryptographic signature on the token is valid. Full CMS/PKCS#7 signature verification requires an X.509 trust store (OpenSSL, etc.).
- **How users can independently verify the full chain:** Provide an `openssl ts -verify` command. This is the standard tool and performs full chain validation including the TSA certificate.

**Recommendation: CLI instructions should include a clearly labeled "full timestamp verification" step using `openssl ts -verify` with the DigiCert TSA root certificate, and mark it as optional but stronger than what the server does.**

### 3. Key-format pitfalls that will cause false negatives

I identified three specific format-mismatch scenarios that would produce valid-looking commands but fail verification, eroding user trust:

#### 3a. Public key encoding mismatch

The `/.well-known/signing-key` endpoint returns the raw 32-byte Ed25519 public key as **base64** inside a JSON wrapper (`{ "algorithm": "Ed25519", "publicKey": "<base64>", "keyId": "<hex>" }`). CLI users need to:

1. Extract the `publicKey` field from the JSON (not use the raw response body)
2. Base64-decode it to get 32 raw bytes
3. Feed those 32 bytes to their Ed25519 verification tool

The pitfall: OpenSSL and most CLI tools expect keys in PEM/DER **SPKI** format (44 bytes: 12-byte SPKI header `302a300506032b6570032100` + 32-byte raw key), not raw 32-byte keys. If instructions say "download the key and verify," users who pipe the raw bytes to `openssl` will get a format error and conclude the signature is invalid.

**Recommendation: CLI instructions must include the exact conversion step. Either:**
- Provide a one-liner that prepends the SPKI header and base64-encodes for PEM, or
- Add a `/.well-known/signing-key?format=pem` endpoint that serves the key in PEM/SPKI format directly (preferred -- removes a failure-prone manual step)

Concrete conversion (for documentation, not a code recommendation):
```bash
# Fetch raw 32-byte key, prepend SPKI header, output PEM
curl -s https://wrl.benpeter.workers.dev/.well-known/signing-key \
  | jq -r .publicKey \
  | base64 -d \
  | (printf '\x30\x2a\x30\x05\x06\x03\x2b\x65\x70\x03\x21\x00'; cat) \
  | openssl pkey -inform DER -pubin -outform PEM
```

This is fragile. A dedicated PEM endpoint would eliminate this entire class of false negatives.

#### 3b. Signature payload is the hash STRING, not hash BYTES

This is the most subtle pitfall. In `signing.js:102` and `verify.js:182`:

```js
const valid = await verifySignature(publicKeyBytes, enc.encode(hashString), sigValue);
```

The signed payload is the **UTF-8 encoded string** `"sha256:abc123..."` (71 bytes: 7-byte prefix + 64 hex chars), NOT the raw 32 SHA-256 bytes. If CLI instructions say "verify the signature over the bundle hash," users will naturally compute the 32-byte SHA-256 digest and try to verify the signature over those 32 bytes. This will always fail.

**Recommendation: CLI instructions must explicitly state that the signed message is the literal ASCII/UTF-8 string `sha256:<hex>`, not the binary digest. Include the exact `echo -n` or `printf` command:**

```bash
# The signed message is the literal string, not binary hash bytes
SIGNED_MSG="sha256:$(sha256sum < canonicalized_datapackage.json | cut -d' ' -f1)"
echo -n "$SIGNED_MSG" | openssl pkeyutl -verify -pubin -inkey key.pem -sigfile sig.bin
```

#### 3c. Canonical JSON serialization differences

The bundleHash is SHA-256 of the **canonicalized** form of `datapackage.json`, not the pretty-printed form stored in the ZIP. The canonicalization (canonical-json.js) sorts object keys recursively and removes all whitespace. The datapackage.json in the WACZ is pretty-printed with `JSON.stringify(datapackage, null, 2)`.

If CLI instructions say "hash datapackage.json from the ZIP," users will hash the pretty-printed version and get a different hash, causing bundleHash verification to fail.

**Recommendation: CLI instructions must include an explicit canonicalization step. Options:**
- Provide a `jq` one-liner that sorts keys and strips whitespace (jq's `-S` flag sorts keys but does not recursively sort nested objects -- this may not match)
- Provide a small standalone canonicalize script (Python or Node one-liner)
- Document the exact algorithm: "recursively sort all object keys alphabetically, remove all whitespace between tokens, use standard JSON escaping"

The safest approach: provide a Python or Node one-liner that exactly reimplements `canonical-json.js`. The function is 5 lines and has no dependencies.

#### 3d. Signature is base64, not raw binary

The `signature` field in `datapackage-digest.json` is base64-encoded. OpenSSL's `pkeyutl -verify -sigfile` expects raw binary. Instructions must include `base64 -d` before piping to the verifier.

### 4. Recommend a verification script over raw CLI commands

Given pitfalls 3a-3d, a chain of raw `openssl` / `jq` / `sha256sum` commands is fragile and error-prone. Each step is a potential false-negative landmine.

**Recommendation: Ship a standalone verification script** (Python or Node, no dependencies beyond standard library + `openssl` CLI for the timestamp step). The verify page can link to it. This:

- Eliminates encoding/format conversion errors
- Is testable (run it against known-good captures in CI)
- Serves as executable documentation of the algorithm
- Can be audited in one read (it would be ~60 lines)

The raw `openssl` command equivalents should still be documented (for users who want to understand each step), but the primary recommendation should be "download and run this script."

### 5. Trust model framing

The CLI instructions implicitly define a trust model. Be explicit about it:

| What you trust | What you verify |
|---|---|
| The WRL server's `/.well-known/signing-key` endpoint serves the real public key | You can pin/cache this key and detect rotation via `/.well-known/signing-keys` |
| The capture service had exclusive access to the private key at signing time | Ed25519 signature proves the bundle was signed by the holder of that private key |
| DigiCert's TSA endpoint was honest (with `openssl ts -verify`) | Full CMS chain validation proves the timestamp was issued by DigiCert's TSA |
| SHA-256 is collision-resistant | The bundle hash binds the signature to the exact WACZ contents |

The weakness: the public key is fetched from the same server that produced the capture. A compromised server could serve a different public key that matches a forged signature. This is inherent to any self-hosted signing system without a third-party PKI or Certificate Transparency log. Document it -- don't hide it.

**Recommendation: Include a "Trust boundaries" section in the CLI instructions. Users doing serious forensic work should pin the public key out-of-band (e.g., record it in a notarized document, publish it on a separate domain, or reference the key archive).**

---

## Risks and Concerns

### CRITICAL: False negatives from encoding mismatches

If CLI instructions contain any of the format pitfalls from section 3, users will get verification failures on valid captures. This is worse than no CLI instructions at all -- it makes the system look broken and destroys the exact trust it's trying to build. Every command must be tested against a real WACZ before publication.

### HIGH: Timestamp verification gap creates a misleading assurance level

The current server-side timestamp check provides integrity binding (hash match) but not authenticity (TSA actually signed it). If CLI instructions repeat the server's check without flagging the gap, users may believe they have stronger temporal proof than they actually do. The risk is not exploitation (an attacker would need to forge a valid-looking DER structure with the right hash, which is hard to do usefully), but misrepresentation of the assurance level in legal or compliance contexts.

### MEDIUM: Canonical JSON reproducibility

The `canonicalize()` function in canonical-json.js is a custom 5-line implementation. It handles the common case but has edge-case behaviors that differ from RFC 8785 (JCS). Specifically:
- Number serialization: JavaScript's `JSON.stringify` for numbers is locale-independent and matches JCS, so this is likely fine.
- Unicode escaping: `JSON.stringify` in V8 will produce minimal escaping (only required characters), which matches JCS.
- But the function is not labeled as JCS-compliant. If CLI instructions reference "JCS" or "RFC 8785" and a user uses a strict JCS library, there could be edge-case mismatches on unusual datapackage content.

**Mitigation: Document the exact algorithm (recursive key sort + JSON.stringify per value) rather than referencing an external spec.**

### LOW: Key rotation creates a verification window

When the signing key rotates, `/.well-known/signing-key` serves the new key. Old captures were signed with the old key. The `/.well-known/signing-keys` endpoint serves the archive, and the verify endpoint resolves the correct key via `keyId` from the KV record. But CLI users who naively fetch `/.well-known/signing-key` (singular) to verify an old capture will get the wrong key and a false negative.

**Mitigation: CLI instructions should use `/.well-known/signing-keys` (plural) to look up the key by the `keyId` in the capture's `datapackage-digest.json`, not assume the current key is the right one. Document the keyId lookup explicitly.**

### LOW: openssl version fragmentation

Ed25519 support in OpenSSL requires version 1.1.1+ (September 2018). LibreSSL (macOS default) added Ed25519 support in 3.7.0 (December 2022). Older macOS systems with older LibreSSL will fail. The `pkeyutl` subcommand syntax for Ed25519 also varies between OpenSSL 1.x and 3.x.

**Mitigation: Document minimum versions. Test commands on both OpenSSL 3.x and LibreSSL 3.7+. The standalone script recommendation (section 4) sidesteps this entirely for Python/Node users.**

---

## Proposed Tasks

These are advisory recommendations, not execution tasks:

1. **Document the exact verification algorithm** with all encoding details (string-not-bytes for signed payload, canonical JSON algorithm, base64 decoding for signatures, SPKI header for public key)
2. **Write a standalone verification script** (~60 lines, Python or Node, no framework dependencies) that performs all 4 checks (artifactHashes, bundleHash, signature, timestamp) with correct encoding
3. **Add the script to the repo** and run it in CI against a known-good capture as a regression test
4. **Consider adding `?format=pem` to the signing-key endpoint** to eliminate the SPKI header construction pitfall
5. **Write a "Trust boundaries" section** that honestly describes what the verification proves and what it does not
6. **Test every CLI command** against a real production WACZ before publishing -- preferably automated in CI
7. **Include `openssl ts -verify` instructions** with the DigiCert TSA root certificate for users who want full timestamp chain validation

---

## Additional Agents Needed

- **devx-minion**: To write and test the actual CLI commands and standalone script, ensuring they work across macOS (LibreSSL) and Linux (OpenSSL 3.x). The encoding pitfalls I've identified need hands-on testing, not just documentation.
- **ux-strategy-minion**: To determine how to present the trust model and timestamp limitation on the verify page without overwhelming non-technical users while still being precise enough for forensic use cases.
- **test-minion**: To add CI coverage that runs the published verification commands against a known-good WACZ, catching regressions if the signing format changes.
