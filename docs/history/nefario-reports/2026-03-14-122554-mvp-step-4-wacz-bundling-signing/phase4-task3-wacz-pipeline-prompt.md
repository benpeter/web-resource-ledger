## Task: WACZ Construction Pipeline

Working directory: /Users/ben/github/benpeter/web-resource-ledger

### Context
You are building the core WACZ bundling pipeline for a Cloudflare Worker. This takes in-memory capture artifacts (screenshot PNG, rendered HTML, HTTP headers JSON) and produces a signed WACZ ZIP file. The Ed25519 spike test (Task 1) confirmed that standard Web Crypto `'Ed25519'` works in workerd -- use that directly (no NODE-ED25519, no node:crypto fallback needed for signing). The canonical JSON module (Task 2) is available at `src/canonical-json.js`.

The project uses vanilla JS, Cloudflare Workers with `nodejs_compat`, and follows YAGNI/KISS principles.

**Key design decisions already made:**
- Do NOT use warcio.js (incompatible dependencies: hash-wasm, tempy, pako)
- Use `fflate` for ZIP construction (add as dependency)
- Uncompressed WARC (`archive/data.warc`, NOT `.warc.gz`) -- simplifies pipeline, no gzip needed
- Uncompressed CDXJ index (`indexes/index.cdxj`, NOT `.cdx.gz`)
- Signatures go in `datapackage-digest.json` (per WACZ-Auth spec), NOT in `datapackage.json`
- Ed25519 via Web Crypto standard `'Ed25519'` algorithm with PKCS8 key import
- SIGNING_KEY stored as base64-encoded PKCS8 DER (48 bytes)
- ZIP uses `fflate.zipSync()` with level 0 (STORE mode) for all files
- Graceful degradation: if signing fails, skip WACZ (don't fail the capture)

### What to do

**Step 1: Add fflate dependency**
```bash
npm install fflate
```

**Step 2: Create `src/signing.js`** -- Ed25519 signing module

Functions to export:
- `getSigningKeys(env)` -- lazily imports and caches (module-scoped) the private CryptoKey and derived public key bytes from `env.SIGNING_KEY`. Returns `{ privateKey, publicKeyBytes }` or `null` if SIGNING_KEY is not configured.
  - Decode base64 SIGNING_KEY to get PKCS8 DER bytes
  - `crypto.subtle.importKey('pkcs8', pkcs8Bytes, 'Ed25519', true, ['sign'])`
  - To derive the public key bytes, use `node:crypto` (available via nodejs_compat):
    ```javascript
    import { createPrivateKey, createPublicKey } from 'node:crypto';
    const privKeyObj = createPrivateKey({ key: Buffer.from(pkcs8Bytes), format: 'der', type: 'pkcs8' });
    const pubKeyObj = createPublicKey(privKeyObj);
    const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' });
    // Ed25519 SPKI DER: 12-byte header (302a300506032b6570032100) + 32-byte raw key
    const publicKeyBytes = new Uint8Array(spkiDer.buffer, spkiDer.byteOffset + 12, 32);
    ```
  - **IMPORTANT (advisory from security review)**: After stripping the SPKI header, assert that `publicKeyBytes.length === 32`. If not 32 bytes, throw an error (caught by the outer null-return wrapper). Add a comment documenting the expected SPKI prefix hex: `302a300506032b6570032100`.
  - Cache in module-scoped variables
  - **IMPORTANT (advisory from security review -- key rotation)**: Cache the base64 `env.SIGNING_KEY` string alongside the derived CryptoKey objects. On each call to `getSigningKeys(env)`, compare `env.SIGNING_KEY` to the cached string. If they differ, re-import and update both cached values. This handles key rotation without requiring an isolate restart.
  - SECURITY: env.SIGNING_KEY is accessed here and nowhere else
  - No console.log anywhere in this module
  - Catch all errors, return null on any failure (log "Signing key validation failed" only -- use console.warn, not console.log)

- `signBytes(privateKey, data)` -- signs a Uint8Array with the private CryptoKey, returns base64 signature string
  - `crypto.subtle.sign('Ed25519', privateKey, data)` -> base64 encode result

- `verifySignature(publicKeyBytes, data, signatureBase64)` -- for testing; imports public key, verifies
  - `crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', true, ['verify'])`
  - `crypto.subtle.verify('Ed25519', pubKey, signature, data)` -> boolean

**Step 3: Create `src/warc.js`** -- WARC record construction

Build WARC/1.1 records manually (~100 lines). Each record:
```
WARC/1.1\r\n
WARC-Type: {type}\r\n
WARC-Record-ID: <urn:uuid:{uuid}>\r\n
WARC-Target-URI: {url}\r\n
WARC-Date: {iso8601}\r\n
Content-Type: {mime}\r\n
Content-Length: {byteLength}\r\n
\r\n
{content bytes}\r\n
\r\n
```

Functions to export:
- `buildWarc(url, captureDate, artifacts)` -- takes `{ screenshot: Uint8Array, html: string, headers: object|null }` and returns `{ warcBytes: Uint8Array, recordMeta: Array }` where recordMeta contains `{ url, offset, length, mime, digest }` per record (needed for CDXJ)

Record types and order:
1. `warcinfo` record: `Content-Type: application/warc-fields`, body = `software: WRL/0.1\r\nformat: WARC/1.1\r\n`
2. `resource` record for rendered HTML: `Content-Type: text/html; charset=utf-8`, `WARC-Target-URI: {url}`
3. `metadata` record for headers (if present): `Content-Type: application/json`, `WARC-Target-URI: {url}`, `WARC-Refers-To: {html record ID}`
4. `resource` record for screenshot: `Content-Type: image/png`, `WARC-Target-URI: urn:wrl:screenshot:{url}`

Use `crypto.randomUUID()` for `WARC-Record-ID`.
Use `crypto.subtle.digest('SHA-256', payload)` to compute per-record payload digests for CDXJ.
Track byte offsets as records are concatenated (needed for CDXJ).
Encode strings as UTF-8 via `TextEncoder`.

**Step 4: Create `src/cdxj.js`** -- CDXJ index generation

Function to export:
- `buildCdxj(recordMeta, filename)` -- takes the recordMeta array from buildWarc and the WARC filename (`archive/data.warc`), returns CDXJ string

CDXJ line format:
```
<SURT-URL> <14-digit-timestamp> <JSON-block>
```

- SURT transform: `https://example.com/path` -> `com,example)/path` (drop scheme, reverse hostname, append `)`, keep path)
- Timestamp: `YYYYMMDDHHmmss` (14-digit compact)
- JSON block: `{"url":"...","mime":"...","status":"200","digest":"sha256:...","offset":N,"length":N,"filename":"archive/data.warc"}`
- Skip warcinfo records (no target URI)
- Sort lines lexicographically
- For resource records, status = `"200"`. For metadata records, status = `"-"`.

**Step 5: Create `src/wacz.js`** -- WACZ assembly orchestrator

Function to export:
- `buildWacz(url, captureDate, artifacts, env)` -- the main entry point

Flow:
1. Get signing keys: `getSigningKeys(env)` -- if null, return null (graceful degradation)
2. Build WARC: `buildWarc(url, captureDate, artifacts)` -> `{ warcBytes, recordMeta }`
3. Build CDXJ: `buildCdxj(recordMeta, 'archive/data.warc')` -> cdxjString
4. Build pages.jsonl:
   ```
   {"format":"json-pages-1.0","id":"pages","title":"All Pages"}
   {"url":"<captured url>","ts":"<ISO 8601 captureDate>","title":"WRL capture"}
   ```
5. Compute SHA-256 hash of each file (warcBytes, cdxjBytes, pagesBytes) -- inline the SHA-256 helper directly in this file as a local function (**advisory from margo**: do NOT create a separate `src/hash.js` module for a 3-line function):
   ```javascript
   async function sha256(data) {
     const hash = await crypto.subtle.digest('SHA-256', data);
     return 'sha256:' + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
   }
   ```
   Format: `sha256:{lowercase hex}`
6. Assemble `datapackage.json`:
   ```json
   {
     "profile": "data-package",
     "wacz_version": "1.1.1",
     "title": "WRL capture of <url>",
     "software": "WRL/0.1",
     "created": "<captureDate ISO>",
     "mainPageUrl": "<url>",
     "mainPageDate": "<captureDate ISO>",
     "resources": [
       { "name": "data.warc", "path": "archive/data.warc", "hash": "sha256:...", "bytes": N },
       { "name": "index.cdxj", "path": "indexes/index.cdxj", "hash": "sha256:...", "bytes": N },
       { "name": "pages.jsonl", "path": "pages/pages.jsonl", "hash": "sha256:...", "bytes": N }
     ]
   }
   ```
7. Compute bundleHash: `sha256(canonicalize(datapackage))` using the canonical JSON module
8. **IMPORTANT (advisory from security review -- signed payload clarity)**: Sign the UTF-8 bytes of the hash string `"sha256:{hex}"`. Add an explicit code comment: `// Signed payload: UTF-8 bytes of the bundleHash string "sha256:{hex}"`. The exact byte sequence being signed must be unambiguous.
   `signBytes(privateKey, new TextEncoder().encode(bundleHash))`
9. Assemble `datapackage-digest.json`:
   ```json
   {
     "path": "datapackage.json",
     "hash": "sha256:<hex of datapackage.json bytes>",
     "signedData": {
       "hash": "sha256:<hex of canonical datapackage.json>",
       "signature": "<base64 Ed25519 signature>",
       "publicKey": "<base64 raw 32-byte public key>",
       "created": "<captureDate ISO>",
       "software": "WRL/0.1",
       "version": "0.1.0"
     }
   }
   ```
   **IMPORTANT (advisory from security review -- publicKey trust)**: Add a code comment near the publicKey embedding: `// NOTE: publicKey is embedded for convenience only. Verifiers MUST pin against an operator-published key, not trust the embedded key blindly.`
10. Create ZIP via `fflate.zipSync()`:
    ```javascript
    import { zipSync } from 'fflate';
    const waczBytes = zipSync({
      'datapackage.json': [dpBytes, { level: 0 }],
      'datapackage-digest.json': [digestBytes, { level: 0 }],
      'archive/data.warc': [warcBytes, { level: 0 }],
      'indexes/index.cdxj': [cdxjBytes, { level: 0 }],
      'pages/pages.jsonl': [pagesBytes, { level: 0 }],
    });
    ```
    Use level 0 (STORE) for ALL files. Deterministic output. No compression.
11. Compute SHA-256 of the final waczBytes for the content-addressed R2 key
12. Return `{ waczBytes, waczHash, bundleHash, publicKeyBase64 }`

### What NOT to do
- Do NOT create `src/hash.js` as a separate module -- inline the SHA-256 helper in wacz.js
- Do NOT modify `src/capture.js` or `src/kv.js` -- pipeline integration is a separate task
- Do NOT modify existing test files
- Do NOT use TypeScript
- Do NOT use warcio.js, pako, hash-wasm, jszip, or archiver
- Do NOT compress WARC files with gzip -- use uncompressed `data.warc`
- Do NOT put signatures in `datapackage.json` -- they go in `datapackage-digest.json`
- Do NOT add console.log to `src/signing.js` (console.warn for the one error case is fine)

### Existing patterns to follow
- Module-scoped caching: see signing.js key rotation pattern above
- Error handling: see `src/capture.js` for try/catch patterns
- File naming: existing files are `src/capture.js`, `src/kv.js`, `src/auth.js` -- follow same style

### Deliverables
1. `src/signing.js` -- Ed25519 signing module (lazy key import with rotation detection, sign, verify)
2. `src/warc.js` -- WARC record construction
3. `src/cdxj.js` -- CDXJ index generation
4. `src/wacz.js` -- WACZ assembly orchestrator (with inlined sha256 helper)
5. Updated `package.json` with fflate dependency

### Success criteria
- All new modules export the documented functions
- No console.log in signing.js (console.warn only for validation failure)
- fflate is the only new dependency added
- WARC records follow WARC/1.1 format with correct line endings (\r\n)
- ZIP uses STORE mode (level 0) for all entries
- Derived public key validated as exactly 32 bytes
- Key rotation detection: cached key string compared on each call
- Signed payload clearly documented in code comments
- publicKey trust caveat documented in code comments
