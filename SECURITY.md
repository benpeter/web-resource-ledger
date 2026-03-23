# Security Policy

## Supported Versions

Web Resource Ledger does not publish versioned releases yet. Security fixes are applied to the `main` branch. We recommend always running the latest commit on `main`.

## Reporting a Vulnerability

Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new). This creates a private discussion where we can assess the issue before any public disclosure.

**Please do not open a public issue for security vulnerabilities.**

## What to Expect

We will acknowledge receipt of your report within 72 hours and aim to provide an initial assessment within 7 days. These are goals, not guarantees -- this is a small project maintained in spare time. We do take every report seriously.

## Scope

The following are considered security issues:

- SSRF bypasses or unintended outbound requests
- Authentication or API key bypass
- Admin API key compromise or bypass (obtaining admin-level access to key management without `ADMIN_KEY`)
- Tenant data isolation escape (one tenant accessing or listing captures belonging to another tenant)
- Signature verification flaws (e.g., accepting tampered archives as valid)
- Cross-site scripting (XSS) on the verification page
- Exposure of signing keys or secrets through any code path

### Access Model

Three access paths exist for capture retrieval:

- **Tenant authentication (Bearer token):** Required for all capture retrieval endpoints (`GET /v1/captures/{id}`, `/status`, `/artifacts/*`). Tenants can only see their own captures. Cross-tenant access returns 404, not 403, to prevent enumeration.
- **Share tokens (query parameter `?token=wrl_share_...`):** Delegated read-only access to a specific capture and its artifacts. Cryptographically random (256-bit), time-limited or permanent. Scoped to a single capture. Created by the owning tenant via `POST /v1/captures/{id}/share`.
- **Public verification (no auth):** `GET /v1/verify/{id}` remains unauthenticated by design. Verification must be publicly accessible for the trust model to work.

### Share Token Design

- 256-bit cryptographic randomness, base64url encoded, `wrl_share_` prefix (43 character token body)
- Stored as SHA-256 hash in D1 -- raw token never persisted, same model as API keys
- Created via `POST /v1/captures/{id}/share` (requires tenant Bearer auth)
- Expired tokens return 410 Gone; invalid tokens return 401 Unauthorized
- Grants: read access to capture metadata and all artifacts for the specific capture
- Does not grant: list access, access to other captures, write operations

### Threat Analysis

**Mitigated:**
- Capture ID guessing: retrieval endpoints now return 401 without auth (previously unauthenticated)
- Cross-tenant data access: tenant isolation enforced; cross-tenant lookups return 404
- Credential sharing via capture URL: share tokens decouple artifact access from API keys

**Residual risks:**
- Share token in URL query string: visible in server logs, browser history, and proxy logs. Mitigated by time-limited tokens and `Referrer-Policy: no-referrer` header on all responses.
- Verify endpoint confirms capture existence without auth: intentional -- public verifiability is a core design requirement.

The following are regular bugs, not security issues:

- Incorrect capture output for unusual page types
- Performance or reliability issues
- UI/layout problems on the verification page

## Disclosure

We will coordinate with you before any public disclosure. We will credit you in the advisory unless you prefer to remain anonymous.
