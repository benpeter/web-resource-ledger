import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { computeCip } from '../src/ip-hash.js';

// ---------------------------------------------------------------------------
// computeCip -- unit tests
// ---------------------------------------------------------------------------

describe('computeCip -- basic behavior', () => {
  it('returns a 16-character hex string when IP_HASH_SEED is present', async () => {
    const cip = await computeCip(env, '93.184.216.34');
    expect(cip).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic: same IP produces same hash', async () => {
    const cip1 = await computeCip(env, '93.184.216.34');
    const cip2 = await computeCip(env, '93.184.216.34');
    expect(cip1).toBe(cip2);
  });

  it('different IPs produce different hashes', async () => {
    const cip1 = await computeCip(env, '93.184.216.34');
    const cip2 = await computeCip(env, '198.51.100.1');
    expect(cip1).not.toBe(cip2);
  });
});

describe('computeCip -- graceful degradation', () => {
  it('returns undefined when IP_HASH_SEED is absent', async () => {
    const cip = await computeCip({}, '93.184.216.34');
    expect(cip).toBeUndefined();
  });

  it('returns undefined when IP_HASH_SEED is empty string', async () => {
    const cip = await computeCip({ IP_HASH_SEED: '' }, '93.184.216.34');
    expect(cip).toBeUndefined();
  });

  it('returns undefined when env is null', async () => {
    const cip = await computeCip(null, '93.184.216.34');
    expect(cip).toBeUndefined();
  });

  it('returns undefined when env is undefined', async () => {
    const cip = await computeCip(undefined, '93.184.216.34');
    expect(cip).toBeUndefined();
  });
});

describe('computeCip -- edge case inputs', () => {
  it('handles empty string IP without throwing', async () => {
    const cip = await computeCip(env, '');
    expect(cip).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles "unknown" IP (fallback value)', async () => {
    const cip = await computeCip(env, 'unknown');
    expect(cip).toMatch(/^[0-9a-f]{16}$/);
  });

  it('handles IPv6 addresses', async () => {
    const cip = await computeCip(env, '2001:db8::1');
    expect(cip).toMatch(/^[0-9a-f]{16}$/);
  });
});
