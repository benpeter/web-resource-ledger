import { env, fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performCapture, captureHeaders } from '../src/capture.js';
import { createCapture, getCapture } from '../src/kv.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEST_ID = 'cap_capture1234567890abcdef123456';
const TEST_URL = 'https://example.com';
const TEST_IP = '93.184.216.34';
const TEST_ORIGIN = 'https://example.com';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEST_HTML = '<html><body>test</body></html>';

const stubRenderer = async () => ({
  screenshot: PNG_BYTES,
  html: TEST_HTML,
});

// ---------------------------------------------------------------------------
// KV / R2 cleanup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await env.KV.delete(`capture:${TEST_ID}`);
  // Clean up any R2 artifacts from prior test
  const prefix = `captures/${TEST_ID}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
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
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('writes R2 artifacts: screenshot.png and rendered.html', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

    const screenshot = await env.BUCKET.get(`captures/${TEST_ID}/screenshot.png`);
    await screenshot?.arrayBuffer(); // consume body to satisfy isolated storage
    const html = await env.BUCKET.get(`captures/${TEST_ID}/rendered.html`);
    await html?.text(); // consume body
    expect(screenshot).not.toBeNull();
    expect(html).not.toBeNull();
  });

  it('writes R2 artifact: headers.json when header fetch succeeds', async () => {
    mockHeaderFetch({ headers: { 'content-type': 'text/html', 'x-custom': 'value' } });
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

    const headers = await env.BUCKET.get(`captures/${TEST_ID}/headers.json`);
    await headers?.text(); // consume body
    expect(headers).not.toBeNull();
  });

  it('records artifact paths in KV record', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

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
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });

  it('sets retryable=true for timeout', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.retryable).toBe(true);
  });

  it('error message is user-safe (no stack trace)', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, timeoutRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.error).toBe('Page did not finish loading within 25 seconds');
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
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, subresourceLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(false);
  });

  it('error message is user-safe', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, subresourceLimitRenderer);

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
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, sizeLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
    expect(record.retryable).toBe(false);
  });

  it('error message is user-safe', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, sizeLimitRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.error).toBe('Page exceeded 50MB size limit');
    expect(record.error).not.toContain('at ');
  });
});

describe('performCapture -- header fetch fails but render succeeds', () => {
  it('capture completes (headers are optional)', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('complete');
  });

  it('headers.json R2 artifact is not written when header fetch fails', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

    const headers = await env.BUCKET.get(`captures/${TEST_ID}/headers.json`);
    expect(headers).toBeNull();
  });

  it('artifacts record omits headers key', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);

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
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, failingRenderer);

    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).toBe('failed');
  });
});

describe('performCapture -- KV always updated (never stuck pending)', () => {
  it('complete on success', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, stubRenderer);
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).not.toBe('pending');
  });

  it('failed on renderer error', async () => {
    mockHeaderFetch();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, async () => {
      throw new Error('unexpected internal error');
    });
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).not.toBe('pending');
  });

  it('failed on navigation error', async () => {
    mockHeaderFetchError();
    await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP);
    await performCapture(env, TEST_URL, TEST_IP, TEST_ID, async () => {
      throw new Error('net::ERR_CONNECTION_REFUSED');
    });
    const record = await getCapture(env.KV, TEST_ID);
    expect(record.status).not.toBe('pending');
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
