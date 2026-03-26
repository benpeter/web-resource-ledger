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

A flowchart or sequence diagram showing the entire capture process and all involved systems.

Source: GitHub issue #168
