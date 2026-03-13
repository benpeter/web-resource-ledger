# Task 3: Write Implementation Plan (append to docs/MVP.md)

Write a sequenced implementation plan for the WRL MVP. Append it to `docs/MVP.md` under a clear `## Implementation Plan` heading.

## Context

The MVP scope is defined in `docs/MVP.md` (approved). The technology decisions are in `docs/evolution/0001-kickoff/decisions.md` (approved). Read both before writing.

The implementation plan must satisfy this constraint: "Sequence matters -- each step should produce something runnable."

**IMPORTANT**: Append to `docs/MVP.md`. Do NOT create a separate file. Do NOT modify existing content in MVP.md -- only add the new section at the end.

## Structure

Each step produces a runnable artifact. Steps are ordered by dependency.

```
## Implementation Plan

### Step N: <Title>
**Produces**: <what is runnable after this step>
**Depends on**: <previous step(s), or "none">

<3-5 bullet points describing the work>

**Verification**: <how to confirm this step is complete and working>
```

## Implementation Sequence

Use these steps. Each produces something you can test. Note: all API endpoints use the `/v1/` version prefix established in the scope document.

### Step 1: Project Scaffold and Cloudflare Worker

Set up the project structure and deploy a minimal Cloudflare Worker.

- Initialize `wrangler.toml` with Worker name, R2 bucket binding, KV namespace binding, Browser Rendering binding
- Create the basic Worker entry point with route handling (vanilla JS, no framework)
- Implement health check endpoint (`GET /health`)
- Set up test infrastructure: Vitest with `@cloudflare/vitest-pool-workers` for testing in the Workers runtime via Miniflare
- Establish structured error response pattern (RFC 9457 format: `{ "type": "...", "title": "...", "status": N, "detail": "..." }`) from the start
- **Produces**: A Worker that responds to HTTP requests. Health check passes in both `wrangler dev` (local) AND deployed environment.
- **Verification**: `wrangler dev` serves locally; `curl http://localhost:8787/health` returns 200. After deploy, `curl https://wrl.yourdomain.com/health` returns 200.

### Step 2: URL Validation and SSRF Prevention

Build the URL validation module as a standalone, testable library. This is the most security-critical component.

- URL scheme allowlist (http/https only, reject file/ftp/data/javascript/blob/gopher)
- Reject URLs with embedded credentials (`http://user:pass@host`)
- Reject `0.0.0.0` and `0.0.0.0/8`
- DNS pre-resolution with private IP range blocking:
  - IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8
  - IPv6: fc00::/7 (unique local), fe80::/10 (link-local), ::1 (loopback), ::ffff:127.0.0.1 (IPv6-mapped IPv4)
- DNS pinning: resolve IP once, pass resolved IP to Browser Rendering -- no re-resolution (prevents DNS TOCTOU/rebinding attacks)
- URL normalization via the URL constructor (prevents encoding tricks)
- URL length limit (2048 characters)
- Redirect chain validation (re-apply all checks at each hop, max 5 redirects)
- Unit tests with specific SSRF bypass test vectors:
  - Hex-encoded IP (http://0x7f000001/)
  - Octal IP (http://0177.0.0.1/)
  - Decimal IP (http://2130706433/)
  - IPv6-mapped IPv4 (http://[::ffff:127.0.0.1]/)
  - DNS to loopback (requires test hostname)
  - Redirect to private IP after initial validation passes
  - Embedded credentials (http://user@169.254.169.254/)
  - IPv6 ULA (http://[fc00::1]/)
  - Double encoding
- **Produces**: A tested URL validation module importable by the capture endpoint.
- **Verification**: All SSRF bypass test vectors pass in Vitest (via Miniflare runtime). Module exports a single `validateUrl(url)` function.

### Step 3: Capture Endpoint and Browser Rendering

Implement the capture flow: accept a URL, validate it, render it with Browser Rendering, collect artifacts. Includes browser isolation (not deferred to a separate step).

- `POST /v1/captures` endpoint: accept URL in request body, validate with Step 2 module
- API key authentication (single bearer token from env var, 401 if missing/invalid)
- Generate capture ID: `cap_` prefix + `crypto.randomUUID()` with hyphens stripped (e.g., `cap_550e8400e29b41d4a716446655440000`)
- Invoke Cloudflare Browser Rendering: navigate to URL using the DNS-pinned IP, take full-page screenshot (PNG), extract rendered HTML
- Browser isolation: fresh incognito context per capture, navigation timeout (30s), page size limit (50MB), subresource cap (200), context destroyed after capture
- Capture HTTP response headers via Workers fetch
- Store capture status in KV (pending -> complete/failed)
- Rate limiting: use Cloudflare platform rate limiting (wrangler.toml / dashboard), not custom application code. Suggested starting thresholds: 10 captures/min per IP, 3 concurrent per IP.
- Return 202 Accepted with capture ID and status URL. Response must clearly indicate caller is responsible for preserving the capture ID.
- `GET /v1/captures/{id}/status` endpoint: return capture status from KV
- **Produces**: `POST /v1/captures` accepts a URL, validates it, renders it in an isolated browser, and stores artifacts. `GET /v1/captures/{id}/status` shows pending/complete/failed.
- **Verification**: `wrangler dev` + `curl -X POST -H "Authorization: Bearer $KEY" -d '{"url":"https://example.com"}' http://localhost:8787/v1/captures` returns 202 with capture ID. Status endpoint shows progress.

### Step 4: WACZ Bundling and Signing

Package captured artifacts into a signed WACZ bundle and store in R2.

- Write WARC records from captured artifacts (HTML, screenshot, headers) using warcio.js
- Generate CDXJ index
- Compute SHA-256 hash of each artifact
- Generate `datapackage.json` manifest with artifact hashes
- Compute bundleHash (SHA-256 of canonical JSON of artifacts object -- sorted keys, no whitespace)
- Sign bundleHash with Ed25519 (Web Crypto API). Private key: base64-encoded 32-byte raw key from env var, generated via `crypto.generateKey("Ed25519")`, exported via `exportKey("raw")`. Public key derived from private key at startup, never stored separately. Key must never be committed to VCS or stored in wrangler.toml.
- Create manifest with `signatures` array containing the self-signature (type: "self")
- Package as WACZ (ZIP containing WARC + index + manifest)
- Store WACZ in R2 with content-addressed key (`captures/{sha256-of-wacz}.wacz`)
- Store metadata in KV (capture ID -> R2 key mapping + capture metadata)
- Tests: (a) construct a known bundle, compute bundleHash, sign, verify signature with public key; (b) verify canonical JSON serialization is stable across runs (sort keys, strip whitespace, identical output for identical inputs)
- **Produces**: Captures produce signed WACZ bundles stored in R2. Each bundle is tamper-evident.
- **Verification**: Vitest: signing round-trip test passes. After capture, R2 contains a WACZ file. KV contains metadata mapping capture ID to R2 key.

### Step 5: Retrieval Endpoint

Serve capture metadata and artifact links.

- `GET /v1/captures/{id}` endpoint: look up capture ID in KV, return metadata with artifact links
- Artifact serving: proxy from R2 or return signed redirect URLs
- 404 uses RFC 9457 format (pattern established in Step 1)
- <300ms response time target
- **Produces**: Complete capture lifecycle: submit URL, poll status, retrieve results.
- **Verification**: `curl http://localhost:8787/v1/captures/{id}` returns metadata with artifact links for a completed capture. Unknown ID returns 404 in RFC 9457 format. Response time under 300ms.

### Step 6: Verification Endpoint

The core value prop -- public, unauthenticated integrity verification.

- `GET /v1/verify/{id}` endpoint: no authentication required
- Fetch WACZ bundle from R2
- Recompute SHA-256 hashes of each artifact
- Compare against manifest hashes
- Verify Ed25519 signature over bundleHash
- Return structured result: `{ "verified": true/false, "capture": {...}, "artifacts": {...} }`
- Rate limiting: Cloudflare platform rate limiting. Suggested starting threshold: 60 verifications/min per IP.
- Cache headers: `Cache-Control: public, immutable, max-age=31536000`
- Integration test: call POST /v1/captures, poll GET /v1/captures/{id}/status until complete, then call GET /v1/verify/{id} and assert `verified: true`. This validates the full capture-to-verify round trip.
- **Produces**: Third parties can verify capture integrity via a public endpoint.
- **Verification**: Full round-trip integration test passes against `wrangler dev`. `GET /v1/verify/{id}` returns `{ "verified": true }` for a known-good capture.

### Step 7: Static Verification Page

A minimal HTML page for non-technical verifiers.

- Single static HTML file served at `/v1/verify/{id}` when `Accept: text/html` (content negotiation)
- Vanilla JS: calls the verify API, displays result (URL, timestamp, hash, verified/failed)
- Displays screenshot thumbnail and link to full HTML snapshot
- `<noscript>` fallback: display the capture ID and a direct link to the verify API JSON endpoint so a no-JS user can verify via curl
- No framework, no build step, no npm dependencies
- **Produces**: Non-technical third parties can verify a capture by opening a link in a browser.
- **Verification**: Open `/v1/verify/{id}` in a browser -- shows verification result with screenshot. With JS disabled, shows noscript fallback with direct API link.

### Step 8: OpenAPI Spec and Security Hardening

Cross-cutting concerns: API specification, security headers, and operational endpoints.

- Write `openapi.yaml` as the source of truth for all 4 API endpoints. Include request/response schemas, error responses (RFC 9457), authentication requirements, and rate limit documentation.
- Security headers on all responses: HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY
- DNS pinning verification: confirm that pre-validated IP from Step 2 is used by Browser Rendering (no re-resolution)
- Global backpressure: 503 + Retry-After when capacity exceeded
- Public key endpoint: `GET /.well-known/signing-key` (Ed25519 public key, base64-encoded, for independent verification)
- Document key rotation procedure in README: `wrangler secret update SIGNING_KEY` + `wrangler deploy`
- **Produces**: Fully specified API, hardened service ready for external use.
- **Verification**: OpenAPI spec validates with `swagger-cli validate openapi.yaml`. Security headers present on all responses. `GET /.well-known/signing-key` returns the public key.

## Notes for the Implementation Plan Document

- Each step notes what is testable after completion
- Steps 1-6 are sequential (each builds on the previous)
- Step 7 can run in parallel with Step 6 (different files, no dependency beyond Step 5)
- Step 8 is partially parallel (security hardening can begin alongside Steps 5-7; OpenAPI spec can be written once all endpoints exist)
- Keep the plan concise. 3-5 bullet points per step. No code examples.
- The primary test loop is `wrangler dev` (local Miniflare environment). Deployed verification is secondary.
- Test framework: Vitest with `@cloudflare/vitest-pool-workers`
- Acceptance criteria for each step should be verifiable checks (HTTP response codes, JSON fields, commands that can be run), not outcome descriptions

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
