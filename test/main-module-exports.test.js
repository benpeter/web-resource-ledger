/**
 * The Workers runtime reads every named export of the main module
 * (wrangler.toml main = src/index.js) as an entrypoint and refuses to start
 * when one is not a handler: `wrangler dev` failed with "Incorrect type for
 * map entry 'MINUTE_CRON'" after phase 0129 exported two cron strings from it.
 * Constants belong in their own module.
 */

import { describe, it, expect } from 'vitest';
import * as main from '../src/index.js';

describe('src/index.js exports', () => {
  it('has a default export with fetch, queue and scheduled handlers', () => {
    expect(typeof main.default.fetch).toBe('function');
    expect(typeof main.default.queue).toBe('function');
    expect(typeof main.default.scheduled).toBe('function');
  });

  it('exports nothing else that is not a function or class', () => {
    const bad = Object.entries(main)
      .filter(([name]) => name !== 'default')
      .filter(([, value]) => typeof value !== 'function')
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });
});
