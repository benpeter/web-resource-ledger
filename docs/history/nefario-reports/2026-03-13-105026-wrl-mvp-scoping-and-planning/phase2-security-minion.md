# Domain Plan Contribution: security-minion

## Threat Model: URL Capture Flow

### System Description

The MVP accepts a URL from a caller, launches a headless browser to render the page, bundles the rendered output (screenshot, HTML, headers, resource manifest), signs the bundle, stores it in immutable blob storage, and exposes a public verification endpoint where third parties can confirm capture authenticity.

### Data Flow (text DFD)

```
                     Trust Boundary 1              Trust Boundary 2
                     (API ingress)                 (internal network)
                          |                              |
  [Caller] --URL--> [API Server] --render--> [Headless Browser] --fetch--> [Target Website]
                          |                              |
                          |                     [Capture Bundle]
                          |                              |
                     [Signing Service] <--- bundle ------+
                          |
                     [Blob Storage] <--- signed bundle
                          |
  [Verifier] --id--> [Verification Endpoint] --read--> [Blob Storage]
```

Trust boundaries:
- **TB1 (API ingress)**: Separates untrusted callers from the API server. All input is hostile.
- **TB2 (internal network)**: Separates the API server from the headless browser and storage. The browser is a high-risk component that makes outbound requests to attacker-controlled URLs.
- **TB3 (browser to internet)**: The headless browser fetches arbitrary external content. This is the most dangerous boundary -- the browser is acting on behalf of the service but navigating to attacker-chosen destinations.

### STRIDE Analysis

| ID | Element | STRIDE | Threat | Likelihood | Impact | Risk | MVP? |
|----|---------|--------|--------|------------|--------|------|------|
| T1 | API Server | Tampering | SSRF: Caller supplies internal/cloud-metadata URL (e.g., `http://169.254.169.254/`), browser fetches it, capture leaks internal data | 5 | 5 | **25 CRITICAL** | MUST FIX |
| T2 | Headless Browser | EoP | Browser sandbox escape via malicious page content (crafted JS, WebGL, PDF exploits) | 2 | 5 | **10 HIGH** | MUST MITIGATE |
| T3 | API Server | DoS | Resource exhaustion: caller submits URLs that cause long-running renders, infinite loops, or massive page sizes | 4 | 3 | **12 HIGH** | MUST FIX |
| T4 | API Server | Spoofing | Unauthenticated access allows abuse (crypto mining via browser, spam captures, cost amplification) | 4 | 3 | **12 HIGH** | MUST FIX |
| T5 | Signing Service | Tampering | If signing key is compromised, all captures become untrustworthy. Single key = single point of failure | 2 | 5 | **10 HIGH** | MUST MITIGATE |
| T6 | Blob Storage | Tampering | Capture artifacts modified after storage undermines the entire value prop | 2 | 5 | **10 HIGH** | MUST FIX |
| T7 | Verification Endpoint | DoS | Public endpoint scraped/flooded, driving up storage egress costs | 3 | 2 | **6 MEDIUM** | SHOULD FIX |
| T8 | Headless Browser | Information Disclosure | Browser retains state between captures (cookies, localStorage, cached credentials) leaking cross-capture data | 3 | 4 | **12 HIGH** | MUST FIX |
| T9 | API Server | Tampering | URL redirect chains: target URL 302s to internal resource, bypassing initial URL validation | 4 | 5 | **20 CRITICAL** | MUST FIX |
| T10 | Capture Bundle | Repudiation | Without trusted timestamps, capture time is self-asserted and unverifiable | 3 | 3 | **9 MEDIUM** | ACCEPT FOR MVP |
| T11 | Headless Browser | Information Disclosure | DNS rebinding: target URL resolves to internal IP after initial DNS check passes | 3 | 5 | **15 HIGH** | MUST FIX |
| T12 | API Server | Injection | Path traversal via URL parameter crafting (e.g., URL containing `../../` that influences storage paths) | 2 | 4 | **8 MEDIUM** | MUST FIX |

---

## Recommendations

### (a) Critical Security Risks -- Non-Negotiable for MVP

These controls are not "nice to have." Shipping without them creates exploitable vulnerabilities from day one.

#### 1. SSRF Prevention (T1, T9, T11) -- CRITICAL

The headless browser is an open proxy if URL validation is weak. An attacker submits `http://169.254.169.254/latest/meta-data/` and your browser happily fetches cloud credentials, storing them in the capture bundle.

**MVP controls (all required):**

- **URL scheme allowlist**: Only `http:` and `https:`. Reject `file:`, `ftp:`, `data:`, `javascript:`, `blob:`, `gopher:`, etc. This is a hard reject at the API layer before the URL reaches the browser.
- **DNS resolution validation**: Resolve the hostname *before* passing to the browser. Reject if it resolves to:
  - Private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
  - Link-local: `169.254.0.0/16` (cloud metadata)
  - Loopback: `127.0.0.0/8`, `::1`
  - Any non-routable address
- **DNS rebinding protection (T11)**: Pin the resolved IP and pass it to the browser (use `--host-resolver-rules` in Chromium to force the browser to use the pre-validated IP). This prevents the target from re-resolving to an internal IP after your check passes.
- **Redirect following with re-validation**: If the browser follows a 3xx redirect, intercept the redirect target and re-apply all URL and IP validation rules. Chromium's `request.redirectChain()` in Playwright/Puppeteer can be used. Alternatively, set `--disable-features=FollowRedirects` and handle redirects programmatically with validation at each hop. Limit redirect chain depth to 5.

**This is the single most important security control in the entire system.** If only one thing gets built right, it must be SSRF prevention.

#### 2. Browser Isolation and Hardening (T2, T8) -- HIGH

The headless browser executes arbitrary JavaScript from attacker-controlled pages. It must be treated as a hostile sandbox.

**MVP controls:**

- **Fresh browser context per capture**: New incognito context for every capture. No shared cookies, localStorage, cache, or credentials between captures. Destroy the context immediately after capture completes.
- **Resource limits**: Navigation timeout (30 seconds hard cap). Page size limit (reject responses over 50MB). Limit subresource count (cap at 200 subresources per page). These prevent infinite loops, memory bombs, and zip-bomb-style attacks.
- **Disable unnecessary features**: `--no-sandbox` must NEVER be used. Disable GPU (`--disable-gpu`), disable dev-shm usage if in container (`--disable-dev-shm-usage`), disable extensions, disable background networking.
- **Process isolation**: Run the browser as a non-root, unprivileged user with a dedicated UID. In containerized deployment, the browser container should have: `--cap-drop ALL`, `--read-only` filesystem (with tmpfs for `/tmp`), `--no-new-privileges`, and seccomp profile.
- **Network namespace isolation** (should add before production): Run the browser in a network namespace that can only reach the public internet, not internal services. This is a defense-in-depth layer on top of DNS validation.

#### 3. Input Validation (T3, T12) -- HIGH

- **URL length limit**: 2048 characters maximum.
- **URL normalization**: Parse and reconstruct the URL using a proper URL parser (Node.js `URL` constructor). Reject URLs that don't parse cleanly. This prevents encoding tricks (`%2e%2e` for path traversal, etc.).
- **Storage path derivation**: Capture IDs must be system-generated (UUIDv4 or similar). Never derive storage paths from user input. The URL itself is stored as metadata inside the bundle, never used to construct file paths.

#### 4. Rate Limiting and Abuse Prevention (T4) -- HIGH

Even for MVP, you need abuse prevention. The headless browser is expensive to run, and an unauthenticated capture endpoint is an invitation for crypto miners, DDoS launchers, and content pirates.

- **Per-IP rate limiting**: 10 captures per minute, 100 per hour. Use a sliding window. This is the minimum viable abuse control.
- **Concurrent capture limit**: Maximum 3 concurrent captures per IP. Prevents a single actor from exhausting all browser capacity.
- **Global backpressure**: If the capture queue exceeds capacity, return 503 with `Retry-After`. Do not silently queue unboundedly.

### (b) Minimum Viable Auth Model

**Recommendation: API keys for capture, unauthenticated for verification.**

Rationale:

- **Capture endpoint (POST)** requires an API key. This is a resource-intensive operation (spins up a browser, consumes compute and storage). Without API keys, rate limiting alone is insufficient -- attackers rotate IPs trivially. API keys provide accountability and a kill switch for abusive actors. For MVP, API keys can be manually provisioned (generate with `crypto.randomBytes(32).toString('hex')`, store hashed with SHA-256 in a config file or simple key-value store). No need for a registration flow, OAuth, or user management.

- **Verification endpoint (GET)** is unauthenticated. This is the core value prop -- "third parties can independently confirm capture authenticity" (from PRODUCT.md). Requiring auth to verify defeats the purpose. Verification is a read-only, computationally cheap operation (hash comparison). Rate limiting alone is sufficient protection.

- **Retrieval endpoint (GET)** requires the capture ID (which serves as a capability token if IDs are unguessable UUIDv4). No API key required. The capture ID is shared intentionally by the capture owner. For MVP, "if you have the ID, you can see the capture" is acceptable. Add proper authz before production.

**Must add before production:** Proper tenant isolation, RBAC, API key rotation, key scoping (read vs. write), OAuth for web UI, audit logging of key usage.

### (c) Simplest Signing Approach -- Upgradeable to Legal Admissibility

**Recommendation: Ed25519 signature over a SHA-256 content hash manifest, with structured metadata that has a slot for future timestamp authority countersignatures.**

Here is the specific design:

#### Capture Manifest (JSON, included in bundle)

```json
{
  "version": "1",
  "captureId": "uuid-v4",
  "url": "https://example.com/page",
  "capturedAt": "2026-03-13T14:22:00.000Z",
  "artifacts": {
    "screenshot": { "sha256": "abcdef..." },
    "html": { "sha256": "123456..." },
    "headers": { "sha256": "789abc..." },
    "resources": { "sha256": "def012..." }
  },
  "bundleHash": "sha256-of-canonical-json-of-artifacts-object",
  "signatures": [
    {
      "type": "self",
      "algorithm": "Ed25519",
      "publicKey": "base64-encoded-public-key",
      "value": "base64-encoded-signature-over-bundleHash",
      "signedAt": "2026-03-13T14:22:01.000Z"
    }
  ]
}
```

#### Why this design:

1. **Ed25519 over RSA**: Ed25519 is fast (important for <300ms latency target on retrieval/verification), produces small signatures (64 bytes), is deterministic (no randomness pitfalls), and is widely supported. The key is only 32 bytes. No key size debates. No padding oracle attacks. It is the simplest modern signing algorithm that is universally respected.

2. **SHA-256 content hashes**: SHA-256 is the standard for content integrity. Every artifact gets its own hash (individually verifiable). The `bundleHash` is the hash of the canonical JSON of the artifacts object, providing a single value to sign.

3. **Structured `signatures` array**: This is the upgrade path. For MVP, there is one signature of type `"self"` (the WRL service's own key). When legal admissibility is needed, add a second entry:

```json
{
  "type": "tsa",
  "algorithm": "RFC3161",
  "authority": "https://freetsa.org/tsr",
  "value": "base64-encoded-timestamp-response",
  "signedAt": "2026-03-13T14:22:02.000Z"
}
```

The manifest format does not change. Old captures remain valid. New captures get additional signatures. Verification logic checks whatever signatures are present.

4. **`version` field**: Allows breaking changes to the manifest format without invalidating old captures. MVP is version `"1"`.

5. **Canonical JSON for signing**: The signed payload must be deterministic. Use JSON Canonicalization Scheme (JCS, RFC 8785) or simply: sort keys, no whitespace, UTF-8. This prevents signature invalidation from cosmetic JSON formatting differences.

#### Key Management for MVP

- Generate one Ed25519 keypair at service startup.
- Store the private key in an environment variable or secrets manager (never in code, never in the repo, never in the capture bundle).
- Embed the public key in the capture manifest and publish it at a well-known endpoint (`GET /v1/.well-known/signing-key`). This allows verifiers to fetch the public key independently.
- For MVP, a single key is acceptable. Before production: key rotation support, key ID in signature, and old public keys at a key archive endpoint.

#### Verification Algorithm

1. Fetch the capture bundle.
2. Recalculate SHA-256 hashes of each artifact.
3. Compare against the manifest's `artifacts` hashes.
4. Recalculate `bundleHash` from the artifacts object.
5. Verify the Ed25519 signature over the `bundleHash` using the embedded public key.
6. (Future) If TSA signature present, verify the RFC 3161 timestamp response.
7. Return: content integrity (pass/fail), signature validity (pass/fail), capture timestamp (from manifest, self-asserted for MVP).

**What this gives you for MVP:** Proof that the capture was created by the WRL service and has not been modified since signing. A third party can independently verify both claims.

**What this does NOT give you for MVP (and doesn't claim to):** Independent proof of *when* the capture was taken (the timestamp is self-asserted). That requires a TSA, which is the clear upgrade path via the `signatures` array.

### (d) Verification Endpoint Protection

**Recommendation: Fully public, with lightweight abuse prevention.**

The verification endpoint is read-only and computationally cheap (one blob read + hash comparison + signature verification). It must be unauthenticated -- requiring auth to verify a capture destroys the core value prop.

**MVP controls:**

- **Rate limiting**: 60 requests per minute per IP. Generous enough for legitimate use, restrictive enough to prevent scraping.
- **Capture ID as capability**: Use UUIDv4 for capture IDs (122 bits of entropy). The ID space is unguessable -- you can't enumerate captures by brute force. This means the verification endpoint does not leak a list of captures. You must know the ID to verify.
- **No listing endpoint**: Do not expose `GET /v1/captures` (list all captures) in MVP. Each capture is accessed by its specific ID only.
- **Cache-friendly responses**: Captures are immutable. Verification responses should include `Cache-Control: public, immutable, max-age=31536000`. This allows CDN caching, reducing origin load and enabling the <300ms latency target via edge caching.

**Should add before production:** CDN in front of the verification endpoint (aligns with Fastly/Cloudflare preference), abuse detection for enumeration attempts, CORS configuration (allow `*` for verification -- it's public data -- but be explicit about it).

---

## Proposed Tasks

These are specific implementation tasks that should appear in the execution plan, ordered by dependency.

### MVP -- Non-Negotiable

1. **URL Validation and SSRF Prevention Module**
   - Implement URL scheme allowlist (http/https only)
   - Implement DNS pre-resolution with private IP range blocking
   - Implement DNS pinning for browser requests (`--host-resolver-rules`)
   - Implement redirect interception with re-validation
   - Unit tests with SSRF bypass attempts (cloud metadata, DNS rebinding, redirect chains, encoded URLs)
   - *This must be the first thing built and tested. Everything else depends on it.*

2. **Headless Browser Hardening**
   - Fresh incognito context per capture with full cleanup
   - Navigation timeout (30s), page size limit (50MB), subresource cap (200)
   - Browser launch flags for security (no-sandbox NEVER used, disable GPU, disable dev-shm, disable extensions)
   - Non-root execution in container
   - Integration test: capture a page with known malicious patterns (JS infinite loop, mega-page, redirect storm)

3. **API Key Authentication for Capture Endpoint**
   - Generate API keys (`crypto.randomBytes(32)`)
   - Store hashed keys (SHA-256) in config/env
   - Validate on capture endpoint; reject 401 if missing/invalid
   - Pass-through (no auth) on verification endpoint

4. **Rate Limiting**
   - Per-IP rate limiting on all endpoints (10 captures/min, 60 verifications/min)
   - Per-IP concurrent capture limit (3)
   - Global backpressure (503 + Retry-After when queue full)
   - In-memory store is fine for MVP (single instance). Use a token bucket or sliding window.

5. **Capture Signing Implementation**
   - Ed25519 keypair generation and secure storage
   - SHA-256 hashing of each capture artifact
   - Canonical JSON bundle hash computation
   - Ed25519 signature over bundle hash
   - Manifest generation with `signatures` array
   - Public key endpoint (`GET /v1/.well-known/signing-key`)

6. **Verification Endpoint**
   - Accept capture ID, fetch bundle from storage
   - Recalculate artifact hashes, verify against manifest
   - Verify Ed25519 signature
   - Return structured verification result (content integrity, signature validity, capture timestamp)
   - Cache headers for immutable responses
   - No authentication required

7. **Security Headers and Baseline Hardening**
   - HSTS, X-Content-Type-Options, X-Frame-Options on all responses
   - Restrictive CORS (verification endpoint: `*`; capture endpoint: specific origins only)
   - Disable `X-Powered-By` and server version headers
   - Error responses: structured JSON, no stack traces, no internal details

### Should Add Before Production

8. **Network Namespace Isolation for Browser**
   - Run browser in isolated network namespace that can only reach public internet
   - Firewall rules blocking access to internal services and cloud metadata from browser container

9. **API Key Rotation and Management**
   - Key rotation without downtime (support multiple active keys per tenant)
   - Key revocation
   - Key scoping (read/write permissions)
   - Audit logging of key usage

10. **Content Security Scanning**
    - Scan captured content for malware indicators before storage
    - Reject or flag captures of known-malicious URLs (check against Google Safe Browsing or similar)
    - This prevents WRL from being used as a malware distribution mirror

11. **Signed Timestamps (TSA Integration)**
    - Add RFC 3161 timestamp authority countersignature to captures
    - This is the upgrade from "self-asserted time" to "independently verifiable time"
    - Required for legal admissibility (eIDAS, FRCP)

12. **Security Monitoring and Alerting**
    - Log all SSRF prevention blocks, auth failures, and rate limit hits
    - Alert on anomalous patterns (burst of SSRF attempts from single source, etc.)
    - Ensure no PII or credentials in logs

---

## Risks and Concerns

### Risk 1: SSRF Remains the Existential Threat (CRITICAL)

The entire architecture is an SSRF machine by design -- it fetches arbitrary URLs on behalf of users. The URL validation module is the single most important security control. If it has a bypass, the entire service is compromised. This module needs thorough testing with known SSRF bypass techniques:

- `http://0x7f000001/` (hex IP encoding)
- `http://0177.0.0.1/` (octal encoding)
- `http://2130706433/` (decimal encoding)
- `http://[::ffff:127.0.0.1]/` (IPv6-mapped IPv4)
- `http://localtest.me/` (DNS resolving to 127.0.0.1)
- `http://spoofed.burpcollaborator.net/` (DNS rebinding)
- Double-URL-encoding (`http://example.com%252F%252F169.254.169.254/`)
- Redirect chains: `http://attacker.com` -> 302 -> `http://169.254.169.254/`
- DNS rebinding: first resolution is public IP, second resolution (after validation) is internal IP

**Recommendation:** The URL validation module should be extracted as a standalone, independently testable library with its own comprehensive test suite. Do not inline it into request handling code.

### Risk 2: Browser as Unpatched Attack Surface (HIGH)

Headless Chrome/Chromium has a constant stream of security updates. A stale browser binary means known exploits work against the service. Container images must pin a specific Chromium version and have a process for rapid updates when critical CVEs drop. Subscribe to Chromium security announcements.

### Risk 3: Self-Asserted Timestamps Are Legally Meaningless (MEDIUM, accepted for MVP)

Without a TSA, the capture timestamp is whatever the WRL server says it is. This is sufficient for "did this content exist and did WRL capture it" but not for "this content existed at exactly this time and a neutral third party attests to it." The upgrade path (TSA signatures in the `signatures` array) is designed, but the MVP should be transparent about this limitation. The verification response should clearly indicate `"timestampVerification": "self-asserted"` vs. `"timestampVerification": "tsa-verified"` so consumers know what they're getting.

### Risk 4: Capture Service as Abuse Vector (MEDIUM)

WRL can be used to:
- Capture and preserve evidence of illegal content (CSAM, terrorism) -- creates legal liability for the operator as the storage provider
- Mirror malicious pages (phishing kits, malware) for later distribution
- Abuse the browser as a proxy for web scraping / credential stuffing (if browser state leaks between captures)

**MVP mitigation:** API keys provide accountability. Fresh browser context per capture prevents state leakage. **Before production:** Content moderation policy, abuse reporting mechanism, terms of service that prohibit illegal use, and consider automated scanning.

### Risk 5: Single Signing Key Is a Single Point of Failure (MEDIUM, accepted for MVP)

If the one Ed25519 private key is compromised, every capture signed by it becomes suspect. For MVP, this risk is accepted because the key can be rotated and old captures re-signed (the manifest format supports multiple signatures). Before production: implement key rotation, key versioning, and consider HSM-backed key storage.

---

## Additional Agents Needed

**test-minion** -- should be involved in the execution phase (not planning) specifically to design the SSRF bypass test suite. The URL validation module is the highest-risk component and needs adversarial testing beyond standard unit tests. The test suite should include all known SSRF bypass techniques (IP encoding variants, DNS rebinding, redirect chains, URL encoding tricks). This is security-critical testing that should not be left to the implementing developer's intuition.

No other additional agents are needed. The current team (gru for technology choices, lucy for scope, margo for YAGNI, api-design-minion for API surface, iac-minion for deployment) covers the remaining concerns. The iac-minion consultation should incorporate the browser isolation requirements from this analysis (non-root execution, capability dropping, seccomp profiles, network namespace isolation) into the deployment architecture.
