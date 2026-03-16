import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCapture, completeCapture, failCapture } from '../src/kv.js';

const AUTH = 'Bearer test-api-key-for-vitest';
const TENANT_ID = 'default';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listCaptures(query = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString() ? `?${params}` : '';
  return SELF.fetch(`https://worker.test/v1/captures${qs}`, {
    method: 'GET',
    headers: { Authorization: AUTH },
  });
}

async function seedCapture(id, url = 'https://example.com') {
  await createCapture(env.KV, id, url, '1.2.3.4', TENANT_ID);
}

async function seedComplete(id, url = 'https://example.com') {
  await seedCapture(id, url);
  await completeCapture(env.KV, id, {
    screenshot: `captures/${id}/screenshot.png`,
    html: `captures/${id}/page.html`,
    headers: `captures/${id}/headers.json`,
  });
}

async function seedFailed(id, url = 'https://example.com') {
  await seedCapture(id, url);
  await failCapture(env.KV, id, 'render timeout', true);
}

// Wipe all tenant index keys + specific capture keys between tests
beforeEach(async () => {
  const { keys } = await env.KV.list({ prefix: 'tenant:' });
  for (const k of keys) await env.KV.delete(k.name);
  const { keys: captureKeys } = await env.KV.list({ prefix: 'capture:' });
  for (const k of captureKeys) await env.KV.delete(k.name);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- auth', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures');
    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 401 });
  });

  it('returns 401 with wrong API key', async () => {
    const res = await SELF.fetch('https://worker.test/v1/captures', {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe(401);
  });

  it('returns 200 with valid Bearer token (empty list)', async () => {
    const res = await listCaptures();
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Empty results
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- empty results', () => {
  it('returns correct empty envelope', async () => {
    const res = await listCaptures();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({ hasMore: false, cursor: null, limit: 20 });
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- response shape', () => {
  it('returns correct CaptureSummary for complete captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T10:00:00.000Z'));
    await seedCapture('cap_shape1complete1234567890abcde', 'https://example.com/complete');
    vi.setSystemTime(new Date('2024-06-01T10:00:10.000Z'));
    await completeCapture(env.KV, 'cap_shape1complete1234567890abcde', {
      screenshot: 'captures/cap_shape1complete1234567890abcde/screenshot.png',
      html: 'captures/cap_shape1complete1234567890abcde/page.html',
    });

    const res = await listCaptures({ status: 'complete' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const item = body.data[0];
    expect(item.id).toBe('cap_shape1complete1234567890abcde');
    expect(item.status).toBe('complete');
    expect(item.url).toBe('https://example.com/complete');
    expect(item.createdAt).toBe('2024-06-01T10:00:00.000Z');
    expect(item.completedAt).toBe('2024-06-01T10:00:10.000Z');
  });

  it('returns correct shape for failed captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T11:00:00.000Z'));
    await seedCapture('cap_shapefailed12345678901234abcd', 'https://example.com/fail');
    vi.setSystemTime(new Date('2024-06-01T11:00:05.000Z'));
    await failCapture(env.KV, 'cap_shapefailed12345678901234abcd', 'render timeout', true);

    const res = await listCaptures({ status: 'failed' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const item = body.data[0];
    expect(item.id).toBe('cap_shapefailed12345678901234abcd');
    expect(item.status).toBe('failed');
    expect(item.failedAt).toBe('2024-06-01T11:00:05.000Z');
    expect(item.error).toBe('render timeout');
    expect(item.retryable).toBe(true);
    expect(item.completedAt).toBeUndefined();
  });

  it('returns correct shape for pending captures -- no extra fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
    await seedCapture('cap_shapepending1234567890abcdef1');

    const res = await listCaptures({ status: 'pending' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const item = body.data[0];
    expect(item.id).toBe('cap_shapepending1234567890abcdef1');
    expect(item.status).toBe('pending');
    expect(item.completedAt).toBeUndefined();
    expect(item.failedAt).toBeUndefined();
    expect(item.error).toBeUndefined();
  });

  it('does NOT include ip field in any response', async () => {
    await seedComplete('cap_noip01complete1234567890abcde');
    const res = await listCaptures();
    const body = await res.json();
    for (const item of body.data) {
      expect(item).not.toHaveProperty('ip');
    }
  });

  it('does NOT include artifacts or wacz.key in response', async () => {
    await seedComplete('cap_noartifact1complete890abcdef12');
    const res = await listCaptures();
    const body = await res.json();
    for (const item of body.data) {
      expect(item).not.toHaveProperty('artifacts');
      expect(item).not.toHaveProperty('wacz');
    }
  });
});

// ---------------------------------------------------------------------------
// Status filter
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- status filter', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T00:00:00.000Z'));
    await seedComplete('cap_filtercomplete123456789abcdef');
    vi.setSystemTime(new Date('2024-07-01T00:00:01.000Z'));
    await seedFailed('cap_filterfailed1234567890abcdef1');
    vi.setSystemTime(new Date('2024-07-01T00:00:02.000Z'));
    await seedCapture('cap_filterpending123456789abcdef1');
  });

  it('?status=complete returns only complete captures', async () => {
    const res = await listCaptures({ status: 'complete' });
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) expect(item.status).toBe('complete');
  });

  it('?status=pending returns only pending captures', async () => {
    const res = await listCaptures({ status: 'pending' });
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) expect(item.status).toBe('pending');
  });

  it('?status=failed returns only failed captures', async () => {
    const res = await listCaptures({ status: 'failed' });
    const body = await res.json();
    expect(body.data.length).toBeGreaterThan(0);
    for (const item of body.data) expect(item.status).toBe('failed');
  });

  it('?status=invalid returns 400', async () => {
    const res = await listCaptures({ status: 'invalid' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ type: 'about:blank', status: 400 });
    expect(body.detail).toContain('status');
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- pagination', () => {
  it('default limit is 20', async () => {
    const res = await listCaptures();
    const body = await res.json();
    expect(body.pagination.limit).toBe(20);
  });

  it('respects custom limit parameter', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(Date.now() + i * 1000));
      const hex = i.toString(16).padStart(2, '0');
      await seedCapture(`cap_customlimit${hex}3456789012345678901`);
    }

    const res = await listCaptures({ limit: 3 });
    const body = await res.json();
    expect(body.pagination.limit).toBe(3);
    expect(body.data.length).toBeLessThanOrEqual(3);
  });

  it('limit > 100 clamped to 100', async () => {
    const res = await listCaptures({ limit: 999 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.limit).toBe(100);
  });

  it('limit=0 returns 400', async () => {
    const res = await listCaptures({ limit: 0 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.status).toBe(400);
  });

  it('limit=-1 returns 400', async () => {
    const res = await listCaptures({ limit: -1 });
    expect(res.status).toBe(400);
  });

  it('limit=abc returns 400', async () => {
    const res = await listCaptures({ limit: 'abc' });
    expect(res.status).toBe(400);
  });

  it('invalid cursor returns 400', async () => {
    const res = await listCaptures({ cursor: 'not-valid-base64url$$' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain('cursor');
  });

  it('hasMore=true and cursor present when more items exist', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const hex = i.toString(16).padStart(32, '0');
      await seedCapture(`cap_${hex}`);
    }

    const res = await listCaptures({ limit: 2 });
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.cursor).not.toBeNull();
  });

  it('passing cursor returns next page', async () => {
    vi.useFakeTimers();
    const ids = [];
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const hex = i.toString(16).padStart(32, '0');
      const id = `cap_${hex}`;
      ids.push(id);
      await seedCapture(id);
    }

    const page1 = await (await listCaptures({ limit: 2 })).json();
    expect(page1.pagination.hasMore).toBe(true);
    const page1Ids = page1.data.map(d => d.id);

    const page2 = await (await listCaptures({ limit: 2, cursor: page1.pagination.cursor })).json();
    const page2Ids = page2.data.map(d => d.id);

    // No overlap between pages
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  it('final page has hasMore=false and cursor=null', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const hex = i.toString(16).padStart(32, '0');
      await seedCapture(`cap_${hex}`);
    }

    const res = await listCaptures({ limit: 10 });
    const body = await res.json();
    expect(body.data).toHaveLength(3);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.cursor).toBeNull();
  });

  it('CRITICAL: round-trip pagination -- 25 items, 3 pages, all unique, correct order', async () => {
    vi.useFakeTimers();
    const seededIds = [];
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const hex = i.toString(16).padStart(32, '0');
      const id = `cap_${hex}`;
      seededIds.push(id);
      await seedCapture(id);
    }

    const collected = [];
    let cursor;
    let iterations = 0;
    do {
      const query = { limit: 10 };
      if (cursor) query.cursor = cursor;
      const res = await SELF.fetch(
        `https://worker.test/v1/captures?${new URLSearchParams(query)}`,
        { headers: { Authorization: AUTH } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      collected.push(...body.data);
      cursor = body.pagination.cursor;
      iterations++;
      if (iterations > 10) throw new Error('Pagination loop did not terminate');
    } while (cursor);

    // 25 unique items
    expect(collected).toHaveLength(25);
    const uniqueIds = new Set(collected.map(d => d.id));
    expect(uniqueIds.size).toBe(25);

    // Ascending order by createdAt
    for (let i = 1; i < collected.length; i++) {
      expect(collected[i].createdAt >= collected[i - 1].createdAt).toBe(true);
    }

    // All seeded IDs present
    for (const id of seededIds) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- headers', () => {
  it('Cache-Control: private, no-store', async () => {
    const res = await listCaptures();
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('Content-Type: application/json', async () => {
    const res = await listCaptures();
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });
});
