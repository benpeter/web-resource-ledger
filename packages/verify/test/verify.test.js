/**
 * verify.test.js -- Verification pipeline tests for verifyWacz()
 *
 * Tests the full verification pipeline for v0.1.0 and v0.2.0 WACZ formats,
 * including tamper detection, error handling, and security invariants.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync } from 'fflate';
import { verifyWacz } from '../lib/verify.js';
import {
  buildTestWacz,
  buildTestWaczV2,
  buildValidToken,
  buildMismatchedToken,
  generateKeyPair,
} from './helpers/build-wacz.js';

// ---------------------------------------------------------------------------
// Shared key pairs -- generated once before all tests
// ---------------------------------------------------------------------------

let privA, pubA;  // key pair used to sign valid WACZs
let privB, pubB;  // second key pair used for wrong-key tests

before(async () => {
  ({ privateKey: privA, publicKeyBytes: pubA } = await generateKeyPair());
  ({ privateKey: privB, publicKeyBytes: pubB } = await generateKeyPair());
});

// ---------------------------------------------------------------------------
// Happy path: v0.1.0
// ---------------------------------------------------------------------------

describe('verifyWacz v0.1.0 -- happy path', () => {
  it('valid WACZ returns verified: true', async () => {
    const { waczBytes } = await buildTestWacz(privA, pubA);
    const result = await verifyWacz(waczBytes, pubA);

    assert.strictEqual(result.verified, true);
    for (const check of result.checks) {
      assert.strictEqual(check.status, 'pass');
    }
  });

  it('result contains exactly 3 checks with correct names', async () => {
    const { waczBytes } = await buildTestWacz(privA, pubA);
    const result = await verifyWacz(waczBytes, pubA);

    assert.strictEqual(result.checks.length, 3);
    const names = result.checks.map(c => c.name);
    assert.ok(names.includes('artifactHashes'));
    assert.ok(names.includes('bundleHash'));
    assert.ok(names.includes('signature'));
  });

  it('result includes capture metadata with expected fields', async () => {
    const { waczBytes } = await buildTestWacz(privA, pubA);
    const result = await verifyWacz(waczBytes, pubA);

    assert.ok(result.capture, 'capture should be present');
    assert.match(result.capture.bundleHash, /^sha256:[0-9a-f]{64}$/);
    assert.strictEqual(typeof result.capture.signature, 'string');
    assert.strictEqual(typeof result.capture.publicKey, 'string');
    assert.strictEqual(typeof result.capture.signedAt, 'string');
    assert.strictEqual(result.capture.timestamp, undefined);
  });
});

// ---------------------------------------------------------------------------
// Happy path: v0.2.0 without timestamp
// ---------------------------------------------------------------------------

describe('verifyWacz v0.2.0 -- valid self-signature, no timestamp', () => {
  it('verified: true with timestamp: skip', async () => {
    const { waczBytes } = await buildTestWaczV2(privA, pubA);
    const result = await verifyWacz(waczBytes, pubA);

    assert.strictEqual(result.verified, true);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.artifactHashes.status, 'pass');
    assert.strictEqual(byName.bundleHash.status, 'pass');
    assert.strictEqual(byName.signature.status, 'pass');
    assert.strictEqual(byName.timestamp.status, 'skip');
  });

  it('result has exactly 4 checks', async () => {
    const { waczBytes } = await buildTestWaczV2(privA, pubA);
    const result = await verifyWacz(waczBytes, pubA);
    assert.strictEqual(result.checks.length, 4);
  });

  it('capture metadata present and no timestamp field', async () => {
    const { waczBytes } = await buildTestWaczV2(privA, pubA);
    const result = await verifyWacz(waczBytes, pubA);

    assert.ok(result.capture);
    assert.match(result.capture.bundleHash, /^sha256:[0-9a-f]{64}$/);
    assert.strictEqual(typeof result.capture.signature, 'string');
    assert.strictEqual(typeof result.capture.publicKey, 'string');
    assert.strictEqual(typeof result.capture.signedAt, 'string');
    assert.strictEqual(result.capture.timestamp, undefined);
  });
});

// ---------------------------------------------------------------------------
// Happy path: v0.2.0 with valid timestamp
// ---------------------------------------------------------------------------

describe('verifyWacz v0.2.0 -- valid self-signature + valid timestamp', () => {
  it('verified: true with timestamp passing (timestampChain skipped when no roots)', async () => {
    // Build once to get bundleHash, then build again with matching token.
    // When no trustedRoots are provided, verify.js adds timestampChain: skip,
    // so the total is 5 checks (not 4). skip is tolerated: verified is still true.
    const { bundleHash } = await buildTestWaczV2(privA, pubA, { token: 'placeholder' });
    const validToken = buildValidToken(bundleHash);
    const { waczBytes } = await buildTestWaczV2(privA, pubA, { token: validToken });

    const result = await verifyWacz(waczBytes, pubA);

    assert.strictEqual(result.verified, true);
    // 5 checks: 3 core + timestamp + timestampChain:skip
    assert.strictEqual(result.checks.length, 5);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.artifactHashes.status, 'pass');
    assert.strictEqual(byName.bundleHash.status, 'pass');
    assert.strictEqual(byName.signature.status, 'pass');
    assert.strictEqual(byName.timestamp.status, 'pass');
    assert.strictEqual(byName.timestampChain.status, 'skip');
  });

  it('capture.timestamp is populated with genTime and tsa', async () => {
    const { bundleHash } = await buildTestWaczV2(privA, pubA, { token: 'placeholder' });
    const validToken = buildValidToken(bundleHash);
    const { waczBytes } = await buildTestWaczV2(privA, pubA, {
      token: validToken,
      tsa: 'https://tsa.example.com',
    });

    const result = await verifyWacz(waczBytes, pubA);

    assert.ok(result.capture.timestamp, 'timestamp should be present');
    assert.strictEqual(typeof result.capture.timestamp.genTime, 'string');
    assert.strictEqual(result.capture.timestamp.tsa, 'https://tsa.example.com');
  });
});

// ---------------------------------------------------------------------------
// Tamper detection
// ---------------------------------------------------------------------------

describe('verifyWacz -- tamper detection', () => {
  it('corrupted artifact fails artifactHashes, passes bundleHash and signature', async () => {
    const { waczBytes } = await buildTestWacz(privA, pubA);
    const files = unzipSync(waczBytes);

    const original = files['archive/data.warc'];
    const corrupted = new Uint8Array(original.length + 1);
    corrupted.set(original);
    corrupted[original.length] = 0xff;

    const repackaged = zipSync({
      'datapackage.json':        [files['datapackage.json'],        { level: 0 }],
      'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':       [corrupted,                        { level: 0 }],
      'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
    });

    const result = await verifyWacz(repackaged, pubA);

    assert.strictEqual(result.verified, false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.artifactHashes.status, 'fail');
    assert.strictEqual(byName.bundleHash.status, 'pass');
    assert.strictEqual(byName.signature.status, 'pass');
  });

  it('modified datapackage.json after hashing fails bundleHash', async () => {
    const { waczBytes, datapackage } = await buildTestWacz(privA, pubA);
    const files = unzipSync(waczBytes);

    const enc = new TextEncoder();
    const tamperedDp = { ...datapackage, tampered: true };
    const tamperedDpBytes = enc.encode(JSON.stringify(tamperedDp, null, 2));

    const repackaged = zipSync({
      'datapackage.json':        [tamperedDpBytes,                  { level: 0 }],
      'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':       [files['archive/data.warc'],       { level: 0 }],
      'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
    });

    const result = await verifyWacz(repackaged, pubA);

    assert.strictEqual(result.verified, false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.bundleHash.status, 'fail');
  });

  it('wrong public key fails signature check', async () => {
    const { waczBytes } = await buildTestWacz(privA, pubA);
    const result = await verifyWacz(waczBytes, pubB);

    assert.strictEqual(result.verified, false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.artifactHashes.status, 'pass');
    assert.strictEqual(byName.bundleHash.status, 'pass');
    assert.strictEqual(byName.signature.status, 'fail');
  });

  it('all checks run even after first check fails (no short-circuit)', async () => {
    const { waczBytes } = await buildTestWacz(privA, pubA);
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

    const result = await verifyWacz(repackaged, pubA);

    // All 3 checks must be present even though artifactHashes failed
    assert.strictEqual(result.checks.length, 3);
    const names = result.checks.map(c => c.name);
    assert.ok(names.includes('artifactHashes'));
    assert.ok(names.includes('bundleHash'));
    assert.ok(names.includes('signature'));

    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.artifactHashes.status, 'fail');
    // bundleHash and signature must be present with a valid status
    assert.ok(['pass', 'fail', 'skip'].includes(byName.bundleHash.status));
    assert.ok(['pass', 'fail', 'skip'].includes(byName.signature.status));
  });

  it('invalid timestamp fails verification (v0.2.0 with mismatched token)', async () => {
    const { bundleHash } = await buildTestWaczV2(privA, pubA, { token: 'placeholder' });
    const badToken = buildMismatchedToken(bundleHash);
    const { waczBytes } = await buildTestWaczV2(privA, pubA, { token: badToken });

    const result = await verifyWacz(waczBytes, pubA);

    assert.strictEqual(result.verified, false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.timestamp.status, 'fail');
    // Other checks still pass
    assert.strictEqual(byName.artifactHashes.status, 'pass');
    assert.strictEqual(byName.bundleHash.status, 'pass');
    assert.strictEqual(byName.signature.status, 'pass');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('verifyWacz -- error handling', () => {
  it('garbage bytes (not a ZIP) returns all 3 checks failed', async () => {
    const garbage = new Uint8Array(256).map((_, i) => i % 256);
    const result = await verifyWacz(garbage, pubA);

    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.checks.length, 3);
    for (const check of result.checks) {
      assert.strictEqual(check.status, 'fail');
    }
  });

  it('ZIP missing datapackage.json returns all checks failed', async () => {
    const { warcBytes, cdxjBytes, pagesBytes } = await buildTestWacz(privA, pubA);

    const noManifest = zipSync({
      'archive/data.warc':   [warcBytes,  { level: 0 }],
      'indexes/index.cdxj':  [cdxjBytes,  { level: 0 }],
      'pages/pages.jsonl':   [pagesBytes, { level: 0 }],
    });

    const result = await verifyWacz(noManifest, pubA);

    assert.strictEqual(result.verified, false);
    for (const check of result.checks) {
      assert.strictEqual(check.status, 'fail');
    }
  });

  it('ZIP missing datapackage-digest.json fails bundleHash and signature', async () => {
    const { dpBytes, warcBytes, cdxjBytes, pagesBytes } = await buildTestWacz(privA, pubA);

    const noDigest = zipSync({
      'datapackage.json':   [dpBytes,    { level: 0 }],
      'archive/data.warc':  [warcBytes,  { level: 0 }],
      'indexes/index.cdxj': [cdxjBytes,  { level: 0 }],
      'pages/pages.jsonl':  [pagesBytes, { level: 0 }],
    });

    const result = await verifyWacz(noDigest, pubA);

    assert.strictEqual(result.verified, false);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.bundleHash.status, 'fail');
    assert.strictEqual(byName.signature.status, 'fail');
    // artifactHashes is either skip or fail per spec
    assert.ok(['skip', 'fail'].includes(byName.artifactHashes.status));
  });

  it('malformed JSON in datapackage.json returns all checks failed', async () => {
    const enc = new TextEncoder();
    const badJson = enc.encode('{not valid json!!!}');
    const dummyDigest = enc.encode('{}');

    const badZip = zipSync({
      'datapackage.json':        [badJson,    { level: 0 }],
      'datapackage-digest.json': [dummyDigest, { level: 0 }],
    });

    const result = await verifyWacz(badZip, pubA);

    assert.strictEqual(result.verified, false);
    for (const check of result.checks) {
      assert.strictEqual(check.status, 'fail');
    }
  });
});

// ---------------------------------------------------------------------------
// Security invariants
// ---------------------------------------------------------------------------

describe('verifyWacz -- security', () => {
  it('detail messages never contain hash values', async () => {
    const hashPattern = /sha256:[0-9a-f]+/;

    const scenarios = await Promise.all([
      // Garbage input
      verifyWacz(new Uint8Array(64), pubA),

      // Corrupted artifact
      buildTestWacz(privA, pubA).then(async ({ waczBytes }) => {
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
        return verifyWacz(repackaged, pubA);
      }),

      // Modified datapackage
      buildTestWacz(privA, pubA).then(async ({ waczBytes, datapackage }) => {
        const enc = new TextEncoder();
        const files = unzipSync(waczBytes);
        const tampered = enc.encode(JSON.stringify({ ...datapackage, tampered: true }, null, 2));
        const repackaged = zipSync({
          'datapackage.json':        [tampered,                         { level: 0 }],
          'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
          'archive/data.warc':       [files['archive/data.warc'],       { level: 0 }],
          'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
          'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
        });
        return verifyWacz(repackaged, pubA);
      }),

      // Wrong key
      buildTestWacz(privA, pubA).then(({ waczBytes }) => verifyWacz(waczBytes, pubB)),
    ]);

    for (const result of scenarios) {
      for (const check of result.checks) {
        if (check.detail) {
          assert.doesNotMatch(check.detail, hashPattern,
            `detail for "${check.name}" must not contain hash values`);
        }
      }
    }
  });

  it('detail messages never contain "expected" or "actual" wording', async () => {
    const { waczBytes, datapackage } = await buildTestWacz(privA, pubA);
    const enc = new TextEncoder();
    const files = unzipSync(waczBytes);

    // Trigger bundleHash failure
    const tampered = enc.encode(JSON.stringify({ ...datapackage, tampered: true }, null, 2));
    const repackaged = zipSync({
      'datapackage.json':        [tampered,                         { level: 0 }],
      'datapackage-digest.json': [files['datapackage-digest.json'], { level: 0 }],
      'archive/data.warc':       [files['archive/data.warc'],       { level: 0 }],
      'indexes/index.cdxj':      [files['indexes/index.cdxj'],      { level: 0 }],
      'pages/pages.jsonl':       [files['pages/pages.jsonl'],       { level: 0 }],
    });

    const result = await verifyWacz(repackaged, pubA);

    for (const check of result.checks) {
      if (check.detail) {
        assert.doesNotMatch(check.detail, /\bexpected\b/i);
        assert.doesNotMatch(check.detail, /\bactual\b/i);
      }
    }
  });

  it('embedded publicKey in result is informational only (not verified against)', async () => {
    // Build WACZ signed with privA, put pubB as embedded publicKey in digest
    const { waczBytes, datapackage } = await buildTestWacz(privA, pubA);
    const files = unzipSync(waczBytes);
    const digest = JSON.parse(new TextDecoder().decode(files['datapackage-digest.json']));

    // Replace embedded publicKey with pubB's key (attacker's key)
    const { publicKeyBase64: pubBBase64 } = await generateKeyPair();
    digest.signedData.publicKey = pubBBase64;

    const enc = new TextEncoder();
    const tamperedDigest = enc.encode(JSON.stringify(digest, null, 2));
    const repackaged = zipSync({
      'datapackage.json':        [files['datapackage.json'],  { level: 0 }],
      'datapackage-digest.json': [tamperedDigest,             { level: 0 }],
      'archive/data.warc':       [files['archive/data.warc'], { level: 0 }],
      'indexes/index.cdxj':      [files['indexes/index.cdxj'], { level: 0 }],
      'pages/pages.jsonl':       [files['pages/pages.jsonl'],  { level: 0 }],
    });

    // Verify with the CORRECT external key (pubA) -- should still pass
    const result = await verifyWacz(repackaged, pubA);

    // Verification uses the provided publicKeyBytes (pubA), not the embedded one
    assert.strictEqual(result.verified, true);
    const byName = Object.fromEntries(result.checks.map(c => [c.name, c]));
    assert.strictEqual(byName.signature.status, 'pass');

    // result.capture.publicKey is the embedded one (informational)
    // It should be the tampered value (pubB), not pubA
    assert.strictEqual(result.capture.publicKey, pubBBase64);
  });
});
