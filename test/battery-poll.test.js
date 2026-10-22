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

describe('pollCapture against the real endpoint split', () => {
  // GET /v1/captures/{id} answers 404 while a capture is pending or failed;
  // only GET /v1/captures/{id}/status reports those states.
  function apiLike(states, record) {
    let i = 0;
    const seen = [];
    const fetchImpl = async (url) => {
      seen.push(url);
      if (url.endsWith('/status')) {
        const state = states[Math.min(i++, states.length - 1)];
        return jsonResponse(state);
      }
      const current = states[Math.min(i - 1, states.length - 1)];
      if (current?.status !== 'complete') return jsonResponse({ title: 'Not Found' }, 404);
      return jsonResponse(record);
    };
    return { fetchImpl, seen };
  }

  // Fake clock: each sleep advances time, so a wrong implementation hits the
  // deadline after a few polls instead of spinning for the real timeout.
  function clocked(fetchImpl) {
    let now = 0;
    return opts(fetchImpl, { timeoutMs: 100, now: () => now, sleep: async () => { now += 10; } });
  }

  it('returns a failed capture as failed, with its error, instead of timing out', async () => {
    const { fetchImpl } = apiLike([
      { status: 'pending' },
      { status: 'failed', error: 'Capture permanently failed after all retry attempts', retryable: false },
    ]);
    const result = await pollCapture('cap_f', clocked(fetchImpl));
    expect(result).toMatchObject({ captureId: 'cap_f', status: 'failed', error: 'Capture permanently failed after all retry attempts' });
  });

  it('fetches the full record once the status endpoint says complete', async () => {
    const { fetchImpl, seen } = apiLike(
      [{ status: 'pending' }, { status: 'complete' }],
      { id: 'cap_c', status: 'complete', renderQuality: 'full', consent: { result: 'success' } },
    );
    const result = await pollCapture('cap_c', clocked(fetchImpl));
    expect(result).toMatchObject({ captureId: 'cap_c', status: 'complete', renderQuality: 'full' });
    expect(seen.some((u) => u.endsWith('/status'))).toBe(true);
    expect(seen.at(-1)).toBe('https://staging.test/v1/captures/cap_c');
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
