## Domain Plan Contribution: security-minion

### Recommendations

#### 1. Verification MUST use the server's signing key, not the embedded key

The comment in `wacz.js:99-100` is clear and correct:

> Verifiers MUST pin against an operator-published key, not trust the embedded key blindly.

**What this means for implementation:** The verification endpoint must derive
the public key from `env.SIGNING_KEY` (via `getSigningKeys(env)`) and use
those `publicKeyBytes` for signature verification. It must NOT extract and
trust the `signedData.publicKey` field from `datapackage-digest.json` inside
the WACZ.

**Why:** If the endpoint trusted the embedded key, an attacker who tampered
with a WACZ could replace both the signature and the embedded public key with
their own key pair. The verification would pass because the attacker-supplied
signature validates against the attacker-supplied key. This is a classic
confused-key / key substitution attack. The server's `env.SIGNING_KEY` is the
trust anchor -- it is the only key the operator controls.

**Implementation detail:** The endpoint should:
1. Call `getSigningKeys(env)` to get `publicKeyBytes` (the server's key).
2. Read `datapackage-digest.json` from the WACZ to get the `signedData.signature`
   and `signedData.hash` (the bundleHash string).
3. Call `verifySignature(publicKeyBytes, enc.encode(signedData.hash), signedData.signature)`.
4. Independently recompute bundleHash from `datapackage.json` inside the WACZ:
   parse datapackage.json, canonicalize it, SHA-256 hash it, compare to
   `signedData.hash`.

The embedded `signedData.publicKey` can be returned in the response for
informational purposes (so third parties know which key was used), but it
plays zero role in the verification decision.

**Key-absent graceful degradation:** If `env.SIGNING_KEY` is not configured,
the endpoint should return 503 ("Verification service is not configured") --
never silently skip signature verification. A verification endpoint that
cannot verify signatures must not claim things are verified.

#### 2. Cache-Control: public, immutable creates a real risk under key compromise

**Risk level: MEDIUM** -- the scenario requires a key compromise, which is
itself high-severity, but the caching exacerbates the blast radius.

The problem: If the signing key is compromised and rotated, any verification
response cached at CDN edges or in client caches with `max-age=31536000`
(1 year) and `immutable` will continue to report `verified: true` for captures
signed with the compromised key. Conversely, after key rotation, re-verification
of legitimately-signed captures will fail because the new key won't match the
old signatures, but the cached "verified" response will mask this until the
cache entry expires -- which could be a year.

**Recommended mitigation -- two-tier caching:**

Use a shorter but still aggressive cache duration:
```
Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```
This gives:
- 24-hour hard cache (covers the 99% case where nothing changes)
- 7-day stale-while-revalidate (performance under normal conditions)
- Maximum 24-hour window to propagate a key revocation

**Why not `immutable`:** The `immutable` directive tells clients to never
revalidate. For content that could become invalid (key compromise, discovered
tampering), this is dangerous. Immutable is appropriate for content-addressed
blobs (the WACZ file itself, artifacts addressed by hash) but not for
verification *judgments* that depend on a mutable trust anchor (the signing key).

**Alternative considered and rejected:** Adding a `?keyVersion=N` cache-buster
parameter. This shifts complexity to key management and requires clients to
know the key version. Shorter TTL is simpler and self-healing.

**Backlog item for later:** A key revocation mechanism (publish revoked key
hashes, verification checks against revocation list) is the proper long-term
solution but is out of MVP scope. Note the backlog already has
"[should] Old public key archive endpoint" and "[should] Key versioning / key
ID in signature entries" which are prerequisites.

#### 3. Verification failure messages -- calibrate information disclosure

**Risk level: LOW** -- but worth getting right from the start.

The verification endpoint should distinguish between failure modes for
legitimate operators debugging issues, without giving attackers a roadmap for
improving their tampered artifacts.

**Recommended response categories (safe to expose):**

| Failure | Safe response detail | Why it's safe |
|---------|---------------------|---------------|
| Capture not found | Static 404 "Capture not found" | Matches existing pattern, no enumeration |
| WACZ absent | `"verified": false, "reason": "no_signature"` | Publicly visible from GET /captures/{id} already (wacz field absent) |
| Signature invalid | `"verified": false, "reason": "signature_mismatch"` | Tells attacker nothing they don't already know (they forged a sig and it didn't work) |
| bundleHash mismatch | `"verified": false, "reason": "hash_mismatch"` | Same -- attacker already knows they changed the content |
| Individual artifact hash mismatch | `"verified": false, "reason": "hash_mismatch"` | Do NOT specify which artifact failed |

**What NOT to expose:**
- Do NOT list which specific artifact hash failed (e.g., "screenshot hash
  mismatch"). This tells an attacker exactly which file they need to fix to
  pass verification. Return a single `hash_mismatch` for any content integrity
  failure.
- Do NOT return the expected vs. actual hash values. This is the most dangerous
  leak -- it gives the attacker the target hash to forge against.
- Do NOT expose internal paths (R2 keys, KV keys).
- Do NOT return timing information about which check failed first.

**For operators:** Add structured logging (console.log) with the specific
failure details server-side. This gives operators full diagnostics without
exposing them to the public.

#### 4. Rate limiting analysis -- 60 req/min per IP is adequate with caveats

**Assessment: Acceptable for MVP, with specific hardening recommendations.**

For context:
- The existing capture endpoint uses 10 req/min (expensive: browser rendering).
- Verification is read-only but involves R2 reads and crypto operations.
- 60 req/min = 1 req/sec, which is reasonable for legitimate verification use.

**What 60/min defends against:**
- Casual abuse / enumeration attempts
- Single-origin DDoS

**What 60/min does NOT defend against:**
- Distributed enumeration across many IPs (but capture IDs are 128-bit random,
  so enumeration is computationally infeasible regardless of rate limit)
- Amplification attacks where verification triggers expensive R2 reads for
  non-existent captures (mitigated by KV lookup first -- cheap)

**Recommendations:**
1. **Check KV before R2.** The endpoint should look up the KV record first.
   If the capture doesn't exist or has no WACZ, return immediately without
   touching R2. KV reads are fast and cheap. R2 reads are the expensive part.
   This is the most important resource-exhaustion defense.
2. **Create a separate rate limiter binding** (`VERIFY_RATE_LIMITER`) rather
   than reusing `CAPTURE_RATE_LIMITER`. Different endpoints have different
   cost profiles and should have independent limits.
3. **60/min is fine for MVP.** The caching layer (recommendation #2 above)
   means repeated verification of the same capture won't even hit the worker
   after the first request.

#### 5. R2 resource exhaustion -- real concern, manageable

**Risk level: MEDIUM** -- the verification endpoint reads multiple objects
from R2 per request.

**What the endpoint needs to read from R2:**

For full verification, the endpoint needs the WACZ file from R2 to:
1. Extract `datapackage-digest.json` (get signature and bundleHash)
2. Extract `datapackage.json` (recompute bundleHash from canonical JSON)
3. Optionally: extract individual files and verify their SHA-256 hashes
   against the hashes in `datapackage.json`

**Two implementation strategies with different cost profiles:**

**Strategy A -- WACZ-based verification (fetch WACZ, verify everything):**
- Single R2 GET for the WACZ file
- Parse ZIP, extract `datapackage.json` and `datapackage-digest.json`
- Recompute bundleHash, verify signature
- Optionally verify individual file hashes within the WACZ
- **Pro:** Complete verification, proves every byte is authentic
- **Con:** Downloads entire WACZ (could be megabytes) on every uncached request

**Strategy B -- KV-based fast verification (use stored bundleHash):**
- Read bundleHash from KV record (already stored at `record.wacz.bundleHash`)
- Fetch only `datapackage-digest.json` from the WACZ to get the signature
- Verify that the signature over `bundleHash` is valid with the server key
- **Pro:** Minimal R2 read (just the digest file, not the whole WACZ)
- **Con:** Does not independently prove the WACZ contents match -- trusts the
  KV-stored bundleHash, which was written by the server at capture time

**Security recommendation:** Strategy B is insufficient as a standalone
verification. The point of verification is to prove the WACZ is authentic
*from the stored artifact*, not from the metadata record. If KV is compromised,
Strategy B proves nothing.

**Recommended approach: Strategy A with guardrails:**
1. Fetch the WACZ from R2 (single object).
2. Parse the ZIP in memory. Reject WACZ files over a size limit (e.g., 100MB)
   to prevent memory exhaustion.
3. Extract `datapackage.json` and `datapackage-digest.json`.
4. Recompute `bundleHash = sha256(canonicalize(datapackage))`.
5. Verify `bundleHash` matches `signedData.hash` in the digest.
6. Verify the Ed25519 signature over `signedData.hash` using server key.
7. Optionally (and I recommend this for full tamper-evidence): verify that
   individual file hashes in `datapackage.json.resources[]` match the actual
   files in the WACZ ZIP. This proves the WARC, CDXJ, and pages are unmodified.

**Resource exhaustion guardrails:**
- Set a maximum WACZ size for verification (reject with 422 if exceeded)
- KV lookup first (fast-fail for missing/pending captures)
- Response caching means each capture is verified from R2 at most once per
  cache TTL
- The rate limiter bounds the worst case to 60 WACZ downloads per minute per IP

**R2 cost note:** Class B operations (GET) cost $0.36 per million. Even under
sustained abuse at 60 req/min, that's ~86K/day = ~$0.03/day per attacker IP.
The bandwidth cost is more relevant for large WACZ files, but caching makes
this negligible in practice.

### Proposed Tasks

1. **Implement server-key-only verification** -- Use `getSigningKeys(env)` as
   the sole trust anchor. Return 503 if signing key is not configured. Never
   trust embedded public key for the verification decision.

2. **Implement KV-first fast-fail** -- Read KV record before any R2 access.
   Return 404 for missing/pending captures. Return `"verified": false,
   "reason": "no_signature"` if WACZ is absent. This is the primary
   resource-exhaustion defense.

3. **Implement WACZ-based full verification** -- Fetch WACZ from R2, parse
   ZIP, extract datapackage.json and datapackage-digest.json, recompute
   bundleHash from canonical JSON, verify signature with server key. Verify
   individual resource hashes within the WACZ for complete tamper-evidence.

4. **Set Cache-Control to `public, max-age=86400, stale-while-revalidate=604800`**
   instead of the proposed `immutable` directive. Add a note to the backlog
   for key revocation mechanism as a future hardening step.

5. **Create separate `VERIFY_RATE_LIMITER` binding** at 60 req/60s per IP.
   Do not share with capture rate limiter.

6. **Implement calibrated error responses** -- Use the failure categories
   defined above. Never expose which specific artifact hash failed, never
   return expected/actual hash values. Log detailed failures server-side.

7. **Add WACZ size guard** -- Reject verification for WACZ files exceeding a
   reasonable size limit (suggest 100MB) to prevent memory exhaustion during
   ZIP parsing. Return 422 with an appropriate message.

8. **Write tamper-detection integration tests** -- These must cover:
   - Valid capture verifies successfully
   - Capture with no WACZ returns `verified: false, reason: no_signature`
   - Tampered WACZ content (modified file inside ZIP) detected as hash_mismatch
   - Tampered signature detected as signature_mismatch
   - Tampered bundleHash (modified datapackage.json) detected as hash_mismatch
   - Key substitution attack (embedded key replaced with attacker key +
     attacker signature) still fails because server key is used
   - Missing/unknown capture ID returns 404
   - Rate limiting returns 429

### Risks and Concerns

**RISK 1: Key rotation breaks all existing verifications (HIGH)**
When `env.SIGNING_KEY` is rotated, every previously-signed capture will fail
verification because the new public key won't match the old signatures. This
is by design (key rotation should invalidate compromised-era signatures), but
for non-compromise rotations (e.g., scheduled key rotation, operational key
change) this is destructive.

**Mitigation path (post-MVP):** The backlog already tracks "[should] Key
versioning / key ID in signature entries" and "[should] Old public key archive
endpoint." The verification endpoint should be designed now to be extensible
toward multi-key verification: if a `keyId` field is present in
`signedData`, look up the corresponding public key. For MVP, there is only one
key and no keyId, so this is future-proofing at the design level, not
implementation effort.

**For MVP:** Accept that key rotation = full reverification break. Document
this limitation. Do not attempt multi-key support yet (YAGNI), but ensure the
response schema can accommodate it later (e.g., include a `keyFingerprint`
field in the verification response).

**RISK 2: ZIP parsing attack surface (MEDIUM)**
Parsing a ZIP file (the WACZ) from potentially-tampered R2 storage introduces
attack surface. Malformed ZIP files could trigger:
- Zip bombs (small file that decompresses to huge size)
- Path traversal in filenames (e.g., `../../etc/passwd`)
- Buffer overflows in the ZIP parser

**Mitigation:** Use `fflate` (already a dependency) for ZIP parsing with:
- Pre-check `Content-Length` / R2 object size before downloading
- Only extract specific known filenames (`datapackage.json`,
  `datapackage-digest.json`, and the paths listed in `datapackage.json.resources`)
- Validate filenames against an allowlist before extraction
- Set memory limits on decompressed size

**RISK 3: Timing oracle on verification (LOW)**
If the endpoint short-circuits on the first failed check (e.g., returns
immediately when bundleHash doesn't match, before checking the signature),
an attacker could use timing differences to determine which verification step
failed. For this system, this is low risk because:
- The failure categories are already distinguishable by the response body
- There is no secret being leaked by timing (the hashes are deterministic
  from public content)

No mitigation needed for MVP. If constant-time verification becomes a
requirement later (e.g., for blind signature schemes), it can be added.

**RISK 4: Capture ID as access secret vs. public verification (DESIGN TENSION)**
The existing system uses capture ID as the access secret ("No auth on read
endpoints -- capture ID is access secret" per `index.js:117`). The
verification endpoint is described as "public" and "no authentication required."
These are compatible only if you assume that anyone who has the capture ID is
authorized to verify it -- which is consistent with the current access model.

However, the verification endpoint with `Cache-Control: public` means CDN
caches could store verification results keyed by capture ID. If an attacker
discovers a cached URL pattern, they learn the capture ID (which is the access
secret for the full capture metadata and artifacts).

**Mitigation:** This is already mitigated by the capture ID format -- 128 bits
of randomness (`cap_` + 32 hex chars from `crypto.randomUUID()`). CDN cache
enumeration is infeasible. The cache URL is
`/v1/verify/cap_[32hex]` -- an attacker cannot enumerate this space.
No additional mitigation needed, but document the assumption that capture IDs
must remain high-entropy.

### Additional Agents Needed

No additional agents are needed beyond those likely already involved
(api-design for response schema, implementation for coding). The security
concerns are well-scoped within the existing team structure.

One note for the **test-minion** (or whoever writes tests): the tamper-detection
tests are security-critical. The key substitution attack test (item 8 above)
is the most important -- it validates the core trust model. If that test is
missing, the entire verification feature's security claim is unsubstantiated.
I can provide exact test specifications if needed during implementation.
