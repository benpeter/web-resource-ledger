# Domain Plan Contribution: data-minion

## Recommendations

### 1. WARC Record Types for Each Artifact

The WACZ bundle contains three captured artifacts. Each maps to a specific WARC record type based on ISO 28500 semantics:

**rendered.html -> `resource` record**
- `WARC-Type: resource` -- the rendered DOM is a derived artifact, not a raw HTTP response. It was produced by a headless browser, so there is no complete HTTP response envelope to wrap it in. The `resource` type is designed for exactly this: "a resource without full protocol response information" or "the result of a networked retrieval where the protocol information has been discarded."
- `Content-Type: text/html; charset=utf-8`
- `WARC-Target-URI: {captured URL}`

**screenshot.png -> `resource` record**
- `WARC-Type: resource` -- a screenshot is a derived artifact created by the browser, not something fetched over HTTP. There is no HTTP response to wrap.
- `Content-Type: image/png`
- `WARC-Target-URI: urn:wrl:screenshot:{captured URL}` -- use a URN scheme because the screenshot is not a directly-fetched resource. This distinguishes it from the HTML resource record for the same target URL.

**headers.json -> `metadata` record**
- `WARC-Type: metadata` -- HTTP headers describe the captured resource, they are not the resource itself. The WARC spec says metadata records "contain content created to describe, explain, or accompany archived resources."
- `Content-Type: application/json`
- `WARC-Refers-To: <record-id of the rendered.html resource record>` -- links this metadata to the resource it describes.
- `WARC-Target-URI: {captured URL}`

**warcinfo record (one per WARC file)**
- `WARC-Type: warcinfo` -- appears once at the start of the WARC file. Describes the tool and capture context.
- `Content-Type: application/warc-fields`
- Body contains `software: WRL/0.1\r\n` and `format: WARC/1.1\r\n`

All records share:
- `WARC-Record-ID: <urn:uuid:{uuid}>` -- UUID URN, globally unique per record
- `WARC-Date: {ISO 8601 UTC timestamp}` -- the capture timestamp, same across all records in one capture
- `Content-Length: {byte count}` -- exact byte length of the record content block

**Concrete WARC file layout** (single file, `archive/data.warc.gz`):

```
[warcinfo record]
[resource record: rendered.html]
[metadata record: headers.json, WARC-Refers-To -> rendered.html record]
[resource record: screenshot.png]
```

### 2. CDXJ Index Generation

The CDXJ index enables efficient lookup of URLs within the WACZ. For WACZ compliance:

**Line format** (per the OpenWayback CDXJ spec):
```
<SURT-URL> <timestamp> <JSON-block>
```

**Fields in the JSON block** (mandatory for WACZ replay):
- `url` -- original URL (not SURT-transformed)
- `digest` -- `sha256:{hex}` of the record payload
- `mime` -- MIME type of the payload
- `status` -- HTTP status code (use `200` for resource records, `-` for metadata/warcinfo)
- `offset` -- byte offset of the WARC record within the WARC file
- `length` -- byte length of the complete WARC record (headers + content + separator)
- `filename` -- relative path to the WARC file within the ZIP (`archive/data.warc.gz`)

**SURT (Sort-friendly URI Rewriting Transform)**:
- `https://example.com/path` becomes `com,example)/path`
- Drop the scheme, reverse the hostname segments, separate with commas, append `)`

**Timestamp format**: `YYYYMMDDHHmmss` (14-digit compact format, NOT ISO 8601 in the CDXJ line itself)

**Sorting**: Lines sorted lexicographically by SURT key + timestamp using byte-value ordering (LC_ALL=C equivalent).

**For our three-artifact WACZ**, the index will have 2-3 lines (one per non-warcinfo record with a target URI). The warcinfo record has no target URI and is not indexed.

**Example**:
```
com,example)/page 20260313120000 {"url":"https://example.com/page","mime":"text/html","status":"200","digest":"sha256:abc123...","offset":512,"length":52480,"filename":"archive/data.warc.gz"}
com,example)/page 20260313120000 {"url":"https://example.com/page","mime":"application/json","status":"-","digest":"sha256:def456...","offset":52992,"length":2304,"filename":"archive/data.warc.gz"}
com,example)/page 20260313120000 {"url":"urn:wrl:screenshot:https://example.com/page","mime":"image/png","status":"-","digest":"sha256:789abc...","offset":55296,"length":204800,"filename":"archive/data.warc.gz"}
```

**Implementation note**: Since we are constructing the WARC file in memory (not streaming from disk), we know all byte offsets during construction. Compute offsets as we serialize each record sequentially.

### 3. datapackage.json Structure

Based on the WACZ 1.1.1 specification, here is the exact structure for our use case:

```json
{
  "profile": "data-package",
  "wacz_version": "1.1.1",
  "title": "WRL capture of https://example.com/page",
  "software": "WRL/0.1",
  "created": "2026-03-13T12:00:00Z",
  "mainPageUrl": "https://example.com/page",
  "mainPageDate": "2026-03-13T12:00:00Z",
  "resources": [
    {
      "name": "data.warc.gz",
      "path": "archive/data.warc.gz",
      "hash": "sha256:...",
      "bytes": 258048
    },
    {
      "name": "index.cdx.gz",
      "path": "indexes/index.cdx.gz",
      "hash": "sha256:...",
      "bytes": 512
    },
    {
      "name": "pages.jsonl",
      "path": "pages/pages.jsonl",
      "hash": "sha256:...",
      "bytes": 256
    }
  ]
}
```

**Required fields**: `profile`, `wacz_version`, `resources` (each with `name`, `path`, `hash`, `bytes`)

**Recommended fields we should include**: `title`, `software`, `created`, `mainPageUrl`, `mainPageDate`

**The `signatures` array is NOT part of the WACZ spec datapackage.json.** Per the WACZ-Auth spec, signatures go in `datapackage-digest.json`. The MVP.md mentions a `signatures` array in the manifest -- I recommend aligning with the actual spec and putting signature data in `datapackage-digest.json` as specified by WACZ-Auth, while keeping `datapackage.json` clean per WACZ 1.1.1. This still supports the planned upgrade path for RFC 3161 timestamps.

### 4. SHA-256 Hash Structure in the Manifest

**Hash the raw file bytes as they appear in the ZIP, not the WARC record wrapping them.**

Specifically:
- `archive/data.warc.gz` -- hash of the gzipped WARC file bytes (the entire file as stored in the ZIP)
- `indexes/index.cdx.gz` -- hash of the gzipped CDXJ index bytes
- `pages/pages.jsonl` -- hash of the pages.jsonl file bytes

Format in JSON: `"sha256:{lowercase_hex_digest}"`

This is what the WACZ spec requires: each resource entry hashes the file at `path` as it exists in the ZIP. The verifier reads the file from the ZIP and computes SHA-256 over its bytes.

**bundleHash computation** (per MVP.md):
1. Serialize `datapackage.json` to canonical JSON (keys sorted alphabetically at all levels, no whitespace, no trailing newline)
2. Compute SHA-256 of the canonical JSON bytes (UTF-8 encoded)
3. This is the `hash` field in `datapackage-digest.json`

**This aligns with the WACZ-Auth spec**: `datapackage-digest.json` contains `"hash": "sha256:{hex}"` which is the SHA-256 of the `datapackage.json` file.

Use `crypto.subtle.digest('SHA-256', bytes)` in Cloudflare Workers -- no external dependency needed.

### 5. ZIP Structure for WACZ File

**Directory layout inside the ZIP**:
```
datapackage.json            (DEFLATE or STORE)
datapackage-digest.json     (DEFLATE or STORE)
archive/
  data.warc.gz              (STORE -- already gzip-compressed)
indexes/
  index.cdx.gz              (STORE -- already gzip-compressed)
pages/
  pages.jsonl               (DEFLATE or STORE)
```

**Compression settings per file type**:
- `archive/*.warc.gz` -- STORE mode (level 0). These are already gzip-compressed. Re-compressing with DEFLATE wastes CPU and harms random-access. The WACZ spec requires STORE for archive files.
- `indexes/*.cdx.gz` -- STORE mode (level 0). Already gzip-compressed. WACZ spec requires STORE for pre-compressed index files.
- `datapackage.json` -- DEFLATE (level 6). Small JSON file, compression helps slightly but either mode is acceptable.
- `datapackage-digest.json` -- DEFLATE (level 6). Same reasoning.
- `pages/pages.jsonl` -- DEFLATE (level 6). Small text file.

**Important**: The ZIP must be a standard ZIP (not ZIP64) since our bundles are small (~250KB). The `.wacz` extension is mandatory per the spec.

**Library recommendation**: `fflate` (8KB minified, zero dependencies, pure JS). Supports per-file compression level via `zipSync()`:

```javascript
const waczBytes = fflate.zipSync({
  'datapackage.json': [dpBytes, { level: 6 }],
  'datapackage-digest.json': [digestBytes, { level: 6 }],
  'archive/data.warc.gz': [warcGzBytes, { level: 0 }],
  'indexes/index.cdx.gz': [cdxGzBytes, { level: 0 }],
  'pages/pages.jsonl': [pagesBytes, { level: 6 }],
});
```

### 6. warcio.js Compatibility Assessment

**Verdict: Do NOT use warcio.js. Build WARC records manually.**

Reasons:

1. **hash-wasm dependency is incompatible with Cloudflare Workers.** warcio.js uses hash-wasm for WARC digest computation. hash-wasm loads WebAssembly via `WebAssembly.compile()` which Cloudflare Workers blocks ("Wasm code generation disallowed by embedder"). Workers require WASM modules to be pre-compiled and imported statically. There is no supported workaround for hash-wasm in Workers.

2. **`tempy` dependency requires filesystem.** warcio.js depends on `tempy` (temporary file creation). Cloudflare Workers have no filesystem.

3. **`pako` is unnecessary weight.** Cloudflare Workers support `CompressionStream` and `DecompressionStream` natively (gzip, deflate, deflate-raw). No need for a JS polyfill.

4. **WARC record construction is straightforward.** The WARC format is text-based with a simple header/body structure. For our use case (3-4 records, all constructed in memory), a manual implementation is ~100 lines of code. The format is:
   ```
   WARC/1.1\r\n
   WARC-Type: resource\r\n
   WARC-Record-ID: <urn:uuid:{uuid}>\r\n
   WARC-Target-URI: {url}\r\n
   WARC-Date: {iso8601}\r\n
   Content-Type: {mime}\r\n
   Content-Length: {bytes}\r\n
   \r\n
   {content bytes}
   \r\n\r\n
   ```

5. **SHA-256 is available via Web Crypto.** `crypto.subtle.digest('SHA-256', buffer)` is native in Workers. No need for hash-wasm.

6. **Gzip compression is available natively.** Use `CompressionStream('gzip')` to produce `.warc.gz` and `.cdx.gz` files.

**The only external dependency needed is `fflate` for ZIP construction** (8KB, zero deps, pure JS, works everywhere). Everything else -- WARC serialization, CDXJ generation, SHA-256 hashing, gzip compression, Ed25519 signing -- uses Web APIs available in Cloudflare Workers.

### 7. Ed25519 Signing in Cloudflare Workers

Cloudflare Workers support Ed25519 via the Web Crypto API, but with a notable quirk:

- Algorithm name: `NODE-ED25519` (legacy non-standard name) OR standard `Ed25519` (via Secure Curves API)
- Private key import: Must use `pkcs8` format, NOT `raw`. Cloudflare will not accept raw private key import.
- Public key import: Can use `raw` or `spki` format.
- The MVP.md specifies "base64-encoded raw 32 bytes" for the private key secret. This raw key will need to be wrapped in PKCS#8 DER encoding before import. This is a fixed 16-byte prefix + 34-byte wrapper around the 32-byte raw key (48 bytes total PKCS#8 structure for Ed25519).

**WACZ-Auth spec uses ECDSA, not Ed25519.** The WACZ-Auth 0.1.0 spec specifies `"publicKey": "<base64 encoded public key (ECDSA)>"`. The MVP decisions document explicitly chose Ed25519 over ECDSA for good reasons (faster, smaller, deterministic, no padding oracle). This is a deliberate deviation from WACZ-Auth. The anonymous signature mode still works conceptually -- the verifier just needs to know the algorithm. Document this deviation clearly in the `signedData` object by including an `algorithm` field.

Proposed `datapackage-digest.json`:
```json
{
  "path": "datapackage.json",
  "hash": "sha256:...",
  "signedData": {
    "hash": "sha256:...",
    "signature": "<base64-encoded Ed25519 signature>",
    "publicKey": "<base64-encoded Ed25519 public key, 32 bytes raw>",
    "created": "2026-03-13T12:00:00Z",
    "software": "WRL/0.1",
    "version": "0.1.0"
  }
}
```

**What gets signed**: The Ed25519 signature is computed over the UTF-8 bytes of the hash string `"sha256:{hex}"` (the hash of datapackage.json). This matches the WACZ-Auth spec: "Sign the hash using its private key to generate the first signature."

### 8. pages.jsonl Structure

Required by WACZ 1.1.1. Contains one header line and one page entry:

```jsonl
{"format": "json-pages-1.0", "id": "pages", "title": "All Pages"}
{"url": "https://example.com/page", "ts": "2026-03-13T12:00:00Z", "title": "WRL capture"}
```

Fields per entry: `url` (required), `ts` (required, RFC 3339), `title` (optional).

### 9. KV Metadata Update

After the WACZ bundle is written to R2, update the KV record to include:

```json
{
  "status": "complete",
  "completedAt": "2026-03-13T12:00:05Z",
  "artifacts": {
    "screenshot": "captures/{captureId}/screenshot.png",
    "html": "captures/{captureId}/rendered.html",
    "headers": "captures/{captureId}/headers.json"
  },
  "wacz": {
    "key": "captures/{sha256}.wacz",
    "bundleHash": "sha256:...",
    "size": 258048
  }
}
```

The individual R2 artifacts from step 3 remain in place (they are needed for the status endpoint and are already stored). The WACZ bundle is an additional R2 object at the content-addressed key.

**Consider whether to keep or delete the individual artifacts after bundling.** Keeping them simplifies the retrieval endpoint (step 5) but doubles storage. The bundle contains everything. My recommendation: keep them for MVP simplicity -- the storage cost is negligible (~250KB per capture) and R2 has zero egress fees. A cleanup step can be added post-MVP.

---

## Proposed Tasks

### Task 1: WARC Record Builder Module
**What**: Create `src/warc.js` with functions to construct WARC records manually (no warcio.js dependency).
**Deliverables**:
- `createWarcInfoRecord(software, captureDate)` -- returns Uint8Array
- `createResourceRecord(url, contentType, body, captureDate)` -- returns Uint8Array
- `createMetadataRecord(url, refersToId, body, captureDate)` -- returns Uint8Array
- `serializeToWarcGz(records)` -- concatenates records and gzip-compresses via CompressionStream
- Helper: `generateRecordId()` using `crypto.randomUUID()`
- Helper: compute byte offsets as records are serialized (needed for CDXJ)
**Dependencies**: None (uses only Web APIs)

### Task 2: CDXJ Index Generator
**What**: Create `src/cdxj.js` with a function to generate a CDXJ index from WARC record metadata.
**Deliverables**:
- `generateCdxj(recordMetadata[])` -- takes array of {url, timestamp, mime, digest, offset, length, filename}, returns string
- `toSurt(url)` -- SURT transformation function
- `toCdxjTimestamp(isoDate)` -- convert ISO 8601 to 14-digit format
- Gzip the output using CompressionStream for `index.cdx.gz`
**Dependencies**: Task 1 (needs record metadata with byte offsets)

### Task 3: WACZ Bundler Module
**What**: Create `src/wacz.js` that assembles the complete WACZ ZIP from artifacts.
**Deliverables**:
- `buildWacz(url, captureDate, artifacts)` -- orchestration function
  1. Read existing R2 artifacts (screenshot, html, headers)
  2. Build WARC records via Task 1
  3. Generate CDXJ index via Task 2
  4. Generate `pages.jsonl`
  5. Compute SHA-256 hashes for each file
  6. Assemble `datapackage.json` with hashes
  7. Compute bundleHash (SHA-256 of canonical datapackage.json)
  8. Sign bundleHash with Ed25519
  9. Assemble `datapackage-digest.json` with signature
  10. Create ZIP via fflate with correct compression settings per file
  11. Return: `{ waczBytes: Uint8Array, bundleHash: string, sha256: string }`
- `canonicalJson(obj)` -- deterministic JSON serialization (sorted keys, no whitespace)
**Dependencies**: Tasks 1, 2. `fflate` npm package.

### Task 4: Ed25519 Signing Helpers
**What**: Create `src/signing.js` with Ed25519 key import and signing functions for Cloudflare Workers.
**Deliverables**:
- `importSigningKey(base64RawKey)` -- converts 32-byte raw Ed25519 key to PKCS#8 format and imports via `crypto.subtle.importKey('pkcs8', ...)`
- `derivePublicKey(privateKey)` -- exports public key bytes from the CryptoKeyPair
- `signHash(privateKey, hashString)` -- signs the UTF-8 bytes of the hash string, returns base64 signature
- `verifySignature(publicKeyBytes, hashString, signatureBase64)` -- for testing
**Dependencies**: None (Web Crypto API only)

### Task 5: SHA-256 Utility
**What**: Create `src/hash.js` with SHA-256 hashing utilities.
**Deliverables**:
- `sha256(data)` -- accepts Uint8Array or ArrayBuffer, returns `sha256:{hex}` string
- `sha256Hex(data)` -- returns just the hex digest
**Dependencies**: None (Web Crypto API only)

### Task 6: Integration into Capture Pipeline
**What**: Modify `src/capture.js` to invoke WACZ bundling after R2 artifact storage.
**Deliverables**:
- After existing R2 puts succeed, call `buildWacz()` with the artifacts
- Write `.wacz` to R2 at `captures/{sha256}.wacz`
- Update KV metadata to include `wacz` field with key, bundleHash, size
- Handle bundling failures gracefully (capture is still "complete" with individual artifacts; WACZ bundling failure should not fail the whole capture -- degrade gracefully)
**Dependencies**: Tasks 1-5. Requires `SIGNING_KEY` wrangler secret.

### Task 7: Add fflate Dependency
**What**: `npm install fflate` and verify it works in the Cloudflare Workers runtime.
**Deliverables**:
- Updated `package.json` with fflate dependency
- Smoke test: create a simple ZIP in a vitest test running in the Miniflare pool
**Dependencies**: None

---

## Risks and Concerns

### Risk 1: Ed25519 Private Key Format in Workers (HIGH)
The MVP.md specifies storing the private key as "base64-encoded raw 32 bytes." Cloudflare Workers reject raw private key imports for Ed25519 -- only PKCS#8 is accepted. The implementation must wrap the 32 raw bytes in a PKCS#8 DER envelope before `importKey()`. This is a fixed transformation (prepend a known 16-byte ASN.1 header) but it must be implemented correctly. **Mitigation**: Test key import in Miniflare early. Consider storing the key already in PKCS#8 base64 format as the wrangler secret to avoid runtime DER wrapping.

### Risk 2: Worker Memory Limits for Large Screenshots (MEDIUM)
The entire WACZ bundle is constructed in memory. A full-page screenshot can be up to ~5MB (8000px height). Combined with the WARC wrapping, gzip compression, and ZIP construction, peak memory usage could reach ~15MB. Workers have a 128MB memory limit, so this should be fine, but it is worth monitoring. **Mitigation**: The existing 8000px screenshot height cap and 50MB page size limit keep artifact sizes bounded. No action needed for MVP but monitor if captures start failing with OOM.

### Risk 3: WACZ-Auth Spec Uses ECDSA, Not Ed25519 (MEDIUM)
The official WACZ-Auth 0.1.0 spec specifies ECDSA for the anonymous signature mode. Our deliberate choice of Ed25519 means standard WACZ verification tools (like ReplayWeb.page) may not validate our signatures. **Mitigation**: This is a known deviation documented in the kickoff decisions. The bundle format is still WACZ-compliant (signatures are in `datapackage-digest.json`). The verification endpoint (step 6) uses our own verification logic. For interoperability with standard WACZ tools, we could add ECDSA as a second signature in the future.

### Risk 4: fflate Compatibility with Workers Runtime (LOW)
fflate is pure JavaScript with no external dependencies, no WASM, and no filesystem access. It should work in Cloudflare Workers without issues. **Mitigation**: Task 7 includes a smoke test in Miniflare.

### Risk 5: Canonical JSON Determinism (LOW)
The `bundleHash` depends on canonical JSON serialization (sorted keys, no whitespace). JavaScript's `JSON.stringify` with a replacer that sorts keys is deterministic within a single engine, but the spec should be explicit about edge cases: no undefined values, no BigInt, no circular references, all values are strings/numbers/arrays/objects. **Mitigation**: Write a dedicated `canonicalJson()` function with explicit key sorting at all nesting levels. Test with the exact data structures used in `datapackage.json`.

### Risk 6: Gzip Compression via CompressionStream Determinism (LOW)
Different gzip implementations may produce different compressed output from the same input (different compression levels, different dictionary strategies). This does not affect correctness -- SHA-256 hashes are computed on the compressed output, and verification hashes the same compressed bytes. But it means re-generating the WACZ from the same inputs will produce a different file hash. **Mitigation**: This is acceptable. The content-addressed key uses the SHA-256 of the final WACZ bytes. Verification checks hashes against stored values, not recomputed values.

### Risk 7: ctx.waitUntil() Time Budget (MEDIUM)
The capture pipeline already runs in `ctx.waitUntil()` with a 30s budget. Adding WACZ bundling (WARC construction + gzip + SHA-256 + Ed25519 signing + ZIP + R2 write) adds latency. The compute is fast (~50ms for our data sizes) but the additional R2 write adds ~100ms network time. Combined with the existing browser rendering (5-25s) and 3 R2 artifact writes, the total may approach the 30s limit for slow pages. **Mitigation**: Monitor timing. If it becomes an issue, the backlog already notes "Queue migration for capture processing" as a [should]. For MVP, the 30s budget should suffice for most captures.

---

## Additional Agents Needed

**edge-minion**: Should review the `CompressionStream` usage for gzip and confirm the PKCS#8 wrapping approach for Ed25519 private keys in the Cloudflare Workers runtime. Edge-minion has the deepest knowledge of Workers-specific API quirks and memory behavior. Specifically:
- Confirm `CompressionStream('gzip')` output can be collected into a single Uint8Array (not just streamed) without issues
- Confirm the PKCS#8 DER prefix for Ed25519 keys (`302e020100300506032b657004220420` hex) is correct for Workers' `importKey`
- Assess whether `crypto.subtle.sign('Ed25519', ...)` vs `crypto.subtle.sign('NODE-ED25519', ...)` is the right API to use given the current `compatibility_date: "2026-03-13"`

None of the other specialists listed (security-minion, test-minion) are missing -- they are already part of this planning phase. The security-minion should specifically validate the signing approach and key management. The test-minion should plan tests for canonical JSON determinism and signing round-trips.
