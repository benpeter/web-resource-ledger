# Phase 0005: Capture Endpoint and Browser Rendering

GitHub Issue #3: MVP Step 3

## Task

Build a capture endpoint with isolated browser rendering and KV-backed status
tracking for the Web Resource Ledger Cloudflare Worker.

## Key Requirements

- **POST /v1/captures**: Accept a URL, validate it (SSRF prevention via
  existing `validateUrl`), authenticate via API key, return 202 Accepted with
  capture ID and status URL
- **Browser Rendering**: Navigate to URL using Cloudflare Browser Rendering
  binding (Puppeteer), capture screenshot (PNG) and rendered HTML
- **Browser isolation**: Incognito context, 25s navigation timeout (within
  30s `ctx.waitUntil` budget), 50MB page size limit, 200 subresource cap
- **HTTP response headers**: Captured via separate `fetch()` with
  `redirect: 'manual'`, Set-Cookie values redacted
- **Artifact storage**: Screenshot, HTML, and headers stored in R2 under
  `captures/{captureId}/`
- **KV status tracking**: pending (with 24h TTL) -> complete/failed
- **GET /v1/captures/{id}/status**: Return capture status with
  state-conditional fields
- **Platform rate limiting**: ~10 requests/min via wrangler.toml binding
- **Capture ID format**: `cap_` + `crypto.randomUUID()` hyphens stripped
  (122-bit entropy, ID serves as access secret)

## Acceptance Criteria (from Issue #3)

- POST /v1/captures returns 202 with `{ id, statusUrl, note }`
- Body includes message telling caller to preserve the capture ID
- GET /v1/captures/{id}/status returns current status
- Browser rendering produces screenshot and HTML
- KV transitions: pending -> complete (with artifacts) or failed (with error)
- Rate limiting active (~10/min)
- All existing tests continue to pass
