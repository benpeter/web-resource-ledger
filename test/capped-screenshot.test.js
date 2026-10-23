/**
 * Screenshots of pages taller than MAX_PAGE_HEIGHT (phase 0117).
 *
 * The renderer resized the viewport to 1280x8000 and then took a fullPage
 * screenshot, which ignores the viewport height. Every page taller than about
 * 11,000 px failed with "Unable to capture screenshot" after four attempts.
 * takeCappedScreenshot clips the full-page screenshot to the top of the
 * document instead.
 */
import { describe, it, expect } from 'vitest';
import { takeCappedScreenshot, MAX_PAGE_HEIGHT } from '../src/capture.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

// Fake Playwright page. evaluate() runs the real function against a stub
// document, so the height measurement itself is tested.
function fakePage({ bodyHeight, docHeight = bodyHeight, viewport = { width: 1280, height: 720 } }) {
  const calls = { screenshot: [], setViewportSize: [] };
  return {
    calls,
    viewportSize: () => viewport,
    setViewportSize: async (size) => { calls.setViewportSize.push(size); },
    evaluate: async (fn) => {
      const previous = globalThis.document;
      globalThis.document = { body: { scrollHeight: bodyHeight }, documentElement: { scrollHeight: docHeight } };
      try {
        return fn();
      } finally {
        globalThis.document = previous;
      }
    },
    screenshot: async (options) => { calls.screenshot.push(options); return PNG; },
  };
}

describe('takeCappedScreenshot', () => {
  it('caps at 8000 px', () => {
    expect(MAX_PAGE_HEIGHT).toBe(8000);
  });

  it('takes a plain full-page screenshot of a page within the cap', async () => {
    const page = fakePage({ bodyHeight: 5000 });
    const result = await takeCappedScreenshot(page);
    expect(result).toEqual({ screenshot: PNG, pageHeight: 5000, capped: false });
    expect(page.calls.screenshot).toEqual([{ fullPage: true, type: 'png', timeout: 90000 }]);
    expect(page.calls.setViewportSize).toEqual([]);
  });

  it('clips a taller page to the top of the document and leaves the viewport alone', async () => {
    const page = fakePage({ bodyHeight: 21860 });
    const result = await takeCappedScreenshot(page);
    expect(result.capped).toBe(true);
    expect(result.pageHeight).toBe(21860);
    expect(page.calls.screenshot).toEqual([
      { fullPage: true, type: 'png', timeout: 90000, clip: { x: 0, y: 0, width: 1280, height: MAX_PAGE_HEIGHT } },
    ]);
    expect(page.calls.setViewportSize).toEqual([]);
  });

  it('measures the taller of body and root element', async () => {
    const page = fakePage({ bodyHeight: 600, docHeight: 15000 });
    const result = await takeCappedScreenshot(page);
    expect(result.capped).toBe(true);
    expect(result.pageHeight).toBe(15000);
  });

  it('falls back to 1280 px wide when the viewport size is unknown', async () => {
    const page = fakePage({ bodyHeight: 9000, viewport: null });
    await takeCappedScreenshot(page);
    expect(page.calls.screenshot[0].clip.width).toBe(1280);
  });

  it('passes the timeout through', async () => {
    const page = fakePage({ bodyHeight: 100 });
    await takeCappedScreenshot(page, 30000);
    expect(page.calls.screenshot[0].timeout).toBe(30000);
  });
});
