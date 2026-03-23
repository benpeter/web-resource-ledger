/**
 * key-rotation.spec.js -- API key lifecycle e2e tests (admin API)
 *
 * Note: The /v1/account/keys endpoints require session auth (GitHub OAuth cookie),
 * which is not available in e2e tests. This test exercises key lifecycle via the
 * admin API instead. The account-level key management (including the last-key guard)
 * would need session auth support in e2e to test -- see issue backlog.
 *
 * Admin call budget per test:
 *   "creates and revokes API keys via admin API"
 *     POST /v1/admin/keys (1) + DELETE /v1/admin/keys/{hash} (2) = 2 calls
 *   "new key inherits correct scopes"
 *     POST /v1/admin/keys (1) + DELETE /v1/admin/keys/{hash} (2) = 2 calls
 *
 * Total admin calls: 4, well within the 5 req/60s admin rate limit.
 * Tests run serially (no parallelism) to avoid hitting the limit.
 */

// tva
import { test, expect } from '@playwright/test';
import { readAuthState, createAuthenticatedFetch } from './helpers/api-client.js';

test.describe.configure({ mode: 'serial' });

test('creates and revokes API keys via admin API', async () => {
  const { tenantId, apiKey: originalKey, baseUrl } = readAuthState();
  const adminKey = process.env.E2E_ADMIN_KEY;

  if (!adminKey) {
    throw new Error('E2E_ADMIN_KEY environment variable is required for key-rotation test');
  }

  const adminFetch = createAuthenticatedFetch(baseUrl, adminKey);

  let newKeyHash = null;

  try {
    // --- 1. Create a second API key for the test tenant ---
    const createRes = await adminFetch('/v1/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        scopes: ['capture', 'read'],
        name: 'e2e-rotation-test',
      }),
    });

    expect(
      createRes.status,
      `POST /v1/admin/keys should return 201 (got ${createRes.status})`
    ).toBe(201);

    const created = await createRes.json();
    const { key: newKey, keyHash } = created;
    newKeyHash = keyHash;

    expect(typeof newKey, 'created key must be a string').toBe('string');
    expect(newKey.length, 'created key must not be empty').toBeGreaterThan(0);
    expect(typeof newKeyHash, 'keyHash must be a string').toBe('string');
    expect(newKeyHash.length, 'keyHash must not be empty').toBeGreaterThan(0);

    // --- 2. Verify the new key works ---
    const newKeyFetch = createAuthenticatedFetch(baseUrl, newKey);
    const readWithNewKey = await newKeyFetch('/v1/captures');

    expect(
      readWithNewKey.status,
      `GET /v1/captures with new key should return 200 (got ${readWithNewKey.status})`
    ).toBe(200);

    // --- 3. Revoke the new key ---
    const revokeRes = await adminFetch(`/v1/admin/keys/${newKeyHash}`, {
      method: 'DELETE',
    });

    expect(
      [200, 204],
      `DELETE /v1/admin/keys/${newKeyHash} should return 200 or 204 (got ${revokeRes.status})`
    ).toContain(revokeRes.status);

    // Mark as revoked so the finally block skips cleanup
    newKeyHash = null;

    // --- 4. Verify the revoked key is rejected ---
    const readWithRevokedKey = await newKeyFetch('/v1/captures');

    expect(
      readWithRevokedKey.status,
      `GET /v1/captures with revoked key should return 401 (got ${readWithRevokedKey.status}). ` +
      'Revocation did not take effect.'
    ).toBe(401);

    // --- 5. Verify the original key still works ---
    const originalKeyFetch = createAuthenticatedFetch(baseUrl, originalKey);
    const readWithOriginalKey = await originalKeyFetch('/v1/captures');

    expect(
      readWithOriginalKey.status,
      `GET /v1/captures with original key should return 200 after revoking sibling key ` +
      `(got ${readWithOriginalKey.status}). Original key must remain unaffected.`
    ).toBe(200);

  } finally {
    // Cleanup: revoke test key if the test failed before doing so
    if (newKeyHash) {
      const revokeRes = await adminFetch(`/v1/admin/keys/${newKeyHash}`, {
        method: 'DELETE',
      });
      if (!revokeRes.ok) {
        const errBody = await revokeRes.text().catch(() => '');
        console.warn(
          `[key-rotation] WARNING: Failed to revoke test key (hash: ${newKeyHash}) ` +
          `for tenant '${tenantId}' (HTTP ${revokeRes.status}). Manual cleanup may be needed.\n` +
          `Response: ${errBody}`
        );
      } else {
        console.log(`[key-rotation] Test key revoked in cleanup for tenant '${tenantId}'`);
      }
    }
  }
});

test('new key inherits correct scopes', async () => {
  const { tenantId, baseUrl } = readAuthState();
  const adminKey = process.env.E2E_ADMIN_KEY;

  if (!adminKey) {
    throw new Error('E2E_ADMIN_KEY environment variable is required for key-rotation test');
  }

  const adminFetch = createAuthenticatedFetch(baseUrl, adminKey);

  let scopedKeyHash = null;

  try {
    // --- 1. Create a key with capture + read scopes ---
    const createRes = await adminFetch('/v1/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        scopes: ['capture', 'read'],
        name: 'e2e-scope-test',
      }),
    });

    expect(
      createRes.status,
      `POST /v1/admin/keys should return 201 (got ${createRes.status})`
    ).toBe(201);

    const created = await createRes.json();
    const { key: scopedKey, keyHash } = created;
    scopedKeyHash = keyHash;

    expect(typeof scopedKey, 'created key must be a string').toBe('string');

    const scopedFetch = createAuthenticatedFetch(baseUrl, scopedKey);

    // --- 2. Use the key to make a capture request -- assert 202 (has 'capture' scope) ---
    const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const captureRes = await scopedFetch('/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://example.com?e2e-scope-test=${testId}` }),
    });

    expect(
      captureRes.status,
      `POST /v1/captures with scoped key should return 202 (has 'capture' scope). ` +
      `Got ${captureRes.status}. Key may be missing the 'capture' scope.`
    ).toBe(202);

    // --- 3. Use the key to read captures -- assert 200 (has 'read' scope) ---
    const readRes = await scopedFetch('/v1/captures');

    expect(
      readRes.status,
      `GET /v1/captures with scoped key should return 200 (has 'read' scope). ` +
      `Got ${readRes.status}. Key may be missing the 'read' scope.`
    ).toBe(200);

  } finally {
    // --- 4. Cleanup: revoke the scoped test key ---
    if (scopedKeyHash) {
      const revokeRes = await adminFetch(`/v1/admin/keys/${scopedKeyHash}`, {
        method: 'DELETE',
      });
      if (!revokeRes.ok) {
        const errBody = await revokeRes.text().catch(() => '');
        console.warn(
          `[key-rotation] WARNING: Failed to revoke scoped test key (hash: ${scopedKeyHash}) ` +
          `for tenant '${tenantId}' (HTTP ${revokeRes.status}). Manual cleanup may be needed.\n` +
          `Response: ${errBody}`
        );
      } else {
        console.log(`[key-rotation] Scoped test key revoked for tenant '${tenantId}'`);
      }
    }
  }
});
