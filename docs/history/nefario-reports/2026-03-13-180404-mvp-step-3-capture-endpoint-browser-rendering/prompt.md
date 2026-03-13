## Goal
A working capture endpoint with isolated browser rendering and status tracking.

## Context
URL validation module exists (Step 2 complete). This step adds the capture endpoint, headless browser rendering, and KV-backed status tracking. The capture lifecycle begins here.

## Work Items
- [ ] `POST /v1/captures`: validate URL via Step 2 module, check `Authorization: Bearer <key>` header (401 if missing or wrong), return 202 Accepted
- [ ] API key read from `CAPTURE_API_KEY` environment variable (set as wrangler secret)
- [ ] Capture ID generated as `cap_` + `crypto.randomUUID()` with hyphens stripped
- [ ] Browser Rendering: navigate to DNS-pinned IP from pre-resolution, capture full-page screenshot (PNG) and rendered HTML
- [ ] Browser isolation: fresh incognito context per capture, 30s timeout, 50MB page limit, 200 subresource cap, context destroyed after completion
- [ ] HTTP response headers captured via a separate Workers `fetch` call to the same DNS-pinned URL
- [ ] Capture status written to KV as `pending` on accept, updated to `complete` or `failed` on resolution
- [ ] `GET /v1/captures/{id}/status` reads KV and returns `{ "status": "pending"|"complete"|"failed" }`
- [ ] RFC 9457 404 returned from status endpoint for unknown capture IDs
- [ ] 202 response body includes capture ID and status URL; body must state caller is responsible for preserving the capture ID
- [ ] Platform rate limiting configured (~10 captures/min, ~3 concurrent per IP) via wrangler.toml or Cloudflare dashboard

## Acceptance Criteria
- `POST /v1/captures` with valid API key returns 202 with capture ID and status URL
- `POST /v1/captures` with missing or invalid API key returns 401
- `GET /v1/captures/{id}/status` returns `{ "status": "pending" }` immediately after submission
- `GET /v1/captures/{id}/status` eventually returns `{ "status": "complete" }` after processing
- `GET /v1/captures/{id}/status` returns RFC 9457 404 for unknown IDs

## Dependencies
- Blocked by: #2
- Blocks: #4

## Technical Notes
- Rate limiting MUST be implemented via the Cloudflare platform (wrangler.toml rules or Cloudflare dashboard), NOT custom application code
- Capture ID MUST use `crypto.randomUUID()`, NOT `Math.random()` or timestamps
- The 202 response must explicitly note that the caller is responsible for preserving the capture ID
