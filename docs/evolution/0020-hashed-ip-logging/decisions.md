# Decisions: 0019 Hashed IP Logging

## HMAC-SHA256 key derivation: two-step vs single-step

**Decision**: Two-step derivation (dailyKey = HMAC(seed, date), then cip = HMAC(dailyKey, ip)).

**Alternatives considered**:
- Single-step: `HMAC(seed + date, ip)` -- simpler but concatenation of secret and non-secret material is a known anti-pattern
- HKDF proper -- overkill for this use case

**Rationale**: security-minion argued the two-step pattern follows HKDF extract-then-expand, cleanly separates temporal component from secret material, and enables caching the daily key without re-importing the seed. iac-minion initially suggested single-step but deferred to the security analysis.

## Hash truncation: 16 hex chars vs full 64

**Decision**: First 16 hex characters (64 bits).

**Rationale**: At WRL's traffic volume (~hundreds/day), 64 bits gives effectively zero collision risk. Shorter hashes save log storage and are easier to copy-paste in Coralogix queries.

## Field naming: `cip` vs `ipHash` vs `hashedIp`

**Decision**: `cip` (short for "client IP hash").

**Conflict**: security-minion recommended `ipHash`, observability-minion recommended `cip`.

**Resolution**: observability-minion wins. `cip` is shorter (saves bytes per log entry), follows CDN convention (Cloudflare uses similar abbreviations), and avoids "where's the unhashed version?" questions. The observability-minion's reasoning about query ergonomics is more relevant -- this field will be queried thousands of times.

## Error fields: flat vs nested

**Decision**: Flat fields `errorName` and `errorMessage` alongside existing `errorCategory`.

**Rationale**: The existing schema uses `errorClass` and `errorCategory` as flat top-level fields. Extending with `errorName`/`errorMessage` is consistent. Nested objects would complicate Coralogix queries.

## Secret: separate IP_HASH_SEED vs reuse SIGNING_KEY

**Decision**: New `IP_HASH_SEED` secret.

**Rationale**: security-minion: SIGNING_KEY is Ed25519 PKCS8 for WACZ signing -- different purpose, different rotation lifecycle, different blast radius on compromise. Reusing it would create an unnecessary coupling.

## IPv6 normalization: normalize vs hash-as-is

**Decision**: Hash the raw CF-Connecting-IP string as-is.

**Rationale**: Cloudflare normalizes CF-Connecting-IP per request. Adding a full IPv6 normalization layer is YAGNI for a single-tenant, low-traffic deployment. Document the assumption and add a backlog item if IPv6 correlation issues are observed.

## Error message truncation: 200 vs 256 characters

**Decision**: 256 characters.

**Rationale**: Covers all known Playwright error patterns. Clean power-of-two boundary. The 56-char difference is negligible for blast radius.
