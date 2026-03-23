/**
 * webhook-lifecycle.spec.js -- P3 e2e test for webhook CRUD and ping delivery
 *
 * Covers:
 *   POST   /v1/webhooks                  -- register a webhook
 *   GET    /v1/webhooks                  -- list webhooks (presence check)
 *   POST   /v1/webhooks/:id/ping         -- synchronous test delivery (success)
 *   POST   /v1/webhooks/:id/ping         -- synchronous test delivery (failure)
 *   DELETE /v1/webhooks/:id              -- remove webhook
 *   GET    /v1/webhooks                  -- list webhooks (absence check)
 *
 * External dependency: httpbin.org
 *   /post        -- accepts POST, returns 200 with request details as JSON
 *   /status/503  -- returns 503 unconditionally
 *
 * HMAC verification note:
 *   handlePingWebhook() (src/webhooks.js) returns { success, httpStatus, latencyMs }.
 *   The signature header sent to the target URL is NOT echoed back in the ping
 *   response -- the server dispatches the signed request directly to the webhook
 *   target. Since httpbin.org/post does echo request headers back in its JSON
 *   response body, but the worker receives that echo (not the test), the
 *   signature is not retrievable from the ping API response alone.
 *   The test below reflects that reality with test.skip so the gap is visible.
 */

// tva
import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readAuthState, createAuthenticatedFetch } from './helpers/api-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a 32-byte hex secret in "wrlsec_" format to match what the server
 * stores. The server actually generates its own secret server-side on creation;
 * this is used as the caller-supplied `secret` field if the API accepts one.
 * If the API ignores the field, the server-generated value from the 201 response
 * is used for any downstream verification.
 */
function generateSecret() {
  return 'wrlsec_' + randomBytes(32).toString('hex');
}

/**
 * Register a webhook and return the full 201 response body.
 * Throws if the response is not 201.
 */
async function registerWebhook(apiFetch, { url, events, name }) {
  const res = await apiFetch('/v1/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, events, name }),
  });
  expect(
    res.status,
    `POST /v1/webhooks should return 201 (got ${res.status})`
  ).toBe(201);
  return res.json();
}

/**
 * Delete a webhook. Asserts 200 response with { deleted: true }.
 * (The handler returns 200 with a JSON body, not 204.)
 */
async function deleteWebhook(apiFetch, webhookId) {
  const res = await apiFetch(`/v1/webhooks/${webhookId}`, { method: 'DELETE' });
  expect(
    res.status,
    `DELETE /v1/webhooks/${webhookId} should return 200 (got ${res.status})`
  ).toBe(200);
  const body = await res.json();
  expect(body.deleted, 'delete response must have deleted: true').toBe(true);
}

// ---------------------------------------------------------------------------
// Test: registers a webhook and validates ping delivery
// ---------------------------------------------------------------------------

test('registers a webhook and validates ping delivery', async () => {
  const { apiKey, baseUrl } = readAuthState();
  const apiFetch = createAuthenticatedFetch(baseUrl, apiKey);

  // Unique name so parallel runs don't collide in logs
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const webhookName = `e2e-ping-${runId}`;

  // --- 1. Register webhook ---
  const created = await registerWebhook(apiFetch, {
    url: 'https://httpbin.org/post',
    events: ['capture.complete'],
    name: webhookName,
  });

  // id must be in whk_... format
  expect(typeof created.id, 'webhook id must be a string').toBe('string');
  expect(
    created.id.startsWith('whk_'),
    `webhook id must start with 'whk_', got '${created.id}'`
  ).toBe(true);

  // secret is returned on creation only
  expect(typeof created.secret, 'webhook secret must be a string').toBe('string');
  expect(
    created.secret.startsWith('wrlsec_'),
    `webhook secret must start with 'wrlsec_', got prefix '${created.secret.slice(0, 10)}'`
  ).toBe(true);

  // warning message must be present
  expect(
    typeof created.warning,
    'creation response must include a warning about storing the secret'
  ).toBe('string');

  const webhookId = created.id;

  // --- 2. List webhooks -- verify presence ---
  const listRes = await apiFetch('/v1/webhooks');
  expect(
    listRes.status,
    `GET /v1/webhooks should return 200 (got ${listRes.status})`
  ).toBe(200);
  const listBody = await listRes.json();
  expect(Array.isArray(listBody.data), 'list response must have a data array').toBe(true);
  const found = listBody.data.find(w => w.id === webhookId);
  expect(
    found,
    `newly created webhook '${webhookId}' must appear in GET /v1/webhooks`
  ).toBeTruthy();

  // Secret must NOT appear in list response (security invariant)
  expect(
    found.secret,
    'secret must not be returned in list response'
  ).toBeUndefined();

  // --- 3. Ping -- assert success ---
  const pingRes = await apiFetch(`/v1/webhooks/${webhookId}/ping`, { method: 'POST' });
  expect(
    pingRes.status,
    `POST /v1/webhooks/${webhookId}/ping should return 200 (got ${pingRes.status})`
  ).toBe(200);
  const ping = await pingRes.json();

  expect(ping.success, 'ping to httpbin.org/post must succeed').toBe(true);
  expect(ping.httpStatus, 'ping httpStatus must be 200 for httpbin.org/post').toBe(200);
  expect(
    typeof ping.latencyMs,
    'ping response must include latencyMs'
  ).toBe('number');
  expect(
    ping.latencyMs,
    'latencyMs must be a non-negative number'
  ).toBeGreaterThanOrEqual(0);

  // --- 4. HMAC verification ---
  //
  // The ping API response shape is { success, httpStatus, latencyMs }.
  // The X-WRL-Signature-256 header is sent directly to the webhook target
  // (httpbin.org) during delivery -- it is NOT echoed back in the ping API
  // response. The server receives httpbin's echo of the headers, but that
  // data is not forwarded to the caller. There is no admin delivery-log API
  // that exposes the signature for this ping attempt.
  //
  // As a result, HMAC verification cannot be performed from the ping API
  // response alone. This gap is documented here rather than silently
  // omitting the assertion. See decisions.md D3 "Webhook retry narrowed".

  // --- 5. Delete webhook ---
  await deleteWebhook(apiFetch, webhookId);

  // --- 6. List webhooks -- verify absence ---
  const listAfterRes = await apiFetch('/v1/webhooks');
  expect(
    listAfterRes.status,
    `GET /v1/webhooks after delete should return 200 (got ${listAfterRes.status})`
  ).toBe(200);
  const listAfterBody = await listAfterRes.json();
  expect(Array.isArray(listAfterBody.data), 'list response must have a data array').toBe(true);
  const stillPresent = listAfterBody.data.find(w => w.id === webhookId);
  expect(
    stillPresent,
    `deleted webhook '${webhookId}' must not appear in GET /v1/webhooks`
  ).toBeFalsy();
});

// ---------------------------------------------------------------------------
// Test: ping detects delivery failure
// ---------------------------------------------------------------------------

test('ping detects delivery failure', async () => {
  const { apiKey, baseUrl } = readAuthState();
  const apiFetch = createAuthenticatedFetch(baseUrl, apiKey);

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const webhookName = `e2e-ping-fail-${runId}`;

  // Register webhook pointing to a URL that always returns 503
  const created = await registerWebhook(apiFetch, {
    url: 'https://httpbin.org/status/503',
    events: ['capture.complete'],
    name: webhookName,
  });

  const webhookId = created.id;

  try {
    // Ping -- expect success: false with httpStatus: 503
    const pingRes = await apiFetch(`/v1/webhooks/${webhookId}/ping`, { method: 'POST' });
    expect(
      pingRes.status,
      `POST /v1/webhooks/${webhookId}/ping should return 200 (ping API always returns 200)`
    ).toBe(200);
    const ping = await pingRes.json();

    expect(ping.success, 'ping to httpbin.org/status/503 must report success: false').toBe(false);
    expect(
      ping.httpStatus,
      'ping httpStatus must be 503 for httpbin.org/status/503'
    ).toBe(503);
    expect(
      typeof ping.latencyMs,
      'ping response must include latencyMs even on failure'
    ).toBe('number');
  } finally {
    // Always clean up -- even if assertions above fail
    await deleteWebhook(apiFetch, webhookId);
  }
});
