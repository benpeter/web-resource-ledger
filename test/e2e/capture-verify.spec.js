/**
 * capture-verify.spec.js -- P0 golden path e2e test
 *
 * Validates the complete capture-through-download journey:
 *   POST /v1/captures -> poll status -> GET detail -> GET download
 *
 * Requires global-setup to have run (test/e2e/.auth-state.json present).
 * Expects real Cloudflare Browser Rendering -- allow 10-30s for completion.
 */

// tva
import { test, expect } from '@playwright/test';
import {
  readAuthState,
  createAuthenticatedFetch,
  pollUntilComplete,
} from './helpers/api-client.js';

test('captures a URL and verifies the result', async () => {
  const { apiKey, baseUrl } = readAuthState();
  const apiFetch = createAuthenticatedFetch(baseUrl, apiKey);

  // Unique URL so concurrent runs don't collide and captures are identifiable
  // in staging logs.
  const testId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const captureUrl = `https://example.com?e2e=${testId}`;

  // --- 1. Submit capture ---
  const submitRes = await apiFetch('/v1/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: captureUrl }),
  });

  expect(
    submitRes.status,
    `POST /v1/captures should return 202 (got ${submitRes.status})`
  ).toBe(202);

  const submitted = await submitRes.json();

  expect(submitted, 'capture response must have an id field').toHaveProperty('id');
  const captureId = submitted.id;
  expect(typeof captureId, 'capture id must be a string').toBe('string');
  expect(captureId.length, 'capture id must not be empty').toBeGreaterThan(0);

  // --- 2. Poll until complete (real browser rendering -- up to 60s) ---
  const pollResult = await pollUntilComplete(apiFetch, captureId, 60_000);

  expect(
    pollResult.status,
    `capture '${captureId}' must reach 'complete', got '${pollResult.status}'. ` +
    'Check staging worker logs for this capture ID.'
  ).toBe('complete');

  // --- 3. Fetch capture detail ---
  const detailRes = await apiFetch(`/v1/captures/${captureId}`);

  expect(
    detailRes.status,
    `GET /v1/captures/${captureId} should return 200 (got ${detailRes.status})`
  ).toBe(200);

  const detail = await detailRes.json();

  // Core fields
  expect(detail, 'detail must include url').toHaveProperty('url');
  expect(detail.url, 'url must match the submitted URL').toBe(captureUrl);

  expect(detail, 'detail must include status').toHaveProperty('status');
  expect(detail.status, 'detail status must be complete').toBe('complete');

  // Verification
  expect(detail, 'detail must include verification object').toHaveProperty('verification');
  expect(detail.verification.verified, 'verification.verified must be true').toBe(true);
  expect(
    Array.isArray(detail.verification.checks),
    'verification.checks must be an array'
  ).toBe(true);
  expect(
    detail.verification.checks.length,
    'verification.checks must contain at least one check'
  ).toBeGreaterThan(0);

  // WACZ storage
  expect(detail, 'detail must include wacz object').toHaveProperty('wacz');
  expect(detail.wacz, 'wacz must have a key field').toHaveProperty('key');
  expect(
    typeof detail.wacz.key,
    'wacz.key must be a string'
  ).toBe('string');
  expect(
    detail.wacz.key.length,
    'wacz.key must not be empty'
  ).toBeGreaterThan(0);

  // --- 4. Download the WACZ archive (validates R2 storage end-to-end) ---
  const downloadRes = await apiFetch(`/v1/captures/${captureId}/download`);

  expect(
    downloadRes.status,
    `GET /v1/captures/${captureId}/download should return 200 (got ${downloadRes.status})`
  ).toBe(200);

  const contentType = downloadRes.headers.get('content-type') ?? '';
  expect(
    contentType === 'application/wacz' || contentType.startsWith('application/octet-stream'),
    `Content-Type must be application/wacz or application/octet-stream, got '${contentType}'`
  ).toBe(true);

  const contentLength = Number(downloadRes.headers.get('content-length') ?? 0);
  // Not all responses include Content-Length (chunked transfer or redirect body),
  // so we check the actual body size as the authoritative measure.
  const body = await downloadRes.arrayBuffer();
  expect(
    body.byteLength,
    'downloaded WACZ must have non-zero content'
  ).toBeGreaterThan(0);

  // If Content-Length was provided it should agree with the actual body.
  if (contentLength > 0) {
    expect(
      body.byteLength,
      `body size (${body.byteLength}) must match Content-Length (${contentLength})`
    ).toBe(contentLength);
  }
});
