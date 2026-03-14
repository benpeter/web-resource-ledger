# Domain Plan Contribution: edge-minion

## Recommendations

### 1. Time Budget Analysis: WACZ Bundling Is Feasible Inline

The current `performCapture()` pipeline allocates 25s (`NAV_TIMEOUT_MS`) for browser
rendering, leaving a 5s headroom within the 30s `ctx.waitUntil()` budget. The WACZ
bundling step -- SHA-256 hashing, WARC record construction, CDXJ indexing, ZIP assembly,
Ed25519 signing, R2 write -- involves operations that are fundamentally fast on the
artifact sizes in play.

**Realistic time estimates for typical artifacts (HTML ~50KB, screenshot ~200KB, headers ~2KB):**

| Operation | Estimate | Notes |
|-----------|----------|-------|
| SHA-256 hash of 3 artifacts (~252KB total) | ~1-2ms | `crypto.subtle.digest` is hardware-accelerated on Workers; 252KB is trivial |
| Construct WARC records (~252KB payload) | ~1-2ms | String concatenation + header assembly; pure CPU, no I/O |
| Build CDXJ index | <1ms | Single-entry index (one URL); text formatting |
| Build `datapackage.json` | <1ms | JSON.stringify of a small object |
| SHA-256 of `datapackage.json` (bundleHash) | <1ms | Sub-1KB payload |
| Ed25519 sign bundleHash | ~1-2ms | `crypto.subtle.sign` is hardware-accelerated; Ed25519 signing is ~50us in native code, Workers overhead adds some |
| `fflate.zipSync()` with level 0 (store) | ~2-5ms | No compression; ~252KB of data; just ZIP structure framing |
| R2 PUT of .wacz (~260KB) | ~50-200ms | Network I/O to R2; single write; varies by region |
| KV PUT (metadata update) | ~20-50ms | Single KV write |
| **Total** | **~80-260ms** | Well within the 5s headroom |

The 25s navigation timeout is a worst-case ceiling. Typical page loads complete in
5-15s, leaving 15-25s of actual headroom. Even in the worst case (page takes full
25s), WACZ bundling at ~260ms is comfortably within the remaining 5s.

**Verdict: inline bundling after artifact storage is feasible and recommended.**

### 2. Architecture: Inline After Artifact Storage, Not Separate Step

WACZ bundling should happen inline within `performCapture()`, immediately after the
existing R2 artifact writes complete. Reasons:

- **No extra infrastructure.** A separate step (Queue, Cron, or second Worker) adds
  operational complexity that is not justified by the ~260ms cost.
- **Atomicity.** The capture either completes with a signed WACZ or fails. No
  intermediate state where artifacts exist but the WACZ does not.
- **Data locality.** Artifacts are already in memory from the rendering step. Passing
  them directly avoids an R2 read round-trip.
- **The backlog already flags Queue migration as a [should] for the future.** If the
  30s budget becomes tight due to larger artifacts or additional processing, that is
  the time to split -- not now.

The pipeline should be:

```
render + header fetch (parallel)
  -> store artifacts in R2 (parallel)
  -> build WACZ from in-memory artifacts (sequential)
  -> write .wacz to R2
  -> update KV with WACZ metadata
```

### 3. ZIP Library: fflate with zipSync at Level 0

**Recommended: `fflate`** (https://github.com/101arrowz/fflate)

- **8KB gzipped** base + 3KB for ZIP support = ~11KB total addition to bundle. Lean.
- **`zipSync()` is the correct API for Workers.** The async `zip()` uses Web Workers
  internally, which are not available inside Cloudflare Workers. `zipSync` operates
  synchronously on `Uint8Array` inputs and returns a `Uint8Array` output.
- **Level 0 (store/no compression) is correct for WACZ.** The primary artifacts are
  a PNG (already compressed), HTML (small), and JSON (small). Compressing a PNG is
  wasted CPU. WACZ spec does not require internal compression. Store mode makes
  `zipSync` essentially a memcpy with ZIP framing headers -- very fast.
- **Pure JavaScript, no native dependencies, no filesystem access required.**
  Operates entirely on `Uint8Array`/`ArrayBuffer`. Perfect for Workers.
- **Well-maintained, widely used** (600+ GitHub stars, active maintenance).

Alternatives considered and rejected:

| Library | Why not |
|---------|---------|
| `@zip.js/zip.js` | Heavier (~45KB), streaming-oriented (overkill for <1MB bundles), has documented Workers runtime bugs requiring `useCompressionStream: false` workaround |
| `jszip` | ~100KB, async-only API, heavier than needed |
| `archiver` | Node.js-native, filesystem-dependent, not Worker-compatible |
| Manual ZIP construction | WACZ only needs basic ZIP (no ZIP64 needed for <1MB), but still fiddly to get right. fflate at 11KB is worth the correctness. |

### 4. Memory Constraints: Not a Concern

Workers have a 128MB memory limit. The memory footprint for WACZ bundling:

- In-memory artifacts from rendering: ~252KB (screenshot ~200KB, HTML ~50KB, headers ~2KB)
- WARC records wrapping those artifacts: ~255KB (adds WARC headers per record, ~1KB each)
- CDXJ index: <1KB
- `datapackage.json`: <1KB
- `datapackage-digest.json`: <1KB
- `zipSync` output buffer: ~260KB (store mode = input size + ZIP overhead)
- `zipSync` internal working memory: ~260KB (roughly 1x output for store mode)

**Total additional memory for WACZ: ~780KB.** This is 0.6% of the 128MB limit.

Even with the browser rendering context (which consumes significant memory via
Puppeteer), WACZ bundling adds negligible overhead. The browser context is closed
before artifact storage begins (the `finally` block in `defaultRenderer` calls
`context.close()` and `browser.close()`), so by the time WACZ bundling runs, the
Puppeteer memory is already released.

The `MAX_PAGE_BYTES` limit of 50MB is the theoretical upper bound on artifact size.
Even at 50MB total artifacts, `zipSync` at level 0 would need ~100MB working memory
(input + output), which is tight against the 128MB limit but feasible since the
browser is closed. However, typical captures are far below this.

**Risk mitigation for large captures:** Add a size check before WACZ construction.
If total artifact size exceeds a threshold (e.g., 10MB), skip WACZ bundling and
mark the capture as "complete without WACZ" in KV. This is a safety valve, not an
expected path.

### 5. Pass In-Memory Artifacts Directly -- Do Not Read Back from R2

The current `performCapture()` has `screenshot`, `html`, and `headers` in local
variables after rendering completes. These same buffers should be passed directly
to the WACZ construction function. Reading them back from R2 would:

- Add 3 R2 GET requests (~50-150ms each, 150-450ms total)
- Consume subrequest quota unnecessarily
- Create a race condition window (artifacts just written may not be immediately
  consistent for reads, though R2 is strongly consistent for PUTs)
- Double the memory usage (original buffers + fetched copies)

The code change is straightforward: after the `Promise.all` that writes artifacts
to R2, pass the same `screenshot`, `html`, and `headers` variables to a
`buildWacz()` function.

One structural note: `headers` is currently serialized to `JSON.stringify(headers)`
at the R2 write point. The WACZ builder needs the raw `headers` object (to embed in
WARC records) and also the serialized string (for SHA-256 hashing of the stored
artifact). Pass both, or serialize once and share.

### 6. Ed25519 Signing on Workers

Cloudflare Workers support Ed25519 via the Web Crypto API under two algorithm names:

- `Ed25519` (standard, Secure Curves spec)
- `NODE-ED25519` (legacy non-standard, Node.js compat)

**Use the standard `Ed25519` algorithm.** The `NODE-ED25519` variant is legacy and
may change behavior over time.

**Key management consideration:** `crypto.subtle.generateKey()` is NOT supported for
Ed25519 on Workers. Keys must be generated externally and imported via
`crypto.subtle.importKey()`. The private key should be stored as a Workers Secret
(environment variable), not in KV or R2.

The signing flow:

1. Import the Ed25519 private key from env secret at startup (or lazily on first use)
2. Compute SHA-256 of canonical `datapackage.json` bytes
3. Sign the hash with `crypto.subtle.sign('Ed25519', privateKey, hashBytes)`
4. Base64-encode the signature
5. Construct `datapackage-digest.json` with the anonymous signature format

**Important: `importKey` does not support raw private key import for Ed25519 on
Workers.** The key must be imported in PKCS8 or JWK format. Generate the keypair
externally (e.g., `openssl` or Node.js script), export as JWK, and store the JWK
as a Worker secret.

### 7. WACZ Spec Compliance: Simplified for MVP

The task description mentions a "simplified WACZ" approach, which aligns with the
backlog noting `[consider] WACZ-Auth signing spec -- full implementation, MVP uses
simplified version`. The recommendation:

**Build a valid WACZ structure but use the anonymous signature format:**

```
archive/
  data.warc               (uncompressed WARC, all records concatenated)
indexes/
  index.cdxj              (single-entry CDXJ index)
pages/
  pages.jsonl             (single-entry page list)
datapackage.json          (manifest with resources, hashes, sizes)
datapackage-digest.json   (SHA-256 of datapackage.json + Ed25519 signature)
```

Key simplifications from full WACZ 1.1.1:
- Single WARC file (not `.warc.gz` -- no need to gzip a store-mode ZIP)
- Single CDXJ entry (one URL per capture)
- Anonymous signature only (no domain-ownership, no RFC 3161 timestamp)
- No `pages.jsonl` `text` field (full-text extraction is out of scope)

This is spec-compliant: WACZ 1.1.1 requires at minimum one WARC, one index file,
one pages entry, and a valid `datapackage.json`. The anonymous signature format
in WACZ-Auth 0.1.0 is a valid signing option.

### 8. Cache and Delivery Considerations for .wacz Files

Once `.wacz` files are stored in R2 at `captures/{sha256}.wacz`:

- **Content-addressable storage** means the `.wacz` key is immutable by definition.
  If a future retrieval endpoint serves `.wacz` files, set aggressive cache headers:
  `Cache-Control: public, max-age=31536000, immutable`. The SHA-256 key guarantees
  content never changes.
- **Content-Type** for `.wacz` should be `application/wacz+zip` (or
  `application/zip` as fallback). Set this in the R2 PUT `httpMetadata`.
- **Content-Disposition** should be `attachment; filename="{sha256}.wacz"` to prevent
  browser rendering of ZIP contents (defense-in-depth against stored XSS via HTML
  inside the WACZ).

## Proposed Tasks

### Task 1: Add fflate dependency

- **What:** Add `fflate` to `package.json` dependencies.
- **Deliverables:** Updated `package.json` and `package-lock.json`.
- **Dependencies:** None.

### Task 2: Implement WARC record construction module

- **What:** Create `src/warc.js` that constructs WARC `response` and `resource`
  records from in-memory artifacts. WARC record format: version line, header block,
  blank line, payload, two blank lines. Each artifact becomes one WARC record.
  Concatenate all records into a single `data.warc` byte array.
- **Deliverables:** `src/warc.js` with `buildWarc(url, timestamp, artifacts)` function
  returning `Uint8Array`.
- **Dependencies:** None.

### Task 3: Implement CDXJ index construction

- **What:** Create a function (can live in `src/wacz.js`) that generates a CDXJ
  index entry for the captured URL, pointing to byte offsets within `data.warc`.
- **Deliverables:** Function returning CDXJ index as string/Uint8Array.
- **Dependencies:** Task 2 (needs WARC byte offsets).

### Task 4: Implement WACZ assembly module

- **What:** Create `src/wacz.js` that orchestrates the full WACZ build:
  1. Build WARC records from artifacts (Task 2)
  2. Build CDXJ index (Task 3)
  3. Build `pages/pages.jsonl`
  4. Compute SHA-256 hashes of all internal files
  5. Assemble `datapackage.json` with resource entries
  6. Compute SHA-256 of canonical `datapackage.json`
  7. Sign hash with Ed25519
  8. Assemble `datapackage-digest.json`
  9. Call `fflate.zipSync()` with level 0 to produce `.wacz` bytes
  10. Compute SHA-256 of the final `.wacz` bytes for the content-addressed key
- **Deliverables:** `src/wacz.js` with `buildWacz(url, timestamp, artifacts, signingKey)`
  returning `{ waczBytes: Uint8Array, sha256: string }`.
- **Dependencies:** Tasks 1, 2, 3.

### Task 5: Integrate WACZ step into performCapture()

- **What:** After the existing R2 artifact writes in `performCapture()`, add:
  1. Import Ed25519 private key from env (lazy, cached)
  2. Call `buildWacz()` with in-memory artifacts
  3. Write `.wacz` to R2 at `captures/{sha256}.wacz` with appropriate metadata
  4. Update KV record with `waczKey` and `bundleHash`
- **Deliverables:** Updated `src/capture.js`, updated `src/kv.js`
  (`completeCapture` gains `waczKey` and `bundleHash` fields).
- **Dependencies:** Task 4.

### Task 6: Add Ed25519 key management

- **What:** Create a key generation script (`scripts/generate-keypair.js`) that
  generates an Ed25519 keypair, outputs the private key as JWK (for Worker secret)
  and the public key as base64 (for verification/distribution). Document the
  process for setting the Worker secret via `wrangler secret put`.
- **Deliverables:** `scripts/generate-keypair.js`, documentation in evolution log.
- **Dependencies:** None (can run in parallel with Tasks 2-4).

### Task 7: Add WACZ_SIGNING_KEY environment binding

- **What:** Update `wrangler.toml` to document the required secret. The actual
  secret is set via `wrangler secret put WACZ_SIGNING_KEY` (not in the toml file).
  Add a check in `performCapture()` that gracefully degrades if the signing key
  is not configured (skip WACZ, complete capture without it).
- **Deliverables:** Updated `wrangler.toml` (comment), updated `src/capture.js`
  (graceful degradation).
- **Dependencies:** Task 5.

## Risks and Concerns

### Risk 1: Ed25519 importKey Format Limitations (Medium)

Cloudflare Workers do not support raw private key import for Ed25519. The key must
be in PKCS8 or JWK format. If the Web Crypto API's Ed25519 support has undocumented
limitations (it is relatively new), we may need to fall back to `NODE-ED25519` or
use a pure-JS Ed25519 library (e.g., `@noble/ed25519`, ~2KB). **Mitigation:** Test
key import early in development. Have `@noble/ed25519` as a fallback plan.

### Risk 2: ctx.waitUntil() Cancellation on Slow Pages (Low)

If a page takes the full 25s to render and artifact storage takes another 2-3s,
the WACZ step has only ~2s remaining. This is still sufficient for the ~260ms
estimated WACZ cost, but leaves less margin for R2 write latency spikes.
**Mitigation:** Add timing instrumentation (`performance.now()` or `Date.now()`
deltas) to log how much time remains when WACZ bundling starts. If the remaining
budget is below a threshold (e.g., 1s), skip WACZ and log a warning.

### Risk 3: fflate zipSync Entry Ordering (Low)

There is a known fflate discussion about `zipSync` potentially misordering entries
due to JavaScript object key enumeration. WACZ spec does not mandate entry order in
the ZIP, but deterministic output is desirable for content-addressed hashing.
**Mitigation:** Verify entry order in tests. If ordering matters for hash
determinism, use an explicit file list approach rather than relying on object key
order.

### Risk 4: Large Screenshot Memory Pressure (Low)

A full-page screenshot at 1280px width and 8000px height as PNG could be 2-5MB.
Combined with HTML (up to 50MB in theory), the WACZ build would need to hold all
artifacts in memory simultaneously. The 128MB limit should accommodate this since
the browser is closed by that point, but edge cases exist.
**Mitigation:** The size-check safety valve (recommendation 4) handles this. Log
artifact sizes for monitoring.

### Risk 5: WARC Format Correctness (Medium)

WARC is a precisely specified format (ISO 28500). Incorrect record construction
(wrong content-length, missing headers, wrong line endings) produces invalid WARC
files that tools like `warcio` will reject. This is a data-minion concern more
than an edge concern, but the implementation runs at the edge.
**Mitigation:** Validate WARC output against `warcio` or similar tool in tests.
Include WARC format validation in the test suite.

### Risk 6: No Retry for WACZ Failure (Medium)

If WACZ construction fails after artifacts are already stored in R2, the capture
will be marked as failed even though the artifacts exist. There is no mechanism to
retry just the WACZ step.
**Mitigation:** Separate the failure modes. If artifacts store successfully but
WACZ fails, mark the capture as `complete` with a `waczStatus: 'failed'` field
rather than failing the entire capture. This preserves the capture value while
signaling that the WACZ needs attention. A future retry mechanism (Queue-based)
can pick up these cases.

## Additional Agents Needed

**None for the core implementation.** The current team (edge-minion, data-minion,
security-minion, test-minion) covers the required domains.

However, I want to flag two collaboration points:

1. **data-minion** should own WARC record format correctness and CDXJ index
   construction. These are archival data format concerns, not edge concerns. The
   edge-minion's role is ensuring the pipeline fits within Worker runtime
   constraints; the data-minion should specify the exact WARC header fields,
   record types, and CDXJ entry format.

2. **security-minion** should validate the Ed25519 key management approach
   (JWK in Worker secrets, anonymous signature format, what exactly gets signed).
   The signing is a security-critical operation; the edge-minion can confirm it
   runs fast enough, but the security-minion should confirm it is correct.
