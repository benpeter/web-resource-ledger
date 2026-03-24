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

- **Tenant authentication (Bearer token):** Required for `POST /v1/captures` (create), `GET /v1/captures` (list), and management endpoints. Tenants can only list their own captures.
- **Public access (capture ID as capability):** `GET /v1/captures/{id}`, `/status`, `/artifacts/*`, and `GET /v1/verify/{id}` require no authentication. The 128-bit capture ID (`cap_` + 32 hex chars, 122 bits of entropy from UUID v4) functions as a capability token. Knowing the ID grants read access to the capture and all its artifacts. This is analogous to "anyone with the link" sharing in Google Docs.

### Threat Analysis

**Mitigated:**
- Capture ID enumeration: 128-bit IDs make brute-force enumeration computationally infeasible. List endpoint requires tenant auth, preventing catalog-based discovery.
- Cross-tenant list isolation: tenants can only list their own captures.
- Credential exposure for sharing: capture URLs are shareable without API key exposure.

**Residual risks:**
- Capture ID as bearer capability: anyone who obtains a capture ID (from logs, shared URLs, browser history) can access that capture and all its artifacts. This is the intended design. Tenants should treat capture IDs with the same care as a document sharing link.
- All individual capture endpoints confirm capture existence: intentional -- public verifiability is a core requirement.

The following are regular bugs, not security issues:

- Incorrect capture output for unusual page types
- Performance or reliability issues
- UI/layout problems on the verification page

## Disclosure

We will coordinate with you before any public disclosure. We will credit you in the advisory unless you prefer to remain anonymous.
