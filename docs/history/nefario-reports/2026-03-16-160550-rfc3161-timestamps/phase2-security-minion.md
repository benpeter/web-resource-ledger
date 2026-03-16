## Domain Plan Contribution: security-minion

### Recommendations

#### 1. TSA Provider Selection: DigiCert as Primary

**Use `http://timestamp.digicert.com` as the default TSA endpoint.** This is the strongest choice for the Workers environment:

- **No TLS client certs required** -- plain HTTP POST with `Content-Type: application/timestamp-query`. Works with Workers `fetch()` without any special configuration.
- **SHA-256 supported** -- DigiCert has a dedicated SHA-256 timestamping URL. Matches the existing SHA-256-everywhere approach in WRL's signing pipeline.
- **CA trust chain** -- DigiCert's TSA certificate chains to a root CA that is already in every major trust store. This matters because verifiers need to validate the TSA signature, and DigiCert's chain is the easiest to validate.
- **Production-grade SLA** -- DigiCert is used by the majority of code signing tools (Microsoft SignTool, jarsigner). It handles massive volume without rate limiting typical usage.

**Avoid FreeTSA** for production. FreeTSA uses a self-signed CA root, which means verifiers would need to manually install and trust the FreeTSA root certificate. This defeats the purpose of "independently verifiable" timestamps -- the verifier must make a trust decision about an unknown CA.

**GlobalSign** (`http://timestamp.globalsign.com/tsa/v2/advanced`) is a viable fallback but less commonly used and less documented for HTTP-based RFC 3161 access.

**Recommendation**: DigiCert primary, hardcoded as default with env var override (see section 5 below). FreeTSA only for integration testing to avoid hitting DigiCert during CI.

#### 2. ASN.1 Parsing Strategy: Minimal Custom DER Parser

**Do NOT add a general-purpose ASN.1 library.** The project has two dependencies (fflate, @cloudflare/playwright) and follows YAGNI/KISS. A general ASN.1 library adds complexity for a problem that can be solved with ~150 lines of purpose-built code.

The RFC 3161 flow requires exactly two DER operations:

**Encoding (request construction):**
- Build a `TimeStampReq` with: version (INTEGER 1), messageImprint (SEQUENCE of AlgorithmIdentifier + OCTET STRING hash), nonce (INTEGER, random), certReq (BOOLEAN TRUE).
- This is a fixed structure. The only variable parts are the 32-byte SHA-256 hash and the nonce. A template-based approach works: pre-encode the static DER skeleton and splice in the hash and nonce bytes at known offsets.

**Decoding (response parsing):**
- Parse the `TimeStampResp` outer SEQUENCE to extract `status` (PKIStatusInfo) and `timeStampToken` (ContentInfo wrapping a CMS SignedData).
- From the response, you need to extract: (a) status code, (b) the embedded TSTInfo (containing genTime, messageImprint, nonce), (c) the raw token bytes for storage.
- You do NOT need to parse the full CMS SignedData structure for the MVP path. The token is stored opaquely and verified later.

**Recommended approach**: Write a minimal DER reader (~100-150 lines) that can:
1. Read TLV (tag-length-value) tuples from a Uint8Array
2. Decode INTEGER, OCTET STRING, SEQUENCE, BOOLEAN, GeneralizedTime, and OID
3. Navigate into nested SEQUENCEs by index

This is sufficient to build the request and parse the response fields needed for validation. The full CMS signature verification (see section 3) is a separate concern.

**Prior art**: The `pdf-rfc3161` library (explicitly built for Cloudflare Workers) demonstrates that this is viable in pure JS with zero native dependencies. However, evaluating it as a dependency would add more than the project needs (PDF-specific logic) -- better to extract the pattern than take the dep.

If the team strongly prefers a dependency, `@root/asn1` (therootcompany/asn1.js) is the best option: zero dependencies, <300 lines, pure JS, works in browsers and Workers. But I recommend starting without it.

#### 3. Certificate Chain Validation: Defer Full Validation, Implement Essential Checks

This is the hardest part of RFC 3161 in a constrained runtime. Full X.509 certificate chain validation requires: parsing X.509 certificates, checking signatures up to a trusted root, checking validity periods, potentially checking revocation (CRL/OCSP). Workers has no `node:tls`, no OpenSSL, no built-in certificate store.

**Tiered verification strategy:**

**Capture-time (in Workers, MUST implement):**
1. Verify response status is 0 (granted) or 1 (grantedWithMods)
2. Verify nonce in response matches nonce in request (anti-replay)
3. Verify messageImprint in TSTInfo matches the hash we submitted (anti-substitution)
4. Store the complete, unmodified DER-encoded TimeStampToken alongside the WACZ

These four checks prevent the most critical attacks: response substitution, replay, and hash mismatch. They do NOT require any certificate parsing.

**Verification-time (can be deferred to a richer runtime):**
- Full CMS signature verification over the TSTInfo
- Certificate chain validation to a trusted root
- TSA certificate validity period check
- Revocation checking (CRL or OCSP)

**Rationale for deferral**: The TSA token is stored as an opaque blob. A verifier with access to OpenSSL, Python, or any full crypto toolkit can perform complete validation offline. The WACZ + timestamp token + TSA certificate chain (if `certReq=true` in the request) contains everything needed. Trying to implement full X.509 chain validation in Workers would be fragile, error-prone, and violate KISS.

**What `crypto.subtle` CAN do in Workers**: RSA-PSS and RSASSA-PKCS1-v1_5 signature verification (DigiCert TSA uses RSA). So if you extract the raw signature bytes and the TBSCertificate bytes from the CMS structure, you could verify the TSA's signature over the TSTInfo. But this requires significant ASN.1 parsing of the CMS SignedData, which is a substantial implementation effort.

**My recommendation**: For the MVP, do capture-time checks 1-4 above (status, nonce, messageImprint, storage). Document that full chain validation is deferred to the verification-time toolchain. Add an `// @security: deferred` comment and a backlog item. This aligns with YAGNI -- ship the timestamp, validate it properly when the verification toolchain matures.

#### 4. Attack Vector Analysis

**4a. Malicious/Compromised TSA Response**

| Attack | Mitigation | Coverage |
|--------|------------|----------|
| **Response substitution** -- attacker replaces the TSA response with a different valid token (e.g., one timestamped at a different time for a different hash) | Nonce matching: request includes a random nonce, response MUST echo it. MessageImprint matching: response MUST contain the same hash we submitted. Both checked at capture time. | Capture-time |
| **Replay attack** -- attacker replays a previously valid TSA response | Nonce is a cryptographically random value generated per-request. Probability of collision is negligible. | Capture-time |
| **TSA key compromise** -- TSA's signing key is stolen, attacker can forge arbitrary timestamps | Store TSA certificate chain (set `certReq=true`). Verifier can check certificate validity window and revocation status. If DigiCert's TSA key is compromised, the entire code signing ecosystem has bigger problems -- this is an accepted residual risk. | Verification-time |
| **MITM on TSA connection** -- attacker intercepts HTTP request and returns a forged response | DigiCert endpoint is HTTP (not HTTPS). The nonce check prevents replay, but a MITM with their own CA could forge a complete response. **Mitigation**: prefer HTTPS TSA endpoints where available. DigiCert also supports `https://timestamp.digicert.com`. Use HTTPS. Verify the response nonce and messageImprint even over HTTPS (defense in depth). | Capture-time + transport |
| **Time skew attack** -- MITM introduces delay to shift the apparent capture time | Nonce + timeout. Set a reasonable timeout (e.g., 10s) on the TSA fetch. If the response takes longer, discard it. The genTime in the token will be within the TSA's processing window (typically <1s). | Capture-time |
| **Malformed DER response** -- crafted response exploits parser bugs | Minimal DER parser with strict bounds checking. Never read beyond the declared length. Reject any response where DER lengths don't add up. Treat parser errors as fatal (no timestamp, not capture failure). | Capture-time |

**4b. Attacks Specific to the WRL Integration**

| Attack | Mitigation |
|--------|------------|
| **Timestamp without operator signature** -- attacker obtains a valid TSA timestamp for arbitrary data by calling the TSA directly | Irrelevant -- the TSA timestamps WRL's bundleHash, which is also signed by WRL's Ed25519 key. The timestamp proves when the hash existed; the Ed25519 signature proves WRL produced it. Both are needed for the evidence claim. |
| **Selective timestamping** -- operator intentionally skips timestamping for captures they want to backdate later | Log timestamp success/failure in Coralogix. A missing timestamp when timestamps are configured is detectable in audit logs. Consider making timestamp mandatory when TSA_URL is configured (fail-closed). |
| **TSA availability as DoS vector** -- if timestamping is synchronous and the TSA is down, captures fail | Timestamp MUST be best-effort with graceful degradation, matching the existing pattern where signing gracefully degrades when SIGNING_KEY is absent. A TSA outage should not prevent captures. Log the failure, produce the WACZ without a timestamp, and let the capture complete. |

**4c. Information Disclosure via TSA**

The hash sent to the TSA is `sha256(canonicalize(datapackage))` -- the bundleHash. This reveals nothing about the captured content. The TSA learns only that someone timestamped a SHA-256 hash at a particular time. No URL, no content, no metadata is disclosed. This is by design in RFC 3161.

However: if the same hash is timestamped twice (e.g., duplicate capture), the TSA can correlate the requests. This is an accepted, low-severity information leakage per RFC 3161's own security considerations.

#### 5. TSA URL Configuration

**Use an environment variable with a hardcoded default.**

```
TSA_URL (env var, optional)
  Default: https://timestamp.digicert.com
  Override: any RFC 3161 HTTP(S) endpoint
```

Rationale:
- **Hardcoded default**: DigiCert is the production TSA. Operators should not need to configure anything to get timestamps. Zero-config is a security win (operators who forget to set an env var still get timestamps).
- **Env var override**: Enables testing with FreeTSA, switching providers without code changes, and staging environments that might use a mock TSA.
- **NOT a Wrangler secret**: The TSA URL is not a secret. It can be a `[vars]` entry in wrangler.toml or an env var.
- **Validation**: At startup (or first use), validate that the TSA URL is a valid HTTPS URL. Reject HTTP unless an explicit override flag is set (`TSA_ALLOW_HTTP=true`). This prevents accidental plaintext TSA communication.
- **No dynamic per-request TSA selection**: The TSA URL is set at deployment time, not per-request. This prevents an attacker who compromises the API from redirecting timestamp requests to a malicious TSA (SSRF via TSA URL injection).

#### 6. Schema Migration: `signedData` to `signatures` Array

The task description mentions migrating from the flat `signedData` object to a `signatures` array. Security considerations:

- **Backward compatibility**: Existing WACZ files with `signedData` must remain verifiable. The verification pipeline (`verify.js`) must check for both `signedData` (legacy) and `signatures` array (new format). Never silently drop support for old signatures.
- **Signature type identification**: Each entry in `signatures` should declare its type (`ed25519`, `rfc3161`) so the verifier can dispatch correctly. Use a string enum, not a boolean.
- **Array ordering**: Signatures array order should not matter for verification. All signatures should be verified independently.
- **Minimum signatures for "verified"**: Define clearly: does "verified" require ALL signatures to pass, or just the Ed25519? Recommendation: Ed25519 is required (it's the operator's signature). RFC 3161 is supplementary (adds temporal proof). A WACZ without a timestamp is "verified" (operator-signed). A WACZ with a failed timestamp check is "partially verified" or has a degraded trust level -- not outright rejected.

### Proposed Tasks

1. **[CRITICAL] Implement nonce generation and validation** -- generate a cryptographically random nonce for each TSA request using `crypto.getRandomValues()`. Verify the nonce in the TSA response matches. This is the primary anti-replay defense.

2. **[CRITICAL] Implement messageImprint validation** -- verify that the hash algorithm OID and hash value in the TSA response TSTInfo match what was submitted. This prevents hash substitution attacks.

3. **[HIGH] Write minimal DER encoder/decoder** -- purpose-built for the RFC 3161 request/response structures. Include strict bounds checking: every length field must be validated against remaining buffer size. No reads beyond declared lengths. Fuzz-test with malformed inputs.

4. **[HIGH] Use HTTPS for DigiCert TSA** -- the commonly cited URL is `http://timestamp.digicert.com` but HTTPS is available. Default to HTTPS. Add URL validation that rejects non-HTTPS URLs unless explicitly overridden.

5. **[HIGH] Implement timeout and graceful degradation** -- TSA fetch must have a hard timeout (recommend 10s). On timeout or any TSA error, the capture completes without a timestamp. Log the failure. Never let a TSA outage prevent a capture.

6. **[MEDIUM] Store raw DER token, not parsed fields** -- store the complete, unmodified DER-encoded TimeStampToken in the WACZ. This preserves the cryptographic evidence chain for future full verification. Do not re-encode or transform the token.

7. **[MEDIUM] Add TSA_URL env var with HTTPS validation** -- implement as `[vars]` in wrangler.toml with a sensible default. Validate URL scheme at first use.

8. **[MEDIUM] Design `signatures` array schema** -- each entry needs: `type` (string: "ed25519" | "rfc3161"), type-specific fields, and a `created` timestamp. The Ed25519 entry carries the existing signedData fields. The RFC 3161 entry carries the base64-encoded DER token and TSA URL.

9. **[LOW] Verify backward compatibility of verify.js** -- the verification pipeline must handle both old `signedData` format and new `signatures` array format. Test with WACZ files from both schemas.

10. **[LOW] Backlog item: full CMS chain validation** -- document that full X.509 certificate chain validation of the TSA response is deferred. Add to the Parking Lot with activation trigger: "When WRL verification is used in a legal/compliance context that requires independent temporal proof validation."

### Risks and Concerns

**R1: HTTPS availability of DigiCert TSA (Medium likelihood, Medium impact)**
The commonly documented endpoint is HTTP. While `https://timestamp.digicert.com` appears to work, confirm this with testing before committing to it as the default. If HTTPS is not reliably available, the MITM risk on the TSA connection is real but mitigated by nonce validation and messageImprint checking. Document this as an accepted risk if HTTP is required.

**R2: DER parsing bugs as attack surface (Low likelihood, High impact)**
A custom DER parser is a new attack surface. Malformed DER from a compromised TSA (or MITM) could trigger buffer over-reads, infinite loops, or incorrect field extraction. Mitigations: strict bounds checking, maximum response size limit (e.g., 16KB -- a normal TSA response is ~3-5KB), and comprehensive fuzz testing of the parser.

**R3: TSA availability affecting capture latency (Medium likelihood, Medium impact)**
Adding a synchronous HTTP call to an external service in the capture pipeline adds latency and a new failure mode. The TSA call should be non-blocking relative to the capture completion decision. If the TSA call takes >10s, the capture should succeed without a timestamp. The existing `ctx.waitUntil` budget of 30s is already tight with browser rendering; the TSA call must fit within the remaining headroom after WACZ assembly.

**R4: Deferred certificate chain validation (Accepted risk)**
Until full chain validation is implemented, WRL trusts that the TSA response is genuine based on nonce matching and messageImprint checking -- but does not cryptographically verify the TSA's signature. An attacker who can MITM the TSA connection AND predict/observe the nonce could forge a timestamp. Over HTTPS, this requires compromising the TLS connection, which is a much higher bar. Document this clearly so users understand the trust model.

**R5: TSA nonce size and entropy (Low likelihood, Low impact)**
RFC 3161 does not specify a minimum nonce size. Use at least 16 bytes (128 bits) of `crypto.getRandomValues()` output. Encode as a DER INTEGER. This provides sufficient entropy to prevent collision and replay.

**R6: `certReq` should be TRUE (Low effort, High value)**
Setting `certReq: true` in the TimeStampReq asks the TSA to include its certificate chain in the response. This is essential for future offline verification. Without it, a verifier would need to fetch the TSA's certificate separately, which may not be available years later. Always request the certificate chain.

### Additional Agents Needed

- **iac-minion**: To add `TSA_URL` as a `[vars]` entry in wrangler.toml (production and staging), and potentially `TSA_ALLOW_HTTP` as a staging-only override. Also to assess whether the TSA fetch fits within existing `ctx.waitUntil` timing constraints or if the capture pipeline needs restructuring.

- **test-minion**: To build integration tests for the TSA flow. Specifically: (a) mock TSA server that returns valid/invalid/malformed DER responses, (b) nonce mismatch tests, (c) messageImprint mismatch tests, (d) timeout tests, (e) fuzz tests for the DER parser with malformed inputs, (f) backward compatibility tests for `signedData` vs `signatures` array in verify.js.

- **data-minion**: To design the exact JSON schema for the `signatures` array in `datapackage-digest.json`, ensuring it preserves all fields needed for both Ed25519 and RFC 3161 verification, and that the schema is forward-compatible for additional signature types (e.g., future eIDAS qualified timestamps).
