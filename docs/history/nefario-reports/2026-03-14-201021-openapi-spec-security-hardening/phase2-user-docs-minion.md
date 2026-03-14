# User Docs Minion — Planning Contribution

## Planning Question
> The issue asks for key rotation documentation in README. Should it cover just the commands, or operational considerations (cache invalidation, old-key captures, downtime window)?

## Recommendation

Cover operational considerations, not just the commands. But keep it lean -- a focused how-to guide with warnings, not an operations manual.

## Rationale

### Why commands alone are insufficient

Key rotation is a **destructive operational procedure** with real consequences that the README currently does not surface. Based on my reading of the codebase:

1. **Old captures become unverifiable.** The verification endpoint (`verify.js` line 272) verifies the WACZ against the *current* server public key from `getSigningKeys(env)`. After rotation, every capture signed with the old key will fail signature verification (`"Ed25519 signature verification failed"`). The backlog already flags this: "[should] Key versioning / key ID in signature entries -- needed for key rotation; without it, verification returns false for captures signed with rotated keys."

2. **The `/.well-known/signing-key` endpoint will be new.** If this step introduces it, the README must explain what it serves and how rotation affects it. Third-party verifiers who pinned the old public key need to know the key changed.

3. **Cache invalidation is a real operational concern.** Verified results are cached publicly (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800` -- see `index.js` line 288). After rotation, cached "verified: true" results remain valid (the capture was verified with the correct key at that time), but any stale cache entries for captures that were re-verified during the rotation window could be inconsistent.

4. **The module-level key cache in `signing.js`** detects rotation by comparing the base64 string (`env.SIGNING_KEY === _cachedKeyString`), so Workers will pick up the new key on the next cold start or secret update. But there is no instant purge -- existing isolates may briefly serve the old key until Cloudflare recycles them.

### Why a full operations manual is too much

The project follows the Helix Manifesto: YAGNI, KISS, lean and mean. The backlog explicitly defers key versioning, key ID tagging, and old-key archives to post-MVP. Documenting a multi-key rotation procedure for features that do not exist yet would be speculative and misleading.

## Recommended Documentation Structure

A how-to guide section in the README titled **"Key Rotation"** (placed after the existing "Signing Key Setup" section), structured as:

### Content to include

1. **Warning block up front**: State plainly that rotation invalidates verification for all captures signed with the previous key. This is the single most important thing the operator needs to know. Do not bury it after the commands.

2. **Steps** (3 steps, imperative mood):
   - Generate a new key pair (`node scripts/generate-signing-key.js`)
   - Update the production secret (`wrangler secret put SIGNING_KEY`)
   - Update local dev secret in `.dev.vars` (if applicable)

3. **What happens after rotation** (2-3 sentences, no speculation):
   - New captures are signed with the new key.
   - Existing captures signed with the old key will fail signature verification.
   - The `/.well-known/signing-key` endpoint serves the current public key. Third-party verifiers should re-fetch it after rotation.

4. **What is NOT supported yet** (1 sentence with backlog pointer):
   - Key versioning and old-key verification are not yet implemented. See `docs/backlog.md` under "Signing and Legal Admissibility."

### Content to exclude

- Detailed cache invalidation procedures (the cache behavior is an implementation detail; the user-facing fact is "old captures fail verification").
- Downtime window estimates (there is no real downtime -- the service stays up, only verification behavior changes).
- Multi-key management (does not exist yet).
- HSM or external key management guidance (backlog item, speculative).

## Documentation for `/.well-known/signing-key`

If this step introduces the well-known endpoint, add a brief section in the README explaining its purpose from the user/operator perspective:

- **What it is**: A public endpoint serving the current Ed25519 public key for independent, out-of-band verification.
- **Why it exists**: Third-party verifiers can fetch the key without trusting the `publicKey` embedded in individual WACZ bundles (which is informational only -- `wacz.js` line 99-100 explicitly states this).
- **How it relates to rotation**: Serves the current key only. After rotation, it reflects the new key immediately (or after the next deploy).

This should be kept to 3-4 sentences. It is reference information, not a tutorial.

## Risks and Dependencies

| Risk | Impact | Mitigation |
|------|--------|------------|
| Operator rotates key without understanding old captures break | All prior captures lose signature verification | Warning block BEFORE the rotation steps, not after |
| README documents `/.well-known/signing-key` before the endpoint exists in code | Incorrect documentation | Sync doc changes with the endpoint implementation in the same PR |
| Over-documenting theoretical rotation procedures | Misleading operators about capabilities that do not exist | Keep to "what works today" -- defer documentation of key versioning until it ships |

## Specialist Involvement

No additional specialists needed beyond what is already in scope. The security minion should validate that the rotation warning accurately reflects the verification behavior, and the implementation specialist should confirm the `/.well-known/signing-key` endpoint behavior before documentation is written.

## Summary

Document key rotation as a short how-to guide with a prominent warning about breaking old-capture verification. Include the commands, the immediate consequences, and what is not supported yet. Do not document workarounds for limitations that are explicitly deferred to post-MVP. Keep the `/.well-known/signing-key` description to a brief reference paragraph explaining its purpose for third-party verification.
