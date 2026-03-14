## Goal
Fully specified API, hardened service, and public key endpoint.

## Context
All API endpoints exist (Steps 3-7 complete). This step hardens the service for production: formal API specification, security headers, backpressure handling, and a public key endpoint for independent signature verification.

## Work Items
- [ ] `openapi.yaml` documents all four endpoints (`POST /v1/captures`, `GET /v1/captures/{id}/status`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`) with request/response schemas, RFC 9457 error shapes, auth requirements, and rate limit annotations
- [ ] Security headers added to all responses: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- [ ] DNS pinning enforcement verified: Worker refuses to proceed if pre-resolution returns a private IP (defense-in-depth check)
- [ ] Global backpressure handler: returns 503 with `Retry-After` header when Worker concurrency limit is approached
- [ ] `GET /.well-known/signing-key` returns current Ed25519 public key (base64-encoded raw bytes) with appropriate caching headers
- [ ] Key rotation procedure documented in README: `wrangler secret put SIGNING_KEY` + `wrangler deploy` + update `/.well-known/signing-key` cache

## Acceptance Criteria
- `openapi-validator` (or equivalent CLI tool) reports no errors against `openapi.yaml`
- `curl -I https://<worker-url>/health` shows `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` headers
- `GET /.well-known/signing-key` returns the Ed25519 public key as base64

## Dependencies
- Blocked by: #3 (needs endpoints to exist before speccing them)
- Blocks: none

## Technical Notes
- Can be started in parallel with Steps 6 and 7 once Step 3 endpoints are stable — the spec can be drafted incrementally and finalized at the end
- The `/.well-known/signing-key` endpoint enables independent third-party verification without trusting the API response — document this use case in the README
- Security headers should be applied in a single middleware-style wrapper in the Worker entry point, not duplicated per-route
