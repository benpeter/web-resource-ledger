## Task: Write unit tests for the verification core logic

Create `test/verify.test.js` with unit tests for the `verifyWacz` function from `src/verify.js`.

### Context

`verifyWacz(waczBytes, publicKeyBytes)` is a pure function that takes WACZ ZIP bytes and an Ed25519 public key, and returns a structured verification result with three checks: `artifactHashes`, `bundleHash`, and `signature`.

These tests construct WACZ byte arrays in-memory (using `fflate`'s `zipSync`) and generate fresh Ed25519 key pairs per test. No R2, no KV, no HTTP. Pure function tests.

### Test file structure

**File**: `test/verify.test.js`

**Imports**:
```js
import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { verifyWacz } from '../src/verify.js';
import { canonicalize } from '../src/canonical-json.js';
import { sha256 } from '../src/warc.js';
import { signBytes } from '../src/signing.js';
```

**Helper**: Build a minimal valid WACZ in-memory for testing. This helper mirrors the build path in `src/wacz.js`:

CRITICAL ADVISORY -- `signedData.hash` MUST use `bundleHash` (sha256 of canonical JSON of the datapackage object), NOT `dpHashOfBytes` (sha256 of the pretty-printed bytes). The plan's original helper had a bug here. The correct implementation:

```js
async function buildTestWacz(privateKey, publicKeyBytes) {
  const enc = new TextEncoder();

  // Minimal WARC content
  const warcBytes = enc.encode('WARC/1.1\r\ntest warc content');
  const cdxjBytes = enc.encode('test cdxj content');
  const pagesBytes = enc.encode('{"format":"json-pages-1.0"}\n');

  // Compute hashes
  const warcHash = await sha256(warcBytes);
  const cdxjHash = await sha256(cdxjBytes);
  const pagesHash = await sha256(pagesBytes);

  // datapackage.json
  const datapackage = {
    profile: 'data-package',
    wacz_version: '1.1.1',
    resources: [
      { name: 'data.warc', path: 'archive/data.warc', hash: warcHash, bytes: warcBytes.byteLength },
      { name: 'index.cdxj', path: 'indexes/index.cdxj', hash: cdxjHash, bytes: cdxjBytes.byteLength },
      { name: 'pages.jsonl', path: 'pages/pages.jsonl', hash: pagesHash, bytes: pagesBytes.byteLength },
    ],
  };

  const dpBytes = enc.encode(JSON.stringify(datapackage, null, 2));

  // bundleHash = sha256 of CANONICAL JSON (sorted keys, no whitespace)
  // This is what signedData.hash must be -- NOT sha256 of the pretty-printed bytes
  const bundleHash = await sha256(enc.encode(canonicalize(datapackage)));

  // Sign the bundleHash string
  const signature = await signBytes(privateKey, enc.encode(bundleHash));

  // Public key as base64
  const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));

  // datapackage-digest.json
  const dpHashOfBytes = await sha256(dpBytes);
  const digestDoc = {
    path: 'datapackage.json',
    hash: dpHashOfBytes,
    signedData: {
      hash: bundleHash,  // <-- THIS IS bundleHash (canonical), NOT dpHashOfBytes (pretty-printed)
      signature,
      publicKey: publicKeyBase64,
      created: new Date().toISOString(),
      software: 'WRL/0.1',
      version: '0.1.0',
    },
  };

  const digestBytes = enc.encode(JSON.stringify(digestDoc, null, 2));

  // ZIP everything (STORE mode)
  const waczBytes = zipSync({
    'datapackage.json': [dpBytes, { level: 0 }],
    'datapackage-digest.json': [digestBytes, { level: 0 }],
    'archive/data.warc': [warcBytes, { level: 0 }],
    'indexes/index.cdxj': [cdxjBytes, { level: 0 }],
    'pages/pages.jsonl': [pagesBytes, { level: 0 }],
  });

  return { waczBytes, datapackage, dpBytes, digestDoc, digestBytes, warcBytes, cdxjBytes, pagesBytes };
}
```

Generate key pair in a `beforeAll` or at test scope:
```js
const { privateKey, publicKey } = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const exported = await crypto.subtle.exportKey('raw', publicKey);
const publicKeyBytes = new Uint8Array(exported);
```

### Tests to write

**describe('verifyWacz -- happy path')**:
1. `valid WACZ with correct key returns verified: true` -- build test WACZ, verify with same key, assert `verified: true` and all checks `'pass'`.
2. `result contains all three checks` -- verify the checks array has exactly 3 entries with names `artifactHashes`, `bundleHash`, `signature`.
3. `result includes capture metadata` -- verify the `capture` field contains `bundleHash`, `signature`, `publicKey`, `signedAt`.

**describe('verifyWacz -- tamper detection')**:
4. `corrupted artifact fails artifactHashes check` -- build valid WACZ, unzip, modify one inner file (append a byte to `archive/data.warc`), re-zip. Verify returns `verified: false` with `artifactHashes: 'fail'` but `bundleHash: 'pass'` and `signature: 'pass'`.
5. `modified datapackage.json fails bundleHash check` -- build valid WACZ, unzip, parse datapackage.json, change a field (e.g., add a resource), re-stringify and re-zip (but keep the original `datapackage-digest.json`). Verify returns `bundleHash: 'fail'`.
6. `wrong public key fails signature check` -- build WACZ signed with key A, verify with key B. Should return `artifactHashes: 'pass'`, `bundleHash: 'pass'`, `signature: 'fail'`.
7. `key substitution attack detected` -- build a WACZ, then re-sign it with a different key pair (replace signature and embedded publicKey in `datapackage-digest.json`), re-zip. Verify with the ORIGINAL server key. Signature check must fail. This is the critical security test.

**describe('verifyWacz -- error handling')**:
8. `garbage bytes (not a ZIP) returns all checks failed` -- pass random bytes, assert `verified: false` and all checks are `'fail'`.
9. `ZIP missing datapackage.json returns checks failed` -- build a ZIP without `datapackage.json`.
10. `ZIP missing datapackage-digest.json returns checks failed` -- build a ZIP without `datapackage-digest.json`.

**describe('verifyWacz -- security')**:
11. `detail messages never contain hash values` -- for every failed check across tests 4-10, assert that `detail` does not match `/sha256:[0-9a-f]+/` or contain the word "expected" or "actual".
12. `all checks run even when earlier check fails` -- when artifactHashes fails, bundleHash and signature checks should still have a status (not be missing from the array).

### Important notes

- For test 4 (corrupted artifact): do NOT flip random bytes in the ZIP file. Instead: unzip with `unzipSync`, modify the inner file content, re-zip with `zipSync`. This ensures the ZIP is still valid but the inner file hash no longer matches.
- For test 7 (key substitution): this is the most important security test. Generate TWO key pairs. Build WACZ with key A. Then reconstruct `datapackage-digest.json` using key B's signature and key B's public key. Re-zip. Pass the original key A as the verification key. The signature check MUST fail because the signature was made with key B but verification uses key A.
- Use `crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])` for key generation, same pattern as `test/wacz.test.js`.
- Read `src/verify.js` and `src/wacz.js` first to understand the exact data flow.

### What NOT to do

- Do NOT write integration tests (Task 4 handles those).
- Do NOT modify any source files.
- Do NOT test HTTP endpoints, KV, or R2.
- Do NOT import from `cloudflare:test` -- these are pure function tests.

### Deliverables

- `test/verify.test.js` with ~12 unit tests

### Success criteria

- All tests pass when run with `npx vitest run test/verify.test.js`
- Tamper detection tests prove each of the three checks catches the specific failure mode
- Key substitution attack test proves server-key-only verification
- No test contains hardcoded hash values

### Advisory incorporated
- [testing] FIX buildTestWacz helper -- signedData.hash must be set to bundleHash (sha256 of canonical JSON), NOT dpHashOfBytes (sha256 of pretty-printed bytes). The plan's original helper had this wrong.

When you finish, mark task #3 completed with TaskUpdate and send a message to the team lead with file paths, change scope, and line counts.
