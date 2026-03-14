## Task: Pipeline Integration and WACZ Integration Tests

Working directory: /Users/ben/github/benpeter/web-resource-ledger

### Context
The WACZ construction modules are complete (src/signing.js, src/warc.js, src/cdxj.js, src/wacz.js, src/canonical-json.js). Now integrate WACZ bundling into the capture pipeline and write integration tests.

The project uses vanilla JS, Cloudflare Workers, `@cloudflare/vitest-pool-workers` with Miniflare. The test config at `vitest.config.js` has a `SIGNING_KEY` binding (added in Task 1 -- ephemeral, generated at load time).

**Key design decisions:**
- Graceful degradation: if SIGNING_KEY is missing or signing fails, skip WACZ, complete capture without it
- Pass in-memory artifacts directly to buildWacz (don't read back from R2)
- Write .wacz to R2 at `captures/{sha256}.wacz` with content-type `application/wacz+zip`
- Update KV metadata with wacz info (key, bundleHash, size, status)
- Individual R2 artifacts remain alongside the WACZ

### What to do

**Part A: Modify `src/capture.js`** -- Add WACZ step after artifact storage

After the existing `Promise.all` that writes artifacts to R2, add WACZ bundling. Read the file first to find the right insertion point.

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
} catch (err) {
  // WACZ bundling failed unexpectedly -- capture still completes with individual artifacts
  // Distinguish from "no signing key" path (which returns null, no error)
  console.warn('WACZ bundling failed unexpectedly; capture completed without bundle');
}
```

**IMPORTANT (advisory from security review)**: Do NOT use a bare `catch {}`. Log a distinguishable message: `console.warn('WACZ bundling failed unexpectedly; capture completed without bundle')`. Never log the error object itself (it may contain key material details). This lets operators distinguish between "no SIGNING_KEY configured" (returns null silently) and "signing is failing in production due to a bug" (throws, logged as warning).

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

Read `src/kv.js` first to understand the existing `completeCapture` signature and update it accordingly.

**Part C: Create `test/wacz.test.js`** -- Integration tests

Test structure (use the existing `stubRenderer` pattern from `test/capture.test.js`):

```javascript
import { env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture } from '../src/capture.js';
import { createCapture, getCapture } from '../src/kv.js';
import { unzipSync } from 'fflate';
```

Setup: same pattern as capture.test.js -- create pending capture, mock header fetch, use stubRenderer.

**IMPORTANT (advisory from test-minion)**: Add cleanup for WACZ R2 objects in beforeEach. List all objects with prefix `captures/` and delete any `.wacz` files. The global SIGNING_KEY means WACZ runs in all tests, creating unpredictable content-addressed .wacz objects.

Test cases:
1. **WACZ written to R2**: After `performCapture` completes, list R2 objects matching `captures/*.wacz` -- at least one should exist
2. **WACZ contains expected files**: Read the .wacz from R2, unzip with `fflate.unzipSync`, verify it contains: `datapackage.json`, `datapackage-digest.json`, `archive/data.warc`, `indexes/index.cdxj`, `pages/pages.jsonl`
3. **datapackage.json has correct structure**: Parse the datapackage.json from the WACZ, verify it has `profile`, `wacz_version`, `resources` array with 3 entries (data.warc, index.cdxj, pages.jsonl), each with `name`, `path`, `hash`, `bytes`
4. **Resource hashes are valid**: For each resource in datapackage.json, compute SHA-256 of the actual file bytes from the WACZ and verify it matches the `hash` field
5. **datapackage-digest.json has valid signature**: Parse it, extract `signedData`, verify the Ed25519 signature over the `signedData.hash` using the embedded `publicKey`
6. **KV record includes wacz info**: After capture, verify KV record has `wacz.key`, `wacz.bundleHash`, `wacz.size`
7. **Signing round-trip** (acceptance criteria test): Create a known manifest, compute bundleHash, sign it, verify with the public key -- assert true. Then tamper with one byte and verify -- assert false. This can use the signing module directly.
8. **Canonical JSON stability** (acceptance criteria test): Create the same manifest object with keys in different insertion orders, canonicalize both, assert byte-identical output.

**IMPORTANT (advisory from test-minion)**: Add a test for graceful degradation:
9. **Graceful degradation**: Call `buildWacz` directly with an env that has no SIGNING_KEY (e.g., `{}`). Assert it returns null. Verify that captures can still complete without WACZ.

**Advisory note (from test-minion)**: Consider adding unit-level assertions for WARC and CDXJ:
10. **WARC structure**: Test that `buildWarc` produces records with correct `WARC/1.1` header, `\r\n` line endings, valid WARC-Record-ID format
11. **CDXJ SURT transform**: Test that `toSurt('https://example.com/path')` produces `com,example)/path`

For tests 7 and 8, you can put them in `test/wacz.test.js` under separate `describe` blocks.

**Important testing notes:**
- Use `fflate` for both ZIP writing (production) and reading (tests). `unzipSync` is available.
- For signature verification in tests: import the public key from `datapackage-digest.json`, use `crypto.subtle.importKey('raw', ...)` and `crypto.subtle.verify('Ed25519', ...)`
- `stubRenderer` returns `{ screenshot: Uint8Array, html: string }` -- check `test/capture.test.js` for the exact fixture pattern
- Clean up R2 WACZ objects in `beforeEach` -- list all objects with prefix `captures/` and delete any `.wacz` files

**Part D: Verify existing tests pass**

After all changes, run `vitest run` and confirm ALL tests pass (existing capture tests + new wacz tests + signing tests + canonical-json tests). If any existing tests fail, diagnose and fix the issue.

### What NOT to do
- Do NOT modify `test/capture.test.js` -- existing tests must pass unchanged
- Do NOT modify `test/signing.test.js` or `test/canonical-json.test.js`
- Do NOT add console.log to signing.js
- Do NOT use TypeScript
- Do NOT make WACZ bundling mandatory (must degrade gracefully)
- Do NOT use a bare `catch {}` -- always log distinguishable messages

### Existing patterns to follow
- `test/capture.test.js` for test structure, fixtures, cleanup patterns
- `src/capture.js` for the pipeline flow and error handling
- `src/kv.js` for KV update patterns

### Deliverables
1. Modified `src/capture.js` -- WACZ step integrated after artifact storage
2. Modified `src/kv.js` -- completeCapture accepts optional wacz parameter
3. `test/wacz.test.js` -- 9-11 integration test cases
4. All existing tests in `test/capture.test.js` pass

### Success criteria
- `vitest run` passes all tests (existing + new)
- After a capture with stubRenderer, R2 contains a .wacz object
- KV record for the capture includes wacz metadata
- Signing round-trip test passes (sign -> verify = true, tamper -> verify = false)
- Canonical JSON stability test passes
- Graceful degradation test passes (no SIGNING_KEY -> null, capture completes)
