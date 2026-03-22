// tva
// Unit tests for src/db.js (D1-backed metadata layer).
// Rate limit tests remain at the bottom and still import from src/kv.js.

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createCapture, completeCapture, failCapture, getCapture, listCaptures,
  createApiKeyRecord, getApiKeyRecord, revokeApiKeyRecord, listApiKeyRecords,
  getTenantConfig, setTenantConfig,
  archiveSigningKey, getArchivedSigningKey,
} from '../src/db.js';
import { rateLimitWindowId, rateLimitCounter } from '../src/kv.js';
import { hashApiKey } from '../src/auth.js';
import { cleanDb } from './fixtures.js';

const TEST_ID = 'cap_' + 'a'.repeat(28) + '0001';
const TEST_URL = 'https://example.com';
const TEST_IP = '93.184.216.34';
const TEST_ARTIFACTS = {
  screenshot: `captures/${TEST_ID}/screenshot.png`,
  html: `captures/${TEST_ID}/page.html`,
  headers: `captures/${TEST_ID}/headers.json`,
};

beforeEach(async () => {
  await cleanDb(env.DB);
});

// ---------------------------------------------------------------------------
// Schema verification
// ---------------------------------------------------------------------------

describe('schema', () => {
  it('migration creates all expected tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all();
    const names = results.map(r => r.name);
    expect(names).toContain('tenants');
    expect(names).toContain('captures');
    expect(names).toContain('api_keys');
    expect(names).toContain('signing_keys');
  });

  it('migration creates captures indexes', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='captures'",
    ).all();
    const names = results.map(r => r.name);
    expect(names).toContain('idx_captures_tenant_created');
    expect(names).toContain('idx_captures_tenant_status_created');
  });

  it('migration creates api_keys index', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='api_keys'",
    ).all();
    const names = results.map(r => r.name);
    expect(names).toContain('idx_api_keys_tenant');
  });
});

// ---------------------------------------------------------------------------
// createCapture
// ---------------------------------------------------------------------------

describe('createCapture', () => {
  it('inserts a pending capture row', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const row = await env.DB.prepare('SELECT * FROM captures WHERE id = ?').bind(TEST_ID).first();
    expect(row).not.toBeNull();
    expect(row.status).toBe('pending');
  });

  it('stores correct fields', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const row = await env.DB.prepare('SELECT * FROM captures WHERE id = ?').bind(TEST_ID).first();
    expect(row.url).toBe(TEST_URL);
    expect(row.ip).toBe(TEST_IP);
    expect(row.id).toBe(TEST_ID);
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores tenantId', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const row = await env.DB.prepare('SELECT tenant_id FROM captures WHERE id = ?').bind(TEST_ID).first();
    expect(row.tenant_id).toBe('default');
  });

  it('auto-creates tenant row via INSERT OR IGNORE', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'new-tenant');
    const row = await env.DB.prepare('SELECT id FROM tenants WHERE id = ?').bind('new-tenant').first();
    expect(row).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCapture
// ---------------------------------------------------------------------------

describe('getCapture', () => {
  it('returns null for missing capture', async () => {
    const result = await getCapture(env.DB, 'cap_nonexistent1234567890abcdef12');
    expect(result).toBeNull();
  });

  it('returns parsed record for existing capture', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await getCapture(env.DB, TEST_ID);
    expect(result).not.toBeNull();
    expect(result.status).toBe('pending');
    expect(result.captureId).toBe(TEST_ID);
  });
});

// ---------------------------------------------------------------------------
// completeCapture
// ---------------------------------------------------------------------------

describe('completeCapture', () => {
  it('updates status to complete', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('adds completedAt timestamp', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stores artifacts as parsed JSON', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.artifacts).toEqual(TEST_ARTIFACTS);
  });

  it('preserves original fields', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toBeDefined();
  });

  it('is a no-op for missing capture (does not throw)', async () => {
    await expect(completeCapture(env.DB, 'cap_gone00000000000000000000000000', TEST_ARTIFACTS)).resolves.toBeUndefined();
  });

  it('is idempotent -- calling again on already-complete record does not throw', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    await expect(completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS)).resolves.not.toThrow();
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('stores renderQuality when provided', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS, null, 'partial', {
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBe('partial');
  });

  it('stores render metadata when provided', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS, null, 'partial', {
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render).toMatchObject({
      waitUntilReached: 'domcontentloaded',
      timedOut: true,
      durationMs: 25000,
    });
  });

  it('renderQuality is null when not provided', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBeNull();
  });

  it('render is null when not provided', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// failCapture
// ---------------------------------------------------------------------------

describe('failCapture', () => {
  it('updates status to failed', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.DB, TEST_ID, 'render timeout');
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
  });

  it('adds failedAt timestamp and error', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.DB, TEST_ID, 'render timeout');
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.error).toBe('render timeout');
  });

  it('sets retryable=false by default', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.DB, TEST_ID, 'render timeout');
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.retryable).toBe(false);
  });

  it('sets retryable=true when specified', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.DB, TEST_ID, 'upstream unavailable', true);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.retryable).toBe(true);
  });

  it('is a no-op for missing capture (does not throw)', async () => {
    await expect(failCapture(env.DB, 'cap_gone00000000000000000000000000', 'error')).resolves.toBeUndefined();
  });

  it('is idempotent -- calling again on already-failed record does not throw', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await failCapture(env.DB, TEST_ID, 'render timeout');
    await expect(failCapture(env.DB, TEST_ID, 'render timeout')).resolves.not.toThrow();
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// round-trip
// ---------------------------------------------------------------------------

describe('round-trip', () => {
  it('createCapture then getCapture returns matching data', async () => {
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// listCaptures
// ---------------------------------------------------------------------------

describe('listCaptures', () => {
  afterEach(() => vi.useRealTimers());

  it('returns empty for empty DB', async () => {
    const result = await listCaptures(env.DB, 'default');
    expect(result.data).toEqual([]);
    expect(result.pagination).toMatchObject({ hasMore: false, offset: 0, limit: 20, total: 0 });
  });

  it('returns captures for given tenantId', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await listCaptures(env.DB, 'default');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].captureId).toBe(TEST_ID);
  });

  it('does not return captures from a different tenant', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T01:00:00.000Z'));
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'other-tenant');
    const result = await listCaptures(env.DB, 'default');
    expect(result.data).toEqual([]);
  });

  it('respects limit parameter', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      await createCapture(env.DB, `cap_db11${i.toString(16).padStart(28, '0')}`, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.DB, 'default', { limit: 2 });
    expect(result.data).toHaveLength(2);
  });

  it('returns total count even when limit restricts results', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      await createCapture(env.DB, `cap_dbb01a${i.toString(16).padStart(26, '0')}`, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.DB, 'default', { limit: 2 });
    expect(result.pagination.total).toBe(5);
    expect(result.pagination.hasMore).toBe(true);
  });

  it('returns hasMore=false and total correct on final page', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      await createCapture(env.DB, `cap_dbf1a${i.toString(16).padStart(27, '0')}`, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.DB, 'default', { limit: 10 });
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.total).toBe(3);
  });

  it('applies status filter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-01T00:00:00.000Z'));
    const completeId = 'cap_db5a001e000000000000000000000001';
    await createCapture(env.DB, completeId, TEST_URL, TEST_IP, 'default');
    await completeCapture(env.DB, completeId, TEST_ARTIFACTS);

    vi.setSystemTime(new Date('2024-03-01T00:00:01.000Z'));
    const pendingId = 'cap_db9e9d00000000000000000000000001';
    await createCapture(env.DB, pendingId, TEST_URL, TEST_IP, 'default');

    const completeResult = await listCaptures(env.DB, 'default', { status: 'complete' });
    expect(completeResult.data.every(r => r.status === 'complete')).toBe(true);
    expect(completeResult.data.some(r => r.captureId === completeId)).toBe(true);

    const pendingResult = await listCaptures(env.DB, 'default', { status: 'pending' });
    expect(pendingResult.data.every(r => r.status === 'pending')).toBe(true);
    expect(pendingResult.data.some(r => r.captureId === pendingId)).toBe(true);
  });

  it('default sort is newest-first', async () => {
    vi.useFakeTimers();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const id = `cap_db5050${i.toString(16).padStart(26, '0')}`;
      ids.push(id);
      await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.DB, 'default');
    // Default -created_at means newest first
    expect(result.data[0].captureId).toBe(ids[2]);
    expect(result.data[2].captureId).toBe(ids[0]);
  });

  it('sort=created_at returns oldest-first', async () => {
    vi.useFakeTimers();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const id = `cap_dba5c${'0'.repeat(25)}${i.toString(16).padStart(2, '0')}`;

      ids.push(id);
      await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    }
    const result = await listCaptures(env.DB, 'default', { sort: 'created_at' });
    expect(result.data[0].captureId).toBe(ids[0]);
    expect(result.data[2].captureId).toBe(ids[2]);
  });

  it('offset pagination skips correct rows', async () => {
    vi.useFakeTimers();
    const ids = [];
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(new Date(1700000000000 + i * 1000));
      const id = `cap_db0ff5e${i.toString(16).padStart(25, '0')}`;
      ids.push(id);
      await createCapture(env.DB, id, TEST_URL, TEST_IP, 'default');
    }
    const page1 = await listCaptures(env.DB, 'default', { limit: 2, offset: 0, sort: 'created_at' });
    const page2 = await listCaptures(env.DB, 'default', { limit: 2, offset: 2, sort: 'created_at' });
    const page1Ids = page1.data.map(d => d.captureId);
    const page2Ids = page2.data.map(d => d.captureId);
    for (const id of page2Ids) expect(page1Ids).not.toContain(id);
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

describe('createApiKeyRecord', () => {
  it('stores the record and can be read back', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    expect(result.created).toBe(true);
    const row = await env.DB.prepare('SELECT key_hash FROM api_keys WHERE key_hash = ?').bind(sha256hex).first();
    expect(row).not.toBeNull();
  });

  it('returns { created: true } on success', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    expect(result.created).toBe(true);
  });

  it('returns { created: false, reason: "hash_collision" } when non-revoked record exists', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    const result = await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    expect(result.created).toBe(false);
    expect(result.reason).toBe('hash_collision');
  });

  it('allows overwrite when existing record is revoked', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, { ...BASE_RECORD, revoked: true, revokedAt: new Date().toISOString() });
    const result = await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    expect(result.created).toBe(true);
  });

  it('throws on invalid sha256hex', async () => {
    await expect(createApiKeyRecord(env.DB, 'not-a-hash', BASE_RECORD)).rejects.toThrow();
  });
});

describe('getApiKeyRecord', () => {
  it('returns null for missing key', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await getApiKeyRecord(env.DB, sha256hex);
    expect(result).toBeNull();
  });

  it('returns parsed record for existing key', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    const result = await getApiKeyRecord(env.DB, sha256hex);
    expect(result).not.toBeNull();
    expect(result.tenantId).toBe('acme');
    expect(result.scopes).toContain('capture');
    expect(result.name).toBe('integration-test-key');
  });

  it('throws on invalid sha256hex', async () => {
    await expect(getApiKeyRecord(env.DB, 'bad')).rejects.toThrow();
  });
});

describe('revokeApiKeyRecord', () => {
  it('returns { revoked: false, reason: "not_found" } for unknown key', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    const result = await revokeApiKeyRecord(env.DB, sha256hex);
    expect(result.revoked).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('sets revoked: true and revokedAt on the record', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    const result = await revokeApiKeyRecord(env.DB, sha256hex);
    expect(result.revoked).toBe(true);
    expect(result.record.revoked).toBe(true);
    expect(result.record.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is idempotent -- revoking already-revoked key returns revoked: true', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    await revokeApiKeyRecord(env.DB, sha256hex);
    const result = await revokeApiKeyRecord(env.DB, sha256hex);
    expect(result.revoked).toBe(true);
  });

  it('throws on invalid sha256hex', async () => {
    await expect(revokeApiKeyRecord(env.DB, 'x')).rejects.toThrow();
  });
});

describe('listApiKeyRecords', () => {
  it('returns empty array when no keys exist', async () => {
    const result = await listApiKeyRecords(env.DB);
    expect(result).toEqual([]);
  });

  it('returns active (non-revoked) records by default', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    const result = await listApiKeyRecords(env.DB);
    expect(result).toHaveLength(1);
    expect(result[0].keyHash).toBe(sha256hex);
  });

  it('excludes revoked records by default', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, { ...BASE_RECORD, revoked: true, revokedAt: new Date().toISOString() });
    const result = await listApiKeyRecords(env.DB);
    expect(result).toHaveLength(0);
  });

  it('includes revoked records when includeRevoked: true', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, { ...BASE_RECORD, revoked: true, revokedAt: new Date().toISOString() });
    const result = await listApiKeyRecords(env.DB, { includeRevoked: true });
    expect(result).toHaveLength(1);
  });

  it('filters by tenantId', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, { ...BASE_RECORD, tenantId: 'tenant-a' });
    const resultA = await listApiKeyRecords(env.DB, { tenantId: 'tenant-a' });
    const resultB = await listApiKeyRecords(env.DB, { tenantId: 'tenant-b' });
    expect(resultA).toHaveLength(1);
    expect(resultB).toHaveLength(0);
  });

  it('records include keyHash field', async () => {
    const sha256hex = await makeKeyHash(TEST_RAW_KEY);
    await createApiKeyRecord(env.DB, sha256hex, BASE_RECORD);
    const result = await listApiKeyRecords(env.DB);
    expect(result[0].keyHash).toBe(sha256hex);
  });
});

// ---------------------------------------------------------------------------
// Tenant config
// ---------------------------------------------------------------------------

describe('getTenantConfig', () => {
  const TID = 'cfg-test';

  it('returns null when no config exists', async () => {
    await env.DB.prepare('INSERT OR IGNORE INTO tenants (id) VALUES (?)').bind(TID).run();
    const result = await getTenantConfig(env.DB, TID);
    expect(result).toBeNull();
  });

  it('returns parsed config after setTenantConfig', async () => {
    await setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 100 } } }, 'admin');
    const result = await getTenantConfig(env.DB, TID);
    expect(result).not.toBeNull();
    expect(result.rateLimit.capture.limit).toBe(100);
  });

  it('throws on invalid tenantId', async () => {
    await expect(getTenantConfig(env.DB, 'BAD:ID')).rejects.toThrow();
  });
});

describe('setTenantConfig', () => {
  const TID = 'cfg-test2';

  it('returns record with updatedAt and updatedBy', async () => {
    const result = await setTenantConfig(env.DB, TID, {}, 'admin');
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedBy).toBe('admin');
  });

  it('is a pure write -- replaces entire config', async () => {
    await setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 50 } } }, 'admin');
    await setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 200 } } }, 'admin');
    const result = await getTenantConfig(env.DB, TID);
    expect(result.rateLimit.capture.limit).toBe(200);
  });

  it('accepts config without rateLimit', async () => {
    await expect(setTenantConfig(env.DB, TID, {}, 'admin')).resolves.not.toThrow();
  });

  it('throws when rateLimit.group.limit is not a positive integer', async () => {
    await expect(setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 0 } } }, 'admin')).rejects.toThrow();
    await expect(setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 1.5 } } }, 'admin')).rejects.toThrow();
    await expect(setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: -1 } } }, 'admin')).rejects.toThrow();
  });

  it('throws when rateLimit.group.period is not 10 or 60', async () => {
    await expect(
      setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 10, period: 30 } } }, 'admin'),
    ).rejects.toThrow();
  });

  it('accepts period 10 and 60', async () => {
    await expect(
      setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 10, period: 10 } } }, 'admin'),
    ).resolves.not.toThrow();
    await expect(
      setTenantConfig(env.DB, TID, { rateLimit: { capture: { limit: 10, period: 60 } } }, 'admin'),
    ).resolves.not.toThrow();
  });

  it('throws on invalid tenantId', async () => {
    await expect(setTenantConfig(env.DB, 'BAD:ID', {}, 'admin')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Signing key archive
// ---------------------------------------------------------------------------

describe('archiveSigningKey / getArchivedSigningKey', () => {
  const TEST_KEY_ID = 'abcdef12';
  // 32-byte public key encoded as base64
  const VALID_KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));

  it('stores and retrieves an archived key', async () => {
    await archiveSigningKey(env.DB, TEST_KEY_ID, VALID_KEY_B64);
    const result = await getArchivedSigningKey(env.DB, TEST_KEY_ID);
    expect(result).not.toBeNull();
    expect(result.algorithm).toBe('Ed25519');
    expect(result.publicKey).toBe(VALID_KEY_B64);
    expect(typeof result.archivedAt).toBe('string');
  });

  it('returns null for unknown keyId', async () => {
    const result = await getArchivedSigningKey(env.DB, 'deadbeef');
    expect(result).toBeNull();
  });

  it('is idempotent -- writing same keyId twice does not throw', async () => {
    await archiveSigningKey(env.DB, TEST_KEY_ID, VALID_KEY_B64);
    await archiveSigningKey(env.DB, TEST_KEY_ID, VALID_KEY_B64);
    const result = await getArchivedSigningKey(env.DB, TEST_KEY_ID);
    expect(result).not.toBeNull();
    expect(result.publicKey).toBe(VALID_KEY_B64);
  });

  it('rejects keys that do not decode to 32 bytes', async () => {
    const shortKey = btoa('too short');
    await expect(
      archiveSigningKey(env.DB, 'badkey01', shortKey),
    ).rejects.toThrow('Expected 32-byte public key');
  });
});

// ---------------------------------------------------------------------------
// rateLimitWindowId (pure math -- no storage needed)
// ---------------------------------------------------------------------------

describe('rateLimitWindowId', () => {
  afterEach(() => vi.useRealTimers());

  it('returns consistent value within the same window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:05.000Z'));
    const id1 = rateLimitWindowId(10);
    vi.setSystemTime(new Date('2024-01-01T00:00:09.999Z'));
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
    async get(key) { return store[key] ?? null; },
    async put(key, value) { store[key] = value; },
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
    const kv = makeMockKv({ [`rl:acme:capture:${windowId}`]: '9' });
    const { remaining, exceeded } = await rateLimitCounter(kv, 'acme', 'capture', 10, 60);
    expect(remaining).toBe(0);
    expect(exceeded).toBe(false);
  });

  it('exceeded uses current >= limit (blocks at exact boundary)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const windowId = rateLimitWindowId(60);
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
    expect(puts[0].opts.expirationTtl).toBe(120);
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
