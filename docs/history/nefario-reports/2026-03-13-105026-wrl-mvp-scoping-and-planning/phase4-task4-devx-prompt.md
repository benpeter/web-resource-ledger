# Task 4: Create GitHub Issues

Create GitHub issues for the WRL MVP implementation plan. Read `docs/MVP.md` for the full scope and implementation sequence (the Implementation Plan section at the bottom).

## Context

The WRL MVP has been scoped and planned. The implementation plan has 8 sequential steps. Each step becomes one GitHub issue. Issues should be self-contained: a developer can pick up any issue and execute it without reading the full planning documents, as long as predecessor issues are complete.

## Issue Format

For each implementation step, create a GitHub issue using `gh issue create`.

**Title format**: `MVP Step N: <concise title>`

**Body structure**:
```
## Goal
<one sentence: what this step produces>

## Context
<1-2 sentences: what exists before this step, what this step adds>

## Work Items
- [ ] <checkbox item 1>
- [ ] <checkbox item 2>
...

## Acceptance Criteria
- <verifiable criterion: HTTP code, JSON field, runnable command, or test that must pass>
...

## Dependencies
- Blocked by: #<issue number> (or "none")
- Blocks: #<issue number> (or "none")

## Technical Notes
<2-3 bullet points of key technical context the implementer needs>
```

**Labels**: Add labels `mvp` and `enhancement` to each issue. Create the `mvp` label first if it does not exist (`gh label create mvp --description "Minimum viable product" --color 0E8A16`).

## Issues to Create

Create 8 issues, one per implementation step:

1. **Project Scaffold and Cloudflare Worker** -- wrangler.toml, Worker entry point, health check, Vitest + @cloudflare/vitest-pool-workers, RFC 9457 error pattern
2. **URL Validation and SSRF Prevention** -- standalone module, scheme allowlist, DNS validation, private IP blocking (IPv4 + IPv6: fc00::/7, fe80::/10, ::1, ::ffff:127.0.0.1), embedded credentials rejection, 0.0.0.0/8 rejection, DNS pinning, specific bypass test vectors
3. **Capture Endpoint and Browser Rendering** -- POST /v1/captures, API key auth, Browser Rendering, browser isolation (fresh context, 30s timeout, 50MB limit, 200 subresource cap), KV for status, platform rate limiting, capture ID via crypto.randomUUID()
4. **WACZ Bundling and Signing** -- warcio.js WARC records, SHA-256 hashing, canonical JSON bundleHash, Ed25519 signing (raw 32-byte base64 key via crypto.generateKey), R2 storage, signing round-trip test, canonical JSON stability test
5. **Retrieval Endpoint** -- GET /v1/captures/{id} and /v1/captures/{id}/status, artifact serving from R2, RFC 9457 404s, <300ms target
6. **Verification Endpoint** -- GET /v1/verify/{id}, public/unauthenticated, hash recomputation, signature verification, cache headers, full capture-to-verify integration test
7. **Static Verification Page** -- single HTML file, vanilla JS, content negotiation, noscript fallback (NOT progressive enhancement), screenshot thumbnail
8. **OpenAPI Spec and Security Hardening** -- openapi.yaml as API source of truth, security headers (HSTS, X-Content-Type-Options, X-Frame-Options), DNS pinning verification, backpressure (503 + Retry-After), public key endpoint, key rotation docs

## Technical Notes for Issues

**Issue 1 (Scaffold)**:
- Cloudflare Worker with vanilla JS (no framework)
- wrangler.toml bindings: R2 bucket, KV namespace, Browser Rendering
- Plain JS, not TypeScript
- Vitest + `@cloudflare/vitest-pool-workers` for testing in the Workers runtime
- RFC 9457 error response pattern as shared utility from Step 1
- Acceptance criteria: `curl http://localhost:8787/health` returns HTTP 200 with `{"status":"ok"}`; `vitest run` passes

**Issue 2 (SSRF Prevention)**:
- Most security-critical component in the entire system
- Must block: private IPv4 ranges (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8); IPv6 private (fc00::/7, fe80::/10, ::1, ::ffff:127.0.0.1); 0.0.0.0/8; embedded credentials
- DNS pinning: resolve IP once, pass to Browser Rendering -- no re-resolution (prevents DNS TOCTOU/rebinding)
- Must handle bypass vectors. Acceptance criteria MUST enumerate these specific test cases:
  - [ ] Hex-encoded IP (http://0x7f000001/) blocked
  - [ ] Octal IP (http://0177.0.0.1/) blocked
  - [ ] Decimal IP (http://2130706433/) blocked
  - [ ] IPv6-mapped IPv4 (http://[::ffff:127.0.0.1]/) blocked
  - [ ] IPv6 ULA (http://[fc00::1]/) blocked
  - [ ] DNS-to-loopback redirect blocked
  - [ ] Redirect to private IP after initial validation blocked
  - [ ] Embedded credentials (http://user@169.254.169.254/) blocked
  - [ ] Double-encoded paths blocked
- Extract as standalone module with its own test suite
- Acceptance criteria: all above test cases pass in `vitest run`

**Issue 3 (Capture)**:
- API key: single bearer token from env var (CAPTURE_API_KEY), 401 if missing/invalid
- Capture ID: `cap_` + `crypto.randomUUID()` with hyphens stripped (e.g., `cap_550e8400e29b41d4a716446655440000`). NOT Math.random() or timestamp-based.
- Browser isolation: fresh incognito context per capture, 30s nav timeout, 50MB page limit, 200 subresource cap, context destroyed after
- Rate limiting: Cloudflare platform (wrangler.toml / dashboard), NOT custom app code. Starting thresholds: ~10/min, ~3 concurrent per IP
- 202 response must clearly state caller is responsible for preserving the capture ID (no list endpoint in MVP)
- Acceptance criteria: `curl -X POST -H "Authorization: Bearer $KEY" -d '{"url":"https://example.com"}' /v1/captures` returns 202 with capture ID; missing key returns 401; status endpoint returns pending/complete/failed

**Issue 4 (WACZ)**:
- Use warcio.js for WARC record creation
- bundleHash = SHA-256 of canonical JSON (sort keys, no whitespace)
- Ed25519 key: base64-encoded raw 32-byte via `crypto.generateKey("Ed25519")` + `exportKey("raw")`. Public key derived at startup. Key NEVER in VCS or wrangler.toml.
- R2 object key: `captures/{sha256-of-wacz}.wacz`
- Manifest `signatures` array with type: "self" entry
- Acceptance criteria: (a) `vitest run` signing round-trip test passes (sign bundleHash, verify with public key); (b) canonical JSON test passes (same input produces identical bytes across runs); (c) R2 contains .wacz object after capture
- [ ] Key generation procedure documented (never committed to VCS)

**Issue 5 (Retrieval)**:
- KV lookup for metadata, R2 for artifact content
- Return artifact links, not inline content
- RFC 9457 404 for unknown IDs
- Acceptance criteria: `GET /v1/captures/{id}` returns JSON with metadata and artifact URLs for known ID; returns RFC 9457 404 for unknown ID; response time < 300ms

**Issue 6 (Verify)**:
- Fully public, no authentication
- Recompute all hashes, verify Ed25519 signature
- Response: `{ "verified": true|false, "capture": {...}, "artifacts": {...} }`
- Cache-Control: public, immutable, max-age=31536000
- Rate limit: Cloudflare platform, ~60/min per IP
- **Integration test required**: POST /v1/captures -> poll status -> GET /v1/verify/{id} -> assert `verified: true`. This is the definition of done for the MVP.
- Acceptance criteria: integration test passes in `wrangler dev`; tampering with artifact causes `verified: false`

**Issue 7 (Verification Page)**:
- Content negotiation: serve HTML when Accept includes text/html, JSON otherwise
- Single HTML file, inline CSS, inline JS (no external dependencies)
- Show: URL, capture timestamp, hash, verified/failed badge, screenshot thumbnail
- `<noscript>` fallback with capture ID and direct link to JSON API endpoint (NOT "must work without JS" -- that would require SSR)
- Acceptance criteria: open verification URL in browser shows result with badge; disable JS shows noscript fallback with API link

**Issue 8 (OpenAPI + Security)**:
- `openapi.yaml` as source of truth for all 4 endpoints (schemas, errors, auth, rates)
- Security headers: HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY
- `GET /.well-known/signing-key` returns Ed25519 public key (base64-encoded)
- Global backpressure: 503 + Retry-After
- Key rotation documented in README
- Acceptance criteria: `openapi-validator` reports no errors; `curl -I` shows security headers; `GET /.well-known/signing-key` returns public key

## Execution Notes

- Create the `mvp` label first, then create issues in order (1 through 8)
- After creating each issue, note its number so you can reference it in the Dependencies section of subsequent issues
- Issue 1 blocks Issue 2, Issue 2 blocks Issue 3, etc. (mostly sequential)
- Issue 7 is blocked by Issue 5 (needs capture data to display) but not by Issue 6
- Issue 8 is blocked by Issue 3 (needs endpoints to harden)
- Do NOT create issues for post-MVP work. Only the 8 MVP implementation steps.

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- The issue numbers created (e.g., "#1 through #8")
- 1-2 sentence summary
