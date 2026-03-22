import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCapture, completeCapture, failCapture } from '../src/db.js';
import { cleanDb } from './fixtures.js';

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
  await createCapture(env.DB, id, url, '1.2.3.4', TENANT_ID);
}

async function seedComplete(id, url = 'https://example.com') {
  await seedCapture(id, url);
  await completeCapture(env.DB, id, {
    screenshot: `captures/${id}/screenshot.png`,
    html: `captures/${id}/page.html`,
    headers: `captures/${id}/headers.json`,
  });
}

async function seedFailed(id, url = 'https://example.com') {
  await seedCapture(id, url);
  await failCapture(env.DB, id, 'render timeout', true);
}

// Clean all metadata tables between tests
beforeEach(async () => {
  await cleanDb(env.DB);
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
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.limit).toBe(20);
    expect(body.pagination.total).toBe(0);
    expect(body.pagination.offset).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- response shape', () => {
  it('returns correct CaptureSummary for complete captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T10:00:00.000Z'));
    await seedCapture('cap_5a9e00010000000000000000000000a1', 'https://example.com/complete');
    vi.setSystemTime(new Date('2024-06-01T10:00:10.000Z'));
    await completeCapture(env.DB, 'cap_5a9e00010000000000000000000000a1', {
      screenshot: 'captures/cap_5a9e00010000000000000000000000a1/screenshot.png',
      html: 'captures/cap_5a9e00010000000000000000000000a1/page.html',
    });

    const res = await listCaptures({ status: 'complete' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const item = body.data[0];
    expect(item.id).toBe('cap_5a9e00010000000000000000000000a1');
    expect(item.status).toBe('complete');
    expect(item.url).toBe('https://example.com/complete');
    expect(item.createdAt).toBe('2024-06-01T10:00:00.000Z');
    expect(item.completedAt).toBe('2024-06-01T10:00:10.000Z');
  });

  it('returns correct shape for failed captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T11:00:00.000Z'));
    await seedCapture('cap_fa11ed010000000000000000000000b1', 'https://example.com/fail');
    vi.setSystemTime(new Date('2024-06-01T11:00:05.000Z'));
    await failCapture(env.DB, 'cap_fa11ed010000000000000000000000b1', 'render timeout', true);

    const res = await listCaptures({ status: 'failed' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const item = body.data[0];
    expect(item.id).toBe('cap_fa11ed010000000000000000000000b1');
    expect(item.status).toBe('failed');
    expect(item.failedAt).toBe('2024-06-01T11:00:05.000Z');
    expect(item.error).toBe('render timeout');
    expect(item.retryable).toBe(true);
    expect(item.completedAt).toBeUndefined();
  });

  it('returns correct shape for pending captures -- no extra fields', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T12:00:00.000Z'));
    await seedCapture('cap_9e9d000100000000000000000000c001');

    const res = await listCaptures({ status: 'pending' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    const item = body.data[0];
    expect(item.id).toBe('cap_9e9d000100000000000000000000c001');
    expect(item.status).toBe('pending');
    expect(item.completedAt).toBeUndefined();
    expect(item.failedAt).toBeUndefined();
    expect(item.error).toBeUndefined();
  });

  it('does NOT include ip field in any response', async () => {
    await seedComplete('cap_901900001e000000000000000000d001');
    const res = await listCaptures();
    const body = await res.json();
    for (const item of body.data) {
      expect(item).not.toHaveProperty('ip');
    }
  });

  it('does NOT include artifacts or wacz.key in response', async () => {
    await seedComplete('cap_0a1a0001000000000000000000000e01');
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
    await seedComplete('cap_f11c001e000000000000000000000001');
    vi.setSystemTime(new Date('2024-07-01T00:00:01.000Z'));
    await seedFailed('cap_f11fa11e000000000000000000000001');
    vi.setSystemTime(new Date('2024-07-01T00:00:02.000Z'));
    await seedCapture('cap_f119e9d1000000000000000000000001');
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
// Pagination (offset-based)
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
      const hex = i.toString(16).padStart(32, '0');
      await seedCapture(`cap_${hex}`);
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

  it('hasMore=true when more items exist', async () => {
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
    expect(body.pagination.total).toBe(5);
  });

  it('offset=2 skips first 2 rows', async () => {
    vi.useFakeTimers();
    const ids = [];
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const hex = i.toString(16).padStart(32, '0');
      const id = `cap_${hex}`;
      ids.push(id);
      await seedCapture(id);
    }

    const page1 = await (await listCaptures({ limit: 2, offset: 0, sort: 'created_at' })).json();
    const page2 = await (await listCaptures({ limit: 2, offset: 2, sort: 'created_at' })).json();
    const page1Ids = page1.data.map(d => d.id);
    const page2Ids = page2.data.map(d => d.id);

    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
  });

  it('final page has hasMore=false', async () => {
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
    expect(body.pagination.total).toBe(3);
  });

  it('total count reflects complete result set regardless of limit', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 25; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const hex = i.toString(16).padStart(32, '0');
      await seedCapture(`cap_${hex}`);
    }

    const res = await listCaptures({ limit: 5 });
    const body = await res.json();
    expect(body.pagination.total).toBe(25);
    expect(body.data).toHaveLength(5);
    expect(body.pagination.hasMore).toBe(true);
  });

  it('CRITICAL: full offset pagination -- 25 items, 3 pages, all unique', async () => {
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
    let offset = 0;
    const limit = 10;
    let iterations = 0;
    let hasMore = true;
    while (hasMore) {
      const res = await SELF.fetch(
        `https://worker.test/v1/captures?${new URLSearchParams({ limit, offset, sort: 'created_at' })}`,
        { headers: { Authorization: AUTH } },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      collected.push(...body.data);
      hasMore = body.pagination.hasMore;
      offset += body.data.length;
      iterations++;
      if (iterations > 10) throw new Error('Pagination loop did not terminate');
    }

    expect(collected).toHaveLength(25);
    const uniqueIds = new Set(collected.map(d => d.id));
    expect(uniqueIds.size).toBe(25);

    // Ascending order by createdAt (sort=created_at)
    for (let i = 1; i < collected.length; i++) {
      expect(collected[i].createdAt >= collected[i - 1].createdAt).toBe(true);
    }

    for (const id of seededIds) {
      expect(uniqueIds.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Sort parameter
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- sort parameter', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const id = `cap_50e1${i.toString(16).padStart(28, '0')}`;
      await seedCapture(id);
    }
  });

  it('default sort is newest-first (-created_at)', async () => {
    const res = await listCaptures();
    const body = await res.json();
    const dates = body.data.map(d => d.createdAt);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
  });

  it('?sort=-created_at returns newest-first', async () => {
    const res = await listCaptures({ sort: '-created_at' });
    const body = await res.json();
    const dates = body.data.map(d => d.createdAt);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] <= dates[i - 1]).toBe(true);
    }
  });

  it('?sort=created_at returns oldest-first', async () => {
    const res = await listCaptures({ sort: 'created_at' });
    const body = await res.json();
    const dates = body.data.map(d => d.createdAt);
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// URL filter
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- url filter', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-01T00:00:00.000Z'));
    await seedCapture('cap_ee110001aaaaaaaaaaaaaaaaaaaaaa01', 'https://example.com/page1');
    vi.setSystemTime(new Date('2024-09-01T00:00:01.000Z'));
    await seedCapture('cap_ee110002aaaaaaaaaaaaaaaaaaaaaa02', 'https://other.org/page2');
  });

  it('?url=https://example.com filters to matching prefix', async () => {
    const res = await listCaptures({ url: 'https://example.com' });
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].url).toContain('example.com');
  });

  it('?url= with less than 4 chars returns 400', async () => {
    const res = await listCaptures({ url: 'abc' });
    expect(res.status).toBe(400);
  });

  it('?url= with exactly 4 chars is accepted', async () => {
    const res = await listCaptures({ url: 'http' });
    expect(res.status).toBe(200);
  });

  it('url filter combined with status filter', async () => {
    await completeCapture(env.DB, 'cap_ee110001aaaaaaaaaaaaaaaaaaaaaa01', {
      screenshot: 'captures/cap_ee110001aaaaaaaaaaaaaaaaaaaaaa01/screenshot.png',
      html: 'captures/cap_ee110001aaaaaaaaaaaaaaaaaaaaaa01/page.html',
    });
    const res = await listCaptures({ url: 'https://example.com', status: 'complete', sort: 'created_at' });
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe('complete');
    expect(body.data[0].url).toContain('example.com');
  });
});

// ---------------------------------------------------------------------------
// Date range filters
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- date range filters', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-10-01T00:00:00.000Z'));
    await seedCapture('cap_da1e000100000000aaaaaaaaaaaaa001', 'https://example.com');
    vi.setSystemTime(new Date('2024-10-02T00:00:00.000Z'));
    await seedCapture('cap_da1e000200000000aaaaaaaaaaaaa002', 'https://example.com');
    vi.setSystemTime(new Date('2024-10-03T00:00:00.000Z'));
    await seedCapture('cap_da1e000300000000aaaaaaaaaaaaa003', 'https://example.com');
  });

  it('?created_after filters to captures after given date', async () => {
    const res = await listCaptures({ created_after: '2024-10-01T12:00:00.000Z' });
    const body = await res.json();
    for (const item of body.data) {
      expect(item.createdAt > '2024-10-01T12:00:00.000Z').toBe(true);
    }
    expect(body.data.length).toBe(2);
  });

  it('?created_before filters to captures before given date', async () => {
    const res = await listCaptures({ created_before: '2024-10-02T12:00:00.000Z' });
    const body = await res.json();
    for (const item of body.data) {
      expect(item.createdAt < '2024-10-02T12:00:00.000Z').toBe(true);
    }
    // 2024-10-01 and 2024-10-02T00:00 are both before 2024-10-02T12:00
    expect(body.data.length).toBe(2);
  });

  it('combined created_after and created_before filters correctly', async () => {
    const res = await listCaptures({
      created_after: '2024-10-01T12:00:00.000Z',
      created_before: '2024-10-02T12:00:00.000Z',
    });
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].createdAt).toBe('2024-10-02T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Combined filters
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- combined filters', () => {
  it('status + url + sort work together', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-11-01T00:00:00.000Z'));
    await seedCapture('cap_c01b000100000000000000000000aa01', 'https://example.com/combo');
    await completeCapture(env.DB, 'cap_c01b000100000000000000000000aa01', {
      screenshot: 'captures/cap_c01b000100000000000000000000aa01/screenshot.png',
      html: 'captures/cap_c01b000100000000000000000000aa01/page.html',
    });
    vi.setSystemTime(new Date('2024-11-01T00:00:01.000Z'));
    await seedCapture('cap_c01b000200000000000000000000aa02', 'https://other.com');
    await completeCapture(env.DB, 'cap_c01b000200000000000000000000aa02', {
      screenshot: 'captures/cap_c01b000200000000000000000000aa02/screenshot.png',
      html: 'captures/cap_c01b000200000000000000000000aa02/page.html',
    });

    const res = await listCaptures({ status: 'complete', url: 'https://example.com', sort: 'created_at' });
    const body = await res.json();
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe('complete');
    expect(body.data[0].url).toContain('example.com');
  });

  it('?offset=0&limit=5 returns correct pagination envelope', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 8; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const id = `cap_0ff5e1${i.toString(16).padStart(26, '0')}`;
      await seedCapture(id);
    }
    const res = await listCaptures({ offset: 0, limit: 5 });
    const body = await res.json();
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.limit).toBe(5);
    expect(body.pagination.total).toBe(8);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.data).toHaveLength(5);
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

// ---------------------------------------------------------------------------
// GET /v1/captures -- X-RateLimit headers
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- X-RateLimit headers', () => {
  it('returns X-RateLimit-Limit: 10', async () => {
    const res = await listCaptures();
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
  });
});

// ---------------------------------------------------------------------------
// GET /v1/captures -- renderQuality in CaptureSummary
// ---------------------------------------------------------------------------

describe('GET /v1/captures -- renderQuality in CaptureSummary', () => {
  it('list response includes renderQuality for partial captures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-08-01T10:00:00.000Z'));
    const partialId = 'cap_9a1a11a100000000000000000000001a';
    await createCapture(env.DB, partialId, 'https://example.com/partial', '1.2.3.4', TENANT_ID);
    vi.setSystemTime(new Date('2024-08-01T10:00:10.000Z'));
    await completeCapture(env.DB, partialId, {
      screenshot: `captures/${partialId}/screenshot.png`,
      html: `captures/${partialId}/rendered.html`,
    }, null, 'partial', { waitUntilReached: 'domcontentloaded', timedOut: true, durationMs: 25000 });

    const res = await listCaptures({ status: 'complete' });
    expect(res.status).toBe(200);
    const body = await res.json();
    const item = body.data.find(d => d.id === partialId);
    expect(item).toBeDefined();
    expect(item.renderQuality).toBe('partial');
  });
});
