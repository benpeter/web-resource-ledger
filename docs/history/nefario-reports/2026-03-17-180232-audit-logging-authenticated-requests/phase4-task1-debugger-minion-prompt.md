## Task: Add keyId to verifyApiKey() return value

You are modifying the auth module to return a `keyId` alongside `tenantId` on
successful authentication. This is the foundational data-flow change that enables
audit logging with per-key tracing.

### Context

`src/auth.js` currently returns `{ ok: true, tenantId }` on success (line 94). Audit
logging needs a `keyId` field to identify which API key was used. Pre-R12
(per-tenant keys), there is only one key (`CAPTURE_API_KEY`), so derive a
static `keyId` from it.

### What to do

1. In `src/auth.js`, after successful auth (around line 94), compute `keyId` as
   the first 8 hex characters of SHA-256 of the raw `CAPTURE_API_KEY` value.
   Use `crypto.subtle.digest('SHA-256', enc.encode(env.CAPTURE_API_KEY))`,
   convert to hex, and take the first 8 chars. The `enc` TextEncoder is already
   in scope from line 64. This matches the project's existing fingerprinting
   pattern (signing keys use SHA-256 prefix).

2. Return `{ ok: true, tenantId, keyId }` on success.

3. Update the JSDoc for `verifyApiKey()` to document the new `keyId` field
   in the success return type. **Important security constraint**: The JSDoc
   MUST include this note: "keyId is a logging label only -- do not use for
   access control. It is an 8-hex-char SHA-256 prefix with no meaningful
   second-preimage resistance." This prevents future callers from treating
   the fingerprint as a verifiable identity.

4. Update `test/auth.test.js`:
   - Existing success tests should now also assert `keyId` is a string of
     8 hex characters (regex: `/^[0-9a-f]{8}$/`).
   - Existing failure tests should verify `keyId` is NOT present in the
     response (no information leakage on failure).
   - Add a test that verifies `keyId` is deterministic: calling with the
     same key twice produces the same `keyId`.

### What NOT to do

- Do NOT change the failure return type. Failed auth still returns
  `{ ok: false, response }`.
- Do NOT log anything new in auth.js. Audit logging happens in the callers.
- Do NOT create a new file for this. The change is ~10 lines in auth.js.

### Files to modify
- `src/auth.js` -- add keyId computation and return field
- `test/auth.test.js` -- extend existing tests, add determinism test

### Security constraint
The `keyId` is a SHA-256 prefix of the secret API key. 8 hex chars (32 bits)
of a 256-bit hash do not leak exploitable information about the key. This is
the same pattern used for signing key fingerprints throughout the project.
NEVER log the raw API key -- only the fingerprint.
