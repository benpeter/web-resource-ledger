# Phase 3: Synthesis -- MVP Step 4: WACZ Bundling and Signing

## Conflict Resolutions

### Conflict 1: WARC compression (data.warc.gz vs data.warc)

**edge-minion** recommends uncompressed `data.warc` (simpler, no gzip dependency, store-mode ZIP makes gzip redundant). **data-minion** recommends `data.warc.gz` (WACZ spec compliance, uses native CompressionStream).

**Resolution: Use uncompressed `data.warc`.** Rationale:
- WACZ spec does not mandate gzip compression of the WARC file. It requires a WARC file at `archive/data.warc` or `archive/data.warc.gz` -- both are valid.
- The ZIP itself is STORE mode (no compression), so gzip would add value, but at the cost of gzip determinism concerns (Risk 6 from data-minion) and additional complexity (CompressionStream piping to collect bytes).
- KISS principle applies: uncompressed WARC is simpler to construct, debug, and test. One fewer moving part.
- The CDXJ index filename and hash path update accordingly: `archive/data.warc` instead of `archive/data.warc.gz`.
- Similarly, the CDXJ index itself will be uncompressed: `indexes/index.cdxj` not `indexes/index.cdx.gz`. This eliminates all gzip from the pipeline.

### Conflict 2: Signature location (datapackage.json vs datapackage-digest.json)

**data-minion** recommends `datapackage-digest.json` (per WACZ-Auth spec). **Issue #4** says signatures array in `datapackage.json`.

**Resolution: Use `datapackage-digest.json`.** Rationale:
- data-minion did the spec research and WACZ-Auth 0.1.0 clearly specifies a separate `datapackage-digest.json` file containing the hash and signature.
- The issue was written before spec research and explicitly says the signatures structure should accommodate RFC 3161 timestamps. The `datapackage-digest.json` approach does exactly that -- the `signedData` object can grow without changing `datapackage.json`.
- Keeping `datapackage.json` clean per WACZ 1.1.1 means standard WACZ tools can parse the manifest even if they do not understand our Ed25519 signing.
- The issue's acceptance criteria say "signing round-trip test passes" -- this is achievable regardless of which file holds the signature.

### Conflict 3: Ed25519 API approach

**security-minion** recommends `node:crypto`. **data-minion** recommends PKCS8 DER wrapping for Web Crypto. **edge-minion** recommends standard `Ed25519` Web Crypto. **test-minion** says `crypto.subtle.generateKey('Ed25519')` works in workerd.

**Resolution: Start with Web Crypto `Ed25519` (standard Secure Curves API) with PKCS8 import, fall back to `node:crypto` if spike fails.** Rationale:
- test-minion states that `crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify'])` works in the workerd runtime used by Miniflare/vitest-pool-workers. This is the strongest signal because it is based on the actual runtime we test against.
- However, `generateKey` may work in workerd but NOT in production Workers (security-minion's concern about fragmented support). We need `importKey` (not `generateKey`) since keys are externally generated.
- The spike test (Task 1) will validate `importKey` with PKCS8 format. All three non-test specialists agree PKCS8 is needed -- raw import won't work.
- Key storage format: store as base64-encoded PKCS8 DER (48 bytes = 16-byte ASN.1 prefix + 32-byte seed). This avoids runtime DER wrapping -- the key is already in the right format. The generate-key script outputs PKCS8 directly.
- If Web Crypto `Ed25519` `importKey('pkcs8')` fails in the spike, fall back to `node:crypto` (which is available via `nodejs_compat`).

### Conflict 4: WACZ failure handling (fail capture vs graceful degradation)

**security-minion** says captures MUST fail if signing fails -- unsigned bundles violate the value proposition. **edge-minion** says graceful degradation -- capture completes, WACZ is skipped, individual artifacts still available.

**Resolution: Graceful degradation for MVP, with clear signaling.** Rationale:
- The capture pipeline already stores individual artifacts (screenshot, HTML, headers) in R2 before WACZ bundling. These have independent value -- a capture without WACZ is still useful for status checks and retrieval (Step 5).
- security-minion's concern about "unsigned bundles stored" is valid, but the resolution is not to fail the whole capture -- it is to not store an unsigned WACZ. If signing fails, skip the WACZ entirely. The individual artifacts are not signed and were never claimed to be.
- Mark KV status as `complete` with `wacz.status: 'failed'` so the operator can see which captures lack a WACZ. This is the edge-minion's recommendation and is operationally sound.
- The existing 17 capture tests do not provide `SIGNING_KEY`. Making WACZ mandatory would break them all. Adding `SIGNING_KEY` to the global test config is a partial fix, but production resilience matters too -- a misconfigured secret should not prevent all captures.
- YAGNI: strict signing enforcement is a post-MVP concern. When the verification endpoint (Step 6) exists, captures without WACZ will naturally be non-verifiable, which is the correct degradation behavior.

### Conflict 5: Key format storage

**Issue** says "base64-encoded raw 32 bytes." **security-minion** and **data-minion** agree raw import won't work. **edge-minion** suggests JWK.

**Resolution: Store as base64-encoded PKCS8 DER (48 bytes).** Rationale:
- PKCS8 DER is the format that `crypto.subtle.importKey('pkcs8', ...)` accepts directly. No runtime transformation needed.
- JWK would also work but is a larger string and requires JSON parsing at import time. PKCS8 DER is more compact and directly consumable.
- The key generation script will output the base64 string ready for `wrangler secret put SIGNING_KEY`. The operator never needs to understand PKCS8 internals.
- The 48 bytes = fixed 16-byte ASN.1 header (`302e020100300506032b657004220420` hex) + 32-byte Ed25519 seed.

## Delegation Plan

**Team name**: wacz-bundling
**Description**: Implement WACZ bundling and Ed25519 signing for the capture pipeline -- construct WARC records, build CDXJ index, compute hashes, assemble signed manifest, write .wacz ZIP to R2, update KV metadata.

### Task 1: Ed25519 spike test and key generation script
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Ed25519 API availability determines the signing approach for all downstream tasks. If the spike fails, the plan must pivot (to node:crypto or @noble/ed25519). Hard to reverse, high blast radius (4 downstream tasks depend on this).
- **Prompt**: |
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
    - Prints both to stdout with clear instructions:
      ```
      === WRL Signing Key Generator ===

      Private key (PKCS8 DER, base64) -- for wrangler secret:
      <base64 string>

      Public key (raw, base64) -- for reference/verification:
      <base64 string>

      To set the signing key:
        wrangler secret put SIGNING_KEY    (paste the private key above)

      For local development, add to .dev.vars:
        SIGNING_KEY=<base64 string>
      ```
    - The script must NOT write any files (keys only go to stdout)
    - Add a shebang line (`#!/usr/bin/env node`)

    **Part C: Update vitest.config.js** -- Add a test `SIGNING_KEY` binding to the Miniflare config:
    - Generate a PKCS8 DER base64 test key using the same approach as the script
    - Add it as a fixed binding value (reproducible across test runs)
    - Place it next to the existing `CAPTURE_API_KEY` binding

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
    3. Updated `vitest.config.js` with SIGNING_KEY binding

    ### Success criteria
    - `vitest run test/signing.test.js` passes -- Ed25519 works in workerd
    - `node scripts/generate-signing-key.js` outputs a valid keypair
    - The SIGNING_KEY binding value in vitest.config.js is a valid PKCS8 DER base64 string
- **Deliverables**: `test/signing.test.js`, `scripts/generate-signing-key.js`, updated `vitest.config.js`
- **Success criteria**: All spike tests pass; key generation script runs; a code comment documents which Ed25519 algorithm name works

### Task 2: Canonical JSON module and tests
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Canonical JSON Module and Tests

    Working directory: /Users/ben/github/benpeter/web-resource-ledger

    ### Context
    You are implementing canonical JSON serialization for the WACZ signing pipeline. The `bundleHash` (SHA-256 of the manifest) must be deterministic -- identical input always produces identical bytes. This is a pure function with no dependencies.

    The project uses vanilla JS (no TypeScript, no frameworks). Tests use `@cloudflare/vitest-pool-workers`.

    ### What to do

    **Part A: Create `src/canonical-json.js`**

    Implement a `canonicalize(obj)` function that:
    - Recursively sorts object keys lexicographically (default JS sort -- UTF-16 code unit order)
    - Produces JSON with no whitespace (no spaces, no newlines)
    - Handles nested objects, arrays, strings, numbers, booleans, null
    - Arrays preserve element order (do not sort array contents)
    - Export as a named export

    Reference implementation (~5 lines):
    ```javascript
    export function canonicalize(obj) {
      if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
      if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
      const keys = Object.keys(obj).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
    }
    ```

    Keep it simple. No special handling for undefined, BigInt, Symbol, Date -- these are not valid in our manifests. No dependency on any library.

    **Part B: Create `test/canonical-json.test.js`**

    Test cases to include:
    1. Top-level key sorting: `{b:1, a:2}` -> `{"a":2,"b":1}`
    2. Nested object key sorting: `{z: {b:1, a:2}}` -> `{"z":{"a":2,"b":1}}`
    3. Different construction order produces identical output (the fundamental determinism guarantee): create two objects with the same keys added in different orders, assert `canonicalize(a) === canonicalize(b)`
    4. Arrays preserve element order: `[3,1,2]` stays `[3,1,2]`
    5. Mixed-type arrays: `[1, "two", null, {"b":2,"a":1}]`
    6. Null values: `{a: null}` -> `{"a":null}`
    7. Empty objects and arrays: `{}` -> `{}`, `[]` -> `[]`
    8. No whitespace in output: assert output contains no spaces or newlines
    9. Output is valid JSON: `JSON.parse(canonicalize(input))` succeeds and round-trips
    10. Unicode strings: `{"\u00e9": "caf\u00e9"}` produces consistent output
    11. Number representation: `1` stays `1`, `1.5` stays `1.5`
    12. String escaping: strings containing `"`, `\`, control characters

    ### What NOT to do
    - Do NOT handle BigInt, Symbol, undefined, Date, or Infinity -- these will never appear in our manifests
    - Do NOT test deeply nested structures (>3 levels) -- our manifest is shallow
    - Do NOT add any npm dependencies
    - Do NOT use TypeScript
    - Do NOT modify any existing files

    ### Existing patterns to follow
    - Look at `test/capture.test.js` for test structure conventions
    - Keep the module minimal -- this is a utility function, not a framework

    ### Deliverables
    1. `src/canonical-json.js` -- the canonicalize function
    2. `test/canonical-json.test.js` -- 10-12 focused test cases

    ### Success criteria
    - `vitest run test/canonical-json.test.js` passes
    - Two objects with same keys in different insertion order produce byte-identical canonical JSON
- **Deliverables**: `src/canonical-json.js`, `test/canonical-json.test.js`
- **Success criteria**: All canonical JSON tests pass; determinism guarantee verified

### Task 3: WACZ construction pipeline (WARC, CDXJ, manifest, signing, ZIP)
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: yes
- **Gate reason**: This is the core implementation -- WARC format, CDXJ index, manifest structure, signing integration, and ZIP assembly. All downstream integration depends on these being correct. Hard to reverse (format decisions), high blast radius.
- **Prompt**: |
    ## Task: WACZ Construction Pipeline

    Working directory: /Users/ben/github/benpeter/web-resource-ledger

    ### Context
    You are building the core WACZ bundling pipeline for a Cloudflare Worker. This takes in-memory capture artifacts (screenshot PNG, rendered HTML, HTTP headers JSON) and produces a signed WACZ ZIP file. The Ed25519 spike test (Task 1) has confirmed which API works. The canonical JSON module (Task 2) is available at `src/canonical-json.js`.

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
      - `crypto.subtle.exportKey('raw', publicCryptoKey)` to get 32-byte public key (derive public from private by importing as key pair... actually: import as private, then re-derive -- see note below)
      - Cache in module-scoped variables
      - SECURITY: env.SIGNING_KEY is accessed here and nowhere else
      - No console.log anywhere in this module
      - Catch all errors, return null on any failure (log "Signing key validation failed" only)

    **Note on public key derivation:** Web Crypto does not directly derive a public key from a private key. Two approaches:
    a) Import the PKCS8 key, sign+verify to confirm it works, and export the public key bytes from the key pair. But `importKey('pkcs8', ...)` with `['sign']` gives a private key only -- no public key export.
    b) Better approach: use `node:crypto` (available via nodejs_compat) to derive the public key:
       ```javascript
       import { createPrivateKey, createPublicKey } from 'node:crypto';
       const privKeyObj = createPrivateKey({ key: Buffer.from(pkcs8Bytes), format: 'der', type: 'pkcs8' });
       const pubKeyObj = createPublicKey(privKeyObj);
       const publicKeyBytes = pubKeyObj.export({ type: 'spki', format: 'der' }).subarray(12); // strip SPKI header to get raw 32 bytes
       ```
    c) Or: store both the PKCS8 private key and the raw public key in secrets. But KISS says derive at startup.

    Choose whichever approach the spike test (Task 1) confirmed works. The spike test validates the exact import/export path. Use that same path here.

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
    5. Compute SHA-256 hash of each file (warcBytes, cdxjBytes, pagesBytes) using `crypto.subtle.digest`
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
    8. Sign: `signBytes(privateKey, hashStringBytes)` -- sign the UTF-8 bytes of the hash string `"sha256:{hex}"`
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

    **Step 6: Create `src/hash.js`** -- SHA-256 utility

    ```javascript
    export async function sha256(data) {
      const hash = await crypto.subtle.digest('SHA-256', data);
      const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
      return `sha256:${hex}`;
    }
    ```

    Also export a `hexFromBuffer(buffer)` helper if needed.

    ### What NOT to do
    - Do NOT modify `src/capture.js` or `src/kv.js` -- pipeline integration is a separate task
    - Do NOT modify existing test files
    - Do NOT use TypeScript
    - Do NOT use warcio.js, pako, hash-wasm, jszip, or archiver
    - Do NOT compress WARC files with gzip -- use uncompressed `data.warc`
    - Do NOT put signatures in `datapackage.json` -- they go in `datapackage-digest.json`
    - Do NOT add console.log to `src/signing.js`

    ### Existing patterns to follow
    - Module-scoped caching: see the caching pattern recommended by security-minion (lazy init, module-scoped variables)
    - Error handling: see `src/capture.js` for try/catch patterns and error categorization
    - File naming: existing files are `src/capture.js`, `src/kv.js`, `src/auth.js` -- follow the same style

    ### Deliverables
    1. `src/signing.js` -- Ed25519 signing module (lazy key import, sign, verify)
    2. `src/warc.js` -- WARC record construction
    3. `src/cdxj.js` -- CDXJ index generation
    4. `src/wacz.js` -- WACZ assembly orchestrator
    5. `src/hash.js` -- SHA-256 utility
    6. Updated `package.json` with fflate dependency

    ### Success criteria
    - All new modules export the documented functions
    - No console.log in signing.js
    - fflate is the only new dependency added
    - WARC records follow WARC/1.1 format with correct line endings (\r\n)
    - ZIP uses STORE mode (level 0) for all entries
- **Deliverables**: `src/signing.js`, `src/warc.js`, `src/cdxj.js`, `src/wacz.js`, `src/hash.js`, updated `package.json`
- **Success criteria**: All modules export documented functions; no console.log in signing.js; fflate is the only new dependency

### Task 4: Pipeline integration and WACZ integration tests
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    ## Task: Pipeline Integration and WACZ Integration Tests

    Working directory: /Users/ben/github/benpeter/web-resource-ledger

    ### Context
    The WACZ construction modules are complete (src/signing.js, src/warc.js, src/cdxj.js, src/wacz.js, src/hash.js, src/canonical-json.js). Now integrate WACZ bundling into the capture pipeline and write integration tests.

    The project uses vanilla JS, Cloudflare Workers, `@cloudflare/vitest-pool-workers` with Miniflare. The test config at `vitest.config.js` has a `SIGNING_KEY` binding (added in Task 1).

    **Key design decisions:**
    - Graceful degradation: if SIGNING_KEY is missing or signing fails, skip WACZ, complete capture without it
    - Pass in-memory artifacts directly to buildWacz (don't read back from R2)
    - Write .wacz to R2 at `captures/{sha256}.wacz` with content-type `application/wacz+zip`
    - Update KV metadata with wacz info (key, bundleHash, size, status)
    - Individual R2 artifacts remain alongside the WACZ

    ### What to do

    **Part A: Modify `src/capture.js`** -- Add WACZ step after artifact storage

    After the existing `Promise.all` that writes artifacts to R2, add:

    ```javascript
    // WACZ bundling (optional -- degrades gracefully if signing key is absent)
    let waczInfo = null;
    try {
      const waczArtifacts = {
        screenshot,
        html,
        headers, // may be null if header fetch failed
      };
      const result = await buildWacz(url, new Date().toISOString(), waczArtifacts, env);
      if (result) {
        const { waczBytes, waczHash, bundleHash } = result;
        await env.BUCKET.put(`captures/${waczHash}.wacz`, waczBytes, {
          httpMetadata: {
            contentType: 'application/wacz+zip',
            contentDisposition: `attachment; filename="${waczHash}.wacz"`,
          },
        });
        waczInfo = {
          key: `captures/${waczHash}.wacz`,
          bundleHash,
          size: waczBytes.byteLength,
        };
      }
    } catch {
      // WACZ bundling failed -- capture still completes with individual artifacts
    }
    ```

    Pass `waczInfo` to `completeCapture`. The `waczInfo` may be null (no signing key, signing failed, or error).

    **Part B: Modify `src/kv.js`** -- Accept wacz info in completeCapture

    Update `completeCapture` to accept an optional `wacz` parameter:

    ```javascript
    export async function completeCapture(kv, captureId, artifacts, wacz = null) {
      // ... existing code ...
      const value = {
        ...existing,
        status: 'complete',
        completedAt: new Date().toISOString(),
        artifacts,
        ...(wacz ? { wacz } : {}),
      };
      // ... rest unchanged
    }
    ```

    **Part C: Create `test/wacz.test.js`** -- Integration tests

    Test structure (use the existing `stubRenderer` pattern from `test/capture.test.js`):

    ```javascript
    import { env, fetchMock } from 'cloudflare:test';
    import { describe, it, expect, beforeEach, afterEach } from 'vitest';
    import { performCapture } from '../src/capture.js';
    import { createCapture, getCapture } from '../src/kv.js';
    import { unzipSync } from 'fflate';
    ```

    Setup: same pattern as capture.test.js -- create pending capture, mock header fetch, use stubRenderer. Add cleanup for WACZ R2 objects (list objects with `captures/` prefix to find and delete .wacz files).

    Test cases:
    1. **WACZ written to R2**: After `performCapture` completes, list R2 objects matching `captures/*.wacz` -- at least one should exist
    2. **WACZ contains expected files**: Read the .wacz from R2, unzip with `fflate.unzipSync`, verify it contains: `datapackage.json`, `datapackage-digest.json`, `archive/data.warc`, `indexes/index.cdxj`, `pages/pages.jsonl`
    3. **datapackage.json has correct structure**: Parse the datapackage.json from the WACZ, verify it has `profile`, `wacz_version`, `resources` array with 3 entries (data.warc, index.cdxj, pages.jsonl), each with `name`, `path`, `hash`, `bytes`
    4. **Resource hashes are valid**: For each resource in datapackage.json, compute SHA-256 of the actual file bytes from the WACZ and verify it matches the `hash` field
    5. **datapackage-digest.json has valid signature**: Parse it, extract `signedData`, verify the Ed25519 signature over the `signedData.hash` using the embedded `publicKey`
    6. **KV record includes wacz info**: After capture, verify KV record has `wacz.key`, `wacz.bundleHash`, `wacz.size`
    7. **Signing round-trip** (acceptance criteria test): Create a known manifest, compute bundleHash, sign it, verify with the public key -- assert true. Then tamper with one byte and verify -- assert false. This can use the signing module directly.
    8. **Canonical JSON stability** (acceptance criteria test): Create the same manifest object with keys in different insertion orders, canonicalize both, assert byte-identical output.

    For tests 7 and 8, you can put them in `test/wacz.test.js` under a separate `describe` block, or reference the existing tests in `test/signing.test.js` and `test/canonical-json.test.js`. The acceptance criteria explicitly require these tests to pass under `vitest run`.

    **Important testing notes:**
    - Use `fflate` for both ZIP writing (production) and reading (tests). `unzipSync` is available.
    - For signature verification in tests: import the public key from `datapackage-digest.json`, use `crypto.subtle.importKey('raw', ...)` and `crypto.subtle.verify('Ed25519', ...)`
    - `stubRenderer` returns `{ screenshot: Uint8Array([0x89,0x50,0x4e,0x47,...]), html: '<html><body>test</body></html>' }` -- reuse the same fixtures from capture.test.js
    - Clean up R2 WACZ objects in `beforeEach` -- list all objects with prefix `captures/` and delete any `.wacz` files

    **Part D: Verify existing tests pass**

    After all changes, run `vitest run test/capture.test.js` and confirm all 17 existing tests still pass. The existing tests do not provide SIGNING_KEY in their test environment, but since `vitest.config.js` has a global SIGNING_KEY binding, WACZ bundling will run in existing tests too. This is fine -- the existing assertions (KV status, R2 artifacts) should still hold because WACZ bundling is additive.

    If any existing tests fail, diagnose and fix the issue. The most likely cause: the `completeCapture` signature changed (added `wacz` parameter) -- verify it is optional with a default.

    ### What NOT to do
    - Do NOT modify `test/capture.test.js` -- existing tests must pass unchanged
    - Do NOT modify `test/signing.test.js` or `test/canonical-json.test.js`
    - Do NOT add console.log to signing.js
    - Do NOT use TypeScript
    - Do NOT make WACZ bundling mandatory (must degrade gracefully)

    ### Existing patterns to follow
    - `test/capture.test.js` for test structure, fixtures, cleanup patterns
    - `src/capture.js` for the pipeline flow and error handling
    - `src/kv.js` for KV update patterns

    ### Deliverables
    1. Modified `src/capture.js` -- WACZ step integrated after artifact storage
    2. Modified `src/kv.js` -- completeCapture accepts optional wacz parameter
    3. `test/wacz.test.js` -- 6-8 integration test cases
    4. All existing tests in `test/capture.test.js` pass

    ### Success criteria
    - `vitest run` passes all tests (existing + new)
    - After a capture with stubRenderer, R2 contains a .wacz object
    - KV record for the capture includes wacz metadata
    - Signing round-trip test passes (sign -> verify = true, tamper -> verify = false)
    - Canonical JSON stability test passes
- **Deliverables**: Modified `src/capture.js`, modified `src/kv.js`, `test/wacz.test.js`
- **Success criteria**: `vitest run` passes all tests; R2 contains .wacz after capture; KV includes wacz metadata

### Task 5: README documentation for key generation
- **Agent**: edge-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: README Key Generation Documentation

    Working directory: /Users/ben/github/benpeter/web-resource-ledger

    ### Context
    The WACZ signing pipeline uses Ed25519 keys. A key generation script exists at `scripts/generate-signing-key.js`. The README needs a section documenting the key generation procedure -- this is an explicit acceptance criterion of issue #4.

    ### What to do

    Add a section to `README.md` under a heading like "## Signing Key Setup" or similar (fit the existing README structure). Include:

    1. **What**: WRL signs WACZ bundles with Ed25519. A signing key must be configured before captures produce signed bundles.
    2. **Generate a key pair**:
       ```bash
       node scripts/generate-signing-key.js
       ```
    3. **Set the production secret**:
       ```bash
       wrangler secret put SIGNING_KEY
       # Paste the private key (PKCS8 DER, base64) when prompted
       ```
    4. **Set the local dev secret**: Add to `.dev.vars`:
       ```
       SIGNING_KEY=<base64 string from the script>
       ```
    5. **Note**: The signing key is optional. If not configured, captures complete without WACZ bundles (individual artifacts are still stored). The public key is embedded in each signed bundle for verification.
    6. **Security**: Never commit the private key to version control. `.dev.vars` is already in `.gitignore`.

    Read the existing README.md first and fit the new section into its structure naturally.

    ### What NOT to do
    - Do NOT rewrite the entire README
    - Do NOT document WACZ format details (that belongs in evolution log or separate docs)
    - Do NOT use TypeScript examples
    - Keep it concise -- the operator audience knows what they're doing

    ### Deliverables
    1. Updated `README.md` with key generation section

    ### Success criteria
    - README documents how to generate and configure the signing key
    - Instructions reference the script and wrangler secret put
- **Deliverables**: Updated `README.md`
- **Success criteria**: README documents key generation procedure per acceptance criteria

### Cross-Cutting Coverage

- **Testing**: Tasks 1, 2, and 4 include comprehensive tests. Task 1 = Ed25519 spike tests. Task 2 = canonical JSON tests. Task 4 = WACZ integration tests + signing round-trip + canonical JSON stability (acceptance criteria). Phase 6 post-execution handles test execution.
- **Security**: security-minion's recommendations are embedded throughout: PKCS8 key format (Conflict 3), no console.log in signing module (Task 3), key validation with graceful failure (Task 3), sanitized error messages (Task 3), Content-Disposition on WACZ R2 objects (Task 4). Phase 5 post-execution code review by security-relevant reviewers.
- **Usability -- Strategy**: This is a backend/infrastructure change with no user-facing interface. The only user touchpoint is the key generation script (Task 1) and README documentation (Task 5). ux-strategy-minion review is included in Phase 3.5 architecture review to assess the operator experience of key setup.
- **Usability -- Design**: No UI components produced. Excluded -- this is pure backend work.
- **Documentation**: Task 5 covers README updates (acceptance criterion). Phase 8 post-execution handles evolution log documentation (per CLAUDE.md requirement and feedback memory).
- **Observability**: No new runtime services or endpoints. The WACZ step runs within the existing capture pipeline. Excluded -- observability was already established in Step 3 for the capture pipeline. The graceful degradation logs "Signing key validation failed" which is sufficient for MVP.

### Architecture Review Agents
- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. Rationale for each:
    - ux-design-minion: No UI components produced (pure backend)
    - accessibility-minion: No web-facing UI (pure backend)
    - sitespeed-minion: No web-facing runtime changes (WACZ runs in existing background pipeline)
    - observability-minion: Single pipeline extension within existing capture flow, no new services or endpoints
    - user-docs-minion: README update is a simple key generation procedure; Phase 8 handles documentation review
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

See detailed conflict resolutions at the top of this document. Summary:

1. **WARC compression**: Uncompressed `data.warc` (edge-minion's recommendation; KISS)
2. **Signature location**: `datapackage-digest.json` (data-minion's recommendation; WACZ-Auth spec)
3. **Ed25519 API**: Web Crypto standard `Ed25519` with PKCS8 import, spike test first (consensus of test-minion + edge-minion)
4. **WACZ failure handling**: Graceful degradation (edge-minion's recommendation; YAGNI/operational resilience)
5. **Key format**: Base64-encoded PKCS8 DER (consensus of security-minion + data-minion)

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Ed25519 `importKey('pkcs8')` fails in workerd | HIGH | Task 1 spike test validates this first. Fallback: `node:crypto` (nodejs_compat enabled). Second fallback: `@noble/ed25519` (~2KB WASM-free). |
| Silent signing failure stores unsigned WACZ | CRITICAL | Resolution: never store unsigned WACZ. If signing fails, skip WACZ entirely. buildWacz returns null, capture completes without WACZ. KV has no `wacz` field = operator can detect. |
| Non-deterministic ZIP breaks content-addressed key | MEDIUM | fflate zipSync with level 0 and consistent entry ordering. Add a golden test: build WACZ from same artifacts twice, assert identical bytes. |
| Existing 17 capture tests break | MEDIUM | SIGNING_KEY added to global vitest config (Task 1). completeCapture's new `wacz` parameter defaults to null. Task 4 explicitly verifies existing tests pass. |
| ctx.waitUntil 30s budget exceeded | LOW | WACZ bundling adds ~80-260ms (edge-minion estimate). 5s headroom after 25s nav timeout. Well within budget. |
| WARC format incorrectness | MEDIUM | Manual WARC construction is ~100 lines. Integration tests verify the WACZ can be unzipped and files extracted. WARC structure verified via test assertions on record headers. |

### Execution Order

```
Batch 1 (parallel):
  Task 1: Ed25519 spike + key gen script + vitest config
  Task 2: Canonical JSON module + tests

  [APPROVAL GATE: Task 1 -- Ed25519 API confirmed]

Batch 2 (sequential):
  Task 3: WACZ construction pipeline (depends on Task 1 + Task 2)

  [APPROVAL GATE: Task 3 -- WACZ implementation review]

Batch 3 (parallel):
  Task 4: Pipeline integration + integration tests (depends on Task 3)
  Task 5: README documentation (depends on Task 1 only, can run with Batch 2 or 3)
```

### External Skills
No external skills detected in project.

### Verification Steps

After all tasks complete:
1. `vitest run` -- all tests pass (existing + new)
2. Verify acceptance criteria:
   - Signing round-trip test present and passing
   - Canonical JSON stability test present and passing
   - Integration test confirms .wacz in R2 after capture
   - README documents key generation procedure
3. Verify no regressions: all 17 existing capture tests pass
4. Verify security: no console.log in src/signing.js, SIGNING_KEY not in wrangler.toml, .dev.vars in .gitignore
5. Manual spot-check: `node scripts/generate-signing-key.js` produces valid output
