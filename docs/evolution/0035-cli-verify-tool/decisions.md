# Decisions

## Package structure: vendor vs. shared package

**Decision**: Vendor verification modules into `packages/verify/lib/` rather than creating a monorepo workspace.

**Alternatives considered**:
- npm workspace with shared `@wrl/core` package
- Symlinks from `src/` to `packages/verify/lib/`

**Rationale**: The four modules total ~930 lines, are stable, and a shared package adds build complexity for minimal benefit. The CLI needs Node.js-specific adaptations (sync SHA-256, Buffer.from for base64) that diverge from the Worker code. YAGNI wins.

## CMS library: PKIjs

**Decision**: Use PKIjs for CMS/PKCS#7 signature and certificate chain validation.

**Alternatives considered**:
- `node-forge`: lacks functional `pkcs7.verify()` method
- `@peculiar/x509`: no CMS support
- Raw `node:crypto` X509Certificate: no chain walking API
- Hand-rolled CMS verification: thousands of lines of security-critical code

**Rationale**: PKIjs is the only viable option. It provides `SignedData.verify({ checkChain: true, trustedCerts })` which handles both CMS signature verification and certificate chain validation in one call. Pinned to exact versions for supply chain safety.

**Risk mitigation**: PKIjs issue #332 (chain validation always returning true) was tested explicitly -- empty `trustedRoots` correctly causes failure.

## Trust model: origin-verified by default

**Decision**: Remote URLs auto-resolve keys. Local files require explicit key source (`--origin`, `--key`, `--key-file`). `--trust-embedded` is an escape hatch with warning.

**Alternatives considered**:
- Trust embedded key by default (insecure)
- Always require `--key` flag (poor UX)
- `--key-url` for fetching (too low-level)

**Rationale**: Matches the Worker's own security posture where embedded keys are never trusted. `--origin` is more user-friendly ("where did this come from") and handles key rotation via keyId matching.

## Check count: 5 checks (timestamp split)

**Decision**: Split timestamp verification into "Timestamp imprint" (hash match) and "Timestamp chain" (CMS signature + cert chain). 5 checks total in CLI vs. 4 in Worker.

**Rationale**: The two checks verify genuinely different things. The CLI adds a capability the Worker doesn't have. Showing it as a separate check is honest and informative.

## Test runner: node:test

**Decision**: Use Node.js built-in `node:test` instead of vitest.

**Alternatives considered**: vitest (used by Worker tests)

**Rationale**: Zero dependencies, matches the CLI's lightweight ethos. vitest is only used in the Worker because of `@cloudflare/vitest-pool-workers`. The node:test API surface difference is trivial.

## No --verbose flag

**Decision**: Default output shows all checks and details. No intermediate verbosity level.

**Rationale**: The default output already shows everything meaningful. `--json` provides all data. Adding `--verbose` creates a decision point that punishes wrong guesses without helping either audience.

## CRL/OCSP revocation checking: deferred

**Decision**: No certificate revocation checking in v0.1.0.

**Rationale**: Offline requirement conflicts with CRL/OCSP (both require network access). RFC 3161 Section 2.4.2 says revocation checking is SHOULD, not MUST. Commercial TSAs have never had a timestamping certificate revoked in practice. Documented as known limitation.
