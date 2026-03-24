// tva
// Tests for PDF certificate generation and the GET /v1/captures/{id}/certificate endpoint.
//
// Test strategy:
//   - Byte string matching: pdf-lib compresses content streams with FlateDecode (zlib).
//     pdfText() decompresses each stream using fflate's unzlibSync and decodes the
//     resulting PDF content operators. Text in content streams appears as uppercase hex
//     strings, e.g. <4665646572616C> for "Federal". pdfHexContains() converts a plain
//     string to its uppercase hex representation and checks for it in the decompressed
//     stream content.
//   - Signature verification: verifySignature() from src/signing.js verifies the
//     Ed25519 signature returned in the X-Signature-Ed25519 header.
//   - Determinism: same inputs produce byte-identical output; guaranteed by
//     PDFDocument.create({ updateMetadata: false }) and fixed creation dates.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { unzlibSync } from 'fflate';
import { createCapture, completeCapture, failCapture } from '../src/db.js';
import { generateCertificate } from '../src/certificate.js';
import { getSigningKeys, verifySignature } from '../src/signing.js';
import {
  cleanDb,
  seedApiKey,
  seedCapture,
  TEST_TENANT_KEY,
  TEST_TENANT_KEY_B,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixture IDs
// ---------------------------------------------------------------------------

const TENANT_A_ID = 'tenant-cert-a';
const TENANT_B_ID = 'tenant-cert-b';

const CAP_COMPLETE = 'cap_' + 'c'.repeat(32);
const CAP_PENDING  = 'cap_' + '0'.repeat(31) + '1';
const CAP_FAILED   = 'cap_' + 'f'.repeat(32);
const CAP_NO_WACZ  = 'cap_' + '0'.repeat(31) + '2';
const CAP_QUAR     = 'cap_' + '0'.repeat(31) + '3';
const CAP_B        = 'cap_' + 'b'.repeat(32);

const BUNDLE_HASH = 'sha256:' + 'a'.repeat(64);
const KEY_ID      = 'abcd1234';

const WACZ_WITH_TS = {
  key: `captures/${CAP_COMPLETE}/bundle.wacz`,
  bundleHash: BUNDLE_HASH,
  size: 99000,
  keyId: KEY_ID,
  timestampStatus: 'present',
  qualifiedTimestampStatus: null,
};

const ARTIFACTS = {
  screenshot: `captures/${CAP_COMPLETE}/screenshot.png`,
  html: `captures/${CAP_COMPLETE}/rendered.html`,
  headers: `captures/${CAP_COMPLETE}/headers.json`,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await cleanDb(env.DB);

  await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: TENANT_A_ID, scopes: ['capture', 'read'] });
  await seedApiKey(env.DB, TEST_TENANT_KEY_B, { tenantId: TENANT_B_ID, scopes: ['capture', 'read'] });

  // Complete capture with WACZ (main fixture)
  await createCapture(env.DB, CAP_COMPLETE, 'https://example.com/cert-test', '1.2.3.4', TENANT_A_ID);
  await completeCapture(env.DB, CAP_COMPLETE, ARTIFACTS, WACZ_WITH_TS);

  // Pending capture (no completedAt, status=pending)
  await createCapture(env.DB, CAP_PENDING, 'https://example.com/pending', '1.2.3.4', TENANT_A_ID);

  // Failed capture
  await createCapture(env.DB, CAP_FAILED, 'https://example.com/failed', '1.2.3.4', TENANT_A_ID);
  await failCapture(env.DB, CAP_FAILED, 'browser timeout', false);

  // Complete capture WITHOUT wacz (artifacts only)
  await createCapture(env.DB, CAP_NO_WACZ, 'https://example.com/no-wacz', '1.2.3.4', TENANT_A_ID);
  await completeCapture(env.DB, CAP_NO_WACZ, {
    screenshot: `captures/${CAP_NO_WACZ}/screenshot.png`,
    html: `captures/${CAP_NO_WACZ}/rendered.html`,
  });

  // Quarantined capture: seed as complete first, then update directly
  await seedCapture(env.DB, CAP_QUAR, {
    tenantId: TENANT_A_ID,
    url: 'https://example.com/quarantined',
    status: 'complete',
    completedAt: new Date().toISOString(),
    wacz: WACZ_WITH_TS,
    artifacts: ARTIFACTS,
  });
  await env.DB.prepare(
    "UPDATE captures SET quarantined = 1, quarantine_reason = 'malware', quarantined_at = ? WHERE id = ?",
  ).bind(new Date().toISOString(), CAP_QUAR).run();

  // Tenant B complete capture with WACZ
  await createCapture(env.DB, CAP_B, 'https://example.com/b', '1.2.3.5', TENANT_B_ID);
  await completeCapture(env.DB, CAP_B, {
    screenshot: `captures/${CAP_B}/screenshot.png`,
    html: `captures/${CAP_B}/rendered.html`,
    headers: `captures/${CAP_B}/headers.json`,
  }, {
    key: `captures/${CAP_B}/bundle.wacz`,
    bundleHash: 'sha256:' + 'b'.repeat(64),
    size: 55000,
    keyId: KEY_ID,
    timestampStatus: 'present',
    qualifiedTimestampStatus: null,
  });
});

// ---------------------------------------------------------------------------
// Helper: build a minimal mock capture record for unit tests
// ---------------------------------------------------------------------------

function mockCapture(overrides = {}) {
  const base = {
    captureId: CAP_COMPLETE,
    url: 'https://example.com/cert-test',
    tenantId: TENANT_A_ID,
    status: 'complete',
    createdAt: '2026-01-15T10:00:00.000Z',
    completedAt: '2026-01-15T10:05:00.000Z',
    renderQuality: 'full',
    wacz: {
      key: `captures/${CAP_COMPLETE}/bundle.wacz`,
      bundleHash: BUNDLE_HASH,
      size: 99000,
      keyId: KEY_ID,
      timestampStatus: 'present',
      qualifiedTimestampStatus: null,
    },
  };
  if (overrides.wacz !== undefined) {
    base.wacz = overrides.wacz;
    delete overrides.wacz;
  }
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Helpers: extract and search PDF text content.
//
// pdf-lib saves content streams with FlateDecode (zlib) compression even when
// useObjectStreams: false. Text appears in the decompressed streams as uppercase
// hex strings inside angle brackets, e.g. <46656465...> Tj.
//
// pdfAllText(pdfBytes) -- decompresses all FlateDecode streams and returns the
//   concatenation as a latin1 string. The hex strings like <68747470...> can
//   then be searched via pdfContains().
//
// pdfContains(pdfText, str) -- converts str to its uppercase hex representation
//   and checks whether it appears in the decompressed stream text.
// ---------------------------------------------------------------------------

/**
 * Scan pdfBytes for FlateDecode stream blocks, decompress each with unzlibSync,
 * and return the concatenated decompressed stream text.
 *
 * PDF stream layout: ...>> \n stream \n <zlib-data> \n endstream ...
 * Working directly with the Uint8Array avoids latin1 encode/decode round-trips
 * that can corrupt high bytes in the workers runtime.
 */
function pdfAllText(pdfBytes) {
  // Use TextEncoder to get byte sequences for the markers
  const enc = new TextEncoder();
  const STREAM_MARK  = enc.encode('stream\n');
  const ENDSTREAM_MARK = enc.encode('\nendstream');

  function findBytes(haystack, needle, from) {
    outer: for (let i = from; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) continue outer;
      }
      return i;
    }
    return -1;
  }

  let decompressed = '';
  let pos = 0;
  while (true) {
    const streamPos = findBytes(pdfBytes, STREAM_MARK, pos);
    if (streamPos === -1) break;
    const dataStart = streamPos + STREAM_MARK.length;
    const endPos = findBytes(pdfBytes, ENDSTREAM_MARK, dataStart);
    if (endPos === -1) break;
    try {
      const streamData = pdfBytes.slice(dataStart, endPos);
      const inflated = unzlibSync(streamData);
      decompressed += new TextDecoder('latin1').decode(inflated);
    } catch (_) {
      // Not all streams are FlateDecode; skip on error
    }
    pos = endPos + ENDSTREAM_MARK.length;
  }
  return decompressed;
}

/**
 * Returns true if the decompressed PDF stream content contains `str`.
 * Text in pdf-lib content streams is encoded as uppercase hex strings, so
 * "hello" appears as <68656C6C6F>. This helper converts str to that format
 * and checks for it in the decompressed stream text.
 */
function pdfContains(streamText, str) {
  const hexStr = Array.from(new TextEncoder().encode(str))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return streamText.toUpperCase().includes(hexStr);
}

/** Convenience: generate, decompress, return checker */
async function pdfStreams(capture, signingKeys) {
  const { pdfBytes } = await generateCertificate(capture, signingKeys, 'https://worker.test');
  return pdfAllText(pdfBytes);
}

// ---------------------------------------------------------------------------
// describe('certificate generation -- determinism')
// ---------------------------------------------------------------------------

describe('certificate generation -- determinism', () => {
  it('same inputs produce byte-identical PDF output', async () => {
    const signingKeys = await getSigningKeys(env);
    const capture = mockCapture();

    const { pdfBytes: first  } = await generateCertificate(capture, signingKeys, 'https://worker.test');
    const { pdfBytes: second } = await generateCertificate(capture, signingKeys, 'https://worker.test');

    expect(first.length).toBe(second.length);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('different captureId produces different PDF', async () => {
    const signingKeys = await getSigningKeys(env);
    const capA = mockCapture({ captureId: CAP_COMPLETE });
    const capB = mockCapture({ captureId: 'cap_' + 'e'.repeat(32) });

    const { pdfBytes: bytesA } = await generateCertificate(capA, signingKeys, 'https://worker.test');
    const { pdfBytes: bytesB } = await generateCertificate(capB, signingKeys, 'https://worker.test');

    expect(Buffer.from(bytesA).equals(Buffer.from(bytesB))).toBe(false);
  });

  it('different URL produces different PDF', async () => {
    const signingKeys = await getSigningKeys(env);
    const capA = mockCapture({ url: 'https://example.com/page-a' });
    const capB = mockCapture({ url: 'https://example.com/page-b' });

    const { pdfBytes: bytesA } = await generateCertificate(capA, signingKeys, 'https://worker.test');
    const { pdfBytes: bytesB } = await generateCertificate(capB, signingKeys, 'https://worker.test');

    expect(Buffer.from(bytesA).equals(Buffer.from(bytesB))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe('certificate generation -- content verification')
// ---------------------------------------------------------------------------

describe('certificate generation -- content verification', () => {
  let signingKeys;
  let capture;
  let streams;

  beforeEach(async () => {
    signingKeys = await getSigningKeys(env);
    capture = mockCapture();
    streams = await pdfStreams(capture, signingKeys);
  });

  it('PDF starts with %PDF- header', async () => {
    const { pdfBytes } = await generateCertificate(capture, signingKeys, 'https://worker.test');
    const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('PDF contains captured URL', () => {
    expect(pdfContains(streams, 'https://example.com/cert-test')).toBe(true);
  });

  it('PDF contains capture ID', () => {
    expect(pdfContains(streams, CAP_COMPLETE)).toBe(true);
  });

  it('PDF contains bundle hash (full sha256:... string)', () => {
    // The bundle hash is long; verify the sha256: prefix and the first segment
    expect(pdfContains(streams, 'sha256:')).toBe(true);
    expect(pdfContains(streams, BUNDLE_HASH.slice(0, 20))).toBe(true);
  });

  it('PDF contains "Federal Rule of Evidence 902(13)"', () => {
    expect(pdfContains(streams, 'Federal Rule of Evidence 902(13)')).toBe(true);
  });

  it('PDF contains operator name (Gerhard Benjamin Peter)', () => {
    expect(pdfContains(streams, 'Gerhard Benjamin Peter')).toBe(true);
  });

  it('PDF contains key fingerprint (keyId)', () => {
    expect(pdfContains(streams, KEY_ID)).toBe(true);
  });

  it('PDF contains verification URL', () => {
    expect(pdfContains(streams, `https://worker.test/v1/verify/${CAP_COMPLETE}`)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describe('certificate generation -- timestamp variations')
// ---------------------------------------------------------------------------

describe('certificate generation -- timestamp variations', () => {
  let signingKeys;

  beforeEach(async () => {
    signingKeys = await getSigningKeys(env);
  });

  it('RFC 3161 timestamp present: PDF includes TSA details', async () => {
    const capture = mockCapture({ wacz: { ...WACZ_WITH_TS, timestampStatus: 'present' } });
    const streams = await pdfStreams(capture, signingKeys);
    expect(pdfContains(streams, 'RFC 3161')).toBe(true);
    expect(pdfContains(streams, 'trusted timestamp authority')).toBe(true);
  });

  it('RFC 3161 timestamp error: PDF includes "could not be obtained" text', async () => {
    const capture = mockCapture({ wacz: { ...WACZ_WITH_TS, timestampStatus: 'error' } });
    const streams = await pdfStreams(capture, signingKeys);
    expect(pdfContains(streams, 'could not be obtained')).toBe(true);
  });

  it('RFC 3161 timestamp skipped: PDF includes "No independent timestamp" text', async () => {
    const capture = mockCapture({ wacz: { ...WACZ_WITH_TS, timestampStatus: 'skipped' } });
    const streams = await pdfStreams(capture, signingKeys);
    expect(pdfContains(streams, 'No independent timestamp')).toBe(true);
  });

  it('eIDAS qualified present: PDF includes eIDAS reference', async () => {
    const capture = mockCapture({
      wacz: { ...WACZ_WITH_TS, qualifiedTimestampStatus: 'present' },
    });
    const streams = await pdfStreams(capture, signingKeys);
    expect(pdfContains(streams, 'eIDAS')).toBe(true);
  });

  it('no qualified timestamp: PDF does not contain eIDAS section text', async () => {
    const capture = mockCapture({
      wacz: { ...WACZ_WITH_TS, qualifiedTimestampStatus: null },
    });
    const streams = await pdfStreams(capture, signingKeys);
    // The section header "3.5 Qualified Timestamp (eIDAS)" should not appear
    expect(pdfContains(streams, '3.5 Qualified Timestamp')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe('certificate generation -- signature')
// ---------------------------------------------------------------------------

describe('certificate generation -- signature', () => {
  it('certificate bytes are signed with Ed25519 key', async () => {
    const signingKeys = await getSigningKeys(env);
    const capture = mockCapture();
    const { pdfBytes, signature } = await generateCertificate(capture, signingKeys, 'https://worker.test');

    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
    // Base64-decode to verify it is a 64-byte Ed25519 signature
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    expect(sigBytes.length).toBe(64);
  });

  it('signature verifies against PDF bytes', async () => {
    const signingKeys = await getSigningKeys(env);
    const capture = mockCapture();
    const { pdfBytes, signature } = await generateCertificate(capture, signingKeys, 'https://worker.test');

    const valid = await verifySignature(signingKeys.publicKeyBytes, pdfBytes, signature);
    expect(valid).toBe(true);
  });

  it('tampered PDF bytes fail verification', async () => {
    const signingKeys = await getSigningKeys(env);
    const capture = mockCapture();
    const { pdfBytes, signature } = await generateCertificate(capture, signingKeys, 'https://worker.test');

    // Flip a byte near the middle of the PDF
    const tampered = new Uint8Array(pdfBytes);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;

    const valid = await verifySignature(signingKeys.publicKeyBytes, tampered, signature);
    expect(valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// describe('GET /v1/captures/{id}/certificate -- happy path')
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/certificate -- happy path', () => {
  it('returns 200 for complete capture with WACZ', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    expect(res.status).toBe(200);
  });

  it('Content-Type is application/pdf', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('Content-Disposition is attachment with correct filename', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    const cd = res.headers.get('Content-Disposition');
    expect(cd).toContain('attachment');
    expect(cd).toContain(`certificate-${CAP_COMPLETE}.pdf`);
  });

  it('response body starts with %PDF-', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    const buf = await res.arrayBuffer();
    const header = new TextDecoder().decode(new Uint8Array(buf).slice(0, 5));
    expect(header).toBe('%PDF-');
  });

  it('X-Signature-Ed25519 header is present', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    expect(res.headers.get('X-Signature-Ed25519')).toBeTruthy();
  });

  it('X-Signature-Key-Id header matches keyId from signing keys', async () => {
    const signingKeys = await getSigningKeys(env);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    expect(res.headers.get('X-Signature-Key-Id')).toBe(signingKeys.keyId);
  });

  it('Access-Control-Expose-Headers includes signature headers', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    const exposed = res.headers.get('Access-Control-Expose-Headers') ?? '';
    expect(exposed).toContain('X-Signature-Ed25519');
    expect(exposed).toContain('X-Signature-Key-Id');
  });

  it('signature in header verifies against response body bytes', async () => {
    const signingKeys = await getSigningKeys(env);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    const signature = res.headers.get('X-Signature-Ed25519');
    const buf = await res.arrayBuffer();
    const pdfBytes = new Uint8Array(buf);

    const valid = await verifySignature(signingKeys.publicKeyBytes, pdfBytes, signature);
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// describe('GET /v1/captures/{id}/certificate -- error cases')
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/certificate -- error cases', () => {
  it('pending capture returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_PENDING}/certificate`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('failed capture returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_FAILED}/certificate`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('quarantined capture returns 451 with quarantineReason', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_QUAR}/certificate`);
    expect(res.status).toBe(451);
    const body = await res.json();
    expect(body).toHaveProperty('quarantineReason');
    expect(body.quarantineReason).toBe('malware');
  });

  it('complete capture without WACZ returns 404', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_NO_WACZ}/certificate`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('non-existent capture returns 404', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}/certificate`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('detail');
  });

  it('cross-tenant 404 is identical to non-existent capture 404 (no enumeration)', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);

    // Tenant B tries to access tenant A's capture
    const crossTenantRes = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    // Tenant A asks for a capture that doesn't exist
    const notFoundRes = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}/certificate`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });

    expect(crossTenantRes.status).toBe(404);
    expect(notFoundRes.status).toBe(404);

    const crossBody = await crossTenantRes.json();
    const notFoundBody = await notFoundRes.json();
    expect(crossBody.detail).toBe(notFoundBody.detail);
  });
});

// ---------------------------------------------------------------------------
// describe('GET /v1/captures/{id}/certificate -- tenant isolation')
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/certificate -- tenant isolation', () => {
  it('unauthenticated access returns 200 (public endpoint)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    expect(res.status).toBe(200);
  });

  it('authenticated owner returns 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY}` },
    });
    expect(res.status).toBe(200);
  });

  it('authenticated cross-tenant returns 404', async () => {
    // Tenant B tries to access tenant A's capture
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`, {
      headers: { Authorization: `Bearer ${TEST_TENANT_KEY_B}` },
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// describe('GET /v1/captures/{id}/certificate -- caching')
// ---------------------------------------------------------------------------

describe('GET /v1/captures/{id}/certificate -- caching', () => {
  it('Cache-Control is public, max-age=31536000, immutable for 200', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}/certificate`);
    expect(res.status).toBe(200);
    const cc = res.headers.get('Cache-Control');
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=31536000');
    expect(cc).toContain('immutable');
  });

  it('Cache-Control is no-store for 404 errors', async () => {
    const unknownId = 'cap_' + '9'.repeat(32);
    const res = await SELF.fetch(`https://worker.test/v1/captures/${unknownId}/certificate`);
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('Cache-Control is no-store for 451 quarantine response', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_QUAR}/certificate`);
    expect(res.status).toBe(451);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

// ---------------------------------------------------------------------------
// describe('certificateUrl in GET /v1/captures/{id}')
// ---------------------------------------------------------------------------

describe('certificateUrl in GET /v1/captures/{id}', () => {
  it('certificateUrl present when WACZ exists', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_COMPLETE}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificateUrl).toBeDefined();
    expect(body.certificateUrl).toContain(CAP_COMPLETE);
    expect(body.certificateUrl).toContain('/certificate');
  });

  it('certificateUrl absent when no WACZ (complete capture without wacz)', async () => {
    const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_NO_WACZ}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.certificateUrl).toBeUndefined();
  });
});
