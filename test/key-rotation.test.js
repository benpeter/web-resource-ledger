// tva
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSigningKeys, computeKeyId } from '../src/signing.js';
import { buildWacz } from '../src/wacz.js';
import { createCapture, completeCapture, archiveSigningKey, getArchivedSigningKey } from '../src/db.js';
import { PNG_BYTES } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_HTML = '<html><body>key rotation test</body></html>';
const TEST_URL = 'https://example.com/key-rotation';

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  // Clean up D1 metadata tables
  await env.DB.prepare('DELETE FROM captures').run();
  await env.DB.prepare('DELETE FROM signing_keys').run();
  await env.DB.prepare('DELETE FROM tenants').run();

  // Clean up R2
  const r2List = await env.BUCKET.list({ prefix: 'captures/' });
  await Promise.all(r2List.objects.map(obj => env.BUCKET.delete(obj.key)));
});

// ---------------------------------------------------------------------------
// Key ID computation
// ---------------------------------------------------------------------------

describe('getSigningKeys -- malformed key', () => {
  it('returns null for malformed SIGNING_KEY', async () => {
    // Errors are logged to Coralogix (no-op in test env without CORALOGIX_ENDPOINT)
    const result = await getSigningKeys({ SIGNING_KEY: 'not-valid-pkcs8-at-all' });
    expect(result).toBeNull();
  });
});

describe('computeKeyId', () => {
  it('returns 8 hex chars', async () => {
    const keys = await getSigningKeys(env);
    const keyId = await computeKeyId(keys.publicKeyBytes);
    expect(keyId).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic -- same key always returns same keyId', async () => {
    const keys = await getSigningKeys(env);
    const id1 = await computeKeyId(keys.publicKeyBytes);
    const id2 = await computeKeyId(keys.publicKeyBytes);
    expect(id1).toBe(id2);
  });

  it('different keys produce different keyIds', async () => {
    const keysA = await getSigningKeys(env);
    const keysB = await getSigningKeys({ SIGNING_KEY: env.TEST_ARCHIVED_KEY });
    const idA = await computeKeyId(keysA.publicKeyBytes);
    const idB = await computeKeyId(keysB.publicKeyBytes);
    expect(idA).not.toBe(idB);
  });

  it('getSigningKeys returns keyId in result', async () => {
    const keys = await getSigningKeys(env);
    expect(keys.keyId).toBeDefined();
    expect(keys.keyId).toMatch(/^[0-9a-f]{8}$/);
    // Verify consistency
    const computed = await computeKeyId(keys.publicKeyBytes);
    expect(keys.keyId).toBe(computed);
  });
});

// ---------------------------------------------------------------------------
// Signing key archive (KV operations)
// ---------------------------------------------------------------------------

describe('Signing key archive', () => {
  it('archiveSigningKey stores and getArchivedSigningKey retrieves', async () => {
    const keys = await getSigningKeys(env);
    const pubKeyB64 = btoa(String.fromCharCode(...keys.publicKeyBytes));
    await archiveSigningKey(env.DB, keys.keyId, pubKeyB64);

    const archived = await getArchivedSigningKey(env.DB, keys.keyId);
    expect(archived).not.toBeNull();
    expect(archived.algorithm).toBe('Ed25519');
    expect(archived.publicKey).toBe(pubKeyB64);
    expect(typeof archived.archivedAt).toBe('string');
  });

  it('idempotent -- writing same keyId twice succeeds', async () => {
    const keys = await getSigningKeys(env);
    const pubKeyB64 = btoa(String.fromCharCode(...keys.publicKeyBytes));
    await archiveSigningKey(env.DB, keys.keyId, pubKeyB64);
    await archiveSigningKey(env.DB, keys.keyId, pubKeyB64);

    const archived = await getArchivedSigningKey(env.DB, keys.keyId);
    expect(archived).not.toBeNull();
    expect(archived.publicKey).toBe(pubKeyB64);
  });

  it('getArchivedSigningKey returns null for unknown keyId', async () => {
    const result = await getArchivedSigningKey(env.DB, 'deadbeef');
    expect(result).toBeNull();
  });

  it('archiveSigningKey rejects keys that do not decode to 32 bytes', async () => {
    const shortKey = btoa('too short');
    await expect(
      archiveSigningKey(env.DB, 'badkey01', shortKey),
    ).rejects.toThrow('Expected 32-byte public key');
  });
});

// ---------------------------------------------------------------------------
// buildWacz output includes keyId
// ---------------------------------------------------------------------------

describe('buildWacz -- keyId output', () => {
  it('return value includes keyId', async () => {
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      env,
    );
    expect(result).not.toBeNull();
    expect(result.keyId).toBeDefined();
    expect(result.keyId).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// Key rotation: verification with historical key
// ---------------------------------------------------------------------------

describe('Key rotation -- verification', () => {
  it('verification succeeds when keyId in KV record matches archived key', async () => {
    const captureId = 'cap_aa000000000000000000000000000001';

    // Build WACZ with current key
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      env,
    );

    // Store WACZ in R2
    await env.BUCKET.put(`captures/${result.waczHash}.wacz`, result.waczBytes);

    // Archive signing key
    await archiveSigningKey(env.DB, result.keyId, result.publicKeyBase64);

    // Create capture record with keyId
    await createCapture(env.DB, captureId, TEST_URL, '127.0.0.1', 'default');
    await completeCapture(env.DB, captureId, { screenshot: 's.png', html: 'h.html' }, {
      key: `captures/${result.waczHash}.wacz`,
      bundleHash: result.bundleHash,
      size: result.waczBytes.byteLength,
      keyId: result.keyId,
    });

    // Verify via endpoint
    const res = await SELF.fetch(`https://worker.test/v1/verify/${captureId}`, {
      headers: { 'Accept': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });

  it('verification succeeds for legacy capture (no keyId) using current key', async () => {
    const captureId = 'cap_bb000000000000000000000000000002';

    // Build WACZ with current key
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      env,
    );

    // Store WACZ in R2
    await env.BUCKET.put(`captures/${result.waczHash}.wacz`, result.waczBytes);

    // Create capture record WITHOUT keyId (simulates pre-versioning capture)
    await createCapture(env.DB, captureId, TEST_URL, '127.0.0.1', 'default');
    await completeCapture(env.DB, captureId, { screenshot: 's.png', html: 'h.html' }, {
      key: `captures/${result.waczHash}.wacz`,
      bundleHash: result.bundleHash,
      size: result.waczBytes.byteLength,
      // No keyId -- legacy record
    });

    // Verify via endpoint -- should fall back to current key
    const res = await SELF.fetch(`https://worker.test/v1/verify/${captureId}`, {
      headers: { 'Accept': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });

  it('verification returns false when archived key is deleted and current key differs', async () => {
    const captureId = 'cap_dd000000000000000000000000000004';

    // Build WACZ with the "archived" key
    const archivedEnv = { SIGNING_KEY: env.TEST_ARCHIVED_KEY };
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      archivedEnv,
    );

    // Store WACZ in R2
    await env.BUCKET.put(`captures/${result.waczHash}.wacz`, result.waczBytes);

    // Archive the key, then DELETE it (simulates data loss)
    await archiveSigningKey(env.DB, result.keyId, result.publicKeyBase64);
    await env.DB.prepare('DELETE FROM signing_keys WHERE id = ?').bind(result.keyId).run();

    // Create capture record with keyId pointing to the now-deleted archived key
    await createCapture(env.DB, captureId, TEST_URL, '127.0.0.1', 'default');
    await completeCapture(env.DB, captureId, { screenshot: 's.png', html: 'h.html' }, {
      key: `captures/${result.waczHash}.wacz`,
      bundleHash: result.bundleHash,
      size: result.waczBytes.byteLength,
      keyId: result.keyId,
    });

    // Verify via endpoint -- archived key deleted, current key is different
    // Should fall back to current key, which won't match → verified: false
    const res = await SELF.fetch(`https://worker.test/v1/verify/${captureId}`, {
      headers: { 'Accept': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(false);
    const sigCheck = body.checks.find(c => c.name === 'signature');
    expect(sigCheck.status).toBe('fail');
  });

  it('verification succeeds with archived key even when current key differs', async () => {
    const captureId = 'cap_cc000000000000000000000000000003';

    // Build WACZ with the "archived" key (simulates pre-rotation capture)
    const archivedEnv = { SIGNING_KEY: env.TEST_ARCHIVED_KEY };
    const result = await buildWacz(
      TEST_URL,
      new Date().toISOString(),
      { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
      archivedEnv,
    );

    // Store WACZ in R2
    await env.BUCKET.put(`captures/${result.waczHash}.wacz`, result.waczBytes);

    // Archive the old key in KV (as would happen during normal operation)
    await archiveSigningKey(env.DB, result.keyId, result.publicKeyBase64);

    // Create capture record with the OLD keyId
    await createCapture(env.DB, captureId, TEST_URL, '127.0.0.1', 'default');
    await completeCapture(env.DB, captureId, { screenshot: 's.png', html: 'h.html' }, {
      key: `captures/${result.waczHash}.wacz`,
      bundleHash: result.bundleHash,
      size: result.waczBytes.byteLength,
      keyId: result.keyId,
    });

    // Verify via endpoint -- current SIGNING_KEY is different from the one that
    // signed this WACZ, but the archived key in KV should be used
    const res = await SELF.fetch(`https://worker.test/v1/verify/${captureId}`, {
      headers: { 'Accept': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });
});
