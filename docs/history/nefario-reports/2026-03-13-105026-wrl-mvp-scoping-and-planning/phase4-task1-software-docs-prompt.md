# Task 1: Write MVP Scope Document (docs/MVP.md)

Write the MVP scope document for the Web Resource Ledger (WRL) project at `docs/MVP.md`.

## Context

WRL is a tool for tamper-evident archival of web resources with proof of state at a point in time. The full product vision is in PRODUCT.md, but the MVP is radically smaller.

The MVP goal (verbatim from the kickoff prompt): "The smallest thing that delivers the core value prop: capture a URL, store it immutably, and let a third party verify the capture."

## Three Core Requirements

| ID | Requirement |
|----|-------------|
| R1 | Capture a URL (produce an immutable snapshot of a web resource) |
| R2 | Store it immutably (persist the capture so it cannot be altered) |
| R3 | Let a third party verify the capture (public verification without requiring an account) |

## Document Structure

Use this structure for `docs/MVP.md`:

```
# WRL Minimum Viable Product

## Goal
<one sentence restating the MVP goal>

## What's In

### Capture (R1)
<bulleted list of what's included in a capture>

### Immutable Storage (R2)
<how captures are stored>

### Verification (R3)
<how third parties verify>

### API Surface
<the endpoints>

## What's Out (and Why)
<table: feature | why it's out>

## Gray Zone Decisions
<features that could go either way, and the decision made>

## Technology Stack
<summary of chosen technologies>

## Constraints
<non-functional requirements and engineering principles>
```

## Scope Decisions (these are resolved -- document them, don't re-debate)

### IN Scope

**Capture contents (R1):**
- HTML snapshot (rendered DOM from headless browser)
- Screenshot (full-page PNG from headless browser)
- HTTP response headers (captured via separate fetch)
- Content hash (SHA-256 of each artifact + bundle hash)
- Server-generated timestamp (self-asserted for MVP)

**Bundle format:** WACZ (Web Archive Collection Zipped). A ZIP file containing WARC records, a CDXJ index, and a `datapackage.json` with SHA-256 hashes of every file. This format has legal pedigree (Harvard LIL, Library of Congress, Starling Lab) and built-in integrity verification. The MVP uses a simplified WACZ -- HTML + screenshot + headers packaged with warcio.js -- not the full forensic-grade capture.

**Signing:** Ed25519 signature over SHA-256 content hash manifest. Each artifact gets its own SHA-256 hash. A `bundleHash` is computed from the canonical JSON of the artifacts object. The Ed25519 signature covers the bundleHash. The manifest includes a `signatures` array that accommodates future RFC 3161 timestamps without format changes.

**Storage (R2):** Cloudflare R2 with content-addressed keys (`captures/{sha256}.wacz`). Bucket locks for retention. Zero egress fees (critical for verification traffic).

**API surface (4 endpoints):**
- `POST /captures` -- submit a URL for capture (202 Accepted, returns capture ID and status URL). Requires API key.
- `GET /captures/{id}/status` -- poll capture progress (pending/complete/failed). Requires knowing the capture ID.
- `GET /captures/{id}` -- retrieve capture metadata and artifact links. Requires knowing the capture ID.
- `GET /verify/{id}` -- public verification endpoint. No authentication. Returns verification result with metadata.

**Auth:** Single static API key (environment variable) for the capture endpoint only. Not a user management system -- just a bearer token and kill switch. The verification endpoint is fully public and unauthenticated.

**Verification (R3):** The verify endpoint recomputes SHA-256 hashes of stored artifacts, compares against the manifest, verifies the Ed25519 signature, and returns a structured result (verified: true/false with capture metadata and artifact links). A minimal static verification page (single HTML file, vanilla JS) renders the result for non-technical third parties.

**Security (non-negotiable):**
- SSRF prevention: URL scheme allowlist (http/https only), DNS pre-resolution with private IP blocking (including IPv6 private ranges: fc00::/7, fe80::/10, ::1, ::ffff:127.0.0.1), DNS pinning (resolved IP passed to Browser Rendering -- no re-resolution), redirect chain re-validation
- Reject URLs with embedded credentials (http://user:pass@host)
- Reject 0.0.0.0 and 0.0.0.0/8
- Browser isolation: fresh incognito context per capture, resource limits (30s timeout, 50MB page limit, 200 subresource cap)
- Rate limiting: use Cloudflare platform rate limiting (configured via wrangler.toml or dashboard), not custom application code
- Input validation: URL length limit (2048 chars), URL normalization, system-generated capture IDs

**Infrastructure:** Cloudflare-native. Single Worker for all API routes. Cloudflare Browser Rendering for headless capture. R2 for storage. KV for metadata. Manual deployment via `wrangler deploy`. Total cost approximately $5/month.

### OUT of Scope

| Feature | Why It's Out |
|---------|-------------|
| Scheduled captures (cron-style) | Additional trigger method. On-demand API is sufficient for MVP. |
| Webhooks (inbound triggers) | Additional trigger method. Not needed for core value prop. |
| MCP (AI-agent-driven triggers) | Additional trigger method. Can layer on top of the API later. |
| Watch lists / bulk monitoring | PRODUCT.md calls this "the sticky use case" but single URL capture is table stakes. MVP is table stakes. |
| Change detection / diffing | Requires multiple captures over time. Depends on monitoring mode (also out). |
| Notifications | API response is the notification for on-demand captures. No event system needed. |
| Multi-tenancy / RBAC | Zero users. MVP is single-operator. |
| Social signup / user management | No identity system needed. Static API key suffices. |
| Billing & quotas | No monetization for MVP. |
| Resource manifest (CSS/JS/images) | Dramatically increases capture complexity. HTML + screenshot + headers prove content state. |
| Full HTTP exchange capture | MVP uses rendered DOM + separate header fetch. Forensic-grade proxy capture (Scoop-style) is post-MVP. |
| RFC 3161 timestamps / TSA | MVP uses self-asserted timestamps. TSA integration is the first post-MVP enhancement. Upgrade is a URL change + adding an entry to the signatures array. |
| eIDAS / legal admissibility | Depends on TSA (also out). The bundle format (WACZ) and signing approach (extensible signatures array) are designed to accommodate this later. |
| OpenAPI spec | 4 endpoints documented in markdown. Formal spec when the API surface is stable and external consumers need it. |
| CI/CD pipeline | Manual `wrangler deploy` for single-developer MVP. Add GitHub Actions when it hurts. |
| Database | Write-once, read-by-ID access pattern. KV for metadata, R2 for bundles. No SQL database needed. |
| List/search captures | No `GET /captures` endpoint. Must know the capture ID. First addition post-MVP. |
| Autoscaling | Cloudflare handles this. No scaling configuration needed. |
| WORM-certified storage | R2 bucket locks are adequate. S3 Object Lock for regulated customers is post-MVP. |

### Gray Zone Decisions

| Feature | Decision | Rationale |
|---------|----------|-----------|
| Screenshot | IN | Cloudflare Browser Rendering is already in the architecture for HTML capture. Screenshot is one additional API call -- essentially free once the browser is there. |
| WACZ bundle format | IN | The complexity delta over directory-of-files is small (ZIP + manifest). Provides built-in integrity verification, legal pedigree, and ensures all future upgrades are additive. |
| Static verification page | IN | A single HTML file with vanilla JS that calls the verify API. This is the difference between "developers can verify via curl" and "anyone can verify by clicking a link." R3 says "third party" -- that includes non-technical people. |
| Ed25519 signing | IN | Proves integrity and WRL authorship. The manifest's `signatures` array accommodates TSA timestamps later without format changes. |
| API key for capture | IN | Not user management -- a single env var bearer token. The capture endpoint is resource-intensive (headless browser) and SSRF-capable. A kill switch is necessary. |
| RFC 3161 timestamps | OUT | Ed25519 self-signing is sufficient for MVP integrity verification. TSA adds temporal proof but requires ASN.1 parsing and external service dependency. Upgrade path is designed and documented. |
| Resource manifest | OUT | Capturing CSS/JS/images individually is a significant complexity escalation. HTML + screenshot prove content state for MVP. |
| OpenAPI spec | OUT | Write routes first, spec after. Consistent with "more code, less blah blah." |

### Technology Stack

| Concern | Technology | Rationale |
|---------|------------|-----------|
| API server | Cloudflare Worker | Zero-ops, edge-distributed, JS-native, <300ms reads |
| Headless browser | Cloudflare Browser Rendering | Managed Chrome, Puppeteer API, no infrastructure to maintain |
| Bundle format | WACZ (via warcio.js) | Standards-based, built-in integrity, legal pedigree, upgrade path |
| Signing | Ed25519 (Web Crypto API) | Fast, small signatures, deterministic, no padding oracle attacks |
| Content hashing | SHA-256 | Standard for content integrity. Built into Web Crypto API. |
| Blob storage | Cloudflare R2 | Zero egress, bucket locks, content-addressed keys, same network |
| Metadata | Workers KV | Simple key-value, globally replicated, included in Workers plan |
| Deployment | `wrangler deploy` (manual) | One command. No CI/CD infrastructure needed for MVP. |

### Constraints

- **YAGNI**: Every feature traces to R1, R2, or R3. No speculative additions.
- **KISS**: Simplest storage, simplest API, simplest deployment.
- **<300ms latency**: Verification and retrieval endpoints. Capture is async (inherently slower).
- **JS over TS**: Plain JavaScript unless a specific component requires TypeScript.
- **Vanilla-first**: No React/Vue/Tailwind. Static verification page is plain HTML + vanilla JS.
- **Evolution log**: Every phase documented in `docs/evolution/`. Entries are mandatory but terse (bullet points, not essays).

## Advisory Notes (from architecture review)

Incorporate these into the document where relevant:

1. **Capture ID recovery**: The out-of-scope table should explicitly note that without a list endpoint, capture ID loss = permanent loss. The 202 response design should make caller responsibility for preserving the ID explicit. This is acceptable for a single-operator MVP but must be stated.

2. **API key rotation**: In the Security section, add a one-line operational note: "Key rotation is a `wrangler secret update` + `wrangler deploy` (30-second operation)."

3. **Rate limiting approach**: Note that rate limiting uses Cloudflare's platform features (wrangler.toml / dashboard config), not custom application-level rate limiting code. Specific thresholds (10/min capture, 60/min verify) are tuning parameters, not architectural decisions.

## Writing Guidelines

- Keep it concise. This is a reference document, not an essay.
- Use tables where they improve scanability.
- Every "in" item should trace back to R1, R2, or R3.
- Every "out" item should have a one-sentence rationale.
- Do NOT add features or scope beyond what is listed above. The scope decisions are final.
- Do NOT include implementation details (code examples, file structures). This is a scope document.
- Do NOT create an OpenAPI spec or API reference. The 4 endpoints are listed with their purpose, not their full request/response shapes.

## Deliverables
- `docs/MVP.md`

## Success Criteria
- Document covers all sections (in-scope, out-of-scope, gray zone, technology stack, constraints)
- Every in-scope item traces to R1/R2/R3
- Every out-of-scope item has a rationale
- Technology stack is listed
- Capture ID recovery and API key rotation notes are included
