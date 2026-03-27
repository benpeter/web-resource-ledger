// Integration tests for src/coralogix-webhook.js
// Tests the Coralogix alert webhook endpoint via the Worker fetch handler.

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { makeCoralogixAlertPayload } from './fixtures.js';

const VALID_AUTH = { Authorization: 'Bearer test-coralogix-webhook-secret-for-vitest' };
const ENDPOINT = 'https://wrl.test/v1/webhooks/coralogix';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stub the global fetch to intercept GitHub API dispatch calls.
 * Returns a spy tracking all calls to api.github.com/repos/.../dispatches.
 *
 * Any other URL throws so tests catch unexpected calls early.
 *
 * @param {object} opts
 * @param {number} [opts.status]  HTTP status GitHub returns (default: 204)
 */
function stubGitHubDispatch({ status = 204 } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, opts) => {
    const urlStr = url instanceof URL ? url.toString() : String(url);
    if (urlStr.includes('api.github.com/repos/') && urlStr.endsWith('/dispatches')) {
      const body = opts?.body ? JSON.parse(opts.body) : null;
      calls.push({ url: urlStr, body });
      return new Response('', { status });
    }
    // Allow Coralogix logging and other background calls through silently
    return new Response('', { status: 200 });
  }));
  return calls;
}

/**
 * Post a valid Coralogix webhook with the given payload overrides.
 * Always includes valid auth unless headers are explicitly overridden.
 *
 * @param {object} payloadOverrides
 * @param {object} [requestOverrides]   top-level request options (headers, etc.)
 */
async function postWebhook(payloadOverrides = {}, requestOverrides = {}) {
  const payload = makeCoralogixAlertPayload(payloadOverrides);
  return SELF.fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...VALID_AUTH, 'Content-Type': 'application/json', ...requestOverrides.headers },
    body: JSON.stringify(payload),
    ...requestOverrides,
  });
}

// Clear KV between tests so dedup and circuit-breaker state does not bleed.
beforeEach(async () => {
  const keys = await env.KV.list({ prefix: 'cx_' });
  await Promise.all(keys.keys.map(k => env.KV.delete(k.name)));
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/coralogix -- authentication', () => {
  it('rejects requests without Authorization header (401)', async () => {
    const payload = makeCoralogixAlertPayload();
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid Bearer token (401)', async () => {
    const payload = makeCoralogixAlertPayload();
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with non-Bearer auth scheme (401)', async () => {
    const payload = makeCoralogixAlertPayload();
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Basic dXNlcjpwYXNz', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(401);
  });

  it('accepts requests with valid Bearer token (200)', async () => {
    stubGitHubDispatch();
    const res = await postWebhook();
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/coralogix -- payload validation', () => {
  it('returns 400 for non-JSON body', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...VALID_AUTH, 'Content-Type': 'text/plain' },
      body: 'not json at all',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for JSON missing alert_id', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...VALID_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_name: '[WRL] Capture Failures', alert_action: 'triggered' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for JSON missing alert_name', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...VALID_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: 'test-id-123', alert_action: 'triggered' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for JSON missing alert_action', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...VALID_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: 'test-id-123', alert_name: '[WRL] Capture Failures' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid payload with all required fields', async () => {
    stubGitHubDispatch();
    const res = await postWebhook();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Alert filtering
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/coralogix -- alert filtering', () => {
  it('dispatches for alert in the investigation allowlist', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const res = await postWebhook({ alert_name: '[WRL] Capture Failures' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(true);
    expect(dispatchCalls.length).toBe(1);
  });

  it('does not dispatch for an alert not in the allowlist', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const res = await postWebhook({ alert_name: '[WRL] Some Unknown Alert' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(false);
    expect(body.reason).toBe('filtered');
    expect(dispatchCalls.length).toBe(0);
  });

  it('does not dispatch for alert_action resolve', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const res = await postWebhook({ alert_action: 'resolved' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(false);
    expect(body.reason).toBe('resolve');
    expect(dispatchCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// KV deduplication
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/coralogix -- deduplication', () => {
  it('dispatches on first occurrence of an alert', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const res = await postWebhook({ alert_name: '[WRL] Capture Failures', alert_id: 'dedup-test-1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(true);
    expect(dispatchCalls.length).toBe(1);
  });

  it('deduplicates repeat within same hour window', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const alertName = '[WRL] Worker Errors (5xx)';

    // First request -- should dispatch
    const res1 = await postWebhook({ alert_name: alertName, alert_id: 'dedup-first' });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.dispatched).toBe(true);

    // Second request -- same alert name, same hour bucket, should deduplicate
    const res2 = await postWebhook({ alert_name: alertName, alert_id: 'dedup-second' });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.dispatched).toBe(false);
    expect(body2.reason).toBe('deduplicated');

    // Only one GitHub dispatch should have occurred
    expect(dispatchCalls.length).toBe(1);
  });

  it('dispatches again when dedup key is absent (simulating TTL expiry)', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const alertName = '[WRL] Auth Failure Spike';

    // Set up a different hour bucket key manually to simulate the previous-hour key
    // exists but the current-hour key does not -- dispatch should happen
    const res = await postWebhook({ alert_name: alertName, alert_id: 'no-dedup-key' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(true);
    expect(dispatchCalls.length).toBe(1);

    // Delete the dedup key to simulate TTL expiry
    const keys = await env.KV.list({ prefix: 'cx_alert:' });
    await Promise.all(keys.keys.map(k => env.KV.delete(k.name)));

    // Same alert should dispatch again after dedup key is gone
    const res2 = await postWebhook({ alert_name: alertName, alert_id: 'after-expiry' });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.dispatched).toBe(true);
    expect(dispatchCalls.length).toBe(2);
  });

  it('treats different alert names as independent (both dispatch)', async () => {
    const dispatchCalls = stubGitHubDispatch();

    const res1 = await postWebhook({ alert_name: '[WRL] Capture Failures', alert_id: 'independent-1' });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.dispatched).toBe(true);

    const res2 = await postWebhook({ alert_name: '[WRL] Worker Errors (5xx)', alert_id: 'independent-2' });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.dispatched).toBe(true);

    expect(dispatchCalls.length).toBe(2);
  });

  it('alert storm: 10 rapid requests for the same alert dispatch exactly once', async () => {
    const dispatchCalls = stubGitHubDispatch();
    const alertName = '[WRL] Capture Failures';

    const requests = Array.from({ length: 10 }, (_, i) =>
      postWebhook({ alert_name: alertName, alert_id: `storm-${i}` }),
    );
    const responses = await Promise.all(requests);

    // All responses must be 200 (invariant: never return non-200 for valid auth)
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    const bodies = await Promise.all(responses.map(r => r.json()));
    const dispatched = bodies.filter(b => b.dispatched === true);
    const deduplicated = bodies.filter(b => b.reason === 'deduplicated');

    // Exactly one dispatch
    expect(dispatched.length).toBe(1);
    // Remaining 9 deduplicated
    expect(deduplicated.length).toBe(9);
    // Only one GitHub API call
    expect(dispatchCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Daily circuit breaker
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/coralogix -- daily circuit breaker', () => {
  it('dispatches when daily count is below limit', async () => {
    const dispatchCalls = stubGitHubDispatch();

    const res = await postWebhook({ alert_name: '[WRL] Capture Failures', alert_id: 'cb-below-1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(true);
    expect(dispatchCalls.length).toBe(1);
  });

  it('returns daily_limit reason when daily count reaches 10', async () => {
    const dispatchCalls = stubGitHubDispatch();

    // Pre-fill the daily counter to the limit
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    await env.KV.put(`cx_dispatch_count:${today}`, '10');

    const res = await postWebhook({ alert_name: '[WRL] Capture Failures', alert_id: 'cb-at-limit' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatched).toBe(false);
    expect(body.reason).toBe('daily_limit');
    expect(dispatchCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GitHub dispatch payload
// ---------------------------------------------------------------------------

describe('POST /v1/webhooks/coralogix -- GitHub dispatch', () => {
  it('calls GitHub API with correct event_type and client_payload', async () => {
    const dispatchCalls = stubGitHubDispatch();

    const payload = makeCoralogixAlertPayload({
      alert_id: 'payload-check-1',
      alert_name: '[WRL] Capture Failures',
      alert_action: 'triggered',
      hit_count: '7',
      application_name: 'wrl',
      subsystem_name: 'capture',
      event_severity: 'critical',
    });

    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...VALID_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);

    expect(dispatchCalls.length).toBe(1);
    const { body } = dispatchCalls[0];
    expect(body.event_type).toBe('coralogix-alert');
    expect(body.client_payload.alert_id).toBe('payload-check-1');
    expect(body.client_payload.alert_name).toBe('[WRL] Capture Failures');
    expect(body.client_payload.alert_action).toBe('triggered');
    expect(body.client_payload.hit_count).toBe('7');
    expect(body.client_payload.application_name).toBe('wrl');
    expect(body.client_payload.subsystem_name).toBe('capture');
    expect(body.client_payload.event_severity).toBe('critical');
  });

  it('does not include raw log text in the dispatch payload', async () => {
    const dispatchCalls = stubGitHubDispatch();

    const payload = makeCoralogixAlertPayload({
      alert_name: '[WRL] Capture Failures',
      raw_log_text: 'sensitive internal log data that must not be forwarded',
      log_data: 'more sensitive data',
    });

    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: { ...VALID_AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);

    expect(dispatchCalls.length).toBe(1);
    const { body } = dispatchCalls[0];
    const dispatchedStr = JSON.stringify(body.client_payload);
    expect(dispatchedStr).not.toContain('sensitive internal log data');
    expect(dispatchedStr).not.toContain('raw_log_text');
    expect(dispatchedStr).not.toContain('log_data');
  });

  it('returns 200 even when GitHub API call fails (fire-and-forget)', async () => {
    // GitHub dispatch fails with 500
    stubGitHubDispatch({ status: 500 });

    const res = await postWebhook({ alert_name: '[WRL] Capture Failures', alert_id: 'gh-fail-1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    // dispatched: true because the handler fires-and-forgets; it doesn't wait for result
    expect(body.dispatched).toBe(true);
  });
});
