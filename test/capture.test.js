import { env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture, captureHeaders, categorizeError } from '../src/capture.js';
import { createCapture, getCapture } from '../src/db.js';
import { PNG_BYTES, TEST_HTML, TEST_URL, TEST_IP, stubRenderer } from './fixtures.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID = 'cap_ca91001234567890abcdef1234560001';
const TEST_ORIGIN = 'https://example.com';

// ---------------------------------------------------------------------------
// KV / R2 cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(TEST_ID).run();
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
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('writes R2 artifacts: screenshot.png and rendered.html', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
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
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const headers = await env.BUCKET.get(`captures/${TEST_ID}/headers.json`);
    await headers?.text(); // consume body
    expect(headers).not.toBeNull();
  });

  it('records artifact paths in KV record', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.artifacts.screenshot).toBe(`captures/${TEST_ID}/screenshot.png`);
    expect(record.artifacts.html).toBe(`captures/${TEST_ID}/rendered.html`);
    expect(record.artifacts.headers).toBe(`captures/${TEST_ID}/headers.json`);
  });

  it('returns ok with storedBytes', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
    expect(result.ok).toBe(true);
    expect(result.storedBytes).toBeGreaterThan(0);
  });
});

describe('performCapture -- renderer failure: timeout', () => {
  const timeoutRenderer = async () => {
    throw new Error('Navigation timeout of 25000 ms exceeded');
  };

  it('leaves KV status as pending (retryable -- no KV write)', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
  });

  it('returns { ok: false, retryable: true } for timeout', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('error message is user-safe (no stack trace) -- returned in result.error', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);
    expect(result.error).toBe('Page did not finish loading within 20 seconds');
    expect(result.error).not.toContain('at ');
    expect(result.error).not.toContain('Error:');
  });
});

describe('performCapture -- renderer failure: subresource limit', () => {
  const subresourceLimitRenderer = async () => {
    throw new Error('Page exceeded 500 subresource limit');
  };

  it('transitions KV to failed with retryable=false', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, subresourceLimitRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(false);
  });

  it('returns { ok: false, retryable: false }', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, subresourceLimitRenderer);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('error message is user-safe', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, subresourceLimitRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.error).toBe('Page exceeded 500 subresource limit');
    expect(record.error).not.toContain('at ');
  });
});

describe('performCapture -- renderer failure: page size limit', () => {
  const sizeLimitRenderer = async () => {
    throw new Error('Page exceeded 50MB size limit');
  };

  it('transitions KV to failed with retryable=false', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, sizeLimitRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(false);
  });

  it('returns { ok: false, retryable: false }', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, sizeLimitRenderer);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('error message is user-safe', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, sizeLimitRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.error).toBe('Page exceeded 50MB size limit');
    expect(record.error).not.toContain('at ');
  });
});

describe('performCapture -- header fetch fails but render succeeds', () => {
  it('capture completes (headers are optional)', async () => {
    mockHeaderFetchError();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('headers.json R2 artifact is not written when header fetch fails', async () => {
    mockHeaderFetchError();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const headers = await env.BUCKET.get(`captures/${TEST_ID}/headers.json`);
    expect(headers).toBeNull();
  });

  it('artifacts record omits headers key', async () => {
    mockHeaderFetchError();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.artifacts.headers).toBeUndefined();
  });
});

describe('performCapture -- both renderer and header fetch fail', () => {
  const failingRenderer = async () => {
    throw new Error('net::ERR_NAME_NOT_RESOLVED');
  };

  it('leaves KV pending (net::ERR is retryable -- no KV write)', async () => {
    mockHeaderFetchError();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, failingRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
  });

  it('returns { ok: false, retryable: true }', async () => {
    mockHeaderFetchError();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, failingRenderer);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });
});

describe('performCapture -- KV terminal state on non-retryable, pending on retryable', () => {
  it('complete on success', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('pending on retryable renderer error (catch-all -- queue consumer retries)', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, async () => {
      throw new Error('unexpected internal error');
    });
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
  });

  it('pending on retryable navigation error (net::ERR)', async () => {
    mockHeaderFetchError();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, async () => {
      throw new Error('net::ERR_CONNECTION_REFUSED');
    });
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
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
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, playwrightTimeout);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Page did not finish loading within 20 seconds');
  });

  it('handles page crash as retryable', async () => {
    const crashRenderer = async () => {
      throw new Error('page.goto: Navigation failed because page crashed!');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, crashRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser session was unexpectedly closed');
  });

  it('handles stale session (browser has been closed) as retryable', async () => {
    const staleRenderer = async () => {
      throw new Error('browser has been closed');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, staleRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser session was unexpectedly closed');
  });

  it('handles Target closed as retryable', async () => {
    const targetClosed = async () => {
      throw new Error('Target closed');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, targetClosed);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser session was unexpectedly closed');
  });

  it('handles session pool exhaustion as retryable', async () => {
    const poolExhausted = async () => {
      throw new Error('No browser session available: session pool is at capacity');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, poolExhausted);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('No browser session available; try again shortly');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- new Playwright session lifecycle errors (#52)
// ---------------------------------------------------------------------------

describe('performCapture -- session lifecycle errors', () => {
  it('handles "Session expired" as retryable', async () => {
    const renderer = async () => { throw new Error('Session expired'); };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser session expired');
  });

  it('handles "session has been closed" as retryable', async () => {
    const renderer = async () => { throw new Error('session has been closed'); };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser session expired');
  });

  it('handles "Protocol error" as retryable', async () => {
    const renderer = async () => { throw new Error('Protocol error (Runtime.callFunctionOn): Session not found.'); };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser protocol error');
  });

  it('handles "Connection refused" as retryable', async () => {
    const renderer = async () => { throw new Error('Connection refused'); };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser connection refused');
  });

  it('handles "ECONNREFUSED" as retryable', async () => {
    const renderer = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:9222'); };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, renderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Browser connection refused');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- concurrent execution
// ---------------------------------------------------------------------------

describe('performCapture -- concurrent execution', () => {
  const ID_A = 'cap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const ID_B = 'cap_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM captures WHERE id IN (?, ?)').bind(ID_A, ID_B).run();
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

    await createCapture(env.DB, ID_A, TEST_URL, TEST_IP, 'default');
    await createCapture(env.DB, ID_B, TEST_URL, TEST_IP, 'default');

    await Promise.all([
      performCapture(env, TEST_URL, TEST_IP, ID_A, 'default', undefined, stubRenderer),
      performCapture(env, TEST_URL, TEST_IP, ID_B, 'default', undefined, stubRenderer),
    ]);

    const recordA = await getCapture(env.DB, ID_A);
    const recordB = await getCapture(env.DB, ID_B);
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
    waitUntilReached: 'load',
    timedOut: false,
    durationMs: 3500,
    settleMs: 500,
    settleReason: 'idle',
  },
});

const stagesFullRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: false,
  render: {
    waitUntilReached: 'load',
    timedOut: false,
    durationMs: 8200,
    stages: {
      sessionAcquireMs: 120,
      contextSetupMs: 80,
      navigationMs: 3500,
      settleMs: 3010,
      consentMs: 800,
      screenshotMs: 450,
      contentMs: 40,
    },
  },
});

const stagesPartialRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
  partial: true,
  render: {
    waitUntilReached: 'domcontentloaded',
    timedOut: true,
    durationMs: 20500,
    stages: {
      sessionAcquireMs: 150,
      contextSetupMs: 90,
      navigationMs: 20000,
      settleMs: null,
      consentMs: null,
      screenshotMs: 200,
      contentMs: 60,
    },
  },
});

// ---------------------------------------------------------------------------
// performCapture -- partial capture (timeout with DOMContentLoaded)
// ---------------------------------------------------------------------------

describe('performCapture -- partial capture (timeout with DOMContentLoaded)', () => {
  it('transitions KV status to complete', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('sets renderQuality to partial', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBe('partial');
  });

  it('stores render metadata in KV record', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render.waitUntilReached).toBe('domcontentloaded');
    expect(record.render.timedOut).toBe(true);
    expect(record.render.durationMs).toBe(25000);
  });

  it('writes R2 artifacts: screenshot.png and rendered.html', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
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
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.wacz).toBeFalsy();
  });

  it('header fetch still runs (headers.json written when available)', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.artifacts.headers).toBe(`captures/${TEST_ID}/headers.json`);
  });
});

// ---------------------------------------------------------------------------
// performCapture -- partial capture with load event
// ---------------------------------------------------------------------------

describe('performCapture -- partial capture with load event', () => {
  it('stores waitUntilReached as load', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialLoadRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render.waitUntilReached).toBe('load');
  });

  it('still sets renderQuality to partial', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, partialLoadRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBe('partial');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- partial capture failure paths
// ---------------------------------------------------------------------------

describe('performCapture -- partial capture failure paths', () => {
  it('deadline exceeded in renderer -> KV stays pending, retryable', async () => {
    const deadlineRenderer = async () => {
      throw new Error('Deadline exceeded before partial capture could complete');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, deadlineRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Page did not finish loading within 20 seconds');
  });

  it('zero-byte timeout (bot protection) -> KV failed, not retryable', async () => {
    const botBlockRenderer = async () => {
      throw new Error('Target site did not respond (possible bot protection or geo-restriction)');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, botBlockRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    expect(record.error).toBe('Target site did not respond (possible bot protection or geo-restriction)');
  });

  it('existing timeout (no DOMContentLoaded) -> KV stays pending, retryable', async () => {
    const timeoutRenderer = async () => {
      throw new Error('Navigation timeout of 25000 ms exceeded');
    };
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, timeoutRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('pending');
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('Page did not finish loading within 20 seconds');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- full capture with render metadata
// ---------------------------------------------------------------------------

describe('performCapture -- full capture with render metadata', () => {
  it('sets renderQuality to full', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBe('full');
  });

  it('stores render metadata for full captures', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render.waitUntilReached).toBe('load');
    expect(record.render.timedOut).toBe(false);
  });

  it('stores settle telemetry in render metadata', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render.settleMs).toBe(500);
    expect(record.render.settleReason).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- legacy renderer (backward compat)
// ---------------------------------------------------------------------------

describe('performCapture -- legacy renderer (backward compat)', () => {
  it('record has renderQuality full', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBe('full');
  });

  it('record has no render metadata', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// performCapture -- stage-level timings
// ---------------------------------------------------------------------------

describe('performCapture -- stage-level timings', () => {
  const STAGE_KEYS = ['sessionAcquireMs', 'contextSetupMs', 'navigationMs', 'settleMs', 'consentMs', 'screenshotMs', 'contentMs'];

  it('stores full-capture stages in KV record', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stagesFullRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render.stages).toBeDefined();
    for (const key of STAGE_KEYS) {
      expect(typeof record.render.stages[key]).toBe('number');
    }
  });

  it('stores partial-capture stages with null for skipped stages', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stagesPartialRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render.stages).toBeDefined();
    expect(record.render.stages.settleMs).toBeNull();
    expect(record.render.stages.consentMs).toBeNull();
    expect(typeof record.render.stages.sessionAcquireMs).toBe('number');
    expect(typeof record.render.stages.navigationMs).toBe('number');
    expect(typeof record.render.stages.screenshotMs).toBe('number');
    expect(typeof record.render.stages.contentMs).toBe('number');
  });

  it('omits stages for legacy renderers without stage data', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, enrichedStubRenderer);

    const record = await getCapture(env.DB, TEST_ID);
    expect(record.render).toBeDefined();
    expect(record.render.stages).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// performCapture -- consent error in renderer
// ---------------------------------------------------------------------------

describe('performCapture -- consent error in renderer', () => {
  const consentErrorRenderer = async () => ({
    screenshot: PNG_BYTES,
    html: TEST_HTML,
    partial: false,
    render: {
      waitUntilReached: 'load',
      timedOut: false,
      durationMs: 4000,
      settleMs: 500,
      settleReason: 'idle',
    },
    consent: { status: 'failed', cmp: null, durationMs: 0, _error: { name: 'TypeError', message: 'Cannot read properties of null' } },
    screenshotBefore: PNG_BYTES,
  });

  it('capture completes when consent throws', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('sets renderQuality to full despite consent error', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.renderQuality).toBe('full');
  });

  it('captureSettings shows consent result as failed', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, consentErrorRenderer);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.captureSettings.consent.result).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// categorizeError -- named export
// ---------------------------------------------------------------------------

describe('categorizeError -- is a named export from capture.js', () => {
  it('is a function', () => {
    expect(typeof categorizeError).toBe('function');
  });

  it('returns retryable: true for timeout errors', () => {
    const result = categorizeError(new Error('Navigation timeout of 25000 ms exceeded'));
    expect(result.retryable).toBe(true);
    expect(typeof result.message).toBe('string');
  });

  it('returns retryable: false for non-retryable errors', () => {
    const result = categorizeError(new Error('Page exceeded 500 subresource limit'));
    expect(result.retryable).toBe(false);
    expect(typeof result.message).toBe('string');
  });

  it('returns retryable: false for render failure (error page detection)', () => {
    const result = categorizeError(new Error('Captured page is not target content (chromium-error-page)'));
    expect(result.retryable).toBe(false);
    expect(result.message).toContain('not target content');
  });
});

// ---------------------------------------------------------------------------
// performCapture -- error page detection
// ---------------------------------------------------------------------------

describe('performCapture -- error page detection (render failure)', () => {
  const chromiumErrorRenderer = async () => {
    throw new Error('Captured page is not target content (chromium-error-page)');
  };

  const blankPageRenderer = async () => {
    throw new Error('Captured page is not target content (blank-page)');
  };

  it('fails capture as non-retryable for chromium error page', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, chromiumErrorRenderer);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.error).toContain('chromium-error-page');
  });

  it('fails capture as non-retryable for blank page', async () => {
    mockHeaderFetch();
    await createCapture(env.DB, TEST_ID, TEST_URL, TEST_IP, 'default');
    const result = await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, blankPageRenderer);

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    const record = await getCapture(env.DB, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.error).toContain('blank-page');
  });
});
