Create two Mermaid diagrams for the documentation site (`site/content/`) and add them as a new page in the site navigation.

## Diagram 1: User Interaction Flows

A sequence diagram showing how different roles interact with the system:

**Tenant (Capture Creator):**
- Authentication: GitHub OAuth (PKCE) → session cookie, or API key (Bearer token)
- Create capture: `POST /v1/captures` → 202 Accepted + statusUrl
- Poll status: `GET /v1/captures/{id}/status`
- Retrieve result: `GET /v1/captures/{id}` + download artifacts
- Create share link: `POST /v1/captures/{id}/share` → token-based access for third parties

**Verifier (public, no authentication required):**
- `GET /v1/verify/{captureId}` → 5 integrity checks (artifactHashes, bundleHash, signature, timestamp, qualifiedTimestamp)
- Alternatively: share link with `?token=wrl_share_xxx`

Also show self-serve flows: tenant creates own API keys via `/v1/account/keys`, manages webhooks, and optional eIDAS opt-in.

## Diagram 2: Capture Pipeline & Integrity Chain

A flowchart or sequence diagram showing the entire capture process and all involved systems:

**Systems:** Cloudflare Worker (API), Cloudflare Queue, Cloudflare Browser Rendering, R2 Storage, D1 Database, KV (rate limits), Google Web Risk API, RFC 3161 TSA, eIDAS Qualified TSA, Stripe (metering)

**Flow:**
1. API receives request → authentication → rate limiting (3 layers: CF ceiling, KV counter, IP guard) → quota check → SSRF validation → Google Web Risk check
2. Generate capture ID → D1 pending record → queue dispatch → return 202
3. Queue consumer: browser rendering (screenshot + DOM + headers) → cookie consent dismissal (autoconsent)
4. Build WACZ bundle: SHA-256 hashes of all artifacts → datapackage.json → canonicalize → bundleHash → Ed25519 signature → RFC 3161 timestamp (optional) → eIDAS qualified timestamp (optional)
5. R2 storage (hash-named) → D1 update (complete) → Stripe metering → webhook dispatch

**Integrity visualization — highlight the cryptographic proof chain:**
- Each artifact → SHA-256 hash → datapackage.json → canonical JSON → bundleHash
- bundleHash → Ed25519 signature (server key)
- bundleHash → RFC 3161 timestamp (independent time attestation)
- bundleHash → eIDAS qualified timestamp (legally binding)
- Verification: all hashes + signature + timestamps independently verifiable via `/v1/verify`

## Implementation notes

- Output as Markdown with ` ```mermaid ` code blocks (GitHub renders natively)
- Place as a new content page (e.g. `site/content/architecture.md`) using the `layouts/doc.njk` layout
- Add to site navigation in `site/_data/site.js` — between "Getting Started" and "Authentication" or after "API Reference", whichever reads better
- Read the codebase to verify all details — the description above is directional, the code is the source of truth
- Diagrams should be clear enough for potential customers and technical evaluators
