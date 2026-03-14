## Goal
Signed WACZ bundles stored in R2, verifiable via signing round-trip test.

## Context
Capture endpoint exists and browser rendering produces raw artifacts (Step 3 complete). This step packages those artifacts into a standards-based WACZ bundle, computes integrity hashes, signs with Ed25519, and writes to R2.

## Work Items
- [ ] WARC records constructed via `warcio.js`; CDXJ index generated from WARC records
- [ ] SHA-256 hash computed per artifact (HTML, screenshot, headers, WARC)
- [ ] `datapackage.json` manifest assembled with per-artifact hashes
- [ ] `bundleHash` = SHA-256 of canonical JSON (keys sorted alphabetically, no whitespace)
- [ ] Ed25519 key pair: private key as base64-encoded raw 32 bytes from `crypto.generateKey("Ed25519")` + `exportKey("raw")`, stored as `wrangler secret` named `SIGNING_KEY`
- [ ] Public key derived at Worker startup from the stored private key
- [ ] Manifest `signatures` array receives one entry of `type: "self"` containing the Ed25519 signature over `bundleHash`
- [ ] WACZ ZIP written to R2 at `captures/{sha256}.wacz`
- [ ] Capture metadata (ID, URL, timestamp, artifact locations) written to KV
- [ ] Document key generation procedure in README
- [ ] Test: canonical JSON stability (same input always produces identical bytes)
- [ ] Test: signing round-trip (sign then verify returns true)

## Acceptance Criteria
- `vitest run` signing round-trip test passes
- `vitest run` canonical JSON stability test passes (deterministic serialization)
- R2 contains a `.wacz` object after a capture completes in `wrangler dev`
- Key generation procedure documented in README (`wrangler secret put SIGNING_KEY`)

## Dependencies
- Blocked by: #3
- Blocks: #5

## Technical Notes
- The signing key MUST NEVER be committed to VCS or appear in `wrangler.toml` — use `wrangler secret put SIGNING_KEY` for both local dev (`.dev.vars`) and production
- Canonical JSON stability is critical: `bundleHash` must be deterministic — always sort keys alphabetically and strip all whitespace before hashing
- The `signatures` array structure is designed to accommodate RFC 3161 TSA timestamps later without format changes — keep it as an array, not a single signature field
