import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { createCapture, completeCapture, failCapture, getCapture } from '../src/kv.js';

const TEST_ID = 'cap_test1234';
const TEST_URL = 'https://example.com';
const TEST_IP = '93.184.216.34';
const TEST_ARTIFACTS = {
  screenshot: `captures/${TEST_ID}/screenshot.png`,
  html: `captures/${TEST_ID}/page.html`,
  headers: `captures/${TEST_ID}/headers.json`,
};

// Reset KV state between tests by deleting known keys
beforeEach(async () => {
  await env.KV.delete(`capture:${TEST_ID}`);
});

describe('createCapture', () => {
  it('writes to correct key capture:{id}', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    const raw = await env.KV.get(`capture:${TEST_ID}`);
    expect(raw).not.toBeNull();
  });

  it('writes correct value shape', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    const record = await env.KV.get(`capture:${TEST_ID}`, 'json');
    expect(record.status).toBe('pending');
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('getCapture', () => {
  it('returns null for missing keys', async () => {
    const result = await getCapture(env.KV, 'cap_nonexistent');
    expect(result).toBeNull();
  });

  it('returns parsed JSON for existing keys', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    const result = await getCapture(env.KV, TEST_ID);
    expect(result).not.toBeNull();
    expect(result.status).toBe('pending');
    expect(result.captureId).toBe(TEST_ID);
  });
});

describe('completeCapture', () => {
  it('updates status to complete', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('adds completedAt timestamp', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('adds artifacts', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.artifacts).toEqual(TEST_ARTIFACTS);
  });

  it('preserves original fields', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
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
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS);
    await expect(completeCapture(env.KV, TEST_ID, TEST_ARTIFACTS)).resolves.not.toThrow();
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });
});

describe('failCapture', () => {
  it('updates status to failed', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });

  it('adds failedAt timestamp and error', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(record.error).toBe('render timeout');
  });

  it('sets retryable=false by default', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await failCapture(env.KV, TEST_ID, 'render timeout');
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.retryable).toBe(false);
  });

  it('sets retryable=true when specified', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await failCapture(env.KV, TEST_ID, 'upstream unavailable', true);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.retryable).toBe(true);
  });

  it('is a no-op for missing/expired keys (does not throw)', async () => {
    await expect(failCapture(env.KV, 'cap_gone', 'error')).resolves.toBeUndefined();
  });

  it('is idempotent -- calling again on already-failed record does not throw', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await failCapture(env.KV, TEST_ID, 'render timeout');
    await expect(failCapture(env.KV, TEST_ID, 'render timeout')).resolves.not.toThrow();
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });
});

describe('key prefix', () => {
  it('key is correctly prefixed as capture:{id}', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    // Verify via raw KV access that the prefix is applied
    const withPrefix = await env.KV.get(`capture:${TEST_ID}`);
    const withoutPrefix = await env.KV.get(TEST_ID);
    expect(withPrefix).not.toBeNull();
    expect(withoutPrefix).toBeNull();
  });
});

describe('round-trip', () => {
  it('createCapture then getCapture returns matching data', async () => {
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('pending');
    expect(record.url).toBe(TEST_URL);
    expect(record.ip).toBe(TEST_IP);
    expect(record.captureId).toBe(TEST_ID);
    expect(record.createdAt).toBeDefined();
  });
});
