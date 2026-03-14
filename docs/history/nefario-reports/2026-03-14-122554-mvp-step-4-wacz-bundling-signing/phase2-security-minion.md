# Domain Plan Contribution: security-minion

## Recommendations

### 1. Key Generation: `crypto.generateKey("Ed25519")` is NOT the correct approach

This is the most critical finding. The Cloudflare Workers Web Crypto API has
fragmented Ed25519 support across two algorithm identifiers, and neither
provides a clean path for the proposed architecture:

**Standard Ed25519 (Secure Curves API):** Supports `sign()` and `verify()`
but does NOT support `generateKey()` or `importKey()`. You cannot generate
or import keys with this identifier.

**Legacy NODE-ED25519:** Supports `importKey()` for public keys (raw format)
and `sign()`/`verify()`, but Cloudflare explicitly disallows raw import of
private keys. PKCS8 format import may work but has known issues (community
reports of "Invalid PKCS8 input" errors).

**Recommended approach: Use `node:crypto` module instead.** Since the project
already has `nodejs_compat` enabled in `wrangler.toml`, the full Node.js
`crypto` module is available. The Cloudflare docs state all `node:crypto` APIs
are supported, with exceptions only for DSA, DH, ed448, and x448 -- Ed25519
is NOT in the exception list. This means:

- **Key generation (one-time, offline):** Use `crypto.generateKeyPairSync('ed25519')`
  in a local Node.js script. Export the private key as raw 32 bytes (or PKCS8
  DER), base64-encode it, and store via `wrangler secret put SIGNING_KEY`.
- **Key import at Worker startup:** Use `crypto.createPrivateKey()` to import
  the base64-decoded key material as a `KeyObject`, then derive the public key
  with `crypto.createPublicKey(privateKey)`.
- **Signing:** Use `crypto.sign(null, data, privateKey)` (the `null` digest
  is correct for Ed25519 -- it handles its own internal SHA-512).
- **Verification:** Use `crypto.verify(null, data, publicKey, signature)`.

This approach avoids the Web Crypto API fragmentation entirely and uses a
well-tested, standards-compliant code path.

**Alternative fallback:** If `node:crypto` Ed25519 proves unreliable in the
Workers runtime, wrap the raw 32-byte seed in a PKCS8 DER envelope (a fixed
16-byte ASN.1 prefix: `302e020100300506032b657004220420` + 32-byte seed = 48
bytes total) and import via `crypto.subtle.importKey('pkcs8', ...)` with the
NODE-ED25519 algorithm. This is a well-known technique but adds complexity.
Test the `node:crypto` path first.

**Security implication:** The plan as written references
`crypto.generateKey("Ed25519")` + `exportKey("raw")` which will fail at
runtime. If this is not caught during implementation, the Worker will be
unable to sign captures, resulting in unsigned bundles being stored -- a
silent integrity failure. This must be validated in integration tests before
any other signing work proceeds.

### 2. Public key derivation at Worker startup: acceptable, with caveats

Deriving the public key from the stored private key on every cold start is
cryptographically sound and operationally acceptable for MVP:

**No timing risk for the derivation itself.** Ed25519 public key derivation
is a scalar multiplication on Curve25519 -- a constant-time operation by
design. There is no timing side-channel that reveals the private key during
derivation. The operation takes <1ms on modern hardware.

**No key exposure risk from the derivation.** The public key is derived
deterministically from the private key and is, by definition, public
information. Deriving it at startup vs. storing it separately changes nothing
about the security model.

**Operational concern: cold start latency.** Key derivation adds a small but
measurable overhead to every cold start. For Workers, cold starts happen
frequently (after idle timeout, across isolates, after deploys). Measure the
actual latency in the Workers runtime -- if it exceeds a few milliseconds,
consider caching the derived public key in a module-scoped variable
(acceptable because the public key is not secret). The private key `KeyObject`
should also be cached in module scope to avoid repeated import on every
signing call.

**Recommendation:** Cache both the imported private `KeyObject` and the
derived public key in module-scoped variables, initialized lazily on first
use. This avoids re-import on every request while keeping the key material
in-process only.

```javascript
let _privateKey = null;
let _publicKey = null;

function getSigningKeys(env) {
  if (!_privateKey) {
    // Validate and import once per isolate lifetime
    const raw = base64ToBytes(env.SIGNING_KEY);
    validateKeyMaterial(raw);
    _privateKey = crypto.createPrivateKey({
      key: Buffer.from(raw),
      format: 'der',
      type: 'pkcs8',
    });
    _publicKey = crypto.createPublicKey(_privateKey);
  }
  return { privateKey: _privateKey, publicKey: _publicKey };
}
```

**Security note on module-scoped caching:** Module-scoped variables persist
for the lifetime of a Worker isolate. In Cloudflare Workers, each isolate
serves requests from potentially different users (multi-tenant by design).
However, since WRL is a single-operator MVP with one API key, and the signing
key is a service-level secret (not per-user), module-scoped caching is
acceptable. The private key is already available in `env.SIGNING_KEY` for the
entire isolate lifetime anyway -- caching the `KeyObject` does not expand the
exposure window.

### 3. Wrangler secrets: adequate for MVP, with defensive practices

Cloudflare Workers secrets (`wrangler secret put`) provide:
- Encryption at rest in Cloudflare's infrastructure
- Hidden from the Cloudflare dashboard after creation
- Not stored in `wrangler.toml` or any VCS-tracked file

**However, at runtime there is NO difference between a secret and an
environment variable.** The secret's value is a plain string accessible via
`env.SIGNING_KEY`. Cloudflare provides no runtime obfuscation, no automatic
redaction from logs, and no protection against accidental exposure in stack
traces or error messages.

**Pitfalls and mitigations:**

| Pitfall | Mitigation |
|---------|------------|
| `console.log(env)` dumps all bindings including secrets | Never log the `env` object. Lint rule or code review policy. |
| Unhandled exception stack traces may include `env` in closure context | Signing module must have its own try/catch that never rethrows with secret context |
| `.dev.vars` file committed to VCS | Already in `.gitignore` -- verify this. Add `SIGNING_KEY` to a pre-commit check that rejects secrets patterns. |
| Wrangler debug logging at verbose levels | Never use `--log-level debug` in production. Document this. |
| `process.env.SIGNING_KEY` accessible with `nodejs_compat` | This is by design -- no additional exposure beyond `env.SIGNING_KEY` |

**Defensive coding rules for the signing module:**
1. Never pass the raw key string beyond the import function. Import it into a
   `KeyObject` immediately and discard the string reference.
2. Never log any variable that could contain key material. No `console.log`
   in the signing module at all.
3. The signing module must catch all internal errors and return a sanitized
   error -- never let a ReferenceError or TypeError from key handling
   propagate to the response handler with variable names intact.
4. Add a comment `// SECURITY: env.SIGNING_KEY is accessed here and nowhere
   else` at the single point of access.

### 4. Key material validation: MUST validate, MUST refuse to sign

The signing module must defensively validate key material before use. This is
not optional -- a malformed key that silently produces invalid signatures is
worse than a key that loudly refuses to work.

**Validation checks:**

1. **Presence:** `env.SIGNING_KEY` must exist and be a non-empty string.
   Without it, the Worker is misconfigured.
2. **Base64 validity:** The value must decode cleanly from base64. Reject if
   it contains characters outside the base64 alphabet.
3. **Length:** After base64 decoding, the raw material must be exactly 32
   bytes (for raw seed) or 48 bytes (for PKCS8 DER-wrapped seed). Any other
   length indicates corruption or misconfiguration.
4. **Import success:** The `createPrivateKey()` call must succeed. If it
   throws, the key material is malformed.

**Failure behavior:**

- **If validation fails at startup (first request):** The signing module must
  refuse to sign. Return an internal error that results in a 500 response to
  the capture request. Log a sanitized message: "Signing key validation
  failed" (never log the key material or the specific failure reason to
  avoid oracle attacks).
- **Do NOT refuse to start the Worker.** Workers don't have a startup hook
  that can prevent the isolate from serving requests. Instead, fail on the
  first signing attempt and every subsequent one until the key is fixed.
- **Do NOT fall back to unsigned bundles.** An unsigned bundle violates the
  core value proposition. If signing fails, the capture must fail. Storing an
  unsigned bundle that looks like a signed one is a silent integrity failure.
- **The capture pipeline should call `failCapture()` with a non-retryable
  error** when signing fails due to key validation. The operator must fix the
  secret configuration; retrying will not help.

**Validation timing:** Validate lazily on first use (not eagerly at module
load). Workers modules are loaded before `env` is available -- the signing
key is only accessible inside the `fetch()` handler via the `env` parameter.

### 5. Canonical JSON: the proposed approach works, with specific guardrails

The approach of "sorted keys, no whitespace" for canonical JSON is
functionally equivalent to a subset of RFC 8785 (JSON Canonicalization
Scheme) and is adequate for this use case, provided specific edge cases are
handled.

**Edge cases that could break determinism:**

| Edge Case | Risk | Mitigation |
|-----------|------|------------|
| **Floating-point numbers** | JavaScript's `JSON.stringify` of floats can produce different representations for the same mathematical value on different engines (e.g., `0.1 + 0.2` = `0.30000000000000004`). | WRL manifests should contain only string values for hashes and timestamps, and integer values for version numbers. **Do not include floating-point numbers in the manifest.** Enforce this with a schema check. |
| **Unicode normalization** | The string `"\u00e9"` (e-with-acute) and `"e\u0301"` (e + combining acute) are visually identical but produce different JSON bytes. `JSON.stringify` does NOT normalize. | URLs are the only user-sourced string in the manifest. URLs are ASCII-safe by RFC 3986. Hash values are hex strings. Timestamps are ISO 8601 (ASCII). **No normalization needed for WRL's data types**, but document this assumption. |
| **Key ordering depth** | `JSON.stringify` with a replacer that sorts keys must sort recursively, not just at the top level. | Use a recursive sort function or `JSON.stringify(obj, Object.keys(obj).sort())` is insufficient for nested objects. Write a `canonicalize()` helper that deep-sorts. |
| **`undefined`, `NaN`, `Infinity`** | `JSON.stringify` silently drops `undefined` properties, converts `NaN` and `Infinity` to `null`. | Validate the manifest object has no undefined, NaN, or Infinity values before canonicalization. |
| **Prototype pollution** | If `Object.keys()` picks up inherited properties, the canonical form changes. | Use `Object.create(null)` for manifest construction or `Object.keys()` (which only returns own properties). |
| **Integer precision** | SHA-256 hashes as hex strings: safe. But if any numeric field exceeds `Number.MAX_SAFE_INTEGER`, precision is silently lost. | Version field is a small integer. No other numeric fields in the manifest. Document this constraint. |
| **Property insertion order** | `JSON.stringify` outputs keys in insertion order. Two objects with the same keys added in different orders produce different JSON. | The explicit key-sorting step handles this. But the sort must use a stable, well-defined comparator. Use `Array.prototype.sort()` with no custom comparator (default is lexicographic, which matches UTF-16 code unit order per RFC 8785). |

**Recommended implementation:**

```javascript
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}
```

This is ~5 lines, zero dependencies, handles recursive sorting, and produces
the same output as RFC 8785 for the data types WRL uses. Test it with a
frozen set of known inputs and expected outputs (golden tests).

**Critical test:** The canonical JSON test must verify that the same manifest
object, constructed in different key insertion orders, produces byte-identical
output. This is the single property that makes the entire signing chain work.

### 6. Additional security concerns for WACZ bundling

**ZIP construction:**
- The ZIP file must be constructed deterministically. ZIP metadata includes
  timestamps, file ordering, and compression settings. If any of these vary
  between identical captures, the content-addressed R2 key
  (`captures/{sha256}.wacz`) will differ for semantically identical bundles.
  Use fixed timestamps (e.g., Unix epoch) in ZIP metadata, fixed file
  ordering, and `STORE` (no compression) to ensure determinism.
- The SHA-256 used for the content-addressed key is computed over the final
  ZIP bytes. Verify that the same artifacts always produce the same ZIP bytes.

**bundleHash scope:**
- The `bundleHash` must be computed over the canonical JSON of the
  `datapackage.json` manifest EXCLUDING the `signatures` array. If the
  signatures are included in the hash input, you have a circular dependency
  (the signature depends on the hash, the hash depends on the signature).
  The spec should explicitly define which fields of `datapackage.json` are
  included in the `bundleHash` input.

**Signature covers the right thing:**
- The Ed25519 signature signs the `bundleHash`, which is a SHA-256 digest.
  This is a sign-the-hash pattern, which is standard and correct for Ed25519
  (Ed25519 internally applies its own SHA-512, so signing a SHA-256 hash is
  safe -- there is no double-hashing weakness).

**Content-addressed key collision:**
- The R2 key `captures/{sha256}.wacz` is the SHA-256 of the WACZ file
  content. SHA-256 collision resistance is approximately 2^128 -- practically
  unbreakable. However, verify that `BUCKET.put()` with the same key is
  idempotent or that duplicate captures are detected before writing.

**Private key in WACZ bundle:**
- Verify that the private key NEVER appears in any artifact stored in R2.
  The public key appears in the manifest (correct). The private key must
  remain only in `env.SIGNING_KEY` and the in-memory `KeyObject`.

---

## Proposed Tasks

### Task 1: Validate Ed25519 API availability in Workers runtime

**What:** Write a minimal spike test that exercises the exact Ed25519 code
path in the Cloudflare Workers runtime (via vitest + miniflare pool). Test
both approaches: (a) `node:crypto` `createPrivateKey` + `sign` + `verify`
and (b) Web Crypto `importKey('pkcs8', ..., 'NODE-ED25519')` + `sign` +
`verify`. Determine which approach works reliably.

**Deliverables:** A test file that passes in the miniflare pool, confirming
the chosen API can import a key, sign arbitrary data, and verify the
signature. This test becomes the foundation for all signing tests.

**Dependencies:** None. Must be done FIRST before any signing implementation.

### Task 2: Implement key generation script (offline, one-time)

**What:** Write a standalone Node.js script (`scripts/generate-signing-key.js`)
that generates an Ed25519 keypair, outputs the private key as base64 (for
`wrangler secret put SIGNING_KEY`), and outputs the public key as base64
(for reference). The script must print clear instructions for the operator.

**Deliverables:** `scripts/generate-signing-key.js`, operator instructions in
a comment block. The script must NOT write keys to any file in the repo.

**Dependencies:** Task 1 (to confirm the key format that works).

### Task 3: Implement signing module (`src/signing.js`)

**What:** A single module that:
1. Lazily imports and validates key material from `env.SIGNING_KEY`
2. Derives the public key from the private key
3. Caches both in module-scoped variables
4. Exports `signBundle(env, bundleHashBytes) -> { signature, publicKey }`
5. Exports `verifySignature(publicKey, bundleHashBytes, signature) -> boolean`
6. Exports `getPublicKey(env) -> base64PublicKey`
7. All internal errors are caught and sanitized
8. No `console.log` anywhere in the module

**Deliverables:** `src/signing.js` with full JSDoc.

**Dependencies:** Task 1 (API validation), Task 2 (key format).

### Task 4: Implement canonical JSON module (`src/canonical-json.js`)

**What:** A ~10-line `canonicalize(obj)` function that recursively sorts
keys and produces deterministic JSON with no whitespace. Must handle nested
objects and arrays.

**Deliverables:** `src/canonical-json.js` with golden tests proving
determinism across different key insertion orders.

**Dependencies:** None.

### Task 5: Implement bundleHash computation

**What:** Define the exact scope of the `bundleHash` input (which fields of
`datapackage.json` are included, explicitly excluding `signatures`). Compute
SHA-256 of the canonical JSON of the hash-input object.

**Deliverables:** Function in the WACZ builder that computes `bundleHash`.
Documentation of the hash input scope.

**Dependencies:** Task 4 (canonical JSON).

### Task 6: Signing round-trip integration test

**What:** Test that covers: generate a known manifest -> compute bundleHash
-> sign with Ed25519 -> verify signature -> assert true. Then: tamper with
one byte of the bundleHash -> verify -> assert false.

**Deliverables:** Passing vitest test in the miniflare pool.

**Dependencies:** Tasks 3, 4, 5.

### Task 7: Key validation failure tests

**What:** Tests covering: missing `SIGNING_KEY`, empty string, invalid
base64, wrong length (31 bytes, 33 bytes), valid format but corrupted key
material. Each must result in a failed capture (not an unsigned bundle).

**Deliverables:** Passing vitest tests.

**Dependencies:** Task 3.

### Task 8: Secret hygiene verification

**What:** A test or CI check that:
1. Greps the codebase for `console.log` in `src/signing.js` (must find none)
2. Verifies `.gitignore` includes `.dev.vars` and `.env`
3. Verifies `wrangler.toml` does not contain `SIGNING_KEY`
4. Verifies no file in `src/` contains a base64 string that decodes to
   exactly 32 or 48 bytes (heuristic for hardcoded keys)

**Deliverables:** CI-runnable check script or vitest test.

**Dependencies:** Task 3.

---

## Risks and Concerns

### Risk 1: Ed25519 API instability in Cloudflare Workers (HIGH)

The Web Crypto API support for Ed25519 in Cloudflare Workers is fragmented
between two algorithm identifiers with different capability sets, community
reports of PKCS8 import errors, and explicit documentation that raw private
key import is disallowed. The `node:crypto` path (via `nodejs_compat`) is
likely more reliable but has not been explicitly confirmed for Ed25519 in
Workers' documentation.

**Mitigation:** Task 1 (spike test) must be completed before any signing
implementation begins. If neither the `node:crypto` nor Web Crypto path works
for Ed25519 signing in the Workers runtime, the project must either:
(a) use a WASM-compiled Ed25519 library (e.g., `@noble/ed25519`), or
(b) switch to ECDSA P-256 (which has full, well-tested Web Crypto support in
Workers) at the cost of larger signatures and a design deviation.

### Risk 2: Silent signing failure producing unsigned bundles (CRITICAL)

If the signing step fails but the capture pipeline does not detect the
failure, unsigned WACZ bundles will be stored in R2. These bundles will look
like valid captures but will fail verification, undermining the entire value
proposition. Worse, if the `signatures` array is simply empty rather than
absent, the verification endpoint might report "verified: true" (no
signatures to fail) instead of "verified: false".

**Mitigation:** The WACZ builder must treat a missing or empty `signatures`
array as a fatal error. The verification endpoint must require at least one
valid signature. The capture pipeline must call `failCapture()` if signing
fails -- never store a bundle without a valid signature.

### Risk 3: Non-deterministic ZIP breaking content-addressed storage (MEDIUM)

If the ZIP construction is not deterministic (different timestamps, file
order, or compression per build), the same capture will produce different
WACZ files with different SHA-256 hashes. This means duplicate captures of
the same page at the same instant could produce different R2 keys, wasting
storage and creating confusion. More critically, if a verification process
independently reconstructs the WACZ from its artifacts, the ZIP bytes must
match for the content-addressed key to verify.

**Mitigation:** Use `STORE` mode (no compression), fixed Unix epoch
timestamps in ZIP entries, and a fixed file ordering (alphabetical). Add a
golden test: build a WACZ from the same artifacts twice and assert
byte-identical output.

### Risk 4: Canonical JSON divergence across runtimes (LOW for MVP, MEDIUM long-term)

If a third-party verifier reimplements the canonical JSON function in a
different language (Python, Go, Rust), subtle differences in JSON
serialization (number formatting, Unicode escape handling) could cause
`bundleHash` mismatches. This is unlikely for WRL's data types (all strings
and small integers) but becomes a real risk if the manifest ever includes
floats or non-ASCII strings.

**Mitigation:** Document the canonicalization algorithm precisely. Publish
test vectors (input JSON + expected canonical bytes + expected SHA-256) as
part of the verification spec. Consider adopting RFC 8785 (JCS) formally --
it has test vectors and cross-language implementations.

### Risk 5: Key compromise with no rotation mechanism (MEDIUM, accepted for MVP)

A single Ed25519 key with no rotation mechanism means: (a) if compromised,
all future and all past captures are suspect; (b) the operator must generate
a new key and redeploy, with no way to mark the old key as revoked. This was
flagged in the scoping phase and accepted for MVP.

**Reminder for implementation:** The `datapackage.json` manifest should
include the `publicKey` in the `signatures` entry (as designed). This means
each bundle is self-contained for verification -- a key rotation does not
invalidate old bundles. When the `/.well-known/signing-key` endpoint is
built (Step 8), it should serve the CURRENT public key only. Old public keys
are in the bundles themselves.

---

## Additional Agents Needed

**None beyond those already planned.** The edge-minion and data-minion
consultations cover the Worker runtime and data format aspects. The
test-minion consultation covers test strategy.

However, I strongly recommend the **edge-minion** specifically address
Question 1 from this analysis: confirming which Ed25519 API path
(`node:crypto` vs Web Crypto NODE-ED25519 vs WASM library) actually works in
the Cloudflare Workers miniflare runtime. This is a platform compatibility
question that the edge specialist is better positioned to answer
definitively, and it is a blocker for all signing implementation tasks. If
the edge-minion has not been asked this question, add it to their prompt.
