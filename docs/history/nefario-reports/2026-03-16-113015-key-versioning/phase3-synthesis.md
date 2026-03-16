# Execution Plan: R2 Key Versioning

## Design Decisions

1. **keyId = first 8 hex chars of SHA-256(raw 32-byte public key)** — sufficient as a lookup index; security comes from Ed25519 signature verification, not the fingerprint.
2. **verifyWacz() unchanged** — pure function, takes (waczBytes, publicKeyBytes). Key resolution in the handler.
3. **Server-side: keyId from KV record** — server verification uses capture KV record's keyId (server-controlled). WACZ-embedded keyId is for offline/third-party verifiers only.
4. **Auto-archive on sign** — every buildWacz() call archives the current public key to KV. Idempotent (same keyId overwrites same value).
5. **Archive BEFORE completeCapture()** — no race window.
6. **Legacy fallback**: no keyId in KV record → try current key first, then all archived keys. Single-digit key count makes this trivial.
7. **/.well-known/signing-keys** (plural) — new endpoint serving all archived keys. Keep old /.well-known/signing-key for backward compat.

## Task 1: Core Implementation

**Agent**: general-purpose (execution)
**Model**: sonnet
**Mode**: bypassPermissions

### Files to modify:

**src/signing.js** — add `computeKeyId(publicKeyBytes)`:
- SHA-256 of raw 32-byte public key
- Take first 4 bytes (8 hex chars)
- Update getSigningKeys() to return { privateKey, publicKeyBytes, keyId }

**src/kv.js** — add signing key archive functions:
- `archiveSigningKey(kv, keyId, publicKeyBase64)` — write `signing-key:{keyId}` → { algorithm, publicKey, archivedAt }
- `getArchivedSigningKey(kv, keyId)` → parsed record or null
- `listArchivedSigningKeys(kv)` → array of all archived keys

**src/wacz.js** — update buildWacz():
- Get keyId from getSigningKeys() return value
- Include keyId in signedData object
- Return keyId in the result object

**src/capture.js** — update performCapture():
- After buildWacz(), call archiveSigningKey() before completeCapture()
- Include keyId in waczInfo written to KV record

**src/index.js** — update handlers:
- handleVerifyCapture(): read keyId from KV record → getArchivedSigningKey() → fall back to current key → fall back to trying all archived keys
- Add handleGetSigningKeys() for /.well-known/signing-keys (rate-limited, returns array of archived keys)
- Update handleGetSigningKey() to include keyId in response
- Add route for new endpoint

## Task 2: Tests

**Agent**: general-purpose (execution)
**Model**: sonnet
**Mode**: bypassPermissions
**Depends on**: Task 1

### Files to modify:

**vitest.config.js** — generate second keypair (TEST_ARCHIVED_KEY binding)

**test/wacz.test.js** — add test: buildWacz output includes keyId in signedData and return value

**test/signing-key.test.js** — add tests for:
- /.well-known/signing-keys endpoint (returns array)
- Current key's keyId appears in response
- Rate limiting on new endpoint

**test/verify-integration.test.js** or new test file — add tests for:
- Verification succeeds when keyId in KV record matches archived key
- Verification of legacy capture (no keyId) falls back to current key
- Key rotation scenario: sign with old key, verify with new current key + archived old key

**test/kv.test.js** — add tests for:
- archiveSigningKey() writes and reads correctly
- listArchivedSigningKeys() returns all keys
- Idempotent archive (write same keyId twice)

## Execution Order
1. Task 1 (core implementation) — no dependencies
2. Task 2 (tests) — depends on Task 1
