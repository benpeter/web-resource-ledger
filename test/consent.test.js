// tva
// What the consent step tells autoconsent when it starts in a frame. The
// banners themselves are covered in a real browser, in
// test/integration/capture-pipeline.test.js.

import { describe, it, expect } from 'vitest';
import { dismissCookieConsent } from '../src/consent.js';

// A page whose autoconsent script asks for its config and rules ('init') in
// every frame and then reports a declined banner, so the step ends at once.
function createPage(frameUrls) {
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
      sendMessage({ frame: frames[0] }, { type: 'autoconsentDone' });
    },
  };
  return { page, initResponses };
}

describe('dismissCookieConsent: what a frame is told', () => {
  it('does not let autoconsent use the rules generated for single sites', async () => {
    const { page, initResponses } = createPage(['https://www.semrush.com/']);

    await dismissCookieConsent(page);

    expect(initResponses).toHaveLength(1);
    expect(initResponses[0].message.config.enableGeneratedRules).toBe(false);
  });
});
