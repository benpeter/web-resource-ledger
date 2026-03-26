# Domain Plan Contribution: security-minion

## Verified Capture Pipeline Sequence (from source code)

The actual flow, confirmed by reading `src/index.js`, `src/capture.js`, `src/wacz.js`, `src/signing.js`, `src/rfc3161.js`, `src/verify.js`, `src/url-validation.js`, `src/threat-check.js`, and `src/rate-limits.js`:

### Pre-Capture (API Request Handler -- `handleCreateCapture` in index.js)

1. **Content-Type check** -- must be `application/json`
2. **Authentication** -- dual-path: session cookie (OAuth) OR API key (Bearer token, SHA-256 hash lookup in D1)
3. **Rate limiting** -- per-tenant KV counter + per-IP secondary guard + global capacity limiter
4. **Quota check** -- monthly capture/storage quota (D1), free tier enforcement
5. **URL validation** -- SSRF prevention (`validateUrl` in url-validation.js):
   - Length limit (2048 chars)
   - WHATWG URL parsing
   - Scheme allowlist (http/https only)
   - Credential rejection (no userinfo)
   - IPv4 all-encoding normalization (hex, octal, decimal integer, shorthand)
   - IPv6 parsing including IPv4-mapped forms
   - DNS resolution (both A and AAAA records)
   - Private/reserved IP blocklist check on ALL resolved addresses (fail-closed: unrecognized formats treated as private)
   - Double-encoding detection in path and query
6. **Threat check** -- Google Web Risk API (`checkUrl` in threat-check.js): MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE. **Fails open** on API errors/timeouts (degraded mode).
7. **Create capture record** -- D1 insert with `pending` status
8. **Enqueue** -- `CAPTURE_QUEUE.send()` with captureId, validated URL, IP, tenantId, cip, eIDAS flag

### Capture Execution (Queue Consumer -- `handleCaptureMessage` in index.js, `performCapture` in capture.js)

1. **Message validation** -- defense-in-depth structure check on dequeued message
2. **Re-validate URL** -- second SSRF check on the URL from the queue message (defense-in-depth against queue poisoning)
3. **Idempotency guard** -- skip if capture is already terminal (complete/failed/quarantined)
4. **Browser rendering** (concurrent with header fetch):
   - Acquire/connect to Cloudflare Browser Rendering session
   - Fresh BrowserContext per capture (cookie/storage isolation)
   - Cross-domain main-frame navigation blocked via `context.route()`
   - Service workers blocked
   - Screenshot before consent
   - Cookie consent dismissal via `@duckduckgo/autoconsent` (server-controlled, not caller-supplied)
   - Screenshot after consent (if CMP found)
   - HTML content extraction
5. **Header fetch** -- separate `fetch()` with `redirect:'manual'`, Set-Cookie values redacted
6. **Store individual artifacts** in R2 (`captures/{captureId}/screenshot.png`, `rendered.html`, `headers.json`, optionally `screenshot-before.png`)

### Cryptographic Proof Chain (WACZ Assembly -- `buildWacz` in wacz.js)

This is the exact chain, confirmed from source:

1. **Get signing keys** -- `getSigningKeys(env)` lazily imports Ed25519 private key from `env.SIGNING_KEY` (PKCS8 base64). Derives public key bytes and computes `keyId` = first 8 hex chars of SHA-256(raw 32-byte public key). **MANDATORY** -- returns null (no WACZ) if signing key absent.
2. **Build WARC** -- `buildWarc()` creates WARC records from artifacts
3. **Build CDXJ index** -- `buildCdxj()` creates index from WARC record metadata
4. **Build pages.jsonl** -- capture metadata
5. **Compute SHA-256 hashes** of each artifact file (WARC, CDXJ, pages.jsonl). **MANDATORY.**
6. **Assemble datapackage.json** -- manifest with artifact paths, hashes, byte sizes, capture metadata, captureSettings
7. **Compute bundleHash** = `sha256(canonicalize(datapackage))` -- canonical JSON (sorted keys, no whitespace), NOT the pretty-printed version stored in the ZIP. **MANDATORY.** Verifiers must re-canonicalize to validate.
8. **Sign bundleHash** -- `signBytes(privateKey, UTF-8 bytes of "sha256:{hex}")`. Ed25519 signature over the literal string. **MANDATORY.**
9. **RFC 3161 timestamp** -- `requestTimestamp(env.TSA_URL, bundleHash)`. Builds DER TimeStampReq with SHA-256 messageImprint and 128-bit nonce. Validates response: PKIStatus=0, nonce match, messageImprint match. **OPTIONAL** -- graceful degradation, logged as `capture.tsa_fail` on error.
10. **eIDAS qualified timestamp** -- `requestTimestamp(env.QUALIFIED_TSA_URL, bundleHash)` with HTTP Basic auth. Same validation. **OPTIONAL** -- requires both account-level opt-in AND `QUALIFIED_TSA_URL` configured.
11. **Assemble datapackage-digest.json** -- contains `signedData.hash` (bundleHash), `signedData.signatures[]` array with:
    - `type:"self"` -- Ed25519 signature, publicKey (base64), keyId. **Always present.**
    - `type:"rfc3161"` -- TSA token (base64 DER), TSA URL. **Present only if TSA succeeded.**
    - `type:"rfc3161_qualified"` -- eIDAS TSA token, TSA URL. **Present only if requested AND succeeded.**
12. **ZIP assembly** -- fflate STORE mode (level 0), all files uncompressed
13. **Compute waczHash** = `sha256(final WACZ bytes)` -- used as content-addressed R2 key
14. **Archive signing key** in D1 -- `archiveSigningKey(env.DB, keyId, publicKeyBase64)` before `completeCapture()` (no race window)
15. **Store WACZ** in R2 at `captures/{waczHash}.wacz`
16. **Complete capture** -- D1 update with artifact paths, WACZ info (key, bundleHash, size, keyId, timestamp statuses), render quality, captureSettings

### Verification Flow (verify.js)

Five checks, all run independently (no short-circuiting):

1. **artifactHashes** -- SHA-256 of each resource file matches hash in datapackage.json
2. **bundleHash** -- `sha256(canonicalize(datapackage))` matches `signedData.hash`
3. **signature** -- Ed25519 signature verification using SERVER's public key (NOT the embedded key)
4. **timestamp** (v0.2.0 only) -- RFC 3161 messageImprint matches bundleHash. Status `skip` if absent (tolerated). Status `fail` if present but invalid.
5. **qualifiedTimestamp** (v0.2.0 only) -- same as above. Silently omitted if not present. `fail` if present but invalid.

**Critical security property**: verification uses the server's signing key resolved via `keyId` from the D1 capture record (server-controlled), NEVER from the WACZ's embedded `signedData`. The embedded publicKey is informational only for offline/third-party verifiers.

### Mandatory vs Optional Steps

| Step | Status | Notes |
|------|--------|-------|
| URL validation (SSRF) | MANDATORY | Blocks capture if failed |
| Threat check (Web Risk) | MANDATORY but **fails open** | Degraded mode on API error -- capture proceeds |
| Rate limiting | MANDATORY | 429 on exceed |
| Quota check | MANDATORY (KV auth) | Legacy auth exempt |
| Browser rendering | MANDATORY | Core capture function |
| Header fetch | OPTIONAL | Capture succeeds without headers |
| WACZ signing (Ed25519) | OPTIONAL | Graceful degradation if no SIGNING_KEY; also skipped for partial captures |
| RFC 3161 standard timestamp | OPTIONAL | Capture succeeds without it; status tracked as 'skipped' or 'error' |
| RFC 3161 qualified (eIDAS) | OPTIONAL | Requires account opt-in + QUALIFIED_TSA_URL configured |
| Cookie consent dismissal | OPTIONAL | Skipped for partial captures; 2s hard timeout |

## Recommendations

### 1. Redact specific rate limit values from public diagrams

The source reveals exact rate limit numbers (10 captures/60s per tenant, 50/60s IP guard, 100/60s binding ceiling). **Do NOT include these numbers** in public-facing diagrams. Show "Rate Limiting" as a step without exposing the thresholds. Exposing limits helps attackers optimize their request patterns to stay just under the threshold.

### 2. Do not expose the dual-validation pattern (queue re-validation)

The queue consumer re-validates the URL via `validateUrl()` as defense-in-depth against queue poisoning. This is a valuable security control. **Do NOT show it in the diagram** -- it reveals that queue messages are a trust boundary and that poisoning the queue bypasses the first validation. Show a single "URL Validation" step at API entry. The re-validation is an implementation detail that benefits from obscurity.

### 3. Do not expose error categorization or retry logic

The source has detailed error categorization (`categorizeError`) with retryable vs non-retryable classifications, exponential backoff constants, and max retry counts. **None of this belongs in public diagrams.** Show "Queue (with retries)" as a single box.

### 4. Do not expose the threat check fail-open behavior

The Google Web Risk API integration **fails open** on errors/timeouts (capture proceeds in degraded mode). This is a reasonable operational choice, but advertising it publicly tells attackers that they can reliably bypass threat screening by making the API unreachable from the Worker. Diagram should show "Threat Screening" as a step without indicating the degradation behavior.

### 5. The signing key trust model IS safe to show publicly

The Ed25519 signing approach, keyId derivation (SHA-256 fingerprint of public key), bundleHash computation (canonical JSON), and the `.well-known/signing-key` endpoint are all designed to be public. The cryptographic proof chain is a selling point and should be shown accurately. The fact that verification uses server-side key resolution (not embedded keys) is also safe and good to highlight.

### 6. TSA/eIDAS details are safe to show

The RFC 3161 timestamping flow (including the distinction between standard and qualified/eIDAS timestamps) is safe to document. The TSA URLs themselves are public infrastructure. The DER encoding details are unnecessary for an architecture diagram but the conceptual flow is fine.

### 7. Do not expose internal service names or bindings

Avoid naming specific Cloudflare bindings (`CAPTURE_QUEUE`, `CAPTURE_RATE_LIMITER`, `GLOBAL_CAPTURE_LIMITER`, `BROWSER`), KV key patterns, D1 table names, or R2 key naming conventions. Use generic labels: "Queue", "Rate Limiter", "Browser Rendering", "Object Storage", "Database".

### 8. Verification page is unauthenticated -- this is correct and safe to show

The `/v1/verify/{captureId}` endpoint is intentionally unauthenticated (rate-limited at 60/60s per-IP). This is by design for third-party verification. Safe to show in the verifier flow diagram.

### 9. The `.well-known/signing-key` and `.well-known/signing-keys` endpoints are public

These expose the current and archived public keys. Safe to reference in diagrams as the trust anchor for offline verification.

## Proposed Tasks

### Task 1: Define diagram content boundaries (security review gate)

Before any diagram is committed, verify that it does not contain:
- Exact rate limit numbers or thresholds
- Internal binding names or key patterns
- Error handling specifics (retry counts, backoff values, fail-open behavior)
- Queue message structure details
- Defense-in-depth measures that benefit from non-disclosure (queue re-validation)
- Internal IP blocklist details (specific CIDR ranges)

### Task 2: Verify the cryptographic proof chain in the diagram matches source

The diagram must accurately represent:
- `artifact hashes (SHA-256)` --> `datapackage.json` --> `bundleHash = sha256(canonicalize(datapackage))` --> `Ed25519 signature over UTF-8 bytes of bundleHash string` --> `optional RFC 3161 timestamp over bundleHash` --> `optional eIDAS qualified timestamp over bundleHash`
- All signatures and timestamps cover the SAME bundleHash (they are siblings in the signatures array, not a chain)
- The signed payload is the literal string `"sha256:{hex}"` encoded as UTF-8 bytes, not raw hash bytes

### Task 3: Ensure verification diagram shows correct trust model

The diagram must clearly show that:
- Verification uses the SERVER's public key (resolved via keyId from DB record), not the WACZ-embedded key
- The `.well-known/signing-key(s)` endpoint is the public trust anchor
- Third-party verifiers can verify offline by pinning the public key

## Risks and Concerns

### Risk 1: Over-detailed diagrams expose attack surface (MEDIUM)

Architecture diagrams often reveal more than intended. The biggest risk is showing the exact sequence of security controls in a way that helps an attacker identify which to target. Mitigation: abstract the security controls into high-level boxes ("Authentication", "Validation", "Threat Screening") without showing the implementation order or fallback behavior.

### Risk 2: Showing the queue as a separate component implies a trust boundary (LOW)

If the diagram shows the queue between API and capture execution, a sophisticated attacker might reason about queue poisoning. The defense-in-depth re-validation in the queue consumer mitigates this, but we should not advertise the trust boundary. Mitigation: show the queue as an internal implementation detail of "Capture Pipeline", not as a separately targetable component. However, the queue is already well-known from the Cloudflare Workers architecture, so this is low risk.

### Risk 3: TSA URLs in diagrams could be targeted for DoS (LOW)

If the diagram shows specific TSA endpoint URLs, an attacker could target them to force degraded-mode captures (since threat check and TSA both fail open). Mitigation: use generic labels ("RFC 3161 TSA", "eIDAS Qualified TSA") without specific URLs.

### Risk 4: Inaccurate diagram creates false security assurance (MEDIUM)

If the cryptographic proof chain is drawn incorrectly (e.g., showing timestamps as chained rather than parallel, or showing the wrong signing input), users may develop incorrect trust assumptions. Mitigation: Task 2 above -- verify against source before merging.

## Additional Agents Needed

None. The security review scope is complete. The implementation agent should use the verified flow above as the source of truth for diagram content, applying the redaction guidelines from the recommendations.
