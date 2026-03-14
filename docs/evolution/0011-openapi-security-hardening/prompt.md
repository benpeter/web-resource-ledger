# MVP Step 8: OpenAPI Spec and Security Hardening

GitHub Issue #8.

## Goal
Fully specified API, hardened service, and public key endpoint.

## Context
All API endpoints exist (Steps 3-7 complete). This step hardens the service for production: formal API specification, security headers, backpressure handling, and a public key endpoint for independent signature verification.

## Work Items
- `openapi.yaml` documents all four endpoints with request/response schemas, RFC 9457 error shapes, auth requirements, and rate limit annotations
- Security headers added to all responses: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- DNS pinning enforcement verified
- Global backpressure handler: returns 503 with `Retry-After` header when Worker concurrency limit is approached
- `GET /.well-known/signing-key` returns current Ed25519 public key with appropriate caching headers
- Key rotation procedure documented in README
