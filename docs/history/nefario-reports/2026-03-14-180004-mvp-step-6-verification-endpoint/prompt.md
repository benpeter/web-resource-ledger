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
