## Domain Plan Contribution: security-minion

**Date:** 2026-03-16
**Task:** Key versioning for Ed25519 WACZ signing flow -- security review of proposed approach

---

### Current State Assessment

The existing verification model has a strong security property that must be explicitly preserved:
`verifyWacz()` receives `publicKeyBytes` from the server environment (`getSigningKeys(env)`) and
never uses the `publicKey` embedded inside the WACZ for the verification decision. The test suite
has an explicit "key substitution attack" test confirming this. Any key versioning scheme must
maintain this property -- the WACZ-embedded key is informational only, not a trust anchor.

The proposed plan breaks this invariant: it asks `verifyWacz()` to read `keyId` from the WACZ and
use it to look up a key from KV. That changes the trust model from "server decides which key to
use" to "WACZ contents decide which key to use." The analysis below addresses each question and
prescribes an exact design.

---

### Recommendations

#### 1. Key Fingerprint Truncation: 8 hex chars is borderline; use 16

**Finding: LOW-MEDIUM**

8 hex characters = 32 bits of fingerprint space. For a pure collision attack against the fingerprint
namespace, birthday probability reaches ~1% around 2^16 keys -- 65,000 archived keys. That is
unrealistic for WRL's use case (key rotation happens rarely, not thousands of times). The real
concern is a preimage attack: an adversary generating a malicious key with a matching 8-char
fingerprint in order to substitute it in KV. At 2^32 operations, this is feasible on modern
hardware in minutes.

**Recommendation:** Use 16 hex characters (8 bytes, 64 bits). This makes preimage attacks
computationally infeasible (~2^64 operations) while still being short and readable. The KV key
becomes `signing-key:{16-char-hex}`. Change the truncation from `:substring(0, 8)` to
`:substring(0, 16)`.

Implementation note: the fingerprint is computed over the raw 32-byte public key using SHA-256
(`crypto.subtle.digest('SHA-256', publicKeyBytes)`), then hex-encoded, then truncated. The
existing `sha256()` in `warc.js` returns a `sha256:{hex}` string -- do not reuse it here. Compute
the raw digest and hex-encode it directly to get a clean fingerprint without the `sha256:` prefix.

#### 2. WACZ-Directed Key Lookup: the trust model must stay server-side

**Finding: HIGH -- requires explicit design guardrail**

The core concern is this: if `verifyWacz()` reads `keyId` from the WACZ body and uses it to
look up the public key to verify against, an attacker who can write to KV (or who compromises the
KV namespace) can substitute any key they like. The WACZ controls which key is used for its own
verification. This is equivalent to letting a document specify its own signing certificate -- it
breaks the chain of trust.

The correct design keeps key resolution server-side and out of `verifyWacz()`:

```
handleVerifyCapture()
  -> getSigningKeys(env)           // gets CURRENT key (as today)
  -> getCapture(env.KV, captureId) // reads KV record
  -> record.wacz.keyId             // keyId recorded at SIGNING time, server-controlled
  -> lookupHistoricalKey(env.KV, keyId)  // resolve to publicKeyBytes
  -> verifyWacz(waczBytes, publicKeyBytes)  // signature unchanged
```

The WACZ record in KV (stored in `completeCapture()`) must include the `keyId` that was active at
signing time. This is the authoritative source. The `keyId` inside the WACZ itself is redundant
(but fine to include for external/offline verifiers). Server-side verification MUST use the KV
record's `keyId`, not the WACZ's.

`verifyWacz()` keeps its current signature: `(waczBytes, publicKeyBytes)`. It does not change. All
key resolution happens in the handler before `verifyWacz()` is called.

#### 3. Idempotent Auto-Archive on Every Sign Operation

**Finding: LOW -- acceptable with one constraint**

Auto-archiving the public key to KV on every sign operation is safe because Ed25519 public keys
are not sensitive -- publishing them is intentional. The idempotency concern is real: KV puts are
not conditional (no CAS operation). If two sign operations fire concurrently with the same key, both
will write the same value under the same KV key. This is harmless because the value is deterministic
(the public key bytes never change for a given `keyId`).

One constraint: the archive write must be `waitUntil()` (fire-and-forget), not in the critical
path of WACZ assembly. KV write failures must not cause signing to fail. The signing flow must
succeed even if the archive write fails. Log the failure at warning level so ops can detect KV
degradation.

**Do not** archive the private key. The archive should store only:
```json
{ "algorithm": "Ed25519", "publicKey": "<base64>", "keyId": "<16-char-hex>", "archivedAt": "<ISO>" }
```

#### 4. Backward Compatibility for WACZ Bundles Without keyId

**Finding: MEDIUM -- requires deliberate design, not just a fallback**

Silently falling back to the current key for legacy WACZ bundles is dangerous because it means an
attacker can strip the `keyId` field from a newer WACZ to force verification against the current
(wrong) key. The result would be a false negative (verified: false) rather than a false positive --
but the behavior is confusing and the attack surface is real if the current key and the signing key
at the time of capture happen to be the same.

The correct behavior depends on where `keyId` is resolved:

- If resolution is from **KV record** (recommended above): legacy records that were written before
  this change will have no `keyId` in their KV entry. The fallback is: if `record.wacz.keyId` is
  absent, use `getSigningKeys(env).publicKeyBytes` (the current key). This is safe because
  legacy captures were signed with whatever was the current key at the time, which is still the
  current key (no rotation has occurred yet).

- After a key rotation: there is no safe fallback for legacy bundles. The correct answer is: they
  cannot be verified because the signing key is gone. The response should reflect this honestly
  (`verified: false`, detail: `signing key for this capture is no longer available`).

Do not silently fall back to the current key for all cases. Be explicit.

#### 5. /.well-known/signing-keys Endpoint -- Information Disclosure Risk

**Finding: MEDIUM**

Serving all historical public keys publicly has two risk dimensions:

**Operational security:** Public keys are not secrets. Publishing them is correct and necessary for
third-party verifiers. This is not a disclosure risk in the traditional sense.

**Enumeration / operational intelligence:** A full key history with timestamps reveals when key
rotations occurred. Rotation events may correlate with security incidents. For a service whose
legal admissibility depends on trust, that correlation could be used to cast doubt on captures
signed near a rotation boundary ("was this key rotated because it was compromised?"). This is a
reputational risk, not a direct attack vector.

**Attack surface expansion:** An endpoint that enumerates all historical keys by scanning KV
prefix `signing-key:` introduces a new DoS vector if an attacker can trigger many distinct keyId
lookups. KV list operations are more expensive than point gets. Rate-limit this endpoint using the
existing `VERIFY_RATE_LIMITER`.

**Recommendation:** The endpoint is acceptable, but:
1. Apply `VERIFY_RATE_LIMITER` (already done for `/.well-known/signing-key` in `handleGetSigningKey`).
2. Cap the number of keys returned (max 50 or a configurable limit) to prevent unbounded KV list.
3. Do not include `archivedAt` timestamps in the public response -- they give away rotation cadence.
   Return only `{ keyId, algorithm, publicKey }` per entry.
4. Consider whether this endpoint needs to exist at all for the MVP. Third-party verifiers can
   request the key for a specific `keyId` instead of the full list. A `GET /.well-known/signing-keys/{keyId}`
   point-lookup endpoint is lower risk than a list endpoint.

---

### Proposed Tasks

These are implementation-level tasks derived from the security analysis. They are ordered by
dependency, not priority.

**T1 -- Fingerprint computation utility (signing.js)**
Add a `computeKeyId(publicKeyBytes)` function that: (a) computes raw SHA-256 digest of the 32-byte
public key, (b) hex-encodes the result, (c) returns the first 16 characters. Do not reuse the
`sha256()` helper from `warc.js` -- it prepends `sha256:` prefix. Use `crypto.subtle.digest`
directly. This function is used in both `buildWacz()` and `handleVerifyCapture()`.

**T2 -- WACZ signing: embed keyId in signedData (wacz.js)**
In `buildWacz()`, after computing `publicKeyBytes`, call `computeKeyId(publicKeyBytes)` and include
`keyId` in `digestDoc.signedData`. The `signedData` field must remain structurally backward-compatible
(adding a new field is safe for existing parsers). Also return `keyId` from `buildWacz()` so the
caller can store it.

**T3 -- KV record: store keyId at capture completion (kv.js + capture.js)**
`completeCapture()` must store the `keyId` in the `wacz` field of the KV record:
`{ key, bundleHash, size, keyId }`. The `keyId` comes from the return value of `buildWacz()`.
This is the authoritative source for verification key selection -- not the WACZ contents.

**T4 -- Auto-archive public key to KV on sign (wacz.js or capture.js)**
After a successful `buildWacz()`, archive the public key to KV under `signing-key:{keyId}`:
```json
{ "algorithm": "Ed25519", "publicKey": "<base64>", "keyId": "<16-char-hex>" }
```
This write must be: (a) idempotent (same value every time for same keyId), (b) `ctx.waitUntil()`
fire-and-forget, (c) logged at warn level on failure. No TTL -- key archive records persist
indefinitely.

**T5 -- Verification: resolve key from KV record, not WACZ (index.js)**
In `handleVerifyCapture()`, after fetching the KV record, check `record.wacz.keyId`. If present,
call `lookupHistoricalKey(env.KV, keyId)` to get `publicKeyBytes`. If absent (legacy capture),
fall back to `getSigningKeys(env).publicKeyBytes`. If lookup returns null (key not archived), return
`verified: false` with detail `signing key for this capture is no longer available`. Pass the
resolved `publicKeyBytes` to `verifyWacz()`. `verifyWacz()` itself does not change.

**T6 -- New KV helper: lookupHistoricalKey (kv.js)**
Add `lookupHistoricalKey(kv, keyId)` that does a point get on `signing-key:{keyId}` and returns the
raw `publicKeyBytes` as `Uint8Array` (decoded from the stored base64), or `null` if not found.
Validate that the result is exactly 32 bytes before returning. Return `null` on any parse/decode
error.

**T7 -- /.well-known/signing-keys endpoint (index.js) -- optional, deferrable**
If building the list endpoint: add route `GET /.well-known/signing-keys`, apply `VERIFY_RATE_LIMITER`,
enumerate KV prefix `signing-key:` with a hard limit of 50 keys, return array of
`{ keyId, algorithm, publicKey }` (no `archivedAt`). Consider deferring to post-MVP.

**T8 -- Update verifyWacz() signature and tests**
`verifyWacz()` does NOT change its signature. However, the existing test "key substitution attack
detected" must still pass. Add new tests: (a) verify with historical key from KV succeeds,
(b) keyId absent from KV record falls back to current key, (c) keyId present but no archive entry
returns verified: false with appropriate detail.

---

### Risks and Concerns

**R1 -- KV as a trust anchor for key resolution (HIGH)**
If the KV namespace is compromised (write access obtained), an attacker can substitute a key archive
entry under any `keyId`, making fraudulent captures verify correctly. The existing model is stronger
because the only key is in the environment (Worker secret), which is harder to compromise than KV.

Mitigation: key archive entries in KV should be treated as append-only. Consider adding a
`writtenAt` timestamp and logging any overwrite (put to an existing key) as a security event. KV
does not support native CAS, but you can check-then-write on best-effort basis. Alert if a key
archive entry changes value for a given `keyId`.

**R2 -- Race condition: archive write happens after KV record write (LOW)**
If `completeCapture()` writes the KV record (including `keyId`) before the archive write to
`signing-key:{keyId}` completes, a very fast verification request could find `keyId` in the record
but no corresponding archive entry, and incorrectly return `verified: false`. The fire-and-forget
nature of the archive write makes this a real (if small) window.

Mitigation: perform the archive write synchronously before `completeCapture()`, not as
`waitUntil()`. The performance cost is a single KV put on the signing hot path -- acceptable.
Alternatively: on `lookupHistoricalKey()` failure, fall back to `getSigningKeys(env)` and compare
the fingerprint to the requested `keyId` as a last resort. If they match, the current key is the
right one and the archive write just hasn't landed yet.

**R3 -- keyId collision attack (LOW, addressed by using 16 chars)**
At 8 hex chars (32 bits), a targeted preimage attack (generate a key with a specific fingerprint)
requires ~2^32 SHA-256 evaluations, achievable in minutes with modern hardware. Using 16 hex chars
(64 bits) raises this to ~2^64 -- infeasible. See Recommendation 1.

**R4 -- verifyWacz() trust model regression (HIGH, must not happen)**
Any implementation that makes `verifyWacz()` accept a key lookup hint from within the WACZ bytes
creates a TOCTOU / attacker-controlled dispatch vulnerability. The current design explicitly
documents: "publicKeyBytes comes from the server (getSigningKeys(env)) -- never from the WACZ
itself." The new design must preserve this invariant. The `verifyWacz()` function signature stays
as `(waczBytes, publicKeyBytes)`. Key resolution happens in the handler. This is the single most
important security constraint of this feature.

**R5 -- Offline/third-party verification use case (INFORMATIONAL)**
External verifiers cannot use the KV lookup path. They must rely on the `keyId` embedded in the
WACZ and fetch the corresponding public key from the `/.well-known/signing-keys/{keyId}` endpoint
(or a signed key manifest). This is a legitimate use case that the `keyId` field enables -- but the
server-side verification path must not depend on it. The two paths are independent by design.

**R6 -- Legacy WACZ bundles: honest failure preferred over silent fallback**
If a key rotation has occurred and a legacy WACZ (no `keyId` in KV record) was signed with a key
that is no longer current, verification will fail. This is correct behavior. The service should
not silently fall back to the current key for all legacy bundles -- that would accept bundles as
verified when the actual signing key is unknown. The fallback to current key is safe only for the
period before first rotation (when no rotation has occurred, the current key is the only key that
has ever existed).

---

### Additional Agents Needed

None. The security analysis is self-contained. Implementation is straightforward once the trust
model constraint (key resolution stays server-side) is clear.

The test-minion should be aware that:
1. The existing "key substitution attack" test in `verify.test.js` is a required regression guard --
   it must continue passing unchanged.
2. New tests must cover the historical key lookup path and the legacy fallback path.
3. The KV write race (R2) should have a test: verify returns a sensible result even when
   `lookupHistoricalKey()` returns null for a newly-signed capture.
