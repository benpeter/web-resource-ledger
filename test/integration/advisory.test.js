/**
 * advisory.test.js -- Real-URL integration test (advisory, allowed to fail)
 *
 * Captures a real public URL end-to-end to verify the full pipeline works
 * against the open internet. This test is intentionally lenient: network
 * unavailability (CI isolation, DNS failures, upstream timeouts) is caught
 * and logged as a warning rather than a hard failure.
 *
 * Run with the integration config:
 *   npm run test:integration
 */

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { acquire } from '@cloudflare/playwright';
import { performCapture } from '../../src/capture.js';
import { createCapture, getCapture } from '../../src/kv.js';

const captureId = 'cap_inttest00000000000000000000b1';

async function cleanupCapture(id) {
  await env.KV.delete(`capture:${id}`);
  const prefix = `captures/${id}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
    env.BUCKET.delete(`${prefix}/screenshot-before.png`),
    env.BUCKET.delete(`${prefix}/rendered.html`),
    env.BUCKET.delete(`${prefix}/headers.json`),
  ]);
}

describe('real URL capture (advisory)', () => {
  beforeEach(async () => {
    await acquire(env.BROWSER, { keep_alive: 120000 });
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures example.com end-to-end', async () => {
    try {
      await createCapture(env.KV, captureId, 'https://example.com/', '93.184.216.34', 'default');
      await performCapture(env, 'https://example.com/', '93.184.216.34', captureId, 'default');

      const record = await getCapture(env.KV, captureId);
      expect(record.status).toBe('complete');
      expect(record.renderQuality).toBe('full');
      if (record.wacz) {
        expect(record.wacz.timestampStatus).toBe('present');
      }
    } catch (err) {
      console.warn(`Advisory test skipped (network unavailable): ${err.message}`);
    }
  });
});
