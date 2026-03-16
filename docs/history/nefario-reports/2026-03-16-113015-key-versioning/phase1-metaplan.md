# Meta-Plan: R2 Key Versioning and Public Key Archive

## Task Summary
Add key versioning to the WACZ signing flow so that signing key rotation doesn't break verification of previously-signed captures. Involves: keyId computation, KV-based key archive, new well-known endpoint, updated verification logic, and comprehensive tests.

## Specialists to Consult

### 1. security-minion
**Rationale**: Cryptographic key management, trust chain design, rotation procedure safety.
**Planning question**: Review the proposed key versioning approach for the Ed25519 signing flow. The plan is to: (a) compute keyId as SHA-256 fingerprint of the raw 32-byte public key, truncated to 8 hex chars; (b) include keyId in signedData within datapackage-digest.json; (c) auto-archive the current public key to KV under `signing-key:{keyId}` on every signing operation; (d) update verification to read keyId from WACZ and look up the corresponding historical key from KV. Are there security concerns with this approach? What about: key fingerprint truncation to 8 hex chars (collision risk), trusting keyId from WACZ for key lookup (does this weaken the trust model?), idempotent auto-archive on every sign, backward compatibility for existing WACZ bundles that lack keyId?

### 2. test-minion
**Rationale**: Test strategy for rotation scenarios, backward compatibility verification.
**Planning question**: What test scenarios are needed for key versioning? Consider: (a) signing produces keyId in output; (b) verification with the correct historical key succeeds; (c) verification after key rotation (old WACZ, new current key, historical key in KV); (d) backward compatibility — WACZ without keyId falls back to current key; (e) /.well-known/signing-keys endpoint returns archived keys; (f) key archive KV operations (store, retrieve, list). How should integration tests handle multiple key pairs?

## Cross-Cutting Checklist
- [x] Security: key management review (security-minion)
- [x] Testing: rotation scenario coverage (test-minion)
- [ ] Backward compatibility: existing WACZ without keyId must still verify
- [ ] No new dependencies needed (all crypto is Web Crypto API)

## External Skills
No external skills detected.
