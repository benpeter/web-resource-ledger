/**
 * batch-capture.spec.js -- P2 batch endpoint e2e test
 *
 * Validates POST /v1/captures/batch: accepts multiple URLs in a single
 * request, returns 207 multi-status with per-item IDs, and all captures
 * complete with verified results.
 *
 * Two URLs only -- each takes 10-30s of real browser rendering time, so
 * keeping the count minimal avoids unnecessary quota and latency.
 *
 * Requires global-setup to have run (test/e2e/.auth-state.json present).
 */

// tva
import { test, expect } from '@playwright/test';
import {
  readAuthState,
  createAuthenticatedFetch,
  pollUntilComplete,
} from './helpers/api-client.js';

// Batch captures run serially through the queue -- allow enough time for
// two full browser renders plus queue wait.
test.setTimeout(180_000);

test('submits a batch of URLs and all complete', async () => {
  const { apiKey, baseUrl } = readAuthState();
  const apiFetch = createAuthenticatedFetch(baseUrl, apiKey);

  // Unique suffix per run so captures are identifiable in logs and don't
  // collide with parallel test runs.
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const urls = [
    `https://example.com?e2e=batch1-${ts}`,
    `https://example.com?e2e=batch2-${ts}`,
  ];

  // --- 1. Submit batch ---
  // API expects { urls: [{ url: "..." }, ...] }, not plain strings
  const submitRes = await apiFetch('/v1/captures/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: urls.map(url => ({ url })) }),
  });

  expect(
    submitRes.status,
    `POST /v1/captures/batch should return 207 (got ${submitRes.status})`
  ).toBe(207);

  const submitted = await submitRes.json();

  // --- 2. Validate batch response structure ---
  expect(
    Array.isArray(submitted.items),
    'batch response must have an items array'
  ).toBe(true);

  expect(
    submitted.items.length,
    `items array must contain ${urls.length} entries (one per submitted URL)`
  ).toBe(urls.length);

  for (const [i, item] of submitted.items.entries()) {
    expect(item, `items[${i}] must have an id field`).toHaveProperty('id');
    expect(
      typeof item.id,
      `items[${i}].id must be a string`
    ).toBe('string');
    expect(
      item.id.length,
      `items[${i}].id must not be empty`
    ).toBeGreaterThan(0);

    expect(item, `items[${i}] must have a status field`).toHaveProperty('status');
  }

  const captureIds = submitted.items.map(item => item.id);

  // --- 3. Poll all captures in parallel until terminal ---
  // Both captures run through the real queue -- poll them concurrently so
  // total wait is bounded by the slowest capture, not the sum.
  const pollResults = await Promise.all(
    captureIds.map(id => pollUntilComplete(apiFetch, id, 150_000))
  );

  // --- 4. Assert every capture completed successfully ---
  for (const [i, result] of pollResults.entries()) {
    expect(
      result.status,
      `capture '${captureIds[i]}' must reach 'complete', got '${result.status}'. ` +
      'Check staging worker logs for this capture ID.'
    ).toBe('complete');
  }

  // --- 5. Verify each capture via GET /v1/verify/{id} ---
  for (const [i, captureId] of captureIds.entries()) {
    const verifyRes = await apiFetch(`/v1/verify/${captureId}`, {
      headers: { Accept: 'application/json' },
    });

    expect(
      verifyRes.status,
      `GET /v1/verify/${captureId} should return 200 (got ${verifyRes.status})`
    ).toBe(200);

    const verification = await verifyRes.json();

    expect(
      verification.verified,
      `capture '${captureId}' (batch index ${i}) must have verified: true`
    ).toBe(true);
  }
});
