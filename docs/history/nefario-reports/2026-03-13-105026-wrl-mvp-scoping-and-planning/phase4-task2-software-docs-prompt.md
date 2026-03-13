# Task 2: Write Technology Decisions Document (docs/evolution/0001-kickoff/decisions.md)

Write the technology decisions document at `docs/evolution/0001-kickoff/decisions.md`.

## Context

This is the evolution log for the WRL MVP kickoff phase. The decisions.md file captures key decisions made during scoping, alternatives considered, and rationale. Per CLAUDE.md convention, evolution log entries must be terse -- bullet points with rationale, not essays. A decision entry should be 3 lines: what, why, what was rejected.

**IMPORTANT**: The file `docs/evolution/0001-kickoff/prompt.md` already exists. Do NOT modify or overwrite it.

## Format

Use this format:

```
# 0001: Kickoff Decisions

Decisions made during MVP scoping. Each entry: what was decided, why, and what was rejected.

## <Decision Title>
- **Decision**: <what>
- **Why**: <rationale, 1-2 sentences>
- **Rejected**: <alternatives and why they were rejected>
```

## Decisions to Document

Record these decisions. Keep each entry to 3-5 bullet points maximum. Do not write paragraphs.

### 1. Bundle Format: WACZ

- **Decision**: WACZ (Web Archive Collection Zipped) as the capture bundle format.
- **Why**: ZIP container with WARC records and SHA-256 manifest. Built-in integrity verification (hash every file, hash the manifest). Legal pedigree: Harvard LIL, Library of Congress, Starling Lab. All future upgrades (signing, timestamps, fuller capture) are additive -- the format does not change.
- **Rejected**:
  - Directory-of-files with JSON metadata: simpler but no standardization, no legal precedent, must build integrity verification from scratch.
  - MHTML: browser-specific, no integrity metadata, no signing support. Dead end.
  - Custom JSON bundle: violates KISS (reinventing what WACZ provides). Zero legal precedent.
  - Raw WARC (without WACZ container): ISO 28500 but not self-contained (loose files), no built-in manifest or signing spec. WACZ contains WARC, so you get ISO compatibility for free.

### 2. Signing: Ed25519 Self-Signing (TSA Deferred)

- **Decision**: Ed25519 signature over SHA-256 content hash manifest. Extensible `signatures` array in manifest for future RFC 3161 timestamps. Private key stored as base64-encoded 32-byte raw key (not PKCS#8, not PEM) generated via `crypto.generateKey("Ed25519")` and exported via `exportKey("raw")`. Public key derived at startup, never stored separately.
- **Why**: Proves integrity and WRL authorship. Fast (important for <300ms verification), small signatures (64 bytes), deterministic, no randomness pitfalls. The `signatures` array design means adding TSA timestamps later is adding an entry, not changing the format.
- **Rejected**:
  - RFC 3161 via FreeTSA in MVP: adds ASN.1 parsing, external service dependency, and complexity. The upgrade path is a URL change + array entry. Defer until legal admissibility is needed.
  - HMAC/internal signing: zero legal weight, self-attested. Ed25519 at least provides verifiable authorship.
  - Blockchain-anchored timestamps: violates KISS. Gas fees, confirmation times, inconsistent court acceptance.
  - RSA: larger keys, larger signatures, slower, padding oracle risk. Ed25519 is the modern default.

### 3. Infrastructure: Cloudflare-Native Serverless

- **Decision**: Entire stack on Cloudflare. Single Worker (all routes), Browser Rendering (headless Chrome), R2 (storage), KV (metadata).
- **Why**: Zero servers, zero containers, zero certificates, zero scaling config. One deployment command (`wrangler deploy`). Approximately $5/month. R2 has zero egress fees (critical for verification traffic). Browser Rendering eliminates the need to manage headless Chrome infrastructure.
- **Rejected**:
  - Self-hosted Playwright + VPS: must manage OS, Docker, Chrome binary, TLS, uptime. More ops burden for similar cost.
  - AWS Lambda + Fargate: $15-30/month, two services to manage, ECR, IAM roles, API Gateway. More complex.
  - Fastly Compute: no equivalent to Browser Rendering or R2. Could serve as CDN layer later.

### 4. Storage: R2 with Content-Addressed Keys

- **Decision**: Object key = SHA-256 hash of WACZ bundle (`captures/{sha256}.wacz`). R2 bucket locks for retention.
- **Why**: Content-addressed naming provides immutability by construction (modifying content changes the hash, which changes the key). Deduplication by default. Verification without metadata lookup. Bucket locks prevent accidental deletion.
- **Rejected**:
  - S3 with Object Lock: SEC 17a-4 WORM compliance, but more expensive (egress fees), more complex (IAM). Add as secondary storage for regulated customers post-MVP.
  - Database for metadata: write-once, read-by-ID pattern. KV is sufficient. Database adds schema design, migrations, connection management, ORM.
  - D1 (edge SQLite): overkill for key-value lookup. Consider when listing/filtering is needed.

### 5. Auth: Static API Key for Capture Only

- **Decision**: Single static API key (env var) for the capture endpoint. Verification endpoint is fully public. Key rotation: `wrangler secret update` + `wrangler deploy` (30-second operation).
- **Why**: The capture endpoint is resource-intensive (headless browser) and SSRF-capable. A kill switch is necessary. This is not user management -- it's one bearer token. Verification must be unauthenticated (core value prop: "third parties can independently confirm capture authenticity").
- **Rejected**:
  - No auth at all: rate limiting alone is insufficient. Attackers rotate IPs trivially. No kill switch for abuse.
  - OAuth/user management: zero users exist. Introduces database, session management, permission checks. Massive scope explosion.

### 6. API Design: 4 Versioned Endpoints, Async Polling

- **Decision**: POST /v1/captures (202), GET /v1/captures/{id}/status, GET /v1/captures/{id}, GET /v1/verify/{id}. Capture is async with polling. All endpoints under /v1/ prefix for versioning.
- **Why**: Minimum surface for R1/R2/R3. Async because page rendering takes 5-30 seconds. Polling is stateless (no webhooks, no SSE, no message queues). Verify on separate path from captures (different auth boundaries, clean shareable URL). Version prefix enables non-breaking API evolution.
- **Rejected**:
  - Synchronous capture: HTTP timeouts at 5-30s render times. Poor UX.
  - Server-Sent Events: adds connection management. Overkill for single-consumer polling.
  - Webhooks/callbacks: requires callback URL registration, retry logic, signature verification.
  - Verify nested under /captures/{id}/verify: mixes auth boundaries (captures is authenticated, verify is public).
  - Unversioned URLs: no migration path for breaking changes.

### 7. Capture Scope: HTML + Screenshot + Headers (No Resource Manifest)

- **Decision**: MVP capture includes rendered HTML, full-page screenshot, and HTTP response headers. Resource manifest (individual CSS/JS/images) is out.
- **Why**: Screenshot is essentially free once Browser Rendering is in the architecture. Resource manifest dramatically increases complexity (crawling, storage, CORS). HTML + screenshot prove content state for MVP.
- **Rejected**:
  - HTML only (no screenshot): screenshot is trivial to add with Browser Rendering already present. Visual proof is compelling for non-technical verifiers.
  - Full resource manifest: each subresource needs its own fetch, storage, and hash. CORS issues. Storage multiplication. Post-MVP enhancement.

### 8. OpenAPI Spec: In Scope from Day One

- **Decision**: Maintain an OpenAPI spec (`openapi.yaml`) as the source of truth for the 4-endpoint API. Written alongside the implementation, not as a separate phase.
- **Why**: 4 endpoints is small enough that spec maintenance is low-cost. The spec serves as executable documentation, enables SDK generation when external consumers arrive, and catches request/response shape drift early. Versioned URLs (`/v1/`) make the spec's contract explicit.
- **Rejected**:
  - Spec-deferred: originally planned to defer until "API surface stabilizes." Overruled because the surface is already small and stable (4 endpoints defined in MVP scope). Deferring creates documentation debt.
  - Code-first with no spec: works for internal APIs but makes external consumption harder. Spec-first is not required, but spec-present is reasonable.

## Do NOT include in this document

- Implementation details (code, file structures, function signatures)
- Full specialist analysis (that's in the planning scratch files)
- Post-MVP roadmap (that belongs in a separate document)

## Writing Guidelines

- Maximum 5 bullet points per decision entry
- One sentence per bullet point where possible
- "What, why, rejected" structure for every entry
- This is a reference document for future developers. Someone should be able to understand why a choice was made in under 30 seconds per entry.

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts (e.g., "docs/evolution/0001-kickoff/decisions.md (new, +N lines)")
- 1-2 sentence summary of what was produced
