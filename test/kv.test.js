import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createCapture, completeCapture, failCapture, getCapture, tenantPrefix, listCaptures, createApiKeyRecord, getApiKeyRecord, revokeApiKeyRecord, listApiKeyRecords, getTenantConfig, setTenantConfig, rateLimitWindowId, rateLimitCounter } from '../src/kv.js';
import { hashApiKey } from '../src/auth.js';

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
    expect(record.render).toMatchObject({
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

// ---------------------------------------------------------------------------
// API key record CRUD
// ---------------------------------------------------------------------------

async function makeKeyHash(raw) {
  return hashApiKey(raw);
}

const TEST_RAW_KEY = 'wrl_live_' + 'b'.repeat(43);

const BASE_RECORD = {
  tenantId: 'acme',
  scopes: ['capture', 'read'],
  name: 'integration-test-key',
  createdAt: new Date().toISOString(),
  createdBy: 'test',
  revoked: false,
  revokedAt: null,
};

async function cleanupApiKeys() {
  const { keys } = await env.KV.list({ prefix: 'apikey:' });
  for (const k of keys) await env.KV.delete(k.name);
}

describe('createApiKeyRecord', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('stores the record under apikey:{sha256hex}', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    expect(result.created).toBe(true);
    const raw = await env.KV.get(`apikey:${sha256hex}`);
    expect(raw).not.toBeNull();
  });

  it('returns { created: true } on success', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    expect(result.created).toBe(true);
  });

  it('returns { created: false, reason: "hash_collision" } when non-revoked record exists', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    const result = await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    expect(result.created).toBe(false);
    expect(result.reason).toBe('hash_collision');
  });

  it('allows overwrite when existing record is revoked', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, { ...BASE_RECORD, revoked: true, revokedAt: new Date().toISOString() });
    const result = await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    expect(result.created).toBe(true);
  });

  it('throws on invalid sha256hex', async () => {
    await expect(createApiKeyRecord(env.KV, 'not-a-hash', BASE_RECORD)).rejects.toThrow();
  });
});

describe('getApiKeyRecord', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('returns null for missing key', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await getApiKeyRecord(env.KV, sha256hex);
    expect(result).toBeNull();
  });

  it('returns parsed record for existing key', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    const result = await getApiKeyRecord(env.KV, sha256hex);
    expect(result).not.toBeNull();
    expect(result.tenantId).toBe('acme');
    expect(result.scopes).toContain('capture');
    expect(result.name).toBe('integration-test-key');
  });

  it('throws on invalid sha256hex', async () => {
    await expect(getApiKeyRecord(env.KV, 'bad')).rejects.toThrow();
  });
});

describe('revokeApiKeyRecord', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('returns { revoked: false, reason: "not_found" } for unknown key', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await revokeApiKeyRecord(env.KV, sha256hex);
    expect(result.revoked).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('sets revoked: true and revokedAt on the record', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    const result = await revokeApiKeyRecord(env.KV, sha256hex);
    expect(result.revoked).toBe(true);
    expect(result.record.revoked).toBe(true);
    expect(result.record.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent -- revoking already-revoked key returns revoked: true', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    await revokeApiKeyRecord(env.KV, sha256hex);
    const result = await revokeApiKeyRecord(env.KV, sha256hex);
    expect(result.revoked).toBe(true);
  });

  it('throws on invalid sha256hex', async () => {
    await expect(revokeApiKeyRecord(env.KV, 'x')).rejects.toThrow();
  });
});

describe('listApiKeyRecords', () => {
  beforeEach(cleanupApiKeys);
  afterEach(cleanupApiKeys);

  it('returns empty array when no keys exist', async () => {
    const result = await listApiKeyRecords(env.KV);
    expect(result).toEqual([]);
  });

  it('returns active (non-revoked) records by default', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    const result = await listApiKeyRecords(env.KV);
    expect(result).toHaveLength(1);
    expect(result[0].keyHash).toBe(sha256hex);
  });

  it('excludes revoked records by default', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, { ...BASE_RECORD, revoked: true, revokedAt: new Date().toISOString() });
    const result = await listApiKeyRecords(env.KV);
    expect(result).toHaveLength(0);
  });

  it('includes revoked records when includeRevoked: true', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, { ...BASE_RECORD, revoked: true, revokedAt: new Date().toISOString() });
    const result = await listApiKeyRecords(env.KV, { includeRevoked: true });
    expect(result).toHaveLength(1);
  });

  it('filters by tenantId', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, { ...BASE_RECORD, tenantId: 'tenant-a' });
    const resultA = await listApiKeyRecords(env.KV, { tenantId: 'tenant-a' });
    const resultB = await listApiKeyRecords(env.KV, { tenantId: 'tenant-b' });
    expect(resultA).toHaveLength(1);
    expect(resultB).toHaveLength(0);
  });

  it('records include keyHash field', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.KV, sha256hex, BASE_RECORD);
    const result = await listApiKeyRecords(env.KV);
    expect(result[0].keyHash).toBe(sha256hex);
  });
});

// ---------------------------------------------------------------------------
// Tenant config
// ---------------------------------------------------------------------------

async function cleanupTenantConfig(tenantId) {
  await env.KV.delete(`tenant:${tenantId}:config`);
}

describe('getTenantConfig', () => {
  const TID = 'cfg-test';
  beforeEach(() => cleanupTenantConfig(TID));
  afterEach(() => cleanupTenantConfig(TID));

  it('returns null when no config exists', async () => {
    const result = await getTenantConfig(env.KV, TID);
    expect(result).toBeNull();
  });

  it('returns parsed config after setTenantConfig', async () => {
    await setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 100 } } }, 'admin');
    const result = await getTenantConfig(env.KV, TID);
    expect(result).not.toBeNull();
    expect(result.rateLimit.capture.limit).toBe(100);
  });

  it('throws on invalid tenantId', async () => {
    await expect(getTenantConfig(env.KV, 'BAD:ID')).rejects.toThrow();
  });
});

describe('setTenantConfig', () => {
  const TID = 'cfg-test2';
  beforeEach(() => cleanupTenantConfig(TID));
  afterEach(() => cleanupTenantConfig(TID));

  it('returns record with updatedAt and updatedBy', async () => {
    const result = await setTenantConfig(env.KV, TID, {}, 'admin');
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedBy).toBe('admin');
  });

  it('is a pure write -- replaces entire config', async () => {
    await setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 50 } } }, 'admin');
    await setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 200 } } }, 'admin');
    const result = await getTenantConfig(env.KV, TID);
    expect(result.rateLimit.capture.limit).toBe(200);
  });

  it('accepts config without rateLimit', async () => {
    await expect(setTenantConfig(env.KV, TID, {}, 'admin')).resolves.not.toThrow();
  });

  it('throws when rateLimit.group.limit is not a positive integer', async () => {
    await expect(setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 0 } } }, 'admin')).rejects.toThrow();
    await expect(setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 1.5 } } }, 'admin')).rejects.toThrow();
    await expect(setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: -1 } } }, 'admin')).rejects.toThrow();
  });

  it('throws when rateLimit.group.period is not 10 or 60', async () => {
    await expect(
      setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 10, period: 30 } } }, 'admin'),
    ).rejects.toThrow();
  });

  it('accepts period 10 and 60', async () => {
    await expect(
      setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 10, period: 10 } } }, 'admin'),
    ).resolves.not.toThrow();
    await expect(
      setTenantConfig(env.KV, TID, { rateLimit: { capture: { limit: 10, period: 60 } } }, 'admin'),
    ).resolves.not.toThrow();
  });

  it('throws on invalid tenantId', async () => {
    await expect(setTenantConfig(env.KV, 'BAD:ID', {}, 'admin')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// rateLimitWindowId (pure math -- no KV needed)
// ---------------------------------------------------------------------------

describe('rateLimitWindowId', () => {
  afterEach(() => vi.useRealTimers());

  it('returns consistent value within the same window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:05.000Z')); // 5s into a 10s window
    const id1 = rateLimitWindowId(10);
    vi.setSystemTime(new Date('2024-01-01T00:00:09.999Z')); // still same window
    const id2 = rateLimitWindowId(10);
    expect(id1).toBe(id2);
  });

  it('returns different value after window boundary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:09.999Z'));
    const before = rateLimitWindowId(10);
    vi.setSystemTime(new Date('2024-01-01T00:00:10.000Z'));
    const after = rateLimitWindowId(10);
    expect(after).toBe(before + 1);
  });

  it('returns different values for different periods at same moment', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:30.000Z'));
    const id10 = rateLimitWindowId(10);
    const id60 = rateLimitWindowId(60);
    expect(id10).not.toBe(id60);
  });
});

// ---------------------------------------------------------------------------
// rateLimitCounter (unit tests with mock KV)
// ---------------------------------------------------------------------------

function makeMockKv(initial = {}) {
  const store = { ...initial };
  return {
    async get(key) {
      return store[key] ?? null;
    },
    async put(key, value) {
      store[key] = value;
    },
    _store: store,
  };
}

describe('rateLimitCounter', () => {
  afterEach(() => vi.useRealTimers());

  it('returns remaining = limit - 1 on first call (no prior count)', async () => {
    const kv = makeMockKv();
    const { remaining } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(remaining).toBe(9);
  });

  it('returns exceeded = false when current < limit', async () => {
    const kv = makeMockKv();
    const { exceeded } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(exceeded).toBe(false);
  });

  it('returns exceeded = true when current >= limit', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const windowId = rateLimitWindowId(60);
    const kv = makeMockKv({ [`rl:acme:capture:${windowId}`]: '10' });
    const { exceeded } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(exceeded).toBe(true);
  });

  it('returns remaining = 0 when current >= limit - 1', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const windowId = rateLimitWindowId(60);
    // current = limit - 1 (last allowed request)
    const kv = makeMockKv({ [`rl:acme:capture:${windowId}`]: '9' });
    const { remaining, exceeded } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(remaining).toBe(0);
    expect(exceeded).toBe(false);
  });

  it('exceeded uses current >= limit (blocks at exact boundary)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const windowId = rateLimitWindowId(60);
    // current exactly at limit -- must be blocked
    const kv = makeMockKv({ [`rl:acme:capture:${windowId}`]: '10' });
    const { exceeded, remaining } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(exceeded).toBe(true);
    expect(remaining).toBe(0);
  });

  it('writes incremented count to KV with expirationTtl = period * 2', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const windowId = rateLimitWindowId(60);
    const key = `rl:acme:capture:${windowId}`;

    const puts = [];
    const kv = {
      async get() { return null; },
      async put(k, v, opts) { puts.push({ k, v, opts }); },
    };

    await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(puts).toHaveLength(1);
    expect(puts[0].k).toBe(key);
    expect(puts[0].v).toBe('1');
    expect(puts[0].opts.expirationTtl).toBe(120); // 60 * 2
  });

  it('writePromise resolves without throwing', async () => {
    const kv = makeMockKv();
    const { writePromise } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    await expect(writePromise).resolves.not.toThrow();
  });

  it('returns resetIn >= 1', async () => {
    const kv = makeMockKv();
    const { resetIn } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(resetIn).toBeGreaterThanOrEqual(1);
  });

  it('uses correct window key for given tenantId and group', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T12:00:30.000Z'));
    const windowId = rateLimitWindowId(10);
    const expectedKey = `rl:tenant-x:batch:${windowId}`;

    const gets = [];
    const kv = {
      async get(k) { gets.push(k); return null; },
      async put() {},
    };

    await rateLimitCounter(kv, 'tenant-x', 'batch', 5, 10);
    expect(gets[0]).toBe(expectedKey);
  });
});
