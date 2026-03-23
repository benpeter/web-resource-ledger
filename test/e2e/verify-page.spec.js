/**
 * verify-page.spec.js -- Public evidence verification e2e tests
 *
 * Validates that the /v1/verify/{captureId} endpoint serves both a browser-
 * renderable HTML page and a JSON API response without any authentication.
 * This is the only spec in the suite that requires a real Chromium browser.
 *
 * The ID-as-secret model means knowing the capture ID grants read access.
 * These tests exercise that contract from the perspective of a third-party
 * consumer who received a capture link and wants to confirm authenticity.
 */

import { test, expect } from '@playwright/test';
import { readAuthState, createAuthenticatedFetch, pollUntilComplete } from './helpers/api-client.js';

// ---------------------------------------------------------------------------
// Shared capture: created once in beforeAll, reused across all three tests.
// Creating a capture takes 30-60s (headless browser round-trip to staging),
// so we pay that cost once rather than once per test.
// ---------------------------------------------------------------------------

let captureId;

test.beforeAll(async () => {
  const { baseUrl, apiKey } = readAuthState();
  const apiFetch = createAuthenticatedFetch(baseUrl, apiKey);

  const createRes = await apiFetch('/v1/captures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(
      `verify-page.spec.js: failed to create capture in beforeAll ` +
      `(HTTP ${createRes.status}). Response: ${body}`
    );
  }

  const created = await createRes.json();
  captureId = created.id;

  // Wait for the capture to reach a terminal state before any tests run.
  // Timeout: 120s -- captures are real headless-browser jobs; CI can be slow.
  const status = await pollUntilComplete(apiFetch, captureId, 120_000);

  if (status.status !== 'complete') {
    throw new Error(
      `verify-page.spec.js: capture '${captureId}' finished with status ` +
      `'${status.status}' (expected 'complete'). Verification tests cannot run.`
    );
  }
});

// ---------------------------------------------------------------------------
// Test 1: Browser rendering (the only test that needs Chromium)
// ---------------------------------------------------------------------------

test('serves public verification page without authentication', async ({ page }) => {
  const { baseUrl } = readAuthState();
  const verifyUrl = `${baseUrl}/v1/verify/${captureId}`;

  // Collect console errors emitted by the page's own JavaScript.
  // Playwright records these; we assert none were thrown after navigation.
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Navigate without any auth headers -- the verify page is fully public.
  const response = await page.goto(verifyUrl);

  // The server must respond with 200.
  expect(response.status(), `GET ${verifyUrl} should return 200`).toBe(200);

  // The page's JS fetches verification data and renders it. Wait for the
  // result content to become visible (the loading spinner hides it until ready).
  // The class name `.result-content.visible` is set once data has loaded.
  await page.waitForSelector('.result-content.visible', { timeout: 15_000 });

  // The page must show either "Verified" or "Not Verified" in the status banner.
  // We accept either outcome -- the test validates page function, not capture result.
  const statusHeading = page.locator('.status-heading');
  await expect(statusHeading).toBeVisible();
  const headingText = await statusHeading.textContent();
  expect(
    headingText.toLowerCase().includes('verified'),
    `Status heading "${headingText}" should contain "verified"`
  ).toBe(true);

  // The capture URL should appear on the page (linked in the metadata section).
  // example.com is what we captured; assert the text appears somewhere in the page.
  await expect(page.getByText('example.com', { exact: false })).toBeVisible();

  // No JavaScript errors should have been thrown by the page's own code.
  expect(
    consoleErrors,
    `Page produced console errors: ${consoleErrors.join('; ')}`
  ).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Test 2: JSON API (fetch-based, no browser needed)
// ---------------------------------------------------------------------------

test('returns JSON verification without authentication', async ({ request }) => {
  const { baseUrl } = readAuthState();

  // Explicitly request JSON. No Authorization header -- this is a public endpoint.
  const res = await request.get(`${baseUrl}/v1/verify/${captureId}`, {
    headers: { 'Accept': 'application/json' },
  });

  expect(res.status(), 'verify JSON endpoint should return 200').toBe(200);

  const body = await res.json();

  // Core verification outcome
  expect(body.verified, 'verified should be a boolean').toBe(true);

  // checks array must be present and non-empty
  expect(Array.isArray(body.checks), 'checks should be an array').toBe(true);
  expect(body.checks.length, 'checks array should be non-empty').toBeGreaterThan(0);

  // signing object must carry the public key used for verification
  expect(body.signing, 'signing object should be present').not.toBeNull();
  expect(typeof body.signing.publicKey, 'signing.publicKey should be a string').toBe('string');
  expect(body.signing.publicKey.length, 'signing.publicKey should be non-empty').toBeGreaterThan(0);

  // CORS: the header must be present so third-party pages can fetch this endpoint
  const corsHeader = res.headers()['access-control-allow-origin'];
  expect(corsHeader, 'Access-Control-Allow-Origin header should be *').toBe('*');
});

// ---------------------------------------------------------------------------
// Test 3: 404 for non-existent capture
// ---------------------------------------------------------------------------

test('returns 404 for nonexistent capture', async ({ request }) => {
  const { baseUrl } = readAuthState();

  // Use a syntactically valid capture ID that cannot exist in the database.
  // The route pattern requires cap_[a-f0-9]{32}; we satisfy the pattern so the
  // handler fires and performs the DB lookup (rather than the router returning
  // a generic 404 for an unmatched path).
  const res = await request.get(
    `${baseUrl}/v1/verify/cap_0000000000000000000000000000dead`,
    { headers: { 'Accept': 'application/json' } }
  );

  expect(res.status(), 'nonexistent capture should return 404').toBe(404);
});
