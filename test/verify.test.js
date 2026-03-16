// tva
import { describe, it, expect, beforeAll } from 'vitest';
import { zipSync, unzipSync } from 'fflate';
import { verifyWacz } from '../src/verify.js';
import { canonicalize } from '../src/canonical-json.js';
import { sha256 } from '../src/warc.js';
import { signBytes } from '../src/signing.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal valid WACZ in-memory
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

async function buildTestWacz(privateKey, publicKeyBytes) {
  // Minimal file content for each artifact
  const warcBytes = enc.encode('WARC/1.1\r\ntest warc content');
  const cdxjBytes = enc.encode('test cdxj content');
  const pagesBytes = enc.encode('{"format":"json-pages-1.0"}\n');

  // Compute hashes of each artifact
  const warcHash = await sha256(warcBytes);
  const cdxjHash = await sha256(cdxjBytes);
  const pagesHash = await sha256(pagesBytes);

  // datapackage.json object
  const datapackage = {
    profile: 'data-package',
    wacz_version: '1.1.1',
    resources: [
      { name: 'data.warc',    path: 'archive/data.warc',    hash: warcHash,  bytes: warcBytes.byteLength },
      { name: 'index.cdxj',  path: 'indexes/index.cdxj',   hash: cdxjHash,  bytes: cdxjBytes.byteLength },
      { name: 'pages.jsonl', path: 'pages/pages.jsonl',     hash: pagesHash, bytes: pagesBytes.byteLength },
    ],
  };

  const dpBytes = enc.encode(JSON.stringify(datapackage, null, 2));

  // bundleHash = sha256 of CANONICAL JSON (sorted keys, no whitespace)
  // This is what signedData.hash must be -- NOT sha256 of the pretty-printed bytes
  const bundleHash = await sha256(enc.encode(canonicalize(datapackage)));

  // Sign the bundleHash string bytes
  const signature = await signBytes(privateKey, enc.encode(bundleHash));

  // Public key as base64
  const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));

  // datapackage-digest.json
  // digest.hash is sha256 of the pretty-printed bytes (for reference), but
  // signedData.hash is the canonical bundleHash -- that is what is verified
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

  // ZIP everything in STORE mode (level: 0)
  const waczBytes = zipSync({
    'datapackage.json':         [dpBytes,    { level: 0 }],
    'datapackage-digest.json':  [digestBytes, { level: 0 }],
    'archive/data.warc':        [warcBytes,  { level: 0 }],
    'indexes/index.cdxj':       [cdxjBytes,  { level: 0 }],
    'pages/pages.jsonl':        [pagesBytes, { level: 0 }],
  });

  return { waczBytes, datapackage, dpBytes, digestDoc, digestBytes, warcBytes, cdxjBytes, pagesBytes };
}

// ---------------------------------------------------------------------------
// Key generation -- shared across all test groups
// ---------------------------------------------------------------------------

let privateKeyA, publicKeyBytesA;
let privateKeyB, publicKeyBytesB;

beforeAll(async () => {
  const kpA = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  privateKeyA = kpA.privateKey;
  const rawA = await crypto.subtle.exportKey('raw', kpA.publicKey);
  publicKeyBytesA = new Uint8Array(rawA);

  const kpB = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  privateKeyB = kpB.privateKey;
  const rawB = await crypto.subtle.exportKey('raw', kpB.publicKey);
  publicKeyBytesB = new Uint8Array(rawB);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('verifyWacz -- happy path', () => {
  it('valid WACZ with correct key returns verified: true', async () => {
    const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.verified).toBe(true);
    for (const check of result.checks) {
      expect(check.status).toBe('pass');
    }
  });

  it('result contains all three checks', async () => {
    const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.checks).toHaveLength(3);
    const names = result.checks.map(c => c.name);
    expect(names).toContain('artifactHashes');
    expect(names).toContain('bundleHash');
    expect(names).toContain('signature');
  });

  it('result includes capture metadata', async () => {
    const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.capture).toBeDefined();
    expect(result.capture.bundleHash).toMatch(/^sha256:[0-9a-f]+$/);
    expect(typeof result.capture.signature).toBe('string');
    expect(typeof result.capture.publicKey).toBe('string');
    expect(typeof result.capture.signedAt).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Tamper detection
// ---------------------------------------------------------------------------

describe('verifyWacz -- tamper detection', () => {
  it('corrupted artifact fails artifactHashes check but passes bundleHash and signature', async () => {
    const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);

    // Unzip, corrupt one inner file, re-zip
    const files = unzipSync(waczBytes);
    const original = files['archive/data.warc'];
    const corrupted = new Uint8Array(original.length + 1);
    corrupted.set(original);
    corrupted[original.length] = 0xff; // append a byte

    const repackaged = zipSync({
      'datapackage.json':         [files['datapackage.json'],        { level: 0 }],
      'datapackage-digest.json':  [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':        [corrupted,                        { level: 0 }],
      'indexes/index.cdxj':       [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':        [files['pages/pages.jsonl'],       { level: 0 }],
    });

    const result = await verifyWacz(repackaged, publicKeyBytesA);

    expect(result.verified).toBe(false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('fail');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('pass');
  });

  it('modified datapackage.json fails bundleHash check', async () => {
    const { waczBytes, datapackage, digestBytes, warcBytes, cdxjBytes, pagesBytes } =
      await buildTestWacz(privateKeyA, publicKeyBytesA);

    // Modify the datapackage -- add an extra field -- while keeping the original digest
    const tamperedDp = { ...datapackage, tampered: true };
    const tamperedDpBytes = enc.encode(JSON.stringify(tamperedDp, null, 2));

    const files = unzipSync(waczBytes);
    const repackaged = zipSync({
      'datapackage.json':         [tamperedDpBytes,                  { level: 0 }],
      'datapackage-digest.json':  [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':        [files['archive/data.warc'],       { level: 0 }],
      'indexes/index.cdxj':       [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':        [files['pages/pages.jsonl'],       { level: 0 }],
    });

    const result = await verifyWacz(repackaged, publicKeyBytesA);

    expect(result.verified).toBe(false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.bundleHash.status).toBe('fail');
  });

  it('wrong public key fails signature check', async () => {
    // Build WACZ signed with key A, verify with key B
    const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
    const result = await verifyWacz(waczBytes, publicKeyBytesB);

    expect(result.verified).toBe(false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('pass');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('fail');
  });

  it('key substitution attack detected -- embedded key replaced, server key unchanged', async () => {
    // Build WACZ signed with key A
    const { waczBytes, datapackage } = await buildTestWacz(privateKeyA, publicKeyBytesA);

    // Attacker re-signs with key B and embeds key B in the digest
    const bundleHash = await sha256(enc.encode(canonicalize(datapackage)));
    const newSignature = await signBytes(privateKeyB, enc.encode(bundleHash));
    const newPublicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytesB));

    const files = unzipSync(waczBytes);
    const originalDigest = JSON.parse(new TextDecoder().decode(files['datapackage-digest.json']));
    const attackerDigest = {
      ...originalDigest,
      signedData: {
        ...originalDigest.signedData,
        signature: newSignature,
        publicKey: newPublicKeyBase64,
      },
    };
    const attackerDigestBytes = enc.encode(JSON.stringify(attackerDigest, null, 2));

    const repackaged = zipSync({
      'datapackage.json':         [files['datapackage.json'],  { level: 0 }],
      'datapackage-digest.json':  [attackerDigestBytes,        { level: 0 }],
      'archive/data.warc':        [files['archive/data.warc'], { level: 0 }],
      'indexes/index.cdxj':       [files['indexes/index.cdxj'], { level: 0 }],
      'pages/pages.jsonl':        [files['pages/pages.jsonl'], { level: 0 }],
    });

    // Verify with the ORIGINAL server key A -- signature must fail
    const result = await verifyWacz(repackaged, publicKeyBytesA);

    expect(result.verified).toBe(false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.signature.status).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('verifyWacz -- error handling', () => {
  it('garbage bytes (not a ZIP) returns all checks failed', async () => {
    const garbage = new Uint8Array(256).map((_, i) => i % 256);
    const result = await verifyWacz(garbage, publicKeyBytesA);

    expect(result.verified).toBe(false);
    expect(result.checks).toHaveLength(3);
    for (const check of result.checks) {
      expect(check.status).toBe('fail');
    }
  });

  it('ZIP missing datapackage.json returns all checks failed', async () => {
    const { warcBytes, cdxjBytes, pagesBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);

    const noManifest = zipSync({
      'archive/data.warc':   [warcBytes,  { level: 0 }],
      'indexes/index.cdxj':  [cdxjBytes,  { level: 0 }],
      'pages/pages.jsonl':   [pagesBytes, { level: 0 }],
    });

    const result = await verifyWacz(noManifest, publicKeyBytesA);

    expect(result.verified).toBe(false);
    for (const check of result.checks) {
      expect(check.status).toBe('fail');
    }
  });

  it('ZIP missing datapackage-digest.json returns checks failed', async () => {
    const { dpBytes, warcBytes, cdxjBytes, pagesBytes } =
      await buildTestWacz(privateKeyA, publicKeyBytesA);

    const noDigest = zipSync({
      'datapackage.json':   [dpBytes,    { level: 0 }],
      'archive/data.warc':  [warcBytes,  { level: 0 }],
      'indexes/index.cdxj': [cdxjBytes,  { level: 0 }],
      'pages/pages.jsonl':  [pagesBytes, { level: 0 }],
    });

    const result = await verifyWacz(noDigest, publicKeyBytesA);

    expect(result.verified).toBe(false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    // bundleHash and signature must fail; artifactHashes may be skip or fail per implementation
    expect(byName.bundleHash.status).toBe('fail');
    expect(byName.signature.status).toBe('fail');
  });
});

// ---------------------------------------------------------------------------
// Security invariants
// ---------------------------------------------------------------------------

describe('verifyWacz -- security', () => {
  it('detail messages never contain hash values or expected/actual wording', async () => {
    const hashPattern = /sha256:[0-9a-f]+/;
    const leakPatterns = [/\bexpected\b/i, /\bactual\b/i];

    // Collect results from all failure scenarios
    const scenarios = await Promise.all([
      // Garbage input
      (async () => {
        const garbage = new Uint8Array(64);
        return verifyWacz(garbage, publicKeyBytesA);
      })(),

      // Corrupted artifact
      (async () => {
        const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
        const files = unzipSync(waczBytes);
        const original = files['archive/data.warc'];
        const corrupted = new Uint8Array(original.length + 1);
        corrupted.set(original);
        corrupted[original.length] = 0xaa;
        const repackaged = zipSync({
          'datapackage.json':        [files['datapackage.json'],        { level: 0 }],
          'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
          'archive/data.warc':       [corrupted,                        { level: 0 }],
          'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
          'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
        });
        return verifyWacz(repackaged, publicKeyBytesA);
      })(),

      // Modified datapackage
      (async () => {
        const { waczBytes, datapackage } = await buildTestWacz(privateKeyA, publicKeyBytesA);
        const files = unzipSync(waczBytes);
        const tampered = enc.encode(JSON.stringify({ ...datapackage, tampered: true }, null, 2));
        const repackaged = zipSync({
          'datapackage.json':        [tampered,                         { level: 0 }],
          'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
          'archive/data.warc':       [files['archive/data.warc'],       { level: 0 }],
          'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
          'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
        });
        return verifyWacz(repackaged, publicKeyBytesA);
      })(),

      // Wrong key
      (async () => {
        const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
        return verifyWacz(waczBytes, publicKeyBytesB);
      })(),

      // Missing datapackage.json
      (async () => {
        const { warcBytes, cdxjBytes, pagesBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
        const zip = zipSync({
          'archive/data.warc':  [warcBytes,  { level: 0 }],
          'indexes/index.cdxj': [cdxjBytes,  { level: 0 }],
          'pages/pages.jsonl':  [pagesBytes, { level: 0 }],
        });
        return verifyWacz(zip, publicKeyBytesA);
      })(),

      // Missing datapackage-digest.json
      (async () => {
        const { dpBytes, warcBytes, cdxjBytes, pagesBytes } =
          await buildTestWacz(privateKeyA, publicKeyBytesA);
        const zip = zipSync({
          'datapackage.json':   [dpBytes,    { level: 0 }],
          'archive/data.warc':  [warcBytes,  { level: 0 }],
          'indexes/index.cdxj': [cdxjBytes,  { level: 0 }],
          'pages/pages.jsonl':  [pagesBytes, { level: 0 }],
        });
        return verifyWacz(zip, publicKeyBytesA);
      })(),
    ]);

    for (const result of scenarios) {
      for (const check of result.checks) {
        if (check.detail) {
          expect(check.detail).not.toMatch(hashPattern);
          for (const leakPat of leakPatterns) {
            expect(check.detail).not.toMatch(leakPat);
          }
        }
      }
    }
  });

  it('all checks run even when earlier check fails', async () => {
    // Corrupted artifact should still produce bundleHash and signature checks
    const { waczBytes } = await buildTestWacz(privateKeyA, publicKeyBytesA);
    const files = unzipSync(waczBytes);
    const original = files['archive/data.warc'];
    const corrupted = new Uint8Array(original.length + 1);
    corrupted.set(original);
    corrupted[original.length] = 0xbb;

    const repackaged = zipSync({
      'datapackage.json':        [files['datapackage.json'],        { level: 0 }],
      'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':       [corrupted,                        { level: 0 }],
      'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
    });

    const result = await verifyWacz(repackaged, publicKeyBytesA);

    // All three checks must be present even though artifactHashes failed
    expect(result.checks).toHaveLength(3);
    const names = result.checks.map(c => c.name);
    expect(names).toContain('artifactHashes');
    expect(names).toContain('bundleHash');
    expect(names).toContain('signature');

    // artifactHashes must have failed; other checks must have a definite status
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('fail');
    expect(['pass', 'fail', 'skip']).toContain(byName.bundleHash.status);
    expect(['pass', 'fail', 'skip']).toContain(byName.signature.status);
  });
});

// ---------------------------------------------------------------------------
// v0.2.0 format helpers
// ---------------------------------------------------------------------------

// Minimal DER helpers for building synthetic RFC 3161 timestamp tokens.
// These mirror the test fixtures in test/rfc3161.test.js but are inlined here
// to keep verify.test.js self-contained.

function _writeLength(n) {
  if (n < 0x80) return new Uint8Array([n]);
  if (n <= 0xff) return new Uint8Array([0x81, n]);
  if (n <= 0xffff) return new Uint8Array([0x82, n >> 8, n & 0xff]);
  throw new Error('_writeLength: value too large');
}

function _writeTLV(tag, content) {
  const lenBytes = _writeLength(content.length);
  const out = new Uint8Array(1 + lenBytes.length + content.length);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(content, 1 + lenBytes.length);
  return out;
}

function _concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

const _OID_SHA256 = new Uint8Array([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);
const _OID_POLICY = new Uint8Array([0x2a, 0x03, 0x04]);

function _buildTSTInfo(hashBytes) {
  const version    = _writeTLV(0x02, new Uint8Array([0x01]));
  const policy     = _writeTLV(0x06, _OID_POLICY);
  const algId      = _writeTLV(0x30, _concat(_writeTLV(0x06, _OID_SHA256), _writeTLV(0x05, new Uint8Array(0))));
  const msgImprint = _writeTLV(0x30, _concat(algId, _writeTLV(0x04, hashBytes)));
  const serial     = _writeTLV(0x02, new Uint8Array([0x01]));
  const genTime    = _writeTLV(0x18, enc.encode('20260316120000Z'));
  return _writeTLV(0x30, _concat(version, policy, msgImprint, serial, genTime));
}

function _buildTimeStampToken(tstInfoDer) {
  const oidSD     = _writeTLV(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]));
  const oidTSTI   = _writeTLV(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x01, 0x04]));
  const eContent  = _writeTLV(0xa0, _writeTLV(0x04, tstInfoDer));
  const encapInfo = _writeTLV(0x30, _concat(oidTSTI, eContent));
  const sdVersion = _writeTLV(0x02, new Uint8Array([0x03]));
  const digestAlgs = _writeTLV(0x31, new Uint8Array(0));
  const signedData = _writeTLV(0x30, _concat(sdVersion, digestAlgs, encapInfo));
  const ctx0       = _writeTLV(0xa0, signedData);
  return _writeTLV(0x30, _concat(oidSD, ctx0));
}

/** Builds a base64 RFC 3161 token whose messageImprint matches bundleHash. */
function buildValidToken(bundleHash) {
  const hex = bundleHash.slice(7);
  const hashBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) hashBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const tokenDer = _buildTimeStampToken(_buildTSTInfo(hashBytes));
  return btoa(String.fromCharCode(...tokenDer));
}

/** Builds a base64 RFC 3161 token whose messageImprint deliberately MISMATCHES bundleHash. */
function buildMismatchedToken(bundleHash) {
  const wrongBytes = new Uint8Array(32).fill(0xff); // definitely won't match real hash
  const tokenDer = _buildTimeStampToken(_buildTSTInfo(wrongBytes));
  return btoa(String.fromCharCode(...tokenDer));
}

/**
 * Builds a v0.2.0 WACZ with a signatures array.
 *
 * @param {CryptoKey}   privateKey
 * @param {Uint8Array}  publicKeyBytes
 * @param {{ token?: string, tsa?: string } | null} tsaEntry
 *   When non-null, adds an rfc3161 entry to the signatures array.
 *   Pass a valid token to simulate a good timestamp, or a bad one to simulate failure.
 */
async function buildTestWaczV2(privateKey, publicKeyBytes, tsaEntry = null) {
  const warcBytes  = enc.encode('WARC/1.1\r\ntest warc content v2');
  const cdxjBytes  = enc.encode('test cdxj content v2');
  const pagesBytes = enc.encode('{"format":"json-pages-1.0"}\n');

  const warcHash  = await sha256(warcBytes);
  const cdxjHash  = await sha256(cdxjBytes);
  const pagesHash = await sha256(pagesBytes);

  const datapackage = {
    profile: 'data-package',
    wacz_version: '1.1.1',
    resources: [
      { name: 'data.warc',    path: 'archive/data.warc',   hash: warcHash,  bytes: warcBytes.byteLength },
      { name: 'index.cdxj',  path: 'indexes/index.cdxj',  hash: cdxjHash,  bytes: cdxjBytes.byteLength },
      { name: 'pages.jsonl', path: 'pages/pages.jsonl',    hash: pagesHash, bytes: pagesBytes.byteLength },
    ],
  };

  const dpBytes    = enc.encode(JSON.stringify(datapackage, null, 2));
  const bundleHash = await sha256(enc.encode(canonicalize(datapackage)));
  const signature  = await signBytes(privateKey, enc.encode(bundleHash));
  const publicKeyBase64 = btoa(String.fromCharCode(...publicKeyBytes));
  const dpHashOfBytes   = await sha256(dpBytes);

  const signatures = [
    { type: 'self', signature, publicKey: publicKeyBase64, keyId: 'aaaabbbb' },
  ];
  if (tsaEntry) {
    signatures.push({ type: 'rfc3161', token: tsaEntry.token, tsa: tsaEntry.tsa ?? 'https://tsa.example.com' });
  }

  const digestDoc = {
    path: 'datapackage.json',
    hash: dpHashOfBytes,
    signedData: {
      hash: bundleHash,
      created: new Date().toISOString(),
      software: 'WRL/0.1',
      version: '0.2.0',
      signatures,
    },
  };

  const digestBytes = enc.encode(JSON.stringify(digestDoc, null, 2));

  const waczBytes = zipSync({
    'datapackage.json':        [dpBytes,     { level: 0 }],
    'datapackage-digest.json': [digestBytes, { level: 0 }],
    'archive/data.warc':       [warcBytes,   { level: 0 }],
    'indexes/index.cdxj':      [cdxjBytes,   { level: 0 }],
    'pages/pages.jsonl':       [pagesBytes,  { level: 0 }],
  });

  return { waczBytes, datapackage, dpBytes, digestDoc, digestBytes, warcBytes, cdxjBytes, pagesBytes, bundleHash };
}

// ---------------------------------------------------------------------------
// v0.2.0 -- self-signature only (no timestamp)
// ---------------------------------------------------------------------------

describe('verifyWacz v0.2.0 -- valid self-signature, no timestamp', () => {
  it('verified: true with 4 checks, timestamp: skip', async () => {
    const { waczBytes } = await buildTestWaczV2(privateKeyA, publicKeyBytesA, null);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.verified).toBe(true);
    expect(result.checks).toHaveLength(4);

    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('pass');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('pass');
    expect(byName.timestamp.status).toBe('skip');
  });

  it('capture metadata is present and has expected shape', async () => {
    const { waczBytes } = await buildTestWaczV2(privateKeyA, publicKeyBytesA, null);
    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.capture).toBeDefined();
    expect(result.capture.bundleHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(typeof result.capture.signature).toBe('string');
    expect(typeof result.capture.publicKey).toBe('string');
    expect(typeof result.capture.signedAt).toBe('string');
    expect(result.capture.timestamp).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// v0.2.0 -- valid self-signature + valid timestamp
// ---------------------------------------------------------------------------

describe('verifyWacz v0.2.0 -- valid self-signature + valid timestamp', () => {
  it('verified: true, all 4 checks pass', async () => {
    // Build the WACZ first to get the bundleHash, then create a matching token
    const { waczBytes, bundleHash } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: 'placeholder', tsa: 'https://tsa.example.com' }
    );

    // Re-build with a token that actually matches the bundleHash
    const validToken = buildValidToken(bundleHash);
    const { waczBytes: waczBytesWithTs } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: validToken, tsa: 'https://tsa.example.com' }
    );

    const result = await verifyWacz(waczBytesWithTs, publicKeyBytesA);

    expect(result.verified).toBe(true);
    expect(result.checks).toHaveLength(4);

    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('pass');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('pass');
    expect(byName.timestamp.status).toBe('pass');
  });

  it('capture.timestamp is populated with genTime and tsa', async () => {
    const { waczBytes: waczInit, bundleHash } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: 'placeholder', tsa: 'https://tsa.example.com' }
    );
    const validToken = buildValidToken(bundleHash);
    const { waczBytes } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: validToken, tsa: 'https://tsa.example.com' }
    );

    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.capture.timestamp).toBeDefined();
    expect(result.capture.timestamp.genTime).toBe('2026-03-16T12:00:00.000Z');
    expect(result.capture.timestamp.tsa).toBe('https://tsa.example.com');
  });
});

// ---------------------------------------------------------------------------
// v0.2.0 -- valid self-signature + invalid timestamp
// ---------------------------------------------------------------------------

describe('verifyWacz v0.2.0 -- valid self-signature + invalid timestamp', () => {
  it('verified: false, timestamp check fails', async () => {
    // Build a WACZ whose bundleHash will NOT match the token's messageImprint
    const { waczBytes, bundleHash } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: 'placeholder', tsa: 'https://tsa.example.com' }
    );

    // Use a token with a MISMATCHED hash
    const badToken = buildMismatchedToken(bundleHash);
    const { waczBytes: waczBytesWithBadTs } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: badToken, tsa: 'https://tsa.example.com' }
    );

    const result = await verifyWacz(waczBytesWithBadTs, publicKeyBytesA);

    expect(result.verified).toBe(false);
    expect(result.checks).toHaveLength(4);

    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.artifactHashes.status).toBe('pass');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('pass');
    expect(byName.timestamp.status).toBe('fail');
  });

  it('malformed token base64 causes timestamp: fail', async () => {
    const { waczBytes: waczInit, bundleHash } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: 'placeholder' }
    );
    const { waczBytes } = await buildTestWaczV2(
      privateKeyA, publicKeyBytesA, { token: '!!!not-base64!!!' }
    );

    const result = await verifyWacz(waczBytes, publicKeyBytesA);

    expect(result.verified).toBe(false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    expect(byName.timestamp.status).toBe('fail');
    // Other checks should still run and pass (self-signature is still valid)
    expect(byName.artifactHashes.status).toBe('pass');
    expect(byName.bundleHash.status).toBe('pass');
    expect(byName.signature.status).toBe('pass');
  });
});
