// tva
// Caller-chosen viewport (backlog #66). Captures rendered at 1280x720 only;
// a caller can now ask for another size, for example a phone's 390x844. The
// screenshot keeps the same pixel budget as a 1280-wide one, so a wider
// viewport gets a lower height cap and Worker memory stays where #99 left it.
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { parseViewport, DEFAULT_VIEWPORT } from '../src/viewport.js';
import { screenshotHeightCap, MAX_PAGE_HEIGHT } from '../src/capture.js';
import { TEST_TENANT_KEY, cleanDb, seedApiKey } from './fixtures.js';

describe('parseViewport', () => {
  it('gives the default 1280x720 when the field is left out', () => {
    expect(parseViewport(undefined)).toEqual({ ok: true, viewport: { width: 1280, height: 720 } });
    expect(DEFAULT_VIEWPORT).toEqual({ width: 1280, height: 720 });
  });

  it('accepts whole numbers within 320-1920 wide and 320-1440 high', () => {
    expect(parseViewport({ width: 390, height: 844 })).toEqual({ ok: true, viewport: { width: 390, height: 844 } });
    expect(parseViewport({ width: 1920, height: 1080 }).ok).toBe(true);
    expect(parseViewport({ width: 320, height: 320 }).ok).toBe(true);
  });

  it('rejects anything else with a message that names the limits', () => {
    for (const value of [null, 'mobile', [390, 844], { width: 390 }, { width: 390.5, height: 844 },
      { width: 319, height: 844 }, { width: 1921, height: 844 }, { width: 390, height: 1441 },
      { width: '390', height: 844 }, { width: 390, height: 844, deviceScaleFactor: 3 }]) {
      const result = parseViewport(value);
      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/320/);
    }
  });
});

describe('screenshotHeightCap', () => {
  it('keeps 8000 px up to 1280 px wide and scales down past it, so the pixel count stays the same', () => {
    expect(screenshotHeightCap(1280)).toBe(MAX_PAGE_HEIGHT);
    expect(screenshotHeightCap(390)).toBe(MAX_PAGE_HEIGHT);
    expect(screenshotHeightCap(1920)).toBe(5333);
    expect(screenshotHeightCap(1440)).toBe(7111);
  });
});

describe('POST /v1/captures with a viewport', () => {
  const post = (body) => SELF.fetch('https://worker.test/v1/captures', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TEST_TENANT_KEY}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.91' },
    body: JSON.stringify(body),
  });

  beforeEach(async () => {
    await cleanDb(env.DB);
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'gh-424242' });
  });

  it('answers 400 for a viewport outside the limits', async () => {
    const res = await post({ url: 'https://93.184.216.34/', viewport: { width: 4000, height: 800 } });
    expect(res.status).toBe(400);
    expect((await res.json()).detail).toMatch(/viewport/);
  });

  it('accepts a valid viewport', async () => {
    const res = await post({ url: 'https://93.184.216.34/', viewport: { width: 390, height: 844 } });
    expect(res.status).toBe(202);
  });
});
