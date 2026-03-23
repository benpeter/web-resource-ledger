/**
 * cms-chain.test.js -- CMS/PKCS#7 certificate chain validation tests
 *
 * Tests verifyCmsChain() from lib/cms-verify.js.
 *
 * REAL FIXTURE:
 *   test/fixtures/digicert-tsa-token.der -- a real RFC 3161 timestamp token
 *   obtained from the DigiCert TSA via a production WRL capture.
 *
 *   The token was captured from capture cap_eebc8b957ee542c7a9a4d8a0a33ae1c8
 *   (tsa: http://timestamp.digicert.com, captured 2026-03-16).
 *
 *   To refresh the fixture:
 *     1. source ~/.secrets
 *     2. curl -s -H "Authorization: Bearer $WRL_CAPTURE_API_KEY" \
 *          "https://api.webresourceledger.com/v1/captures?status=complete&limit=50" \
 *          | jq '.data[].id'
 *     3. Find a capture with version=0.2.0 and rfc3161 signature.
 *     4. Download its WACZ and extract datapackage-digest.json.
 *     5. base64-decode signedData.signatures[?type=="rfc3161"].token to DER.
 *     6. Save as test/fixtures/digicert-tsa-token.der
 *
 *   NOTE: The production DigiCert TSA token does NOT embed the signer certificate
 *   in the token body. The bundled certs directory includes the root, intermediate,
 *   and leaf certificates from DigiCert's TSA chain, enabling full offline chain
 *   verification.
 *
 * PKIjs ISSUE #332 -- CRITICAL:
 *   Without the explicit guard in cms-verify.js, pkijs.SignedData.verify()
 *   with an empty trustedCerts array may return signatureVerified: true.
 *   The test `valid: false for empty trust roots` directly validates that guard.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyCmsChain, loadTrustedRoots } from '../lib/cms-verify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Real fixture: DigiCert TSA token from production capture
// ---------------------------------------------------------------------------

const REAL_TOKEN_DER     = readFileSync(join(FIXTURES_DIR, 'digicert-tsa-token.der'));
const REAL_TOKEN_BASE64  = REAL_TOKEN_DER.toString('base64');
const REAL_GEN_TIME      = '2026-03-16T19:53:45.000Z';

// The DigiCert G4 root bundled with this package
const BUNDLED_ROOTS = loadTrustedRoots();

// ---------------------------------------------------------------------------
// Tests with real fixture -- negative cases (chain not present in token body)
// ---------------------------------------------------------------------------

describe('verifyCmsChain -- real DigiCert token', () => {
  it('returns valid: true with bundled DigiCert chain (root + intermediate + leaf)', async () => {
    // The bundled certs include the leaf signer cert, intermediate CA, and root CA.
    // The TSA token does not embed certificates, but the bundled chain provides
    // them for offline verification.
    const result = await verifyCmsChain(REAL_TOKEN_BASE64, BUNDLED_ROOTS, REAL_GEN_TIME);
    assert.strictEqual(result.valid, true);
    assert.ok(result.signerInfo, 'signerInfo should be populated');
    assert.ok(result.signerInfo.commonName.includes('DigiCert'), 'signer should be DigiCert');
  });

  it('returns valid: false with empty trust roots', async () => {
    // CRITICAL: No trusted roots = no chain validation possible.
    const result = await verifyCmsChain(REAL_TOKEN_BASE64, [], REAL_GEN_TIME);
    assert.strictEqual(result.valid, false);
    assert.match(result.detail, /trusted root/i);
    assert.strictEqual(result.signerInfo, null);
  });

  it('returns valid: false with only the root cert (no leaf to verify signature)', async () => {
    // Only the root CA is provided. Without the leaf cert in the bundle,
    // the signer cannot be found.
    const rootOnly = BUNDLED_ROOTS.filter(pem => pem.includes('Trusted Root G4'));
    const result = await verifyCmsChain(REAL_TOKEN_BASE64, rootOnly, REAL_GEN_TIME);
    assert.strictEqual(result.valid, false);
    assert.ok(result.detail, 'failure detail should explain the failure');
  });
});

// ---------------------------------------------------------------------------
// Tests with synthetic/malformed tokens
// ---------------------------------------------------------------------------

describe('verifyCmsChain -- synthetic error cases', () => {
  it('returns valid: false for truncated DER', async () => {
    const truncated = Buffer.from(REAL_TOKEN_DER.slice(0, 10)).toString('base64');
    const result = await verifyCmsChain(truncated, BUNDLED_ROOTS, REAL_GEN_TIME);
    assert.strictEqual(result.valid, false);
    assert.ok(result.detail);
    assert.strictEqual(result.signerInfo, null);
  });

  it('returns valid: false for empty token string', async () => {
    const result = await verifyCmsChain('', BUNDLED_ROOTS, REAL_GEN_TIME);
    assert.strictEqual(result.valid, false);
    assert.ok(result.detail);
  });

  it('returns valid: false for non-DER base64 garbage', async () => {
    const garbage = Buffer.from('this is definitely not a CMS token').toString('base64');
    const result = await verifyCmsChain(garbage, BUNDLED_ROOTS, REAL_GEN_TIME);
    assert.strictEqual(result.valid, false);
    assert.ok(result.detail);
  });

  it('returns valid: false for valid base64 but invalid DER structure', async () => {
    // Valid base64 that decodes to a byte sequence that starts with a SEQUENCE
    // tag but has an impossible declared length.
    const badDer = new Uint8Array([0x30, 0x82, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = await verifyCmsChain(Buffer.from(badDer).toString('base64'), BUNDLED_ROOTS);
    assert.strictEqual(result.valid, false);
    assert.ok(result.detail);
  });
});

// ---------------------------------------------------------------------------
// loadTrustedRoots
// ---------------------------------------------------------------------------

describe('loadTrustedRoots', () => {
  it('returns an array with at least one PEM', () => {
    const roots = loadTrustedRoots();
    assert.ok(Array.isArray(roots));
    assert.ok(roots.length >= 1);
    for (const pem of roots) {
      assert.match(pem, /-----BEGIN CERTIFICATE-----/);
    }
  });
});
