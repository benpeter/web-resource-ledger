/**
 * rfc3161.test.js -- Timestamp messageImprint verification tests
 *
 * Tests verifyTimestamp(), parseTSTInfo(), and parseGeneralizedTime()
 * from lib/rfc3161.js using synthetic DER tokens built in-process.
 *
 * Does NOT test requestTimestamp() -- that makes network calls and
 * belongs in an integration test environment, not unit tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTimestamp, parseTSTInfo, parseGeneralizedTime, extractTSTInfo } from '../lib/rfc3161.js';

// ---------------------------------------------------------------------------
// DER construction helpers
// (mirrors helpers in test/rfc3161.test.js of the Worker, ported to Node.js)
// ---------------------------------------------------------------------------

function writeLength(n) {
  if (n < 0x80) return new Uint8Array([n]);
  if (n <= 0xff) return new Uint8Array([0x81, n]);
  if (n <= 0xffff) return new Uint8Array([0x82, n >> 8, n & 0xff]);
  throw new Error('length too large');
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

// OID 2.16.840.1.101.3.4.2.1 -- SHA-256
const OID_SHA256 = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
// OID 1.2.3.4 -- synthetic TSA policy
const OID_POLICY = new Uint8Array([0x2a, 0x03, 0x04]);

const enc = new TextEncoder();

function buildTSTInfo(hashBytes, genTimeStr = '20260316120000Z') {
  const version    = writeTLV(0x02, new Uint8Array([0x01]));
  const policy     = writeTLV(0x06, OID_POLICY);
  const algId      = writeTLV(0x30, concat(writeTLV(0x06, OID_SHA256), writeTLV(0x05, new Uint8Array(0))));
  const msgImprint = writeTLV(0x30, concat(algId, writeTLV(0x04, hashBytes)));
  const serial     = writeTLV(0x02, new Uint8Array([0x01]));
  const genTime    = writeTLV(0x18, enc.encode(genTimeStr));
  return writeTLV(0x30, concat(version, policy, msgImprint, serial, genTime));
}

function buildTimeStampToken(tstInfoDer) {
  // OID 1.2.840.113549.1.7.2 (id-signedData)
  const oidSD      = writeTLV(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]));
  // OID 1.2.840.113549.1.9.16.1.4 (id-ct-TSTInfo)
  const oidTSTI    = writeTLV(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04]));
  const eContent   = writeTLV(0xa0, writeTLV(0x04, tstInfoDer));
  const encapInfo  = writeTLV(0x30, concat(oidTSTI, eContent));
  const sdVersion  = writeTLV(0x02, new Uint8Array([0x03]));
  const digestAlgs = writeTLV(0x31, new Uint8Array(0));
  const signedData = writeTLV(0x30, concat(sdVersion, digestAlgs, encapInfo));
  const ctx0       = writeTLV(0xa0, signedData);
  return writeTLV(0x30, concat(oidSD, ctx0));
}

/** Decode hex to Uint8Array */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// A deterministic bundle hash used across multiple tests
const BUNDLE_HASH = 'sha256:' + 'ab'.repeat(32);

// ---------------------------------------------------------------------------
// verifyTimestamp -- valid token round-trip
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- valid token round-trip', () => {
  it('token built from bundleHash verifies successfully', () => {
    const hashBytes = hexToBytes(BUNDLE_HASH.slice(7));
    const token = buildTimeStampToken(buildTSTInfo(hashBytes));
    const tokenBase64 = Buffer.from(token).toString('base64');

    const result = verifyTimestamp(tokenBase64, BUNDLE_HASH);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.genTime, '2026-03-16T12:00:00.000Z');
  });

  it('genTime is returned as ISO 8601 string', () => {
    const hashBytes = new Uint8Array(32).fill(0xcd);
    const bundleHash = 'sha256:' + [...hashBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const token = buildTimeStampToken(buildTSTInfo(hashBytes, '20260101093045Z'));
    const tokenBase64 = Buffer.from(token).toString('base64');

    const result = verifyTimestamp(tokenBase64, bundleHash);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.genTime, '2026-01-01T09:30:45.000Z');
  });

  it('parses fractional seconds correctly', () => {
    const hashBytes = new Uint8Array(32).fill(0x11);
    const bundleHash = 'sha256:' + [...hashBytes].map(b => b.toString(16).padStart(2, '0')).join('');
    const token = buildTimeStampToken(buildTSTInfo(hashBytes, '20260316120000.5Z'));
    const tokenBase64 = Buffer.from(token).toString('base64');

    const result = verifyTimestamp(tokenBase64, bundleHash);
    assert.strictEqual(result.valid, true);
    // .5 seconds = 500 ms
    assert.strictEqual(result.genTime, '2026-03-16T12:00:00.500Z');
  });
});

// ---------------------------------------------------------------------------
// verifyTimestamp -- hash mismatch
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- hash mismatch', () => {
  it('returns valid: false when expectedBundleHash does not match token imprint', () => {
    const hashBytes = new Uint8Array(32).fill(0xab);
    const token = buildTimeStampToken(buildTSTInfo(hashBytes));
    const tokenBase64 = Buffer.from(token).toString('base64');

    const wrongHash = 'sha256:' + 'ff'.repeat(32);
    const result = verifyTimestamp(tokenBase64, wrongHash);
    assert.strictEqual(result.valid, false);
  });

  it('returns valid: false when imprint is all zeros', () => {
    const hashBytes = new Uint8Array(32).fill(0x00);
    const token = buildTimeStampToken(buildTSTInfo(hashBytes));
    const tokenBase64 = Buffer.from(token).toString('base64');

    // BUNDLE_HASH is 0xab repeated, definitely not all zeros
    const result = verifyTimestamp(tokenBase64, BUNDLE_HASH);
    assert.strictEqual(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// verifyTimestamp -- malformed input
// ---------------------------------------------------------------------------

describe('verifyTimestamp -- malformed input', () => {
  it('returns valid: false for malformed base64', () => {
    const result = verifyTimestamp('!!!not-base64!!!', BUNDLE_HASH);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason, 'reason should be present');
  });

  it('returns valid: false for empty string', () => {
    const result = verifyTimestamp('', BUNDLE_HASH);
    assert.strictEqual(result.valid, false);
  });

  it('returns valid: false for valid base64 that is not DER', () => {
    const garble = Buffer.from('this is not DER at all, just ascii noise 12345').toString('base64');
    const result = verifyTimestamp(garble, BUNDLE_HASH);
    assert.strictEqual(result.valid, false);
    assert.ok(result.reason);
  });

  it('returns valid: false when expectedBundleHash lacks sha256: prefix', () => {
    const hashBytes = new Uint8Array(32).fill(0xab);
    const token = buildTimeStampToken(buildTSTInfo(hashBytes));
    const tokenBase64 = Buffer.from(token).toString('base64');

    const result = verifyTimestamp(tokenBase64, 'ab'.repeat(32));
    assert.strictEqual(result.valid, false);
    assert.match(result.reason, /sha256:/);
  });

  it('returns valid: false for truncated DER (first 10 bytes only)', () => {
    const hashBytes = new Uint8Array(32).fill(0xab);
    const full = buildTimeStampToken(buildTSTInfo(hashBytes));
    const truncated = Buffer.from(full.slice(0, 10)).toString('base64');

    const result = verifyTimestamp(truncated, BUNDLE_HASH);
    assert.strictEqual(result.valid, false);
  });

  it('returns valid: false for DER with wrong outer tag', () => {
    // Start with 0x31 (SET) instead of 0x30 (SEQUENCE) for ContentInfo
    const badTag = new Uint8Array([0x31, 0x03, 0x02, 0x01, 0x01]);
    const tokenBase64 = Buffer.from(badTag).toString('base64');

    const result = verifyTimestamp(tokenBase64, BUNDLE_HASH);
    assert.strictEqual(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// parseGeneralizedTime -- edge cases
// ---------------------------------------------------------------------------

describe('parseGeneralizedTime -- edge cases', () => {
  it('basic UTC time without fractional seconds', () => {
    const result = parseGeneralizedTime('20260316120000Z');
    assert.strictEqual(result, '2026-03-16T12:00:00.000Z');
  });

  it('fractional seconds with single digit', () => {
    const result = parseGeneralizedTime('20260316120000.5Z');
    assert.strictEqual(result, '2026-03-16T12:00:00.500Z');
  });

  it('fractional seconds with two digits', () => {
    const result = parseGeneralizedTime('20260316120000.75Z');
    // 0.75 * 1000 = 750 ms
    assert.strictEqual(result, '2026-03-16T12:00:00.750Z');
  });

  it('throws when trailing Z is missing', () => {
    assert.throws(
      () => parseGeneralizedTime('20260316120000'),
      /UTC/
    );
  });
});

// ---------------------------------------------------------------------------
// parseTSTInfo -- direct parsing
// ---------------------------------------------------------------------------

describe('parseTSTInfo -- direct parsing', () => {
  it('extracts messageImprintHex and genTime correctly', () => {
    const hashBytes = new Uint8Array(32).fill(0x42);
    const tstInfoDer = buildTSTInfo(hashBytes, '20260316120000Z');

    const { messageImprintHex, genTime } = parseTSTInfo(tstInfoDer);
    const expectedHex = '42'.repeat(32);
    assert.strictEqual(messageImprintHex, expectedHex);
    assert.strictEqual(genTime, '2026-03-16T12:00:00.000Z');
  });

  it('throws on non-SEQUENCE TSTInfo', () => {
    // Feed an INTEGER instead of SEQUENCE
    const bad = new Uint8Array([0x02, 0x01, 0x01]);
    assert.throws(() => parseTSTInfo(bad), /SEQUENCE/);
  });
});

// ---------------------------------------------------------------------------
// extractTSTInfo -- full CMS navigation
// ---------------------------------------------------------------------------

describe('extractTSTInfo -- CMS navigation', () => {
  it('navigates ContentInfo > SignedData > EncapContentInfo > TSTInfo', () => {
    const hashBytes = new Uint8Array(32).fill(0x55);
    const tstInfoDer = buildTSTInfo(hashBytes, '20260316120000Z');
    const token = buildTimeStampToken(tstInfoDer);

    const { messageImprintHex, genTime } = extractTSTInfo(token, 0);
    assert.strictEqual(messageImprintHex, '55'.repeat(32));
    assert.strictEqual(genTime, '2026-03-16T12:00:00.000Z');
  });

  it('throws when ContentInfo outer tag is wrong', () => {
    // Start with 0x31 (SET) tag instead of 0x30 (SEQUENCE)
    const bad = new Uint8Array([0x31, 0x03, 0x02, 0x01, 0x00]);
    assert.throws(() => extractTSTInfo(bad, 0), /SEQUENCE/);
  });
});
