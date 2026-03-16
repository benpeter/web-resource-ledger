# Code Review: docs-drift-audit

Reviewed by: code-review-minion

## Cross-Check Methodology

All openapi.yaml claims were verified against `src/index.js` and `src/rate-limits.js`.
The review focused on: response shape accuracy, header presence/absence, rate-limit
group membership, status code preconditions, and security-relevant claims.

---

VERDICT: ADVISE

FINDINGS:

- [ADVISE] openapi.yaml:957-967 -- X-RateLimit-Limit listed on POST /v1/captures 415 response, but the 415 is returned *before* the rate-limit group header is set. The `getRateLimitGroup` / `response.headers.set('X-RateLimit-Limit', ...)` block runs at lines 97-100 of index.js (the global response wrapper), which executes after the handler returns. However, the 415 handler exits at line 129 *before the rate limiter check at line 141*, so the rate limit ceiling has not been tested yet. The header is still set in the wrapper, so the value is technically present on the 415 -- this is likely correct behavior. However the spec example at line 975 says `detail: Content-Type must be application/json` while the code at line 129 says the same thing. No discrepancy here -- this finding is lower confidence and is withdrawn. NIT only: the spec 415 response also carries CORS headers (`Access-Control-Allow-Origin`, `Vary`). Code sets CORS headers only for `POST /v1/captures` responses when the origin is allowed (lines 88-94). A 415 is returned by the POST handler, so CORS headers are set after the fact by the wrapper. This is correct. No action needed.
  FIX: No change required. Withdrawing this as a real finding.

- [ADVISE] openapi.yaml:60-68 -- `XRateLimitLimit` component header description says "Present on all non-503 responses from rate-limited endpoints". The code at line 98 reads `response.status !== 503`. This is accurate. However, the spec on the `/.well-known/signing-key` 200 response (line 1476) includes `X-RateLimit-Limit`, and the `/.well-known/signing-keys` 200 response (line 1550) also includes it. The code's `getRateLimitGroup` at line 42 uses `pathname.startsWith('/.well-known/signing-key')`, which matches both `/.well-known/signing-key` and `/.well-known/signing-keys` (since "signing-keys" starts with "signing-key"). So both are in the `verify` group and receive `X-RateLimit-Limit: 60`. The spec is correct -- but this is subtle and the startsWith match being intentional should be noted.
  FIX: No change needed; code and spec agree. The implementation detail is worth a code comment but does not affect doc accuracy.

- [ADVISE] openapi.yaml:449-456 -- `Problem400` shared response component example `missingBody` says `detail: Request body is missing or not valid JSON.` but the code returns `problemResponse(400, 'Request body must be valid JSON')` (line 163) for JSON parse failure, and `problemResponse(400, "Field 'url' is required")` (line 168) for missing url. Neither matches the example string verbatim. The example says "Request body is missing or not valid JSON." but the code does not produce that exact string. This is an example discrepancy in the shared Problem400 component.
  FIX: Update the `missingBody` example in `Problem400` to match the actual error string from code, or document that detail strings are illustrative. Given the spec also has inline examples on POST /v1/captures (line 900) with the same invented string, these examples are clearly illustrative -- add a note to the shared component that detail strings are representative, not exact.

- [ADVISE] openapi.yaml:453 and 903 -- example `missingUrl` says `detail: Request body must include a "url" field.` The code at line 168 returns `"Field 'url' is required"`. These do not match. Both occurrences (shared component and inline POST example) use the same invented string that differs from the actual code.
  FIX: Change example detail to `"Field 'url' is required"` to match `src/index.js` line 168.

- [ADVISE] openapi.yaml:798-799 -- `GET /v1/captures` includes a `503` response referencing `Problem503`. The shared `Problem503` component (line 542) includes a `Retry-After` header. In the code, the 503 from `GLOBAL_CAPTURE_LIMITER` is returned with `{ 'Retry-After': '10' }` (line 154/229). However, the `X-RateLimit-Limit` header is suppressed on 503 responses (`response.status !== 503` guard at line 98). The spec `Problem503` component does NOT include `X-RateLimit-Limit` -- that is correct. But `Problem503` also does not include `Retry-After` as optional vs required; the code always sends it for capacity 503s. Spec says it's present in the response header definition. This is consistent. No real issue.
  FIX: No change needed.

- [ADVISE] openapi.yaml:1476-1477 -- `/.well-known/signing-key` 200 response includes `X-RateLimit-Limit`. The spec `XRateLimitLimit` description says the limit for the verify group is implied. The actual limit for the verify group is 60 (from `src/rate-limits.js`). The spec does not document the numeric value inline for the signing-key endpoint -- it just references the component. The component says `examples: [10]` which is the capture group limit. This example on the component is misleading for endpoints in the verify group (limit: 60).
  FIX: Update `XRateLimitLimit` component example to show both values, e.g. `examples: [10, 60]`, or remove the numeric example entirely since it varies by endpoint. The current `examples: [10]` could mislead users of the signing-key and verify endpoints into expecting limit 10 when the actual ceiling is 60.

- [NIT] openapi.yaml:14 -- Staging server URL is `https://wrl-staging.example.workers.dev`. This is a placeholder. That is expected for a public spec, but it means the spec cannot be used to test against staging directly without substitution. No blocking concern -- this is standard practice for public OpenAPI specs.
  FIX: No change required. Optional: add a note in the server description that the URL must be replaced with the actual deployment.

- [NIT] openapi.yaml:1492 -- `publicKey` description says "Base64-encoded 32-byte Ed25519 public key." The code at `handleGetSigningKey` (line 526-528) encodes the raw public key bytes as base64 using `btoa`. The raw Ed25519 public key is 32 bytes. The description is accurate. No issue.

- [NIT] README.md:346 -- "Present on responses from rate-limited endpoints (captures, verification, key archive)." The code applies `X-RateLimit-Limit` to any response from `getRateLimitGroup`-classified paths. The "key archive" phrasing refers to `/.well-known/signing-keys`. Since `/.well-known/signing-key` (singular) is also rate-limited (same verify group), the README should mention both signing-key endpoints, not just "key archive". This is minor since the public key endpoint is arguably implied.
  FIX: Change "captures, verification, key archive" to "captures, verification, signing key endpoints" for precision.

---

## Security Observations

No secrets, internal IPs, or credentials in the changed files. The OpenAPI spec uses `wrl.example.com` as the production URL placeholder, which is appropriate. The CONTRIBUTING.md `.dev.vars` template shows only placeholder values, not real secrets. The Coralogix key is noted as optional with no actual value shown.

The spec correctly documents the security model:
- Capture ID as access secret (no auth on GET /v1/captures/{id} and artifacts)
- Static 404 message (no ID enumeration)
- X-Frame-Options: DENY on all responses
- Content-Disposition: attachment on artifact downloads
- HTML served as text/plain to prevent XSS

## Summary

The spec is in good shape overall. The two concrete discrepancies worth fixing are:

1. The `missingUrl` example string (spec says "Request body must include a \"url\" field." but code returns "Field 'url' is required")
2. The `XRateLimitLimit` component example value of 10 is misleading when the verify/signing-key group uses 60

Everything else is either confirmed accurate or NIT-level.
