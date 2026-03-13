# WRL Minimum Viable Product

## Goal

The smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture.

---

## What's In

### Capture (R1)

- **HTML snapshot** -- rendered DOM captured via headless browser (Cloudflare Browser Rendering)
- **Screenshot** -- full-page PNG from the same browser session
- **HTTP response headers** -- captured via separate fetch at capture time
- **Content hashes** -- SHA-256 of each artifact, plus a bundle hash over the canonical artifacts manifest
- **Server timestamp** -- self-asserted ISO 8601 timestamp generated at capture time
- **Ed25519 signature** -- signs the bundle hash; proves WRL authorship and bundle integrity
- **Bundle format** -- WACZ (simplified): HTML + screenshot + headers packaged as a ZIP with a `datapackage.json` manifest containing SHA-256 hashes of every file

### Immutable Storage (R2)

- Cloudflare R2 with content-addressed keys (`captures/{sha256}.wacz`)
- Bucket locks enabled for retention -- objects cannot be overwritten or deleted
- Zero egress fees, ensuring verification traffic is cost-neutral
- Capture metadata (ID, URL, timestamp, artifact locations, manifest) stored in Workers KV

### Verification (R3)

- Public `GET /verify/{id}` endpoint -- no authentication required
- Recomputes SHA-256 hashes of stored artifacts, compares against the manifest, verifies the Ed25519 signature
- Returns a structured JSON result: `verified: true/false`, capture metadata, artifact links
- Static verification page -- single HTML file + vanilla JS -- renders the verification result for non-technical third parties; accessible via a shareable link

### API Surface

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| `POST` | `/v1/captures` | API key required | Submit a URL for capture. Returns 202 Accepted with a capture ID and status URL. Caller is responsible for persisting the capture ID. |
| `GET` | `/v1/captures/{id}/status` | None (ID is the secret) | Poll capture progress: `pending`, `complete`, or `failed`. |
| `GET` | `/v1/captures/{id}` | None (ID is the secret) | Retrieve capture metadata and artifact links. |
| `GET` | `/v1/verify/{id}` | None | Public verification. Returns verification result with metadata. |

All endpoints are versioned under `/v1/` to allow non-breaking evolution. An OpenAPI spec (`openapi.yaml`) is maintained as the API's source of truth.

**API key:** Single static bearer token set as a `wrangler secret`. Protects the capture endpoint (resource-intensive, SSRF-capable). Key rotation is a `wrangler secret update` + `wrangler deploy` (30-second operation).

**Capture ID loss:** There is no list endpoint in the MVP. If the caller loses the capture ID, the capture is permanently inaccessible. For a single-operator deployment, the caller is responsible for retaining IDs. This is a known and accepted limitation.

---

## What's Out (and Why)

| Feature | Why It's Out |
|---------|-------------|
| Scheduled captures (cron-style) | Additional trigger method. On-demand API covers the core value prop. |
| Webhooks (inbound triggers) | Additional trigger method. Not needed for MVP. |
| MCP / AI-agent triggers | Additional trigger method. Layers on top of the API later. |
| Watch lists / bulk monitoring | Requires monitoring mode (also out). Single URL on-demand is table stakes. |
| Change detection / diffing | Requires multiple captures over time and monitoring mode. |
| Notifications | API 202 response is the notification for on-demand captures. No event system needed. |
| Multi-tenancy / RBAC | Zero users. MVP is single-operator. Static API key suffices. |
| Social signup / user management | No identity system. Not needed for single-operator MVP. |
| Billing & quotas | No monetization for MVP. |
| Resource manifest (CSS/JS/images) | Dramatically increases capture complexity. HTML + screenshot prove content state. |
| Full HTTP exchange capture | MVP uses rendered DOM + separate header fetch. Forensic-grade proxy capture is post-MVP. |
| RFC 3161 timestamps / TSA | Ed25519 self-signing is sufficient for MVP integrity. TSA adds temporal proof but requires ASN.1 parsing and an external service dependency. Upgrade path is documented and designed. |
| eIDAS / legal admissibility | Depends on TSA (also out). Bundle format and signatures array are designed to accommodate this later. |
| CI/CD pipeline | Manual `wrangler deploy` for single-developer MVP. Add GitHub Actions when it hurts. |
| Database | Write-once, read-by-ID pattern. KV for metadata, R2 for bundles. No SQL database needed. |
| List/search captures | No `GET /captures` endpoint. First addition post-MVP. |
| Autoscaling | Cloudflare handles this. No configuration needed. |
| WORM-certified storage | R2 bucket locks are adequate. S3 Object Lock for regulated customers is post-MVP. |

---

## Gray Zone Decisions

| Feature | Decision | Rationale |
|---------|----------|-----------|
| Screenshot | **IN** | Browser Rendering is already in the architecture for HTML capture. Screenshot is one additional API call -- essentially free once the browser is open. |
| WACZ bundle format | **IN** | Complexity delta over a directory-of-files is small (ZIP + manifest). Provides built-in integrity verification, legal pedigree (Harvard LIL, Library of Congress, Starling Lab), and ensures all future upgrades are additive. |
| Static verification page | **IN** | A single HTML file + vanilla JS that calls the verify API. This is the difference between "developers can verify via curl" and "anyone can verify by clicking a link." R3 says "third party" -- that includes non-technical people. |
| Ed25519 signing | **IN** | Proves integrity and WRL authorship. The manifest's `signatures` array accommodates TSA timestamps later without format changes. |
| API key for capture | **IN** | Not user management -- a single env var bearer token. The capture endpoint is resource-intensive and SSRF-capable. A kill switch is necessary. |
| RFC 3161 timestamps | **OUT** | Ed25519 self-signing is sufficient for MVP integrity verification. Upgrade path is designed: add a TSA entry to the `signatures` array, no format changes required. |
| Resource manifest | **OUT** | Capturing CSS/JS/images individually is a significant complexity escalation. HTML + screenshot prove content state for MVP. |
| OpenAPI spec | **IN** | Source of truth for the 4-endpoint API. Versioned URLs (`/v1/`) ensure non-breaking evolution. Small surface area makes spec maintenance low-cost. |

---

## Technology Stack

| Concern | Technology | Rationale |
|---------|------------|-----------|
| API server | Cloudflare Worker | Zero-ops, edge-distributed, JS-native, <300ms reads |
| Headless browser | Cloudflare Browser Rendering | Managed Chrome, Puppeteer API, no infrastructure to maintain |
| Bundle format | WACZ (via warcio.js) | Standards-based, built-in integrity, legal pedigree, upgrade path |
| Signing | Ed25519 (Web Crypto API) | Fast, small signatures, deterministic, no padding oracle attacks |
| Content hashing | SHA-256 (Web Crypto API) | Standard for content integrity, no external dependency |
| Blob storage | Cloudflare R2 | Zero egress, bucket locks, content-addressed keys, same network |
| Metadata | Workers KV | Simple key-value, globally replicated, included in Workers plan |
| Verification UI | Plain HTML + vanilla JS | Single static file, no framework, no build step |
| Deployment | `wrangler deploy` (manual) | One command. No CI/CD infrastructure needed for MVP. |

Estimated cost: ~$5/month.

---

## Constraints

- **YAGNI**: Every feature traces to R1, R2, or R3. No speculative additions.
- **KISS**: Simplest storage, simplest API, simplest deployment.
- **<300ms latency**: Verification and retrieval endpoints must be under 300ms. Capture is async by design (headless browser inherently slower).
- **JS over TS**: Plain JavaScript unless a specific component has a clear need for TypeScript.
- **Vanilla-first**: No React, Vue, or Tailwind. The verification page is plain HTML + vanilla JS.
- **Security (non-negotiable)**:
  - SSRF prevention: URL scheme allowlist (http/https only), DNS pre-resolution with private IP blocking (RFC 1918 ranges, IPv6 private ranges: `fc00::/7`, `fe80::/10`, `::1`, `::ffff:127.0.0.1`), DNS pinning (resolved IP passed to Browser Rendering -- no re-resolution), redirect chain re-validation
  - Reject URLs with embedded credentials (`http://user:pass@host`) and `0.0.0.0`
  - Browser isolation: fresh incognito context per capture, 30s timeout, 50MB page limit, 200 subresource cap
  - Rate limiting: Cloudflare platform rate limiting (wrangler.toml / dashboard), not custom application code
  - Input validation: 2048-char URL length limit, URL normalization, system-generated capture IDs
- **Evolution log**: Every phase documented in `docs/evolution/`. Entries are mandatory but terse.

---

## Implementation Plan

### Step 1: Project Scaffold and Cloudflare Worker
**Produces**: A Worker that responds to HTTP requests. Health check returns 200 in `wrangler dev` and when deployed.
**Depends on**: none

- `wrangler.toml` with Worker name, R2 bucket binding, KV namespace binding, and Browser Rendering binding
- Vanilla JS Worker entry point with minimal route dispatch (method + path matching)
- `GET /health` returns `{ "status": "ok" }` with 200
- Structured error response pattern (RFC 9457 `application/problem+json`) established as shared utility from the start
- Vitest + `@cloudflare/vitest-pool-workers` configured so tests run inside the Miniflare runtime

**Verification**: `wrangler dev` starts without errors; `curl http://localhost:8787/health` returns HTTP 200 with `{"status":"ok"}`.

---

### Step 2: URL Validation and SSRF Prevention
**Produces**: A tested URL validation module that blocks known SSRF bypass vectors.
**Depends on**: Step 1

- URL scheme allowlist: reject anything that is not `http` or `https`
- Reject URLs containing embedded credentials (`http://user:pass@host`) and bare `0.0.0.0`
- DNS pre-resolution with private IP blocking: IPv4 ranges `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `127/8`; IPv6 ranges `fc00::/7`, `fe80::/10`, `::1`, `::ffff:127.0.0.1`
- DNS pinning: resolve once, pass resolved IP to Browser Rendering to prevent rebinding; redirect chains re-validated at each hop (max 5 hops)
- URL normalization and 2048-character length limit enforced
- Unit tests covering specific bypass vectors: hex IP, octal IP, decimal IP, IPv6-mapped IPv4, DNS-to-loopback redirect, redirect-to-private, embedded credentials, IPv6 ULA, double-encoded paths

**Verification**: All bypass vector unit tests pass under `vitest run` inside the Miniflare pool.

---

### Step 3: Capture Endpoint and Browser Rendering
**Produces**: A working capture endpoint that accepts a URL, renders it in an isolated browser context, and stores status in KV.
**Depends on**: Step 2

- `POST /v1/captures`: validates URL, checks `Authorization: Bearer <key>` header (401 if missing or wrong), enqueues capture
- Capture ID generated as `cap_` + `crypto.randomUUID()` with hyphens stripped
- Browser Rendering: navigate to DNS-pinned IP, capture full-page screenshot (PNG) and rendered HTML; fresh incognito context per capture, 30s timeout, 50MB page limit, 200 subresource cap, context destroyed after completion
- HTTP response headers captured via a separate Workers `fetch` call to the same DNS-pinned URL
- Capture status written to KV as `pending` on accept, updated to `complete` or `failed` on resolution
- `GET /v1/captures/{id}/status` reads KV and returns `{ "status": "pending"|"complete"|"failed" }`; returns RFC 9457 404 for unknown IDs
- 202 response body includes capture ID and status URL

**Verification**: `curl -X POST /v1/captures` with valid API key returns 202 with capture ID; polling the status endpoint eventually returns `complete`.

---

### Step 4: WACZ Bundling and Signing
**Produces**: Signed WACZ bundles stored in R2, verifiable via signing round-trip test.
**Depends on**: Step 3

- WARC records constructed via warcio.js; CDXJ index generated from WARC records
- SHA-256 hash computed per artifact (HTML, screenshot, headers, WARC)
- `datapackage.json` manifest assembled with per-artifact hashes; `bundleHash` = SHA-256 of canonical JSON (keys sorted, no whitespace)
- Ed25519 key pair: private key as base64-encoded raw 32 bytes from `crypto.generateKey("Ed25519")` + `exportKey("raw")`, stored as `wrangler secret`; public key derived at Worker startup; key never in VCS
- Manifest `signatures` array receives one entry of `type: "self"` containing the Ed25519 signature over `bundleHash`
- WACZ ZIP written to R2 at `captures/{sha256}.wacz`; capture metadata (ID, URL, timestamp, artifact locations) written to KV
- Tests: canonical JSON stability (same input always produces same bytes), signing round-trip (sign then verify returns true)

**Verification**: `vitest run` signing round-trip test passes; R2 shows a `.wacz` object after a live capture in `wrangler dev`.

---

### Step 5: Retrieval Endpoint
**Produces**: A complete capture lifecycle -- submit, poll, retrieve.
**Depends on**: Step 4

- `GET /v1/captures/{id}`: KV lookup returns capture metadata plus pre-signed or direct R2 artifact links
- Artifacts served from R2; responses include `Content-Type` and `Content-Length` headers
- RFC 9457 404 returned for unknown capture IDs; target round-trip <300ms from KV read to response
- Integration smoke test: POST capture, poll status until complete, GET capture, assert metadata fields present and artifact URLs reachable

**Verification**: `curl GET /v1/captures/{id}` returns metadata with artifact links; unknown ID returns RFC 9457 404.

---

### Step 6: Verification Endpoint
**Produces**: A public verification endpoint with a passing end-to-end integration test.
**Depends on**: Step 5

- `GET /v1/verify/{id}`: no authentication required; recomputes SHA-256 hashes of stored artifacts, recomputes `bundleHash`, verifies Ed25519 signature against stored public key
- Response: `{ "verified": true|false, "capture": { ... }, "artifacts": { ... } }`
- Rate limiting configured on the Cloudflare platform (~60/min per IP); response cached with `Cache-Control: public, immutable, max-age=31536000`
- Integration test: POST capture -> poll status until complete -> GET `/v1/verify/{id}` -> assert `verified: true`

**Verification**: Integration test passes in `wrangler dev`; tampering with any stored artifact causes `verified: false`.

---

### Step 7: Static Verification Page
**Produces**: A browser-accessible verification page for non-technical users.
**Depends on**: Step 6 (can be developed in parallel once Step 6 API contract is stable)

- Content negotiation in Worker: if `Accept` header includes `text/html`, serve HTML instead of JSON
- Single HTML file with vanilla JS: calls `GET /v1/verify/{id}`, renders URL, timestamp, SHA-256 hash, verified badge, and screenshot inline
- `<noscript>` fallback: shows capture ID and a direct link to the JSON API endpoint
- No framework, no build step, no external dependencies; inlined CSS only

**Verification**: Open verification URL in browser -- result renders with badge and screenshot. Disable JS -- `<noscript>` fallback with capture ID and API link is visible.

---

### Step 8: OpenAPI Spec and Security Hardening
**Produces**: A fully specified API, hardened service, and public key endpoint.
**Depends on**: Steps 5-7 (can start in parallel once endpoints are stable)

- `openapi.yaml` documents all four endpoints with request/response schemas, error shapes (RFC 9457), auth requirements, and rate limit annotations
- Security headers added to all responses: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
- DNS pinning enforcement verified: Worker refuses to proceed if pre-resolution returns a private IP
- Global backpressure handler: returns 503 with `Retry-After` header when Worker concurrency limit is approached
- `GET /.well-known/signing-key` returns current Ed25519 public key (base64-encoded raw bytes) with appropriate caching headers
- Key rotation procedure documented in README: `wrangler secret put SIGNING_KEY` + `wrangler deploy` + update `/.well-known/signing-key` cache

**Verification**: `openapi-validator` (or equivalent) reports no errors against `openapi.yaml`; `curl -I` on any endpoint shows expected security headers; `GET /.well-known/signing-key` returns the public key.
