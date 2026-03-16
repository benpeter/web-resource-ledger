## Delegation Plan

**Team name**: cli-verify
**Description**: Build a standalone CLI npm package (`@wrl/verify`) that provides independent, offline-capable cryptographic verification of WRL WACZ captures, including full CMS/PKCS#7 certificate chain validation for RFC 3161 timestamps.

### Task 1: Scaffold CLI package and vendor verification modules

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no (skip)
- **Prompt**: |
    You are building the CLI package scaffold for `@wrl/verify`, a standalone
    npm CLI tool for offline cryptographic verification of WRL WACZ captures.

    ## What to do

    Create `packages/verify/` with the full package structure and vendor the
    verification modules from the Worker source code, adapting them for Node.js.

    ### Step 1: Create the directory structure

    ```
    packages/verify/
      package.json
      bin/
        wrl-verify.js          # entry point with shebang
      lib/
        verify.js              # vendored from src/verify.js, verification-only
        canonical-json.js      # vendored verbatim from src/canonical-json.js
        rfc3161.js             # vendored from src/rfc3161.js, verifyTimestamp + DER parser only
        signing.js             # vendored from src/signing.js, verifySignature only
        sha256.js              # Node.js native replacement for warc.js sha256
        cms-verify.js          # NEW: PKIjs-based CMS signature and chain validation
        cli.js                 # argument parsing, output formatting, exit codes
        format.js              # human-readable and JSON output formatters
        key-resolver.js        # fetches public key from /.well-known/signing-key(s)
      certs/
        trusted-roots/
          DigiCertTrustedRootG4.pem   # bundled trust anchor
      test/
        (created empty, populated by Task 3)
      README.md                # placeholder, populated by Phase 8
    ```

    ### Step 2: Create package.json

    ```json
    {
      "name": "@wrl/verify",
      "version": "0.1.0",
      "description": "Verify cryptographic integrity of WRL WACZ web capture bundles",
      "license": "Apache-2.0",
      "author": "Ben Peter <bp@ben-peter.com>",
      "repository": {
        "type": "git",
        "url": "https://github.com/benpeter/web-resource-ledger.git",
        "directory": "packages/verify"
      },
      "homepage": "https://github.com/benpeter/web-resource-ledger/tree/main/packages/verify#readme",
      "bugs": "https://github.com/benpeter/web-resource-ledger/issues",
      "keywords": [
        "wacz", "web-archive", "verification", "cryptographic",
        "ed25519", "wrl", "digital-evidence", "integrity"
      ],
      "type": "module",
      "bin": {
        "wrl-verify": "./bin/wrl-verify.js"
      },
      "engines": {
        "node": ">=20.0.0"
      },
      "files": ["bin/", "lib/", "certs/", "README.md", "LICENSE"],
      "dependencies": {
        "fflate": "^0.8.2",
        "pkijs": "3.3.3",
        "asn1js": "3.0.5",
        "pvutils": "1.1.3"
      }
    }
    ```

    Pin PKIjs and its dependencies to exact versions (no ^ or ~) for supply
    chain security. fflate can use ^.

    ### Step 3: Create the bin entry point

    `bin/wrl-verify.js`:
    ```js
    #!/usr/bin/env node
    import { run } from '../lib/cli.js';
    run(process.argv.slice(2));
    ```

    ### Step 4: Vendor the verification modules

    Copy and adapt the following files from `src/` into `packages/verify/lib/`:

    **lib/canonical-json.js**: Copy verbatim from `src/canonical-json.js`.
    Add an origin comment at the top:
    ```js
    // Vendored from src/canonical-json.js -- verbatim copy
    // Origin: https://github.com/benpeter/web-resource-ledger/blob/main/src/canonical-json.js
    ```

    **lib/sha256.js**: New file, replaces the Web Crypto sha256 from warc.js
    with Node.js native crypto:
    ```js
    // Node.js native SHA-256 -- replaces Web Crypto version from src/warc.js
    import { createHash } from 'node:crypto';

    export function sha256(data) {
      const hex = createHash('sha256').update(data).digest('hex');
      return `sha256:${hex}`;
    }
    ```
    This is synchronous (no async/await needed), unlike the Web Crypto version.

    **lib/signing.js**: Vendor ONLY the `verifySignature` function from
    `src/signing.js`. Do NOT include `getSigningKeys`, `signBytes`, or
    `computeKeyId` -- the CLI never signs, only verifies.

    Replace `atob()` with `Buffer.from(str, 'base64')` for base64 decoding
    to be idiomatic Node.js. Keep `crypto.subtle` for Ed25519 verification
    (it works in Node 20+).

    ```js
    // Vendored from src/signing.js -- verifySignature only
    // Origin: https://github.com/benpeter/web-resource-ledger/blob/main/src/signing.js

    export async function verifySignature(publicKeyBytes, data, signatureBase64) {
      const pubKey = await crypto.subtle.importKey(
        'raw', publicKeyBytes, 'Ed25519', true, ['verify']
      );
      const signature = Buffer.from(signatureBase64, 'base64');
      return crypto.subtle.verify('Ed25519', pubKey, signature, data);
    }
    ```

    **lib/rfc3161.js**: Vendor ONLY `verifyTimestamp`, `extractTSTInfo`,
    `parseTSTInfo`, `parseGeneralizedTime`, and the DER primitives (`readTLV`,
    `writeLength`, `childAt`, `concat`, `writeTLV`). Do NOT include
    `requestTimestamp`, `buildTimeStampReq`, or any capture-time code. Remove
    the `TSA_TIMEOUT_MS` and `MAX_RESPONSE_BYTES` constants.

    Replace `atob()` with `Buffer.from(str, 'base64')` in `verifyTimestamp`.

    Add origin comment at top. Export `verifyTimestamp` and also export
    `extractTSTInfo` (the CMS module needs it for getting genTime).

    **lib/verify.js**: Vendor from `src/verify.js`. Changes:
    - Replace `import { sha256 } from './warc.js'` with `import { sha256 } from './sha256.js'`
    - Update import paths for the other vendored modules
    - The `verifyWacz` function signature changes to accept an options object
      instead of just publicKeyBytes, to support the new CMS verification:
      ```js
      export async function verifyWacz(waczBytes, publicKeyBytes, options = {}) {
        // options.trustedRoots: array of PEM certificate strings
        // options.verifyCmsChain: boolean (default true when trustedRoots provided)
      }
      ```
    - Add a 5th check `timestampChain` after the `timestamp` check that calls
      the CMS verification module when a timestamp token is present AND
      trustedRoots are provided
    - Make sha256 synchronous (remove await since Node.js version is sync)

    ### Step 5: Create placeholder files

    Create empty placeholder files for modules that will be implemented in
    later tasks:
    - `lib/cli.js` -- export a stub `run()` function that prints "not yet implemented"
    - `lib/format.js` -- empty exports
    - `lib/key-resolver.js` -- empty exports
    - `lib/cms-verify.js` -- empty exports

    ### Step 6: Bundle the DigiCert Trusted Root G4 certificate

    Download from https://cacerts.digicert.com/DigiCertTrustedRootG4.crt.pem
    (or convert the DER version to PEM). Save as:
    `packages/verify/certs/trusted-roots/DigiCertTrustedRootG4.pem`

    Create a root certificate loader module. Design the trust store as a
    directory-based system: read all .pem files from `certs/trusted-roots/`
    at startup. This makes it trivial to add roots for other TSAs without
    code changes.

    ### Step 7: Copy LICENSE

    Copy the root `LICENSE` file into `packages/verify/LICENSE`.

    ### Step 8: Run npm install

    Run `cd packages/verify && npm install` to generate the lockfile.
    Commit the lockfile.

    ## What NOT to do

    - Do NOT create a monorepo workspace configuration. The CLI package is
      self-contained.
    - Do NOT add vitest, jest, or any test framework as a dependency. Tests
      use `node:test` (added in Task 3).
    - Do NOT implement the full CLI logic, output formatting, or remote
      fetching. Those are separate tasks.
    - Do NOT add any dependencies beyond fflate and pkijs (with its peers
      asn1js and pvutils). No argument parsing libraries, no chalk, no
      commander.

    ## Context

    The existing Worker source files are at:
    - `src/verify.js` (241 lines) -- main verification orchestrator
    - `src/canonical-json.js` (7 lines) -- deterministic JSON serialization
    - `src/rfc3161.js` (~548 lines) -- RFC 3161 timestamp module (only
      verification subset needed)
    - `src/signing.js` (133 lines) -- Ed25519 signing module (only
      verifySignature needed)
    - `src/warc.js` line 218-221 -- sha256 function (replaced with node:crypto)

    The WACZ verification pipeline runs 4 checks today:
    1. artifactHashes -- SHA-256 of each resource matches datapackage.json
    2. bundleHash -- sha256(canonicalize(datapackage)) matches signedData.hash
    3. signature -- Ed25519 signature over bundleHash bytes verifies
    4. timestamp -- RFC 3161 messageImprint matches bundleHash

    The CLI adds a 5th check:
    5. timestampChain -- CMS/PKCS#7 signature verified AND certificate chain
       validates to a bundled trusted root

    Key replacements for Node.js:
    - `crypto.subtle.digest('SHA-256', data)` -> `node:crypto.createHash('sha256')`
    - `atob(str)` -> `Buffer.from(str, 'base64')`
    - `btoa(str)` -> `Buffer.from(str).toString('base64')`
    - Keep `crypto.subtle` for Ed25519 (works in Node 20+)

- **Deliverables**:
    - Complete `packages/verify/` directory structure
    - `package.json` with correct metadata and pinned dependencies
    - Vendored verification modules adapted for Node.js
    - Bundled DigiCert Trusted Root G4 certificate
    - Root certificate loader module
    - Placeholder files for modules implemented in later tasks
    - `npm install` completed with lockfile
- **Success criteria**:
    - `node -e "import('./packages/verify/lib/verify.js')"` succeeds
    - `node -e "import('./packages/verify/lib/sha256.js').then(m => console.log(m.sha256(Buffer.from('test'))))"` prints a sha256 hash
    - `node -e "import('./packages/verify/lib/canonical-json.js').then(m => console.log(m.canonicalize({b:1,a:2})))"` prints `{"a":2,"b":1}`
    - `packages/verify/certs/trusted-roots/DigiCertTrustedRootG4.pem` exists and is valid PEM
    - No runtime dependencies beyond fflate and pkijs chain

---

### Task 2: Implement CMS/PKCS#7 certificate chain verification

- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no (skip)
- **Prompt**: |
    You are implementing the CMS/PKCS#7 certificate chain verification module
    for `@wrl/verify`, a standalone CLI tool for offline cryptographic
    verification of WRL WACZ captures. This is the core new capability the CLI
    adds beyond the Worker's existing verification.

    ## What to do

    Implement `packages/verify/lib/cms-verify.js` -- a module that takes a
    base64-encoded RFC 3161 timestamp token and an array of trusted root PEM
    certificates, and performs full CMS signature and certificate chain
    verification.

    ### The verification chain (RFC 3161 Section 2.4.2)

    The existing `verifyTimestamp()` in `lib/rfc3161.js` only checks step 5.
    Your module implements steps 1-4:

    **Step 1: Parse the CMS ContentInfo envelope**
    - Decode the base64 token to DER bytes
    - Use PKIjs `ContentInfo.fromBER()` to parse the DER
    - Extract the `SignedData` structure from the ContentInfo

    **Step 2: Verify the CMS cryptographic signature**
    - Use PKIjs `SignedData.verify()` to verify that the signature in
      SignerInfo was computed correctly over the TSTInfo content
    - This proves the TSTInfo was not modified after the TSA signed it

    **Step 3: Validate the TSA certificate chain**
    - Use PKIjs `SignedData.verify({ signer: 0, checkChain: true,
      trustedCerts: [...] })` to validate the signer certificate chains to
      a bundled trusted root
    - Convert PEM root certificates to PKIjs `Certificate` objects for
      the `trustedCerts` array

    **Step 4: Validate certificate properties**
    - **Extended Key Usage**: The signer certificate MUST contain
      `id-kp-timeStamping` (OID 1.3.6.1.5.5.7.3.8)
    - **Validity period**: The signer certificate must have been valid at
      the time indicated by genTime (not "valid now" -- valid at signing time)

    **Step 5: messageImprint match** -- already handled by existing
    `verifyTimestamp()` in `lib/rfc3161.js`. Not your concern.

    ### Module API

    ```js
    // packages/verify/lib/cms-verify.js

    /**
     * Verifies the CMS/PKCS#7 signature and certificate chain of an
     * RFC 3161 timestamp token.
     *
     * @param {string} tokenBase64  Base64-encoded DER timestamp token
     * @param {string[]} trustedRootPems  Array of PEM-encoded trusted root certificates
     * @param {string} [genTime]  ISO 8601 genTime from the timestamp (for cert validity check)
     * @returns {Promise<{
     *   valid: boolean,
     *   detail: string|null,
     *   signerInfo: { commonName: string, issuer: string, validFrom: string, validTo: string } | null
     * }>}
     */
    export async function verifyCmsChain(tokenBase64, trustedRootPems, genTime) { ... }
    ```

    Return values:
    - `{ valid: true, detail: null, signerInfo: { ... } }` on success
    - `{ valid: false, detail: "CMS signature verification failed", signerInfo: null }` on failure
    - `{ valid: false, detail: "Certificate chain does not terminate at a trusted root", signerInfo: null }` on untrusted chain
    - `{ valid: false, detail: "Signer certificate missing id-kp-timeStamping EKU", signerInfo: null }` on missing EKU
    - `{ valid: false, detail: "Signer certificate was not valid at timestamp time", signerInfo: null }` on validity period mismatch

    ### PKIjs integration

    Import from pkijs:
    ```js
    import * as asn1js from 'asn1js';
    import { ContentInfo, SignedData, Certificate } from 'pkijs';
    ```

    PKIjs requires a crypto engine. In Node.js 20+, use the webcrypto global:
    ```js
    import * as pkijs from 'pkijs';
    import { Crypto } from '@peculiar/webcrypto';
    // or simply: pkijs.setEngine("NodeJS", new Crypto());
    // Actually, in Node 20+ globalThis.crypto exists, so:
    import { CryptoEngine } from 'pkijs';
    const engine = new CryptoEngine({ crypto: globalThis.crypto });
    pkijs.setEngine("NodeJS", engine);
    ```

    Check if pkijs v3 needs explicit engine setup or if it auto-detects
    Node.js webcrypto. Test both paths.

    ### CRITICAL: Validate PKIjs chain verification actually works

    There is a known issue (PKIjs GitHub issue #332) where
    `SignedData.verify()` with `checkChain: true` was reported to always
    return true regardless of trustedCerts. You MUST write a test that:

    1. Calls `verifyCmsChain()` with an EMPTY `trustedRootPems` array
    2. Asserts that verification FAILS (returns `{ valid: false, ... }`)

    If this test passes with empty trustedCerts (it should NOT), the chain
    validation is broken and you must implement manual chain walking as a
    fallback using `@peculiar/x509`.

    ### PEM parsing helper

    Write a helper to convert PEM strings to PKIjs Certificate objects:
    ```js
    function pemToCertificate(pem) {
      const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
      const der = Buffer.from(b64, 'base64');
      const asn1 = asn1js.fromBER(der.buffer);
      return new Certificate({ schema: asn1.result });
    }
    ```

    ### Root certificate loading

    Create a function that loads all PEM files from the
    `certs/trusted-roots/` directory:

    ```js
    import { readFileSync, readdirSync } from 'node:fs';
    import { join, dirname } from 'node:path';
    import { fileURLToPath } from 'node:url';

    const __dirname = dirname(fileURLToPath(import.meta.url));
    const CERTS_DIR = join(__dirname, '..', 'certs', 'trusted-roots');

    export function loadTrustedRoots() {
      const files = readdirSync(CERTS_DIR).filter(f => f.endsWith('.pem'));
      return files.map(f => readFileSync(join(CERTS_DIR, f), 'utf8'));
    }
    ```

    ### Integrate into verify.js

    Update `packages/verify/lib/verify.js` to add the 5th check
    (`timestampChain`). After the existing timestamp check (check 4), add:

    ```js
    // Check 5: timestampChain (CMS certificate chain validation)
    if (version === '0.2.0') {
      const tsEntry = (signedData?.signatures ?? []).find(s => s.type === 'rfc3161');
      if (!tsEntry) {
        checks.push({ name: 'timestampChain', status: 'skip',
          detail: 'Cannot verify chain without timestamp token' });
      } else if (!options.trustedRoots || options.trustedRoots.length === 0) {
        checks.push({ name: 'timestampChain', status: 'skip',
          detail: 'No trusted root certificates provided' });
      } else {
        try {
          const cmsResult = await verifyCmsChain(
            tsEntry.token,
            options.trustedRoots,
            timestampData?.genTime
          );
          if (cmsResult.valid) {
            checks.push({ name: 'timestampChain', status: 'pass' });
          } else {
            checks.push({ name: 'timestampChain', status: 'fail',
              detail: cmsResult.detail });
          }
        } catch (err) {
          checks.push({ name: 'timestampChain', status: 'fail',
            detail: `CMS chain verification error: ${err.message}` });
        }
      }
    }
    ```

    ### Security hardening

    - Use `crypto.timingSafeEqual` for the messageImprint hash comparison
      in `lib/rfc3161.js`. Replace the existing string `===` comparison in
      `verifyTimestamp()`:
      ```js
      import { timingSafeEqual } from 'node:crypto';
      // ...
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const actualBuf = Buffer.from(messageImprintHex, 'hex');
      if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
        return { valid: false, reason: 'messageImprint hash does not match' };
      }
      ```

    - Add max decompressed size check to WACZ unzipping in `lib/verify.js`.
      After `unzipSync`, check total decompressed size:
      ```js
      const totalSize = Object.values(files).reduce((sum, f) => sum + f.byteLength, 0);
      if (totalSize > 100 * 1024 * 1024) { // 100MB
        return { verified: false, checks: [
          { name: 'artifactHashes', status: 'fail', detail: 'WACZ exceeds maximum size (100MB)' },
          // ... same for other checks
        ]};
      }
      ```

    ## What NOT to do

    - Do NOT replace the existing DER parser in `lib/rfc3161.js`. Keep it
      for `extractTSTInfo` / field extraction. PKIjs is used ONLY for
      crypto verification (signature + chain).
    - Do NOT add CRL or OCSP revocation checking. This requires network
      access which breaks the offline requirement. Document as a known
      limitation.
    - Do NOT validate TSA policy OIDs. Log the policy OID for informational
      purposes if available.
    - Do NOT modify the CLI interface or output formatting. That is Task 3.
    - Do NOT add `@peculiar/webcrypto` as a dependency unless the PKIjs
      crypto engine setup fails with the built-in `globalThis.crypto`.

    ## Context

    The existing `verifyTimestamp()` function in `lib/rfc3161.js` only checks
    messageImprint hash match (step 5 of RFC 3161 Section 2.4.2). The new
    CMS module adds steps 1-4: signature verification, chain validation, EKU
    check, and validity period check.

    The project currently uses DigiCert's timestamping service
    (http://timestamp.digicert.com). The certificate chain is:
    - Root: DigiCert Trusted Root G4 (expires 2038-01-15)
    - Intermediate: DigiCert Trusted G4 RSA4096 SHA256 TimeStamping CA
    - Leaf: DigiCert Timestamp Authority (the actual TSA signer)

    The root cert is bundled at
    `packages/verify/certs/trusted-roots/DigiCertTrustedRootG4.pem`.

    PKIjs dependencies are pinned to exact versions in package.json:
    pkijs@3.3.3, asn1js@3.0.5, pvutils@1.1.3.

- **Deliverables**:
    - `packages/verify/lib/cms-verify.js` with `verifyCmsChain()` function
    - Root certificate loader (either in cms-verify.js or a separate module)
    - Updated `packages/verify/lib/verify.js` with 5th check integration
    - Updated `packages/verify/lib/rfc3161.js` with `timingSafeEqual`
    - Max decompressed size check in verify.js
- **Success criteria**:
    - `verifyCmsChain()` with a valid DigiCert timestamp token and the
      bundled root cert returns `{ valid: true, ... }`
    - `verifyCmsChain()` with an EMPTY trustedRoots array returns
      `{ valid: false, ... }` (validates PKIjs issue #332 is not a problem)
    - `verifyCmsChain()` rejects tokens where the signer cert lacks
      id-kp-timeStamping EKU
    - messageImprint comparison uses `crypto.timingSafeEqual`
    - No new dependencies beyond what Task 1 established (pkijs, asn1js, pvutils)

---

### Task 3: Build CLI interface, output formatting, and key resolution

- **Agent**: devx-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no (skip)
- **Prompt**: |
    You are building the CLI interface, output formatting, and key resolution
    for `@wrl/verify`, a standalone CLI tool for offline cryptographic
    verification of WRL WACZ captures.

    ## What to do

    Implement three modules in `packages/verify/lib/`:
    1. `cli.js` -- argument parsing, orchestration, exit codes
    2. `format.js` -- human-readable and JSON output formatters
    3. `key-resolver.js` -- public key resolution from multiple sources

    ### 1. cli.js -- Argument parsing and orchestration

    The CLI has a narrow surface. Parse `process.argv` manually in ~60 lines.
    Do NOT use commander, yargs, or any argument parsing library.

    **Interface:**
    ```
    USAGE
      $ wrl-verify <file-or-url> [options]

    Verify the cryptographic integrity of a WRL WACZ capture.

    ARGUMENTS
      <file-or-url>    Path to a .wacz file, or a WRL capture URL

    OPTIONS
      --origin <url>       WRL instance URL for key resolution
      --key <base64>       Ed25519 public key (base64)
      --key-file <path>    Read public key from file
      --trust-embedded     Use the embedded key (insecure, see below)
      --trust-root <path>  Additional trusted root certificate (PEM)
      --json               Output machine-readable JSON to stdout
      --no-color           Disable colored output
      -h, --help           Show this help message
      --version            Show version number

    EXIT CODES
      0    All checks passed (verified)
      1    One or more checks failed (not verified)
      2    Usage error (bad arguments, missing file, network error)

    TRUST MODEL
      Remote URLs: key is fetched automatically from the server origin.
      Local files: you must specify --origin, --key, or --key-file.
      --trust-embedded uses the key embedded in the WACZ (proves internal
      consistency only, not that the capture came from a trusted operator).
    ```

    **Argument parsing rules:**
    - First non-flag argument is the file/URL
    - `--key`, `--origin`, `--key-file`, `--trust-embedded` are mutually
      exclusive key sources. Error if more than one is provided.
    - For remote WRL URLs (matching `/v1/captures/cap_[a-f0-9]+`), auto-derive
      origin from the URL. `--origin` overrides the auto-derived origin.
    - `--key` and `--key-file` are mutually exclusive with `--origin`
    - `--trust-root` can be specified multiple times (accumulate paths)
    - Unknown flags produce an error with the unrecognized flag name

    **Orchestration flow in `run(args)`:**

    ```js
    export async function run(args) {
      // 1. Parse arguments
      // 2. Handle --help and --version early
      // 3. Validate: file-or-url is required
      // 4. Determine input type: local file, WRL URL, or direct WACZ URL
      // 5. Resolve the signing key (via key-resolver.js)
      // 6. Load/fetch the WACZ bytes
      // 7. Load trusted root certificates (bundled + any --trust-root extras)
      // 8. Call verifyWacz(waczBytes, publicKeyBytes, { trustedRoots })
      // 9. Format and print output (via format.js)
      // 10. Exit with appropriate code (0, 1, or 2)
    }
    ```

    **Exit code mapping:**
    - `verified === true` -> exit 0
    - `verified === false` -> exit 1
    - Any error before verification runs (file not found, bad args, network
      error, key resolution failure) -> exit 2

    **Error handling:**
    - Catch all errors in `run()`. Print to stderr.
    - Format: `Error: <what went wrong>`
    - For `--json` mode, errors output: `{ "error": "message", "verified": null, "checks": [], "source": "..." }`
    - Include Node.js version check at startup:
      ```
      Error: @wrl/verify requires Node.js 20 or later.
      You are running Node.js X.Y.Z.
      ```

    ### 2. format.js -- Output formatters

    **Human-readable output (default):**

    Passing:
    ```
    Verified  capture.wacz

      File integrity        pass
      Bundle integrity      pass
      Digital signature     pass
      Timestamp imprint     pass
      Timestamp chain       pass

      Signed    2026-03-16T14:22:07Z
      TSA       DigiCert Timestamp Authority
      Key       a1b2c3d4 (from wrl.benpeter.workers.dev)
      Hash      sha256:a1b2c3d4e5f6...

    Verdict: All 5 cryptographic checks passed. This capture has not been
    modified since it was signed by the capture service.
    ```

    Failing:
    ```
    FAILED  capture.wacz

      File integrity        pass
      Bundle integrity      pass
      Digital signature     FAIL  Ed25519 signature verification failed
      Timestamp imprint     pass
      Timestamp chain       skip  No certificate chain available

      Signed    2026-03-16T14:22:07Z
      Hash      sha256:a1b2c3d4e5f6...

    Verdict: 1 of 5 checks failed. This capture cannot be verified as authentic.
    ```

    **Design rules:**
    - Line 1: "Verified" (title case, green on TTY) or "FAILED" (all caps,
      red on TTY) followed by the source filename or URL
    - Check table: all checks displayed always, fixed order. No progressive
      disclosure. `pass` is lowercase (quiet success), `FAIL` is uppercase
      (visual interrupt), `skip` is lowercase dim/gray.
    - Failing or skipped checks show their detail string inline after the status
    - Metadata block: Signed time, TSA name (when available), Key info
      (keyId and source), Hash (truncated to first 16 hex chars in human
      output, full in JSON)
    - Key source displayed alongside the check:
      `Key       a1b2c3d4 (from wrl.benpeter.workers.dev)` for origin-resolved
      `Key       a1b2c3d4 (user-provided)` for --key/--key-file
      `Key       a1b2c3d4 (EMBEDDED -- self-asserted only)` for --trust-embedded
    - Verdict sentence: copy-pasteable for legal/compliance use
      - Count applicable vs skipped: "3 of 3 applicable checks passed.
        2 checks were not applicable (no timestamp data)."
      - For all-pass: "All N cryptographic checks passed. This capture has
        not been modified since it was signed by the capture service."
      - For failure: "N of M checks failed. This capture cannot be verified
        as authentic. Failed: <comma-separated failed check labels>."
    - No emoji anywhere
    - Verdict sentence does NOT include local clock time (deterministic output)

    **Color:**
    - Use raw ANSI escape codes. No chalk or color library.
    - Green for pass/Verified, red for FAIL/FAILED, dim gray for skip
    - Suppress color when: stdout is not a TTY, `--no-color` flag, or
      `NO_COLOR` env var is set (per https://no-color.org/)
    - ~20 lines of color utility code max

    **Check label mapping** (use these exact labels):

    | Internal name      | CLI label           |
    | ------------------ | ------------------- |
    | `artifactHashes`   | File integrity      |
    | `bundleHash`       | Bundle integrity    |
    | `signature`        | Digital signature   |
    | `timestamp`        | Timestamp imprint   |
    | `timestampChain`   | Timestamp chain     |

    **JSON output (`--json`):**

    Single JSON object to stdout. All human-readable messages go to stderr
    when `--json` is active.

    ```json
    {
      "verified": true,
      "checks": [
        { "name": "artifactHashes", "label": "File integrity", "status": "pass", "detail": null },
        { "name": "bundleHash", "label": "Bundle integrity", "status": "pass", "detail": null },
        { "name": "signature", "label": "Digital signature", "status": "pass", "detail": null },
        { "name": "timestamp", "label": "Timestamp imprint", "status": "pass", "detail": null },
        { "name": "timestampChain", "label": "Timestamp chain", "status": "pass", "detail": null }
      ],
      "capture": {
        "bundleHash": "sha256:a1b2c3d4e5f6...",
        "signature": "base64...",
        "publicKey": "base64...",
        "signedAt": "2026-03-16T14:22:07Z",
        "timestamp": {
          "genTime": "2026-03-16T14:22:08Z",
          "tsa": "DigiCert Timestamp Authority"
        }
      },
      "keyResolution": {
        "keyId": "a1b2c3d4",
        "source": "origin",
        "origin": "https://wrl.benpeter.workers.dev",
        "endpoint": "/.well-known/signing-keys"
      },
      "source": "capture.wacz",
      "verifiedAt": "2026-03-16T15:00:00.000Z"
    }
    ```

    Key JSON design rules:
    - `detail` is always present (null when nothing to say)
    - `name` is the stable machine key; `label` is the human-readable display name
    - `verified: null` for errors (not false), with `error` field
    - `source` records what was verified (filename or URL)
    - `verifiedAt` records when verification ran (ISO 8601)
    - `keyResolution` always present, shows trust basis

    **Error JSON:**
    ```json
    { "error": "message", "verified": null, "checks": [], "source": "capture.wacz" }
    ```

    ### 3. key-resolver.js -- Public key resolution

    **Three trust levels:**

    1. **Origin-verified** (source: "origin"): fetch key from
       `{origin}/.well-known/signing-keys` with keyId matching, falling back
       to `{origin}/.well-known/signing-key`
    2. **Key-pinned** (source: "pinned"): user supplies key via `--key` or
       `--key-file`
    3. **Embedded** (source: "embedded"): use key from WACZ
       `datapackage-digest.json` (only with `--trust-embedded`)

    **Key resolution algorithm for origin mode:**
    1. Extract `keyId` from the WACZ's `datapackage-digest.json`
       `signedData.signatures[type="self"].keyId`
    2. Fetch `{origin}/.well-known/signing-keys`
    3. Find the entry where `keyId` matches
    4. If found, use that key
    5. If not found, fetch `{origin}/.well-known/signing-key` as fallback
    6. If the fallback key's `keyId` matches, use it
    7. If no match, fail with "Key not found for keyId: {id}"
    8. For v0.1.0 captures without keyId: fetch the current key from
       `/.well-known/signing-key` directly

    **API:**
    ```js
    /**
     * @param {object} options
     * @param {string} [options.origin] - WRL instance URL
     * @param {string} [options.key] - Base64 public key
     * @param {string} [options.keyFile] - Path to key file
     * @param {boolean} [options.trustEmbedded] - Use embedded key
     * @param {object} [options.signedData] - From datapackage-digest.json
     * @returns {Promise<{
     *   publicKeyBytes: Uint8Array,
     *   keyId: string|null,
     *   source: "origin"|"pinned"|"embedded",
     *   origin: string|null,
     *   endpoint: string|null
     * }>}
     */
    export async function resolveKey(options) { ... }
    ```

    **Remote fetching:**
    - Use native `fetch()` (Node 20+ global)
    - 5s timeout for key fetch, 30s timeout for WACZ download
    - Size guard: refuse downloads >100MB
    - On network error: print URL that failed, suggest `--key` or `--key-file`
      as alternatives, exit 2

    **URL type detection:**
    ```js
    function isWrlCaptureUrl(input) {
      try {
        const url = new URL(input);
        return /\/v1\/captures\/cap_[a-f0-9]{32}$/.test(url.pathname);
      } catch { return false; }
    }
    ```

    For WRL capture URLs: fetch WACZ from
    `{origin}/v1/captures/{id}/artifacts/wacz`

    **Local file missing key error message:**
    ```
    Error: No signing key source specified for local verification.

    The WACZ file contains an embedded public key, but using it would be
    insecure -- an attacker who modifies the capture can also replace the
    embedded key.

    Specify one of:
      --origin https://wrl.benpeter.workers.dev  Fetch key from the operator
      --key <base64>                             Provide key directly
      --key-file <path>                          Read key from file

    The embedded keyId is: a1b2c3d4
    ```

    **--trust-embedded warning (stderr, always shown):**
    ```
    Warning: Verification used the self-asserted key embedded in the WACZ.
    This proves internal consistency only -- not that the capture was
    produced by a trusted operator.
    ```

    **Progress indicator for remote fetching (stderr only):**
    One line: `Fetching capture from https://...`
    No progress bar, no spinner. One line for what's happening.
    No progress indicator for local files.

    ## What NOT to do

    - Do NOT add any dependencies for argument parsing, colors, or HTTP.
      Use process.argv, ANSI escape codes, and native fetch.
    - Do NOT implement a `--verbose` flag. The default output shows all
      meaningful information. `--json` provides all data. No intermediate
      verbosity level.
    - Do NOT implement a `--quiet` flag. Not in scope for v0.1.0.
    - Do NOT implement stdin piping (`-` for stdin). Not in scope.
    - Do NOT implement batch mode (multiple files). Single file/URL only.
    - Do NOT add a `--no-color` dependency. Raw ANSI + isTTY + NO_COLOR check.

    ## Context

    The verification modules are at `packages/verify/lib/`:
    - `verify.js` -- `verifyWacz(waczBytes, publicKeyBytes, options)` returns
      `{ verified, checks, capture }`
    - `cms-verify.js` -- `verifyCmsChain(tokenBase64, trustedRootPems, genTime)`
    - `rfc3161.js` -- `verifyTimestamp(tokenBase64, expectedBundleHash)`
    - `sha256.js` -- synchronous `sha256(data)` using node:crypto
    - `signing.js` -- `verifySignature(publicKeyBytes, data, signatureBase64)`

    The bundled trust roots are at
    `packages/verify/certs/trusted-roots/*.pem`.

    The WRL API endpoints used:
    - `GET /.well-known/signing-key` -- returns `{ publicKey: "base64...", keyId: "hex8" }`
    - `GET /.well-known/signing-keys` -- returns `{ keys: [{ publicKey, keyId, archivedAt }] }`
    - `GET /v1/captures/{id}/artifacts/wacz` -- returns WACZ binary
    These are rate-limited (429 with Retry-After: 60).

    Project philosophy: vanilla JS, no frameworks, minimal dependencies.
    The `--help` text IS the primary reference.

- **Deliverables**:
    - `packages/verify/lib/cli.js` -- complete CLI orchestration
    - `packages/verify/lib/format.js` -- human-readable and JSON formatters
    - `packages/verify/lib/key-resolver.js` -- key resolution from all sources
    - Working `bin/wrl-verify.js` entry point
    - `--help` output matching the interface spec
- **Success criteria**:
    - `node packages/verify/bin/wrl-verify.js --help` prints help text and exits 0
    - `node packages/verify/bin/wrl-verify.js --version` prints version and exits 0
    - `node packages/verify/bin/wrl-verify.js` (no args) prints usage error and exits 2
    - `node packages/verify/bin/wrl-verify.js nonexistent.wacz --key xxx` prints file error and exits 2
    - Local file verification with `--key` works end-to-end
    - `--json` output is valid JSON with all specified fields
    - Colors appear on TTY, suppressed when piped
    - Exit codes are correct (0 for pass, 1 for fail, 2 for error)

---

### Task 4: Write tests and obtain real TSA fixture

- **Agent**: test-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 3
- **Approval gate**: no (skip)
- **Prompt**: |
    You are writing the test suite for `@wrl/verify`, a standalone CLI tool
    for offline cryptographic verification of WRL WACZ captures.

    ## What to do

    Create a comprehensive test suite under `packages/verify/test/` using
    Node.js built-in `node:test` and `node:assert`. Do NOT use vitest.

    ### Test runner setup

    Add to `packages/verify/package.json`:
    ```json
    "scripts": {
      "test": "node --test test/unit/*.test.js test/integration/*.test.js"
    }
    ```

    ### Directory structure

    ```
    packages/verify/test/
      unit/
        verify.test.js          # port of Worker verify.test.js scenarios
        rfc3161.test.js          # timestamp messageImprint verification
        cms-chain.test.js        # CMS/PKCS#7 certificate chain validation
        canonical-json.test.js   # canonicalize() edge cases
        cli-args.test.js         # argument parsing
        format.test.js           # human-readable and JSON output formatting
        key-resolver.test.js     # key resolution logic
      integration/
        real-wacz.test.js        # end-to-end with a real captured WACZ
      fixtures/
        digicert-tsa-response.der       # real TSA response for chain validation
        digicert-tsa-response.README.md # provenance documentation
        refresh-fixture.sh              # script to re-capture fixture
      helpers/
        build-wacz.js            # buildTestWacz, buildTestWaczV2
        der-builders.js          # writeTLV, buildTSTInfo, buildTimeStampToken
    ```

    ### Test helpers (packages/verify/test/helpers/)

    **build-wacz.js**: Port `buildTestWacz()` and `buildTestWaczV2()` from
    `test/verify.test.js` (the Worker's test file). Key adaptations:

    - Replace `import { sha256 } from '../src/warc.js'` with
      `import { sha256 } from '../../lib/sha256.js'`
    - Replace `import { signBytes } from '../src/signing.js'` with inline
      Ed25519 signing using `crypto.subtle` (the CLI doesn't export signBytes)
    - Replace `import { canonicalize } from '../src/canonical-json.js'` with
      `import { canonicalize } from '../../lib/canonical-json.js'`
    - Replace `btoa(String.fromCharCode(...bytes))` with
      `Buffer.from(bytes).toString('base64')`
    - Keep `fflate` for ZIP construction (same as Worker)

    The helpers should build valid WACZ archives in memory with ephemeral
    Ed25519 keys from `crypto.subtle.generateKey('Ed25519')`.

    `buildTestWaczV2()` constructs a v0.2.0 format WACZ with:
    - `signedData.version: '0.2.0'`
    - `signedData.signatures` array with `type: 'self'` and `type: 'rfc3161'`
    - Synthetic DER timestamp token (NOT a real TSA response -- this is for
      messageImprint testing, not chain validation)

    **der-builders.js**: Port the DER construction helpers from
    `test/rfc3161.test.js`:
    - `writeTLV(tag, content)`
    - `writeLength(n)`
    - `concat(...arrays)`
    - `buildTSTInfo(messageImprintHex, genTimeStr, nonceHex)`
    - `buildTimeStampToken(tstInfoBytes)` -- wraps TSTInfo in minimal
      ContentInfo/SignedData envelope

    These helpers build synthetic DER structures for testing the parser.
    They do NOT produce cryptographically valid CMS signatures -- that's
    what the real TSA fixture is for.

    ### Unit tests

    **verify.test.js** -- Port the following test scenarios from the Worker's
    `test/verify.test.js`, adapting vitest assertions to `node:assert`:

    Happy path:
    - Valid WACZ: all checks pass, `verified === true`
    - Valid v0.2.0 WACZ with timestamp: all 4 checks pass (5 with chain if roots provided)
    - Valid v0.2.0 WACZ without timestamp: 3 pass + 1 skip, verified === true
    - Capture metadata returned correctly (bundleHash, signature, publicKey, signedAt)

    Tamper detection:
    - Modified file content: artifactHashes fails
    - Modified datapackage.json: bundleHash fails
    - Wrong public key: signature fails
    - Modified timestamp token: timestamp fails
    - Appended byte to WACZ: artifactHashes fails (zip re-parse)

    Error handling:
    - Not a ZIP file: all checks fail with "not a valid ZIP archive"
    - Missing datapackage.json: all checks fail
    - Missing datapackage-digest.json: specific failure pattern
    - Malformed JSON in manifests: all checks fail

    Security invariants:
    - Hash values never appear in failure details
    - All checks run even after first failure (no short-circuit)
    - Embedded publicKey in result is informational, NOT used for verification

    **rfc3161.test.js** -- Port timestamp verification tests:
    - Valid synthetic token: messageImprint matches, genTime extracted
    - Mismatched hash: verification fails
    - Truncated DER: throws on malformed input
    - Invalid tag bytes: appropriate error messages
    - Missing genTime: throws
    - Nonce extraction: correctly parsed when present

    **cms-chain.test.js** -- NEW tests for CMS chain validation:
    - Valid DigiCert timestamp (real fixture): verifyCmsChain returns
      `{ valid: true, signerInfo: { ... } }`
    - Empty trustedRoots: verifyCmsChain returns `{ valid: false }` (CRITICAL
      test -- validates PKIjs issue #332)
    - Wrong root cert: verifyCmsChain returns `{ valid: false }`
    - Truncated DER token: graceful error (no unhandled throw)
    - EKU validation: if test fixture signer cert has id-kp-timeStamping,
      verify it's checked

    **canonical-json.test.js** -- Edge cases:
    - Key sorting: `{b:1,a:2}` -> `{"a":2,"b":1}`
    - Nested objects: keys sorted at every level
    - Arrays: order preserved
    - Null values: `null` serialized correctly
    - Special characters in strings: proper JSON escaping

    **cli-args.test.js** -- Argument parsing:
    - `--help` recognized
    - `--version` recognized
    - `--json` flag sets JSON mode
    - `--key <value>` parsed correctly
    - `--origin <value>` parsed correctly
    - `--key-file <path>` parsed correctly
    - `--trust-embedded` flag recognized
    - `--trust-root` accumulates multiple paths
    - `--no-color` flag recognized
    - Mutual exclusivity: `--key` + `--origin` errors
    - Unknown flag produces error
    - No argument produces usage error

    **format.test.js** -- Output formatting:
    - Human output contains "Verified" or "FAILED" as first word
    - Check labels match the specified mapping
    - Pass is lowercase, FAIL is uppercase
    - Skip shows detail inline
    - Verdict sentence includes correct counts
    - Verdict handles skip counting correctly ("3 of 3 applicable")
    - JSON output parses as valid JSON
    - JSON contains all required fields
    - JSON `detail` is null (not absent) when no detail
    - JSON error output has `verified: null`
    - Color codes present when TTY flag is true
    - Color codes absent when TTY flag is false

    **key-resolver.test.js** -- Key resolution:
    - `--key` base64: correct key bytes returned
    - `--key-file`: reads file and returns key bytes
    - `--trust-embedded`: extracts key from signedData
    - Missing key for local file: descriptive error message
    - Mutual exclusivity enforcement

    ### Integration test

    **real-wacz.test.js**:
    - Load the real TSA fixture WACZ
    - Run `verifyWacz()` with the bundled trusted roots
    - Assert all 5 checks pass including `timestampChain`
    - Verify `--json` output structure matches schema
    - Test with wrong key: signature fails, other checks still run

    ### Obtaining the real TSA fixture

    Fetch a real WACZ from the production WRL instance that contains a valid
    RFC 3161 timestamp:

    ```bash
    # Fetch the WACZ using the WRL API
    # Source the API key from ~/.secrets
    source ~/.secrets
    # List recent captures to find one with a timestamp
    curl -s -H "Authorization: Bearer $WRL_CAPTURE_API_KEY" \
      https://wrl.benpeter.workers.dev/v1/captures | jq '.captures[0]'

    # Download the WACZ
    curl -s -H "Authorization: Bearer $WRL_CAPTURE_API_KEY" \
      https://wrl.benpeter.workers.dev/v1/captures/{id}/artifacts/wacz \
      -o test/fixtures/real-capture.wacz
    ```

    Also extract the raw DER timestamp response from the WACZ for isolated
    CMS testing:
    ```bash
    # Extract datapackage-digest.json from the WACZ
    # Find the rfc3161 token, base64-decode to DER
    # Save as test/fixtures/digicert-tsa-response.der
    ```

    Document the fixture provenance in
    `test/fixtures/digicert-tsa-response.README.md`:
    - When captured
    - Capture ID used
    - TSA used (DigiCert)
    - Certificate chain details (expiry dates)
    - How to refresh the fixture

    Create `test/fixtures/refresh-fixture.sh` that automates the fetch.

    ### Running tests

    All tests run with: `cd packages/verify && npm test`

    This executes: `node --test test/unit/*.test.js test/integration/*.test.js`

    ## What NOT to do

    - Do NOT use vitest, jest, mocha, or any test framework. Use `node:test`
      and `node:assert` exclusively.
    - Do NOT port `requestTimestamp` tests from the Worker -- the CLI never
      requests timestamps.
    - Do NOT commit large binary fixtures unnecessarily. The real WACZ fixture
      should be as small as possible (capture a simple page).
    - Do NOT mock the verification pipeline in integration tests -- run the
      real code path.
    - Do NOT set blanket coverage percentage targets. Focus on critical path
      coverage (CMS chain: 100% branch, CLI: 90%+ line).

    ## Context

    The Worker's existing test files to reference (but NOT import from):
    - `test/verify.test.js` -- 495 lines, comprehensive verification tests
    - `test/rfc3161.test.js` -- 350 lines, timestamp tests

    The CLI verification modules are at `packages/verify/lib/`:
    - `verify.js` -- `verifyWacz(waczBytes, publicKeyBytes, options)`
    - `cms-verify.js` -- `verifyCmsChain(tokenBase64, trustedRootPems, genTime)`
    - `rfc3161.js` -- `verifyTimestamp(tokenBase64, expectedBundleHash)`
    - `sha256.js` -- synchronous `sha256(data)`
    - `signing.js` -- `verifySignature(publicKeyBytes, data, signatureBase64)`
    - `cli.js` -- `run(args)`
    - `format.js` -- `formatHuman(result, options)`, `formatJson(result, options)`
    - `key-resolver.js` -- `resolveKey(options)`

    The bundled trust roots are at `packages/verify/certs/trusted-roots/*.pem`.

    WRL production URL: https://wrl.benpeter.workers.dev
    API key env var: WRL_CAPTURE_API_KEY (in ~/.secrets, not exported)

    The project requires: "When adding a feature that depends on an external
    service, the test suite must include at least one assertion that the
    integration actually works end-to-end."

- **Deliverables**:
    - Complete test suite under `packages/verify/test/`
    - Test helpers in `packages/verify/test/helpers/`
    - Real TSA fixture in `packages/verify/test/fixtures/`
    - Fixture documentation and refresh script
    - All tests passing with `npm test`
- **Success criteria**:
    - `cd packages/verify && npm test` passes all tests
    - At least one test exercises CMS chain validation with a real DigiCert
      timestamp fixture
    - Empty trustedRoots test confirms PKIjs rejects untrusted chains
    - All tamper detection scenarios from the Worker tests are ported
    - CLI argument parsing covers all flags and mutual exclusivity rules
    - Format tests verify both human and JSON output structure

---

### Cross-Cutting Coverage

- **Testing**: Covered by Task 4 (test-minion). Comprehensive unit and integration test suite using node:test.
- **Security**: Covered by Task 2 (security-minion). CMS chain validation, timingSafeEqual, max decompressed size, bundled trust anchors, defensive input handling.
- **Usability -- Strategy**: Addressed throughout all tasks via ux-strategy-minion's planning contribution. Output format, exit codes, verdict sentences, no --verbose, skip handling, and trust basis transparency are all incorporated into Task 3's prompt.
- **Usability -- Design**: Not included. This is a CLI tool with no visual UI components. The output formatting (covered by ux-strategy) is the entirety of the user-facing design.
- **Documentation**: Deferred to Phase 8 (post-execution). README, --help text, and JSON output documentation will be produced after implementation stabilizes. The --help text is implemented in Task 3 as part of the CLI.
- **Observability**: Not included. This is a CLI tool that runs locally and exits. No runtime service, no background process, no logging/metrics/tracing needed. Exit codes and structured JSON output serve the observability function for CI integration.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This plan produces no web UI (ux-design-minion not needed), no HTML output (accessibility-minion not needed), no web-facing runtime (sitespeed-minion not needed), no runtime services needing coordinated logging (observability-minion not needed), and documentation is deferred to Phase 8 (user-docs-minion reviews at that phase, not here).
- **Not selected**: ux-design-minion, accessibility-minion, sitespeed-minion, observability-minion, user-docs-minion

### Conflict Resolutions

**1. PKIjs vs. no CMS library (security-minion vs. devx-minion)**

devx-minion recommended matching the Worker's verification semantics exactly
(messageImprint match only, no chain validation) and explicitly argued against
adding pkijs due to bundle size (~200-300KB) and npx install speed. security-minion
recommended PKIjs as the only viable library for CMS chain validation.

**Resolution**: security-minion wins. The task explicitly requires "full CMS/PKCS#7
certificate chain validation for RFC 3161 timestamps." This is the core new
capability. PKIjs adds ~200-300KB to installed node_modules -- acceptable for a CLI
that caches after first npx run. The alternative (hand-rolling CMS verification)
would be thousands of lines of security-critical code. Pin exact versions for
supply chain safety.

**2. --verbose flag (devx-minion suggests it, ux-strategy-minion rejects it)**

devx-minion's interface design includes `-v, --verbose`. ux-strategy-minion
explicitly argues against it with detailed rationale: the default output already
shows all checks and details, a verbose flag creates a decision point that punishes
wrong guesses, and users who need more detail want `--json`.

**Resolution**: ux-strategy-minion wins. No `--verbose` flag. The default output
shows everything meaningful. `--json` provides all data. This is a reversible
decision -- if users request more detail later, enrich the default rather than
adding a flag.

**3. --key-url (devx-minion) vs. --origin (api-design-minion)**

devx-minion proposed `--key-url <url>` for fetching the public key. api-design-minion
proposed `--origin <url>` which derives the key endpoint from the origin automatically,
with keyId-based lookup from `/.well-known/signing-keys`.

**Resolution**: api-design-minion wins. `--origin` is more user-friendly ("tell me
where this capture came from") and handles key rotation correctly via keyId matching.
`--key-url` requires the user to know the exact endpoint URL, which is a lower-level
detail. Also adds `--key-file` per api-design-minion's recommendation for reading
keys from files.

**4. Test runner: vitest vs. node:test (devx-minion suggests vitest, test-minion recommends node:test)**

devx-minion's Task 3 mentions "vitest or Node.js native test runner." test-minion
strongly recommends `node:test` with detailed rationale: zero dependencies, the CLI
should model the same lightweight ethos it delivers, vitest is only used in the Worker
because of `@cloudflare/vitest-pool-workers`.

**Resolution**: test-minion wins. `node:test` is the correct choice for a package
whose selling point is minimal dependencies. The API surface difference is trivial.

**5. Check count: 4 vs. 5 checks (timestamp split)**

ux-strategy-minion proposes splitting the timestamp check into two: "Timestamp imprint"
(hash match) and "Timestamp chain" (CMS signature + cert chain). This creates a
5-check output where the web UI shows 4. security-minion's verification chain
naturally produces two distinct results.

**Resolution**: Adopt 5 checks per ux-strategy-minion. The two checks verify genuinely
different things: "the timestamp references the right hash" vs. "the timestamp was
signed by a trusted authority." The CLI adds a capability the web UI doesn't have --
showing it as a separate check is honest and informative. The labels "Timestamp imprint"
and "Timestamp chain" are clear.

**6. Timestamp check label naming**

devx-minion uses "Timestamp (RFC 3161)" as the check label. ux-strategy-minion
proposes "Timestamp imprint" and "Timestamp chain" to avoid jargon in what may be
a non-technical user's output.

**Resolution**: ux-strategy-minion wins. "Timestamp imprint" and "Timestamp chain"
are clearer for both audiences. RFC 3161 can be mentioned in `--help` and README
for the technical audience.

### Risks and Mitigations

**HIGH: PKIjs `SignedData.verify()` chain validation bug (Issue #332)**
PKIjs was reported to always return true for chain validation regardless of
trustedCerts. MUST be validated with a concrete test in Task 2 and Task 4.
Mitigation: Test with empty trustedCerts. If broken, implement manual chain
walking with `@peculiar/x509`.

**MEDIUM: TSA certificate rotation**
DigiCert will eventually rotate certificates. Old captures with previous chains
will fail if only the current root is bundled.
Mitigation: Directory-based trust store (`certs/trusted-roots/`) makes it
trivial to bundle multiple roots. `--trust-root` CLI flag is the escape hatch.

**MEDIUM: npm org availability**
The `@wrl` npm org may not exist or may be owned by someone else.
Mitigation: Check before first publish. Fall back to `wrl-verify` if unavailable.

**MEDIUM: Semantic drift between Worker and CLI**
The Worker's verify.js may change independently of the CLI's vendored copy.
Mitigation: Version comment in both files. Evolution log flags CLI for update
when Worker verification changes. Acceptable because verification semantics
change rarely and deliberately.

**LOW: Ed25519 crypto.subtle compatibility**
Ed25519 via crypto.subtle is available in Node 20+ but the raw key import format
may differ subtly from Workers runtime.
Mitigation: Task 4 ports the exact same test scenarios. Any incompatibility
surfaces immediately.

**LOW: PKIjs supply chain risk**
Three dependencies from Peculiar Ventures (pkijs, asn1js, pvutils).
Mitigation: Pin exact versions, commit lockfile. Packages are well-established
(195k weekly downloads) and maintained by a recognized PKI company.

**LOW: CRL/OCSP gap**
Without revocation checking, a timestamp signed by a revoked certificate still
verifies. RFC 3161 Section 2.4.2 says revocation checking is SHOULD, not MUST.
Mitigation: Document explicitly. Commercial TSAs have never had a timestamping
certificate revoked in practice.

### Execution Order

```
Batch 1:  Task 1 (scaffold + vendor)
Batch 2:  Task 2 (CMS verification)     [blocked by Task 1]
Batch 3:  Task 3 (CLI + formatting)      [blocked by Task 2]
Batch 4:  Task 4 (tests + fixtures)      [blocked by Task 3]
```

All tasks are sequential. Each builds on the previous task's deliverables.
No parallelism is possible given the dependency chain.

No gates -- all skipped per user instruction.

### External Skills

No external skills detected in project.

### Verification Steps

After all tasks complete:

1. **Smoke test local verification:**
   ```bash
   cd packages/verify
   # Download a real WACZ
   source ~/.secrets
   CAPTURE_ID=$(curl -s -H "Authorization: Bearer $WRL_CAPTURE_API_KEY" \
     https://wrl.benpeter.workers.dev/v1/captures | jq -r '.captures[0].id')
   curl -s -H "Authorization: Bearer $WRL_CAPTURE_API_KEY" \
     "https://wrl.benpeter.workers.dev/v1/captures/$CAPTURE_ID/artifacts/wacz" \
     -o /tmp/test-capture.wacz

   # Fetch the signing key
   SIGNING_KEY=$(curl -s https://wrl.benpeter.workers.dev/.well-known/signing-key | jq -r '.publicKey')

   # Verify locally
   node bin/wrl-verify.js /tmp/test-capture.wacz --key "$SIGNING_KEY"
   echo "Exit code: $?"  # should be 0

   # Verify JSON output
   node bin/wrl-verify.js /tmp/test-capture.wacz --key "$SIGNING_KEY" --json | jq .
   ```

2. **Smoke test remote verification:**
   ```bash
   node bin/wrl-verify.js "https://wrl.benpeter.workers.dev/v1/captures/$CAPTURE_ID"
   echo "Exit code: $?"  # should be 0
   ```

3. **Test tamper detection:**
   ```bash
   # Append a byte to corrupt the WACZ
   cp /tmp/test-capture.wacz /tmp/tampered.wacz
   echo "x" >> /tmp/tampered.wacz
   node bin/wrl-verify.js /tmp/tampered.wacz --key "$SIGNING_KEY"
   echo "Exit code: $?"  # should be 1
   ```

4. **Test error handling:**
   ```bash
   node bin/wrl-verify.js nonexistent.wacz --key xxx
   echo "Exit code: $?"  # should be 2
   ```

5. **Run full test suite:**
   ```bash
   cd packages/verify && npm test
   ```
