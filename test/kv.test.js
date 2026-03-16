import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCapture, completeCapture, failCapture, getCapture, tenantPrefix, listCaptures } from '../src/kv.js';

const TEST_ID = 'cap_test1234';
const TEST_URL = 'https://example.com';
const TEST_IP = '93.184.216.34';
const TEST_ARTIFACTS = {
  screenshot: `captures/${TEST_ID}/screenshot.png`,
  html: `captures/${TEST_ID}/page.html`,
  headers: `captures/${TEST_ID}/headers.json`,
};

// Reset KV state between tests by deleting known primary and index keys
beforeEach(async () => {
  await env.KV.delete(`capture:${TEST_ID}`);
  const { keys } = await env.KV.list({ prefix: 'tenant:' });
  for (const k of keys) await env.KV.delete(k.name);
});

describe('createCapture', () => {
  it('writes to correct key capture:{id}', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const raw = await env.KV.get(`capture:${TEST_ID}`);
    expect(raw).not.toBeNull();
  });

  it('writes correct value shape', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const record = await env.KV.get(`capture:${TEST_ID}`, 'json');
    expect(record.status).toBe('pending');
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores tenantId in the primary record value', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const record = await env.KV.get(`capture:${TEST_ID}`, 'json');
    expect(record.tenantId).toBe('default');
  });

  it('writes secondary index key tenant:default:ts:{ISO}:{id}', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const { keys } = await env.KV.list({ prefix: 'tenant:default:ts:' });
    expect(keys.length).toBe(1);
    expect(keys[0].name).toContain(TEST_ID);
  });

  it('index key format matches expected pattern', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const { keys } = await env.KV.list({ prefix: 'tenant:default:ts:' });
    expect(keys[0].name).toMatch(/^tenant:default:ts:\d{4}-\d{2}-\d{2}T.+:cap_/);
  });
});

describe('getCapture', () => {
  it('returns null for missing keys', async () => {
    const result = await getCapture(env.KV, 'cap_nonexistent');
    expect(result).toBeNull();
  });

  it('returns parsed JSON for existing keys', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await getCapture(env.KV, TEST_ID);
    expect(result).not.toBeNull();
    expect(result.status).toBe('pending');
    expect(result.captureId).toBe(TEST_ID);
  });
});

describe('completeCapture', () => {
  it('updates status to complete', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('adds completedAt timestamp', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('adds artifacts', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.artifacts).toEqual(TEST_ARTIFACTS);
  });

  it('preserves original fields', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toBeDefined();
  });

  it('is a no-op for missing/expired keys (does not throw)', async () => {
    await expect(completeCapture(env.KV, 'cap_gone', TEST_ARTIFACTS)).resolves.toBeUndefined();
  });

  it('is idempotent -- calling again on already-complete record does not throw', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    await expect(completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS)).resolves.not.toThrow();
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('re-writes index key (index key still exists after completion)', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const { keys } = await env.KV.list({ prefix: 'tenant:default:ts:' });
    expect(keys.length).toBe(1);
    expect(keys[0].name).toContain(TEST_ID);
  });
});

describe('failCapture', () => {
  it('updates status to failed', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });

  it('adds failedAt timestamp and error', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.error).toBe('render timeout');
  });

  it('sets retryable=false by default', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.retryable).toBe(false);
  });

  it('sets retryable=true when specified', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.KV, TEST_ID, 'upstream unavailable', true);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.retryable).toBe(true);
  });

  it('is a no-op for missing/expired keys (does not throw)', async () => {
    await expect(failCapture(env.KV, 'cap_gone', 'error')).resolves.toBeUndefined();
  });

  it('is idempotent -- calling again on already-failed record does not throw', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.KV, TEST_ID, 'render timeout');
    await expect(failCapture(env.KV, TEST_ID, 'render timeout')).resolves.not.toThrow();
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });

  it('re-writes index key (index key still exists after failure)', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const { keys } = await env.KV.list({ prefix: 'tenant:default:ts:' });
    expect(keys.length).toBe(1);
    expect(keys[0].name).toContain(TEST_ID);
  });
});

describe('key prefix', () => {
  it('key is correctly prefixed as capture:{id}', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    // Verify via raw KV access that the prefix is applied
    const withPrefix = await env.KV.get(`capture:${TEST_ID}`);
    const withoutPrefix = await env.KV.get(TEST_ID);
    expect(withPrefix).not.toBeNull();
    expect(withoutPrefix).toBeNull();
  });
});

describe('round-trip', () => {
  it('createCapture then getCapture returns matching data', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('pending');
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toBeDefined();
  });
});

describe('listCaptures', () => {
  afterEach(() => vi.useRealTimers());

  it('returns empty for empty KV', async () => {
    const result = await listCaptures(env.KV, 'default');
    expect(result.data).toEqual([]);
    expect(result.pagination).toMatchObject({ hasMore: false, cursor: null, limit: 20 });
  });

  it('returns captures for given tenantId', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await listCaptures(env.KV, 'default');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].captureId).toBe(TEST_ID);
  });

  it('does not return captures from a different tenant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T01:00:00.000Z'));
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'other-tenant');
    const result = await listCaptures(env.KV, 'default');
    expect(result.data).toEqual([]);
  });

  it('respects limit parameter', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      await createCapture(env.KV, `cap_kvlimit${i.toString().padStart(28, '0')}`, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.KV, 'default', { limit: 2 });
    expect(result.data).toHaveLength(2);
  });

  it('returns cursor when more results exist', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      await createCapture(env.KV, `cap_kvcursor${i.toString().padStart(27, '0')}`, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.KV, 'default', { limit: 2 });
    expect(result.pagination.hasMore).toBe(true);
    expect(result.pagination.cursor).not.toBeNull();
  });

  it('returns no cursor on final page', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      await createCapture(env.KV, `cap_kvfinal${i.toString().padStart(29, '0')}`, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.KV, 'default', { limit: 10 });
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.cursor).toBeNull();
  });

  it('applies status filter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T00:00:00.000Z'));
    const completeId = 'cap_kvstatuscomplete1234567890abc';
    await createCapture(env.KV, completeId, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, completeId, TEST_ARTIFACTS);

    vi.setSystemTime(new Date('2024-03-01T00:00:01.000Z'));
    const pendingId = 'cap_kvstatuspending12345678901234';
    await createCapture(env.KV, pendingId, TEST_URL, TEST_IP, 'default');

    const completeResult = await listCaptures(env.KV, 'default', { status: 'complete' });
    expect(completeResult.data.every(r => r.status === 'complete')).toBe(true);
    expect(completeResult.data.some(r => r.captureId === completeId)).toBe(true);

    const pendingResult = await listCaptures(env.KV, 'default', { status: 'pending' });
    expect(pendingResult.data.every(r => r.status === 'pending')).toBe(true);
    expect(pendingResult.data.some(r => r.captureId === pendingId)).toBe(true);
  });

  it('handles orphaned index keys (index key exists but capture record expired)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-04-01T00:00:00.000Z'));
    // Manually write an index key that has no corresponding primary record
    const orphanId = 'cap_kvorphan12345678901234567890ab';
    await env.KV.put(`tenant:default:ts:2024-04-01T00:00:00.000Z:${orphanId}`, '');
    // Primary record intentionally not written -- simulates expired record

    const result = await listCaptures(env.KV, 'default');
    // Orphaned key must be filtered out (null primary record)
    const ids = result.data.map(r => r.captureId);
    expect(ids).not.toContain(orphanId);
  });

  it('returns error indicator for invalid cursor', async () => {
    const result = await listCaptures(env.KV, 'default', { cursor: 'not-valid$$' });
    expect(result.error).toBe('invalid_cursor');
  });
});

describe('completeCapture -- renderQuality and render metadata', () => {
  it('stores renderQuality when provided', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS, null, 'partial', {
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBe('partial');
  });

  it('stores render metadata when provided', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS, null, 'partial', {
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.render).toEqual({
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
  });

  it('omits renderQuality when not provided (backward compat)', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBeUndefined();
  });

  it('omits render when not provided', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.render).toBeUndefined();
  });
});

describe('tenantPrefix', () => {
  it('returns "tenant:default:" for "default"', () => {
    expect(tenantPrefix('default')).toBe('tenant:default:');
  });

  it('returns correct prefix for alphanumeric tenant IDs', () => {
    expect(tenantPrefix('acme-corp')).toBe('tenant:acme-corp:');
  });

  it('throws on invalid tenantId containing colon', () => {
    expect(() => tenantPrefix('a:b')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => tenantPrefix('')).toThrow();
  });

  it('throws on tenantId with uppercase letters', () => {
    expect(() => tenantPrefix('UPPER')).toThrow();
  });

  it('throws on tenantId exceeding 64 characters', () => {
    expect(() => tenantPrefix('a'.repeat(65))).toThrow();
  });
});
