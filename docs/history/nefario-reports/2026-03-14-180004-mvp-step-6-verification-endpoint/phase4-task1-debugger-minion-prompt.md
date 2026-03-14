## Task: Implement verification core logic

Create `src/verify.js` -- a pure verification module that takes WACZ bytes and a public key, and returns a structured verification result.

### Context

This is part of the public verification endpoint (`GET /v1/verify/{id}`) for the web resource ledger. The endpoint proves a stored capture is authentic by recomputing hashes and verifying the Ed25519 signature. You are implementing the pure verification logic that will be called by the HTTP handler.

### What to build

**File**: `src/verify.js`

**Export**: `verifyWacz(waczBytes, publicKeyBytes)` -- a pure async function.

**Input**:
- `waczBytes`: `Uint8Array` -- the raw WACZ ZIP file bytes from R2
- `publicKeyBytes`: `Uint8Array` -- the server's 32-byte Ed25519 public key (from `getSigningKeys(env)`)

**Output**: An object with this shape:
```js
{
  verified: true | false,
  checks: [
    { name: 'artifactHashes', status: 'pass' | 'fail' | 'skip', detail?: string },
    { name: 'bundleHash', status: 'pass' | 'fail' | 'skip', detail?: string },
    { name: 'signature', status: 'pass' | 'fail' | 'skip', detail?: string },
  ],
  // Only present when WACZ is valid enough to extract:
  capture?: { bundleHash, signature, publicKey, signedAt },
}
```

`verified` is `true` if and only if all checks have `status: 'pass'`.
`detail` is only present on failed checks. It is human-readable, never includes actual hash values or expected vs actual comparisons.

### Verification steps (in order)

1. **Parse ZIP**: Use `unzipSync` from `fflate` (already a dependency). **CRITICAL: Wrap `unzipSync` in a try/catch.** `fflate`'s `unzipSync` throws an `Error` on malformed input -- it does NOT return null. If the catch fires, return all checks as `'fail'` with `detail: 'WACZ bundle is not a valid ZIP archive'`.

2. **Extract files**: Get `datapackage.json` and `datapackage-digest.json` from the ZIP. If either is missing, return appropriate failures.

3. **Check: artifactHashes**: For each resource in `datapackage.json.resources[]`, find the corresponding file in the ZIP at `resource.path`, compute its SHA-256 hash, and compare to `resource.hash`. If ANY resource hash mismatches, the check fails. Use generic detail: `'One or more artifact hashes do not match'` -- do NOT identify which artifact failed (security requirement: prevents attacker from knowing which file to fix).

4. **Check: bundleHash**: Recompute `sha256(canonicalize(datapackage))` where `datapackage` is the parsed JSON object from `datapackage.json`. Compare to `signedData.hash` in `datapackage-digest.json`. Use `canonicalize` from `./canonical-json.js` and `sha256` from `./warc.js`. Detail on failure: `'Recomputed hash does not match stored bundleHash'`.

5. **Check: signature**: Verify the Ed25519 signature from `signedData.signature` over the UTF-8 bytes of `signedData.hash` (the bundleHash string) using the provided `publicKeyBytes` parameter. Use `verifySignature` from `./signing.js`. Detail on failure: `'Ed25519 signature verification failed'`.

### CRITICAL security decisions

- **Server key ONLY**: The `publicKeyBytes` parameter comes from `getSigningKeys(env)` -- the server's own key. The embedded `signedData.publicKey` in the WACZ is returned in the `capture` field for informational purposes but is NEVER used for the verification decision. This prevents key-substitution attacks where an attacker replaces both the signature and the embedded key.

- **No hash values in details**: Failed check `detail` messages must NEVER include the expected or actual hash values. Generic messages only. This prevents attackers from learning the target hash.

- **Run all checks**: Even if an earlier check fails, continue running subsequent checks. The response should show the status of all three checks, not short-circuit on the first failure.

### Dependencies to import

```js
import { unzipSync } from 'fflate';
import { canonicalize } from './canonical-json.js';
import { sha256 } from './warc.js';
import { verifySignature } from './signing.js';
```

### Reference: how the WACZ is built

See `src/wacz.js` for the build-time mirror of this verification logic:
- `datapackage.json` is pretty-printed in the ZIP but `bundleHash` is computed over `canonicalize(datapackage)` (the canonical, sorted, no-whitespace form)
- `signedData.hash` in `datapackage-digest.json` contains the bundleHash string `"sha256:{hex}"`
- `signedData.signature` is the Ed25519 signature over the UTF-8 bytes of that bundleHash string
- `signedData.publicKey` is the base64-encoded 32-byte public key (informational only)
- `signedData.created` is the signing timestamp

### What NOT to do

- Do NOT add any HTTP handling, routing, or response formatting. This is a pure function.
- Do NOT read from KV or R2. The caller provides the bytes.
- Do NOT import or use `getSigningKeys`. The caller provides the public key bytes.
- Do NOT add rate limiting or caching logic.
- Do NOT add error handling for oversized WACZ files (the handler does that).
- Do NOT create test files (Task 3 handles tests).

### Deliverables

- `src/verify.js` with the `verifyWacz` export

### Success criteria

- `verifyWacz(validWaczBytes, correctPublicKey)` returns `{ verified: true, checks: [...all pass...] }`
- `verifyWacz(tamperedWaczBytes, correctPublicKey)` returns `{ verified: false, checks: [...identifies which check failed...] }`
- `verifyWacz(validWaczBytes, wrongPublicKey)` returns `{ verified: false, checks: [...signature fail...] }`
- `verifyWacz(garbageBytes, anyKey)` returns `{ verified: false, checks: [...all fail...] }`
- No hash values appear in any `detail` string
- All three checks always appear in the result, even when earlier checks fail

### Advisory incorporated
- [security] `unzipSync` must be wrapped in try/catch -- fflate throws on malformed input, not returns null. An unhandled throw propagates to the handler as a 500 instead of the intended `verified: false`.
