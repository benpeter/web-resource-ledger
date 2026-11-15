// tva
/**
 * The scroll that loads lazy content (backlog #102).
 *
 * It was 17 steps of two calls to the browser each. On a page that makes
 * 1,400 ad requests while it is scrolled (merriam-webster.com) every call
 * waits behind that traffic: the step took 39 to 74 seconds for a page 7,000
 * px tall, and in two of four attempts a call never came back and the browser
 * session was lost minutes later. The scroll now runs inside the page, in one
 * call, for a limited time.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as capture from '../src/capture.js';

// A page 12,000 px tall. evaluate() runs the function it is given against a
// stand-in for the page's window and document, as the browser would.
function createPage() {
  const scrolledTo = [];
  let evaluateCalls = 0;
  vi.stubGlobal('document', { body: { scrollHeight: 12000 }, querySelectorAll: () => [] });
  vi.stubGlobal('window', { scrollTo: (x, y) => { scrolledTo.push(y); } });
  const page = {
    on() {},
    off() {},
    evaluate: async (fn, arg) => {
      evaluateCalls++;
      return fn(arg);
    },
  };
  return { page, scrolledTo, evaluateCalls: () => evaluateCalls };
}

// The same page, but its call number `silentCall` to the browser is never
// answered. The scroll is call 1, making lazy images eager is call 2, the
// scroll back to the top is call 3.
function createPageSilentAt(silentCall) {
  const { page } = createPage();
  const answer = page.evaluate;
  let calls = 0;
  page.evaluate = (fn, arg) => (++calls === silentCall ? new Promise(() => {}) : answer(fn, arg));
  return page;
}

describe('triggerLazyLoading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('scrolls the page from top to bottom and back to the top', async () => {
    const { page, scrolledTo } = createPage();

    await capture.triggerLazyLoading(page);

    expect(scrolledTo[0]).toBe(720);
    expect(scrolledTo.at(-2)).toBeGreaterThanOrEqual(12000);
    expect(scrolledTo.at(-1)).toBe(0);
    expect(scrolledTo).toHaveLength(18);
  });

  it('makes three calls to the browser, not two for every step', async () => {
    const { page, evaluateCalls } = createPage();

    await capture.triggerLazyLoading(page);

    expect(evaluateCalls()).toBe(3);
  });

  it('fails when the page does not answer the scroll call within 30 seconds', async () => {
    vi.useFakeTimers();
    const page = { on() {}, off() {}, evaluate: () => new Promise(() => {}) };

    const result = capture.triggerLazyLoading(page).then(() => 'answered', (err) => err.message);
    await vi.advanceTimersByTimeAsync(30000);

    expect(await result).toBe('The page stopped answering while it was scrolled');
  });

  // Seen on dictionary.com after the scroll itself had a limit: nothing for
  // 143 seconds, then the browser session was gone (backlog #105).
  it('fails when the page does not answer the call that makes lazy images eager within 15 seconds', async () => {
    vi.useFakeTimers();
    const page = createPageSilentAt(2);

    const result = capture.triggerLazyLoading(page).then(() => 'answered', (err) => err.message);
    await vi.advanceTimersByTimeAsync(60000);

    expect(await Promise.race([result, 'still waiting'])).toBe('The page stopped answering while it was scrolled');
  });

  it('fails when the page does not answer the scroll back to the top within 15 seconds', async () => {
    vi.useFakeTimers();
    const page = createPageSilentAt(3);

    const result = capture.triggerLazyLoading(page).then(() => 'answered', (err) => err.message);
    await vi.advanceTimersByTimeAsync(60000);

    expect(await Promise.race([result, 'still waiting'])).toBe('The page stopped answering while it was scrolled');
  });
});

describe('scrollStepwise, the scroll as it runs in the page', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { body: { scrollHeight: 12000 } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops when its time is used up and says so', async () => {
    const scrolledTo = [];
    vi.stubGlobal('window', { scrollTo: (x, y) => { scrolledTo.push(y); } });

    const result = await capture.scrollStepwise({ stepPx: 720, pauseMs: 20, maxHeight: 12000, budgetMs: 50 });

    expect(result.budgetUsedUp).toBe(true);
    expect(scrolledTo.length).toBeGreaterThanOrEqual(2);
    expect(scrolledTo.length).toBeLessThan(17);
  });

  it('stops when the page keeps growing, as an endless feed does', async () => {
    const body = { scrollHeight: 12000 };
    vi.stubGlobal('document', { body });
    vi.stubGlobal('window', { scrollTo: () => { body.scrollHeight += 5000; } });

    const result = await capture.scrollStepwise({ stepPx: 720, pauseMs: 0, maxHeight: 12000, budgetMs: 10000 });

    expect(result.steps).toBe(3);
    expect(result.budgetUsedUp).toBe(false);
  });
});
