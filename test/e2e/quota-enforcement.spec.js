/**
 * quota-enforcement.spec.js -- P2 quota limit e2e test
 *
 * Validates that capture quota limits are enforced at the API layer.
 * Uses an isolated tenant with capturesPerMonth: 1 to ensure the second
 * capture attempt is rejected with a well-formed 429 response.
 *
 * This test manages its own tenant lifecycle (create + cleanup) rather
 * than using the shared test tenant from global-setup, because it needs
 * a tenant with a quota of 1 that it can exhaust without affecting
 * other test runs.
 *
 * Admin call budget: POST /v1/admin/keys (1) + PUT config (2) + DELETE key (3)
 * = 3 calls, well within the 5 req/60s admin rate limit.
 *
 * Usage counter timing: incrementUsage() runs inside ctx.waitUntil() after
 * the 202 is returned. Polling to terminal state ensures the background
 * usage write has completed before submitting the second capture.
 */

// tva
import { test, expect } from '@playwright/test';
import { createAuthenticatedFetch, pollUntilComplete } from './helpers/api-client.js';

test('enforces capture quota limits', async () => {
  const baseUrl = (process.env.E2E_BASE_URL || 'https://wrl-staging.benpeter.workers.dev').replace(/\/$/, '');
  const adminKey = process.env.E2E_ADMIN_KEY;

  if (!adminKey) {
    throw new Error('E2E_ADMIN_KEY environment variable is required for quota-enforcement test');
  }

  const adminFetch = createAuthenticatedFetch(baseUrl, adminKey);

  // Unique tenant ID so concurrent runs don't collide
  const tenantId = `e2e-quota-${Date.now()}`;
  let quotaKeyHash = null;

  try {
    // --- 1. Create isolated test tenant with quota of 1 ---
    const createRes = await adminFetch('/v1/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        scopes: ['capture', 'read'],
        name: 'quota-enforcement e2e key',
      }),
    });

    expect(
      createRes.status,
      `POST /v1/admin/keys should return 201 (got ${createRes.status})`
    ).toBe(201);

    const created = await createRes.json();
    const { key: quotaApiKey, keyHash } = created;
    quotaKeyHash = keyHash;

    expect(typeof quotaApiKey, 'created key must be a string').toBe('string');
    expect(quotaApiKey.length, 'created key must not be empty').toBeGreaterThan(0);
    expect(typeof quotaKeyHash, 'keyHash must be a string').toBe('string');

    // --- 2. Set capturesPerMonth: 1 on the new tenant ---
    const configRes = await adminFetch(`/v1/admin/tenants/${tenantId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quotas: { capturesPerMonth: 1 },
      }),
    });

    expect(
      configRes.status,
      `PUT /v1/admin/tenants/${tenantId}/config should return 200 (got ${configRes.status})`
    ).toBe(200);

    const tenantFetch = createAuthenticatedFetch(baseUrl, quotaApiKey);

    // --- 3. Submit first capture -- should be accepted (quota: 0/1 used) ---
    const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const captureUrl = `https://example.com?e2e-quota=${testId}`;

    const firstRes = await tenantFetch('/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: captureUrl }),
    });

    expect(
      firstRes.status,
      `First capture POST should return 202 -- quota not yet exhausted (got ${firstRes.status})`
    ).toBe(202);

    const firstCapture = await firstRes.json();
    expect(firstCapture, 'first capture response must have id').toHaveProperty('id');
    const captureId = firstCapture.id;

    // --- 4. Wait for first capture to reach terminal state ---
    // incrementUsage() runs inside ctx.waitUntil() after the 202 is returned.
    // Polling until completion ensures the background usage counter write has
    // finished before the second capture attempt reads the counter.
    await pollUntilComplete(tenantFetch, captureId, 90_000);

    // --- 5. Submit second capture -- should be rejected (quota: 1/1 used) ---
    const secondRes = await tenantFetch('/v1/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://example.com?e2e-quota-second=${testId}` }),
    });

    expect(
      secondRes.status,
      `Second capture POST should return 429 -- quota exhausted (got ${secondRes.status}). ` +
      'This means either the usage counter was not incremented or the quota check is not enforced.'
    ).toBe(429);

    // --- 6. Validate 429 response body structure ---
    const body = await secondRes.json();

    // error.code
    expect(body, '429 response must include error object').toHaveProperty('error');
    expect(
      body.error.code,
      `error.code must be 'capture_limit' (got '${body.error?.code}')`
    ).toBe('capture_limit');

    // quota object
    expect(body, '429 response must include quota object').toHaveProperty('quota');

    expect(
      body.quota.limit,
      `quota.limit must be 1 (got ${body.quota?.limit})`
    ).toBe(1);

    expect(
      body.quota.used,
      `quota.used must be >= 1 (got ${body.quota?.used})`
    ).toBeGreaterThanOrEqual(1);

    expect(
      body.quota.resource,
      `quota.resource must be 'captures' (got '${body.quota?.resource}')`
    ).toBe('captures');

    // resetsAt must be a valid ISO 8601 timestamp in the future
    const resetsAt = body.quota.resetsAt;
    expect(typeof resetsAt, 'quota.resetsAt must be a string').toBe('string');
    const resetsAtMs = Date.parse(resetsAt);
    expect(
      Number.isNaN(resetsAtMs),
      `quota.resetsAt must be a valid ISO timestamp (got '${resetsAt}')`
    ).toBe(false);
    expect(
      resetsAtMs,
      `quota.resetsAt must be in the future (got '${resetsAt}')`
    ).toBeGreaterThan(Date.now());

    // Retry-After header should be present
    const retryAfter = secondRes.headers.get('retry-after');
    expect(
      retryAfter !== null,
      'Retry-After header must be present on 429 response'
    ).toBe(true);

  } finally {
    // --- 7. Cleanup: revoke the quota test key ---
    if (quotaKeyHash) {
      const revokeRes = await adminFetch(`/v1/admin/keys/${quotaKeyHash}`, {
        method: 'DELETE',
      });

      if (!revokeRes.ok) {
        const errBody = await revokeRes.text().catch(() => '');
        console.warn(
          `[quota-enforcement] WARNING: Failed to revoke test key (hash: ${quotaKeyHash}) ` +
          `for tenant '${tenantId}' (HTTP ${revokeRes.status}). Manual cleanup may be needed.\n` +
          `Response: ${errBody}`
        );
      } else {
        console.log(`[quota-enforcement] Test key revoked for tenant '${tenantId}'`);
      }
    }
  }
});
