# Decisions: 0028 — Switch TSA from DigiCert to Sectigo

## TSA Provider: Sectigo over DigiCert

**Decision**: Replace DigiCert (`https://timestamp.digicert.com`) with Sectigo (`https://timestamp.sectigo.com`).

**Rationale**: DigiCert's TSA is HTTP-only (port 80). The configured URL uses HTTPS, which hits port 443 and gets connection refused from Cloudflare Workers. Sectigo supports both HTTP and HTTPS, resolving the silent failure.

**Alternatives considered**:
- **Use HTTP for DigiCert** (`http://timestamp.digicert.com`): Would work, but HTTPS is preferable for transport security. The previous RFC 3161 phase (0025) already decided to use HTTPS as the default scheme.
- **FreeTSA, other providers**: Sectigo is a trusted root CA in all major stores, supports SHA-256, and states 99.9% SLA. No reason to evaluate lesser-known providers.

## Protocol: HTTPS

**Decision**: Use `https://timestamp.sectigo.com` (not HTTP).

**Rationale**: Sectigo supports HTTPS. Maintains the security posture established in phase 0025 where security-minion advocated for HTTPS as the default. The TSA response is cryptographically self-authenticating, but HTTPS prevents MITM on the transport layer.

## Scope: Config-only, no code changes

**Decision**: Change only `wrangler.toml` (2 locations) and `vitest.config.js` (1 location). No source code or historical documentation changes.

**Rationale**: `src/rfc3161.js` is fully TSA-agnostic — it takes `tsaUrl` as a parameter from `env.TSA_URL`. Historical evolution logs (0025) document what happened at that time and should not be retroactively edited.
