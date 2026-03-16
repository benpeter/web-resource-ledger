# Test Strategy: RFC 3161 Timestamp Integration

## Current State Assessment

The test suite is mature and well-structured. Key observations from reading every test file:

- **22 test files** covering signing, WACZ assembly, verification (unit + integration), key rotation, security invariants, and graceful degradation
- **fetchMock** from `cloudflare:test` is the established pattern for external HTTP calls (used in `log.test.js` for Coralogix, `capture.test.js` for header fetch, `wacz.test.js` for origin fetch)
- **Test data is constructed in-process** -- the codebase builds minimal valid WACZ archives in `buildTestWacz()` (see `verify.test.js` lines 15-78) rather than loading fixture files
- **`vitest.config.js` generates ephemeral Ed25519 keys** at load time via `node:crypto` -- no committed key material
- **`@cloudflare/vitest-pool-workers`** runs tests inside workerd, giving access to `crypto.subtle`, KV, R2, and fetchMock
- **No `signatures` array exists yet** -- the current `datapackage-digest.json` uses a flat `signedData` object. The RFC 3161 work introduces this structural change

---

## Recommendations

### 1. TSA Response Fixtures: Embed Real DER, Not Synthetic

**Use captured real TSA response fixtures, not hand-rolled DER.**

Rationale:
- RFC 3161 `TimeStampResp` is a deeply nested ASN.1 structure (SEQUENCE of STATUS + TimeStampToken, which wraps a CMS SignedData containing the TSTInfo). Generating synthetic DER that is structurally correct and cryptographically valid is impractical without a full ASN.1 encoder.
- The DER codec's job is to parse *real-world* TSA responses. Testing against synthetic data only validates your own understanding of the format -- not interoperability with actual TSAs.
- A single real response from DigiCert's free TSA (http://timestamp.digicert.com) is ~4KB base64. Embedding 2-3 fixtures is trivially small.

**Fixture acquisition process** (one-time, during implementation):
```bash
# Generate a test hash and request a real timestamp
echo -n "test" | openssl ts -query -data /dev/stdin -sha256 -cert -out req.tsq
curl -s -H "Content-Type: application/timestamp-query" \
     --data-binary @req.tsq \
     http://timestamp.digicert.com -o resp.tsr
# Convert to base64 for embedding in test fixtures
base64 -i resp.tsr
# Inspect the structure
openssl ts -reply -in resp.tsr -text
```

**What to embed as fixtures:**
- `VALID_TSA_RESPONSE` -- a real TimeStampResp with status=0 (granted), for a known SHA-256 hash
- `VALID_TSA_RESPONSE_HASH` -- the exact SHA-256 hash that was timestamped (so verification can round-trip)
- `MALFORMED_DER` -- truncated or corrupted bytes (hand-crafted, not from TSA)
- `WRONG_HASH_RESPONSE` -- a valid TSA response but for a *different* hash than the WACZ bundle hash

**Where to put them:**
Create `test/fixtures/tsa-responses.js` exporting named constants (base64 strings with comments). This follows the project's pattern -- fixtures are inline JS, not external binary files.

### 2. TSA HTTP Endpoint Mocking via fetchMock

**Use the established fetchMock pattern from `log.test.js` -- it is the exact same shape.**

The log test mocks an external HTTPS POST (Coralogix ingestion) with request body capture and configurable responses. TSA mocking is structurally identical: POST binary data to an external HTTPS endpoint, receive binary response.

```js
// Pattern from log.test.js, adapted for TSA:
const TSA_ORIGIN = 'https://timestamp.digicert.com';
const TSA_PATH = '/';

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

function mockTsaSuccess(responseBytes) {
  fetchMock
    .get(TSA_ORIGIN)
    .intercept({ path: TSA_PATH, method: 'POST' })
    .reply(200, responseBytes, {
      headers: { 'content-type': 'application/timestamp-reply' },
    });
}

function mockTsaTimeout() {
  fetchMock
    .get(TSA_ORIGIN)
    .intercept({ path: TSA_PATH, method: 'POST' })
    .replyWithError(new Error('Network timeout'));
}

function mockTsaHttpError(status) {
  fetchMock
    .get(TSA_ORIGIN)
    .intercept({ path: TSA_PATH, method: 'POST' })
    .reply(status, 'Service Unavailable');
}
```

**TSA URL configuration**: The TSA endpoint URL should come from `env` (e.g., `env.TSA_URL`), just like `CORALOGIX_ENDPOINT`. This makes mocking natural -- `vitest.config.js` sets the binding, fetchMock intercepts it. Add to `vitest.config.js`:
```js
bindings: {
  // ...existing...
  TSA_URL: 'https://timestamp.digicert.com',
}
```

**Request validation in mocks**: Use the request-capture pattern from `log.test.js` (line 53-61) to verify the TSA request is well-formed:
- Content-Type is `application/timestamp-query`
- Body is valid DER-encoded TimeStampReq
- SHA-256 hash in the request matches the WACZ bundle hash

### 3. Edge Cases Requiring Coverage

Organized by test file, following the project's existing decomposition:

#### `test/tsa.test.js` (new -- DER codec + TSA client unit tests)

| Test Case | Category | Priority |
|-----------|----------|----------|
| Parse valid DigiCert TSA response, extract genTime | Happy path | P0 |
| Parse valid response, extract messageImprint hash | Happy path | P0 |
| Parse valid response, extract TSA name/serial | Happy path | P1 |
| Reject truncated DER (bytes cut mid-TLV) | Malformed DER | P0 |
| Reject DER with wrong outer tag (not SEQUENCE) | Malformed DER | P0 |
| Reject DER with length overflow (length > remaining bytes) | Malformed DER | P0 |
| Reject DER with indefinite-length encoding | Malformed DER | P1 |
| Reject TSA response with status != 0 (granted) | Protocol error | P0 |
| Reject response where messageImprint hash != expected | Wrong hash | P0 |
| Reject response where messageImprint algorithm != SHA-256 | Wrong algorithm | P1 |
| Build valid TimeStampReq DER from SHA-256 hash | Request building | P0 |
| TimeStampReq includes certReq=true | Request building | P1 |

#### `test/wacz.test.js` (extend existing)

| Test Case | Category | Priority |
|-----------|----------|----------|
| WACZ with TSA: `datapackage-digest.json` has `signatures` array | Structure | P0 |
| `signatures` array contains both `type: "self"` and `type: "rfc3161"` entries | Structure | P0 |
| `type: "self"` entry has Ed25519 signature, publicKey, keyId | Structure | P0 |
| `type: "rfc3161"` entry has base64-encoded TSA response token | Structure | P0 |
| `type: "rfc3161"` entry has `tsaUrl` field | Structure | P1 |
| TSA timeout: capture succeeds, signatures array has only `type: "self"` | Graceful degradation | P0 |
| TSA HTTP 500: same as timeout -- capture succeeds without timestamp | Graceful degradation | P0 |
| TSA returns malformed DER: capture succeeds without timestamp | Graceful degradation | P0 |
| TSA returns wrong hash: capture succeeds without timestamp, log warning | Graceful degradation | P0 |
| No TSA_URL configured: capture succeeds, no `rfc3161` entry in signatures | Graceful degradation | P0 |
| buildWacz with no SIGNING_KEY still returns null (existing test preserved) | Backward compat | P0 |

#### `test/verify.test.js` (extend existing)

| Test Case | Category | Priority |
|-----------|----------|----------|
| WACZ with valid self-sig + valid TSA: verified=true, 4 checks pass | Happy path | P0 |
| WACZ with valid self-sig + no TSA entry: verified=true, timestamp check=skip | Backward compat | P0 |
| WACZ with valid self-sig + malformed TSA token: self-sig passes, timestamp fails | Independence | P0 |
| WACZ with tampered artifact: artifactHashes fails, timestamp still checked | All-checks-run | P0 |
| WACZ with wrong key + valid TSA: signature fails, timestamp passes | Independence | P0 |
| checks array has 4 entries when signatures array present | Structure | P0 |
| checks array has 3 entries (no timestamp check) for old-format WACZ | Backward compat | P0 |
| timestamp check extracts and validates genTime from TSA response | Verification | P0 |
| timestamp check verifies messageImprint matches bundleHash | Verification | P0 |

#### `test/verify-integration.test.js` (extend existing)

| Test Case | Category | Priority |
|-----------|----------|----------|
| Full pipeline with mocked TSA: verify endpoint returns 4 checks | Integration | P0 |
| Verify response `signing` object includes `timestamp` field when TSA present | API shape | P0 |
| Verify response `signing` object omits `timestamp` when TSA absent | API shape | P0 |
| Old WACZ (flat signedData, no signatures array): verify returns 3 checks, all pass | Backward compat | P0 |
| Verify HTML page renders timestamp status section | UI | P1 |

#### `test/backward-compat.test.js` (new -- critical)

| Test Case | Category | Priority |
|-----------|----------|----------|
| Old WACZ with flat `signedData` (no `signatures` array): verifyWacz returns verified=true | Format migration | P0 |
| Old WACZ with flat `signedData`: no timestamp check in results | Format migration | P0 |
| New WACZ with `signatures` array: verifyWacz reads signatures correctly | Format migration | P0 |
| KV record without `wacz.tsaToken`: verify endpoint handles gracefully | Data migration | P0 |
| KV record with `wacz.tsaToken`: verify endpoint includes timestamp info | Data migration | P0 |

### 4. Backward Compatibility Test Strategy

This is the highest-risk area. The format change from flat `signedData` to `signatures` array affects:

**Write path** (`wacz.js`): The new `buildWacz` must produce the `signatures` array format. This is a clean break -- all new WACZs use the new format.

**Read path** (`verify.js`): The verifier must handle BOTH formats:
- **Old format**: `digestDoc.signedData` is an object with `hash`, `signature`, `publicKey`, `keyId`, `created`
- **New format**: `digestDoc.signatures` is an array of `{ type, ... }` objects

**Test approach**: Build two `buildTestWacz` helpers in `verify.test.js`:
1. `buildTestWaczLegacy(privateKey, publicKeyBytes)` -- produces the current flat `signedData` format (copy the existing helper, freeze it)
2. `buildTestWaczV2(privateKey, publicKeyBytes, tsaResponseBytes)` -- produces the new `signatures` array format

Run all existing tamper-detection tests against BOTH formats. This is the strongest proof that the migration is non-breaking.

**Concrete pattern:**
```js
describe('verifyWacz -- backward compatibility', () => {
  it('legacy format (flat signedData): verified=true with correct key', async () => {
    const { waczBytes } = await buildTestWaczLegacy(privateKeyA, publicKeyBytesA);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);
    expect(result.verified).toBe(true);
    expect(result.checks).toHaveLength(3); // no timestamp check
  });

  it('new format (signatures array): verified=true with correct key + valid TSA', async () => {
    const { waczBytes } = await buildTestWaczV2(privateKeyA, publicKeyBytesA, VALID_TSA_RESPONSE);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);
    expect(result.verified).toBe(true);
    expect(result.checks).toHaveLength(4); // includes timestamp check
  });

  it('new format without TSA entry: verified=true, timestamp check skipped', async () => {
    const { waczBytes } = await buildTestWaczV2(privateKeyA, publicKeyBytesA, null);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);
    expect(result.verified).toBe(true);
    const tsCheck = result.checks.find(c => c.name === 'timestamp');
    expect(tsCheck.status).toBe('skip');
  });
});
```

### 5. DER Codec Test Strategy: Known-Answer Tests (Not Property-Based)

**Recommendation: Known-answer tests with real TSA fixtures. Skip property-based testing.**

Rationale:
- The DER codec is a *parser*, not a general-purpose encoder/decoder. It needs to handle exactly one format: RFC 3161 TimeStampResp wrapped in CMS SignedData. The input space is highly constrained.
- Property-based testing (fast-check) shines when the input space is large and the properties are mathematical. DER parsing has neither: the valid inputs are specific ASN.1 structures from real TSAs, and the "property" is just "it either parses or throws."
- fast-check would require writing an ASN.1 generator that produces valid TimeStampResp structures -- this is more complex than the parser itself and tests the generator, not the parser.
- The project philosophy (KISS, lean and mean) strongly favors known-answer tests.

**Test structure for `src/tsa.js` (or `src/der.js`):**

```js
describe('DER parser -- known-answer tests', () => {
  it('parses DigiCert response: extracts status=0', () => {
    const parsed = parseTsaResponse(fromBase64(VALID_TSA_RESPONSE));
    expect(parsed.status).toBe(0);
  });

  it('parses DigiCert response: extracts genTime as Date', () => {
    const parsed = parseTsaResponse(fromBase64(VALID_TSA_RESPONSE));
    expect(parsed.genTime).toBeInstanceOf(Date);
    expect(parsed.genTime.getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('parses DigiCert response: messageImprint matches input hash', () => {
    const parsed = parseTsaResponse(fromBase64(VALID_TSA_RESPONSE));
    expect(parsed.messageImprint).toBe(VALID_TSA_RESPONSE_HASH);
  });

  it('rejects empty buffer', () => {
    expect(() => parseTsaResponse(new Uint8Array(0))).toThrow();
  });

  it('rejects random bytes', () => {
    const random = crypto.getRandomValues(new Uint8Array(128));
    expect(() => parseTsaResponse(random)).toThrow();
  });

  it('rejects truncated valid response', () => {
    const full = fromBase64(VALID_TSA_RESPONSE);
    const truncated = full.slice(0, Math.floor(full.length / 2));
    expect(() => parseTsaResponse(truncated)).toThrow();
  });
});
```

**DER encoder tests** (for building TimeStampReq):
```js
describe('DER encoder -- TimeStampReq', () => {
  it('builds valid DER that openssl can parse', () => {
    // The output should start with SEQUENCE tag (0x30)
    const hash = new Uint8Array(32).fill(0xab);
    const req = buildTsaRequest(hash);
    expect(req[0]).toBe(0x30); // SEQUENCE
  });

  it('embeds the SHA-256 OID', () => {
    const hash = new Uint8Array(32).fill(0xab);
    const req = buildTsaRequest(hash);
    // SHA-256 OID: 2.16.840.1.101.3.4.2.1 = 60 86 48 01 65 03 04 02 01
    const oid = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
    const reqStr = Array.from(req).map(b => b.toString(16).padStart(2, '0')).join('');
    const oidStr = Array.from(oid).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(reqStr).toContain(oidStr);
  });

  it('embeds the hash bytes verbatim', () => {
    const hash = new Uint8Array(32);
    hash[0] = 0xde; hash[1] = 0xad; hash[30] = 0xbe; hash[31] = 0xef;
    const req = buildTsaRequest(hash);
    const reqHex = Array.from(req).map(b => b.toString(16).padStart(2, '0')).join('');
    expect(reqHex).toContain('dead');
    expect(reqHex).toContain('beef');
  });
});
```

---

## Proposed Tasks

Listed in dependency order. Tasks marked with [BLOCKING] must complete before dependent tasks can start.

### Task 1: TSA Fixture Acquisition [BLOCKING]
- Request a real timestamp from DigiCert's free TSA for a known SHA-256 hash
- Capture the response as base64
- Create `test/fixtures/tsa-responses.js` with `VALID_TSA_RESPONSE`, `VALID_TSA_RESPONSE_HASH`, and `MALFORMED_DER` constants
- Validate the fixture with `openssl ts -reply -text`

### Task 2: DER Codec Unit Tests [BLOCKING]
- Write `test/tsa.test.js` (or `test/der.test.js`) with known-answer tests against the real fixture
- Tests for: parse valid response, extract genTime, extract messageImprint, reject malformed, reject truncated, reject wrong tag
- Tests for: build TimeStampReq, verify SHA-256 OID and hash embedding
- These tests define the codec's contract before implementation

### Task 3: TSA Client Unit Tests
- Add TSA HTTP mocking tests in `test/tsa.test.js` (same file or separate `test/tsa-client.test.js`)
- Mock fetchMock for TSA endpoint: success, timeout, HTTP error, malformed response body
- Verify request Content-Type, request body is valid TimeStampReq
- Verify response parsing delegates to DER codec
- Verify graceful degradation: returns null on any failure, does not throw

### Task 4: WACZ Assembly Tests (extend `test/wacz.test.js`)
- Add `vitest.config.js` binding: `TSA_URL: 'https://timestamp.digicert.com'`
- Add fetchMock for TSA in existing `beforeEach` setup
- Test new signatures array structure in `datapackage-digest.json`
- Test graceful degradation: TSA timeout still produces WACZ with self-sig only
- Test no TSA_URL configured: no `rfc3161` entry in signatures array

### Task 5: Verification Tests (extend `test/verify.test.js`)
- Freeze existing `buildTestWacz` as `buildTestWaczLegacy` for backward compat tests
- Add `buildTestWaczV2` that produces signatures array format
- Test verifyWacz with new format: 4 checks, timestamp check validates genTime and hash
- Test verifyWacz with legacy format: 3 checks, no timestamp check, verified=true
- Test independence: timestamp check runs regardless of signature check result
- Test security: timestamp check detail messages never leak hash values

### Task 6: Integration Tests (extend `test/verify-integration.test.js`)
- Add TSA fetchMock to existing `beforeEach`
- Test full pipeline: capture -> WACZ with TSA -> verify endpoint returns 4 checks
- Test API response shape: `signing.timestamp` field present/absent
- Test backward compat: manually construct old-format KV record + WACZ, verify endpoint handles correctly

### Task 7: Backward Compatibility Tests (new `test/backward-compat.test.js` or inline in verify.test.js)
- Test matrix: old WACZ format x new verifier, new WACZ format x new verifier
- Ensure all existing verify.test.js assertions pass without modification against the new verifier
- Test KV records with and without `tsaToken` field

---

## Risks and Concerns

### Risk 1: DER Parsing Scope Creep (HIGH)
The biggest risk is building a general-purpose ASN.1 parser when you only need to extract 3 fields from a TimeStampResp (status, genTime, messageImprint hash). **Recommendation**: Write a purpose-built parser that navigates the specific tag path to each field, not a generic TLV walker. The test fixtures will validate that this path works against real TSA output. If a second TSA produces structurally different (but valid) DER, the parser may need adjustment -- but that is a future concern explicitly scoped out ("multiple TSA redundancy" is in the parking lot).

### Risk 2: Cloudflare Workers Crypto Constraints (MEDIUM)
The TSA response contains a CMS SignedData with an RSA or ECDSA signature over the TSTInfo. Full cryptographic verification of the TSA certificate chain is NOT feasible in a Workers environment (no X.509 path validation in `crypto.subtle`). **Recommendation**: The verification scope should be:
- Parse the TimeStampResp DER structure successfully (structural integrity)
- Verify `status == 0` (granted)
- Verify `messageImprint.hashAlgorithm == SHA-256`
- Verify `messageImprint.hashedMessage == bundleHash`
- Extract `genTime` as the independent timestamp
- **Do NOT verify the TSA's certificate chain** -- that requires a trust store and OCSP/CRL checking that Workers cannot do. Instead, trust is anchored by the TSA URL being operator-configured (not user-supplied). Document this trust model explicitly.

Tests should validate what *is* checked (hash match, status, structure) and explicitly assert that the parser does NOT throw on valid responses -- not that it validates certificate chains.

### Risk 3: fetchMock Content-Type Handling for Binary Data (MEDIUM)
The TSA response is binary DER (`application/timestamp-reply`). fetchMock in cloudflare:test may handle binary differently from text. The `log.test.js` pattern uses string bodies. **Recommendation**: Verify early (Task 1) that fetchMock can return `Uint8Array` or `ArrayBuffer` bodies. If not, return base64 and decode in the TSA client. Write a spike test first:
```js
it('fetchMock can return binary response body', async () => {
  const binaryData = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x00]);
  fetchMock.get('https://tsa.test')
    .intercept({ path: '/', method: 'POST' })
    .reply(200, binaryData, { headers: { 'content-type': 'application/timestamp-reply' } });
  const resp = await fetch('https://tsa.test/', { method: 'POST', body: new Uint8Array(1) });
  const buf = await resp.arrayBuffer();
  expect(new Uint8Array(buf)).toEqual(binaryData);
});
```

### Risk 4: Backward Compatibility Gap in Verification Endpoint (HIGH)
The verify endpoint (`src/index.js` routing -> verify handler -> `verifyWacz()`) currently expects `signedData` as a flat object. If the new code only handles `signatures` array and someone verifies an old WACZ, it will fail. **Mitigation**: The `buildTestWaczLegacy` helper (Task 5) is the safety net. Run it first, before any code changes to `verify.js`, to establish the baseline. Then implement format detection in `verifyWacz()` and verify both paths pass.

### Risk 5: Test Suite Performance (LOW)
Adding TSA-related tests with fetchMock and DER parsing should not meaningfully impact test speed. The DER parsing is pure computation (microseconds). The fetchMock calls are in-process. The main risk is if tests accidentally make real network calls to TSA endpoints. **Mitigation**: `fetchMock.disableNetConnect()` in every test file (already the established pattern) prevents this.

---

## Additional Agents Needed

### security-minion (REQUIRED)
- Review the TSA trust model: is "operator-configured TSA URL" sufficient trust anchor, or does the absence of certificate chain validation create a gap?
- Review whether the TSA response token should be stored opaquely (base64 blob) or with extracted fields. Opaque storage is simpler but harder to audit; extracted fields are richer but create a parsing dependency at storage time.
- Review what `detail` messages the timestamp verification check can safely include without leaking internal state.

### api-design-minion (REQUIRED)
- Define the `signatures` array schema for `datapackage-digest.json`
- Define the verify endpoint response shape changes: new `timestamp` field in `signing`, new `timestamp` check in `checks` array
- Decide whether the verify endpoint check count change (3 -> 4) is a breaking API change requiring versioning or acceptable additive change

### iac-minion (RECOMMENDED)
- `TSA_URL` needs to be added as a wrangler var (not a secret -- the TSA URL is not sensitive)
- Staging environment needs the same binding
- Verify that Workers can make outbound HTTPS POST to DigiCert's TSA endpoint (no egress restrictions)

### edge-minion (OPTIONAL)
- Evaluate latency impact: the TSA request adds a network round-trip to every capture. Should it be fire-and-forget (with a retry on verification) or blocking in the WACZ assembly pipeline?
- If blocking: does it fit within the 30s `ctx.waitUntil` budget alongside browser rendering, header fetch, R2 writes, and KV updates?

---

## Implementation Notes for the Implementer

1. **Test file placement**: Follow existing convention. Unit tests for the DER codec and TSA client go in `test/tsa.test.js`. Integration tests extend existing files. Only create `test/backward-compat.test.js` if the backward-compat tests don't fit naturally into `verify.test.js`.

2. **No new test dependencies**: The project has zero test-only npm dependencies beyond `@cloudflare/vitest-pool-workers`. Do not add `fast-check`, `nock`, or any ASN.1 library for tests. Use `fetchMock` from `cloudflare:test` and hand-written assertions.

3. **Fixture file**: `test/fixtures/tsa-responses.js` should export base64 strings with JSDoc comments explaining what each fixture contains (TSA, hash algorithm, the known hash value). This is the only new test file that contains "magic" data -- keep it well-documented.

4. **Security invariant tests**: Extend the existing security test in `verify.test.js` (line 302-388) to include the new `timestamp` check. The same rules apply: no hash values in detail messages, no expected/actual wording, all checks run even when earlier checks fail.

5. **Check ordering**: The existing checks are always `[artifactHashes, bundleHash, signature]`. The new `timestamp` check should be 4th. Tests should verify ordering is consistent.
