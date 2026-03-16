# Phase 3: Synthesis -- RFC 3161 Timestamp Integration

## Delegation Plan

**Team name**: rfc3161-timestamps
**Description**: Integrate RFC 3161 timestamping into the WACZ signing pipeline with TSA-issued temporal proofs, evolve datapackage-digest.json to a signatures array, update verification pipeline and verification page.

---

### Task 1: Create `src/rfc3161.js` -- DER codec and TSA client

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    You are implementing RFC 3161 timestamping for a Cloudflare Workers project (Web Resource Ledger). Create a single new file `src/rfc3161.js` that contains a minimal, purpose-built DER encoder/decoder and TSA HTTP client.

    ## Context

    This project has 2 runtime dependencies (fflate, @cloudflare/playwright) and follows YAGNI/KISS strictly. Do NOT add any npm dependencies. The file should be self-contained, ~150-250 lines. The existing codebase pattern is purpose-built modules: `warc.js` hand-builds WARC records, `cdxj.js` hand-builds CDXJ, `signing.js` does raw Ed25519 with crypto.subtle. Follow this pattern exactly.

    ## What to Build

    **Exported functions:**

    1. `requestTimestamp(tsaUrl, bundleHash, timeoutMs = 3000)` -- Main entry point.
       - `bundleHash` is a string like `"sha256:abcdef..."` (same format used by Ed25519 signing in `wacz.js` line 89)
       - Extract the hex hash from the `sha256:` prefix, convert to 32 bytes
       - Build a DER-encoded `TimeStampReq` with: version=1, messageImprint (SHA-256 OID + hash), nonce (16 random bytes from `crypto.getRandomValues()`), certReq=true
       - POST to `tsaUrl` with `Content-Type: application/timestamp-query`, using `AbortSignal.timeout(timeoutMs)`
       - Parse the `TimeStampResp`: extract status, navigate into the CMS SignedData to find TSTInfo, extract messageImprint hash and genTime
       - **Validate at capture time**: (a) response status is 0 (granted), (b) nonce in response matches request nonce, (c) messageImprint hash in TSTInfo matches submitted hash
       - On success, return `{ token: <base64 of raw DER TimeStampToken bytes>, genTime: <ISO string>, tsa: tsaUrl }`
       - On ANY failure (network, timeout, parse error, validation failure), throw (caller will catch)

    2. `verifyTimestamp(tokenBase64, expectedBundleHash)` -- For the verification pipeline.
       - Decode base64 token back to DER bytes
       - Parse the TimeStampToken to extract TSTInfo
       - Extract messageImprint hash and genTime
       - Verify messageImprint hash matches expectedBundleHash (extract hex from `sha256:` prefix)
       - Return `{ valid: true, genTime: <ISO string> }` or `{ valid: false, reason: <string> }`
       - This does NOT verify the TSA's cryptographic signature (deferred -- requires X.509 chain validation not feasible in Workers)

    **Internal helpers (not exported):**

    - `writeTLV(tag, content)` -- Encode a DER TLV (tag-length-value). Handle lengths up to 4 bytes (sufficient for TSA responses up to 64KB)
    - `readTLV(buf, offset)` -- Decode a DER TLV at offset. Return `{ tag, length, value: Uint8Array, end: nextOffset }`. Validate length against remaining buffer.
    - `writeLength(n)` -- DER definite-length encoding
    - `readLength(buf, offset)` -- DER length decoding. Reject indefinite-length (DER forbids it)
    - OID constants: SHA-256 OID bytes (`60 86 48 01 65 03 04 02 01`), id-ct-TSTInfo OID, id-signedData OID
    - `navigatePath(buf, offset, tagPath)` -- Navigate nested SEQUENCE/CONTEXT-TAGGED structures by tag indices to reach a specific leaf. This is the key helper for parsing the deeply nested CMS structure.

    **DER encoding for TimeStampReq:**

    The structure is:
    ```
    SEQUENCE {                           -- TimeStampReq
      INTEGER 1                          -- version
      SEQUENCE {                         -- MessageImprint
        SEQUENCE {                       -- AlgorithmIdentifier
          OID 2.16.840.1.101.3.4.2.1    -- SHA-256
          NULL                           -- parameters
        }
        OCTET STRING <32 bytes>          -- hash
      }
      INTEGER <16 random bytes>          -- nonce
      [0] BOOLEAN TRUE                   -- certReq (implicit tag)
    }
    ```

    Use template-based encoding: the only variable parts are the 32-byte hash and the nonce. Pre-compute the static DER bytes and splice in the variable parts.

    **DER parsing for TimeStampResp:**

    The structure is:
    ```
    SEQUENCE {                           -- TimeStampResp
      SEQUENCE {                         -- PKIStatusInfo
        INTEGER <status>                 -- 0 = granted
      }
      [0] SEQUENCE {                     -- TimeStampToken (ContentInfo)
        OID 1.2.840.113549.1.7.2        -- id-signedData
        [0] SEQUENCE {                   -- SignedData
          INTEGER <version>
          SET { ... }                    -- digestAlgorithms
          SEQUENCE {                     -- encapContentInfo
            OID 1.2.840.113549.1.9.16.1.4  -- id-ct-TSTInfo
            [0] OCTET STRING {           -- eContent (TSTInfo DER)
              SEQUENCE {                 -- TSTInfo
                INTEGER <version>
                OID <policy>
                SEQUENCE {               -- MessageImprint
                  SEQUENCE { OID, NULL } -- AlgorithmIdentifier
                  OCTET STRING <hash>    -- hashedMessage
                }
                INTEGER <serialNumber>
                GeneralizedTime <genTime>
                ...
                INTEGER <nonce>          -- optional
              }
            }
          }
          ...
        }
      }
    }
    ```

    Navigate by tags. Do NOT assume fixed byte positions -- different TSAs produce different certificate chains and signed attributes. Use the `navigatePath` helper to step through SEQUENCEs by index.

    **Security guardrails (non-negotiable):**

    - Maximum input size: 64KB. Reject any TSA response larger than this.
    - All length fields validated against remaining buffer size before reading
    - Tag bytes checked explicitly (prevent type confusion)
    - No reads beyond declared TLV lengths
    - DER only: reject indefinite-length encoding
    - Nonce: 16 bytes from `crypto.getRandomValues()` (128-bit entropy)

    **Constants:**
    ```js
    const TSA_TIMEOUT_MS = 3000;
    const MAX_RESPONSE_BYTES = 65536; // 64 KB
    ```

    ## File header comment

    Follow the existing pattern (see `signing.js`, `warc.js`):
    ```js
    /*
     * rfc3161.js -- RFC 3161 timestamp module
     *
     * Minimal DER encoder/decoder for RFC 3161 TimeStampReq/TimeStampResp.
     * Purpose-built for the WRL signing pipeline -- not a general-purpose ASN.1 library.
     *
     * Capture-time: builds TimeStampReq, POSTs to TSA, validates response
     * (status, nonce, messageImprint). Stores raw token for third-party verification.
     *
     * Verification-time: extracts TSTInfo from stored token, verifies
     * messageImprint matches bundleHash. Full CMS certificate chain validation
     * is deferred (not feasible in Cloudflare Workers).
     *
     * @security: Certificate chain validation is deferred. See docs/backlog.md.
     *
     * Tests: test/rfc3161.test.js
     */
    ```

    ## What NOT to do

    - Do NOT add any npm dependencies
    - Do NOT build a general-purpose ASN.1 library -- only handle TimeStampReq and TimeStampResp
    - Do NOT implement CMS signature verification or X.509 certificate chain validation
    - Do NOT create multiple files -- everything goes in `src/rfc3161.js`
    - Do NOT export the internal DER helpers (writeTLV, readTLV, etc.)
    - Do NOT handle SET sorting, constructed OCTET STRINGs, or indefinite-length encoding
    - Do NOT name the file `asn1.js` or `der.js` -- it must be `rfc3161.js` to signal its scope

    ## Reference files

    Read these for context on the project's coding style:
    - `src/signing.js` -- Ed25519 signing module (similar pattern: crypto + env integration)
    - `src/warc.js` -- WARC builder (similar pattern: hand-built binary format)
    - `src/wacz.js` -- WACZ assembler (caller of the new module)

- **Deliverables**: `src/rfc3161.js` (~150-250 lines)
- **Success criteria**: Module exports `requestTimestamp()` and `verifyTimestamp()`. DER encoding produces valid TimeStampReq. Response parsing extracts status, genTime, messageImprint hash, nonce from real DigiCert responses.

---

### Task 2: Evolve `datapackage-digest.json` format and integrate TSA into WACZ pipeline

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: The `datapackage-digest.json` format change (flat `signedData` to `signatures` array) is the core schema migration. It affects the WACZ file format, verification pipeline, and API response. Hard to reverse once WACZ files are written with the new format. Multiple downstream tasks depend on this format decision.
- **Prompt**: |
    You are modifying the WACZ assembly pipeline to include RFC 3161 timestamps and evolve the `datapackage-digest.json` schema from a flat `signedData` object to a `signatures` array.

    ## Context

    The project's `buildWacz()` function in `src/wacz.js` currently produces `datapackage-digest.json` with this structure:
    ```json
    {
      "path": "datapackage.json",
      "hash": "sha256:...",
      "signedData": {
        "hash": "sha256:...",
        "signature": "base64...",
        "publicKey": "base64...",
        "keyId": "hex8chars",
        "created": "ISO8601",
        "software": "WRL/0.1",
        "version": "0.1.0"
      }
    }
    ```

    ## What to Build

    **1. Evolve `signedData` in `wacz.js`:**

    Change the `signedData` object to include a `signatures` array:
    ```json
    {
      "path": "datapackage.json",
      "hash": "sha256:...",
      "signedData": {
        "hash": "sha256:...",
        "created": "ISO8601",
        "software": "WRL/0.1",
        "version": "0.2.0",
        "signatures": [
          {
            "type": "self",
            "signature": "base64...",
            "publicKey": "base64...",
            "keyId": "hex8chars"
          },
          {
            "type": "rfc3161",
            "token": "base64...",
            "tsa": "http://timestamp.digicert.com"
          }
        ]
      }
    }
    ```

    Key points:
    - `signedData` keeps `hash`, `created`, `software` at the top level (shared metadata)
    - `version` bumps from `"0.1.0"` to `"0.2.0"` to signal the new schema
    - `signature`, `publicKey`, `keyId` move from flat fields into a `signatures` array entry with `type: "self"`
    - RFC 3161 token is a new entry with `type: "rfc3161"`, containing base64-encoded raw DER token and the TSA URL
    - When TSA is unreachable, the `rfc3161` entry is simply omitted from the array (no `status: absent` marker)

    **2. Integrate TSA request into `buildWacz()` pipeline:**

    After Step 8 (Ed25519 signing) and before Step 9 (assemble digest doc):
    ```js
    // Step 8.5: Request RFC 3161 timestamp (optional, graceful degradation)
    let tsaResult = null;
    if (env.TSA_URL) {
      try {
        tsaResult = await requestTimestamp(env.TSA_URL, bundleHash);
      } catch {
        // TSA unreachable -- capture continues without timestamp
      }
    }
    ```

    Import `requestTimestamp` from `./rfc3161.js`.

    **3. Add TSA_URL to wrangler.toml:**

    Add to the `[vars]` section:
    ```toml
    TSA_URL = "http://timestamp.digicert.com"
    ```

    Add the same to `[env.staging.vars]`. The TSA URL is not a secret -- it is a well-known public endpoint.

    **4. Add TSA_URL to vitest.config.js bindings:**

    ```js
    bindings: {
      // ...existing...
      TSA_URL: 'http://timestamp.digicert.com',
    }
    ```

    **5. Extend capture logging:**

    In `src/capture.js`, extend the `capture.success` log event to include:
    ```js
    timestampStatus: tsaResult ? 'present' : (waczInfo ? 'absent' : 'skipped'),
    ```

    This requires `buildWacz()` to return `timestampStatus` alongside the existing return fields. Extend the return value:
    ```js
    return { waczBytes, waczHash, bundleHash, publicKeyBase64, keyId, timestampStatus: tsaResult ? 'present' : 'absent' };
    ```

    In `capture.js`, use the returned `timestampStatus` in the log event.

    **6. Return value change:**

    `buildWacz()` return value gains `timestampStatus`:
    ```js
    return { waczBytes, waczHash, bundleHash, publicKeyBase64, keyId, timestampStatus };
    ```

    ## Files to modify

    - `src/wacz.js` -- Main changes: import rfc3161, restructure digestDoc, add TSA call
    - `src/capture.js` -- Add `timestampStatus` to log events
    - `wrangler.toml` -- Add `TSA_URL` to `[vars]` and `[env.staging.vars]`
    - `vitest.config.js` -- Add `TSA_URL` binding

    ## What NOT to do

    - Do NOT modify `src/verify.js` -- that is a separate task
    - Do NOT modify `src/verify-page.js` -- that is a separate task
    - Do NOT modify `src/index.js` -- that is a separate task
    - Do NOT add retry logic for TSA requests
    - Do NOT store failure metadata in the WACZ when TSA is unreachable -- just omit the entry
    - Do NOT change the function signature of `buildWacz()` (env is already passed)

    ## Reference files

    - `src/wacz.js` -- The file being modified (read fully)
    - `src/rfc3161.js` -- The new module from Task 1 (read to understand the API)
    - `src/capture.js` -- For log event extension
    - `wrangler.toml` -- For TSA_URL configuration
    - `vitest.config.js` -- For test binding
    - `src/signing.js` -- For understanding the key management pattern

- **Deliverables**: Modified `src/wacz.js`, `src/capture.js`, `wrangler.toml`, `vitest.config.js`
- **Success criteria**: `buildWacz()` produces the new `signatures` array format with version `0.2.0`. TSA timestamp is included when `TSA_URL` is configured and TSA responds. Capture completes without timestamp when TSA is unreachable. Logging includes `timestampStatus`.

---

### Task 3: Update verification pipeline (`verify.js`) for dual-format support

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    You are updating the WACZ verification module (`src/verify.js`) to handle both the old flat `signedData` format (v0.1.0) and the new `signatures` array format (v0.2.0), and to verify RFC 3161 timestamps.

    ## Context

    The current `verifyWacz()` reads `signedData` as a flat object with `hash`, `signature`, `publicKey`, `keyId`, `created`. The new format (v0.2.0) moves `signature`, `publicKey`, `keyId` into a `signatures` array inside `signedData`.

    The verification must handle both formats via version detection, and add a 4th check for timestamps.

    ## What to Build

    **1. Format detection and normalization:**

    After parsing the digest doc (line 99), detect the format version:
    ```js
    const signedData = digest?.signedData;
    const version = signedData?.version ?? '0.1.0';
    ```

    For v0.1.0 (legacy): extract `signature`, `publicKey`, `keyId` from flat `signedData` fields. No `signatures` array exists.

    For v0.2.0 (new): read `signedData.signatures` array. Find the `type: "self"` entry for Ed25519 fields. Find the `type: "rfc3161"` entry for timestamp.

    For unknown versions: fail all checks with "Unsupported signedData version".

    **2. Existing checks (1-3) remain unchanged in behavior:**

    - Check 1 (artifactHashes): No change
    - Check 2 (bundleHash): Uses `signedData.hash` -- same field in both formats
    - Check 3 (signature): For v0.1.0, read `signedData.signature`. For v0.2.0, read from `signatures.find(s => s.type === 'self').signature`

    **3. New Check 4 (timestamp):**

    Add a 4th check after the signature check:

    ```js
    // Check 4: timestamp (only when signatures array has an rfc3161 entry)
    if (version === '0.2.0') {
      const sigs = signedData?.signatures ?? [];
      const tsEntry = sigs.find(s => s.type === 'rfc3161');

      if (!tsEntry) {
        // TSA was unavailable -- skip is neutral
        checks.push({ name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' });
      } else {
        // Verify the timestamp token
        try {
          const result = verifyTimestamp(tsEntry.token, signedData.hash);
          if (result.valid) {
            checks.push({ name: 'timestamp', status: 'pass' });
            timestampData = { genTime: result.genTime, tsa: tsEntry.tsa };
          } else {
            checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
          }
        } catch {
          checks.push({ name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' });
        }
      }
    }
    // For v0.1.0: no timestamp check at all (3 checks, not 4)
    ```

    Import `verifyTimestamp` from `./rfc3161.js`.

    **4. Update the `verified` predicate:**

    Change from:
    ```js
    const verified = checks.every(c => c.status === 'pass');
    ```

    To:
    ```js
    const verified = checks.every(c => c.status === 'pass' || c.status === 'skip');
    ```

    This means:
    - A `skip` on timestamp (TSA unavailable) does NOT fail verification
    - A `fail` on timestamp (present but invalid) DOES fail verification
    - Existing `skip` behavior (e.g., artifactHashes skipped when digest missing) already results in `verified: false` because other checks will also fail in those scenarios

    **IMPORTANT**: Verify that `skip` tolerance does not create a security hole. In the current codebase, `skip` only appears when both `datapackage.json` and `datapackage-digest.json` are present but there is a specific structural issue. In those cases, other checks also fail, so `verified` is always false even with skip tolerance. The only NEW skip case is the timestamp check, which is intentionally neutral. Verify this by reading the existing code carefully.

    **5. Extend the `result.capture` object:**

    When timestamp data is available, include it:
    ```js
    if (signedData) {
      result.capture = {
        bundleHash:  signedData.hash      ?? null,
        signature:   selfSig?.signature   ?? null,
        publicKey:   selfSig?.publicKey   ?? null,
        signedAt:    signedData.created   ?? null,
      };
      if (timestampData) {
        result.capture.timestamp = {
          genTime: timestampData.genTime,
          tsa: timestampData.tsa,
        };
      }
    }
    ```

    **6. Update the file header comment:**

    Change "three checks" to reflect the new 4th check. Update the check list to include `timestamp`.

    **7. Early-exit error returns:**

    The existing early returns (invalid ZIP, missing files, malformed JSON) return exactly 3 checks. For v0.2.0 WACZ files that somehow end up in these paths (which shouldn't happen with valid files), the 3-check return is fine because all checks fail anyway. Do NOT add a 4th failing timestamp check to the early-exit paths -- the 3 checks are sufficient to communicate "everything is broken."

    ## Files to modify

    - `src/verify.js` -- All changes go here

    ## What NOT to do

    - Do NOT modify `src/index.js` (verify endpoint handler) -- that is Task 4
    - Do NOT modify `src/verify-page.js` -- that is Task 5
    - Do NOT verify the TSA's cryptographic signature (CMS chain validation) -- only verify messageImprint hash match
    - Do NOT add timestamp check for v0.1.0 format WACZ files -- they never had timestamps
    - Do NOT include hash values in check `detail` messages (security: information disclosure)
    - Do NOT change the early-exit error paths to include 4 checks

    ## Reference files

    - `src/verify.js` -- Read fully, this is the file being modified
    - `src/rfc3161.js` -- For the `verifyTimestamp()` API
    - `src/wacz.js` -- To understand the new format being produced (after Task 2)

- **Deliverables**: Modified `src/verify.js`
- **Success criteria**: v0.1.0 WACZ files verify with 3 checks (no timestamp). v0.2.0 WACZ files with valid timestamp verify with 4 checks (all pass). v0.2.0 WACZ files without timestamp verify with 4 checks (timestamp=skip, verified=true). v0.2.0 WACZ files with invalid timestamp fail verification.

---

### Task 4: Update verification API endpoint (`index.js`) for timestamp data

- **Agent**: iac-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no
- **Prompt**: |
    You are updating the verification API endpoint in `src/index.js` to surface RFC 3161 timestamp data in the JSON response.

    ## Context

    The `handleVerifyCapture()` function (around line 416) builds a JSON response body from the `verifyWacz()` result. The result now includes timestamp data in `result.capture.timestamp` (when present). The response needs to expose this.

    ## What to Build

    **1. Extend the `signing` field in the response body:**

    Currently (line 488-498):
    ```js
    const body = {
      verified: result.verified,
      capture: { ... },
      signing: result.capture || null,
      checks: result.checks,
    };
    ```

    The `signing` field is set to `result.capture` which now may include a `timestamp` sub-object. This flows through automatically -- no change needed to the basic response assembly.

    However, verify that the response shape is correct. The `signing` object should look like:
    ```json
    {
      "bundleHash": "sha256:...",
      "signature": "base64...",
      "publicKey": "base64...",
      "signedAt": "ISO8601",
      "timestamp": {
        "genTime": "ISO8601",
        "tsa": "http://timestamp.digicert.com"
      }
    }
    ```

    The `timestamp` field is absent when no timestamp exists (v0.1.0 or v0.2.0 without TSA).

    **2. R2-missing fallback (line 466-474):**

    When the WACZ is missing from R2, the response currently returns 3 failing checks. This is fine -- do NOT add a 4th timestamp check to this error path.

    **3. Verify the response flows correctly:**

    Read `handleVerifyCapture()` carefully. The `result.capture` from `verifyWacz()` maps to `body.signing`. Confirm that `timestamp` data (when present in `result.capture`) is included in the response without additional code.

    ## Files to modify

    - `src/index.js` -- Minimal changes to handleVerifyCapture()

    ## What NOT to do

    - Do NOT modify other route handlers
    - Do NOT add new routes
    - Do NOT change the response status codes or caching behavior
    - Do NOT add timestamp check to the R2-missing error response

    ## Reference files

    - `src/index.js` -- Read handleVerifyCapture() (lines 416-516)
    - `src/verify.js` -- To understand the new result shape

- **Deliverables**: Modified `src/index.js` (minimal changes)
- **Success criteria**: Verify endpoint JSON response includes `signing.timestamp` when timestamp data exists. Response is unchanged for v0.1.0 WACZ files and for R2-missing cases.

---

### Task 5: Update verification page (`verify-page.js`) for timestamp display

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 4
- **Approval gate**: yes
- **Gate reason**: User-facing presentation of the new timestamp feature. This is the primary interface journalists, researchers, and legal professionals see. The UX decisions (label text, check ordering, crypto details extension, skip behavior) affect how the evidence claim is perceived. Multiple specialists had input on this.
- **Prompt**: |
    You are updating the verification page (`src/verify-page.js`) to display the new RFC 3161 timestamp check and cryptographic details.

    ## Context

    The verification page is a self-contained, server-rendered HTML shell with inlined CSS and vanilla JS. It fetches JSON from `/v1/verify/{id}` and renders the result. Changes must follow the existing patterns exactly -- vanilla JS, `textContent` for user data (no innerHTML for dynamic values), existing CSS classes.

    The verification JSON response now includes:
    - A 4th check `{ name: 'timestamp', status: 'pass'|'fail'|'skip', detail: '...' }` in the `checks` array (for v0.2.0 WACZ files; v0.1.0 files still have 3 checks)
    - A `signing.timestamp` object with `{ genTime: 'ISO8601', tsa: 'http://...' }` when present

    ## What to Build

    **1. Add timestamp to CHECK_LABELS and CHECK_DESCS:**

    ```js
    var CHECK_LABELS = {
      artifactHashes: 'File integrity',
      bundleHash:     'Bundle integrity',
      signature:      'Digital signature',
      timestamp:      'Independent time verification',
    };

    var CHECK_DESCS = {
      artifactHashes: 'Confirms individual captured files have not been modified.',
      bundleHash:     'Confirms the overall archive bundle has not been altered.',
      signature:      'Confirms the bundle was signed by the capture service.',
      timestamp:      'Confirms capture time was certified by an independent authority.',
    };
    ```

    The existing `renderChecks()` function already handles unknown check names (falls back to `c.name`) and all three statuses (pass/fail/skip with correct SVG icons). Adding these map entries is all that's needed for the check row to render correctly.

    **2. Extend cryptographic details section:**

    In `buildResult()`, after the existing crypto-grid rows (bundle hash, signed at, public key), add conditional timestamp rows when `signing.timestamp` exists:

    ```js
    // Inside buildResult(), in the crypto-grid div:
    if (signing && signing.timestamp) {
      // Add timestamp authority row
      html += '<div class="crypto-row">' +
        '<div class="crypto-label">Timestamp authority</div>' +
        '<div class="crypto-value" id="tsa-name-value"></div>' +
        '</div>';
      // Add timestamp issued row
      html += '<div class="crypto-row">' +
        '<div class="crypto-label">Timestamp issued</div>' +
        '<div class="crypto-value" id="tsa-time-value"></div>' +
        '</div>';
    }
    ```

    **3. Populate timestamp crypto details:**

    In `populate()`, after the existing crypto detail population (bundle hash, signed at, public key):

    ```js
    var tsaNameEl = document.getElementById('tsa-name-value');
    if (tsaNameEl && signing.timestamp && signing.timestamp.tsa) {
      tsaNameEl.textContent = signing.timestamp.tsa;
    }

    var tsaTimeEl = document.getElementById('tsa-time-value');
    if (tsaTimeEl && signing.timestamp && signing.timestamp.genTime) {
      tsaTimeEl.textContent = fmtDate(signing.timestamp.genTime);
    }
    ```

    Use `textContent` -- never innerHTML for user-controlled data. This follows the existing security pattern.

    **4. Backward compatibility:**

    Old captures (v0.1.0) will return 3 checks in the API response (no `timestamp` entry). The existing `renderChecks()` iterates whatever array it receives, so 3 checks render as 3 rows. New captures (v0.2.0) return 4 checks and render as 4 rows. This is the correct behavior -- pre-timestamp captures should not show a timestamp row at all.

    No changes needed to the status banner logic. The banner reads `verifyData.verified` directly from the API response. The `verified` predicate is computed server-side in `verify.js`.

    ## Files to modify

    - `src/verify-page.js` -- All changes go here

    ## What NOT to do

    - Do NOT add new CSS classes or styles -- reuse existing `.crypto-row`, `.crypto-label`, `.crypto-value`
    - Do NOT change the status banner logic (it reads `verified` directly)
    - Do NOT add trust tier badges, amber states, or any visual hierarchy beyond the existing pass/fail/skip pattern
    - Do NOT show TSA certificate details, raw token data, or token hash
    - Do NOT use innerHTML for any dynamic/user-controlled data
    - Do NOT force 4 checks for old captures -- let the API response drive the check count

    ## Reference files

    - `src/verify-page.js` -- Read fully, this is the file being modified
    - The verification JSON response shape (see Task 4 context)

- **Deliverables**: Modified `src/verify-page.js`
- **Success criteria**: New captures show 4 check rows including "Independent time verification". Crypto details section shows TSA authority and timestamp when present. Old captures (3 checks) render unchanged. No new CSS. XSS-safe (textContent only).

---

### Task 6: Update OpenAPI spec and documentation

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 5
- **Approval gate**: no
- **Prompt**: |
    You are updating the OpenAPI spec and documentation to reflect the RFC 3161 timestamp integration.

    ## Context

    The project has integrated RFC 3161 timestamps into the WACZ signing pipeline. The verification endpoint now returns:
    - A 4th check `{ name: 'timestamp', status: 'pass'|'fail'|'skip' }` for v0.2.0 WACZ files
    - A `signing.timestamp` object with `{ genTime, tsa }` when present
    - Old captures (v0.1.0) still return 3 checks

    ## What to Build

    **1. Update `openapi.yaml`:**

    a. **VerificationCheck schema**: Add `timestamp` to the `name` enum:
    ```yaml
    name:
      type: string
      enum: [artifactHashes, bundleHash, signature, timestamp]
    ```

    Update the description to mention four checks (not three). Update all places in the spec that say "three checks" to say "three or four checks" or describe dynamically.

    b. **VerificationSigning schema**: Add `timestamp` field:
    ```yaml
    timestamp:
      type: ['object', 'null']
      description: >
        RFC 3161 timestamp data when an independent timestamp was obtained.
        Null when no timestamp exists (legacy captures or TSA unavailable).
      properties:
        genTime:
          type: string
          format: date-time
          description: Time certified by the TSA
        tsa:
          type: string
          description: TSA endpoint URL
    ```

    c. **Update examples**: The verified example should show 4 checks with a timestamp. Add a new example showing verified without timestamp (3 checks for legacy, or 4 checks with timestamp=skip).

    d. **Bump spec version** from `0.3.0` to `0.4.0`.

    e. **Update verification endpoint description** to mention the timestamp check.

    **2. Update `README.md`:**

    a. Update "Returns a JSON verification result with three checks" to reflect 4 checks
    b. Update `signedData` references in the Key Rotation section to mention the `signatures` array
    c. Add brief mention of RFC 3161 timestamps in the verification section

    **3. Search for "three checks" across the codebase:**

    Run a project-wide search for the string "three" in context of checks/verification. Update all references. Known locations:
    - `openapi.yaml` (multiple places)
    - `README.md`
    - `src/verify.js` header comment

    **4. Create evolution log entry:**

    Create directory `docs/evolution/0024-rfc3161-timestamps/` with:
    - `prompt.md` -- Copy from the GitHub issue #41 description or the original task briefing

    The `decisions.md` and `outcome.md` will be written later by the orchestration process.

    ## Files to modify

    - `openapi.yaml` -- Schema and example updates
    - `README.md` -- Check count and format references
    - `src/verify.js` -- Header comment only (change "three checks" to "three or four checks")
    - `docs/evolution/0024-rfc3161-timestamps/prompt.md` -- New file

    ## What NOT to do

    - Do NOT modify any code logic -- only comments, docs, and the OpenAPI spec
    - Do NOT create `docs/wacz-format.md` -- defer to a future phase (YAGNI for now; the format is documented in the OpenAPI spec and source code)
    - Do NOT update `docs/backlog.md` -- that happens post-merge
    - Do NOT add `decisions.md` or `outcome.md` -- those are written by the orchestration process
    - Do NOT modify the linting config

    ## Reference files

    - `openapi.yaml` -- Read fully
    - `README.md` -- Read fully
    - `src/verify.js` -- Read the header comment

- **Deliverables**: Modified `openapi.yaml`, `README.md`, `src/verify.js` (comment only), new `docs/evolution/0024-rfc3161-timestamps/prompt.md`
- **Success criteria**: OpenAPI spec reflects 4 checks, timestamp field in signing, updated examples. README references are accurate. No "three checks" references remain. Evolution log directory exists with prompt.md. `npm run lint:api` passes.

---

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test execution). test-minion's detailed strategy from planning phase feeds into Phase 6. Tests include: DER codec known-answer tests with real TSA fixtures, WACZ assembly with/without TSA, verification dual-format, backward compatibility, integration tests.
- **Security**: security-minion contributed extensively to planning. Key decisions integrated: nonce validation, messageImprint verification, HTTPS preference for TSA, 64KB response size cap, strict DER bounds checking, deferred certificate chain validation. No separate security task needed -- security requirements are embedded in each task prompt.
- **Usability -- Strategy**: ux-strategy-minion drove the key UX decisions: binary banner (no third state), "Independent time verification" label, neutral absence treatment (skip not warning), progressive disclosure via crypto details. These decisions are embedded in Task 5's prompt.
- **Usability -- Design**: No new visual patterns needed. Task 5 reuses existing CSS classes (crypto-row, check-row, pass/fail/skip icons). accessibility-minion not needed -- existing accessible patterns (aria-hidden SVGs, sr-only status text, textContent for dynamic data) are inherited automatically.
- **Documentation**: Task 6 covers OpenAPI spec, README, and evolution log. Phase 8 (post-execution) handles any remaining documentation. software-docs-minion contributed to planning.
- **Observability**: Capture logging extended in Task 2 (timestampStatus field). No new runtime services or tracing needed. observability-minion not needed -- the existing Coralogix logging pattern absorbs the new field.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - **accessibility-minion**: No -- Task 5 adds check rows and crypto detail rows using identical patterns to existing accessible markup. No new interaction patterns or UI components.
  - **ux-design-minion**: No -- no new visual patterns, colors, or layouts. All additions use existing CSS classes.
  - **sitespeed-minion**: No -- no new web-facing pages or assets. The verify page gains ~20 lines of HTML template.
  - **observability-minion**: No -- single new log field (`timestampStatus`) follows established pattern.
  - **user-docs-minion**: No -- the user-facing change (4th check row) is self-explanatory from the label and description text. No user guide or tutorial needed.
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

**Conflict 1: 3 checks vs. 4 checks (api-design-minion vs. frontend-minion + ux-strategy-minion)**

api-design-minion argued for keeping the `checks` array at 3 entries and folding timestamp results into the `signing.signatures` array detail. frontend-minion and ux-strategy-minion argued for a visible 4th check row.

**Resolution**: 4th check added to the `checks` array. The api-design-minion's concern about breaking consumers who hardcode `checks.length === 3` is valid, but this is a pre-1.0 API and the OpenAPI spec documents the enum. The check count was never a stable contract -- it was an implementation detail. The UX benefit (visible, independent verification status) outweighs the API stability concern.

The `verified` predicate changes from `checks.every(c => c.status === 'pass')` to `checks.every(c => c.status === 'pass' || c.status === 'skip')`. This is safe because the only new `skip` case is the timestamp check (TSA unavailable), and existing `skip` scenarios always co-occur with other failing checks.

**Conflict 2: HTTP vs HTTPS for DigiCert TSA (security-minion vs. iac-minion)**

security-minion recommended HTTPS with HTTP rejection unless explicitly overridden. iac-minion noted that HTTP is industry-standard because the TSA response is self-authenticating (signed by the TSA's certificate).

**Resolution**: Default to `http://timestamp.digicert.com` (the standard, widely-tested endpoint). Do NOT add HTTP/HTTPS validation or TSA_ALLOW_HTTP flags -- this is over-engineering for a pre-MVP TSA integration. The TSA response is cryptographically signed; the trust is in the signature, not the transport. If HTTPS becomes preferred later, change the default URL. YAGNI applies.

**Conflict 3: `signedData` as flat vs. replaced (api-design-minion internal tension)**

api-design-minion's proposal A keeps `signedData` as an object with a new `signatures` array inside. The alternative was replacing `signedData` entirely with `signatures` at the top level.

**Resolution**: Keep `signedData` as the wrapper object. The `hash`, `created`, `software`, `version` fields are shared metadata about the signing event. The `signatures` array sits inside `signedData`, holding individual cryptographic proofs. This is the least-disruption path -- verification code continues to read `digest.signedData.hash` without changing.

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DER parsing bugs in `rfc3161.js` | Medium | High | Strict bounds checking, 64KB size cap, known-answer tests with real TSA fixtures, malformed input tests |
| TSA availability affects capture latency | Medium | Medium | 3s timeout, graceful degradation (capture completes without timestamp), concurrent execution with R2 uploads |
| DigiCert TSA response format changes | Low | Medium | Tag-based navigation (not fixed offsets), real fixture tests during development |
| Backward compatibility gap (old WACZ files fail verification) | Low | High | Version detection via `signedData.version`, dual-format parsing in verify.js, backward compat tests |
| `skip` tolerance in verified predicate creates security hole | Low | High | Only timestamp check can be skipped in practice; existing skip scenarios always co-occur with other failures; verified in code review |
| 30s `ctx.waitUntil` budget exceeded | Low | Medium | TSA timeout (3s) fits within remaining budget after 25s navigation; partial captures skip WACZ entirely |

### Execution Order

```
Batch 1 (sequential):
  Task 1: src/rfc3161.js (DER codec + TSA client)
  Task 2: wacz.js + capture.js + wrangler.toml + vitest.config.js
    --> APPROVAL GATE: format/crypto core

Batch 2 (sequential):
  Task 3: verify.js (dual-format + timestamp check)
  Task 4: index.js (API response)
  Task 5: verify-page.js (UI)
    --> APPROVAL GATE: full implementation review

Batch 3:
  Task 6: openapi.yaml + README + evolution log

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution
  Phase 8: Documentation finalization
```

### Verification Steps

1. `npm test` passes (all existing tests + new tests added by Phase 6)
2. `npm run lint:api` passes (OpenAPI spec valid)
3. Manual verification: build a WACZ with the new code, inspect `datapackage-digest.json` inside the ZIP to confirm `signatures` array format
4. Verify backward compatibility: existing test WACZ fixtures still verify correctly
5. Verify graceful degradation: remove `TSA_URL` from env, confirm captures still succeed
6. Verify the verification page renders 4 checks for new captures and 3 checks for old captures
