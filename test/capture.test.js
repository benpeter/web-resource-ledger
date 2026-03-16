import { env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture, captureHeaders } from '../src/capture.js';
import { createCapture, getCapture } from '../src/kv.js';
import { PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID = 'cap_capture1234567890abcdef123456';
const TEST_ORIGIN = 'https://example.com';

// ---------------------------------------------------------------------------
// KV / R2 cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await env.KV.delete(`capture:${TEST_ID}`);
  // Clean up any R2 artifacts from prior test
  const prefix = `captures/${TEST_ID}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
    env.BUCKET.delete(`${prefix}/screenshot-before.png`),
    env.BUCKET.delete(`${prefix}/rendered.html`),
    env.BUCKET.delete(`${prefix}/headers.json`),
  ]);
});

// ---------------------------------------------------------------------------
// fetchMock lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

// ---------------------------------------------------------------------------
// Helper: mock a successful header fetch
// ---------------------------------------------------------------------------

function mockHeaderFetch(opts = {}) {
  fetchMock
    .get(TEST_ORIGIN)
    .intercept({ path: '/', method: 'GET' })
    .reply(opts.status ?? 200, opts.body ?? 'ok', {
      headers: opts.headers ?? { 'content-type': 'text/html' },
    });
}

function mockHeaderFetchError() {
  fetchMock
    .get(TEST_ORIGIN)
    .intercept({ path: '/', method: 'GET' })
    .replyWithError(new Error('network error'));
}

// ---------------------------------------------------------------------------
// performCapture -- orchestration tests
// ---------------------------------------------------------------------------

describe('performCapture -- successful capture', () => {
  it('transitions KV status to complete', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('writes R2 artifacts: screenshot.png and rendered.html', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const screenshot = await env.BUCKET.get(`captures/${TEST_ID}/screenshot.png`);
    await screenshot?.arrayBuffer(); // consume body to satisfy isolated storage
    const html = await env.BUCKET.get(`captures/${TEST_ID}/rendered.html`);
    await html?.text(); // consume body
    expect(screenshot).not.toBeNull();
    expect(html).not.toBeNull();
  });

  it('writes R2 artifact: headers.json when header fetch succeeds', async () => {
    mockHeaderFetch({ headers: { 'content-type': 'text/html', 'x-custom': 'value' } });
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const headers = await env.BUCKET.get(`captures/${TEST_ID}/headers.json`);
    await headers?.text(); // consume body
    expect(headers).not.toBeNull();
  });

  it('records artifact paths in KV record', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.artifacts.screenshot).toBe(`captures/${TEST_ID}/screenshot.png`);
    expect(record.artifacts.html).toBe(`captures/${TEST_ID}/rendered.html`);
    expect(record.artifacts.headers).toBe(`captures/${TEST_ID}/headers.json`);
  });
});

describe('performCapture -- renderer failure: timeout', () => {
  const timeoutRenderer = async () => {
    throw new Error('Navigation timeout of 25000 ms exceeded');
  };

  it('transitions KV status to failed', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });

  it('sets retryable=true for timeout', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.retryable).toBe(true);
  });

  it('error message is user-safe (no stack trace)', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.error).toBe('Page did not finish loading within 20 seconds');
    expect(record.error).not.toContain('at ');
    expect(record.error).not.toContain('Error:');
  });
});

describe('performCapture -- renderer failure: subresource limit', () => {
  const subresourceLimitRenderer = async () => {
    throw new Error('Page exceeded 200 subresource limit');
  };

  it('transitions KV to failed with retryable=false', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, subresourceLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(false);
  });

  it('error message is user-safe', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, subresourceLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.error).toBe('Page exceeded 200 subresource limit');
    expect(record.error).not.toContain('at ');
  });
});

describe('performCapture -- renderer failure: page size limit', () => {
  const sizeLimitRenderer = async () => {
    throw new Error('Page exceeded 50MB size limit');
  };

  it('transitions KV to failed with retryable=false', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, sizeLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(false);
  });

  it('error message is user-safe', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, sizeLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.error).toBe('Page exceeded 50MB size limit');
    expect(record.error).not.toContain('at ');
  });
});

describe('performCapture -- header fetch fails but render succeeds', () => {
  it('capture completes (headers are optional)', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('headers.json R2 artifact is not written when header fetch fails', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const headers = await env.BUCKET.get(`captures/${TEST_ID}/headers.json`);
    expect(headers).toBeNull();
  });

  it('artifacts record omits headers key', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.artifacts.headers).toBeUndefined();
  });
});

describe('performCapture -- both renderer and header fetch fail', () => {
  const failingRenderer = async () => {
    throw new Error('net::ERR_NAME_NOT_RESOLVED');
  };

  it('transitions KV to failed', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, failingRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });
});

describe('performCapture -- KV always updated (never stuck pending)', () => {
  it('complete on success', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).not.toBe('pending');
  });

  it('failed on renderer error', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, async () => {
      throw new Error('unexpected internal error');
    });
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).not.toBe('pending');
  });

  it('failed on navigation error', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, async () => {
      throw new Error('net::ERR_CONNECTION_REFUSED');
    });
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).not.toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- Playwright-specific errors
// ---------------------------------------------------------------------------

describe('performCapture -- Playwright-specific errors', () => {
  it('handles Playwright TimeoutError (name-based detection)', async () => {
    const playwrightTimeout = async () => {
      const err = new Error('page.goto: Timeout 25000ms exceeded');
      err.name = 'TimeoutError';
      throw err;
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, playwrightTimeout);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Page did not finish loading within 20 seconds');
  });

  it('handles page crash as retryable', async () => {
    const crashRenderer = async () => {
      throw new Error('page.goto: Navigation failed because page crashed!');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, crashRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser session was unexpectedly closed');
  });

  it('handles stale session (browser has been closed) as retryable', async () => {
    const staleRenderer = async () => {
      throw new Error('browser has been closed');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, staleRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser session was unexpectedly closed');
  });

  it('handles Target closed as retryable', async () => {
    const targetClosed = async () => {
      throw new Error('Target closed');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, targetClosed);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser session was unexpectedly closed');
  });

  it('handles session pool exhaustion as retryable', async () => {
    const poolExhausted = async () => {
      throw new Error('No browser session available: session pool is at capacity');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, poolExhausted);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('No browser session available; try again shortly');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- new Playwright session lifecycle errors (#52)
// ---------------------------------------------------------------------------

describe('performCapture -- session lifecycle errors', () => {
  it('handles "Session expired" as retryable', async () => {
    const renderer = async () => { throw new Error('Session expired'); };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser session expired');
  });

  it('handles "session has been closed" as retryable', async () => {
    const renderer = async () => { throw new Error('session has been closed'); };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser session expired');
  });

  it('handles "Protocol error" as retryable', async () => {
    const renderer = async () => { throw new Error('Protocol error (Runtime.callFunctionOn): Session not found.'); };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser protocol error');
  });

  it('handles "Connection refused" as retryable', async () => {
    const renderer = async () => { throw new Error('Connection refused'); };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser connection refused');
  });

  it('handles "ECONNREFUSED" as retryable', async () => {
    const renderer = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:9222'); };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Browser connection refused');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- concurrent execution
// ---------------------------------------------------------------------------

describe('performCapture -- concurrent execution', () => {
  const ID_A = 'cap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ID_B = 'cap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeEach(async () => {
    await env.KV.delete(`capture:${ID_A}`);
    await env.KV.delete(`capture:${ID_B}`);
    const prefixA = `captures/${ID_A}`;
    const prefixB = `captures/${ID_B}`;
    await Promise.all([
      env.BUCKET.delete(`${prefixA}/screenshot.png`),
      env.BUCKET.delete(`${prefixA}/screenshot-before.png`),
      env.BUCKET.delete(`${prefixA}/rendered.html`),
      env.BUCKET.delete(`${prefixA}/headers.json`),
      env.BUCKET.delete(`${prefixB}/screenshot.png`),
      env.BUCKET.delete(`${prefixB}/screenshot-before.png`),
      env.BUCKET.delete(`${prefixB}/rendered.html`),
      env.BUCKET.delete(`${prefixB}/headers.json`),
    ]);
  });

  it('two captures with different IDs write separate KV records and R2 artifacts', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'ok', { headers: { 'content-type': 'text/html' } })
      .times(2);

    await createCapture(env.KV, ID_A, TEST_URL, TEST_IP, 'default');
    await createCapture(env.KV, ID_B, TEST_URL, TEST_IP, 'default');

    await Promise.all([
      performCapture(env, TEST_URL, TEST_IP, ID_A, 'default', undefined, stubRenderer),
      performCapture(env, TEST_URL, TEST_IP, ID_B, 'default', undefined, stubRenderer),
    ]);

    const recordA = await getCapture(env.KV, ID_A);
    const recordB = await getCapture(env.KV, ID_B);
    expect(recordA.status).toBe('complete');
    expect(recordB.status).toBe('complete');
    // Verify artifacts don't collide
    expect(recordA.artifacts.screenshot).toContain(ID_A);
    expect(recordB.artifacts.screenshot).toContain(ID_B);
  });
});

// ---------------------------------------------------------------------------
// captureHeaders -- unit tests
// ---------------------------------------------------------------------------

describe('captureHeaders -- Set-Cookie redaction', () => {
  it('redacts Set-Cookie value', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'ok', {
        headers: {
          'set-cookie': 'session=abc123; Path=/; HttpOnly',
          'content-type': 'text/html',
        },
      });

    const result = await captureHeaders(TEST_URL);
    const setCookieKey = Object.keys(result.headers).find(
      (k) => k.toLowerCase() === 'set-cookie',
    );
    expect(setCookieKey).toBeDefined();
    expect(result.headers[setCookieKey]).toBe('[redacted]');
    expect(result.headers[setCookieKey]).not.toContain('abc123');
  });

  it('does not expose cookie values in any header', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'ok', {
        headers: { 'set-cookie': 'token=supersecret; Secure' },
      });

    const result = await captureHeaders(TEST_URL);
    const allValues = Object.values(result.headers).join(' ');
    expect(allValues).not.toContain('supersecret');
  });
});

describe('captureHeaders -- non-sensitive header preservation', () => {
  it('preserves Content-Type header', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'ok', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });

    const result = await captureHeaders(TEST_URL);
    const ctKey = Object.keys(result.headers).find(
      (k) => k.toLowerCase() === 'content-type',
    );
    expect(ctKey).toBeDefined();
    expect(result.headers[ctKey]).toMatch(/text\/html/);
  });
});

describe('captureHeaders -- status and statusText', () => {
  it('captures 200 status', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'ok');

    const result = await captureHeaders(TEST_URL);
    expect(result.status).toBe(200);
  });

  it('captures non-200 status', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(404, 'not found');

    const result = await captureHeaders(TEST_URL);
    expect(result.status).toBe(404);
  });

  it('captures statusText', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(200, 'ok');

    const result = await captureHeaders(TEST_URL);
    expect(typeof result.statusText).toBe('string');
  });
});

describe('captureHeaders -- redirect:manual behavior', () => {
  it('does not follow 301 redirects (returns 3xx directly)', async () => {
    fetchMock
      .get(TEST_ORIGIN)
      .intercept({ path: '/', method: 'GET' })
      .reply(301, '', {
        headers: { location: 'https://other.example.com/destination' },
      });

    const result = await captureHeaders(TEST_URL);
    // With redirect:'manual', the 3xx response is returned without following
    expect(result.status).toBeGreaterThanOrEqual(300);
    expect(result.status).toBeLessThan(400);
  });
});

describe('captureHeaders -- scheme guard', () => {
  it('throws for non-http/https schemes', async () => {
    await expect(captureHeaders('ftp://example.com/file')).rejects.toThrow(
      'Only http and https URLs are supported',
    );
  });
});

// ---------------------------------------------------------------------------
// Partial capture stub renderers
// ---------------------------------------------------------------------------

const partialRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: true,
  render: {
    waitUntilReached: 'domcontentloaded',
    timedOut: true,
    durationMs: 25000,
  },
});

const partialLoadRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: true,
  render: {
    waitUntilReached: 'load',
    timedOut: true,
    durationMs: 25000,
  },
});

const enrichedStubRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: false,
  render: {
    waitUntilReached: 'networkidle',
    timedOut: false,
    durationMs: 3500,
  },
});

// ---------------------------------------------------------------------------
// performCapture -- partial capture (timeout with DOMContentLoaded)
// ---------------------------------------------------------------------------

describe('performCapture -- partial capture (timeout with DOMContentLoaded)', () => {
  it('transitions KV status to complete', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('sets renderQuality to partial', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBe('partial');
  });

  it('stores render metadata in KV record', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.render.waitUntilReached).toBe('domcontentloaded');
    expect(record.render.timedOut).toBe(true);
    expect(record.render.durationMs).toBe(25000);
  });

  it('writes R2 artifacts: screenshot.png and rendered.html', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const screenshot = await env.BUCKET.get(`captures/${TEST_ID}/screenshot.png`);
    await screenshot?.arrayBuffer();
    const html = await env.BUCKET.get(`captures/${TEST_ID}/rendered.html`);
    await html?.text();
    expect(screenshot).not.toBeNull();
    expect(html).not.toBeNull();
  });

  it('KV record has no wacz field', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.wacz).toBeUndefined();
  });

  it('header fetch still runs (headers.json written when available)', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.artifacts.headers).toBe(`captures/${TEST_ID}/headers.json`);
  });
});

// ---------------------------------------------------------------------------
// performCapture -- partial capture with load event
// ---------------------------------------------------------------------------

describe('performCapture -- partial capture with load event', () => {
  it('stores waitUntilReached as load', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialLoadRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.render.waitUntilReached).toBe('load');
  });

  it('still sets renderQuality to partial', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialLoadRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBe('partial');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- partial capture failure paths
// ---------------------------------------------------------------------------

describe('performCapture -- partial capture failure paths', () => {
  it('deadline exceeded in renderer -> KV failed', async () => {
    const deadlineRenderer = async () => {
      throw new Error('Deadline exceeded before partial capture could complete');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, deadlineRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Page did not finish loading within 20 seconds');
  });

  it('existing timeout (no DOMContentLoaded) still fails', async () => {
    const timeoutRenderer = async () => {
      throw new Error('Navigation timeout of 25000 ms exceeded');
    };
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(true);
    expect(record.error).toBe('Page did not finish loading within 20 seconds');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- full capture with render metadata
// ---------------------------------------------------------------------------

describe('performCapture -- full capture with render metadata', () => {
  it('sets renderQuality to full', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBe('full');
  });

  it('stores render metadata for full captures', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.render.waitUntilReached).toBe('networkidle');
    expect(record.render.timedOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// performCapture -- legacy renderer (backward compat)
// ---------------------------------------------------------------------------

describe('performCapture -- legacy renderer (backward compat)', () => {
  it('record has renderQuality full', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.renderQuality).toBe('full');
  });

  it('record has no render metadata', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.render).toBeUndefined();
  });
});
