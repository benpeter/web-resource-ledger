# API Design Specialist -- Planning Contribution

## Signing Key Endpoint Design: `GET /.well-known/signing-key`

### Question 1: RFC 8615 Compliance for `.well-known` Registration

**Recommendation: Use `.well-known/` path but do NOT formally register with IANA.**

RFC 8615 defines `.well-known` URIs and IANA maintains a registry. Formal registration requires an RFC or specification document and a review process. This is appropriate for widely adopted protocols (OAuth, WebFinger, ACME) but overkill for a single-service endpoint.

What matters for compliance:
- The path MUST be under `/.well-known/` (which it is).
- It SHOULD NOT collide with an existing IANA registration. I checked: there is no registered `signing-key` entry in the IANA well-known URI registry.
- The path segment should be descriptive. `signing-key` is clear.

Alternative paths considered:
- `/.well-known/jwks.json` -- standard for JWK Sets (RFC 7517). Semantically correct if we use JWK format, but implies a multi-key set and OAuth/OIDC context that does not apply here.
- `/.well-known/public-key` -- too generic.
- `/.well-known/wrl-signing-key` -- namespaced but unnecessarily long for a single-product API.

**Verdict: `/.well-known/signing-key` is the right choice.** Descriptive, unambiguous, no IANA collision, and consistent with the convention of using `.well-known/` for service-level metadata that is not tenant-specific.

---

### Question 2: Content-Type and Response Format

**Recommendation: Return a JSON object, with Content-Type `application/json`.**

The three candidates:

| Format | Content-Type | Pros | Cons |
|--------|-------------|------|------|
| Raw base64 string | `text/plain` | Simple, matches how `publicKeyBase64` is already used in WACZ `signedData` | No metadata, no extensibility, ambiguous encoding (base64 vs base64url?) |
| Raw bytes | `application/octet-stream` | Most compact | Requires out-of-band knowledge of algorithm, unusable in browser dev tools, cannot add metadata |
| JSON object | `application/json` | Extensible, self-describing, consistent with every other endpoint in this API | Slightly more bytes |
| JWK | `application/jwk+json` | Standard (RFC 7517), tooling support | Heavyweight for Ed25519 (lots of boilerplate), implies JWK ecosystem usage the project doesn't have |

The entire API speaks JSON everywhere. Every response from every endpoint uses `application/json` or `application/problem+json`. Returning `text/plain` from a single endpoint would be the only exception -- an unnecessary inconsistency.

**Proposed response shape:**

```json
{
  "algorithm": "Ed25519",
  "publicKey": "<base64-encoded raw 32-byte public key>"
}
```

**Rationale for each field:**
- `algorithm`: Removes all ambiguity about how to use the key. Clients do not need to guess or consult documentation to know the algorithm. Costs 20 bytes. This is a contract that enables automated verification tooling.
- `publicKey`: Base64-encoded raw 32-byte Ed25519 public key. This matches exactly what is already embedded in WACZ `signedData.publicKey` (see `wacz.js` line 108), so clients use the same decoding logic for both the endpoint response and the in-bundle key. Using base64 (not base64url) is consistent with existing usage throughout the codebase (`atob`/`btoa` in `signing.js`, `verifySignature`).

**Fields explicitly NOT included (and why):**
- `keyId` / `kid`: The backlog lists key versioning as [should], not [must]. Adding a `kid` now creates a contract that must be honored. Recommendation below addresses future-proofing without premature commitment.
- `createdAt` / `expiresAt`: Key lifecycle metadata belongs to the key rotation procedure, not the public endpoint. The endpoint answers "what key should I use now?" not "what is the key's biography?"
- `format`: Redundant when `algorithm` is present. Ed25519 raw keys are always 32 bytes.

---

### Question 3: Caching Headers

**Recommendation: Long `max-age` with `stale-while-revalidate` to handle rotation gracefully.**

Key characteristics of this resource:
- Changes extremely rarely (only on key rotation -- an operational event, not an API event).
- Must eventually converge after rotation (verifiers must stop using the old key).
- Is not secret (it is a public key).
- Is not tenant-specific (single service-level key).

**Proposed headers:**

```
Cache-Control: public, max-age=3600, stale-while-revalidate=86400
```

**Reasoning:**
- `public` -- This is a public key. CDNs, shared caches, and browser caches can all store it. No authentication is involved.
- `max-age=3600` (1 hour) -- Fresh for 1 hour. During normal operation, this avoids re-fetching on every verification. After rotation, all caches converge within 1 hour. This matches the operational reality: key rotation is a planned event, not an emergency (if a key is compromised, the operator revokes the Cloudflare secret and deploys, which takes minutes -- cache convergence at 1 hour is acceptable).
- `stale-while-revalidate=86400` (24 hours) -- If the origin is briefly unreachable, caches can serve the stale key for up to 24 hours while attempting revalidation in the background. This prevents verification outages during origin downtime. The stale key is still valid (the old key signed all existing bundles), so serving it stale is correct, not dangerous.

**Why NOT `immutable`:** The key does change (on rotation). `immutable` would require URL-based cache-busting, which contradicts the `.well-known` convention of stable URLs.

**Why NOT `no-store` or `private`:** The key is public and does not change between requests. Caching it is desirable for both performance and resilience.

**Why NOT `max-age=86400` (1 day):** After key rotation, a 24-hour convergence window is too long. An operator who rotates the key and then signs new captures would have verifiers fetching an old key for up to a day. One hour is operationally comfortable.

**ETag and conditional requests:** Not recommended for this endpoint. The response is tiny (under 100 bytes of JSON). The overhead of conditional request handling (`If-None-Match`, 304 logic) is not justified. `max-age` alone is sufficient.

---

### Question 4: Anticipating Key Versioning Without Implementing It

**Recommendation: Design the response shape so key versioning can be added without breaking existing clients. Do NOT implement versioning now.**

The backlog says:
- [should] Key versioning / key ID in signature entries
- [should] Old public key archive endpoint

Both are [should], not [must]. YAGNI from the project manifesto applies. But there is a specific question: should the endpoint design leave room?

**Analysis of the upgrade path:**

When key versioning arrives, the endpoint will need to evolve from "return the current key" to "return the current key plus historical keys." There are two clean ways to do this:

**Option A: Add a `keys` array alongside the current singleton fields (additive, backward-compatible).**

Current (Step 8):
```json
{
  "algorithm": "Ed25519",
  "publicKey": "base64..."
}
```

Future (key versioning):
```json
{
  "algorithm": "Ed25519",
  "publicKey": "base64...",
  "keys": [
    { "kid": "k_001", "publicKey": "base64...", "status": "active" },
    { "kid": "k_000", "publicKey": "base64...", "status": "retired", "retiredAt": "..." }
  ]
}
```

Clients written against the current contract still work (`algorithm` and `publicKey` are still present). New clients that understand `keys` can iterate for historical verification.

**Option B: Separate endpoint for historical keys.**

Current: `GET /.well-known/signing-key` returns the active key.
Future: `GET /.well-known/signing-key/history` or `GET /v1/signing-keys` returns all keys.

Both options work. Option A is better because it avoids an additional HTTP request for verification tools that need to try multiple keys.

**Concrete recommendation for Step 8:**

1. Do NOT add `kid`, `keys`, `status`, or any versioning fields now. They are not needed and would be speculative.
2. Do NOT add `keyId` to the WACZ `signedData` now. The backlog tracks this separately.
3. The current response shape (`algorithm` + `publicKey`) is forward-compatible with Option A because new fields can be added without removing or changing existing ones.
4. Document in the README key rotation section that after rotation, captures signed with the previous key cannot be verified against the current endpoint key. This is the known limitation that the backlog items address.

---

### Additional Design Decisions

**Authentication:** This endpoint MUST NOT require authentication. It is a public key -- the entire point is that anyone can fetch it to verify signatures independently. This is consistent with the verification endpoint (`GET /v1/verify/{captureId}`) which is also unauthenticated.

**Rate limiting:** Apply the same rate limiter as the verification endpoint (`VERIFY_RATE_LIMITER`). The signing key endpoint is cheap to serve, but without rate limiting it could be used for abuse (high-volume polling). The 1-hour `max-age` means well-behaved clients hit this endpoint at most once per hour, so even aggressive rate limits would not affect legitimate use.

**CORS:** Return `Access-Control-Allow-Origin: *`. Third-party verification tools running in browsers need to fetch this key. This matches the CORS policy on the verification and retrieval endpoints.

**Error case:** If `SIGNING_KEY` is not configured (signing is optional per the README), the endpoint should return `404 Not Found` with an RFC 9457 problem response, not `503`. Reasoning: `503` implies the service is temporarily unavailable and the client should retry. If no signing key is configured, the endpoint genuinely does not exist as a concept -- there is no key to return. `404` with detail "Signing key is not configured" tells the client not to retry.

Alternative considered: `503` with "Verification service is not configured" (matching the verification endpoint). This would be consistent with `handleVerifyCapture`, but the semantics differ. The verification endpoint returns 503 because it cannot perform its function without a key. The signing-key endpoint's function IS the key -- if there is no key, there is nothing to serve. This is a 404, not a 503.

**On reflection**, consistency with the existing verification endpoint is more important than semantic purity here. An operator who deploys without `SIGNING_KEY` sees the same status code from both related endpoints. **Use 503 to match `handleVerifyCapture`.**

**operationId:** `getSigningKey` -- follows the established pattern (`getHealth`, `getCapture`, `getCaptureStatus`, `getCaptureArtifact`).

**Tag:** Create a new `signing` tag. This endpoint is not a capture lifecycle operation (not `captures` tag) and not a health check. A dedicated tag groups it with any future signing-related endpoints (e.g., key history).

**OpenAPI spec addition:** The endpoint should be added to `openapi.yaml` with the same header patterns (Referrer-Policy, X-Content-Type-Options) used by all other endpoints, plus Cache-Control and CORS as specified above.

---

### Route Registration

Add to the routes array in `index.js`:

```javascript
['GET',  /^\/\.well-known\/signing-key$/, handleGetSigningKey],
```

Note the escaped dot in `\.well-known`. The regex must match the literal `.` in the path.

---

### Implementation Sketch (for nefario's scope estimation)

The handler is straightforward -- estimated at ~20 lines:

1. Rate limit check (reuse `VERIFY_RATE_LIMITER`).
2. Call `getSigningKeys(env)`.
3. If null, return `problemResponse(503, 'Signing is not configured')`.
4. Base64-encode `publicKeyBytes`.
5. Return `jsonResponse({ algorithm: 'Ed25519', publicKey: base64 }, 200, { 'Cache-Control': '...', 'Access-Control-Allow-Origin': '*' })`.

No new modules, no new dependencies. The existing `getSigningKeys()` already handles key derivation and caching.

---

### Risks and Dependencies

1. **Cache invalidation on rotation:** When an operator rotates `SIGNING_KEY` via `wrangler secret put`, the Worker instance restarts. The module-scoped cache in `signing.js` clears. New requests get the new key. But CDN/browser caches may serve the old response for up to 1 hour (`max-age=3600`). This is acceptable given the operational context (rotation is planned, not emergency). The README key rotation procedure should note this convergence window.

2. **No signing key configured:** The endpoint returns 503. This is documented behavior, not a bug. The README already states signing is optional.

3. **Future key versioning:** The response shape is forward-compatible. No action needed now.

---

### Summary of Recommendations

| Decision | Recommendation |
|----------|---------------|
| Path | `GET /.well-known/signing-key` (no IANA registration needed) |
| Content-Type | `application/json` |
| Response body | `{ "algorithm": "Ed25519", "publicKey": "<base64>" }` |
| Cache-Control | `public, max-age=3600, stale-while-revalidate=86400` |
| CORS | `Access-Control-Allow-Origin: *` |
| Auth | None required |
| Rate limiting | Reuse `VERIFY_RATE_LIMITER` |
| No signing key | 503 with RFC 9457 problem response |
| Key versioning fields | Do not add now; response shape is forward-compatible |
| operationId | `getSigningKey` |
| OpenAPI tag | `signing` (new tag) |
| Security headers | Same as all other endpoints (Referrer-Policy, X-Content-Type-Options) |

### Specialist Consultation Notes

No additional specialists are needed beyond those already involved. The security-minion should validate that serving the public key without authentication is correct (it is -- this is standard practice for public key distribution endpoints like JWKS). The api-spec-minion should add this endpoint to `openapi.yaml` following the patterns documented above.
