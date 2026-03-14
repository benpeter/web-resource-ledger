## Task: Ed25519 Spike Test and Key Generation Script

Working directory: /Users/ben/github/benpeter/web-resource-ledger

### Context
You are implementing the first step of WACZ bundling for a Cloudflare Worker (web-resource-ledger). The project uses vanilla JS (no TypeScript), `@cloudflare/vitest-pool-workers` for testing, and has `nodejs_compat` enabled. All signing work depends on confirming which Ed25519 API works in the Workers/workerd runtime.

The project's `vitest.config.js` uses Miniflare with `isolatedStorage: false`. Tests run in the actual workerd runtime via `@cloudflare/vitest-pool-workers`.

### What to do

**Part A: Spike test file** -- Create `test/signing.test.js` with tests that validate Ed25519 operations work in the workerd runtime:

1. `crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])` -- generates a key pair
2. `crypto.subtle.sign('Ed25519', privateKey, data)` -- signs arbitrary data
3. `crypto.subtle.verify('Ed25519', publicKey, signature, data)` -- verifies signature returns true
4. Tampered data verification -- returns false
5. PKCS8 key import round-trip: export private key as PKCS8 -> re-import with `importKey('pkcs8', ...)` -> sign -> verify with original public key
6. Raw public key export and re-import: `exportKey('raw', publicKey)` -> `importKey('raw', ..., 'Ed25519', true, ['verify'])` -> verify

If the standard `'Ed25519'` algorithm name fails, try `{ name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' }` as fallback. Document which works in a code comment.

**Part B: Key generation script** -- Create `scripts/generate-signing-key.js`:
- A standalone Node.js script (runs locally, NOT in Workers)
- Uses `crypto.generateKeyPairSync('ed25519')` (Node.js native)
- Exports private key as PKCS8 DER, base64-encodes it
- Exports public key as raw 32 bytes, base64-encodes it
- **IMPORTANT (advisory from ux-strategy review)**: The output must put actionable instructions FIRST, with the public key LAST (or annotated as informational). The operator's action flow should not be interrupted by information they can't act on immediately. Recommended output order:
  ```
  === WRL Signing Key Generator ===

  Private key (PKCS8 DER, base64) -- for wrangler secret:
  <base64 string>

  To set the signing key:
    wrangler secret put SIGNING_KEY    (paste the private key above)

  For local development, add to .dev.vars:
    SIGNING_KEY=<base64 string>

  Public key (raw, base64) -- embedded in every signed WACZ automatically:
  <base64 string>
  ```
- The script must NOT write any files (keys only go to stdout)
- Add a shebang line (`#!/usr/bin/env node`)

**Part C: Update vitest.config.js** -- Add a test `SIGNING_KEY` binding to the Miniflare config:
- **IMPORTANT (advisory from security review)**: Do NOT hardcode a fixed PKCS8 DER base64 key in the committed file. Instead, generate the test key EPHEMERALLY at vitest.config.js load time using `node:crypto`'s `generateKeyPairSync('ed25519')`:
  ```javascript
  import { generateKeyPairSync } from 'node:crypto';
  const { privateKey } = generateKeyPairSync('ed25519');
  const testSigningKey = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  ```
  Then use `testSigningKey` as the binding value. Add a comment explaining why the key is ephemeral ("test key generated at load time -- no key material committed to VCS").
- Place it next to the existing `CAPTURE_API_KEY` binding

**Advisory note (from test-minion)**: Be aware that adding a global SIGNING_KEY means WACZ bundling will silently run during all 17 existing capture tests. The content-addressed .wacz objects at `captures/{sha256}.wacz` won't be cleaned up by existing test beforeEach hooks. This is acceptable for now -- Task 4 will add proper cleanup. No action needed here, just awareness.

### What NOT to do
- Do NOT implement the signing module (`src/signing.js`) yet -- that is a separate task
- Do NOT modify any existing source files in `src/`
- Do NOT add any npm dependencies
- Do NOT use TypeScript
- Do NOT implement WARC, CDXJ, or WACZ logic

### Existing patterns to follow
- Look at `test/capture.test.js` for test structure (describe blocks, beforeEach cleanup)
- Look at `vitest.config.js` for existing Miniflare binding configuration
- Use `import { env } from 'cloudflare:test'` for accessing bindings in tests

### Deliverables
1. `test/signing.test.js` -- Ed25519 spike tests (6+ test cases)
2. `scripts/generate-signing-key.js` -- Key generation script
3. Updated `vitest.config.js` with ephemeral SIGNING_KEY binding

### Success criteria
- `vitest run test/signing.test.js` passes -- Ed25519 works in workerd
- `node scripts/generate-signing-key.js` outputs a valid keypair
- The SIGNING_KEY binding in vitest.config.js is generated at load time (not committed key material)
- A code comment documents which Ed25519 algorithm name works
