You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Build a public verification endpoint (`GET /v1/verify/{id}`) for a web resource ledger. The endpoint proves a stored capture is authentic and unmodified by recomputing SHA-256 hashes, recomputing bundleHash from canonical JSON, and verifying the Ed25519 signature. No authentication required. Response cached with `Cache-Control: public, immutable, max-age=31536000`. Rate limited at ~60 req/min per IP. Must have passing end-to-end integration tests including tamper detection.

## Your Planning Question
Review the verification security model:
1. Should verification use the embedded public key from `datapackage-digest.json` (inside the WACZ) or the server's current signing key from env.SIGNING_KEY? The WACZ code comments say "Verifiers MUST pin against an operator-published key, not trust the embedded key blindly." What does this mean for the endpoint implementation?
2. Does `Cache-Control: public, immutable, max-age=31536000` create any security risk under key rotation scenarios? If a key is compromised and rotated, cached "verified: true" responses would persist.
3. What information disclosure risks exist through per-artifact failure details? Could detailed verification failure messages help an attacker?
4. Is ~60 req/min per IP adequate rate limiting for a public unauthenticated endpoint? Any DDoS/abuse concerns?
5. The endpoint reads from R2 (potentially multiple objects) -- any resource exhaustion concerns?

## Context
### Existing signing module (src/signing.js):
- `getSigningKeys(env)` -- imports Ed25519 keys from env.SIGNING_KEY (PKCS8 base64)
- `signBytes(privateKey, data)` -- signs with private key, returns base64
- `verifySignature(publicKeyBytes, data, signatureBase64)` -- verifies Ed25519 signature
- Module caches keys with rotation detection (re-imports if env.SIGNING_KEY changes)

### WACZ structure:
- `datapackage-digest.json` contains `signedData.publicKey` (embedded base64 public key)
- `signedData.signature` is Ed25519 signature over UTF-8 bytes of bundleHash string
- bundleHash = sha256(canonicalize(datapackage))

### KV record includes:
- `wacz.bundleHash` -- stored at capture time
- `wacz.key` -- R2 key for WACZ file
- `artifacts` -- R2 keys for individual artifacts (screenshot, html, headers)

### Current rate limiter (wrangler.toml):
```toml
[[unsafe.bindings]]
name = "CAPTURE_RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 10, period = 60 }
```

### Existing security patterns:
- RFC 9457 problem+json for errors
- Static 404 messages (no ID reflection)
- No auth on read endpoints (capture ID is access secret)
- Referrer-Policy: no-referrer, X-Content-Type-Options: nosniff on all responses

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
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

6. Write your complete contribution to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-wBF00I/mvp-step-6-verification-endpoint/phase2-security-minion.md`
