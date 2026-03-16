Switch RFC 3161 TSA from DigiCert to Sectigo (#66)

## Outcome

RFC 3161 timestamps are reliably obtained for every capture because the TSA endpoint actually works from Cloudflare Workers. The current DigiCert TSA (`timestamp.digicert.com`) is HTTP-only (port 80) but the configured URL uses `https://`, causing silent failures on Workers where the HTTPS request hits port 443 and gets connection refused.

## Success criteria

- `TSA_URL` in wrangler.toml updated to Sectigo for both production and staging environments
- Captures on staging obtain RFC 3161 timestamps (verification page shows timestamp check as "pass" instead of "skip")
- All existing tests pass
- Documentation references to the TSA URL are updated

## Scope

**In:** `wrangler.toml` TSA_URL vars (production and staging), any docs referencing the TSA endpoint

**Out:** RFC 3161 implementation changes, multi-TSA failover, TSA selection UI

## Constraints

- Sectigo (`http://timestamp.sectigo.com`) -- supports HTTP and HTTPS, trusted root CA in all major stores, SHA-256, 99.9% stated SLA
