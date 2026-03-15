import { fetchMock } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { log } from '../src/log.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ENDPOINT = 'https://ingress.test.coralogix.com/logs/v1/singles';
const MOCK_ORIGIN = 'https://ingress.test.coralogix.com';
const MOCK_PATH = '/logs/v1/singles';

const mockEnv = {
  CORALOGIX_ENDPOINT: MOCK_ENDPOINT,
  CORALOGIX_SEND_KEY: 'test-send-key',
};

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

describe('log -- no-op when env vars are missing', () => {
  it('returns undefined when CORALOGIX_ENDPOINT is missing', () => {
    const result = log({}, 3, 'test', { event: 'test' });
    expect(result).toBeUndefined();
  });

  it('returns undefined when CORALOGIX_SEND_KEY is missing', () => {
    const result = log({ CORALOGIX_ENDPOINT: 'https://example.com' }, 3, 'test', { event: 'test' });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Payload structure
// ---------------------------------------------------------------------------

describe('log -- Coralogix payload structure', () => {
  it('sends correct POST with Content-Type, Authorization, and body shape', async () => {
    let capturedRequest;

    fetchMock
      .get(MOCK_ORIGIN)
      .intercept({ path: MOCK_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedRequest = req;
        return 'ok';
      });

    await log(mockEnv, 3, 'capture', { event: 'capture.success', captureId: 'cap_abc' });

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest.headers['content-type']).toBe('application/json');
    expect(capturedRequest.headers['authorization']).toBe('Bearer test-send-key');

    const body = JSON.parse(capturedRequest.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);

    const entry = body[0];
    expect(entry.applicationName).toBe('wrl');
    expect(entry.subsystemName).toBe('capture');
    expect(entry.severity).toBe(3);
    expect(typeof entry.timestamp).toBe('number');
    expect(typeof entry.text).toBe('string');

    const text = JSON.parse(entry.text);
    expect(text).toEqual({ event: 'capture.success', captureId: 'cap_abc' });
  });
});

// ---------------------------------------------------------------------------
// Severity levels
// ---------------------------------------------------------------------------

describe('log -- severity levels propagate correctly', () => {
  it('sends severity 4 (warn) in payload', async () => {
    let capturedBody;

    fetchMock
      .get(MOCK_ORIGIN)
      .intercept({ path: MOCK_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedBody = JSON.parse(req.body);
        return 'ok';
      });

    await log(mockEnv, 4, 'capture', { event: 'capture.warn' });
    expect(capturedBody[0].severity).toBe(4);
  });

  it('sends severity 5 (error) in payload', async () => {
    let capturedBody;

    fetchMock
      .get(MOCK_ORIGIN)
      .intercept({ path: MOCK_PATH, method: 'POST' })
      .reply(200, (req) => {
        capturedBody = JSON.parse(req.body);
        return 'ok';
      });

    await log(mockEnv, 5, 'capture', { event: 'capture.error' });
    expect(capturedBody[0].severity).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('log -- swallows fetch errors silently', () => {
  it('resolves without throwing when fetch rejects', async () => {
    fetchMock
      .get(MOCK_ORIGIN)
      .intercept({ path: MOCK_PATH, method: 'POST' })
      .replyWithError(new Error('Network error'));

    await expect(log(mockEnv, 5, 'capture', { event: 'capture.fail' })).resolves.not.toThrow();
  });
});

describe('log -- handles JSON.stringify errors gracefully', () => {
  it('returns undefined for circular references without throwing', () => {
    const circular = {};
    circular.self = circular;

    let result;
    expect(() => {
      result = log(mockEnv, 3, 'test', circular);
    }).not.toThrow();
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Return value
// ---------------------------------------------------------------------------

describe('log -- return value', () => {
  it('returns a truthy Promise when both env vars are present', () => {
    fetchMock
      .get(MOCK_ORIGIN)
      .intercept({ path: MOCK_PATH, method: 'POST' })
      .reply(200, 'ok');

    const result = log(mockEnv, 3, 'test', {});
    expect(result).toBeTruthy();
  });
});
