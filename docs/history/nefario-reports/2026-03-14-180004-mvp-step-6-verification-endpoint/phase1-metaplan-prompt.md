MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task
<github-issue>
## Goal
Public verification endpoint with passing end-to-end integration test.

## Context
Retrieval endpoint exists and the full capture lifecycle works (Step 5 complete). This step adds the cryptographic verification endpoint that proves a stored capture is authentic and unmodified.

## Work Items
- [ ] `GET /v1/verify/{id}`: no authentication required
- [ ] Recompute SHA-256 hashes of all stored artifacts retrieved from R2
- [ ] Recompute `bundleHash` from canonical JSON of the manifest (same algorithm as Step 4)
- [ ] Verify Ed25519 signature in `signatures` array against stored public key
- [ ] Response shape: `{ "verified": true|false, "capture": { ... }, "artifacts": { ... } }`
- [ ] Platform rate limiting configured (~60 requests/min per IP) via Cloudflare platform
- [ ] Response cached with `Cache-Control: public, immutable, max-age=31536000`
- [ ] End-to-end integration test: POST capture -> poll status until complete -> GET `/v1/verify/{id}` -> assert `verified: true`
- [ ] Test: tamper with a stored artifact -> GET `/v1/verify/{id}` -> assert `verified: false`

## Acceptance Criteria
- End-to-end integration test passes in `wrangler dev`
- Tampering with any stored artifact causes `verified: false`
- Response is cached with `Cache-Control: public, immutable, max-age=31536000`

## Dependencies
- Blocked by: #5
- Blocks: #7 (partial — Step 7 can develop in parallel once API contract is stable, but needs real capture data)

## Technical Notes
- The integration test is the definition of done for this step — not just unit tests; the full lifecycle must work end-to-end in `wrangler dev`
- `Cache-Control: public, immutable` is safe here because the capture ID is content-addressed — if the capture exists and is verified, that fact never changes
- Rate limiting on this endpoint is looser (~60/min) than the capture endpoint (~10/min) because verification is read-only and cacheable
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

No external skills were found in .claude/skills/ or .skills/.

## Codebase Context

This is a Cloudflare Worker project (Cloudflare Workers + R2 + KV + Browser Rendering).

### Current Architecture
- `src/index.js` -- Router with routes: GET /health, POST /v1/captures, GET /v1/captures/{id}/status, GET /v1/captures/{id}, GET /v1/captures/{id}/artifacts/{name}
- `src/signing.js` -- Ed25519 key management (getSigningKeys, signBytes, verifySignature)
- `src/wacz.js` -- WACZ assembly: builds datapackage.json with SHA-256 hashes, signs bundleHash, creates ZIP
- `src/canonical-json.js` -- Deterministic JSON serialization for bundleHash computation
- `src/warc.js` -- WARC record construction + sha256() utility
- `src/capture.js` -- Browser rendering pipeline, stores artifacts in R2, updates KV
- `src/kv.js` -- KV access layer (createCapture, completeCapture, failCapture, getCapture)
- `src/responses.js` -- RFC 9457 problem+json responses
- `src/auth.js` -- API key auth
- `src/url-validation.js` -- URL validation and SSRF prevention

### KV Record Shape (complete status)
```json
{
  "status": "complete",
  "url": "https://example.com",
  "ip": "93.184.216.34",
  "captureId": "cap_abc123...",
  "createdAt": "...",
  "completedAt": "...",
  "artifacts": {
    "screenshot": "captures/cap_abc123/screenshot.png",
    "html": "captures/cap_abc123/rendered.html",
    "headers": "captures/cap_abc123/headers.json"
  },
  "wacz": {
    "key": "captures/sha256:abc123.wacz",
    "bundleHash": "sha256:...",
    "size": 42000
  }
}
```

### WACZ Structure (from wacz.js)
The WACZ ZIP contains:
- `datapackage.json` -- resources list with SHA-256 hashes
- `datapackage-digest.json` -- contains signedData: { hash (bundleHash), signature, publicKey, created, software, version }
- `archive/data.warc`
- `indexes/index.cdxj`
- `pages/pages.jsonl`

The bundleHash is `sha256(canonicalize(datapackage))` where canonicalize is a sorted-keys, no-whitespace JSON serialization.

### Existing Signing/Verification
- `signing.js` already has `verifySignature(publicKeyBytes, data, signatureBase64)` function
- `warc.js` exports `sha256(data)` for computing hashes
- `canonical-json.js` exports `canonicalize(obj)` for deterministic JSON

### Test Structure
Tests use `@cloudflare/vitest-pool-workers` with `cloudflare:test` bindings.
- Unit tests: test/signing.test.js, test/wacz.test.js, test/canonical-json.test.js, etc.
- Integration tests: test/capture-integration.test.js, test/capture-retrieval.test.js

### wrangler.toml Rate Limiter
Current rate limiter config: `simple = { limit = 10, period = 60 }` bound as CAPTURE_RATE_LIMITER.
A new rate limiter binding will be needed for verification (~60/min).

## Instructions
1. Read relevant files to understand the codebase context
2. No external skills were discovered in .claude/skills/ or .skills/
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase1-metaplan.md`
