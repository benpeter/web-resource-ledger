# Decisions: Key Versioning (R2)

## D1: keyId = first 8 hex chars of SHA-256(raw public key)

**Decision**: Use a truncated SHA-256 fingerprint of the raw 32-byte Ed25519
public key as the key identifier.

**Alternatives considered**:
- 16 hex chars (security-minion recommended, lucy echoed): rejected because the
  keyId is a lookup index, not a security primitive. The Ed25519 signature is the
  security barrier. Birthday collision at n=10 keys with 32-bit space is ~1 in
  858 million. Preimage attacks produce a different key pair that would fail
  signature verification. 8 chars matches the issue specification.
- UUID per key: rejected because it requires external state to map key to ID.
  SHA-256 fingerprint is deterministic from key material alone.
- Full SHA-256 (64 chars): unnecessary length for single-digit key counts.

## D2: Key resolution stays in handler, not in verifyWacz()

**Decision**: `verifyWacz(waczBytes, publicKeyBytes)` keeps its pure function
signature. Key lookup from keyId → public key bytes happens in
`handleVerifyCapture()`.

**Rationale**: The existing security invariant is that publicKeyBytes comes from
the server, never from the WACZ itself. Moving key resolution into verifyWacz
would break this invariant and create a key substitution vector. The security-
minion flagged this as the critical constraint, and the test suite already
includes a "key substitution attack" scenario enforcing it.

## D3: keyId stored in KV capture record (server-controlled)

**Decision**: Server-side verification reads keyId from the capture's KV record
(written at signing time by the capture pipeline), not from the WACZ's
signedData.keyId field.

**Rationale**: The KV record is server-controlled. The WACZ is user-accessible.
If verification read keyId from the WACZ, an attacker could embed a different
keyId to influence which key the server uses. The WACZ-embedded keyId exists for
offline/third-party verifiers who fetch keys from /.well-known/signing-keys.

## D4: Archive before completeCapture()

**Decision**: `archiveSigningKey()` is called synchronously before
`completeCapture()` writes the KV record referencing the keyId.

**Rationale**: Eliminates the race window where a KV record contains a keyId but
the corresponding archived key hasn't been written yet. If archiveSigningKey
fails, the capture still completes (the error is caught), and verification will
fall back to the current key.

## D5: Legacy fallback = current key only

**Decision**: Captures without keyId in their KV record (pre-versioning) fall
back to the current signing key. They do NOT try all archived keys.

**Alternatives considered**:
- "Try all archived keys" (from synthesis plan): rejected per security-minion and
  margo. It weakens the trust model by making key resolution WACZ-driven by
  elimination rather than server-directed. Single-digit key count makes the
  performance argument moot — the concern is the security model.
- Backfill keyId for existing captures: deferred. The "must ship before any key
  rotation" constraint means legacy captures were all signed with the current key
  at deployment time, so the fallback is correct.

## D6: Keep both /.well-known/signing-key and /.well-known/signing-keys

**Decision**: The existing singular endpoint stays for backward compatibility.
The new plural endpoint serves the historical key archive. The singular endpoint
now also includes keyId in its response.

**Rationale**: Existing consumers that poll the singular endpoint are unaffected
(keyId is an additive field). The plural endpoint serves a different use case
(key archive enumeration for offline verifiers).

## D7: 32-byte key validation in archiveSigningKey()

**Decision**: Validate that the base64-decoded public key is exactly 32 bytes
before writing to KV.

**Rationale**: Security-minion recommendation. Prevents storing a malformed key
that would always fail verification but could mask errors in the fallback path.
