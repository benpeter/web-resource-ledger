# First Deployment and Live Testing

## Task Description

Deploy the Worker to Cloudflare production for the first time and run
end-to-end captures against real-world URLs to validate the full pipeline:
capture submission, browser rendering, artifact storage, WACZ bundling,
and retrieval.

## Goals

1. Provision Cloudflare infrastructure (R2 bucket, KV namespace)
2. Deploy the Worker
3. Set secrets (API key, Ed25519 signing key)
4. Capture real URLs and verify all artifact types are produced and retrievable
5. Fix any issues discovered during live testing

## Approach

Manual, hands-on session -- no agent orchestration. Direct deployment via
`wrangler`, testing via `curl`.
