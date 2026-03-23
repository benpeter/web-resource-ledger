import { checkUrl, checkUrls } from '../src/threat-check.js';
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Lookup stubs (injected to avoid real network calls)
// ---------------------------------------------------------------------------

const cleanLookup = async () => new Response('{}', { status: 200 });

const malwareLookup = async () => new Response(JSON.stringify({
  threat: { threatTypes: ['MALWARE'], expireTime: '2026-04-01T00:00:00Z' },
}), { status: 200 });

const multiThreatLookup = async () => new Response(JSON.stringify({
  threat: { threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING'], expireTime: '2026-04-01T00:00:00Z' },
}), { status: 200 });

const unknownThreatLookup = async () => new Response(JSON.stringify({
  threat: { threatTypes: ['MALWARE', 'UNKNOWN_FUTURE_THREAT'], expireTime: '2026-04-01T00:00:00Z' },
}), { status: 200 });

const onlyUnknownThreatLookup = async () => new Response(JSON.stringify({
  threat: { threatTypes: ['UNKNOWN_FUTURE_THREAT'], expireTime: '2026-04-01T00:00:00Z' },
}), { status: 200 });

const apiErrorLookup = async () => new Response('Internal Server Error', { status: 500 });

const timeoutLookup = async () => {
  throw new DOMException('The operation was aborted', 'AbortError');
};

const networkErrorLookup = async () => {
  throw new TypeError('Failed to fetch');
};

// ---------------------------------------------------------------------------
// Test env
// ---------------------------------------------------------------------------

const envWithKey = { GOOGLE_WEB_RISK_API_KEY: 'test-api-key' };
const envWithoutKey = {};

// ---------------------------------------------------------------------------
// checkUrl -- single URL checks
// ---------------------------------------------------------------------------

describe('checkUrl -- clean URL', () => {
  it('returns { safe: true } for a clean URL', async () => {
    const result = await checkUrl('https://example.com', envWithKey, { lookup: cleanLookup });
    expect(result).toEqual({ safe: true });
  });
});

describe('checkUrl -- threat matches', () => {
  it('returns { safe: false, threatTypes: ["MALWARE"] } for malware URL', async () => {
    const result = await checkUrl('https://malware.example.com', envWithKey, { lookup: malwareLookup });
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toEqual(['MALWARE']);
  });

  it('returns all matched threat types when multiple threats are present', async () => {
    const result = await checkUrl('https://bad.example.com', envWithKey, { lookup: multiThreatLookup });
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toContain('MALWARE');
    expect(result.threatTypes).toContain('SOCIAL_ENGINEERING');
    expect(result.threatTypes).toHaveLength(2);
  });
});

describe('checkUrl -- threat type allowlist filtering', () => {
  it('filters out unknown threat types, keeps known ones', async () => {
    const result = await checkUrl('https://bad.example.com', envWithKey, { lookup: unknownThreatLookup });
    expect(result.safe).toBe(false);
    expect(result.threatTypes).toEqual(['MALWARE']);
    expect(result.threatTypes).not.toContain('UNKNOWN_FUTURE_THREAT');
  });

  it('returns { safe: true } when only unknown threat types are returned', async () => {
    const result = await checkUrl('https://bad.example.com', envWithKey, { lookup: onlyUnknownThreatLookup });
    expect(result.safe).toBe(true);
    expect(result.degraded).toBeUndefined();
  });
});

describe('checkUrl -- error handling (fail-open)', () => {
  it('returns { safe: true, degraded: true } on API 500 error', async () => {
    const result = await checkUrl('https://example.com', envWithKey, { lookup: apiErrorLookup });
    expect(result.safe).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('returns { safe: true, degraded: true } on timeout', async () => {
    const result = await checkUrl('https://example.com', envWithKey, { lookup: timeoutLookup });
    expect(result.safe).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it('returns { safe: true, degraded: true } on network error', async () => {
    const result = await checkUrl('https://example.com', envWithKey, { lookup: networkErrorLookup });
    expect(result.safe).toBe(true);
    expect(result.degraded).toBe(true);
  });
});

describe('checkUrl -- missing API key', () => {
  it('returns { safe: true, degraded: true, reason: "no_api_key" } when API key is absent', async () => {
    const result = await checkUrl('https://example.com', envWithoutKey, { lookup: cleanLookup });
    expect(result.safe).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('no_api_key');
  });

  it('returns degraded with no_api_key when env is null', async () => {
    const result = await checkUrl('https://example.com', null, { lookup: cleanLookup });
    expect(result.safe).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('no_api_key');
  });
});

describe('checkUrl -- URL encoding', () => {
  it('properly encodes the target URL in the request', async () => {
    const capturedUrls = [];
    const capturingLookup = async (url) => {
      capturedUrls.push(url);
      return new Response('{}', { status: 200 });
    };

    const targetUrl = 'https://example.com/path?q=hello world&foo=bar/baz';
    await checkUrl(targetUrl, envWithKey, { lookup: capturingLookup });

    expect(capturedUrls).toHaveLength(1);
    const requestUrl = new URL(capturedUrls[0]);
    // The uri param should be encoded so it round-trips back to the original
    expect(requestUrl.searchParams.get('uri')).toBe(targetUrl);
  });

  it('sends API key via X-Goog-Api-Key header, not query string', async () => {
    const capturedRequests = [];
    const capturingLookup = async (url, init) => {
      capturedRequests.push({ url, init });
      return new Response('{}', { status: 200 });
    };

    await checkUrl('https://example.com', envWithKey, { lookup: capturingLookup });

    expect(capturedRequests).toHaveLength(1);
    const { url, init } = capturedRequests[0];
    expect(init.headers['X-Goog-Api-Key']).toBe('test-api-key');
    // API key must not appear in the URL
    expect(url).not.toContain('test-api-key');
    expect(url).not.toContain('key=');
  });
});

// ---------------------------------------------------------------------------
// checkUrls -- multi-URL fan-out
// ---------------------------------------------------------------------------

describe('checkUrls', () => {
  it('returns empty Map for empty URL array', async () => {
    const result = await checkUrls([], envWithKey, { lookup: cleanLookup });
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns correct per-URL results for mixed clean/malware URLs', async () => {
    const responses = {
      'https://clean.example.com': cleanLookup,
      'https://malware.example.com': malwareLookup,
    };
    const dispatchLookup = async (url) => {
      const parsed = new URL(url);
      const uri = parsed.searchParams.get('uri');
      const stub = responses[uri];
      if (!stub) throw new Error(`dispatchLookup: unexpected URI: ${uri}`);
      return stub(url);
    };

    const result = await checkUrls(
      ['https://clean.example.com', 'https://malware.example.com'],
      envWithKey,
      { lookup: dispatchLookup },
    );

    expect(result.size).toBe(2);
    expect(result.get('https://clean.example.com')).toEqual({ safe: true });
    expect(result.get('https://malware.example.com').safe).toBe(false);
    expect(result.get('https://malware.example.com').threatTypes).toContain('MALWARE');
  });

  it('continues processing other URLs when one lookup errors', async () => {
    let callCount = 0;
    const firstErrorThenClean = async (url) => {
      callCount++;
      if (callCount === 1) throw new TypeError('Failed to fetch');
      return new Response('{}', { status: 200 });
    };

    const result = await checkUrls(
      ['https://a.example.com', 'https://b.example.com'],
      envWithKey,
      { lookup: firstErrorThenClean },
    );

    expect(result.size).toBe(2);
    expect(result.get('https://a.example.com').safe).toBe(true);
    expect(result.get('https://a.example.com').degraded).toBe(true);
    expect(result.get('https://b.example.com')).toEqual({ safe: true });
  });

  it('returns degraded for all URLs when API key is missing', async () => {
    const result = await checkUrls(
      ['https://a.example.com', 'https://b.example.com'],
      envWithoutKey,
      { lookup: cleanLookup },
    );

    expect(result.size).toBe(2);
    for (const [, value] of result) {
      expect(value.safe).toBe(true);
      expect(value.degraded).toBe(true);
      expect(value.reason).toBe('no_api_key');
    }
  });
});
