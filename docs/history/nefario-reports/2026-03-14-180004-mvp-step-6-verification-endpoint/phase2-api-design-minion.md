## Domain Plan Contribution: api-design-minion

### Recommendations

#### 1. HTTP Status Codes: 200 for All Verification Outcomes

Use 200 OK for both `verified: true` and `verified: false`. The request itself succeeded -- the server understood the question and computed an answer. The verification result is application-level semantics, not transport-level semantics.

**Rationale:** Using a 4xx status for `verified: false` would be a category error. The client did nothing wrong; the capture's integrity failed. This is exactly the pattern Stripe uses for charge outcomes (a declined charge is still a 200, the `status` field carries the business result). It also makes caching clean -- a single `Cache-Control: public, immutable, max-age=31536000` header works for both outcomes because the verification result for an immutable capture never changes.

Error status codes reserved for actual errors:
- **404** -- capture ID not found (static message, no ID echo, consistent with existing `handleGetCapture`)
- **429** -- rate limited (with `Retry-After` header, consistent with `handleCreateCapture`)

#### 2. Response Shape

```json
{
  "verified": true,
  "capture": {
    "id": "cap_abc123...",
    "url": "https://example.com",
    "createdAt": "2024-...",
    "completedAt": "2024-..."
  },
  "wacz": {
    "bundleHash": "sha256:...",
    "signature": "base64...",
    "publicKey": "base64...",
    "signedAt": "2024-..."
  },
  "checks": [
    { "name": "bundleHash", "passed": true },
    { "name": "signature",  "passed": true }
  ]
}
```

**Key design decisions:**

**`capture` field -- subset, not mirror.** The retrieval endpoint (`GET /v1/captures/{id}`) is the authoritative source for the full capture record, including artifact download URLs. The verification endpoint exists to answer one question: "Is this capture authentic?" Including artifact download URLs in the verification response would conflate two concerns and create a second place to maintain URL generation logic. Include only the identity and timing fields: `id`, `url`, `createdAt`, `completedAt`.

**`wacz` field -- cryptographic evidence.** Surface the bundleHash, signature, publicKey, and signedAt (mapped from `signedData.created`). This gives a verifier everything they need to independently recheck the signature without downloading the full WACZ. The `publicKey` is embedded for convenience (same caveat as in `wacz.js` -- verifiers should pin against an operator-published key, not trust blindly).

**`checks` array -- individual verification step results.** This is the extensibility surface. Two checks for MVP:

1. `bundleHash` -- recompute SHA-256 of canonical JSON of `datapackage.json`, compare to stored `wacz.bundleHash`
2. `signature` -- verify Ed25519 signature of the bundleHash string using the public key

`verified` is the conjunction: `true` if and only if every check passed.

**Why an array instead of a flat object:** Future verification steps (RFC 3161 timestamp validation, key rotation checks, individual resource hash verification) slot in as new entries without changing the response schema. Clients that only care about the top-level `verified` boolean ignore the array. Clients that need diagnostics (which specific check failed?) iterate it. This follows the "make the common case simple, the advanced case possible" principle.

#### 3. Failure Response Shape (verified: false)

When verification fails, the response is still 200 with `verified: false`. The `checks` array shows which check(s) failed, and failed checks include a `detail` string explaining the mismatch:

```json
{
  "verified": false,
  "capture": { "id": "cap_abc123...", "url": "...", "..." },
  "wacz": { "..." },
  "checks": [
    { "name": "bundleHash", "passed": false, "detail": "Recomputed hash does not match stored bundleHash" },
    { "name": "signature",  "passed": true }
  ]
}
```

The `detail` field is only present on failed checks. It is human-readable, not machine-parseable. Clients switch on `name` and `passed`, not on `detail` text. This matches the `problemResponse` detail convention already established in `responses.js`.

**Security note:** The `detail` must never include the actual hash values (recomputed vs stored), as that could help an attacker understand the nature of a tamper. A generic "does not match" message is sufficient.

#### 4. Edge Cases and Error Responses

| Condition | HTTP Status | Response Type | Rationale |
|---|---|---|---|
| Capture not found | 404 | RFC 9457 `application/problem+json` | Consistent with `handleGetCapture`. Static detail message. |
| Capture pending (not yet complete) | 404 | RFC 9457 `application/problem+json` | Same as retrieval: pending captures are not visible. No information leak about existence. |
| Capture complete but no WACZ | 200 | Verification response with `verified: false` | This is a valid verification outcome: the capture exists but has no signing material. All checks fail. Include a top-level `reason` field: `"No WACZ bundle available for this capture"`. |
| Malformed capture ID | 404 | RFC 9457 `application/problem+json` | Regex in route pattern rejects it before handler runs. Falls through to default 404. |
| Rate limited | 429 | RFC 9457 `application/problem+json` | With `Retry-After: 60`. |

**Reconsidered: no-WACZ case.** After further thought, the no-WACZ case deserves special treatment. A capture without a WACZ is not "unverified" in the tamper-detection sense -- it simply was never signed (e.g., signing key was unavailable during capture). Reporting `verified: false` with failing checks is misleading because it implies tampering when none occurred. Better options:

**Recommended approach:** Return 404 for captures without WACZ, same as pending. The verification endpoint requires a signed WACZ to be meaningful. A capture without signing material is not verifiable, period. The retrieval endpoint (`GET /v1/captures/{id}`) already shows whether `wacz` is present, so clients can check verifiability before calling verify. This keeps the verification response clean: if you get a 200, you always get a real verification result. If 404 is too strong (it hides the reason), an alternative is a distinct 422 with `detail: "Capture has no signed WACZ bundle"`.

**Final recommendation:** Use 404 with the same static message as other not-found cases (`"Capture not found"`). The verification endpoint is not the place to diagnose why a capture lacks a WACZ. This is the simplest approach and matches the existing security pattern of giving identical 404 responses regardless of the specific reason.

#### 5. Caching Strategy

`Cache-Control: public, max-age=31536000, immutable`

This is correct for verification responses because:
- Captures are immutable once complete. Their verification status never changes.
- The `public` directive is appropriate because no authentication is required and the response contains no secrets.
- `immutable` tells browsers and CDNs the response will never change, avoiding conditional revalidation.

This matches the caching strategy already used on artifact responses in `handleGetCaptureArtifact`. The retrieval endpoint uses `private, no-store` because capture IDs are access secrets -- but the verification endpoint is explicitly public, so aggressive caching is correct.

**One caveat for the no-WACZ 404 case:** If we return 404 for captures without WACZ, that 404 should NOT be cached with `immutable` because a WACZ could theoretically be added later (though the current system doesn't support this). Use `Cache-Control: no-store` on 404 responses, which is what the retrieval endpoint already does.

#### 6. Rate Limiting

~60 req/min per IP maps to a Cloudflare Rate Limiting rule keyed on `CF-Connecting-IP`. This matches the existing pattern in `handleCreateCapture`. Use the same `CAPTURE_RATE_LIMITER` binding name only if the rate limit is the same; otherwise create a separate `VERIFY_RATE_LIMITER` binding.

**Recommendation:** Use a separate rate limiter binding (`VERIFY_RATE_LIMITER`) because:
- Verification is a public, unauthenticated endpoint -- it has a different abuse profile than capture creation.
- 60 req/min is much more generous than the capture rate limit (which triggers expensive browser rendering). The two should be independently tunable.
- A separate binding prevents a verification flood from starving capture creation or vice versa.

Return `Retry-After: 60` in the 429 response, consistent with existing convention.

#### 7. Route Pattern

```
GET /v1/verify/{id}
```

This is a good URL. It is a verb-ish noun (`verify` as a verification result, not as an action), which is acceptable for a read-only derived resource. The alternative `GET /v1/captures/{id}/verification` would be more strictly RESTful (verification as a sub-resource of captures), but the issue specifies `/v1/verify/{id}` and it reads naturally.

Route regex: `/^\/v1\/verify\/(cap_[a-f0-9]{32})$/`

This is consistent with the existing capture ID pattern used in all other routes.

#### 8. operationId Convention

Following the project's existing pattern (no formal OpenAPI spec yet, but designing for future spec generation):

- `verifyCapture` -- for the `GET /v1/verify/{id}` endpoint

This follows the `{verb}{Resource}` convention. In a future SDK, this becomes `client.captures.verify(id)` or `client.verify(captureId)`.

#### 9. CORS

`Access-Control-Allow-Origin: *` -- consistent with the retrieval endpoint. The verification endpoint is explicitly public and contains no secrets.

#### 10. Security Headers

Same as all other responses (applied in the main `fetch` handler):
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`

No additional security headers needed.

#### 11. Extensibility Considerations

The `checks` array is the primary extensibility surface. Future checks that can be added without breaking the schema:

- `resourceHashes` -- verify individual WARC resource hashes against datapackage.json entries
- `timestamp` -- RFC 3161 timestamp validation (when added)
- `keyRotation` -- verify public key against operator's published key history
- `datapackageIntegrity` -- verify `datapackage-digest.json` `hash` field against SHA-256 of `datapackage.json` bytes

Each new check is a new entry in the `checks` array. `verified` remains the conjunction.

The `wacz` field in the response could later grow a `timestamps` array for RFC 3161 entries, or a `keyId` field for key rotation tracking. These are additive, non-breaking changes.

### Proposed Tasks

1. **Add route and handler stub** -- Add `GET /v1/verify/(cap_[a-f0-9]{32})` to the routes table in `src/index.js`. Wire to `handleVerifyCapture`.

2. **Implement verification logic** -- New module `src/verify.js` that:
   - Fetches WACZ from R2
   - Extracts `datapackage.json` and `datapackage-digest.json` from the ZIP
   - Recomputes `bundleHash` = `sha256(canonicalize(datapackage))`
   - Compares to stored `bundleHash` in `datapackage-digest.json`
   - Verifies Ed25519 signature using `verifySignature` from `signing.js`
   - Returns structured check results

3. **Add rate limiter binding** -- Create `VERIFY_RATE_LIMITER` in `wrangler.toml` (or equivalent), 60 req/min per IP.

4. **Build response** -- Assemble `{ verified, capture, wacz, checks }` in the handler. Apply `Cache-Control: public, max-age=31536000, immutable` and `Access-Control-Allow-Origin: *`.

5. **Write integration tests** -- Cover:
   - Happy path: valid capture returns `verified: true` with correct shape
   - Tamper detection: modify WACZ bytes in R2, verify returns `verified: false` with `bundleHash` check failing
   - Tamper detection: modify stored bundleHash in KV, verify returns `verified: false`
   - Not found: unknown ID returns 404
   - Pending capture: returns 404
   - No-WACZ capture: returns 404
   - Rate limiting: returns 429 with `Retry-After`
   - Caching headers present
   - Security headers present
   - CORS header present
   - Response does not leak `ip` or R2 keys

### Risks and Concerns

1. **WACZ download on every verification request.** The verification logic must download the full WACZ from R2, unzip it, and recompute hashes. For large WACZ files, this could be slow. The `max-age=31536000, immutable` cache helps after the first request, but the first request (cold cache) could exceed the 300ms latency target from the engineering philosophy. **Mitigation:** WACZ files in this MVP are small (screenshots + HTML, no sub-resources). Monitor P95 latency. If it becomes a problem, consider caching the verification result in KV (but this undermines "recompute from source" which is the whole point). A better future mitigation is streaming ZIP entry extraction (read only `datapackage.json` and `datapackage-digest.json` without downloading the full archive) -- but this requires partial range reads on R2 and ZIP central directory parsing. Not worth the complexity for MVP.

2. **Signature verification requires the public key from inside the WACZ.** The current design embeds the public key in `datapackage-digest.json`. The verification endpoint will use this embedded key for verification, which is tautological (an attacker who replaces the WACZ can replace the embedded key too). The response should include the `publicKey` field so independent verifiers can compare against a pinned key. The issue description already notes this: "verifying the Ed25519 signature." The endpoint proves the WACZ is internally consistent (self-signed integrity), not that it was signed by a specific trusted party. This is the correct MVP scope. Key pinning / key publication is a post-MVP concern (already in the backlog: "Old public key archive endpoint").

3. **`fflate` dependency for unzipping.** The WACZ was built with `fflate` (STORE mode, level 0). Verification needs to read entries from the ZIP. `fflate` provides `unzipSync` which should work. Confirm that `fflate` is already a dependency (it is, used in `wacz.js`), so no new dependency is needed.

4. **Cache poisoning risk.** The verification response is `public, immutable`. If a CDN or edge cache serves a stale/wrong result, it persists forever. **Mitigation:** The result is deterministic for immutable captures -- there is no "wrong" result because the underlying data never changes. The only risk is if the WACZ in R2 is replaced, but R2 writes are authenticated and captures are immutable by design. This risk is acceptable.

5. **Canonical JSON consistency.** The bundleHash must be recomputed using the exact same `canonicalize()` function from `canonical-json.js`. Any deviation (different sort order, different number formatting) would cause false negatives. Since both the build path (`wacz.js`) and the verify path will import the same module, this is low risk. Include a test that round-trips: build WACZ, extract datapackage, re-canonicalize, compare hashes.

### Additional Agents Needed

No additional agents beyond those likely already in the planning. The API contract is straightforward (one GET endpoint with a well-defined response). The implementation touches existing modules (`signing.js`, `canonical-json.js`, `wacz.js` patterns, `kv.js`) and follows established patterns. Security review is warranted for the public unauthenticated endpoint, but the security considerations are already addressed above (no information leaks, rate limiting, static 404 messages).

If a **security-minion** is not already part of the planning, they should review:
- The decision to serve `publicKey` in the response (information disclosure assessment)
- Rate limit adequacy for a public unauthenticated endpoint
- Whether the `checks.detail` messages reveal too much about internal state
