You are rewriting the Reference section of `README.md` in the
web-resource-ledger project. The current Key Rotation and Public Key
Endpoint sections contain dangerously stale information.

## Context

PR #54 (phase 0017) implemented key versioning. The code now:
- Computes a `keyId` (first 8 hex chars of SHA-256 of raw public key) for
  every key (`src/signing.js:73-74`)
- Archives every signing key in KV before completing a capture
  (`src/kv.js:251-263`)
- Looks up the archived key by `keyId` from the KV record during
  verification (`src/index.js:438-448`)
- Exposes `/.well-known/signing-keys` (plural) listing all historical keys
  (`src/index.js:534-551`)
- Returns `keyId` in the `/.well-known/signing-key` response
  (`src/index.js:528`)

## What to fix

**1. Rewrite Key Rotation section**

The current text says:
- "Rotating the signing key invalidates signature verification for all
  captures signed with the previous key" -- FALSE
- "There is no key history endpoint yet" -- FALSE
- "Key versioning and old-key verification are not yet implemented" -- FALSE

Replace with accurate documentation:
- Key rotation is safe: old captures continue to verify because keys are
  archived automatically
- Each key gets a `keyId` fingerprint (8-char hex of SHA-256 of raw public
  key bytes)
- During verification, the system looks up the correct historical key by
  the `keyId` stored in the WACZ bundle's `signedData`
- The `/.well-known/signing-keys` endpoint exposes the full key archive
- Keep the rotation procedure steps (generate, update secret, update
  .dev.vars) -- those are still correct
- Mention that pre-key-versioning captures (signed before PR #54 was
  deployed) fall back to the current key for verification -- if the current
  key doesn't match, those specific captures will fail. This is the one
  edge case to note honestly.

**2. Update Public Key Endpoint section**

The current text documents the response shape as `{ algorithm, publicKey }`.
The actual response is `{ algorithm, publicKey, keyId }`. Update the shape
and explain what `keyId` is (8-char hex fingerprint of SHA-256 of the raw
public key bytes).

**3. Add Key Archive Endpoint section (new, after Public Key Endpoint)**

Document `GET /.well-known/signing-keys` (plural):
- Purpose: lists all historical signing keys for third-party verification
- Response shape: `{ keys: [{ keyId, algorithm, publicKey, archivedAt }] }`
- Use case: third-party verifiers matching WACZ `signedData.keyId` against
  the key archive to verify captures signed with any historical key
- Rate-limited (same group as the singular endpoint)

## Writing style

- Match the existing README voice: direct, technical, no fluff
- Keep it scannable -- deployers skim, they don't read novels
- Use code blocks for response shapes and commands
- The warning box format (> **Warning:**) is appropriate for genuine
  caveats, but do NOT use it for the false "key rotation breaks things"
  message -- that's the whole point of this fix

## What NOT to do

- Do NOT rewrite sections outside Reference (Key Rotation, Public Key
  Endpoint, and the new Key Archive Endpoint)
- Do NOT add documentation for health endpoint, response headers, staging,
  CORS, or missing secrets -- those are separate tasks
- Do NOT change the Setup section
- Do NOT modify any other files
- Do NOT document internal KV key prefix format (e.g., `signing-key:<keyId>`) -- that is an internal storage detail, not part of the public API

## Files to modify

- `README.md` (Reference section only)

## How to verify

Read the code at `src/signing.js`, `src/kv.js`, `src/index.js` and
confirm every claim in the new text matches the implementation.

## Deliverables

Updated Reference section of README.md with accurate Key Rotation, updated
Public Key Endpoint, and new Key Archive Endpoint documentation.

When you finish your task, mark it completed with TaskUpdate and send a message to the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
