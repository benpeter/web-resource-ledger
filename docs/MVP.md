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
