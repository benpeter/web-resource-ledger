# Changelog

All notable changes to the WRL API are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions before 1.0.0 were pre-release. Breaking changes were shipped as minor
versions per [SemVer convention](https://semver.org/spec/v2.0.0.html#spec-item-4).

## [Unreleased]

## [1.0.0] - 2026-03-25

### Added

- `WRL-API-Version` response header on all responses, reflecting the current API version
- Deprecation header mechanism per RFC 9745 (`Deprecation: @timestamp`) for signalling deprecated endpoints
- Sunset header per RFC 8594 (`Sunset: HTTP-date`) with minimum 6-month notice commitment
- `Link` header with `rel="deprecation"` pointing to migration guides when deprecation is active
- DEPRECATION-POLICY.md with formal breaking-change definitions and 6-month minimum notice commitment
- CHANGELOG.md with retroactive API history from 0.1.0 onward
- CI enforcement of version sync between openapi.yaml and package.json
- Pull request template with API changelog checklist

### Changed

- Version synchronized across openapi.yaml (was 0.8.0), package.json (was 0.1.0), and git tags to 1.0.0

## [0.8.0] - 2026-03-24

### Added

- `GET /v1/captures/{id}/certificate` — FRE 902(13) certification PDF for legal evidence use cases (#176)
- `GET /v1/notifications/preferences` and `PUT /v1/notifications/preferences` — per-tenant notification preference management (#178)
- `POST /v1/notifications/unsubscribe` — token-based unsubscribe endpoint for email notifications (#178)
- Email notification delivery for operational events (capture complete, capture failed) and billing events
- Build identity metadata fields (`commitSha`, `deployedAt`, `environment`) in `GET /health` response (#171)

### Removed

- Share token endpoints (`POST /v1/captures/{id}/share`, `DELETE /v1/captures/{id}/share/{tokenId}`) — access model simplified to public individual captures and authenticated list (#174)
- `shareToken` query parameter support on `GET /v1/captures/{id}` (#174)
- `tokens` array from capture metadata responses (#174)

## [0.7.0] - 2026-03-23

### Added

- `POST /v1/schedules` — create recurring capture schedules with cron expressions (#151)
- `GET /v1/schedules`, `GET /v1/schedules/{id}`, `PUT /v1/schedules/{id}`, `DELETE /v1/schedules/{id}` — schedule management CRUD (#151)
- `threatCheck` field on capture responses — Google Web Risk content security scan result with `status` and `threatType` (#155)
- Share token endpoints (`POST /v1/captures/{id}/share`, `DELETE /v1/captures/{id}/share/{tokenId}`) for access-controlled capture sharing (#157)
- `shareToken` query parameter on `GET /v1/captures/{id}` for unauthenticated access via share token (#157)
- `qualifiedTimestamp` field on capture responses — eIDAS-qualified RFC 3161 timestamp from a qualified TSA (#158)
- `GET /v1/settings/eidas` and `PUT /v1/settings/eidas` — per-tenant eIDAS qualified timestamp opt-in (#158)

## [0.6.0] - 2026-03-22

### Added

- `POST /v1/webhooks` — register webhook endpoints for event delivery (#130)
- `GET /v1/webhooks`, `GET /v1/webhooks/{id}`, `PUT /v1/webhooks/{id}`, `DELETE /v1/webhooks/{id}` — webhook management CRUD (#130)
- Webhook event delivery with HMAC-SHA256 payload signing via `X-WRL-Signature` header (#130)
- `GET /v1/admin/usage` — tenant usage metrics endpoint (#129)
- `X-RateLimit-Tenant-*` headers on all authenticated responses reflecting per-tenant quota status (#135)
- Custom API domain: `api.webresourceledger.com` replaces `wrl.benpeter.workers.dev` (#140)

## [0.5.0] - 2026-03-17

### Added

- Per-tenant API keys with scoped access (`capture`, `read`, `admin`) (#90)
- `POST /v1/admin/keys` — provision API keys with explicit tenant and scope (#90)
- `DELETE /v1/admin/keys/{keyId}` — revoke API keys (#90)
- `POST /v1/captures/batch` — submit up to 10 capture requests in a single call, returns 207 Multi-Status (#119)
- Stripe-based usage metering; capture events reported to `captures` and `eidas_timestamps` meters (#129)

## [0.4.0] - 2026-03-16

### Added

- RFC 3161 timestamp in every WACZ bundle; `timestamp` field in capture responses with `value` (base64 DER), `tsa`, and `algorithm` (#63)
- `captureSettings` field on capture responses reflecting effective browser configuration used during capture (#65)
- `screenshots` array on capture responses with `full` and `viewport` entries for dual-screenshot captures (#65)

## [0.3.0] - 2026-03-16

### Added

- CORS preflight support (`OPTIONS`) on all endpoints (#57)
- `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers on all endpoints (#57)
- `Strict-Transport-Security` header (`max-age=31536000; includeSubDomains; preload`) on all responses (#57)
- `partial` capture status for timeout fallback: WACZ is produced with whatever was captured before the timeout (#60)

### Fixed

- 13 discrepancies between OpenAPI spec and actual API behavior (#62)

## [0.2.0] - 2026-03-16

### Added

- `GET /v1/captures` — list captures for the authenticated tenant with cursor-based pagination and status filtering (#51)
- Key versioning: signing keys include a `kid` (key ID) field; `GET /v1/signing-key` returns current active key (#54)
- `GET /v1/signing-key/archive` — retrieve all historical public keys by `kid` (#54)
- Staging environment at `wrl-staging.benpeter.workers.dev` (#55)
- Terms of Service (`/terms`) and Content Policy (`/content-policy`) endpoints (#55)

## [0.1.0] - 2026-03-13

### Added

- `POST /v1/captures` — submit a URL for capture; returns a capture ID and `processing` status
- `GET /v1/captures/{id}` — retrieve capture metadata including status, screenshot URL, WACZ URL, and verify URL
- `GET /v1/captures/{id}/screenshot` — proxy artifact endpoint for screenshot image
- `GET /v1/captures/{id}/wacz` — proxy artifact endpoint for WACZ bundle
- `GET /v1/verify/{id}` — verify the integrity and signature of a captured resource; returns HTML or JSON per `Accept` header
- `GET /v1/signing-key` — retrieve the current Ed25519 public key for independent verification
- `GET /health` — health check endpoint
- WACZ bundle construction with Ed25519 signature over canonical JSON datapackage
- SSRF prevention on capture URLs (private IP ranges, localhost, link-local blocked)
- `Content-Security-Policy`, `X-Content-Type-Options`, and `X-Frame-Options` security headers on all responses
- Global rate limiter (100 requests per 10 seconds per IP) via Cloudflare Rate Limiting API
- RFC 9457 Problem Details error responses across all endpoints

---

[Unreleased]: https://github.com/benpeter/web-resource-ledger/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.8.0...v1.0.0
[0.8.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/benpeter/web-resource-ledger/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/benpeter/web-resource-ledger/releases/tag/v0.1.0
