import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackHit, trackEvent, trackServerEvent, isPageView, SERVER_USER_AGENT } from '../src/pirsch.js';
import * as logModule from '../src/log.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PIRSCH_ORIGIN = 'https://api.pirsch.io';
const HIT_PATH = '/api/v1/hit';
const EVENT_PATH = '/api/v1/event';

const mockEnv = { PIRSCH_ACCESS_KEY: 'test-pirsch-key' };

/** Build a minimal Request with the headers Pirsch extraction expects. */
function mockRequest(overrides = {}) {
  const headers = new Headers({
    'CF-Connecting-IP': '203.0.113.42',
    'User-Agent': 'Mozilla/5.0 Test',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://webresourceledger.com/',
    'Sec-CH-UA': '"Chromium";v="130"',
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': '"macOS"',
    ...overrides,
  });
  return new Request('https://api.webresourceledger.com/auth/callback?code=abc', { headers });
}

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
// No-op guards
// ---------------------------------------------------------------------------

describe('pirsch -- no-op when PIRSCH_ACCESS_KEY is missing', () => {
  it('trackHit returns undefined when key is absent', () => {
    const result = trackHit(mockRequest(), {}, { property: 'api' });
    expect(result).toBeUndefined();
  });

  it('trackEvent returns undefined when key is absent', () => {
    const result = trackEvent(mockRequest(), {}, 'Signup', {}, {});
    expect(result).toBeUndefined();
  });

  it('trackServerEvent returns undefined when key is absent', () => {
    const result = trackServerEvent({}, 'First Capture', {}, {}, {});
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// trackHit payload structure
// ---------------------------------------------------------------------------

describe('pirsch -- trackHit payload', () => {
  it('sends correct POST to /api/v1/hit with extracted headers', async () => {
    let capturedRequest;

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedRequest = req;
        return 'ok';
      });

    await trackHit(mockRequest(), mockEnv, { property: 'landing' });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest.headers['authorization']).toBe('Bearer test-pirsch-key');
    expect(capturedRequest.headers['content-type']).toBe('application/json');

    const body = JSON.parse(capturedRequest.body);
    expect(body.url).toBe('https://api.webresourceledger.com/auth/callback?code=abc');
    expect(body.ip).toBe('203.0.113.42');
    expect(body.user_agent).toBe('Mozilla/5.0 Test');
    expect(body.accept_language).toBe('en-US,en;q=0.9');
    expect(body.referrer).toBe('https://webresourceledger.com/');
    expect(body.sec_ch_ua).toBe('"Chromium";v="130"');
    expect(body.sec_ch_ua_mobile).toBe('?0');
    expect(body.sec_ch_ua_platform).toBe('"macOS"');
    expect(body.tags).toEqual({ property: 'landing' });
  });
});

// ---------------------------------------------------------------------------
// trackEvent payload structure
// ---------------------------------------------------------------------------

describe('pirsch -- trackEvent payload', () => {
  it('sends correct POST to /api/v1/event with event_name and event_meta', async () => {
    let capturedRequest;

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: EVENT_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedRequest = req;
        return 'ok';
      });

    await trackEvent(mockRequest(), mockEnv, 'Signup', { tenantId: 'gh-123', source: 'landing' }, { property: 'api' });

    const body = JSON.parse(capturedRequest.body);
    expect(body.event_name).toBe('Signup');
    expect(body.event_meta).toEqual({ tenantId: 'gh-123', source: 'landing' });
    expect(body.tags).toEqual({ property: 'api' });
    expect(body.ip).toBe('203.0.113.42');
  });
});

// ---------------------------------------------------------------------------
// trackServerEvent payload structure
// ---------------------------------------------------------------------------

describe('pirsch -- trackServerEvent payload', () => {
  async function capture(fn) {
    let capturedRequest;
    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: EVENT_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedRequest = req;
        return 'ok';
      });
    await fn();
    return JSON.parse(capturedRequest.body);
  }

  it('sends a WRL URL, the given ip and user agent, and skips the bot filter', async () => {
    const body = await capture(() => trackServerEvent(mockEnv, 'First Capture', {
      path: '/v1/captures',
      ip: '198.51.100.1',
      userAgent: 'Mozilla/5.0 Test',
      meta: { source: 'dashboard' },
    }));
    expect(body.event_name).toBe('First Capture');
    expect(body.url).toBe('https://api.webresourceledger.com/v1/captures');
    expect(body.ip).toBe('198.51.100.1');
    expect(body.user_agent).toBe('Mozilla/5.0 Test');
    expect(body.disable_bot_filter).toBe(true);
    expect(body.non_interactive).toBe(true);
    expect(body.event_meta).toEqual({ source: 'dashboard' });
    expect(body.tags).toEqual({ property: 'api' });
  });

  it('fills in a server user agent and a documentation ip when the event has none', async () => {
    const body = await capture(() => trackServerEvent(mockEnv, 'Payment Activated', { path: '/v1/billing/webhook' }));
    expect(body.user_agent).toBe(SERVER_USER_AGENT);
    expect(body.ip).toBe('192.0.2.1');
    expect(body.event_meta).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error resilience
// ---------------------------------------------------------------------------

describe('pirsch -- trackHit without a user agent', () => {
  it('sends nothing, since Pirsch rejects a hit without one', () => {
    const request = new Request('https://docs.webresourceledger.com/', {
      headers: { 'CF-Connecting-IP': '203.0.113.42' },
    });
    expect(trackHit(request, mockEnv, { property: 'docs' })).toBeUndefined();
  });
});

describe('isPageView', () => {
  const UA = 'Mozilla/5.0 Test';
  function req(path, { method = 'GET', accept = 'text/html,application/xhtml+xml', ua = UA } = {}) {
    const headers = { Accept: accept };
    if (ua) headers['User-Agent'] = ua;
    return new Request(`https://docs.webresourceledger.com${path}`, { method, headers });
  }
  function res(status, contentType) {
    const headers = contentType ? { 'Content-Type': contentType } : {};
    return new Response(status === 304 ? null : 'x', { status, headers });
  }

  it('counts a 200 HTML page', () => {
    expect(isPageView(req('/limits/'), res(200, 'text/html; charset=utf-8'))).toBe(true);
  });

  it('counts a 304 revalidation of a page the browser asked for as HTML', () => {
    expect(isPageView(req('/limits/'), res(304))).toBe(true);
  });

  it('does not count assets, robots.txt or the sitemap', () => {
    expect(isPageView(req('/css/site.css', { accept: 'text/css,*/*;q=0.1' }), res(200, 'text/css'))).toBe(false);
    expect(isPageView(req('/assets/logo.png', { accept: 'image/avif,image/webp,*/*' }), res(200, 'image/png'))).toBe(false);
    expect(isPageView(req('/assets/favicon.svg', { accept: 'image/*' }), res(200, 'image/svg+xml'))).toBe(false);
    expect(isPageView(req('/robots.txt', { accept: '*/*' }), res(200, 'text/plain'))).toBe(false);
    expect(isPageView(req('/sitemap.xml', { accept: '*/*' }), res(200, 'application/xml'))).toBe(false);
    expect(isPageView(req('/css/site.css', { accept: 'text/css' }), res(304))).toBe(false);
  });

  it('does not count redirects, errors, HEAD requests or requests without a user agent', () => {
    expect(isPageView(req('/limits'), res(307, 'text/html'))).toBe(false);
    expect(isPageView(req('/wp-login.php'), res(404, 'text/html'))).toBe(false);
    expect(isPageView(req('/limits/', { method: 'HEAD' }), res(200, 'text/html'))).toBe(false);
    expect(isPageView(req('/limits/', { ua: null }), res(200, 'text/html'))).toBe(false);
  });
});

describe('pirsch -- error resilience', () => {
  it('resolves without throwing when fetch rejects', async () => {
    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .replyWithError(new Error('Network error'));

    // Errors are logged to Coralogix (no-op in test env without CORALOGIX_ENDPOINT)
    await expect(trackHit(mockRequest(), mockEnv, {})).resolves.not.toThrow();
  });

  it('logs pirsch.send_rejected on a non-2xx response (e.g. 401 dead key)', async () => {
    const logSpy = vi.spyOn(logModule, 'log').mockImplementation(() => undefined);

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .reply(401, 'unauthorized');

    await expect(trackHit(mockRequest(), mockEnv, {})).resolves.not.toThrow();

    expect(logSpy).toHaveBeenCalledWith(
      mockEnv,
      4,
      'pirsch',
      expect.objectContaining({ event: 'pirsch.send_rejected', status: 401, detail: 'unauthorized' }),
    );

    logSpy.mockRestore();
  });

  it('resolves only after the rejection log is sent, so the Worker cannot drop it', async () => {
    // A Worker ends once its waitUntil promises settle. If the log call is not part
    // of the promise trackHit returns, the rejection never reaches Coralogix
    // (phase 0119: docs rejections went unseen this way).
    let logSent = false;
    const logSpy = vi.spyOn(logModule, 'log').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => { logSent = true; resolve(); }, 20)),
    );

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .reply(401, 'unauthorized');

    await trackHit(mockRequest(), mockEnv, {});
    expect(logSent).toBe(true);

    logSpy.mockRestore();
  });

  it('resolves only after the failure log is sent when the request throws', async () => {
    let logSent = false;
    const logSpy = vi.spyOn(logModule, 'log').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => { logSent = true; resolve(); }, 20)),
    );

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .replyWithError(new Error('network down'));

    await trackHit(mockRequest(), mockEnv, {});
    expect(logSent).toBe(true);

    logSpy.mockRestore();
  });

  it('stays silent on a 200 response (bot-drops are not actionable)', async () => {
    const logSpy = vi.spyOn(logModule, 'log').mockImplementation(() => undefined);

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .reply(200, 'ok');

    await trackHit(mockRequest(), mockEnv, {});

    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });
});
