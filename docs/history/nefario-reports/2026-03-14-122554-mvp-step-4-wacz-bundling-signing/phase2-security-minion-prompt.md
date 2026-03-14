You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task

Build WACZ bundling and Ed25519 signing for a Cloudflare Worker that captures web pages. After existing R2 artifacts (screenshot.png, rendered.html, headers.json) are stored, construct WARC records, build a CDXJ index, compute SHA-256 hashes per artifact, assemble a `datapackage.json` manifest, compute a `bundleHash` from canonical JSON, sign with Ed25519, write a `.wacz` ZIP to R2 at `captures/{sha256}.wacz`, and update KV with capture metadata.

Key constraints:
- Cloudflare Worker runtime (Web Crypto API, nodejs_compat flag enabled)
- Private key stored as base64-encoded raw 32 bytes via `wrangler secret put SIGNING_KEY`
- Public key derived at Worker startup from stored private key
- Canonical JSON: keys sorted alphabetically, no whitespace
- signatures array designed for future RFC 3161 TSA timestamps
- Signing key MUST NEVER be in VCS or wrangler.toml

## Your Planning Question

Review the Ed25519 signing architecture for the WACZ bundling step. Specifically:
1. Is `crypto.generateKey("Ed25519")` + `exportKey("raw")` the correct approach for generating the 32-byte private key seed in a Cloudflare Worker context?
2. What are the security implications of deriving the public key at Worker startup from the stored private key on every cold start -- is there a timing or key exposure risk?
3. The private key is stored as a base64-encoded `wrangler secret` named `SIGNING_KEY` -- are there any pitfalls with how Workers secrets are injected (env binding) that could lead to accidental logging or exposure?
4. Should the signing module defensively validate the key material (e.g., check length, format) before using it, and what should happen if validation fails (refuse to start? refuse to sign? log an error?)?
5. Are there any concerns with the canonical JSON approach to `bundleHash` determinism (sorted keys, stripped whitespace) -- could there be edge cases (Unicode normalization, number precision, etc.) that break determinism?

## Context

Existing codebase: Cloudflare Worker with src/capture.js (browser rendering pipeline), src/kv.js (KV access), wrangler.toml (R2 bucket, KV, rate limiter, browser binding). 191 existing tests via vitest + @cloudflare/vitest-pool-workers. The signing architecture will be the trust anchor for the entire product -- every verification depends on correct signing.

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that
   aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: security-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-K21mi7/mvp-step-4-wacz-bundling-signing/phase2-security-minion.md`
