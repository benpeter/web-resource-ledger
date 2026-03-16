// tva
import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requestTimestamp, verifyTimestamp } from '../src/rfc3161.js';

// ---------------------------------------------------------------------------
// DER construction helpers (mirrors internal logic in rfc3161.js)
// Used only to build synthetic test fixtures -- not under test themselves.
// ---------------------------------------------------------------------------

function writeLength(n) {
  if (n < 0x80) return new Uint8Array([n]);
  if (n <= 0xff) return new Uint8Array([0x81, n]);
  if (n <= 0xffff) return new Uint8Array([0x82, n >> 8, n & 0xff]);
  throw new Error('length too large for test helper');
}

function writeTLV(tag, content) {
  const lenBytes = writeLength(content.length);
  const out = new Uint8Array(1 + lenBytes.length + content.length);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(content, 1 + lenBytes.length);
  return out;
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

// OID_SHA256: 2.16.840.1.101.3.4.2.1
const OID_SHA256_BYTES = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

// OID for a test TSA policy (1.2.3.4) -- minimal valid OID for our purposes
// Encoded: 0x2a = 40*1+2, then 3, 4
const OID_TEST_POLICY = new Uint8Array([0x2a, 0x03, 0x04]);

/**
 * Builds a minimal TSTInfo DER SEQUENCE matching the structure parseTSTInfo expects.
 *
 * TSTInfo SEQUENCE:
 *   [0] INTEGER 1       (version)
 *   [1] OID policy
 *   [2] MessageImprint SEQUENCE
 *         AlgorithmIdentifier SEQUENCE { OID SHA-256, NULL }
 *         OCTET STRING <hashBytes>
 *   [3] INTEGER 1       (serialNumber)
 *   [4] GeneralizedTime "20260316120000Z"
 */
function buildTSTInfo(hashBytes, genTimeStr = '20260316120000Z') {
  const version = writeTLV(0x02, new Uint8Array([0x01]));
  const policy = writeTLV(0x06, OID_TEST_POLICY);

  const algId = writeTLV(0x30, concat(
    writeTLV(0x06, OID_SHA256_BYTES),
    writeTLV(0x05, new Uint8Array(0)),
  ));
  const msgImprint = writeTLV(0x30, concat(
    algId,
    writeTLV(0x04, hashBytes),
  ));

  const serial = writeTLV(0x02, new Uint8Array([0x01]));
  const genTime = writeTLV(0x18, new TextEncoder().encode(genTimeStr));

  return writeTLV(0x30, concat(version, policy, msgImprint, serial, genTime));
}

/**
 * Builds a minimal ContentInfo > SignedData > EncapContentInfo wrapper around
 * TSTInfo bytes. This is the structure that extractTSTInfo navigates.
 *
 * ContentInfo SEQUENCE
 *   OID id-signedData (1.2.840.113549.1.7.2)
 *   [0] EXPLICIT
 *     SignedData SEQUENCE
 *       INTEGER version
 *       SET digestAlgorithms (empty)
 *       EncapContentInfo SEQUENCE
 *         OID id-ct-TSTInfo (1.2.840.113549.1.9.16.1.4)
 *         [0] EXPLICIT
 *           OCTET STRING <tstInfoDer>
 *       ...
 */
function buildTimeStampToken(tstInfoDer) {
  // OID 1.2.840.113549.1.7.2 (id-signedData)
  const oidSignedData = writeTLV(0x06, new Uint8Array([
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02,
  ]));

  // OID 1.2.840.113549.1.9.16.1.4 (id-ct-TSTInfo)
  const oidTSTInfo = writeTLV(0x06, new Uint8Array([
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04,
  ]));

  const eContent = writeTLV(0xa0, writeTLV(0x04, tstInfoDer));
  const encapContentInfo = writeTLV(0x30, concat(oidTSTInfo, eContent));

  // SignedData: version=3, empty digestAlgorithms SET, encapContentInfo
  const sdVersion = writeTLV(0x02, new Uint8Array([0x03]));
  const digestAlgs = writeTLV(0x31, new Uint8Array(0)); // empty SET
  const signedData = writeTLV(0x30, concat(sdVersion, digestAlgs, encapContentInfo));

  // [0] EXPLICIT wrapping SignedData
  const ctx0 = writeTLV(0xa0, signedData);

  return writeTLV(0x30, concat(oidSignedData, ctx0));
}

/**
 * Builds a complete TimeStampResp DER:
 *   TimeStampResp SEQUENCE
 *     PKIStatusInfo SEQUENCE
 *       status INTEGER 0  (granted)
 *     TimeStampToken (ContentInfo SEQUENCE)
 */
function buildTimeStampResp(tstInfoDer) {
  const status = writeTLV(0x02, new Uint8Array([0x00])); // 0 = granted
  const pkiStatusInfo = writeTLV(0x30, status);
  const token = buildTimeStampToken(tstInfoDer);
  return writeTLV(0x30, concat(pkiStatusInfo, token));
}

/**
 * Builds a complete TSA response for a given bundleHash.
 * Returns raw DER Uint8Array representing a valid TimeStampResp.
 */
function buildValidTsaResponse(bundleHash, genTimeStr = '20260316120000Z') {
  const hexHash = bundleHash.slice(7); // strip "sha256:"
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    hashBytes[i] = parseInt(hexHash.slice(i * 2, i * 2 + 2), 16);
  }
  const tstInfoDer = buildTSTInfo(hashBytes, genTimeStr);
  return buildTimeStampResp(tstInfoDer);
}

// ---------------------------------------------------------------------------
// Shared test bundle hash (valid sha256: format)
// ---------------------------------------------------------------------------

const BUNDLE_HASH = 'sha256:' + 'ab'.repeat(32); // 64 hex chars, deterministic

// ---------------------------------------------------------------------------
// fetchMock lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

// ---------------------------------------------------------------------------
// verifyTimestamp: valid token round-trip
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- valid token round-trip', () => {
  it('token built from bundleHash verifies successfully', () => {
    const respDer = buildValidTsaResponse(BUNDLE_HASH);
    // The ContentInfo (token) is child[1] of the TimeStampResp outer SEQUENCE.
    // Extract it the same way parseAndValidate does: skip the PKIStatusInfo.
    // For verifyTimestamp, we pass the full ContentInfo DER directly as base64.
    const token = buildTimeStampToken(buildTSTInfo(
      (() => {
        const hex = BUNDLE_HASH.slice(7);
        const b = new Uint8Array(32);
        for (let i = 0; i < 32; i++) b[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        return b;
      })(),
    ));
    const tokenBase64 = btoa(String.fromCharCode(...token));

    const result = verifyTimestamp(tokenBase64, BUNDLE_HASH);
    expect(result.valid).toBe(true);
    expect(result.genTime).toBe('2026-03-16T12:00:00.000Z');
  });

  it('genTime is returned as ISO 8601 string', () => {
    const hashBytes = new Uint8Array(32).fill(0xcd);
    const bundleHash = 'sha256:' + [...hashBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const token = buildTimeStampToken(buildTSTInfo(hashBytes, '20260101093045Z'));
    const tokenBase64 = btoa(String.fromCharCode(...token));

    const result = verifyTimestamp(tokenBase64, bundleHash);
    expect(result.valid).toBe(true);
    expect(result.genTime).toBe('2026-01-01T09:30:45.000Z');
  });
});

// ---------------------------------------------------------------------------
// verifyTimestamp: hash mismatch
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- hash mismatch', () => {
  it('returns valid: false when expectedBundleHash does not match token imprint', () => {
    // Token contains BUNDLE_HASH but we verify against a different hash
    const hashBytes = new Uint8Array(32).fill(0xab);
    const token = buildTimeStampToken(buildTSTInfo(hashBytes));
    const tokenBase64 = btoa(String.fromCharCode(...token));

    const wrongHash = 'sha256:' + 'ff'.repeat(32);
    const result = verifyTimestamp(tokenBase64, wrongHash);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyTimestamp: malformed input
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- malformed input', () => {
  it('returns valid: false for malformed base64', () => {
    const result = verifyTimestamp('!!!not-base64!!!', BUNDLE_HASH);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns valid: false for empty string', () => {
    const result = verifyTimestamp('', BUNDLE_HASH);
    expect(result.valid).toBe(false);
  });

  it('returns valid: false for valid base64 that is not DER', () => {
    const garbleBase64 = btoa('this is not DER at all, just ascii noise 12345');
    const result = verifyTimestamp(garbleBase64, BUNDLE_HASH);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('returns valid: false when expectedBundleHash lacks sha256: prefix', () => {
    const hashBytes = new Uint8Array(32).fill(0xab);
    const token = buildTimeStampToken(buildTSTInfo(hashBytes));
    const tokenBase64 = btoa(String.fromCharCode(...token));

    const result = verifyTimestamp(tokenBase64, 'ab'.repeat(32));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/sha256:/);
  });
});

// ---------------------------------------------------------------------------
// requestTimestamp: input validation
// ---------------------------------------------------------------------------

describe('requestTimestamp -- input validation', () => {
  it('throws when bundleHash lacks sha256: prefix', async () => {
    await expect(
      requestTimestamp('https://tsa.example.com', 'deadbeef'.repeat(8)),
    ).rejects.toThrow(/sha256:/);
  });

  it('throws when bundleHash hex is too short (< 64 chars)', async () => {
    await expect(
      requestTimestamp('https://tsa.example.com', 'sha256:abc123'),
    ).rejects.toThrow(/64/);
  });

  it('throws when bundleHash hex is too long (> 64 chars)', async () => {
    await expect(
      requestTimestamp('https://tsa.example.com', 'sha256:' + 'a'.repeat(66)),
    ).rejects.toThrow(/64/);
  });
});

// ---------------------------------------------------------------------------
// requestTimestamp: HTTP error paths
// ---------------------------------------------------------------------------

describe('requestTimestamp -- HTTP error paths', () => {
  it('throws on TSA HTTP 500 response', async () => {
    fetchMock
      .get('https://tsa.example.com')
      .intercept({ path: '/', method: 'POST' })
      .reply(500, 'Internal Server Error');

    await expect(
      requestTimestamp('https://tsa.example.com', BUNDLE_HASH),
    ).rejects.toThrow(/500/);
  });

  it('throws on TSA HTTP 503 response', async () => {
    fetchMock
      .get('https://tsa.example.com')
      .intercept({ path: '/', method: 'POST' })
      .reply(503, 'Service Unavailable');

    await expect(
      requestTimestamp('https://tsa.example.com', BUNDLE_HASH),
    ).rejects.toThrow(/503/);
  });

  it('throws when TSA response exceeds 64 KB', async () => {
    // Build a >64 KB response body (65537 bytes)
    const bigBody = new Uint8Array(65537).fill(0x30);

    fetchMock
      .get('https://tsa.example.com')
      .intercept({ path: '/', method: 'POST' })
      .reply(200, bigBody, { headers: { 'content-type': 'application/timestamp-reply' } });

    await expect(
      requestTimestamp('https://tsa.example.com', BUNDLE_HASH),
    ).rejects.toThrow(/too large/i);
  });
});

// ---------------------------------------------------------------------------
// requestTimestamp: happy path with mocked TSA
// ---------------------------------------------------------------------------

describe('requestTimestamp -- mocked TSA happy path', () => {
  it('returns token, genTime, tsa when TSA responds with valid DER', async () => {
    // Build a TSA response that matches BUNDLE_HASH.
    // The nonce in the real request will not match any nonce we build here,
    // so we must set nonce validation to pass: build TSTInfo with no nonce field
    // (nonce is optional in RFC 3161 -- if absent, the validator skips the check).
    const respDer = buildValidTsaResponse(BUNDLE_HASH);

    fetchMock
      .get('https://tsa.example.com')
      .intercept({ path: '/', method: 'POST' })
      .reply(200, respDer, { headers: { 'content-type': 'application/timestamp-reply' } });

    const result = await requestTimestamp('https://tsa.example.com', BUNDLE_HASH);
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
    expect(result.genTime).toBe('2026-03-16T12:00:00.000Z');
    expect(result.tsa).toBe('https://tsa.example.com');
  });

  it('returned token verifies against the bundle hash', async () => {
    const respDer = buildValidTsaResponse(BUNDLE_HASH);

    fetchMock
      .get('https://tsa.example.com')
      .intercept({ path: '/', method: 'POST' })
      .reply(200, respDer, { headers: { 'content-type': 'application/timestamp-reply' } });

    const { token } = await requestTimestamp('https://tsa.example.com', BUNDLE_HASH);
    const verification = verifyTimestamp(token, BUNDLE_HASH);
    expect(verification.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DER encoding: TimeStampReq structure validation
// ---------------------------------------------------------------------------

describe('requestTimestamp -- DER request encoding', () => {
  it('sends a POST request to the TSA URL', async () => {
    const respDer = buildValidTsaResponse(BUNDLE_HASH);

    // intercept() with method: 'POST' ensures only POST requests match
    fetchMock
      .get('https://tsa.example.com')
      .intercept({ path: '/', method: 'POST' })
      .reply(200, respDer, { headers: { 'content-type': 'application/timestamp-reply' } });

    // If the mock is satisfied (POST matched), this resolves without error
    const result = await requestTimestamp('https://tsa.example.com', BUNDLE_HASH);
    expect(typeof result.token).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// verifyTimestamp: GeneralizedTime fractional seconds
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- GeneralizedTime parsing', () => {
  it('parses fractional seconds correctly', () => {
    const hashBytes = new Uint8Array(32).fill(0x11);
    const bundleHash = 'sha256:' + [...hashBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    // GeneralizedTime with .5 fractional seconds
    const token = buildTimeStampToken(buildTSTInfo(hashBytes, '20260316120000.5Z'));
    const tokenBase64 = btoa(String.fromCharCode(...token));

    const result = verifyTimestamp(tokenBase64, bundleHash);
    expect(result.valid).toBe(true);
    // .5 seconds = 500 ms
    expect(result.genTime).toBe('2026-03-16T12:00:00.500Z');
  });
});
