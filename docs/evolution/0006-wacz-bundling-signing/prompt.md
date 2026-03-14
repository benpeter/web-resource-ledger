# Prompt: WACZ Bundling and Signing (Issue #4)

## Goal
Signed WACZ bundles stored in R2, verifiable via signing round-trip test.

## Context
Capture endpoint exists and browser rendering produces raw artifacts (Step 3 complete). This step packages those artifacts into a standards-based WACZ bundle, computes integrity hashes, signs with Ed25519, and writes to R2.

## Work Items
- WARC records constructed via `warcio.js`; CDXJ index generated from WARC records
- SHA-256 hash computed per artifact (HTML, screenshot, headers, WARC)
- `datapackage.json` manifest assembled with per-artifact hashes
- `bundleHash` = SHA-256 of canonical JSON (keys sorted alphabetically, no whitespace)
- Ed25519 key pair: private key as base64-encoded raw 32 bytes from `crypto.generateKey("Ed25519")` + `exportKey("raw")`, stored as `wrangler secret` named `SIGNING_KEY`
- Public key derived at Worker startup from the stored private key
- Manifest `signatures` array receives one entry of `type: "self"` containing the Ed25519 signature over `bundleHash`
- WACZ ZIP written to R2 at `captures/{sha256}.wacz`
- Capture metadata (ID, URL, timestamp, artifact locations) written to KV
- Document key generation procedure in README
- Test: canonical JSON stability (same input always produces identical bytes)
- Test: signing round-trip (sign then verify returns true)

## Acceptance Criteria
- `vitest run` signing round-trip test passes
- `vitest run` canonical JSON stability test passes (deterministic serialization)
- R2 contains a `.wacz` object after a capture completes in `wrangler dev`
- Key generation procedure documented in README (`wrangler secret put SIGNING_KEY`)

## Technical Notes
- The signing key MUST NEVER be committed to VCS or appear in `wrangler.toml`
- Canonical JSON stability is critical: `bundleHash` must be deterministic
- The `signatures` array structure is designed to accommodate RFC 3161 TSA timestamps later

## Orchestration
Executed via `/nefario #4`. Full nefario orchestration with 4 specialists
(security-minion, data-minion, test-minion, edge-minion), 5 mandatory
architecture reviewers, and 5 execution tasks across 3 batches with
2 approval gates.
