// tva
/**
 * The two checks of the loaded page before the scroll: is it the browser's
 * own error page or blank, and is it a bot check (backlog #105).
 *
 * Each is one small call to the browser. On a page that keeps the browser
 * busy (dictionary.com, 670 to 1,050 requests before its load event) the
 * calls had no limit of their own: one attempt sat in them for 91 seconds
 * until the browser session was gone.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as capture from '../src/capture.js';

const silentPage = () => ({ evaluate: () => new Promise(() => {}) });

describe('the checks of the loaded page', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails when the page does not answer the error page check within 15 seconds', async () => {
    vi.useFakeTimers();

    const result = capture.detectRenderFailure(silentPage()).then(() => 'answered', (err) => err.message);
    await vi.advanceTimersByTimeAsync(15000);

    expect(await result).toBe('The page stopped answering while it was checked');
  });

  it('fails when the page does not answer the bot check within 15 seconds', async () => {
    vi.useFakeTimers();

    const result = capture.readBotCheckSignals(silentPage()).then(() => 'answered', (err) => err.message);
    await vi.advanceTimersByTimeAsync(15000);

    expect(await result).toBe('The page stopped answering while it was checked');
  });

  it('is still waiting after 14 seconds', async () => {
    vi.useFakeTimers();
    let settled = false;

    capture.detectRenderFailure(silentPage()).then(() => { settled = true; }, () => { settled = true; });
    await vi.advanceTimersByTimeAsync(14000);

    expect(settled).toBe(false);
  });

  it('returns what the page answered', async () => {
    const page = { evaluate: async () => ({ failed: true, reason: 'blank-page' }) };

    expect(await capture.detectRenderFailure(page)).toEqual({ failed: true, reason: 'blank-page' });
  });
});
