// Tests for scripts/lib/battery-poll.js: polling one battery capture until it
// finishes, without letting a network error end the whole battery run.
import { describe, it, expect } from 'vitest';
import { pollCapture, submitCapture } from '../scripts/lib/battery-poll.js';

const noSleep = async () => {};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function opts(fetchImpl, overrides = {}) {
  return { fetchImpl, baseUrl: 'https://staging.test', apiKey: 'k', timeoutMs: 60_000, intervalMs: 10, sleep: noSleep, ...overrides };
}

describe('pollCapture', () => {
  it('keeps polling after a network error and returns the finished capture', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed', { cause: new Error('read ECONNRESET') });
      if (calls === 2) return jsonResponse({ status: 'pending' });
      return jsonResponse({ status: 'complete', renderQuality: 'full' });
    };
    const result = await pollCapture('cap_1', opts(fetchImpl));
    expect(result).toMatchObject({ captureId: 'cap_1', status: 'complete', renderQuality: 'full' });
    expect(calls).toBe(3);
  });

  it('keeps polling after a non-2xx response and after a body that is not JSON', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      if (calls === 1) return jsonResponse({ title: 'Too Many Requests' }, 429);
      if (calls === 2) return new Response('<html>oops</html>', { status: 200 });
      return jsonResponse({ status: 'failed', error: 'permanently failed' });
    };
    const result = await pollCapture('cap_2', opts(fetchImpl));
    expect(result).toMatchObject({ status: 'failed' });
  });

  it('returns a poll timeout error once the deadline passes, with the last network error', async () => {
    let now = 0;
    const fetchImpl = async () => { throw new TypeError('fetch failed'); };
    const result = await pollCapture('cap_3', opts(fetchImpl, {
      timeoutMs: 100,
      now: () => now,
      sleep: async () => { now += 40; },
    }));
    expect(result.captureId).toBe('cap_3');
    expect(result.status).toBeUndefined();
    expect(result.error).toMatch(/poll timeout/);
    expect(result.error).toMatch(/fetch failed/);
  });
});

describe('submitCapture', () => {
  it('returns an error instead of throwing when the request fails', async () => {
    const fetchImpl = async () => { throw new TypeError('fetch failed'); };
    const result = await submitCapture('https://example.com', opts(fetchImpl));
    expect(result.error).toMatch(/fetch failed/);
  });

  it('returns the capture id on success', async () => {
    const fetchImpl = async () => jsonResponse({ id: 'cap_9' }, 202);
    expect(await submitCapture('https://example.com', opts(fetchImpl))).toEqual({ captureId: 'cap_9' });
  });
});
