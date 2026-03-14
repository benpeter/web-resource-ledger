# MVP Step 6: Verification Endpoint

Source: GitHub Issue #6

## Goal
Public verification endpoint with passing end-to-end integration test.

## Context
Retrieval endpoint exists and the full capture lifecycle works (Step 5 complete). This step adds the cryptographic verification endpoint that proves a stored capture is authentic and unmodified.

## Work Items
- `GET /v1/verify/{id}`: no authentication required
- Recompute SHA-256 hashes of all stored artifacts retrieved from R2
- Recompute `bundleHash` from canonical JSON of the manifest (same algorithm as Step 4)
- Verify Ed25519 signature in `signatures` array against stored public key
- Response shape: `{ "verified": true|false, "capture": { ... }, "artifacts": { ... } }`
- Platform rate limiting configured (~60 requests/min per IP) via Cloudflare platform
- Response cached with `Cache-Control: public, immutable, max-age=31536000`
- End-to-end integration test: POST capture -> poll status until complete -> GET `/v1/verify/{id}` -> assert `verified: true`
- Test: tamper with a stored artifact -> GET `/v1/verify/{id}` -> assert `verified: false`

## Acceptance Criteria
- End-to-end integration test passes in `wrangler dev`
- Tampering with any stored artifact causes `verified: false`
- Response is cached with `Cache-Control: public, immutable, max-age=31536000`

## Orchestration
Executed via `/nefario #6`. Four tasks: verification core logic (gated),
endpoint handler, unit tests, integration tests. Five Phase 3.5 reviewers
(all ADVISE, 0 BLOCK). Ten advisories incorporated into task prompts.
