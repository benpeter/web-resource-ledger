import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackHit, trackEvent, trackEventRaw } from '../src/pirsch.js';

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

  it('trackEventRaw returns undefined when key is absent', () => {
    const result = trackEventRaw({}, 'First Capture', {}, {}, {});
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
// trackEventRaw payload structure
// ---------------------------------------------------------------------------

describe('pirsch -- trackEventRaw payload', () => {
  it('sends event without Request, using provided fields', async () => {
    let capturedRequest;

    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: EVENT_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedRequest = req;
        return 'ok';
      });

    await trackEventRaw(mockEnv, 'First Capture', { url: 'https://example.com', ip: '198.51.100.1' }, { tenantId: 'gh-456' }, { property: 'api' });

    const body = JSON.parse(capturedRequest.body);
    expect(body.event_name).toBe('First Capture');
    expect(body.url).toBe('https://example.com');
    expect(body.ip).toBe('198.51.100.1');
    expect(body.user_agent).toBeUndefined();
    expect(body.event_meta).toEqual({ tenantId: 'gh-456' });
  });
});

// ---------------------------------------------------------------------------
// Error resilience
// ---------------------------------------------------------------------------

describe('pirsch -- error resilience', () => {
  it('resolves without throwing when fetch rejects', async () => {
    fetchMock
      .get(PIRSCH_ORIGIN)
      .intercept({ path: HIT_PATH, method: 'POST' })
      .replyWithError(new Error('Network error'));

    // Errors are logged to Coralogix (no-op in test env without CORALOGIX_ENDPOINT)
    await expect(trackHit(mockRequest(), mockEnv, {})).resolves.not.toThrow();
  });
});
