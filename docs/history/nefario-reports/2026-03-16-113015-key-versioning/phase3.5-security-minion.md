## Security Review: R2 Key Versioning Delegation Plan

**Verdict: ADVISE**

The plan is sound and the existing codebase has a strong security posture.
No finding here warrants a BLOCK. However, two issues require explicit
handling in the implementation to avoid introducing new weaknesses.

---

### Findings

#### HIGH: Key Substitution Attack via WACZ-Embedded keyId

**Location**: synthesis.md decision #3, handleVerifyCapture() in src/index.js

**Description**: The plan says "WACZ-embedded keyId is for offline/third-party
verifiers only" and that server verification uses the keyId from the KV
record. This is the correct call. However, the plan also says the fallback
chain for legacy captures is: current key -> all archived keys.

The danger is at the junction between "what key does the WACZ claim was used"
and "what key the server actually uses to verify." If the implementation ever
reads keyId from signedData inside the WACZ (even as a lookup hint) and passes
it to getArchivedSigningKey() without a prior check against the KV record,
an attacker who can upload a crafted WACZ could specify any archived keyId and
get the server to attempt verification with that key.

The current verify.js is correctly structured -- publicKeyBytes comes from
the server, never from the WACZ. The plan preserves this. The implementation
must maintain that invariant: keyId resolution must ONLY consult the server's
KV record, never the WACZ's signedData.keyId. The WACZ keyId should be written
into signedData for offline use but must be entirely ignored by handleVerifyCapture().

**Remediation**: The implementation plan already describes the correct approach
(server-side keyId from KV record), but the code review gate should explicitly
verify that handleVerifyCapture() never reads keyId from the parsed WACZ
content. Add a comment at that code site documenting this invariant.

---

#### MEDIUM: Legacy Fallback Iterates All Archived Keys

**Location**: synthesis.md decision #6, handleVerifyCapture() fallback logic

**Description**: For captures with no keyId in the KV record, the plan
falls back to trying every archived key. Because key count is described as
"single digits over service lifetime," the performance concern is negligible.
The security concern is different: brute-force fallback across a known-small
key set means a forgery attempt using any previously-used key would be
accepted. This is the intended behavior for the rotation use case, but it
must be clearly bounded.

Two specific risks to guard in implementation:

1. The `listArchivedSigningKeys()` call must return only verified, internal
   keys -- not anything a caller can inject. Since KV is server-controlled
   this is fine, but the KV key prefix `signing-key:{keyId}` must be
   distinct enough to prevent collision with capture record keys. The plan
   uses a clearly different prefix, which is correct.

2. The keyId is defined as the first 4 bytes (8 hex chars) of SHA-256 of
   the raw 32-byte public key. 4 bytes = 32 bits of collision space. Given
   single-digit key counts over the service lifetime this is more than
   sufficient. No action required, but document this assumption in the code.

**Remediation**: In `archiveSigningKey()`, validate that `publicKeyBase64`
decodes to exactly 32 bytes before writing. This prevents storing a malformed
or wrong-length key that would always fail verification but also prevent the
fallback from recovering.

---

#### LOW: /.well-known/signing-keys Rate Limiter Reuse

**Location**: synthesis.md Task 1, handleGetSigningKeys()

**Description**: The plan reuses VERIFY_RATE_LIMITER for the new plural
endpoint. This is reasonable given the constraint of not over-engineering.
However, the plural endpoint returns all archived keys -- potentially more
data per request than the singular endpoint -- and serves a different
population of callers (key pinning validators, auditors). If the rate limit
is shared, a burst of key archive lookups can exhaust the verify rate limit
and trigger false 429s on capture verification requests.

This is a minor ops concern, not a security flaw. At single-digit key counts
the response payload difference is negligible.

**Remediation**: Note the shared limiter in a code comment so a future
operator knows to add a dedicated limiter if request patterns diverge. No
code change required for this phase.

---

#### INFORMATIONAL: keyId Truncation Acceptable at Current Scale

**Location**: synthesis.md decision #1

The 8 hex char (32-bit) truncation of SHA-256 is explicitly sufficient here:
birthday collision probability at n=10 keys is ~(10^2)/(2*2^32) ≈ 1 in 858
million. The keyId is a lookup index, not a security primitive -- the Ed25519
signature is the security primitive. This is correctly documented in the plan.
No action required.

---

### Summary

The existing code already enforces the critical invariant: publicKeyBytes
for verification always comes from the server, never from the WACZ. The plan
preserves this. The two things the implementation must get right:

1. handleVerifyCapture() must resolve keyId exclusively from the KV record.
   The WACZ's signedData.keyId must never influence key selection.
2. archiveSigningKey() should validate the decoded public key is 32 bytes
   before persisting to KV.

Both are straightforward. The implementation can proceed with these in scope.
