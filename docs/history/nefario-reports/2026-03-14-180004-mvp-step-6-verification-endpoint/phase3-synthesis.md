# Phase 3: Synthesis -- Verification Endpoint

## Conflict Resolutions

### CONFLICT 1: Key Pinning Strategy (RESOLVED: Server Key)

**security-minion**: Use `env.SIGNING_KEY` exclusively. The embedded public key enables key-substitution attacks -- an attacker who replaces the WACZ can replace both the signature and the embedded key, and verification passes against the attacker's key.

**ux-strategy-minion**: Use the embedded key for MVP. Key rotation breaks verification of old captures if using the server key. The backlog already has key versioning and old key archive items.

**Resolution: Server key wins.** The security-minion's position is correct and the `wacz.js` code itself says "Verifiers MUST pin against an operator-published key, not trust the embedded key blindly" (line 99-100). Using the embedded key would create a verification endpoint that proves nothing useful -- any attacker who tampers with R2 can substitute their own key pair. The key-rotation concern is real but is the lesser risk:

1. Key rotation is an operational event the operator controls. Key substitution is an attack the operator cannot detect.
2. Key rotation breaking old verifications is a documented, expected limitation with a clear post-MVP fix (key versioning, already backlogged).
3. Using the embedded key undermines the entire security model of the verification endpoint.

The endpoint returns 503 if `env.SIGNING_KEY` is not configured -- never silently skips signature verification.

### CONFLICT 2: Cache-Control Strategy (RESOLVED: Conditional Split)

**api-design-minion + ux-strategy-minion**: `Cache-Control: public, max-age=31536000, immutable` for 200 responses.

**security-minion**: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` because `immutable` persists stale verification results after key rotation/compromise.

**ux-strategy-minion (nuanced)**: Immutable for `verified: true`, `no-store` for `verified: false`.

**Resolution: Conditional split with ux-strategy-minion's refinement, but using security-minion's shorter TTL.** The reasoning:

1. The captures and their WACZ files are content-addressed and immutable, but the verification *judgment* depends on a mutable trust anchor (the server signing key). security-minion is right that `immutable` is wrong for a judgment that can change.
2. ux-strategy-minion is right that `verified: false` should never be cached -- transient corruption or operational issues could produce false negatives that should not persist.
3. For `verified: true`: use `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`. The 24-hour hard TTL means key compromise propagates within a day. The 7-day stale-while-revalidate maintains performance under normal conditions.
4. For `verified: false`: use `Cache-Control: no-store`. Matches error response pattern.
5. For 404: use `Cache-Control: no-store`. Matches existing pattern.

### CONFLICT 3: Response Shape -- checks Array vs Object (RESOLVED: Array)

**api-design-minion**: `checks` as an array of `{ name, passed, detail? }` objects.

**ux-strategy-minion**: `checks` as a flat object with `pass | fail | skip` string values.

**Resolution: Array format wins.** The array format `[{ name, passed, detail? }]` is:
1. More extensible -- new checks are new array entries, no schema change.
2. Consistent with the extensibility narrative (future checks like `resourceHashes`, `timestamp`).
3. The `detail` field on failed checks provides diagnostic value for operators without exposing sensitive data.

However, adopting ux-strategy-minion's `pass | fail | skip` string enum instead of booleans for forward-compatibility. The final shape is:

```json
{
  "checks": [
    { "name": "artifactHashes", "status": "pass" },
    { "name": "bundleHash", "status": "pass" },
    { "name": "signature", "status": "pass" }
  ]
}
```

Failed checks include `detail` (human-readable, never contains hash values):

```json
{ "name": "bundleHash", "status": "fail", "detail": "Recomputed hash does not match stored bundleHash" }
```

### CONFLICT 4: No-WACZ Captures (CONSENSUS: 404)

All specialists agree: return 404 with the same static "Capture not found" message. This avoids leaking information about whether the capture exists but lacks a WACZ, and keeps the verification response clean -- if you get a 200, it always contains a real verification result.

### CONFLICT 5: Three Checks vs Two (RESOLVED: Three)

**api-design-minion**: Two checks for MVP -- `bundleHash` and `signature`.

**ux-strategy-minion + security-minion**: Three checks -- `artifactHashes`, `bundleHash`, and `signature`. The artifact hash check verifies individual file hashes inside the WACZ against `datapackage.json` entries.

**Resolution: Three checks.** security-minion argues this is needed for complete tamper-evidence ("proves every byte is authentic"). ux-strategy-minion argues the three checks map directly to the three verification steps in the issue description. The implementation cost is low -- the WACZ is already downloaded and unzipped, so checking individual file hashes is just iterating `datapackage.json.resources[]` and comparing SHA-256.

---

## Delegation Plan

**Team name**: mvp-step-6-verification-endpoint
**Description**: Build the public verification endpoint (`GET /v1/verify/{id}`) that proves stored captures are authentic and unmodified.

### Task 1: Implement verification core logic

- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The verification function is the security-critical core of this feature. Its trust model (server key only, three-check pipeline) must be correct before the endpoint handler and tests are built on top of it. Hard to reverse (all tests and the handler depend on this contract). High blast radius (Tasks 2, 3, 4 all depend on it).
- **Prompt**: |
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

    1. **Parse ZIP**: Use `unzipSync` from `fflate` (already a dependency). If the ZIP is invalid, return all checks as `'fail'` with `detail: 'WACZ bundle is not a valid ZIP archive'`.

    2. **Extract files**: Get `datapackage.json` and `datapackage-digest.json` from the ZIP. If either is missing, return appropriate failures.

    3. **Check: artifactHashes**: For each resource in `datapackage.json.resources[]`, find the corresponding file in the ZIP at `resource.path`, compute its SHA-256 hash, and compare to `resource.hash`. If ANY resource hash mismatches, the check fails. Use generic detail: `'One or more artifact hashes do not match'` -- do NOT identify which artifact failed (security requirement: prevents attacker from knowing which file to fix).

    4. **Check: bundleHash**: Recompute `sha256(canonicalize(datapackage))` where `datapackage` is the parsed JSON object from `datapackage.json`. Compare to `signedData.hash` in `datapackage-digest.json`. Use `canonicalize` from `../src/canonical-json.js` and `sha256` from `../src/warc.js`. Detail on failure: `'Recomputed hash does not match stored bundleHash'`.

    5. **Check: signature**: Verify the Ed25519 signature from `signedData.signature` over the UTF-8 bytes of `signedData.hash` (the bundleHash string) using the provided `publicKeyBytes` parameter. Use `verifySignature` from `../src/signing.js`. Detail on failure: `'Ed25519 signature verification failed'`.

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
- **Deliverables**: `src/verify.js`
- **Success criteria**: Pure function that correctly verifies WACZ integrity with three-check pipeline, uses only the provided server public key, never leaks hash values in detail messages.

### Task 2: Wire up endpoint handler and rate limiter

- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Wire up GET /v1/verify/{id} endpoint handler and rate limiter

    Add the verification endpoint to the Cloudflare Worker router and create the HTTP handler that orchestrates KV lookup, R2 fetch, verification, and response assembly.

    ### Context

    Task 1 produced `src/verify.js` with `verifyWacz(waczBytes, publicKeyBytes)`. This task wires it into the HTTP layer. The endpoint is public (no authentication), rate-limited, and cached.

    ### Changes to make

    #### 1. Add route to `src/index.js`

    Add to the `routes` array (before the catch-all, after the artifact route):
    ```js
    ['GET', /^\/v1\/verify\/(cap_[a-f0-9]{32})$/, handleVerifyCapture],
    ```

    Import at top of file:
    ```js
    import { verifyWacz } from './verify.js';
    import { getSigningKeys } from './signing.js';
    ```

    #### 2. Implement `handleVerifyCapture` in `src/index.js`

    The handler follows this flow:

    **Step 1: Rate limit check**
    ```js
    if (env.VERIFY_RATE_LIMITER) {
      const { success } = await env.VERIFY_RATE_LIMITER.limit({
        key: request.headers.get('CF-Connecting-IP') || 'unknown',
      });
      if (!success) return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
    }
    ```

    **Step 2: Signing key availability check**
    Call `getSigningKeys(env)`. If `null`, return `problemResponse(503, 'Verification service is not configured')`. This handles the case where `env.SIGNING_KEY` is not set.

    **Step 3: KV lookup (fast-fail)**
    Call `getCapture(env.KV, captureId)`. Return 404 (`'Capture not found'`, with `Cache-Control: no-store`) if:
    - Record is null (does not exist)
    - Record status is not `'complete'`
    - Record has no `wacz` field (capture completed without signing)

    This is the primary resource-exhaustion defense -- cheap KV read before expensive R2 fetch.

    **Step 4: R2 fetch**
    Fetch the WACZ from R2 using `record.wacz.key`. If the R2 object is null (data loss), return 200 with `verified: false` and all checks as `'fail'` with detail `'WACZ bundle not found in storage'`. Do NOT return 500 -- this is a verification result, not a server error.

    **Step 5: Size guard**
    Check `obj.size`. If > 100MB (104857600 bytes), return `problemResponse(422, 'WACZ bundle exceeds maximum verifiable size')`.

    **Step 6: Verify**
    ```js
    const waczBytes = new Uint8Array(await obj.arrayBuffer());
    const result = verifyWacz(waczBytes, keys.publicKeyBytes);
    ```

    **Step 7: Build response**
    ```js
    const body = {
      verified: result.verified,
      capture: {
        id: record.captureId,
        url: record.url,
        createdAt: record.createdAt,
        completedAt: record.completedAt,
      },
      wacz: result.capture || null,
      checks: result.checks,
    };
    ```

    **Step 8: Cache-Control and headers**
    - If `result.verified === true`: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`
    - If `result.verified === false`: `Cache-Control: no-store`
    - Always: `Access-Control-Allow-Origin: *`

    Return via `jsonResponse(body, 200, headers)`.

    #### 3. Add `verifyUrl` to retrieval response

    In the existing `handleGetCapture` function, add a `verifyUrl` field to the response body when the capture has WACZ data:
    ```js
    if (record.wacz) {
      body.wacz = { /* existing fields */ };
      body.verifyUrl = `${base}/v1/verify/${captureId}`;
    }
    ```

    This completes the journey chain: POST -> status -> capture -> verify.

    #### 4. Add rate limiter binding to `wrangler.toml`

    Add a new `[[unsafe.bindings]]` block:
    ```toml
    [[unsafe.bindings]]
    name = "VERIFY_RATE_LIMITER"
    type = "ratelimit"
    namespace_id = "1002"
    simple = { limit = 60, period = 60 }
    ```

    Use `namespace_id = "1002"` (different from the capture rate limiter's `"1001"`).

    ### What NOT to do

    - Do NOT modify `src/verify.js` (Task 1's deliverable).
    - Do NOT write tests (Tasks 3 and 4 handle that).
    - Do NOT add any new dependencies.
    - Do NOT change the behavior of any existing endpoints (except adding `verifyUrl` to retrieval).
    - Do NOT add CORS preflight handling (not needed for GET-only endpoint with simple headers).

    ### Reference: existing patterns

    - Rate limiting: see `handleCreateCapture` in `src/index.js` (lines 66-71)
    - KV lookup + 404: see `handleGetCapture` in `src/index.js` (lines 121-128)
    - Response assembly: see `handleGetCapture` for the pattern of building body + headers
    - `jsonResponse` and `problemResponse` from `src/responses.js`

    ### Deliverables

    - Modified `src/index.js` (new route, new handler, `verifyUrl` in retrieval)
    - Modified `wrangler.toml` (new rate limiter binding)

    ### Success criteria

    - `GET /v1/verify/cap_{valid_id}` returns 200 with verification result
    - `GET /v1/verify/cap_{unknown_id}` returns 404
    - Rate limiting returns 429 with `Retry-After: 60`
    - Missing signing key returns 503
    - `verifyUrl` appears in retrieval response when WACZ is present
    - No new dependencies added
- **Deliverables**: Modified `src/index.js`, modified `wrangler.toml`
- **Success criteria**: Endpoint is routable, rate-limited, returns correct response shape with appropriate cache headers, and retrieval response includes `verifyUrl`.

### Task 3: Write verification unit tests

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
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

      // bundleHash = sha256 of canonical JSON
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
          hash: bundleHash,
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
- **Deliverables**: `test/verify.test.js`
- **Success criteria**: ~12 unit tests covering happy path, all three tamper detection modes, error handling, and security properties. Key substitution attack test present and passing.

### Task 4: Write verification integration tests

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Write integration tests for the verification endpoint

    Create `test/verify-integration.test.js` with HTTP-level integration tests for `GET /v1/verify/{id}`.

    ### Context

    The verification endpoint is wired up in `src/index.js`. It uses `verifyWacz` from `src/verify.js` internally. These tests exercise the full HTTP path: route matching, KV lookup, R2 fetch, verification, response shape, headers, and error cases.

    ### Test file structure

    **File**: `test/verify-integration.test.js`

    **Imports and setup** -- follow the pattern from `test/wacz.test.js`:
    ```js
    import { env, SELF, fetchMock } from 'cloudflare:test';
    import { describe, it, expect, beforeEach, afterEach } from 'vitest';
    import { performCapture } from '../src/capture.js';
    import { createCapture, getCapture, completeCapture } from '../src/kv.js';
    import { unzipSync, zipSync } from 'fflate';
    ```

    **Test capture ID**: Use a unique SEED_ID to avoid collisions with other test files (`isolatedStorage: false`):
    ```js
    const TEST_ID = 'cap_' + 'f'.repeat(32);
    const TEST_URL = 'https://example.com';
    const TEST_IP = '93.184.216.34';
    const TEST_ORIGIN = 'https://example.com';

    const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const TEST_HTML = '<html><body>verify test</body></html>';

    const stubRenderer = async () => ({
      screenshot: PNG_BYTES,
      html: TEST_HTML,
    });
    ```

    **beforeEach**: Clean up and create a REAL capture with a signed WACZ:
    ```js
    beforeEach(async () => {
      // Clean KV
      await env.KV.delete(`capture:${TEST_ID}`);
      // Clean R2 WACZ objects
      const listed = await env.BUCKET.list({ prefix: 'captures/' });
      await Promise.all(
        listed.objects
          .filter(obj => obj.key.endsWith('.wacz') || obj.key.includes(TEST_ID))
          .map(obj => env.BUCKET.delete(obj.key)),
      );
      // Activate fetchMock for header fetch
      fetchMock.activate();
      fetchMock.disableNetConnect();
      fetchMock.get(TEST_ORIGIN)
        .intercept({ path: '/', method: 'GET' })
        .reply(200, 'ok', { headers: { 'content-type': 'text/html' } });

      // Create a real capture with signed WACZ
      await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
      await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);
    });

    afterEach(() => {
      fetchMock.deactivate();
    });
    ```

    This uses `performCapture()` directly (same pattern as `test/wacz.test.js`) to produce a real, signed WACZ in R2. No `ctx.waitUntil()` timing issues.

    ### Tests to write

    **describe('GET /v1/verify/{id} -- happy path')**:

    1. `returns 200 with verified: true for valid capture` -- fetch `/v1/verify/{TEST_ID}`, assert status 200, `body.verified === true`.

    2. `response has correct shape` -- assert `body` has `verified` (boolean), `capture` (object with `id`, `url`, `createdAt`, `completedAt`), `wacz` (object), `checks` (array of 3).

    3. `all three checks pass` -- assert each check in `body.checks` has `status: 'pass'` and `name` is one of `artifactHashes`, `bundleHash`, `signature`.

    4. `capture.id matches request` -- assert `body.capture.id === TEST_ID`.

    **describe('GET /v1/verify/{id} -- tamper detection')**:

    5. `detects tampered WACZ content` -- after `beforeEach` creates a valid capture:
       - Read the KV record to get the WACZ key: `const record = await getCapture(env.KV, TEST_ID);`
       - Fetch the WACZ from R2: `const obj = await env.BUCKET.get(record.wacz.key);`
       - Unzip, corrupt an inner file (append byte to `archive/data.warc`), re-zip, overwrite R2:
         ```js
         const waczBytes = new Uint8Array(await obj.arrayBuffer());
         const files = unzipSync(waczBytes);
         const warc = files['archive/data.warc'];
         const corrupted = new Uint8Array(warc.length + 1);
         corrupted.set(warc);
         corrupted[warc.length] = 0xFF;
         files['archive/data.warc'] = corrupted;
         // Re-zip with STORE mode
         const repackaged = zipSync(
           Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 0 }]]))
         );
         await env.BUCKET.put(record.wacz.key, repackaged);
         ```
       - Fetch `/v1/verify/{TEST_ID}`, assert `body.verified === false`.
       - Assert the `artifactHashes` check has `status: 'fail'`.

    6. `returns 200 (not 4xx) for failed verification` -- same tampered scenario, assert `res.status === 200`.

    **describe('GET /v1/verify/{id} -- error cases')**:

    7. `404 for unknown capture ID` -- use `cap_` + `'0'.repeat(32)`, assert 404, RFC 9457 shape, detail does not contain the ID.

    8. `404 for pending capture` -- create a pending-only capture (no `performCapture`), fetch verify, assert 404.

    9. `404 for capture without WACZ` -- create a capture and complete it without WACZ data:
       ```js
       const noWaczId = 'cap_' + 'e'.repeat(31) + 'f';
       await env.KV.delete(`capture:${noWaczId}`);
       await createCapture(env.KV, noWaczId, TEST_URL, TEST_IP);
       await completeCapture(env.KV, noWaczId, {
         screenshot: `captures/${noWaczId}/screenshot.png`,
         html: `captures/${noWaczId}/rendered.html`,
       }, null);
       ```
       Fetch `/v1/verify/${noWaczId}`, assert 404.

    10. `404 for malformed capture ID` -- fetch `/v1/verify/badid`, assert 404.

    **describe('GET /v1/verify/{id} -- headers')**:

    11. `Cache-Control: public with max-age on verified: true` -- happy path response should have `Cache-Control` containing `public` and `max-age=86400`.

    12. `Cache-Control: no-store on verified: false` -- tampered scenario, assert `Cache-Control: no-store`.

    13. `Cache-Control: no-store on 404` -- unknown ID, assert `Cache-Control: no-store`.

    14. `CORS header present` -- assert `Access-Control-Allow-Origin: *` on 200 response.

    15. `security headers present` -- assert `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`.

    **describe('GET /v1/verify/{id} -- security')**:

    16. `ip field absent from response` -- assert `body.ip` is undefined and `JSON.stringify(body)` does not contain `TEST_IP`.

    17. `R2 keys absent from response` -- assert `JSON.stringify(body)` does not contain `captures/` (the R2 key prefix).

    **describe('GET /v1/captures/{id} -- verifyUrl')**:

    18. `retrieval response includes verifyUrl when WACZ present` -- fetch `/v1/captures/{TEST_ID}`, assert `body.verifyUrl` matches `/v1/verify/${TEST_ID}`.

    19. `retrieval response omits verifyUrl when no WACZ` -- use the no-WACZ capture from test 9, fetch retrieval, assert `body.verifyUrl` is undefined.

    ### Important notes

    - Use `SELF.fetch()` for all HTTP requests (standard Cloudflare Workers test pattern).
    - The `beforeEach` creates a real WACZ via `performCapture()` with `stubRenderer`. This avoids fake hashes and produces a genuinely signed WACZ that the verification endpoint can validate.
    - For the tamper test (test 5): use the surgical approach -- unzip, modify inner file, re-zip. Do NOT flip random bytes in the outer ZIP (that might make it unparseable rather than producing a hash mismatch).
    - Rate limiter testing: the `VERIFY_RATE_LIMITER` binding may not be available in the miniflare test environment. If `env.VERIFY_RATE_LIMITER` is undefined, skip the rate limit test with a `it.skipIf` guard and a comment explaining why. Check whether it exists first.
    - All test IDs must be unique and not collide with IDs in other test files. The existing files use: `'a'.repeat(32)` (retrieval), `'wacztest1234567890abcdef1234'` (wacz). Use `'f'.repeat(32)` for the main test ID and distinct patterns for helper IDs.

    ### What NOT to do

    - Do NOT write unit tests (Task 3 handles those).
    - Do NOT modify any source files.
    - Do NOT test the verification logic in isolation -- test it through the HTTP endpoint.
    - Do NOT hardcode WACZ bytes or hash values.

    ### Deliverables

    - `test/verify-integration.test.js` with ~19 integration tests

    ### Success criteria

    - All tests pass when run with `npx vitest run test/verify-integration.test.js`
    - Happy path confirms `verified: true` against a real, signed WACZ
    - Tamper detection confirms `verified: false` with correct check identification
    - All error cases return correct status codes and response shapes
    - Headers (cache, CORS, security) verified
    - No sensitive data leaks in responses
    - `verifyUrl` journey coherence confirmed
- **Deliverables**: `test/verify-integration.test.js`
- **Success criteria**: ~19 integration tests covering happy path, tamper detection, error cases, headers, security, and journey coherence. All pass against real signed WACZ data.

---

### Cross-Cutting Coverage

| Dimension | Coverage | Justification |
|-----------|----------|---------------|
| **Testing** | Tasks 3, 4 | ~31 tests total: 12 unit + 19 integration. Tamper detection, key substitution, error handling, headers, security leaks. |
| **Security** | Task 1 (server-key-only trust model, no hash leaks, run-all-checks), Task 2 (rate limiter, size guard, KV-first fast-fail) | security-minion's recommendations are baked into the implementation prompts. Server key pinning is the core security decision. |
| **Usability -- Strategy** | Task 2 (verifyUrl journey coherence), response shape (three named checks with pass/fail/skip) | ux-strategy-minion's JTBD analysis shaped the response format and the retrieval-to-verify link. |
| **Usability -- Design** | Not included | No user-facing UI in this task. API-only endpoint consumed by developers programmatically. |
| **Documentation** | Phase 8 (post-execution) | Evolution log, backlog update, and any API docs will be handled in post-execution phases per project convention. |
| **Observability** | Not included | No new runtime services. Single endpoint within existing Worker. Server-side `console.log` for detailed failure diagnostics is specified in the implementation prompt (security-minion recommendation). Structured logging is a backlog item and not warranted for a single new endpoint. |

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. The plan has no UI components (no ux-design-minion, no accessibility-minion), no web-facing pages (no sitespeed-minion), no multi-service coordination (no observability-minion), and no user-facing documentation changes (no user-docs-minion). All five discretionary reviewers' domain signals are absent from this plan.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

See detailed resolutions above. Summary:

1. **Key pinning**: Server key wins over embedded key (security over convenience).
2. **Cache-Control**: Conditional split -- `max-age=86400` for verified:true, `no-store` for verified:false (compromise between aggressive caching and key rotation safety).
3. **Response shape**: Array of checks with `pass/fail/skip` strings (combines api-design-minion's extensible array with ux-strategy-minion's future-proof enum).
4. **No-WACZ captures**: 404 (universal consensus).
5. **Three checks vs two**: Three checks for complete tamper-evidence.

### Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Key rotation breaks all existing verifications | HIGH (operational impact) | Accepted limitation for MVP. Documented. Backlog has key versioning + old key archive. Response schema supports future `keyFingerprint` field. |
| WACZ download on every cold verification request | MEDIUM (latency) | 24-hour cache TTL means most requests are cached. KV-first fast-fail prevents R2 reads for invalid requests. WACZ files are small at MVP scale. Monitor P95 latency. |
| ZIP parsing attack surface (zip bombs, path traversal) | MEDIUM | 100MB size guard before parsing. `fflate` used with known filenames only. Only specific files extracted by name. |
| R2 object missing for completed capture (data loss) | LOW | Returns `verified: false` with descriptive detail, not 500. Graceful degradation. |
| `isolatedStorage: false` test pollution | LOW | Unique SEED_ID per test file. Explicit cleanup in `beforeEach`. Established pattern. |

### Execution Order

```
Phase 4 Execution:

Batch 1 (no dependencies):
  Task 1: Implement verification core logic [APPROVAL GATE]

Batch 2 (after Task 1 approved):
  Task 2: Wire up endpoint handler and rate limiter
  Task 3: Write verification unit tests          [parallel]

Batch 3 (after Task 2):
  Task 4: Write verification integration tests

Phase 5: Code review (code-review-minion, lucy, margo)
Phase 6: Test execution (lint + vitest)
Phase 8: Documentation (evolution log, backlog update)
```

Gate position: After Task 1 (verification core logic), before Tasks 2/3/4 proceed. This is the single high-value gate -- the security-critical trust model and verification algorithm.

### External Skills

No external skills detected in project.

### Verification Steps

After all tasks complete:
1. `npx vitest run` -- all tests pass (existing + new)
2. Verify `GET /v1/verify/{valid_id}` returns `verified: true` with three passing checks
3. Verify tamper detection: modify R2 WACZ, re-verify returns `verified: false`
4. Verify `GET /v1/captures/{id}` includes `verifyUrl` field
5. Verify 404 for unknown/pending/no-WACZ captures
6. Verify Cache-Control headers differ between verified:true and verified:false
7. Verify no sensitive data (ip, R2 keys, hash values) in any response
