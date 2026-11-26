// tva
// What the consent step tells autoconsent when it starts in a frame. The
// banners themselves are covered in a real browser, in
// test/integration/capture-pipeline.test.js.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { dismissCookieConsent, consentFailureReason } from '../src/consent.js';

// A page whose autoconsent script asks for its config and rules ('init') in
// every frame when it is injected. `script` then plays the messages
// autoconsent sends from the main frame: [delay in ms, message] pairs.
function createPage(frameUrls, script = [[0, { type: 'autoconsentDone' }]]) {
  const initResponses = [];
  const frames = frameUrls.map((url) => ({
    url: () => url,
    evaluate: async (fn, arg) => {
      if (arg?.type === 'initResp') initResponses.push({ url, message: arg });
    },
  }));
  let sendMessage;
  const page = {
    mainFrame: () => frames[0],
    frames: () => frames,
    on() {},
    off() {},
    exposeBinding: async (name, fn) => { sendMessage = fn; },
    evaluate: async () => {
      for (const frame of frames) sendMessage({ frame }, { type: 'init' });
      for (const [delay, message] of script) {
        if (delay === 0) sendMessage({ frame: frames[0] }, message);
        else setTimeout(() => sendMessage({ frame: frames[0] }, message), delay);
      }
    },
  };
  return { page, initResponses };
}

// autoconsent reports its state as it goes; findCmpAttempts counts the
// detection rounds it has started.
const detectionRound = (n) => ({ type: 'report', state: { lifecycle: 'started', findCmpAttempts: n } });

describe('dismissCookieConsent: what a frame is told', () => {
  it('does not let autoconsent use the rules generated for single sites', async () => {
    const { page, initResponses } = createPage(['https://www.semrush.com/']);

    await dismissCookieConsent(page);

    expect(initResponses).toHaveLength(1);
    expect(initResponses[0].message.config.enableGeneratedRules).toBe(false);
  });
});

describe('dismissCookieConsent: how long it looks for a banner', () => {
  it('ends after two seconds when the first detection round found nothing', async () => {
    const { page } = createPage(['https://example.com/'], [[100, detectionRound(1)], [300, detectionRound(2)]]);

    const result = await dismissCookieConsent(page);

    expect(result.status).toBe('none');
    expect(result.durationMs).toBeGreaterThanOrEqual(1900);
    expect(result.durationMs).toBeLessThan(2700);
  });

  it('waits for the first detection round of a page that keeps the browser busy', async () => {
    const { page } = createPage(['https://www.ikea.com/de/de/'], [
      [2800, detectionRound(1)],
      [3000, { type: 'cmpDetected', cmp: 'Onetrust' }],
      [3100, { type: 'popupFound', cmp: 'Onetrust' }],
      [3400, { type: 'autoconsentDone' }],
    ]);

    const result = await dismissCookieConsent(page);

    expect(result.status).toBe('dismissed');
    expect(result.cmp).toBe('Onetrust');
  });

  it('gives up after six seconds when no detection round ends', async () => {
    const { page } = createPage(['https://example.com/'], [[100, detectionRound(1)]]);

    const result = await dismissCookieConsent(page);

    expect(result.status).toBe('none');
    expect(result.durationMs).toBeGreaterThanOrEqual(5900);
    expect(result.durationMs).toBeLessThan(6700);
  }, 10000);
});

// On a page with hundreds of ad frames a call to the browser can stay
// unanswered. Without a limit the step sat there until the render deadline,
// ten minutes later (merriam-webster.com on staging, 340 frames).
describe('dismissCookieConsent: a browser that does not answer while the step is set up', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up after 15 seconds when the binding is never set up', async () => {
    vi.useFakeTimers();
    const { page } = createPage(['https://www.merriam-webster.com/']);
    page.exposeBinding = () => new Promise(() => {});

    const pending = dismissCookieConsent(page);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;

    expect(result.status).toBe('failed');
    expect(result._error.message).toBe('The consent step could not be set up within 15 seconds');
  });

  it('gives up after 15 seconds when the script never arrives in the main frame', async () => {
    vi.useFakeTimers();
    const { page } = createPage(['https://www.merriam-webster.com/']);
    page.evaluate = () => new Promise(() => {});

    const pending = dismissCookieConsent(page);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(15000);
    const result = await pending;

    expect(result.status).toBe('failed');
    expect(result._error.message).toBe('The consent step could not be set up within 15 seconds');
  });
});

// Phase 0216 (backlog #51): a failed consent step says why it failed.
describe('consentFailureReason', () => {
  it('timeout: the banner showed but declining did not finish in time', () => {
    expect(consentFailureReason({ status: 'timeout', popupFound: true })).toBe('timeout');
  });

  it('optOutFailed: autoconsent reported that declining did not work', () => {
    expect(consentFailureReason({ status: 'failed', cmp: 'onetrust', popupFound: true })).toBe('optOutFailed');
  });

  it('optOutFailed: a wall stayed after WRL tried to answer it', () => {
    expect(consentFailureReason({ status: 'failed', cmp: null, popupFound: true, pageChanged: true })).toBe('optOutFailed');
  });

  it('error: the consent step itself threw', () => {
    expect(consentFailureReason({ status: 'failed', cmp: null, popupFound: false, _error: { name: 'TypeError', message: 'x' } })).toBe('error');
  });

  it('null when the consent step did not fail', () => {
    expect(consentFailureReason({ status: 'dismissed' })).toBeNull();
    expect(consentFailureReason({ status: 'none' })).toBeNull();
    expect(consentFailureReason({ status: 'timeout', popupFound: false })).toBeNull();
  });
});
