# Outcome: Key Versioning (R2)

## What was built

Key versioning for the Ed25519 signing flow, enabling signing key rotation
without breaking verification of previously-signed WACZ captures.

### Changes by file

| File | Change | Lines |
|------|--------|-------|
| `src/signing.js` | Added `computeKeyId()`, updated `getSigningKeys()` return value to include keyId | +20 |
| `src/kv.js` | Added `archiveSigningKey()`, `getArchivedSigningKey()`, `listArchivedSigningKeys()` with 32-byte validation | +55 |
| `src/wacz.js` | Include keyId in signedData and return value | +3 |
| `src/capture.js` | Archive signing key before completeCapture(), include keyId in wacz KV record | +12 |
| `src/index.js` | Updated verification to resolve historical keys, added `/.well-known/signing-keys` endpoint, added keyId to singular endpoint response | +40 |
| `vitest.config.js` | Added second keypair (TEST_ARCHIVED_KEY) for rotation tests | +4 |
| `test/key-rotation.test.js` | **New**: 13 tests covering keyId computation, archive ops, rotation verification, legacy fallback, failure paths | +180 |
| `test/signing-key.test.js` | Added tests for keyId in response, plural endpoint, archive retrieval | +90 |
| `test/wacz.test.js` | Added tests for keyId in signedData, keyId in KV record, key archive after capture | +40 |
| `openapi.yaml` | Added keyId to signing-key schema, added /.well-known/signing-keys endpoint | +65 |
| `docs/backlog.md` | Marked R2 as done | +2 |
| `docs/evolution/README.md` | Added 0017-key-versioning entry | +1 |

### Test results

- 409 tests passing across 20 test files (was 396 before)
- 13 new tests in key-rotation.test.js
- 6 new tests in signing-key.test.js (plural endpoint)
- 3 new tests in wacz.test.js (keyId in output)
- All existing tests pass without modification

## Success criteria verification

| Criterion | Status |
|-----------|--------|
| Every WACZ signature includes keyId (SHA-256 fingerprint, 8 hex chars) | DONE |
| /.well-known/signing-keys endpoint serves historical public keys | DONE |
| Verification endpoint reads keyId and selects correct historical key | DONE |
| Key rotation procedure: generate new key, deploy, old key auto-archived | DONE |
| All existing captures remain verifiable after rotation | DONE (via legacy fallback to current key) |
| Tests: signing with new key, verifying with old key, key archive retrieval | DONE (13 dedicated tests) |

## What deviated from the plan

1. **"Try all archived keys" fallback removed**: Both security-minion and margo
   advised against it during Phase 3.5 review. Legacy captures fall back to
   current key only, which is correct given the "must ship before any key
   rotation" constraint.

2. **32-byte validation added**: Security-minion recommended validating public key
   length in archiveSigningKey(). Added during implementation.

3. **OpenAPI spec updated**: Not in the original plan but necessary for spec
   completeness.

## Backlog changes

- R2 (Key versioning) moved to Done
- R11 (RFC 3161 timestamp integration) now has its dependency (R2) satisfied
- No new backlog items created — all deferred items (HSM, automated rotation
  scheduling, multi-tenant key management) were already in the Parking Lot
