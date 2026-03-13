# 0001: Kickoff Decisions

Decisions made during MVP scoping. Each entry: what was decided, why, and what was rejected.

## Bundle Format: WACZ

- **Decision**: WACZ (Web Archive Collection Zipped) as the capture bundle format.
- **Why**: ZIP container with WARC records and SHA-256 manifest. Built-in integrity verification. Legal pedigree: Harvard LIL, Library of Congress, Starling Lab. All future upgrades are additive.
- **Rejected**: Directory-of-files (no standardization), MHTML (browser-specific, dead end), custom JSON bundle (reinventing WACZ), raw WARC without container (loose files, no manifest).

## Signing: Ed25519 Self-Signing (TSA Deferred)

- **Decision**: Ed25519 signature over SHA-256 content hash manifest. Extensible `signatures` array. Private key as base64-encoded 32-byte raw key via `crypto.generateKey("Ed25519")`.
- **Why**: Proves integrity and WRL authorship. Fast, small signatures (64 bytes), deterministic, no padding oracle attacks.
- **Rejected**: RFC 3161 via FreeTSA (ASN.1 complexity, external dependency), HMAC (zero legal weight), blockchain timestamps (KISS violation), RSA (larger, slower, padding risk).

## Infrastructure: Cloudflare-Native Serverless

- **Decision**: Entire stack on Cloudflare -- single Worker, Browser Rendering, R2, KV.
- **Why**: Zero servers, containers, certificates, or scaling config. One deployment command. ~$5/month. Zero egress fees.
- **Rejected**: Self-hosted Playwright + VPS (ops burden), AWS Lambda + Fargate ($15-30/mo, more complex), Fastly Compute (no Browser Rendering equivalent).

## Storage: R2 with Content-Addressed Keys

- **Decision**: Object key = SHA-256 hash of WACZ bundle (`captures/{sha256}.wacz`). R2 bucket locks for retention.
- **Why**: Content-addressed = immutable by construction. Deduplication by default. Bucket locks prevent deletion or overwrite.
- **Rejected**: S3 with Object Lock (egress fees, more complex), database for metadata (overkill for read-by-ID), D1 (overkill for key-value).

## Auth: Static API Key for Capture Only

- **Decision**: Single static API key (wrangler secret) for the capture endpoint. Verification endpoints fully public. Rotation: `wrangler secret update` + deploy (30 seconds).
- **Why**: Capture is resource-intensive and SSRF-capable -- a kill switch is necessary. Not user management.
- **Rejected**: No auth (no kill switch), OAuth/user management (massive scope explosion).

## API Design: 4 Versioned Endpoints, Async Polling

- **Decision**: `POST /v1/captures` (202), `GET /v1/captures/{id}/status`, `GET /v1/captures/{id}`, `GET /v1/verify/{id}`. All under `/v1/` prefix.
- **Why**: Minimum surface for R1/R2/R3. Async because rendering takes 5-30s. Version prefix enables non-breaking evolution.
- **Rejected**: Synchronous capture (timeouts), SSE (overkill), webhooks (callback complexity), verify nested under captures (auth boundary mixing), unversioned URLs (no migration path).

## Capture Scope: HTML + Screenshot + Headers (No Resource Manifest)

- **Decision**: Rendered HTML, full-page screenshot, HTTP response headers. Resource manifest excluded.
- **Why**: Screenshot is free once Browser Rendering is present (same browser session). Resource manifest is a significant complexity escalation with CORS and storage multiplication.
- **Rejected**: HTML only (screenshot is trivial to add once browser is open), full resource manifest (CORS, storage multiplication, out of scope for MVP).

## OpenAPI Spec: In Scope from Day One

- **Decision**: Maintain `openapi.yaml` as source of truth for the 4-endpoint API. Written alongside implementation.
- **Why**: 4 endpoints is small enough that spec maintenance is low-cost. Serves as executable documentation, enables SDK generation. Versioned URLs make the contract explicit.
- **Rejected**: Spec deferred (creates documentation debt for a small, stable surface), code-first with no spec (harder for external consumption).
