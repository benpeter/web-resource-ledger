// Integration tests for POST /v1/admin/cache/purge.
// The endpoint calls the Cloudflare cache purge API, which is external.
// These tests validate request validation, auth, and response shaping.
// The actual CF API call goes to the real endpoint but env lacks
// CLOUDFLARE_CACHE_PURGE_TOKEN, so the endpoint returns 503 (not configured).

import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { TEST_ADMIN_KEY } from './fixtures.js';

const ENDPOINT = 'https://worker.test/v1/admin/cache/purge';
const ADMIN_AUTH = `Bearer ${TEST_ADMIN_KEY}`;

let ipCounter = 200;
function nextIp() {
  return `192.0.2.${ipCounter++}`;
}

function purge(body, ip) {
  return SELF.fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: ADMIN_AUTH,
      'CF-Connecting-IP': ip || nextIp(),
    },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('POST /v1/admin/cache/purge -- auth', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify({ targets: ['signing-keys'] }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong admin key', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer wrong-key',
        'CF-Connecting-IP': nextIp(),
      },
      body: JSON.stringify({ targets: ['signing-keys'] }),
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('POST /v1/admin/cache/purge -- validation', () => {
  it('returns 415 without JSON content type', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        Authorization: ADMIN_AUTH,
        'CF-Connecting-IP': nextIp(),
      },
      body: 'not json',
    });
    expect(res.status).toBe(415);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: ADMIN_AUTH,
        'CF-Connecting-IP': nextIp(),
      },
      body: '{broken',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when targets is missing', async () => {
    const res = await purge({});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('targets');
  });

  it('returns 400 when targets is empty array', async () => {
    const res = await purge({ targets: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when targets exceeds 30', async () => {
    const targets = Array.from({ length: 31 }, (_, i) =>
      `capture:cap_${'a'.repeat(32)}`
    );
    const res = await purge({ targets });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('30');
  });

  it('returns 400 for invalid target format', async () => {
    const res = await purge({ targets: ['invalid-target'] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('invalid-target');
  });

  it('accepts signing-keys target', async () => {
    // Will fail with 503 (no purge token) but passes validation
    const res = await purge({ targets: ['signing-keys'] });
    // 503 = passed validation, hit the config check
    expect(res.status).toBe(503);
  });

  it('accepts capture target with valid ID', async () => {
    const res = await purge({ targets: ['capture:cap_abcdef0123456789abcdef0123456789'] });
    expect(res.status).toBe(503);
  });

  it('accepts all target', async () => {
    const res = await purge({ targets: ['all'] });
    expect(res.status).toBe(503);
  });

  it('rejects capture target with wrong ID length', async () => {
    const res = await purge({ targets: ['capture:cap_abc'] });
    expect(res.status).toBe(400);
  });

  it('accepts multiple valid targets', async () => {
    const res = await purge({ targets: ['signing-keys', 'capture:cap_abcdef0123456789abcdef0123456789'] });
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// Config check (no CLOUDFLARE_CACHE_PURGE_TOKEN in test env)
// ---------------------------------------------------------------------------

describe('POST /v1/admin/cache/purge -- config', () => {
  it('returns 503 when CLOUDFLARE_CACHE_PURGE_TOKEN is not set', async () => {
    const res = await purge({ targets: ['signing-keys'] });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.detail).toContain('not configured');
  });
});

// ---------------------------------------------------------------------------
// Method routing
// ---------------------------------------------------------------------------

describe('POST /v1/admin/cache/purge -- method routing', () => {
  it('GET returns 404 (method not matched)', async () => {
    const res = await SELF.fetch(ENDPOINT, {
      headers: {
        Authorization: ADMIN_AUTH,
        'CF-Connecting-IP': nextIp(),
      },
    });
    expect(res.status).toBe(404);
  });
});
